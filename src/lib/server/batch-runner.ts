import { db } from "@/lib/db";
import { applyDmaAction, applyDmaEligibility, lookupContract } from "@/lib/server/coral";

/** Sem atualização por este prazo, a execução foi interrompida (ex.: servidor reiniciado); cada contrato leva no máximo ~35 s. */
export const STALE_RUN_MS = 5 * 60 * 1000;

/** Recalcula os contadores; o status só muda se a planilha não foi cancelada no meio do processamento. */
export async function summarizeBatch(jobId: string) {
  const items = await db.bulkActionItem.findMany({ where: { jobId }, select: { status: true } });
  const count = (status: string) => items.filter((item) => item.status === status).length;
  const pending = count("PENDING");
  const failed = count("FAILED");
  const uncertain = count("UNCERTAIN");
  const succeeded = count("SUCCEEDED");
  const skipped = count("SKIPPED");
  const status = pending ? "PAUSED" : failed || uncertain ? "COMPLETED_WITH_ERRORS" : "COMPLETED";
  await db.bulkActionJob.update({
    where: { id: jobId },
    data: { succeededCount: succeeded, failedCount: failed, uncertainCount: uncertain, skippedCount: skipped },
  });
  await db.bulkActionJob.updateMany({ where: { id: jobId, status: { not: "CANCELLED" } }, data: { status } });
  return { status, totalRows: items.length, pending, succeeded, failed, uncertain, skipped };
}

/** Execução interrompida: tentativas em andamento viram "resultado incerto", porque o Coral pode ter aplicado a ação. */
export async function recoverStaleBatch(jobId: string) {
  await db.$transaction(async (tx) => {
    const staleAttempts = await tx.bulkActionAttempt.findMany({
      where: { item: { jobId }, status: "IN_PROGRESS" },
      select: { id: true, itemId: true },
    });
    for (const attempt of staleAttempts) {
      await tx.bulkActionAttempt.update({
        where: { id: attempt.id },
        data: { status: "UNCERTAIN", errorCode: "PROCESS_INTERRUPTED_RESULT_UNKNOWN", completedAt: new Date() },
      });
      await tx.bulkActionItem.updateMany({
        where: { id: attempt.itemId, status: "RUNNING" },
        data: { status: "UNCERTAIN", completedAt: new Date() },
      });
    }
    await tx.bulkActionJob.update({ where: { id: jobId }, data: { status: "PAUSED" } });
  });
}

/**
 * Processa no servidor todos os contratos pendentes, um por vez, enquanto a planilha estiver em andamento.
 * Pausar ou cancelar muda o status da planilha; o laço para antes do próximo contrato.
 */
export async function runBatch(jobId: string) {
  const job = await db.bulkActionJob.findUnique({ where: { id: jobId }, select: { actionType: true, worksheetName: true } });
  if (!job) return;
  const action = job.actionType as "CONSIDERAR_DMA" | "DESCONSIDERAR_DMA";
  try {
    for (;;) {
      const active = await db.bulkActionJob.findFirst({ where: { id: jobId, deletedAt: null, status: "RUNNING" }, select: { id: true } });
      if (!active) break;
      const item = await db.bulkActionItem.findFirst({ where: { jobId, status: "PENDING" }, orderBy: { rowNumber: "asc" } });
      if (!item) break;
      const claimed = await db.bulkActionItem.updateMany({
        where: { id: item.id, status: "PENDING" },
        data: { status: "RUNNING", processingStartedAt: new Date() },
      });
      if (!claimed.count) continue;
      const attemptNumber = (await db.bulkActionAttempt.count({ where: { itemId: item.id } })) + 1;
      const attempt = await db.bulkActionAttempt.create({
        data: { itemId: item.id, attemptNumber, idempotencyKey: crypto.randomUUID(), status: "IN_PROGRESS" },
      });
      try {
        const result =
          job.worksheetName === "Contrato único"
            ? await (async () => {
                const contract = await lookupContract(item.contractNumber);
                if (!contract) throw Object.assign(new Error("O contrato não foi localizado no Coral."), { uncertain: false });
                if (!contract.id)
                  throw Object.assign(new Error("O Coral não retornou o identificador interno deste contrato."), { uncertain: false });
                return applyDmaEligibility(contract.id, action);
              })()
            : await applyDmaAction(item.contractNumber, action);
        await db.$transaction([
          db.bulkActionAttempt.update({
            where: { id: attempt.id },
            data: { status: result.status, response: result.response as never, completedAt: new Date() },
          }),
          db.bulkActionItem.update({ where: { id: item.id }, data: { status: "SUCCEEDED", completedAt: new Date() } }),
          db.bulkActionJob.update({ where: { id: jobId }, data: { updatedAt: new Date() } }),
        ]);
      } catch (error) {
        const uncertain = !!(error && typeof error === "object" && "uncertain" in error && error.uncertain);
        const response = error && typeof error === "object" && "response" in error ? error.response : undefined;
        await db.$transaction([
          db.bulkActionAttempt.update({
            where: { id: attempt.id },
            data: {
              status: uncertain ? "UNCERTAIN" : "FAILED",
              errorCode: error instanceof Error ? error.message.slice(0, 250) : "CORAL_ERROR",
              response: (response ?? undefined) as never,
              completedAt: new Date(),
            },
          }),
          db.bulkActionItem.update({
            where: { id: item.id },
            data: {
              status: uncertain ? "UNCERTAIN" : "FAILED",
              note: error instanceof Error ? error.message.slice(0, 250) : "Falha Coral",
              completedAt: new Date(),
            },
          }),
          db.bulkActionJob.update({ where: { id: jobId }, data: { updatedAt: new Date() } }),
        ]);
      }
    }
  } finally {
    await summarizeBatch(jobId);
  }
}
