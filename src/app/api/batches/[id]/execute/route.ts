import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAllowed } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";
import { applyDmaAction, applyDmaEligibility, lookupContract } from "@/lib/server/coral";
import { batchJobStatusLabels } from "@/lib/batch-status-labels";
export const maxDuration = 240;
type Context = { params: Promise<{ id: string }> };
const CHUNK_SIZE = 10;
const STALE_RUN_MS = 5 * 60 * 1000;
async function summarize(jobId: string) {
  const items = await db.bulkActionItem.findMany({ where: { jobId }, select: { status: true } });
  const count = (status: string) => items.filter((item) => item.status === status).length;
  const pending = count("PENDING");
  const failed = count("FAILED");
  const uncertain = count("UNCERTAIN");
  const succeeded = count("SUCCEEDED");
  const skipped = count("SKIPPED");
  const status = pending ? "PAUSED" : failed || uncertain ? "COMPLETED_WITH_ERRORS" : "COMPLETED";
  await db.bulkActionJob.update({ where: { id: jobId }, data: { status, succeededCount: succeeded, failedCount: failed, uncertainCount: uncertain, skippedCount: skipped } });
  return { status, totalRows: items.length, pending, succeeded, failed, uncertain, skipped };
}
export async function POST(_request: NextRequest, { params }: Context) {
  const user = await isAllowed(["admin"]);
  if (!user) return apiError("Não autorizado.", 401);
  const { id } = await params;
  let job = await db.bulkActionJob.findUnique({ where: { id } });
  if (!job || job.deletedAt) return apiError("Ação manual não encontrada.", 404);
  if (job.status === "RUNNING") {
    if (Date.now() - job.updatedAt.getTime() < STALE_RUN_MS) return apiError("Esta planilha já está sendo processada.", 409);
    await db.$transaction(async (tx) => {
      const staleAttempts = await tx.bulkActionAttempt.findMany({ where: { item: { jobId: id }, status: "IN_PROGRESS" }, select: { id: true, itemId: true } });
      for (const attempt of staleAttempts) {
        await tx.bulkActionAttempt.update({ where: { id: attempt.id }, data: { status: "UNCERTAIN", errorCode: "PROCESS_INTERRUPTED_RESULT_UNKNOWN", completedAt: new Date() } });
        await tx.bulkActionItem.updateMany({ where: { id: attempt.itemId, status: "RUNNING" }, data: { status: "UNCERTAIN", completedAt: new Date() } });
      }
      await tx.bulkActionJob.update({ where: { id }, data: { status: "PAUSED" } });
    });
    job = await db.bulkActionJob.findUnique({ where: { id } });
    if (!job) return apiError("Ação manual não encontrada.", 404);
  }
  if (!["READY", "PAUSED", "COMPLETED_WITH_ERRORS"].includes(job.status)) return apiError(`Esta planilha não pode ser executada no status “${batchJobStatusLabels[job.status] || "desconhecido"}”.`, 409);
  const lock = await db.bulkActionJob.updateMany({ where: { id, status: job.status, deletedAt: null }, data: { status: "RUNNING", updatedAt: new Date() } });
  if (!lock.count) return apiError("Esta planilha já está sendo processada.", 409);

  for (let index = 0; index < CHUNK_SIZE; index++) {
    const activeJob = await db.bulkActionJob.findFirst({ where: { id, deletedAt: null, status: "RUNNING" }, select: { id: true } });
    if (!activeJob) break;
    const item = await db.bulkActionItem.findFirst({ where: { jobId: id, status: "PENDING" }, orderBy: { rowNumber: "asc" } });
    if (!item) break;
    const claimed = await db.bulkActionItem.updateMany({ where: { id: item.id, status: "PENDING" }, data: { status: "RUNNING", processingStartedAt: new Date() } });
    if (!claimed.count) { index--; continue; }
    const attemptNumber = await db.bulkActionAttempt.count({ where: { itemId: item.id } }) + 1;
    const attempt = await db.bulkActionAttempt.create({ data: { itemId: item.id, attemptNumber, idempotencyKey: crypto.randomUUID(), status: "IN_PROGRESS" } });
    try {
      const stillActive = await db.bulkActionJob.findFirst({ where: { id, deletedAt: null, status: "RUNNING" }, select: { id: true } });
      if (!stillActive) {
        await db.$transaction([
          db.bulkActionAttempt.update({ where: { id: attempt.id }, data: { status: "CANCELLED", errorCode: "JOB_ARCHIVED_BEFORE_CORAL_CALL", completedAt: new Date() } }),
          db.bulkActionItem.update({ where: { id: item.id }, data: { status: "SKIPPED", note: "Ação arquivada antes do envio deste contrato ao Coral", completedAt: new Date() } }),
        ]);
        break;
      }
      const action = job.actionType as "CONSIDERAR_DMA" | "DESCONSIDERAR_DMA";
      const result = job.worksheetName === "Contrato único"
        ? await (async () => {
          const contract = await lookupContract(item.contractNumber);
          if (!contract) throw Object.assign(new Error("O contrato não foi localizado no Coral."), { uncertain: false });
          if (!contract.id) throw Object.assign(new Error("O Coral não retornou o identificador interno deste contrato."), { uncertain: false });
          return applyDmaEligibility(contract.id, action);
        })()
        : await applyDmaAction(item.contractNumber, action);
      await db.$transaction([
        db.bulkActionAttempt.update({ where: { id: attempt.id }, data: { status: result.status, response: result.response as never, completedAt: new Date() } }),
        db.bulkActionItem.update({ where: { id: item.id }, data: { status: "SUCCEEDED", completedAt: new Date() } }),
        db.bulkActionJob.update({ where: { id }, data: { updatedAt: new Date() } }),
      ]);
    } catch (error) {
      const uncertain = !!(error && typeof error === "object" && "uncertain" in error && error.uncertain);
      const response = error && typeof error === "object" && "response" in error ? error.response : undefined;
      await db.$transaction([
        db.bulkActionAttempt.update({ where: { id: attempt.id }, data: { status: uncertain ? "UNCERTAIN" : "FAILED", errorCode: error instanceof Error ? error.message.slice(0, 250) : "CORAL_ERROR", response: (response ?? undefined) as never, completedAt: new Date() } }),
        db.bulkActionItem.update({ where: { id: item.id }, data: { status: uncertain ? "UNCERTAIN" : "FAILED", note: error instanceof Error ? error.message.slice(0, 250) : "Falha Coral", completedAt: new Date() } }),
        db.bulkActionJob.update({ where: { id }, data: { updatedAt: new Date() } }),
      ]);
    }
  }
  return NextResponse.json(await summarize(id));
}
