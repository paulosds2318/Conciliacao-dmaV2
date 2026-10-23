import type { DmaAction } from "@/lib/integrations/coral";

export type ContractMatch = { number: string; id: string | null; displayName: string; raw: unknown };
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
  const username = process.env.CORAL_USERNAME;
  const password = process.env.CORAL_PASSWORD;
  if (!username || !password) throw new Error("Configure CORAL_USERNAME e CORAL_PASSWORD para acessar o Coral.");
  if (username.includes(":")) throw new Error("CORAL_USERNAME não pode conter dois-pontos na autenticação Basic.");
  return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
}
export async function lookupContract(number: string): Promise<ContractMatch | null> {
  if (process.env.MODO_TESTE_API === "true") return { number, id: number, displayName: `Contrato ${number} (simulação)`, raw: { simulated: true } };
  const template = process.env.CORAL_CONTRACT_LOOKUP_URL || "https://servicescoral.aluguefoco.com.br/api/rentagreement/{CONTRATO}";
  const url = template.replace("{CONTRATO}", encodeURIComponent(number));
  const response = await fetch(url, { headers: { Accept: "application/json", Authorization: coralAuthorization() }, signal: AbortSignal.timeout(15000), cache: "no-store" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Coral respondeu com HTTP ${response.status}.`);
  const body: unknown = await response.json();
  const rows = candidates(body);
  const row = rows.find((x) => field(x, ["contrato", "contractNumber", "number", "numero", "rentAgreementNumber", "id"]).toLowerCase() === number.toLowerCase()) ?? rows[0];
  if (!row || (rows.length === 1 && row.success === false)) return null;
  return { number: field(row, ["contrato", "contractNumber", "number", "numero", "rentAgreementNumber"]) || number, id: field(row, ["id", "contractId", "rentAgreementId"]) || null, displayName: field(row, ["nome", "name", "cliente", "customerName"]) || `Contrato ${number}`, raw: row };
}
export async function applyDmaAction(contractNumber: string, action: DmaAction) {
  if (process.env.MODO_TESTE_API === "true") return { status: "SIMULATED", response: { simulated: true } };
  const url = process.env.CORAL_API_URL;
  if (!url) throw Object.assign(new Error("CORAL_API_URL não configurada."), { uncertain: false });
  const consider = action === "CONSIDERAR_DMA";
  const authorization = coralAuthorization();
  try {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: authorization }, body: JSON.stringify({ contrato: contractNumber, considerar_dma: consider, desconsiderar_dma: !consider }), signal: AbortSignal.timeout(20000), cache: "no-store" });
    const responseBody = await response.text();
    if (response.ok) return { status: "SUCCEEDED", response: { httpStatus: response.status, body: responseBody.slice(0, 4000) } };
    throw Object.assign(new Error(`Coral respondeu com HTTP ${response.status}.`), { uncertain: response.status >= 500, response: { httpStatus: response.status, body: responseBody.slice(0, 4000) } });
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