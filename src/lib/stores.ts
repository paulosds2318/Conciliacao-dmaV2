/** Lojas com contratos ativos. O número do contrato começa com a sigla da loja (ex.: SAO10123456). */
export const STORES = [
  "AJU10", "BPS10", "CGR10", "CNF10", "CWB10", "FLN10", "FOR10", "GIG10", "GYN10", "JPA10", "MCZ10", "NAT10",
  "NVT10", "POA10", "QNS10", "RAO10", "RAO1O", "REC20", "SAO10", "SAO11", "SDU10", "SSA10", "VCP10", "VIX10",
] as const;
export type StoreCode = typeof STORES[number];

function normalizeContract(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Loja dona do contrato, identificada pela sigla no início do número. */
export function contractStore(contractNumber: string): StoreCode | null {
  const normalized = normalizeContract(contractNumber);
  return STORES.find((store) => normalized.startsWith(store)) ?? null;
}

/** Mantém somente siglas válidas, sem repetição e na ordem da lista oficial. */
export function sanitizeStores(value: unknown): StoreCode[] {
  if (!Array.isArray(value)) return [];
  const requested = new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim().toUpperCase()));
  return STORES.filter((store) => requested.has(store));
}

/** Mensagem de bloqueio quando o contrato não pertence às lojas do usuário; null quando o acesso é permitido. */
export function contractAccessError(stores: readonly string[], contractNumber: string): string | null {
  if (!stores.length) return "Seu usuário não está vinculado a nenhuma loja. Peça ao administrador para definir suas lojas.";
  const store = contractStore(contractNumber);
  if (!store) return `O contrato ${contractNumber.trim()} não começa com a sigla de uma loja cadastrada. Confira o número informado.`;
  if (!stores.includes(store)) return `O contrato ${contractNumber.trim()} é da loja ${store}. Você só pode consultar contratos de: ${stores.join(", ")}.`;
  return null;
}
