import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAllowed } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";
import { analyzeRequest } from "@/lib/server/analyze-request";
import { removeStoredPdf, storePdf } from "@/lib/server/storage";
export const maxDuration = 150;
type Context = { params: Promise<{ id: string }> };
export async function POST(request: NextRequest, { params }: Context) {
  const user = await isAllowed(["attendant", "admin"]);
  if (!user) return apiError("Nao autorizado.", 401);
  const { id } = await params;
  const item = await db.dmaRequest.findUnique({ where: { id } });
  if (!item || (user.role === "attendant" && item.requesterId !== user.id)) return apiError("Solicitacao nao encontrada.", 404);
  if (item.status !== "REJECTED") return apiError("Somente solicitacoes recusadas podem ser corrigidas.", 409);
  const form = await request.formData(); const voucher = form.get("voucher"); const contract = form.get("contract");
  if (!(voucher instanceof File) || !(contract instanceof File) || !voucher.size || !contract.size) return apiError("Anexe novamente o voucher e o contrato em PDF.");
  const version = item.version + 1; const stored: Array<{ storageKey: string }> = [];
  try {
    const [v, c] = await Promise.all([storePdf(id, "VOUCHER", voucher), storePdf(id, "CONTRACT", contract)]); stored.push(v, c);
    await db.$transaction([
      db.requestDocument.create({ data: { requestId: id, kind: "VOUCHER", storageKey: v.storageKey, originalName: voucher.name, mimeType: "application/pdf", sizeBytes: v.sizeBytes, sha256: v.sha256, version } }),
      db.requestDocument.create({ data: { requestId: id, kind: "CONTRACT", storageKey: c.storageKey, originalName: contract.name, mimeType: "application/pdf", sizeBytes: c.sizeBytes, sha256: c.sha256, version } }),
      db.dmaRequest.update({ where: { id }, data: { status: "ANALYZING", version, submittedAt: new Date() } }),
      db.auditEvent.create({ data: { requestId: id, actorId: user.id, event: "REQUEST_CORRECTED", details: { version } } }),
    ]);
    const analysis = await analyzeRequest(id, version, v.storageKey, c.storageKey);
    return NextResponse.json({ status: analysis.ok ? "PENDING_REVIEW" : "ANALYSIS_FAILED", error: analysis.ok ? null : analysis.error });
  } catch (error) { await Promise.all(stored.map((x) => removeStoredPdf(x.storageKey))); return apiError(error instanceof Error ? error.message : "Falha ao corrigir solicitacao."); }
}