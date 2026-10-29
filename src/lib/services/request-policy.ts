import { ACCEPTED_DOCUMENT_MIME_TYPES } from "@/lib/document-types";
/** O atendente só edita/exclui solicitações devolvidas pela análise; na fila do administrador fica bloqueado. */
export const ATTENDANT_MANAGEABLE_STATUSES: readonly string[] = ["REJECTED", "ANALYSIS_FAILED"];
export const REQUIRED_DOCUMENT_KINDS = ["VOUCHER", "CONTRACT"] as const;
export type RequiredDocumentKind = typeof REQUIRED_DOCUMENT_KINDS[number];
export type UploadedDocument = { kind: string; mimeType: string };
/** Considerar DMA dispensa o voucher: somente o contrato é anexado. */
export function requiresVoucher(actionType: string) {
  return actionType !== "CONSIDERAR_DMA";
}
export function requiredDocumentKinds(actionType: string): RequiredDocumentKind[] {
  return requiresVoucher(actionType) ? [...REQUIRED_DOCUMENT_KINDS] : ["CONTRACT"];
}
export function missingRequiredDocuments(documents: UploadedDocument[], actionType = "DESCONSIDERAR_DMA"): RequiredDocumentKind[] {
  return requiredDocumentKinds(actionType).filter((kind) => !documents.some((document) => document.kind === kind && ACCEPTED_DOCUMENT_MIME_TYPES.includes(document.mimeType)));
}
export function canSubmitRequest(contractValidated: boolean, documents: UploadedDocument[], actionType?: string) {
  return contractValidated && missingRequiredDocuments(documents, actionType).length === 0;
}