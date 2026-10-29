import type { DocumentComparison, DocumentIdentity } from "@/lib/integrations/openrouter";
import { detectDocumentType } from "@/lib/document-types";

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
const nameParticles = new Set(["da", "das", "de", "do", "dos", "e"]);
function nameTokens(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter((token) => token && !nameParticles.has(token));
}
export function namesIdentifySamePerson(first: string, second: string) {
  const normalizedFirst = normalizeName(first);
  const normalizedSecond = normalizeName(second);
  if (normalizedFirst === normalizedSecond) return true;
  const [shorter, longer] = normalizedFirst.length <= normalizedSecond.length
    ? [normalizedFirst, normalizedSecond]
    : [normalizedSecond, normalizedFirst];
  // OCR often joins words; accept a substantial name when it appears intact in the longer form.
  if (shorter.length >= 8 && longer.includes(shorter)) return true;
  const firstTokens = nameTokens(first);
  const secondTokens = nameTokens(second);
  const [shortTokens, longTokens] = firstTokens.length <= secondTokens.length
    ? [firstTokens, secondTokens]
    : [secondTokens, firstTokens];
  return shortTokens.length >= 2 && shortTokens.every((token) => longTokens.includes(token));
}
export function correctStoredNameComparison(raw: unknown): unknown {
  const comparison = asObject(raw);
  const identity = asObject(comparison.identity);
  const voucher = asObject(identity.voucher);
  const contract = asObject(identity.contract);
  const voucherName = readText(voucher.name);
  const contractName = readText(contract.name);
  if (!voucherName || !contractName || !Array.isArray(comparison.fields)) return raw;
  const nameMatch = namesIdentifySamePerson(voucherName, contractName);
  return {
    ...comparison,
    fields: comparison.fields.map((rawField) => {
      const field = asObject(rawField);
      const fieldName = typeof field.name === "string" ? normalizeName(field.name) : "";
      return fieldName.includes("nomecompletodocliente") ? { ...field, match: nameMatch } : rawField;
    }),
  };
}
function normalizeCpf(value: string) { return value.replace(/\D/g, ""); }
/** Ignora pontuação, espaços, caixa e zeros à esquerda ao comparar números de contrato. */
export function normalizeContractNumber(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^0+(?=\d)/, "");
}
export function contractNumbersMatch(expected: string, found: string) {
  const normalizedExpected = normalizeContractNumber(expected);
  if (!normalizedExpected) return false;
  if (normalizedExpected === normalizeContractNumber(found)) return true;
  // Aceita prefixos como "RA" no documento quando os dígitos do contrato são idênticos.
  const digits = (value: string) => value.replace(/\D/g, "").replace(/^0+/, "");
  return digits(expected).length >= 4 && digits(expected) === digits(found);
}
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
    nameMatch: voucherName && contractName ? namesIdentifySamePerson(voucherName, contractName) : null,
  };
}

