/** Regras dos anexos que valem no navegador (aviso na hora) e no servidor (que garante a regra). */

export const CONTRACT_PDF_ONLY_MESSAGE =
  "O contrato deve ser enviado em PDF. Anexe o PDF original do contrato de locação da Foco, e não uma foto ou imagem.";

/** O arquivo é um PDF pelo tipo informado ou pela extensão. A conferência definitiva, pelo conteúdo, é feita no servidor. */
export function looksLikePdf(file: { name: string; type: string }) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}
