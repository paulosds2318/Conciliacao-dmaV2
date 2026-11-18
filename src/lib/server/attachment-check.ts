import { CONTRACT_PDF_ONLY_MESSAGE } from "@/lib/attachment-rules";
import { detectDocumentType } from "@/lib/document-types";
import { SAME_FILE_MESSAGE, sameContent } from "@/lib/same-file";
import {
  contractLayoutReasons,
  looksLikeFocoContract,
  VOUCHER_IS_CONTRACT_MESSAGE,
  voucherDuplicatesContractReasons,
} from "@/lib/server/contract-layout";
import { extractPdfText } from "@/lib/server/pdf-text";

/**
 * Confere os anexos antes de criar ou reabrir a solicitação e devolve a mensagem do primeiro problema (ou null).
 * O contrato tem que ser um PDF com texto no modelo padrão da Foco; o voucher não pode ser o mesmo arquivo nem um contrato.
 * Voucher em imagem ou PDF digitalizado não tem texto para conferir; nesse caso a análise da IA avalia depois.
 * Aceita só um dos arquivos (conferência no momento em que ele é escolhido): cada regra roda quando os arquivos que ela usa existem.
 */
export async function attachmentError(input: { voucher: File | null; contract: File | null }) {
  const { voucher, contract } = input;
  let contractBytes: Uint8Array | null = null;
  if (contract) {
    contractBytes = new Uint8Array(await contract.arrayBuffer());
    if (detectDocumentType(contractBytes) !== "application/pdf") return CONTRACT_PDF_ONLY_MESSAGE;
    if (voucher && (await sameContent(voucher, contract))) return SAME_FILE_MESSAGE;
  }
  const contractText = contractBytes ? await extractPdfText(contractBytes) : null;
  if (contractBytes) {
    const [layoutReason] = contractLayoutReasons(contractText);
    if (layoutReason) return layoutReason;
  }
  if (voucher) {
    const voucherText = await extractPdfText(new Uint8Array(await voucher.arrayBuffer()));
    if (voucherText !== null && looksLikeFocoContract(voucherText)) return VOUCHER_IS_CONTRACT_MESSAGE;
    // Outra exportação do contrato ou só parte dele (a primeira página, por exemplo) no lugar do voucher.
    const [duplicate] = voucherDuplicatesContractReasons({ voucherText, contractText });
    if (duplicate) return duplicate;
  }
  return null;
}