export async function comparePdfs(voucher: Uint8Array | null, contract: Uint8Array, expectedContractNumber: string): Promise<DocumentComparison> {
  const key = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL;
  if (!key || !model) throw new Error("Configure OPENROUTER_API_KEY e OPENROUTER_MODEL para analise documental.");
  const toPart = (bytes: Uint8Array, filename: string) => {
    const mimeType = detectDocumentType(bytes);
    if (!mimeType) throw new Error(`Formato de arquivo nao suportado em ${filename}.`);
    const data = `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
    return mimeType === "application/pdf"
      ? { type: "file", file: { filename: `${filename}.pdf`, file_data: data } }
      : { type: "image_url", image_url: { url: data } };
  };
  const systemPrompt = [
    voucher
      ? "Analise os documentos anexados (PDF ou imagem): primeiro o voucher, depois o contrato de locacao."
      : "Analise o documento anexado (PDF ou imagem): somente o contrato de locacao foi enviado, nao ha voucher. Retorne identity.voucher com name e cpf null.",
    "No contrato de locacao, localize tambem o numero do contrato (numero do contrato, RA, rent agreement ou equivalente) e copie exatamente como aparece em contractNumber; se nao encontrar, retorne null.",
    "Localize especificamente o nome completo do cliente/locatario principal e o CPF dessa mesma pessoa em cada documento.",
    "No contrato, nao confunda o cliente/locatario principal com condutor adicional, fiador, atendente ou empresa. No voucher, identifique o titular/cliente associado a reserva.",
    "Copie o CPF exatamente como aparece, mantendo pontuacao quando houver. Nao invente, complete nem deduza nomes ou CPFs. Se estiver ausente, cortado ou ilegivel, retorne null.",
    "Compare os CPFs e os nomes, sem ignorar divergencias. Retorne somente JSON valido neste formato: {matches:boolean|null,confidence:number|null,contractNumber:string|null,identity:{voucher:{name:string|null,cpf:string|null},contract:{name:string|null,cpf:string|null}},fields:[{name:string,voucherValue:string|null,contractValue:string|null,match:boolean|null,evidence:string}],summary:string}.",
    "Inclua em fields as linhas CPF do cliente e Nome completo do cliente. Mantenha cada evidence com no maximo 150 caracteres e summary com no maximo 400 caracteres; nao transcreva trechos longos dos documentos. matches deve ser null se os documentos nao permitirem conclusao. A IA nao aprova a acao; a decisao final continua sendo do administrador.",
  ].join(" ");
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "HTTP-Referer": process.env.BETTER_AUTH_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:3000", "X-Title": "Conciliacao DMA" },
    body: JSON.stringify({ model, temperature: 0, max_tokens: 4000, messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: [{ type: "text", text: voucher ? "Leia os dados de identidade do cliente nos dois arquivos e cruze voucher com contrato." : "Leia o numero do contrato e os dados de identidade do cliente no contrato anexado." }, ...(voucher ? [toPart(voucher, "voucher")] : []), toPart(contract, "contrato")] },
    ] }),
    signal: AbortSignal.timeout(120000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`OpenRouter respondeu com HTTP ${response.status}.`);
  const body = await response.json() as { choices?: Array<{ finish_reason?: string; message?: { content?: string | Array<{ text?: string }> } }> };
  const choice = body.choices?.[0];
  const content = choice?.message?.content;
  const text = typeof content === "string" ? content : content?.map((part) => part.text || "").join("") || "";
  if (!text.trim()) throw new Error("IA_RESPOSTA_VAZIA: o OpenRouter nao retornou conteudo na analise.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
  } catch (error) {
    const detail = error instanceof Error ? error.message : "JSON invalido";
    if (choice?.finish_reason === "length") throw new Error(`IA_RESPOSTA_CORTADA: a resposta da IA ultrapassou o limite de tamanho e veio incompleta (${detail}).`);
    throw new Error(`IA_RESPOSTA_INVALIDA: a resposta da IA nao estava em JSON valido (${detail}).`);
  }
  const json = asObject(parsed);
  if (typeof json.summary !== "string") throw new Error("IA_RESPOSTA_INVALIDA: OpenRouter retornou uma analise em formato invalido.");

  const identity = makeIdentity(json.identity);
  const suppliedFields = Array.isArray(json.fields) ? json.fields.map(asObject) : [];
  const otherFields = suppliedFields.flatMap((field) => {
    if (typeof field.name !== "string" || /cpf|nome.*cliente|numero.*contrato|número.*contrato/i.test(field.name)) return [];
    return [{ name: field.name, voucherValue: readText(field.voucherValue) || undefined, contractValue: readText(field.contractValue) || undefined, match: typeof field.match === "boolean" ? field.match : null, evidence: readText(field.evidence) || undefined }];
  });
  const foundContractNumber = readText(json.contractNumber);
  const contractNumber = { expected: expectedContractNumber, found: foundContractNumber, match: foundContractNumber ? contractNumbersMatch(expectedContractNumber, foundContractNumber) : null };
  const fields: DocumentComparison["fields"] = [
    { name: `Número do contrato (Coral: ${expectedContractNumber})`, contractValue: foundContractNumber || undefined, match: contractNumber.match },
    { name: "CPF do cliente", voucherValue: identity.voucher.cpf || undefined, contractValue: identity.contract.cpf || undefined, match: identity.cpfMatch },
    { name: "Nome completo do cliente", voucherValue: identity.voucher.name || undefined, contractValue: identity.contract.name || undefined, match: identity.nameMatch },
    ...otherFields,
  ];
  return {
    matches: contractNumber.match === false ? false : typeof json.matches === "boolean" ? json.matches : null,
    contractNumber,
    confidence: typeof json.confidence === "number" ? Math.max(0, Math.min(1, json.confidence)) : null,
    identity,
    fields,
    summary: json.summary,
  };
}
