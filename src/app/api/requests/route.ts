import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAllowed } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";
import { lookupContract } from "@/lib/server/coral";
import { analyzeRequest } from "@/lib/server/analyze-request";
import { removeStoredPdf, storePdf } from "@/lib/server/storage";
import { createRequestSchema } from "@/lib/validators/request";
export const maxDuration = 150;
export async function GET() {
  const user = await isAllowed(["attendant", "admin"]);
  if (!user) return apiError("Não autorizado.", 401);
  const where = user.role === "attendant" ? { requesterId: user.id } : {};
  const requests = await db.dmaRequest.findMany({ where, orderBy: { updatedAt: "desc" }, include: { requester: { select: { id: true, name: true, email: true } }, analyses: { orderBy: { createdAt: "desc" }, take: 1 }, decisions: { orderBy: { createdAt: "desc" }, take: 1, include: { reviewer: { select: { name: true } } } }, _count: { select: { documents: true } } } });
  return NextResponse.json({ requests });
}
export async function POST(request: NextRequest) {
  const user = await isAllowed(["attendant"]);
  if (!user) return apiError("Não autorizado.", 401);
  const form = await request.formData();
  const parsed = createRequestSchema.safeParse({ actionType: form.get("actionType"), contractName: form.get("contractName"), observations: form.get("observations") ?? "" });
  if (!parsed.success || !["CONSIDERAR_DMA", "DESCONSIDERAR_DMA"].includes(parsed.data.actionType)) return apiError("Selecione uma ação e informe o contrato.");
  const voucher = form.get("voucher"); const contractFile = form.get("contract");
  if (!(voucher instanceof File) || !(contractFile instanceof File) || voucher.size === 0 || contractFile.size === 0) return apiError("Anexe o voucher e o contrato em PDF. Os dois arquivos são obrigatórios.");
  let coral;
  try { coral = await lookupContract(parsed.data.contractName); } catch (e) { return apiError(e instanceof Error ? e.message : "Falha na validação Coral.", 502); }
  if (!coral) return apiError("Contrato não encontrado no Coral.", 422);
  const requestId = crypto.randomUUID();
  const stored: Array<{ storageKey: string }> = [];
  try {
    const [voucherMeta, contractMeta] = await Promise.all([storePdf(requestId, "VOUCHER", voucher), storePdf(requestId, "CONTRACT", contractFile)]);
    stored.push(voucherMeta, contractMeta);
    const created = await db.dmaRequest.create({ data: { id: requestId, requesterId: user.id, actionType: parsed.data.actionType, contractName: coral.number, observations: parsed.data.observations || null, coralContractId: coral.id, status: "ANALYZING", submittedAt: new Date(), documents: { create: [{ kind: "VOUCHER", storageKey: voucherMeta.storageKey, originalName: voucher.name, mimeType: "application/pdf", sizeBytes: voucherMeta.sizeBytes, sha256: voucherMeta.sha256 }, { kind: "CONTRACT", storageKey: contractMeta.storageKey, originalName: contractFile.name, mimeType: "application/pdf", sizeBytes: contractMeta.sizeBytes, sha256: contractMeta.sha256 }] }, auditEvents: { create: { actorId: user.id, event: "REQUEST_SUBMITTED", details: { contract: coral.number, simulatedCoral: process.env.MODO_TESTE_API === "true" } } } } });
    const analysis = await analyzeRequest(created.id, created.version, voucherMeta.storageKey, contractMeta.storageKey);
    return NextResponse.json({ requestId: created.id, status: analysis.ok ? "PENDING_REVIEW" : "ANALYSIS_FAILED", analysis: analysis.ok ? analysis.comparison : null, error: analysis.ok ? null : analysis.error }, { status: 201 });
  } catch (error) {
    await Promise.all(stored.map((item) => removeStoredPdf(item.storageKey)));
    return apiError(error instanceof Error ? error.message : "Não foi possível criar a solicitação.", 400);
  }
}
