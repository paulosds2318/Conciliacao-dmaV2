export const REQUIRED_DOCUMENT_KINDS = ["VOUCHER", "CONTRACT"] as const;
export type RequiredDocumentKind = typeof REQUIRED_DOCUMENT_KINDS[number];
export type UploadedDocument = { kind: string; mimeType: string };
export function missingRequiredDocuments(documents: UploadedDocument[]): RequiredDocumentKind[] {
  return REQUIRED_DOCUMENT_KINDS.filter((kind) => !documents.some((document) => document.kind === kind && document.mimeType === "application/pdf"));
}
export function canSubmitRequest(contractValidated: boolean, documents: UploadedDocument[]) {
  return contractValidated && missingRequiredDocuments(documents).length === 0;
}