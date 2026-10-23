import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(/*turbopackIgnore: true*/ process.env.DOCUMENT_STORAGE_PATH || "./private-uploads");
export const maxPdfBytes = Number(process.env.MAX_PDF_SIZE_MB || 20) * 1024 * 1024;
export async function storePdf(requestId: string, kind: string, file: File) {
  if (file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf")) throw new Error("Envie um arquivo PDF válido.");
  if (file.size < 8 || file.size > maxPdfBytes) throw new Error(`O PDF deve ter no máximo ${process.env.MAX_PDF_SIZE_MB || 20} MB.`);
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") throw new Error("O arquivo enviado não contém um PDF válido.");
  const storageKey = `${requestId}/${kind.toLowerCase()}-${randomUUID()}.pdf`;
  const target = path.resolve(/*turbopackIgnore: true*/ root, storageKey);
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error("Caminho de arquivo inválido.");
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes, { flag: "wx", mode: 0o600 });
  return { storageKey, sha256: createHash("sha256").update(bytes).digest("hex"), sizeBytes: bytes.length };
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
