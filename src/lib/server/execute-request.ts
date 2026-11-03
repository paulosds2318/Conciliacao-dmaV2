import { db } from "@/lib/db";
import { applyDmaEligibility } from "@/lib/server/coral";

type ApprovedRequest = { id: string; version: number; actionType: string; coralContractId: string };
/** Quem aprovou: um administrador (com justificativa opcional) ou a aprovação automática (actorId null). */
type Approval = { actorId: string; justification?: string | null } | { actorId: null; reason: string };

export type ExecutionOutcome =
  { status: "COMPLETED"; execution: string } | { status: "EXECUTION_FAILED" | "EXECUTION_UNCERTAIN"; error: string };

/** Move a solicitação de PENDING_REVIEW para EXECUTING e aplica a ação no Coral. Lança erro se outra decisão já foi registrada. */
export async function executeApprovedRequest(item: ApprovedRequest, approval: Approval): Promise<ExecutionOutcome> {
  const attemptId = crypto.randomUUID();
  const idempotencyKey = crypto.randomUUID();
  await db.$transaction(async (tx) => {
    const changed = await tx.dmaRequest.updateMany({
      where: { id: item.id, version: item.version, status: "PENDING_REVIEW" },
      data: { status: "EXECUTING" },
    });
    if (!changed.count) throw new Error("A solicitação já recebeu uma decisão.");
    if (approval.actorId !== null)
      await tx.reviewDecision.create({
        data: {
          requestId: item.id,
          reviewerId: approval.actorId,
          requestVersion: item.version,
          decision: "APPROVE",
          justification: approval.justification || null,
        },
      });
    await tx.executionAttempt.create({
      data: { id: attemptId, requestId: item.id, idempotencyKey, integration: "coral", status: "IN_PROGRESS" },
    });
    await tx.auditEvent.create({
      data:
        approval.actorId === null
          ? {
              requestId: item.id,
              event: "REQUEST_AUTO_APPROVED_EXECUTION_STARTED",
              details: { version: item.version, idempotencyKey, reason: approval.reason },
            }
          : {
              requestId: item.id,
              actorId: approval.actorId,
              event: "REQUEST_APPROVED_EXECUTION_STARTED",
              details: { version: item.version, idempotencyKey },
            },
    });
  });
  try {
    const result = await applyDmaEligibility(item.coralContractId, item.actionType as "CONSIDERAR_DMA" | "DESCONSIDERAR_DMA");
    await db.$transaction([
      db.executionAttempt.update({
        where: { id: attemptId },
        data: { status: result.status, response: result.response as never, completedAt: new Date() },
      }),
      db.dmaRequest.update({ where: { id: item.id }, data: { status: "COMPLETED" } }),
      db.auditEvent.create({
        data: { requestId: item.id, actorId: approval.actorId, event: "CORAL_EXECUTION_COMPLETED", details: { status: result.status } },
      }),
    ]);
    return { status: "COMPLETED", execution: result.status };
  } catch (error) {
    const uncertain = !!(error && typeof error === "object" && "uncertain" in error && error.uncertain);
    const response = error && typeof error === "object" && "response" in error ? error.response : undefined;
    const status = uncertain ? "UNCERTAIN" : "FAILED";
    await db.$transaction([
      db.executionAttempt.update({
        where: { id: attemptId },
        data: {
          status,
          errorCode: error instanceof Error ? error.message.slice(0, 200) : "CORAL_ERROR",
          response: (response ?? undefined) as never,
          completedAt: new Date(),
        },
      }),
      db.dmaRequest.update({ where: { id: item.id }, data: { status: uncertain ? "EXECUTION_UNCERTAIN" : "EXECUTION_FAILED" } }),
      db.auditEvent.create({
        data: {
          requestId: item.id,
          actorId: approval.actorId,
          event: uncertain ? "CORAL_EXECUTION_UNCERTAIN" : "CORAL_EXECUTION_FAILED",
          details: { message: error instanceof Error ? error.message : "Falha" },
        },
      }),
    ]);
    return {
      status: uncertain ? "EXECUTION_UNCERTAIN" : "EXECUTION_FAILED",
      error: error instanceof Error ? error.message : "Falha na execução.",
    };
  }
}
