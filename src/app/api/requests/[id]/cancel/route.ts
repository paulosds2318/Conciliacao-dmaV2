import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAllowed } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";
type Context = { params: Promise<{ id: string }> };
const cancellableStatuses = ["PENDING_REVIEW"];
export async function POST(_request: Request, { params }: Context) {
  const user = await isAllowed(["attendant"]);
  if (!user) return apiError("Apenas o atendente pode cancelar esta solicitacao.", 403);
  const { id } = await params;
  const item = await db.dmaRequest.findUnique({ where: { id }, select: { id: true, requesterId: true, status: true } });
  if (!item || item.requesterId !== user.id) return apiError("Solicitacao nao encontrada.", 404);
  if (!cancellableStatuses.includes(item.status)) return apiError("Esta solicitacao nao pode ser cancelada no status atual.", 409);
  try {
    await db.$transaction(async (tx) => {
      const changed = await tx.dmaRequest.updateMany({ where: { id, status: item.status }, data: { status: "CANCELLED" } });
      if (!changed.count) throw new Error("A solicitacao mudou de status; atualize a tela e tente novamente.");
      await tx.auditEvent.create({ data: { requestId: id, actorId: user.id, event: "REQUEST_CANCELLED", details: { previousStatus: item.status } } });
    });
    return NextResponse.json({ status: "CANCELLED" });
  } catch (error) { return apiError(error instanceof Error ? error.message : "Nao foi possivel cancelar a solicitacao.", 409); }
}
