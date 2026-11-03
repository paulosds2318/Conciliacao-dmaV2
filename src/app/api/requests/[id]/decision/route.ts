import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAllowed } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";
import { executeApprovedRequest } from "@/lib/server/execute-request";
import { reviewDecisionSchema } from "@/lib/validators/request";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: NextRequest, { params }: Context) {
  const reviewer = await isAllowed(["admin"]);
  if (!reviewer) return apiError("Apenas administradores podem decidir solicitações.", 403);
  const { id } = await params;
  const parsed = reviewDecisionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message || "Decisão inválida.");
  const item = await db.dmaRequest.findUnique({ where: { id } });
  if (!item) return apiError("Solicitação não encontrada.", 404);
  const demoRecord = await db.auditEvent.findFirst({ where: { requestId: id, event: "DEMO_REQUEST_CREATED" }, select: { id: true } });
  if (demoRecord) return apiError("Esta solicitação é apenas uma demonstração; decisões e execução no Coral estão bloqueadas.", 409);  if (item.status !== "PENDING_REVIEW") return apiError("A solicitação não está aguardando análise.", 409);
  if (parsed.data.decision === "REJECT") {
    try {
      await db.$transaction(async (tx) => {
        const changed = await tx.dmaRequest.updateMany({ where: { id, version: item.version, status: "PENDING_REVIEW" }, data: { status: "REJECTED" } });
        if (!changed.count) throw new Error("A solicitação já recebeu uma decisão.");
        await tx.reviewDecision.create({ data: { requestId: id, reviewerId: reviewer.id, requestVersion: item.version, decision: "REJECT", justification: parsed.data.justification } });
        await tx.auditEvent.create({ data: { requestId: id, actorId: reviewer.id, event: "REQUEST_REJECTED", details: { version: item.version, justification: parsed.data.justification } } });
      });
    } catch (error) { return apiError(error instanceof Error ? error.message : "A solicitação já recebeu uma decisão.", 409); }
    return NextResponse.json({ status: "REJECTED" });
  }
  if (!item.coralContractId) return apiError("O Coral não retornou o identificador interno deste contrato. A solicitação não pode ser executada; valide o contrato novamente e reenvie.", 409);
  let outcome;
  try { outcome = await executeApprovedRequest({ id, version: item.version, actionType: item.actionType, coralContractId: item.coralContractId }, { actorId: reviewer.id, justification: parsed.data.justification }); }
  catch (error) { return apiError(error instanceof Error ? error.message : "A solicitação já recebeu uma decisão.", 409); }
  return NextResponse.json(outcome, { status: outcome.status === "COMPLETED" ? 200 : 502 });
}
