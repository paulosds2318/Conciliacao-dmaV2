/** Mensagem exibida ao atendente após enviar, reabrir ou reanalisar uma solicitação, conforme o status resultante. */
export type SubmissionKind = "created" | "corrected" | "retried";

const prefixes: Record<SubmissionKind, string> = {
  created: "Solicitação enviada.",
  corrected: "Correção enviada.",
  retried: "Nova análise concluída.",
};

const outcomes: Record<string, string> = {
  PENDING_REVIEW: "Os documentos conferem e a solicitação está aguardando aprovação do administrador.",
  COMPLETED: "Os documentos conferem e a solicitação foi aprovada automaticamente (voucher Rentalcars/Rentcars). A ação foi concluída no Coral.",
  EXECUTING: "Os documentos conferem e a solicitação foi aprovada automaticamente. A ação está sendo executada no Coral.",
  EXECUTION_FAILED: "Os documentos conferem e a solicitação foi aprovada automaticamente, mas o Coral recusou a ação. Consulte o detalhe no histórico.",
  EXECUTION_UNCERTAIN: "Os documentos conferem e a solicitação foi aprovada automaticamente, mas o Coral não confirmou o resultado. Não reenvie; avise o administrador.",
  REJECTED: "A análise automática encontrou divergências e recusou a solicitação. Consulte o motivo, corrija os documentos e reabra.",
  ANALYSIS_FAILED: "A análise automática não foi concluída. Consulte o detalhe e tente novamente.",
};

export function submissionFeedback(kind: SubmissionKind, status: string | undefined) {
  return `${prefixes[kind]} ${(status && outcomes[status]) || "A solicitação foi atualizada; confira o status abaixo."}`;
}

/** O formulário de nova solicitação redireciona para o detalhe; esta marca indica que a mensagem de envio deve aparecer lá. */
export const createdFlashKey = (requestId: string) => `dma:solicitacao-enviada:${requestId}`;
