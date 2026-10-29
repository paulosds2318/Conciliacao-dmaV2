import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAllowed } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) {
  const user = await isAllowed(["admin"]);
  if (!user) return apiError("Não autorizado.", 401);
  const { id } = await params;
  const job = await db.bulkActionJob.findUnique({ where: { id }, include: { requester: { select: { id: true, name: true } }, items: { orderBy: { rowNumber: "asc" }, include: { attempts: { orderBy: { attemptNumber: "asc" } } } } } });
  if (!job || job.deletedAt) return apiError("Ação manual não encontrada.", 404);
  return NextResponse.json({ job });
}

export async function DELETE(request: NextRequest, { params }: Context) {
  const user = await isAllowed(["admin"]);
  if (!user) return apiError("Não autorizado.", 401);
  const { id } = await params;
  const body = await request.json().catch(() => null) as { reason?: string } | null;
  const reason = body?.reason?.trim();
  if (!reason || reason.length > 2000) return apiError("Informe o motivo da exclusão (até 2.000 caracteres).", 400);

  const job = await db.bulkActionJob.findUnique({ where: { id }, select: { id: true, status: true, deletedAt: true } });
  if (!job || job.deletedAt) return apiError("Ação manual não encontrada.", 404);
  const archived = await db.bulkActionJob.updateMany({
    where: { id, deletedAt: null },
    data: { deletedAt: new Date(), deletedById: user.id, deletedByName: user.name, deletedByEmail: user.email, deletionReason: reason, ...(job.status === "RUNNING" ? { status: "PAUSED" } : {}) },
  });
  if (!archived.count) return apiError("A ação mudou de status. Atualize a lista e tente novamente.", 409);
  return NextResponse.json({ archived: true });
}
