/** Storage deve manter os PDFs privados e devolver somente chaves internas. */
export type StoredDocument = { storageKey: string; sha256: string; sizeBytes: number };
export interface PrivateDocumentStorage {
  put(requestId: string, kind: "VOUCHER" | "CONTRACT", file: Uint8Array): Promise<StoredDocument>;
  get(storageKey: string): Promise<Uint8Array>;
  remove(storageKey: string): Promise<void>;
}