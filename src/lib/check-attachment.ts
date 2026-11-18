import { CONTRACT_PDF_ONLY_MESSAGE, looksLikePdf } from "@/lib/attachment-rules";
import { SAME_FILE_MESSAGE, sameContent } from "@/lib/same-file";

/**
 * Confere o arquivo recém-escolhido (voucher ou contrato) antes do envio, com o outro campo já preenchido, se houver.
 * Devolve a mensagem do problema ou null. Se o servidor não responder, devolve null: a conferência do envio decide.
 */
export async function checkAttachment(kind: "VOUCHER" | "CONTRACT", file: File, other: File | null | undefined) {
  if (kind === "CONTRACT" && !looksLikePdf(file)) return CONTRACT_PDF_ONLY_MESSAGE;
  if (other && (await sameContent(file, other))) return SAME_FILE_MESSAGE;
  const form = new FormData();
  form.set(kind === "CONTRACT" ? "contract" : "voucher", file);
  if (other) form.set(kind === "CONTRACT" ? "voucher" : "contract", other);
  const response = await fetch("/api/requests/check-attachments", { method: "POST", body: form });
  if (!response.ok) return null;
  const data = (await response.json()) as { error?: string | null };
  return data.error || null;
}
