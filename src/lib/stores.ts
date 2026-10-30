/**
 * Lojas com contratos ativos. O número do contrato começa com as 3 letras da loja
 * (ex.: FOR024159-26 → FOR10); o contrato informa a loja completa (ex.: "Loja: SAO11").
 */
export const STORES = [
  "AJU10", "BPS10", "CGR10", "CNF10", "CWB10", "FLN10", "FOR10", "GIG10", "GYN10", "JPA10", "MCZ10", "NAT10",
  "NVT10", "POA10", "QNS10", "RAO10", "REC20", "SAO10", "SAO11", "SDU10", "SSA10", "VCP10", "VIX10",
] as const;
export type StoreCode = typeof STORES[number];

const STORE_PATTERN = /\b([A-Z]{3}\d{2})\b/;

/** Lojas possíveis para o contrato pelo prefixo de 3 letras. SAO pode ser SAO10 ou SAO11. */
export function contractStores(contractNumber: string): StoreCode[] {
  const prefix = contractNumber.trim().toUpperCase().match(/^[A-Z]{3}/)?.[0];
  return prefix ? STORES.filter((store) => store.startsWith(prefix)) : [];
}

/** Interpreta um código de loja informado pelo Coral (ex.: "SAO11 - São Paulo"). */
export function parseStoreCode(value: unknown): StoreCode | null {
  if (typeof value !== "string") return null;
  const code = value.toUpperCase().match(STORE_PATTERN)?.[1];
  return STORES.find((store) => store === code) ?? null;
}

/** Mantém somente siglas válidas, sem repetição e na ordem da lista oficial. */
export function sanitizeStores(value: unknown): StoreCode[] {
  if (!Array.isArray(value)) return [];
  const requested = new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim().toUpperCase()));
  return STORES.filter((store) => requested.has(store));
}

/**
 * Mensagem de bloqueio quando o contrato não pertence às lojas do usuário; null quando o acesso é permitido.
 * Com a loja exata do contrato (vinda do Coral) a regra é estrita; sem ela, vale o prefixo do número.
 */
export function contractAccessError(stores: readonly string[], contractNumber: string, exactStore?: string | null): string | null {
  const number = contractNumber.trim();
  if (!stores.length) return "Seu usuário não está vinculado a nenhuma loja. Peça ao administrador para definir suas lojas.";
  const candidates: string[] = exactStore ? [exactStore] : contractStores(number);
  if (!candidates.length) return `O contrato ${number} não pertence a uma loja cadastrada. Confira o número informado.`;
  if (candidates.some((store) => stores.includes(store))) return null;
  return `O contrato ${number} é da loja ${candidates.join(" ou ")}. Você só pode consultar contratos de: ${stores.join(", ")}.`;
}
