export type DocumentRemovalRecord = { kind: string; fileName: string; confirmed: true };

export function parseDocumentRemovalHistory(value: FormDataEntryValue | null): DocumentRemovalRecord[] {
  if (typeof value !== "string" || value.length > 20000) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, 12).flatMap((entry): DocumentRemovalRecord[] => {
      if (!entry || typeof entry !== "object") return [];
      const record = entry as Record<string, unknown>;
      if (typeof record.kind !== "string" || typeof record.fileName !== "string" || record.confirmed !== true) return [];
      const kind = record.kind.slice(0, 40);
      if (!["VOUCHER", "CONTRACT"].includes(kind)) return [];
      return [{ kind, fileName: record.fileName.slice(0, 255), confirmed: true }];
    });
  } catch {
    return [];
  }
}
