import { db } from "@/lib/db";
import { comparePdfs } from "@/lib/server/openrouter";
import { getContractNumberRejectionReasons, getIdentityRejectionReasons } from "@/lib/server/identity-check";
import { getStoredPdf } from "@/lib/server/storage";

/** Sem voucher (Considerar DMA) a IA confere somente o número do contrato anexado contra o contrato validado no Coral. */
export async function analyzeRequest(requestId: string, version: number, voucherKey: string | null, contractKey: string) {
  try {
    const { contractName } = await db.dmaRequest.findUniqueOrThrow({ where: { id: requestId }, select: { contractName: true } });
    const [voucher, contract] = await Promise.all([voucherKey ? getStoredPdf(voucherKey) : null, getStoredPdf(contractKey)]);
    const comparison = await comparePdfs(voucher, contract, contractName);
    const rejectionReasons = [...getContractNumberRejectionReasons(comparison.contractNumber), ...(voucher ? getIdentityRejectionReasons(comparison.identity) : [])];
    const status = rejectionReasons.length ? "REJECTED" : "PENDING_REVIEW";
    const analysisStatus = rejectionReasons.length ? "AUTO_REJECTED" : "COMPLETED";
    const savedComparison = rejectionReasons.length
      ? { ...comparison, summary: `Solicitacao recusada automaticamente pela validacao documental. Motivos: ${rejectionReasons.join(" ")}` }
      : comparison;

    await db.$transaction(async (tx) => {
      await tx.aiAnalysis.create({ data: { requestId, requestVersion: version, provider: "openrouter", model: process.env.OPENROUTER_MODEL || "unknown", status: analysisStatus, comparison: savedComparison as never, confidence: comparison.confidence } });
      await tx.dmaRequest.update({ where: { id: requestId }, data: { status } });
      await tx.auditEvent.create({ data: { requestId, event: "AI_ANALYSIS_COMPLETED", details: { version, status, matches: comparison.matches, rejected: rejectionReasons.length > 0 } } });
      if (rejectionReasons.length) {
        await tx.auditEvent.create({ data: { requestId, event: "AI_AUTO_REJECTED", details: { version, reasons: rejectionReasons } } });
      }
    });
    return { ok: true as const, status, comparison: savedComparison, rejectionReasons };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha na analise documental.";
    await db.$transaction([
      db.aiAnalysis.create({ data: { requestId, requestVersion: version, provider: "openrouter", model: process.env.OPENROUTER_MODEL || "unknown", status: "FAILED", errorCode: message.slice(0, 200) } }),
      db.dmaRequest.update({ where: { id: requestId }, data: { status: "ANALYSIS_FAILED" } }),
      db.auditEvent.create({ data: { requestId, event: "AI_ANALYSIS_FAILED", details: { version, message: message.slice(0, 500) } } }),
    ]);
    return { ok: false as const, error: message };
  }
}
