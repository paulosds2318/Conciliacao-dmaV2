import type { DocumentComparison } from "@/lib/integrations/openrouter";

export async function comparePdfs(voucher: Uint8Array, contract: Uint8Array): Promise<DocumentComparison> {
  const key = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL;
  if (!key || !model) throw new Error("Configure OPENROUTER_API_KEY e OPENROUTER_MODEL para análise documental.");
  const toData = (bytes: Uint8Array) => `data:application/pdf;base64,${Buffer.from(bytes).toString("base64")}`;
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "HTTP-Referer": process.env.BETTER_AUTH_URL || "http://localhost:3000", "X-Title": "Conciliação DMA" }, body: JSON.stringify({ model, temperature: 0, max_tokens: 1200, messages: [{ role: "system", content: "Compare o voucher e o contrato PDF anexados. Extraia contrato, cliente, valores e datas relevantes. Determine se o voucher pertence ao contrato. Não invente dados. Responda exclusivamente JSON: {matches:boolean|null,confidence:number|null,fields:[{name,voucherValue,contractValue,match:boolean|null,evidence}],summary:string}. matches deve ser null se os documentos não permitirem conclusão. Esta análise apoia o administrador e nunca aprova a solicitação." }, { role: "user", content: [{ type: "text", text: "Primeiro arquivo: voucher. Segundo arquivo: contrato. Compare os dados." }, { type: "file", file: { filename: "voucher.pdf", file_data: toData(voucher) } }, { type: "file", file: { filename: "contrato.pdf", file_data: toData(contract) } }] }] }), signal: AbortSignal.timeout(120000), cache: "no-store" });
  if (!response.ok) throw new Error(`OpenRouter respondeu com HTTP ${response.status}.`);
  const body = await response.json() as { choices?: Array<{ message?: { content?: string | Array<{ text?: string }> } }> };
  const content = body.choices?.[0]?.message?.content;
  const text = typeof content === "string" ? content : content?.map((p) => p.text || "").join("") || "";
  const json = JSON.parse(text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")) as DocumentComparison;
  if (!Array.isArray(json.fields) || typeof json.summary !== "string") throw new Error("OpenRouter retornou uma análise em formato inválido.");
  return { matches: typeof json.matches === "boolean" ? json.matches : null, confidence: typeof json.confidence === "number" ? Math.max(0, Math.min(1, json.confidence)) : null, fields: json.fields, summary: json.summary };
}
