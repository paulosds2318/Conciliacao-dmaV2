import { db } from "@/lib/db";
import { comparePdfs } from "@/lib/server/openrouter";
import { executeApprovedRequest } from "@/lib/server/execute-request";
import {
  autoApprovalEnabled,
  detectPartnerFromText,
  getContractNumberRejectionReasons,
  getIdentityRejectionReasons,
  isPartnerAutoApprovable,
} from "@/lib/server/identity-check";
import { extractPdfText } from "@/lib/server/pdf-text";
import { getStoredPdf } from "@/lib/server/storage";

/** Sem voucher (Considerar DMA) a IA confere somente o número do contrato anexado contra o contrato validado no Coral. */
export async function analyzeRequest(requestId: string, version: number, voucherKey: string | null, contractKey: string) {
  let analyzed;
  try {
    const { contractName } = await db.dmaRequest.findUniqueOrThrow({ where: { id: requestId }, select: { contractName: true } });
    const [voucher, contract] = await Promise.all([voucherKey ? getStoredPdf(voucherKey) : null, getStoredPdf(contractKey)]);
    const [aiComparison, voucherText] = await Promise.all([
      comparePdfs(voucher, contract, contractName),
      voucher ? extractPdfText(voucher) : null,
    ]);
    const comparison = {
      ...aiComparison,
      voucherTextAvailable: voucherText !== null,
      voucherTextOrigin: voucherText ? detectPartnerFromText(voucherText) : null,
    };
    const rejectionReasons = [
      ...getContractNumberRejectionReasons(comparison.contractNumber),
      ...(voucher ? getIdentityRejectionReasons(comparison.identity, comparison.reservation) : []),
    ];
    const status = rejectionReasons.length ? "REJECTED" : "PENDING_REVIEW";
    const analysisStatus = rejectionReasons.length ? "AUTO_REJECTED" : "COMPLETED";
    const savedComparison = rejectionReasons.length
      ? { ...comparison, summary: `Solicitação recusada automaticamente pela validação documental. Motivos: ${rejectionReasons.join(" ")}` }
      : comparison;

    await db.$transaction(async (tx) => {
      await tx.aiAnalysis.create({
        data: {
          requestId,
          requestVersion: version,
          provider: "openrouter",
          model: process.env.OPENROUTER_MODEL || "unknown",
          status: analysisStatus,
          comparison: savedComparison as never,
          confidence: comparison.confidence,
        },
      });
      await tx.dmaRequest.update({ where: { id: requestId }, data: { status } });
      await tx.auditEvent.create({
        data: {
          requestId,
          event: "AI_ANALYSIS_COMPLETED",
          details: { version, status, matches: comparison.matches, rejected: rejectionReasons.length > 0 },
        },
      });
      if (rejectionReasons.length) {
        await tx.auditEvent.create({ data: { requestId, event: "AI_AUTO_REJECTED", details: { version, reasons: rejectionReasons } } });
      }
    });
    analyzed = {
      status,
      comparison: savedComparison,
      rejectionReasons,
      autoApprove: autoApprovalEnabled() && !!voucher && !rejectionReasons.length && isPartnerAutoApprovable(comparison),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha na análise documental.";
    await db.$transaction([
      db.aiAnalysis.create({
        data: {
          requestId,
          requestVersion: version,
          provider: "openrouter",
          model: process.env.OPENROUTER_MODEL || "unknown",
          status: "FAILED",
          errorCode: message.slice(0, 200),
        },
      }),
      db.dmaRequest.update({ where: { id: requestId }, data: { status: "ANALYSIS_FAILED" } }),
      db.auditEvent.create({ data: { requestId, event: "AI_ANALYSIS_FAILED", details: { version, message: message.slice(0, 500) } } }),
    ]);
    return { ok: false as const, error: message };
  }
  const { autoApprove, ...result } = analyzed;
  if (!autoApprove) return { ok: true as const, ...result };
  return { ok: true as const, ...result, status: (await autoApprovePartnerVoucher(requestId, version)) ?? result.status };
}

/** Voucher Rentalcars ou Rentcars conferido: executa a ação no Coral sem aguardar o administrador. Devolve o novo status, ou null se seguir para aprovação manual. */
async function autoApprovePartnerVoucher(requestId: string, version: number) {
  const item = await db.dmaRequest.findUnique({ where: { id: requestId }, select: { actionType: true, coralContractId: true } });
  if (!item?.coralContractId) return null;
  const demoRecord = await db.auditEvent.findFirst({ where: { requestId, event: "DEMO_REQUEST_CREATED" }, select: { id: true } });
  if (demoRecord) return null;
  try {
    const outcome = await executeApprovedRequest(
      { id: requestId, version, actionType: item.actionType, coralContractId: item.coralContractId },
      { actorId: null, reason: "Voucher Rentalcars/Rentcars com dados do cliente conferidos com o contrato." },
    );
    return outcome.status;
  } catch {
    return null;
  }
}
