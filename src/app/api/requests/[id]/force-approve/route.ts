import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAllowed } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";
import { executeApprovedRequest } from "@/lib/server/execute-request";
import { rejectionReasons } from "@/lib/services/rejection";
import { forceApprovalSchema } from "@/lib/validators/request";
type Context = { params: Promise<{ id: string }> };
/**
 * Aprovação forçada: o administrador aprova uma solicitação que foi recusada (pela análise automática ou por ele mesmo)
 * e a ação é executada no Coral. A justificativa é obrigatória e, com os motivos da recusa, fica no histórico.
 */
export async function POST(request: NextRequest, { params }: Context) {
  const reviewer = await isAllowed(["admin"]);
  if (!reviewer) return apiError("Apenas administradores podem forçar a aprovação.", 403);
  const { id } = await params;
  const parsed = forceApprovalSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Informe a justificativa.");
  const item = await db.dmaRequest.findUnique({
    where: { id },
    include: {
      decisions: { orderBy: { createdAt: "desc" }, select: { decision: true, justification: true, requestVersion: true } },
      auditEvents: { where: { event: "AI_AUTO_REJECTED" }, orderBy: { createdAt: "asc" }, select: { event: true, details: true } },
    },
  });
  if (!item) return apiError("Solicitação não encontrada.", 404);
  const demoRecord = await db.auditEvent.findFirst({ where: { requestId: id, event: "DEMO_REQUEST_CREATED" }, select: { id: true } });
  if (demoRecord) return apiError("Esta solicitação é apenas uma demonstração; decisões e execução no Coral estão bloqueadas.", 409);
  if (item.status !== "REJECTED") return apiError("Só é possível forçar a aprovação de uma solicitação recusada.", 409);
  if (!item.coralContractId)
    return apiError(
      "O Coral não retornou o identificador interno deste contrato. A solicitação não pode ser executada; valide o contrato novamente e reabra a solicitação.",
      409,
    );
  const reasons = rejectionReasons({ version: item.version, auditEvents: item.auditEvents, decisions: item.decisions });
  let outcome;
  try {
    outcome = await executeApprovedRequest(
      { id, version: item.version, actionType: item.actionType, coralContractId: item.coralContractId },
      { actorId: reviewer.id, justification: parsed.data.justification, forced: { reasons } },
    );
  } catch (error) {
    return apiError(error instanceof Error ? error.message : "A solicitação já recebeu uma decisão.", 409);
  }
  return NextResponse.json(outcome, { status: outcome.status === "COMPLETED" ? 200 : 502 });
}
