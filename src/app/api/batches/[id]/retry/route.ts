import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAllowed } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: NextRequest, { params }: Context) {
  const user = await isAllowed(["admin"]);
  if (!user) return apiError("Não autorizado.", 401);
  const { id } = await params;
  const job = await db.bulkActionJob.findUnique({ where: { id } });
  if (!job || (user.role !== "admin" && job.requesterId !== user.id)) return apiError("Ação manual não encontrada.", 404);
  if (job.status === "RUNNING") return apiError("Aguarde o fim do processamento atual.", 409);
  const body = await request.json().catch(() => null) as { type?: string; confirmDuplicateRisk?: boolean } | null;
  if (body?.type !== "FAILED" && body?.type !== "UNCERTAIN") return apiError("Selecione quais contratos devem ser tentados novamente.");
  if (body.type === "UNCERTAIN" && body.confirmDuplicateRisk !== true) return apiError("Confirme que a nova tentativa pode repetir uma ação já aplicada.");
  const result = await db.$transaction(async (tx) => {
    const changedJob = await tx.bulkActionJob.updateMany({ where: { id, status: { not: "RUNNING" } }, data: { status: "PAUSED" } });
    if (!changedJob.count) return 0;
    const reset = await tx.bulkActionItem.updateMany({ where: { jobId: id, status: body.type }, data: { status: "PENDING", note: body.type === "UNCERTAIN" ? "Nova tentativa confirmada manualmente; resultado anterior incerto" : null, completedAt: null, processingStartedAt: null } });
    return reset.count;
  });
  if (!result) return apiError("Não há contratos desse tipo para tentar novamente.", 409);
  return NextResponse.json({ status: "PAUSED", reset: result });
}
