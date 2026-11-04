import type { DmaAction } from "@/lib/integrations/coral";
import { parseStoreCode, type StoreCode } from "@/lib/stores";
import { coralAuth, CoralAuthError, hasCoralCredentials } from "@/lib/server/coral-auth";

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
      const nested = STORE_KEY.test(key)
        ? Object.values(value as Record<string, unknown>)
            .map(parseStoreCode)
            .find(Boolean)
        : null;
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
function field(row: Record<string, unknown>, keys: string[]) {
  for (const k of keys) if (row[k] !== undefined && row[k] !== null) return String(row[k]);
  return "";
}
type CoralResponse = { status: number; ok: boolean; text: string; body: unknown };
/**
 * Chamada autenticada ao Coral. Um 401 vem do gate, antes do handler: a requisição não foi executada,
 * então renova o token e repete uma vez (vale também para o PUT de elegibilidade).
 */
async function coralFetch(url: string, init: { method?: string; body?: string; timeoutMs: number }): Promise<CoralResponse> {
  const send = async (token: string): Promise<CoralResponse> => {
    const response = await fetch(url, {
      method: init.method ?? "GET",
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${token}`,
      },
      body: init.body,
      signal: AbortSignal.timeout(init.timeoutMs),
      cache: "no-store",
    });
    const text = await response.text();
    let body: unknown = null;
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      /* resposta sem JSON */
    }
    if (body && typeof body === "object") coralAuth.adopt((body as Record<string, unknown>).token);
    return { status: response.status, ok: response.ok, text, body };
  };
  let token = await coralAuth.getToken();
  let result = await send(token);
  if (result.status === 401) {
    coralAuth.invalidate(token);
    token = await coralAuth.getToken();
    result = await send(token);
  }
  if (result.status === 401) {
    console.error(`[coral] ${init.method ?? "GET"} ${new URL(url).pathname} recusado com 401 mesmo após renovar o token.`);
    throw new CoralAuthError(
      "UNAUTHORIZED",
      "O Coral recusou a autenticação do Conciliação DMA. Avise o suporte para conferir o usuário de serviço.",
    );
  }
  return result;
}
const CORAL_UNAVAILABLE =
  "Não foi possível falar com o Coral agora (sem resposta ou fora do ar). Tente novamente em instantes; se continuar, avise o administrador.";
export async function lookupContract(number: string): Promise<ContractMatch | null> {
  if (process.env.MODO_TESTE_API === "true" && !hasCoralCredentials())
    return { number, id: number, displayName: `Contrato ${number} (simulacao)`, store: null, raw: { simulated: true } };
  const template = process.env.CORAL_CONTRACT_LOOKUP_URL || "https://servicescoral.aluguefoco.com.br/api/rentagreement/{CONTRATO}";
  const url = template.replace("{CONTRATO}", encodeURIComponent(number));
  let response: CoralResponse;
  try {
    response = await coralFetch(url, { timeoutMs: 15000 });
  } catch (error) {
    if (error instanceof CoralAuthError && error.kind !== "UNAVAILABLE") throw error;
    throw new Error(CORAL_UNAVAILABLE);
  }
  if (response.status === 404) return null;
  // Falta de permissão não é problema do contrato (o gate responde 406; 403 mantido por segurança).
  if (response.status === 406 || response.status === 403) {
    console.error(
      `[coral] consulta de contrato recusada com HTTP ${response.status}: o usuário de serviço não tem permissão de leitura de contratos.`,
    );
    throw Object.assign(
      new Error(
        "O usuário de serviço do Coral não tem permissão para consultar contratos. Avise o administrador; o contrato não foi verificado.",
      ),
      { uncertain: false },
    );
  }
  // O Coral responde HTTP 500 para contratos inexistentes, então 5xx continua apontando primeiro para o número.
  if (response.status >= 500)
    throw new Error(
      "Não encontramos esse contrato no Coral. Confira o número informado; se ele estiver certo e o erro persistir, avise o administrador.",
    );
  if (!response.ok) throw new Error(`O Coral recusou a consulta (HTTP ${response.status}). Avise o administrador.`);
  const body = response.body;
  const rows = candidates(body);
  const row =
    rows.find(
      (x) =>
        field(x, ["contrato", "contractNumber", "number", "numero", "rentAgreementNumber", "id"]).toLowerCase() === number.toLowerCase(),
    ) ?? rows[0];
  if (!row || (rows.length === 1 && row.success === false)) return null;
  return {
    number: field(row, ["contrato", "contractNumber", "number", "numero", "rentAgreementNumber"]) || number,
    id: field(row, ["id", "contractId", "rentAgreementId"]) || null,
    displayName: field(row, ["nome", "name", "cliente", "customerName"]) || `Contrato ${number}`,
    store: findContractStore(row),
    raw: row,
  };
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
  if (!rentAgreementId.trim())
    throw Object.assign(new Error("O Coral não forneceu o identificador interno do contrato."), { uncertain: false });

  const url = dmaEligibilityUrl();
  const payload = {
    action: action === "CONSIDERAR_DMA" ? "REGARD" : "DISREGARD",
    rentAgreementIds: [rentAgreementId.trim()],
  };

  try {
    const response = await coralFetch(url, { method: "PUT", body: JSON.stringify(payload), timeoutMs: 20000 });
    const responseText = response.text;
    const responseBody: unknown = response.body ?? {};
    const envelope = responseBody && typeof responseBody === "object" ? (responseBody as Record<string, unknown>) : {};
    const body =
      envelope.data && typeof envelope.data === "object" ? (envelope.data as DmaEligibilityResponse) : (envelope as DmaEligibilityResponse);
    const responseData = { httpStatus: response.status, body: responseBody };

    if (!response.ok) {
      // O gate do Coral responde 406 quando falta a permissão da rota (403 mantido por segurança).
      const message =
        response.status === 406 || response.status === 403
          ? "O usuário de serviço do Coral não tem a permissão BULK_UPDATE_DMA_ELIGIBILITY. A ação não foi aplicada; avise o administrador."
          : response.status === 400 && /token/i.test(responseText)
            ? "O Coral não recebeu a autenticação do Conciliação DMA. A ação não foi aplicada; avise o administrador."
            : `O Coral respondeu com HTTP ${response.status}.`;
      throw Object.assign(new Error(message), { uncertain: response.status >= 500, response: responseData });
    }

    if (body.updated === 1) return { status: "SUCCEEDED", response: responseData };

    const matchingError = body.errors?.find(
      (entry) => entry.rentAgreementId?.trim().toLowerCase() === rentAgreementId.trim().toLowerCase(),
    );
    const reason = matchingError?.reason;
    const message =
      reason === "NOT_FOUND" || (body.notFound ?? 0) > 0
        ? "O contrato não foi localizado no Coral. Confira o contrato e tente novamente."
        : reason === "INVALID_CODE" || (body.invalid ?? 0) > 0
          ? "O identificador do contrato foi recusado pelo Coral. Confira os dados do contrato."
          : reason === "UPDATE_FAILED" || (body.failed ?? 0) > 0
            ? "O Coral não conseguiu atualizar a situação DMA deste contrato."
            : "O Coral não confirmou a atualização da situação DMA.";
    throw Object.assign(new Error(message), { uncertain: false, response: responseData });
  } catch (error) {
    if (error instanceof Error && "uncertain" in error) throw error;
    throw Object.assign(
      new Error("Não foi possível confirmar a resposta do Coral. A execução pode ter sido realizada; não tente novamente automaticamente."),
      { uncertain: true },
    );
  }
}

export type DmaCurrentStatus = "CONSIDERAR" | "DESCONSIDERAR" | "UNKNOWN";
export function extractDmaCurrentStatus(payload: unknown): { status: DmaCurrentStatus; sourceField: string | null } {
  let considerarFlag: boolean | null = null;
  let desconsiderarFlag: boolean | null = null;
  let flagSource = "considerar_dma/desconsiderar_dma";
  let explicit: { status: DmaCurrentStatus; sourceField: string } | null = null;
  const keyNorm = (key: string) =>
    key
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  const valueNorm = (value: unknown) =>
    String(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
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
    if (["DESCONSIDERAR", "DESCONSIDERADO", "DESCONSIDERADA", "DESCONSIDERARDMA", "DESCONSIDERADMA"].includes(normalized))
      return "DESCONSIDERAR";
    if (["CONSIDERAR", "CONSIDERADO", "CONSIDERADA", "CONSIDERARDMA", "CONSIDERADMA"].includes(normalized)) return "CONSIDERAR";
    return null;
  };
  const walk = (value: unknown, path: string, depth: number) => {
    if (!value || typeof value !== "object" || depth > 8 || explicit) return;
    if (Array.isArray(value)) {
      value.forEach((entry, index) => walk(entry, `${path}[${index}]`, depth + 1));
      return;
    }
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const normalized = keyNorm(key);
      const source = path ? `${path}.${key}` : key;
      if (["considerardma", "considerar", "dmaconsiderado", "consideradma"].includes(normalized)) {
        const flag = booleanValue(child);
        if (flag !== null) {
          considerarFlag = flag;
          flagSource = source;
        } else {
          const status = explicitValue(child);
          if (status) explicit = { status, sourceField: source };
        }
      } else if (["desconsiderardma", "desconsiderar", "dmadesconsiderado", "desconsideradma"].includes(normalized)) {
        const flag = booleanValue(child);
        if (flag !== null) {
          desconsiderarFlag = flag;
          flagSource = source;
        } else {
          const status = explicitValue(child);
          if (status) explicit = { status, sourceField: source };
        }
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
