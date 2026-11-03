import { NextRequest, NextResponse, after } from "next/server";
import { db } from "@/lib/db";
import { isAllowed } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";
import { batchJobStatusLabels } from "@/lib/batch-status-labels";
import { STALE_RUN_MS, recoverStaleBatch, runBatch } from "@/lib/server/batch-runner";
type Context = { params: Promise<{ id: string }> };
/** Inicia (ou retoma) a planilha. O processamento roda no servidor; a tela só acompanha e pode pausar. */
export async function POST(_request: NextRequest, { params }: Context) {
  const user = await isAllowed(["admin"]);
  if (!user) return apiError("Não autorizado.", 401);
  const { id } = await params;
  let job = await db.bulkActionJob.findUnique({ where: { id } });
  if (!job || job.deletedAt) return apiError("Ação manual não encontrada.", 404);
  if (job.status === "RUNNING") {
    if (Date.now() - job.updatedAt.getTime() < STALE_RUN_MS) return apiError("Esta planilha já está sendo processada.", 409);
    await recoverStaleBatch(id);
    job = await db.bulkActionJob.findUnique({ where: { id } });
    if (!job) return apiError("Ação manual não encontrada.", 404);
  }
  if (!["READY", "PAUSED", "COMPLETED_WITH_ERRORS"].includes(job.status))
    return apiError(`Esta planilha não pode ser executada no status “${batchJobStatusLabels[job.status] || "desconhecido"}”.`, 409);
  const lock = await db.bulkActionJob.updateMany({
    where: { id, status: job.status, deletedAt: null },
    data: { status: "RUNNING", updatedAt: new Date() },
  });
  if (!lock.count) return apiError("Esta planilha já está sendo processada.", 409);
  after(() => runBatch(id));
  return NextResponse.json({ status: "RUNNING" });
}
