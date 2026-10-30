import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { ACCEPTED_DOCUMENT_MIME_TYPES, DOCUMENT_FORMATS_LABEL, DOCUMENT_TYPES, detectDocumentType, documentExtension } from "@/lib/document-types";

/**
 * Documentos ficam privados: em produção num bucket S3 (DOCUMENT_STORAGE_BUCKET), localmente no disco
 * (DOCUMENT_STORAGE_PATH). A chave gravada no banco é a mesma nos dois modos.
 */
const bucket = process.env.DOCUMENT_STORAGE_BUCKET?.trim();
const prefix = (process.env.DOCUMENT_STORAGE_PREFIX?.trim() || "documents").replace(/^\/+|\/+$/g, "");
const kmsKeyId = process.env.DOCUMENT_STORAGE_KMS_KEY_ID?.trim();
const root = path.resolve(/*turbopackIgnore: true*/ process.env.DOCUMENT_STORAGE_PATH || "./private-uploads");
// Credenciais vêm da role da task (ECS) ou do ambiente; nunca do código.
let s3: S3Client | null = null;
function client() { return s3 ??= new S3Client({ region: process.env.DOCUMENT_STORAGE_REGION || process.env.AWS_REGION }); }

const STORAGE_KEY = /^[A-Za-z0-9-]+\/[a-z]+-[A-Za-z0-9-]+\.[a-z]+$/;
function objectKey(storageKey: string) {
  if (!STORAGE_KEY.test(storageKey)) throw new Error("Arquivo não encontrado.");
  return `${prefix}/${storageKey}`;
}
function diskPath(storageKey: string) {
  const target = path.resolve(/*turbopackIgnore: true*/ root, storageKey);
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error("Arquivo não encontrado.");
  return target;
}

export const maxPdfBytes = Number(process.env.MAX_PDF_SIZE_MB || 20) * 1024 * 1024;
export async function storePdf(requestId: string, kind: string, file: File) {
  const name = file.name.toLowerCase();
  if (!ACCEPTED_DOCUMENT_MIME_TYPES.includes(file.type) || !DOCUMENT_TYPES.some((type) => type.extensions.some((extension) => name.endsWith(extension)))) throw new Error(`Envie o arquivo em ${DOCUMENT_FORMATS_LABEL}.`);
  if (file.size < 8 || file.size > maxPdfBytes) throw new Error(`Cada arquivo deve ter no máximo ${process.env.MAX_PDF_SIZE_MB || 20} MB.`);
  const bytes = Buffer.from(await file.arrayBuffer());
  const mimeType = detectDocumentType(bytes);
  if (!mimeType) throw new Error(`O arquivo "${file.name}" não é um ${DOCUMENT_FORMATS_LABEL} válido.`);
  const storageKey = `${requestId}/${kind.toLowerCase()}-${randomUUID()}${documentExtension(mimeType)}`;
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (bucket) {
    await client().send(new PutObjectCommand({
      Bucket: bucket, Key: objectKey(storageKey), Body: bytes, ContentType: mimeType,
      ...(kmsKeyId ? { ServerSideEncryption: "aws:kms", SSEKMSKeyId: kmsKeyId } : { ServerSideEncryption: "AES256" }),
    }));
  } else {
    const target = diskPath(storageKey);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes, { flag: "wx", mode: 0o600 });
  }
  return { storageKey, mimeType, sha256, sizeBytes: bytes.length };
}
export async function getStoredPdf(key: string): Promise<Buffer> {
  if (!bucket) return readFile(/*turbopackIgnore: true*/ diskPath(key));
  try {
    const object = await client().send(new GetObjectCommand({ Bucket: bucket, Key: objectKey(key) }));
    if (!object.Body) throw new Error("Arquivo não encontrado.");
    return Buffer.from(await object.Body.transformToByteArray());
  } catch { throw new Error("Arquivo não encontrado."); }
}
export async function removeStoredPdf(key: string) {
  if (!bucket) { await unlink(diskPath(key)).catch(() => undefined); return; }
  await client().send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey(key) })).catch(() => undefined);
}
/** Informa ao health check qual armazenamento está em uso. */
export function storageDriver() { return bucket ? "s3" : "disk"; }
