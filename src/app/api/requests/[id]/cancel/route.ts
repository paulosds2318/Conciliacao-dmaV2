import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAllowed } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";
import { ATTENDANT_MANAGEABLE_STATUSES } from "@/lib/services/request-policy";
type Context = { params: Promise<{ id: string }> };
const cancellableStatuses = ATTENDANT_MANAGEABLE_STATUSES;
export async function POST(request: Request, { params }: Context) {
  const user = await isAllowed(["attendant"]);
  if (!user) return apiError("Apenas o atendente pode cancelar esta solicitação.", 403);
  const body = (await request.json().catch(() => null)) as { reason?: unknown } | null;
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (!reason) return apiError("Informe o motivo do cancelamento.");
  if (reason.length > 2000) return apiError("O motivo do cancelamento deve ter no máximo 2.000 caracteres.");
  const { id } = await params;
  const item = await db.dmaRequest.findUnique({ where: { id }, select: { id: true, requesterId: true, status: true } });
  if (!item || item.requesterId !== user.id) return apiError("Solicitação não encontrada.", 404);
  if (!cancellableStatuses.includes(item.status)) return apiError("Esta solicitação não pode ser cancelada no status atual.", 409);
  try {
    await db.$transaction(async (tx) => {
      const changed = await tx.dmaRequest.updateMany({ where: { id, status: item.status }, data: { status: "CANCELLED" } });
      if (!changed.count) throw new Error("A solicitação mudou de status; atualize a tela e tente novamente.");
      await tx.auditEvent.create({
        data: { requestId: id, actorId: user.id, event: "REQUEST_CANCELLED", details: { previousStatus: item.status, reason } },
      });
    });
    return NextResponse.json({ status: "CANCELLED" });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Não foi possível cancelar a solicitação.", 409);
  }
}
