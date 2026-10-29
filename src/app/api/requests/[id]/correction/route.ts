import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAllowed } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";
import { analyzeRequest } from "@/lib/server/analyze-request";
import { removeStoredPdf, storePdf } from "@/lib/server/storage";
import { parseDocumentRemovalHistory } from "@/lib/server/document-removals";
import { requiresVoucher } from "@/lib/services/request-policy";
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
  const version = item.version + 1; const stored: Array<{ storageKey: string }> = [];
  try {
    const [v, c] = await Promise.all([voucher instanceof File ? storePdf(id, "VOUCHER", voucher) : null, storePdf(id, "CONTRACT", contract)]); if (v) stored.push(v); stored.push(c);
    await db.$transaction([
      ...(v && voucher instanceof File ? [db.requestDocument.create({ data: { requestId: id, kind: "VOUCHER", storageKey: v.storageKey, originalName: voucher.name, mimeType: v.mimeType, sizeBytes: v.sizeBytes, sha256: v.sha256, version } })] : []),
      db.requestDocument.create({ data: { requestId: id, kind: "CONTRACT", storageKey: c.storageKey, originalName: contract.name, mimeType: c.mimeType, sizeBytes: c.sizeBytes, sha256: c.sha256, version } }),
      db.dmaRequest.update({ where: { id }, data: { status: "ANALYZING", version, submittedAt: new Date() } }),
      db.auditEvent.create({ data: { requestId: id, actorId: user.id, event: "REQUEST_REOPENED", details: { version, reason: reason.trim(), removedAttachments: parseDocumentRemovalHistory(form.get("removedAttachments")) } } }),
    ]);
    const analysis = await analyzeRequest(id, version, v?.storageKey ?? null, c.storageKey);
    return NextResponse.json({ status: analysis.ok ? analysis.status : "ANALYSIS_FAILED", error: analysis.ok ? null : analysis.error });
  } catch (error) { await Promise.all(stored.map((x) => removeStoredPdf(x.storageKey))); return apiError(error instanceof Error ? error.message : "Falha ao corrigir solicitacao."); }
}
