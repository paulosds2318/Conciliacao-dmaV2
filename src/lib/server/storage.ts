import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { ACCEPTED_DOCUMENT_MIME_TYPES, DOCUMENT_FORMATS_LABEL, DOCUMENT_TYPES, detectDocumentType, documentExtension } from "@/lib/document-types";

const root = path.resolve(/*turbopackIgnore: true*/ process.env.DOCUMENT_STORAGE_PATH || "./private-uploads");
export const maxPdfBytes = Number(process.env.MAX_PDF_SIZE_MB || 20) * 1024 * 1024;
export async function storePdf(requestId: string, kind: string, file: File) {
  const name = file.name.toLowerCase();
  if (!ACCEPTED_DOCUMENT_MIME_TYPES.includes(file.type) || !DOCUMENT_TYPES.some((type) => type.extensions.some((extension) => name.endsWith(extension)))) throw new Error(`Envie o arquivo em ${DOCUMENT_FORMATS_LABEL}.`);
  if (file.size < 8 || file.size > maxPdfBytes) throw new Error(`Cada arquivo deve ter no máximo ${process.env.MAX_PDF_SIZE_MB || 20} MB.`);
  const bytes = Buffer.from(await file.arrayBuffer());
  const mimeType = detectDocumentType(bytes);
  if (!mimeType) throw new Error(`O arquivo "${file.name}" não é um ${DOCUMENT_FORMATS_LABEL} válido.`);
  const storageKey = `${requestId}/${kind.toLowerCase()}-${randomUUID()}${documentExtension(mimeType)}`;
  const target = path.resolve(/*turbopackIgnore: true*/ root, storageKey);
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error("Caminho de arquivo inválido.");
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes, { flag: "wx", mode: 0o600 });
  return { storageKey, mimeType, sha256: createHash("sha256").update(bytes).digest("hex"), sizeBytes: bytes.length };
}
export async function getStoredPdf(key: string) {
  const target = path.resolve(/*turbopackIgnore: true*/ root, key);
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error("Arquivo não encontrado.");
  return readFile(/*turbopackIgnore: true*/ target);
}
export async function removeStoredPdf(key: string) {
  const target = path.resolve(/*turbopackIgnore: true*/ root, key);
  if (target.startsWith(`${root}${path.sep}`)) await unlink(target).catch(() => undefined);
}
