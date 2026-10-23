import { db } from "@/lib/db";
import { comparePdfs } from "@/lib/server/openrouter";
import { getStoredPdf } from "@/lib/server/storage";
export async function analyzeRequest(requestId: string, version: number, voucherKey: string, contractKey: string) {
  try {
    const [voucher, contract] = await Promise.all([getStoredPdf(voucherKey), getStoredPdf(contractKey)]);
    const comparison = await comparePdfs(voucher, contract);
    await db.$transaction([
      db.aiAnalysis.create({ data: { requestId, requestVersion: version, provider: "openrouter", model: process.env.OPENROUTER_MODEL || "unknown", status: "COMPLETED", comparison: comparison as never, confidence: comparison.confidence } }),
      db.dmaRequest.update({ where: { id: requestId }, data: { status: "PENDING_REVIEW" } }),
    ]);
    return { ok: true as const, comparison };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha na análise documental.";
    await db.$transaction([
      db.aiAnalysis.create({ data: { requestId, requestVersion: version, provider: "openrouter", model: process.env.OPENROUTER_MODEL || "unknown", status: "FAILED", errorCode: message.slice(0, 200) } }),
      db.dmaRequest.update({ where: { id: requestId }, data: { status: "ANALYSIS_FAILED" } }),
    ]);
    return { ok: false as const, error: message };
  }
}
