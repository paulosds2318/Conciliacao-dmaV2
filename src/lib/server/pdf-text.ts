import { extractText, getDocumentProxy } from "unpdf";
import { detectDocumentType } from "@/lib/document-types";

/** Texto do PDF, ou null para imagens, PDFs escaneados sem texto ou arquivos que não puderam ser lidos. */
export async function extractPdfText(bytes: Uint8Array): Promise<string | null> {
  if (detectDocumentType(bytes) !== "application/pdf") return null;
  try {
    // getDocumentProxy pode consumir o buffer; a cópia preserva os bytes enviados depois à IA.
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: true });
    return text.replace(/\s/g, "").length >= 200 ? text : null;
  } catch {
    return null;
  }
}
