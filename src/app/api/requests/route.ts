import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAllowed } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";
import { lookupContract } from "@/lib/server/coral";
import { parseDocumentRemovalHistory } from "@/lib/server/document-removals";
import { analyzeRequest } from "@/lib/server/analyze-request";
import { removeStoredPdf, storePdf } from "@/lib/server/storage";
import { createRequestSchema } from "@/lib/validators/request";
import { requiresVoucher } from "@/lib/services/request-policy";
import { checkContractAccess } from "@/lib/server/store-access";
export const maxDuration = 150;
export async function GET(request: Request) {
  const user = await isAllowed(["attendant", "admin"]);
  if (!user) return apiError("Não autorizado.", 401);
  const includeArchived = new URL(request.url).searchParams.get("includeArchived") === "true";
  const where = user.role === "attendant"
    ? { requesterId: user.id, ...(includeArchived ? {} : { status: { not: "ARCHIVED" } }) }
    : includeArchived ? {} : { status: { not: "ARCHIVED" } };
  const requests = await db.dmaRequest.findMany({ where, orderBy: { updatedAt: "desc" }, include: { requester: { select: { id: true, name: true, email: true } }, analyses: { orderBy: { createdAt: "desc" }, take: 1 }, decisions: { orderBy: { createdAt: "desc" }, take: 1, include: { reviewer: { select: { name: true, email: true } } } }, auditEvents: { where: { event: { in: ["REQUEST_REOPENED", "REQUEST_ARCHIVED"] } }, orderBy: { createdAt: "desc" }, take: 10, include: { actor: { select: { id: true, name: true, email: true } } } }, _count: { select: { documents: true } } } });
  return NextResponse.json({ requests });
}
export async function POST(request: NextRequest) {
  const user = await isAllowed(["attendant"]);
  if (!user) return apiError("Não autorizado.", 401);
  const form = await request.formData();
  const parsed = createRequestSchema.safeParse({ actionType: form.get("actionType"), contractName: form.get("contractName"), observations: form.get("observations") ?? "" });
  if (!parsed.success || !["CONSIDERAR_DMA", "DESCONSIDERAR_DMA"].includes(parsed.data.actionType)) return apiError("Selecione uma ação e informe o contrato.");
  const accessError = await checkContractAccess(user, parsed.data.contractName);
  if (accessError) return apiError(accessError, 403);
  const needsVoucher = requiresVoucher(parsed.data.actionType);
  const voucher = needsVoucher ? form.get("voucher") : null; const contractFile = form.get("contract");
  if (!(contractFile instanceof File) || contractFile.size === 0) return apiError("Anexe o contrato (PDF ou imagem).");
  if (needsVoucher && (!(voucher instanceof File) || voucher.size === 0)) return apiError("Anexe o voucher e o contrato (PDF ou imagem). Os dois arquivos são obrigatórios para desconsiderar DMA.");
  let coral;
  try { coral = await lookupContract(parsed.data.contractName); }
  catch (error) { return apiError(error instanceof Error ? error.message : "Falha na validacao do Coral.", 502); }
  if (!coral) return apiError("Não encontramos esse contrato no Coral. Confira o número informado ou confirme se ele existe.", 422);
  const coralAccessError = await checkContractAccess(user, coral.number);
  if (coralAccessError) return apiError(coralAccessError, 403);
  if (!coral.id) return apiError("O Coral não retornou o identificador interno deste contrato. Não é possível abrir uma solicitação para ele agora.", 422);
  const requestId = crypto.randomUUID();
  const stored: Array<{ storageKey: string }> = [];
  try {
    const [voucherMeta, contractMeta] = await Promise.all([voucher instanceof File ? storePdf(requestId, "VOUCHER", voucher) : null, storePdf(requestId, "CONTRACT", contractFile)]);
    if (voucherMeta) stored.push(voucherMeta);
    stored.push(contractMeta);
    const created = await db.dmaRequest.create({ data: { id: requestId, requesterId: user.id, actionType: parsed.data.actionType, contractName: coral.number, observations: parsed.data.observations || null, coralContractId: coral.id, status: "ANALYZING", submittedAt: new Date(), documents: { create: [...(voucherMeta && voucher instanceof File ? [{ kind: "VOUCHER", storageKey: voucherMeta.storageKey, originalName: voucher.name, mimeType: voucherMeta.mimeType, sizeBytes: voucherMeta.sizeBytes, sha256: voucherMeta.sha256 }] : []), { kind: "CONTRACT", storageKey: contractMeta.storageKey, originalName: contractFile.name, mimeType: contractMeta.mimeType, sizeBytes: contractMeta.sizeBytes, sha256: contractMeta.sha256 }] }, auditEvents: { create: { actorId: user.id, event: "REQUEST_SUBMITTED", details: { contract: coral.number, coralSimulated: Boolean((coral.raw as { simulated?: boolean } | null)?.simulated), removedAttachments: parseDocumentRemovalHistory(form.get("removedAttachments")) } } } } });
    const analysis = await analyzeRequest(created.id, created.version, voucherMeta?.storageKey ?? null, contractMeta.storageKey);
    return NextResponse.json({ requestId: created.id, status: analysis.ok ? analysis.status : "ANALYSIS_FAILED", analysis: analysis.ok ? analysis.comparison : null, error: analysis.ok ? null : analysis.error }, { status: 201 });
  } catch (error) {
    await Promise.all(stored.map((item) => removeStoredPdf(item.storageKey)));
    return apiError(error instanceof Error ? error.message : "Não foi possível criar a solicitação.", 400);
  }
}
