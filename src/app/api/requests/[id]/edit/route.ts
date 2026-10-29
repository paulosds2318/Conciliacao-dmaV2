import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAllowed } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";
import { ATTENDANT_MANAGEABLE_STATUSES } from "@/lib/services/request-policy";
type Context = { params: Promise<{ id: string }> };
const editableStatuses = ATTENDANT_MANAGEABLE_STATUSES;
export async function PATCH(request: NextRequest, { params }: Context) {
  const user = await isAllowed(["attendant"]);
  if (!user) return apiError("Apenas o atendente pode editar esta solicitacao.", 403);
  const { id } = await params;
  const item = await db.dmaRequest.findUnique({ where: { id }, select: { id: true, requesterId: true, status: true, actionType: true, observations: true } });
  if (!item || item.requesterId !== user.id) return apiError("Solicitacao nao encontrada.", 404);
  if (!editableStatuses.includes(item.status)) return apiError("Esta solicitacao so pode ser editada quando for devolvida pela analise para reabertura.", 409);
  const body = await request.json().catch(() => null) as { actionType?: unknown; observations?: unknown } | null;
  if (!body) return apiError("Informe os campos que deseja editar.");
  if (body.actionType !== "CONSIDERAR_DMA" && body.actionType !== "DESCONSIDERAR_DMA") return apiError("Selecione uma acao DMA valida.");
  if (typeof body.observations !== "string" || body.observations.trim().length > 2000) return apiError("As observacoes devem ter ate 2.000 caracteres.");
  const cleanedObservations = body.observations.trim();
  try {
    await db.$transaction(async (tx) => {
      const changed = await tx.dmaRequest.updateMany({ where: { id, status: item.status }, data: { actionType: body.actionType as string, observations: cleanedObservations || null } });
      if (!changed.count) throw new Error("A solicitacao mudou de status; atualize a tela e tente novamente.");
      await tx.auditEvent.create({ data: { requestId: id, actorId: user.id, event: "REQUEST_EDITED", details: { previousActionType: item.actionType, actionType: body.actionType as string, previousObservations: item.observations, observations: cleanedObservations } } });
    });
    return NextResponse.json({ status: "UPDATED" });
  } catch (error) { return apiError(error instanceof Error ? error.message : "Nao foi possivel editar a solicitacao.", 409); }
}
