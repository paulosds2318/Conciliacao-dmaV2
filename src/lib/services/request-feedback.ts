/** Mensagem exibida ao atendente após enviar, reabrir ou reanalisar uma solicitação, conforme o status resultante. */
export type SubmissionKind = "created" | "corrected" | "retried";

const prefixes: Record<SubmissionKind, string> = {
  created: "Solicitação enviada.",
  corrected: "Correção enviada.",
  retried: "Nova análise concluída.",
};

const outcomes: Record<string, string> = {
  PENDING_REVIEW: "Os documentos conferem e a solicitação está aguardando aprovação do administrador.",
  COMPLETED: "Os documentos conferem e a solicitação foi aprovada automaticamente. A ação foi concluída no Coral.",
  EXECUTING: "Os documentos conferem e a solicitação foi aprovada automaticamente. A ação está sendo executada no Coral.",
  EXECUTION_FAILED:
    "Os documentos conferem e a solicitação foi aprovada automaticamente, mas o Coral recusou a ação. Consulte o detalhe no histórico.",
  EXECUTION_UNCERTAIN:
    "Os documentos conferem e a solicitação foi aprovada automaticamente, mas o Coral não confirmou o resultado. Não reenvie; avise o administrador.",
  REJECTED: "A análise automática encontrou divergências e recusou a solicitação. Consulte o motivo, corrija os documentos e reabra.",
  ANALYSIS_FAILED: "A análise automática não foi concluída. Consulte o detalhe e tente novamente.",
};

/** Com os motivos da recusa automática, a mensagem já diz o que divergiu (até 3 motivos; os demais ficam na tela). */
export function submissionFeedback(kind: SubmissionKind, status: string | undefined, rejectionReasons: string[] = []) {
  if (status === "REJECTED" && rejectionReasons.length) {
    const hidden = rejectionReasons.length - 3;
    return `${prefixes[kind]} A análise automática recusou a solicitação. ${rejectionReasons.slice(0, 3).join(" ")}${
      hidden > 0 ? ` E mais ${hidden} ${hidden === 1 ? "motivo" : "motivos"}.` : ""
    } Corrija os documentos e reabra.`;
  }
  return `${prefixes[kind]} ${(status && outcomes[status]) || "A solicitação foi atualizada; confira o status abaixo."}`;
}

/** A análise roda em segundo plano: quem envia guarda o tipo de envio aqui e o detalhe mostra a mensagem quando a análise termina. */
export const feedbackFlashKey = (requestId: string) => `dma:solicitacao-enviada:${requestId}`;
export function isSubmissionKind(value: string | null): value is SubmissionKind {
  return value === "created" || value === "corrected" || value === "retried";
}
/** Status em que o processamento ainda não terminou; a tela de detalhe se atualiza sozinha enquanto durarem. */
export const PROCESSING_STATUSES = ["ANALYZING", "EXECUTING"];
