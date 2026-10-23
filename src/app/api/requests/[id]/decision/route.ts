import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAllowed } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";
import { applyDmaAction } from "@/lib/server/coral";
import { reviewDecisionSchema } from "@/lib/validators/request";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: NextRequest, { params }: Context) {
  const reviewer = await isAllowed(["admin"]);
  if (!reviewer) return apiError("Apenas administradores podem decidir solicitações.", 403);
  const { id } = await params;
  const parsed = reviewDecisionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Decisão inválida.");
  const item = await db.dmaRequest.findUnique({ where: { id } });
  if (!item) return apiError("Solicitação não encontrada.", 404);
  const demoRecord = await db.auditEvent.findFirst({ where: { requestId: id, event: "DEMO_REQUEST_CREATED" }, select: { id: true } });
  if (demoRecord) return apiError("Esta solicitação é apenas uma demonstração; decisões e execução no Coral estão bloqueadas.", 409);  if (item.status !== "PENDING_REVIEW") return apiError("A solicitação não está aguardando análise.", 409);
  if (parsed.data.decision === "REJECT") {
    try {
      await db.$transaction(async (tx) => {
        const changed = await tx.dmaRequest.updateMany({ where: { id, version: item.version, status: "PENDING_REVIEW" }, data: { status: "REJECTED" } });
        if (!changed.count) throw new Error("A solicitação já recebeu uma decisão.");
        await tx.reviewDecision.create({ data: { requestId: id, reviewerId: reviewer.id, requestVersion: item.version, decision: "REJECT", justification: parsed.data.justification } });
        await tx.auditEvent.create({ data: { requestId: id, actorId: reviewer.id, event: "REQUEST_REJECTED", details: { version: item.version, justification: parsed.data.justification } } });
      });
    } catch (error) { return apiError(error instanceof Error ? error.message : "A solicitação já recebeu uma decisão.", 409); }
    return NextResponse.json({ status: "REJECTED" });
  }
  const attemptId = crypto.randomUUID(); const idempotencyKey = crypto.randomUUID();
  try {
    await db.$transaction(async (tx) => {
      const changed = await tx.dmaRequest.updateMany({ where: { id, version: item.version, status: "PENDING_REVIEW" }, data: { status: "EXECUTING" } });
      if (!changed.count) throw new Error("A solicitação já recebeu uma decisão.");
      await tx.reviewDecision.create({ data: { requestId: id, reviewerId: reviewer.id, requestVersion: item.version, decision: "APPROVE", justification: parsed.data.justification || null } });
      await tx.executionAttempt.create({ data: { id: attemptId, requestId: id, idempotencyKey, integration: "coral", status: "IN_PROGRESS" } });
      await tx.auditEvent.create({ data: { requestId: id, actorId: reviewer.id, event: "REQUEST_APPROVED_EXECUTION_STARTED", details: { version: item.version, idempotencyKey } } });
    });
  } catch (error) { return apiError(error instanceof Error ? error.message : "A solicitação já recebeu uma decisão.", 409); }
  try {
    const result = await applyDmaAction(item.contractName, item.actionType as "CONSIDERAR_DMA" | "DESCONSIDERAR_DMA");
    await db.$transaction([
      db.executionAttempt.update({ where: { id: attemptId }, data: { status: result.status, response: result.response as never, completedAt: new Date() } }),
      db.dmaRequest.update({ where: { id }, data: { status: "COMPLETED" } }),
      db.auditEvent.create({ data: { requestId: id, actorId: reviewer.id, event: "CORAL_EXECUTION_COMPLETED", details: { status: result.status } } }),
    ]);
    return NextResponse.json({ status: "COMPLETED", execution: result.status });
  } catch (error) {
    const uncertain = !!(error && typeof error === "object" && "uncertain" in error && error.uncertain);
    const response = error && typeof error === "object" && "response" in error ? error.response : undefined;
    const status = uncertain ? "UNCERTAIN" : "FAILED";
    await db.$transaction([
      db.executionAttempt.update({ where: { id: attemptId }, data: { status, errorCode: error instanceof Error ? error.message.slice(0, 200) : "CORAL_ERROR", response: (response ?? undefined) as never, completedAt: new Date() } }),
      db.dmaRequest.update({ where: { id }, data: { status: uncertain ? "EXECUTION_UNCERTAIN" : "EXECUTION_FAILED" } }),
      db.auditEvent.create({ data: { requestId: id, actorId: reviewer.id, event: uncertain ? "CORAL_EXECUTION_UNCERTAIN" : "CORAL_EXECUTION_FAILED", details: { message: error instanceof Error ? error.message : "Falha" } } }),
    ]);
    return NextResponse.json({ status: uncertain ? "EXECUTION_UNCERTAIN" : "EXECUTION_FAILED", error: error instanceof Error ? error.message : "Falha na execução." }, { status: 502 });
  }
}
