/** Formatos aceitos para voucher e contrato: PDF ou imagem legível pela IA. */
export const DOCUMENT_TYPES = [
  { mimeType: "application/pdf", extensions: [".pdf"] },
  { mimeType: "image/jpeg", extensions: [".jpg", ".jpeg"] },
  { mimeType: "image/png", extensions: [".png"] },
  { mimeType: "image/webp", extensions: [".webp"] },
] as const;
export type DocumentMimeType = typeof DOCUMENT_TYPES[number]["mimeType"];
export const ACCEPTED_DOCUMENT_MIME_TYPES: readonly string[] = DOCUMENT_TYPES.map((type) => type.mimeType);
export const DOCUMENT_ACCEPT = DOCUMENT_TYPES.flatMap((type) => [type.mimeType, ...type.extensions]).join(",");
export const DOCUMENT_FORMATS_LABEL = "PDF, JPG, PNG ou WEBP";

/** Identifica o formato real pelo conteúdo do arquivo, sem confiar na extensão. */
export function detectDocumentType(bytes: Uint8Array): DocumentMimeType | null {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (ascii(0, 5) === "%PDF-") return "application/pdf";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && ascii(1, 4) === "PNG") return "image/png";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}
export function documentExtension(mimeType: DocumentMimeType) {
  return DOCUMENT_TYPES.find((type) => type.mimeType === mimeType)!.extensions[0];
}
