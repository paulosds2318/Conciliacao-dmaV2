import type { DmaAction } from "@/lib/integrations/coral";
import { parseStoreCode, type StoreCode } from "@/lib/stores";

export type ContractMatch = { number: string; id: string | null; displayName: string; store: StoreCode | null; raw: unknown };
const STORE_KEY = /loja|store|branch|filial|agencia|agency|pickup|retirada/i;
/** Procura a loja do contrato nos campos de loja/filial/retirada da resposta do Coral (até 2 níveis). */
function findContractStore(row: Record<string, unknown>, depth = 0): StoreCode | null {
  for (const [key, value] of Object.entries(row)) {
    if (STORE_KEY.test(key)) {
      const direct = parseStoreCode(value);
      if (direct) return direct;
    }
    if (depth < 2 && value && typeof value === "object" && !Array.isArray(value)) {
      const nested = STORE_KEY.test(key) ? Object.values(value as Record<string, unknown>).map(parseStoreCode).find(Boolean) : null;
      const found = nested ?? findContractStore(value as Record<string, unknown>, depth + 1);
      if (found) return found;
    }
  }
  return null;
}
function candidates(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) return data.filter((x): x is Record<string, unknown> => !!x && typeof x === "object");
  if (!data || typeof data !== "object") return [];
  const obj = data as Record<string, unknown>;
  for (const k of ["data", "content", "result", "results", "contratos", "contracts"]) if (Array.isArray(obj[k])) return candidates(obj[k]);
  if (obj.data && typeof obj.data === "object") return candidates(obj.data);
  return [obj];
}
function field(row: Record<string, unknown>, keys: string[]) { for (const k of keys) if (row[k] !== undefined && row[k] !== null) return String(row[k]); return ""; }
function coralAuthorization() {
  const token = process.env.CORAL_AUTH_TOKEN?.trim();
  if (token) return /^Bearer\s/i.test(token) ? token : `Bearer ${token}`;
  const username = process.env.CORAL_USERNAME;
  const password = process.env.CORAL_PASSWORD;
  if (!username || !password) throw new Error("Configure CORAL_AUTH_TOKEN ou CORAL_USERNAME/CORAL_PASSWORD para acessar o Coral.");
  if (username.includes(":")) throw new Error("CORAL_USERNAME nao pode conter dois-pontos na autenticacao Basic.");
  return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
}
export async function lookupContract(number: string): Promise<ContractMatch | null> {
  if (process.env.MODO_TESTE_API === "true" && !process.env.CORAL_AUTH_TOKEN?.trim()) return { number, id: number, displayName: `Contrato ${number} (simulacao)`, store: null, raw: { simulated: true } };
  const template = process.env.CORAL_CONTRACT_LOOKUP_URL || "https://servicescoral.aluguefoco.com.br/api/rentagreement/{CONTRATO}";
  const url = template.replace("{CONTRATO}", encodeURIComponent(number));
  const response = await fetch(url, { headers: { Accept: "application/json", Authorization: coralAuthorization() }, signal: AbortSignal.timeout(15000), cache: "no-store" });
  if (response.status === 404) return null;
  if (response.status === 401 || response.status === 403) throw new Error("N\u00e3o encontramos esse contrato no Coral. Confira o n\u00famero informado ou confirme se ele existe.");
  if (!response.ok) throw new Error("N\u00e3o encontramos esse contrato no Coral. Confira o n\u00famero informado ou confirme se ele existe.");
  const body: unknown = await response.json();
  const rows = candidates(body);
  const row = rows.find((x) => field(x, ["contrato", "contractNumber", "number", "numero", "rentAgreementNumber", "id"]).toLowerCase() === number.toLowerCase()) ?? rows[0];
  if (!row || (rows.length === 1 && row.success === false)) return null;
  return { number: field(row, ["contrato", "contractNumber", "number", "numero", "rentAgreementNumber"]) || number, id: field(row, ["id", "contractId", "rentAgreementId"]) || null, displayName: field(row, ["nome", "name", "cliente", "customerName"]) || `Contrato ${number}`, store: findContractStore(row), raw: row };
}
export async function applyDmaAction(contractNumber: string, action: DmaAction) {
  if (process.env.MODO_TESTE_API === "true") return { status: "SIMULATED", response: { simulated: true } };
  const contract = await lookupContract(contractNumber);
  if (!contract) throw Object.assign(new Error("O contrato não foi localizado no Coral."), { uncertain: false });
  if (!contract.id) throw Object.assign(new Error("O Coral não retornou o identificador interno deste contrato."), { uncertain: false });
  return applyDmaEligibility(contract.id, action);
}

