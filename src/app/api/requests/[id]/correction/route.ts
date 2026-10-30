import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAllowed } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";
import { analyzeRequest } from "@/lib/server/analyze-request";
import { removeStoredPdf, storePdf } from "@/lib/server/storage";
import { parseDocumentRemovalHistory } from "@/lib/server/document-removals";
import { requiresVoucher } from "@/lib/services/request-policy";
import { lookupContract } from "@/lib/server/coral";
import { checkContractAccess } from "@/lib/server/store-access";
export const maxDuration = 150;
type Context = { params: Promise<{ id: string }> };
export async function POST(request: NextRequest, { params }: Context) {
  const user = await isAllowed(["attendant"]);
  if (!user) return apiError("Nao autorizado.", 401);
  const { id } = await params;
  const item = await db.dmaRequest.findUnique({ where: { id } });
  if (!item || item.requesterId !== user.id) return apiError("Solicitacao nao encontrada.", 404);
  if (!["REJECTED", "ANALYSIS_FAILED"].includes(item.status)) return apiError("Esta solicitacao nao esta aguardando correcao.", 409);
  const needsVoucher = requiresVoucher(item.actionType);
  const form = await request.formData(); const voucher = needsVoucher ? form.get("voucher") : null; const contract = form.get("contract"); const reason = form.get("reason");
  if (typeof reason !== "string" || !reason.trim()) return apiError("Informe o motivo da reabertura.");
  if (reason.trim().length > 2000) return apiError("O motivo da reabertura deve ter no máximo 2.000 caracteres.");
  if (!(contract instanceof File) || !contract.size) return apiError("Anexe novamente o contrato (PDF ou imagem).");
  if (needsVoucher && (!(voucher instanceof File) || !voucher.size)) return apiError("Anexe novamente o voucher e o contrato (PDF ou imagem).");
  // O atendente pode corrigir o número do contrato na reabertura; o novo número é validado novamente no Coral.
  const requestedContract = form.get("contractName");
  const newContractNumber = typeof requestedContract === "string" ? requestedContract.trim() : "";
  if (newContractNumber.length > 80) return apiError("Informe um número de contrato válido.");
  let contractChange: { contractName: string; coralContractId: string } | null = null;
  if (newContractNumber && newContractNumber.toLowerCase() !== item.contractName.toLowerCase()) {
    const accessError = await checkContractAccess(user, newContractNumber);
    if (accessError) return apiError(accessError, 403);
    let coral;
    try { coral = await lookupContract(newContractNumber); }
    catch (error) { return apiError(error instanceof Error ? error.message : "Falha na validacao do Coral.", 502); }
    if (!coral) return apiError("Não encontramos o novo número de contrato no Coral. Confira o número informado.", 422);
    if (!coral.id) return apiError("O Coral não retornou o identificador interno do novo contrato. Não é possível reabrir com ele agora.", 422);
    const coralAccessError = await checkContractAccess(user, coral.number);
    if (coralAccessError) return apiError(coralAccessError, 403);
    contractChange = { contractName: coral.number, coralContractId: coral.id };
  }
  const version = item.version + 1; const stored: Array<{ storageKey: string }> = [];
  try {
    const [v, c] = await Promise.all([voucher instanceof File ? storePdf(id, "VOUCHER", voucher) : null, storePdf(id, "CONTRACT", contract)]); if (v) stored.push(v); stored.push(c);
    await db.$transaction([
      ...(v && voucher instanceof File ? [db.requestDocument.create({ data: { requestId: id, kind: "VOUCHER", storageKey: v.storageKey, originalName: voucher.name, mimeType: v.mimeType, sizeBytes: v.sizeBytes, sha256: v.sha256, version } })] : []),
      db.requestDocument.create({ data: { requestId: id, kind: "CONTRACT", storageKey: c.storageKey, originalName: contract.name, mimeType: c.mimeType, sizeBytes: c.sizeBytes, sha256: c.sha256, version } }),
      db.dmaRequest.update({ where: { id }, data: { status: "ANALYZING", version, submittedAt: new Date(), ...(contractChange ?? {}) } }),
      db.auditEvent.create({ data: { requestId: id, actorId: user.id, event: "REQUEST_REOPENED", details: { version, reason: reason.trim(), ...(contractChange ? { previousContract: item.contractName, contract: contractChange.contractName } : {}), removedAttachments: parseDocumentRemovalHistory(form.get("removedAttachments")) } } }),
    ]);
    const analysis = await analyzeRequest(id, version, v?.storageKey ?? null, c.storageKey);
    return NextResponse.json({ status: analysis.ok ? analysis.status : "ANALYSIS_FAILED", error: analysis.ok ? null : analysis.error });
  } catch (error) { await Promise.all(stored.map((x) => removeStoredPdf(x.storageKey))); return apiError(error instanceof Error ? error.message : "Falha ao corrigir solicitacao."); }
}
