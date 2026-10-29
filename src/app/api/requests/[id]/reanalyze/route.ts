import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAllowed } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";
import { analyzeRequest } from "@/lib/server/analyze-request";
import { requiresVoucher } from "@/lib/services/request-policy";

type Context = { params: Promise<{ id: string }> };

export const maxDuration = 150;

export async function POST(_request: Request, { params }: Context) {
  const user = await isAllowed(["attendant", "admin"]);
  if (!user) return apiError("Não autorizado.", 401);

  const { id } = await params;
  const item = await db.dmaRequest.findUnique({ where: { id } });

  if (!item || (user.role !== "admin" && item.requesterId !== user.id)) return apiError("Solicitação não encontrada.", 404);
  if (item.status !== "ANALYSIS_FAILED") return apiError("Esta solicitação não está aguardando uma nova análise.", 409);

  const documents = await db.requestDocument.findMany({ where: { requestId: id, version: item.version } });
  const voucher = documents.find((document) => document.kind === "VOUCHER");
  const contract = documents.find((document) => document.kind === "CONTRACT");
  const needsVoucher = requiresVoucher(item.actionType);
  if ((needsVoucher && !voucher) || !contract) return apiError("Não foi possível localizar os dois documentos desta versão. Reabra a solicitação e anexe os documentos novamente.", 409);

  const changed = await db.$transaction(async (tx) => {
    const result = await tx.dmaRequest.updateMany({ where: { id, version: item.version, status: "ANALYSIS_FAILED" }, data: { status: "ANALYZING" } });
    if (result.count) await tx.auditEvent.create({ data: { requestId: id, actorId: user.id, event: "AI_ANALYSIS_RETRIED", details: { version: item.version } } });
    return result.count;
  });
  if (!changed) return apiError("A solicitação foi atualizada por outra ação. Atualize a página e tente novamente.", 409);
  const analysis = await analyzeRequest(id, item.version, needsVoucher && voucher ? voucher.storageKey : null, contract.storageKey);

  return NextResponse.json({ status: analysis.ok ? analysis.status : "ANALYSIS_FAILED", error: analysis.ok ? null : analysis.error });
}