type DmaEligibilityResponse = {
  action?: string;
  received?: number;
  updated?: number;
  notFound?: number;
  invalid?: number;
  duplicated?: number;
  failed?: number;
  updatedIds?: string[];
  errors?: Array<{ rentAgreementId?: string; reason?: string }>;
};

function dmaEligibilityUrl() {
  const configuredUrl = process.env.CORAL_DMA_ELIGIBILITY_URL?.trim() || process.env.CORAL_API_URL?.trim();
  if (configuredUrl) return configuredUrl;
  const lookupTemplate = process.env.CORAL_CONTRACT_LOOKUP_URL || "https://servicescoral.aluguefoco.com.br/api/rentagreement/{CONTRATO}";
  try {
    return new URL("/api/rentagreement/dma/eligibility", new URL(lookupTemplate.replace("{CONTRATO}", "contract-id")).origin).toString();
  } catch {
    throw Object.assign(new Error("Configure uma URL válida para a integração de ações DMA do Coral."), { uncertain: false });
  }
}

export async function applyDmaEligibility(rentAgreementId: string, action: DmaAction) {
  if (process.env.MODO_TESTE_API === "true") return { status: "SIMULATED", response: { simulated: true } };
  if (!rentAgreementId.trim()) throw Object.assign(new Error("O Coral não forneceu o identificador interno do contrato."), { uncertain: false });

  const token = process.env.CORAL_AUTH_TOKEN?.trim();
  if (!token) throw Object.assign(new Error("Configure o token de autenticação do Coral para executar ações DMA."), { uncertain: false });
  const authorization = /^Bearer\s/i.test(token) ? token : `Bearer ${token}`;
  const url = dmaEligibilityUrl();
  const payload = {
    action: action === "CONSIDERAR_DMA" ? "REGARD" : "DISREGARD",
    rentAgreementIds: [rentAgreementId.trim()],
  };

  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: authorization },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000),
      cache: "no-store",
    });
    const responseText = await response.text();
    let responseBody: unknown = {};
    try { responseBody = JSON.parse(responseText) as unknown; } catch { /* preserve the Coral response below */ }
    const envelope = responseBody && typeof responseBody === "object" ? responseBody as Record<string, unknown> : {};
    const body = envelope.data && typeof envelope.data === "object" ? envelope.data as DmaEligibilityResponse : envelope as DmaEligibilityResponse;
    const responseData = { httpStatus: response.status, body: responseBody };

    if (!response.ok) {
      const message = response.status === 403
        ? "O Coral recusou a ação. Verifique se o usuário tem a permissão BULK_UPDATE_DMA_ELIGIBILITY."
        : response.status === 400 && /access token/i.test(responseText)
          ? "A autenticação do Coral expirou ou está ausente. Renove o token e tente novamente."
          : `O Coral respondeu com HTTP ${response.status}.`;
      throw Object.assign(new Error(message), { uncertain: response.status >= 500, response: responseData });
    }

    if (body.updated === 1) return { status: "SUCCEEDED", response: responseData };

    const matchingError = body.errors?.find((entry) => entry.rentAgreementId?.trim().toLowerCase() === rentAgreementId.trim().toLowerCase());
    const reason = matchingError?.reason;
    const message = reason === "NOT_FOUND" || (body.notFound ?? 0) > 0
      ? "O contrato não foi localizado no Coral. Confira o contrato e tente novamente."
      : reason === "INVALID_CODE" || (body.invalid ?? 0) > 0
        ? "O identificador do contrato foi recusado pelo Coral. Confira os dados do contrato."
        : reason === "UPDATE_FAILED" || (body.failed ?? 0) > 0
          ? "O Coral não conseguiu atualizar a situação DMA deste contrato."
          : "O Coral não confirmou a atualização da situação DMA.";
    throw Object.assign(new Error(message), { uncertain: false, response: responseData });
  } catch (error) {
    if (error instanceof Error && "uncertain" in error) throw error;
    throw Object.assign(new Error("Não foi possível confirmar a resposta do Coral. A execução pode ter sido realizada; não tente novamente automaticamente."), { uncertain: true });
  }
}

