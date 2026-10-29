import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAllowed } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";
import { ATTENDANT_MANAGEABLE_STATUSES } from "@/lib/services/request-policy";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  const actor = await isAllowed(["attendant", "admin"]);
  if (!actor) return apiError("Apenas o atendente responsável ou um administrador pode excluir esta solicitação.", 403);
  const body = await request.json().catch(() => null) as { reason?: unknown } | null;
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (!reason) return apiError("Informe o motivo da exclusão.");
  if (reason.length > 2000) return apiError("O motivo da exclusão deve ter no máximo 2.000 caracteres.");

  const { id } = await params;
  const item = await db.dmaRequest.findUnique({ where: { id }, select: { id: true, requesterId: true, status: true } });
  if (!item) return apiError("Solicitação não encontrada.", 404);
  if (item.status === "ARCHIVED") return apiError("Esta solicitação já está arquivada.", 409);
  if (actor.role === "attendant" && item.requesterId !== actor.id) return apiError("Você só pode excluir uma solicitação aberta por você.", 403);
  if (actor.role === "attendant" && !ATTENDANT_MANAGEABLE_STATUSES.includes(item.status)) return apiError("O atendente só pode excluir solicitações devolvidas pela análise. Na fila de aprovação do administrador não é possível alterar a solicitação.", 409);

  try {
    await db.$transaction(async (tx) => {
      const changed = await tx.dmaRequest.updateMany({ where: { id, status: item.status }, data: { status: "ARCHIVED" } });
      if (!changed.count) throw new Error("A solicitação mudou de status; atualize a tela e tente novamente.");
      await tx.auditEvent.create({ data: { requestId: id, actorId: actor.id, event: "REQUEST_ARCHIVED", details: { previousStatus: item.status, historyRetained: true, archivedBy: actor.role, reason } } });
    });
    return NextResponse.json({ status: "ARCHIVED", historyRetained: true });
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "Não foi possível arquivar a solicitação.", 409);
  }
}
