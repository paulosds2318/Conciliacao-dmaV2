import type { DocumentComparison, DocumentIdentity } from "@/lib/integrations/openrouter";

type JsonObject = Record<string, unknown>;
function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}
function readText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (!text || ["nao informado", "nao identificado", "nao localizado", "ilegivel", "indisponivel", "null", "n/a"].includes(normalized)) return null;
  return text;
}
function normalizeName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
function normalizeCpf(value: string) { return value.replace(/\D/g, ""); }
function makeIdentity(raw: unknown): DocumentIdentity {
  const root = asObject(raw);
  const voucher = asObject(root.voucher);
  const contract = asObject(root.contract);
  const voucherName = readText(voucher.name);
  const voucherCpf = readText(voucher.cpf);
  const contractName = readText(contract.name);
  const contractCpf = readText(contract.cpf);
  const voucherCpfDigits = voucherCpf ? normalizeCpf(voucherCpf) : "";
  const contractCpfDigits = contractCpf ? normalizeCpf(contractCpf) : "";
  return {
    voucher: { name: voucherName, cpf: voucherCpf },
    contract: { name: contractName, cpf: contractCpf },
    cpfMatch: voucherCpfDigits.length === 11 && contractCpfDigits.length === 11 ? voucherCpfDigits === contractCpfDigits : null,
    nameMatch: voucherName && contractName ? normalizeName(voucherName) === normalizeName(contractName) : null,
  };
}

export async function comparePdfs(voucher: Uint8Array, contract: Uint8Array): Promise<DocumentComparison> {
  const key = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL;
  if (!key || !model) throw new Error("Configure OPENROUTER_API_KEY e OPENROUTER_MODEL para analise documental.");
  const toData = (bytes: Uint8Array) => `data:application/pdf;base64,${Buffer.from(bytes).toString("base64")}`;
  const systemPrompt = [
    "Analise os PDFs anexados: primeiro o voucher, depois o contrato de locacao.",
    "Localize especificamente o nome completo do cliente/locatario principal e o CPF dessa mesma pessoa em cada documento.",
    "No contrato, nao confunda o cliente/locatario principal com condutor adicional, fiador, atendente ou empresa. No voucher, identifique o titular/cliente associado a reserva.",
    "Copie o CPF exatamente como aparece, mantendo pontuacao quando houver. Nao invente, complete nem deduza nomes ou CPFs. Se estiver ausente, cortado ou ilegivel, retorne null.",
    "Compare os CPFs e os nomes, sem ignorar divergencias. Retorne somente JSON valido neste formato: {matches:boolean|null,confidence:number|null,identity:{voucher:{name:string|null,cpf:string|null},contract:{name:string|null,cpf:string|null}},fields:[{name:string,voucherValue:string|null,contractValue:string|null,match:boolean|null,evidence:string}],summary:string}.",
    "Inclua em fields as linhas CPF do cliente e Nome completo do cliente. matches deve ser null se os documentos nao permitirem conclusao. A IA nao aprova a acao; a decisao final continua sendo do administrador.",
  ].join(" ");
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "HTTP-Referer": process.env.BETTER_AUTH_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:3000", "X-Title": "Conciliacao DMA" },
    body: JSON.stringify({ model, temperature: 0, max_tokens: 1600, messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: [{ type: "text", text: "Leia os dados de identidade do cliente nos dois arquivos e cruze voucher com contrato." }, { type: "file", file: { filename: "voucher.pdf", file_data: toData(voucher) } }, { type: "file", file: { filename: "contrato.pdf", file_data: toData(contract) } }] },
    ] }),
    signal: AbortSignal.timeout(120000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`OpenRouter respondeu com HTTP ${response.status}.`);
  const body = await response.json() as { choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }> };
  const content = body.choices?.[0]?.message?.content;
  const text = typeof content === "string" ? content : content?.map((part) => part.text || "").join("") || "";
  const json = asObject(JSON.parse(text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")));
  if (typeof json.summary !== "string") throw new Error("OpenRouter retornou uma analise em formato invalido.");

  const identity = makeIdentity(json.identity);
  const suppliedFields = Array.isArray(json.fields) ? json.fields.map(asObject) : [];
  const otherFields = suppliedFields.flatMap((field) => {
    if (typeof field.name !== "string" || /cpf|nome.*cliente/i.test(field.name)) return [];
    return [{ name: field.name, voucherValue: readText(field.voucherValue) || undefined, contractValue: readText(field.contractValue) || undefined, match: typeof field.match === "boolean" ? field.match : null, evidence: readText(field.evidence) || undefined }];
  });
  const fields: DocumentComparison["fields"] = [
    { name: "CPF do cliente", voucherValue: identity.voucher.cpf || undefined, contractValue: identity.contract.cpf || undefined, match: identity.cpfMatch },
    { name: "Nome completo do cliente", voucherValue: identity.voucher.name || undefined, contractValue: identity.contract.name || undefined, match: identity.nameMatch },
    ...otherFields,
  ];
  return {
    matches: typeof json.matches === "boolean" ? json.matches : null,
    confidence: typeof json.confidence === "number" ? Math.max(0, Math.min(1, json.confidence)) : null,
    identity,
    fields,
    summary: json.summary,
  };
}