export type DmaCurrentStatus = "CONSIDERAR" | "DESCONSIDERAR" | "UNKNOWN";
export function extractDmaCurrentStatus(payload: unknown): { status: DmaCurrentStatus; sourceField: string | null } {
  let considerarFlag: boolean | null = null;
  let desconsiderarFlag: boolean | null = null;
  let flagSource = "considerar_dma/desconsiderar_dma";
  let explicit: { status: DmaCurrentStatus; sourceField: string } | null = null;
  const keyNorm = (key: string) => key.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const valueNorm = (value: unknown) => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const booleanValue = (value: unknown): boolean | null => {
    if (typeof value === "boolean") return value;
    if (typeof value === "number" && (value === 0 || value === 1)) return value === 1;
    const normalized = valueNorm(value);
    if (["TRUE", "1", "SIM", "S", "YES", "Y"].includes(normalized)) return true;
    if (["FALSE", "0", "NAO", "N", "NO"].includes(normalized)) return false;
    return null;
  };
  const explicitValue = (value: unknown): DmaCurrentStatus | null => {
    const normalized = valueNorm(value);
    if (["DESCONSIDERAR", "DESCONSIDERADO", "DESCONSIDERADA", "DESCONSIDERARDMA", "DESCONSIDERADMA"].includes(normalized)) return "DESCONSIDERAR";
    if (["CONSIDERAR", "CONSIDERADO", "CONSIDERADA", "CONSIDERARDMA", "CONSIDERADMA"].includes(normalized)) return "CONSIDERAR";
    return null;
  };
  const walk = (value: unknown, path: string, depth: number) => {
    if (!value || typeof value !== "object" || depth > 8 || explicit) return;
    if (Array.isArray(value)) { value.forEach((entry, index) => walk(entry, `${path}[${index}]`, depth + 1)); return; }
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const normalized = keyNorm(key);
      const source = path ? `${path}.${key}` : key;
      if (["considerardma", "considerar", "dmaconsiderado", "consideradma"].includes(normalized)) {
        const flag = booleanValue(child);
        if (flag !== null) { considerarFlag = flag; flagSource = source; }
        else { const status = explicitValue(child); if (status) explicit = { status, sourceField: source }; }
      } else if (["desconsiderardma", "desconsiderar", "dmadesconsiderado", "desconsideradma"].includes(normalized)) {
        const flag = booleanValue(child);
        if (flag !== null) { desconsiderarFlag = flag; flagSource = source; }
        else { const status = explicitValue(child); if (status) explicit = { status, sourceField: source }; }
      } else if (["statusdma", "situacaodma", "acaodma", "dmaaction", "dmacurrentstatus"].includes(normalized)) {
        const status = explicitValue(child);
        if (status) explicit = { status, sourceField: source };
      }
      walk(child, source, depth + 1);
    }
  };
  walk(payload, "", 0);
  if (explicit) return explicit;
  if (considerarFlag === true && desconsiderarFlag !== true) return { status: "CONSIDERAR", sourceField: flagSource };
  if (desconsiderarFlag === true && considerarFlag !== true) return { status: "DESCONSIDERAR", sourceField: flagSource };
  return { status: "UNKNOWN", sourceField: null };
}
