import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAllowed } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";
import { CANCELLABLE_BATCH_STATUSES } from "@/lib/batch-status-labels";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: NextRequest, { params }: Context) {
  const user = await isAllowed(["admin"]);
  if (!user) return apiError("Não autorizado.", 401);
  const body = (await request.json().catch(() => null)) as { reason?: unknown } | null;
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (!reason) return apiError("Informe o motivo do cancelamento.");
  if (reason.length > 2000) return apiError("O motivo do cancelamento deve ter no máximo 2.000 caracteres.");
  const { id } = await params;
  const job = await db.bulkActionJob.findUnique({ where: { id }, select: { status: true, deletedAt: true } });
  if (!job || job.deletedAt) return apiError("Ação manual não encontrada.", 404);
  try {
    await db.$transaction(async (tx) => {
      const changed = await tx.bulkActionJob.updateMany({
        where: { id, deletedAt: null, status: { in: CANCELLABLE_BATCH_STATUSES } },
        data: { status: "CANCELLED" },
      });
      if (!changed.count) throw new Error("Só é possível cancelar planilhas prontas para iniciar ou pausadas.");
      await tx.auditEvent.create({
        data: { actorId: user.id, event: "BATCH_CANCELLED", details: { batchId: id, previousStatus: job.status, reason } },
      });
    });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Não foi possível cancelar a planilha.", 409);
  }
  return NextResponse.json({ status: "CANCELLED" });
}
