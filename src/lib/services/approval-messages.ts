/** Textos das aprovações feitas na tela de detalhe: confirmação, aviso na fila e orientação quando o Coral não conclui. */

export const APPROVE_DIALOG_TEXT = "A ação será executada agora no Coral. Ao concluir, você volta para a tela de aprovações.";

export function forceApproveDialogText(reasons: string[]) {
  const reason = reasons.length ? `Motivo da recusa: ${reasons.slice(0, 3).join(" ")} ` : "";
  return `${reason}Ao aprovar, a ação será executada agora no Coral, mesmo com a recusa. Ao concluir, você volta para a tela de aprovações.`;
}

const ACTION_NAMES: Record<string, string> = { CONSIDERAR_DMA: "Considerar DMA", DESCONSIDERAR_DMA: "Desconsiderar DMA" };

/** Aviso mostrado na fila depois de uma aprovação concluída: qual contrato, qual ação e se foi aprovação forçada. */
export function approvalFlashMessage(contractName: string, actionType: string, forced: boolean) {
  const action = ACTION_NAMES[actionType];
  return `Solicitação ${contractName}${action ? ` (${action})` : ""} aprovada${forced ? " por aprovação forçada" : ""} e concluída no Coral.`;
}

const withDetail = (text: string, detail?: string) => (detail?.trim() ? `${text} ${detail.trim()}` : text);

/** Próximo passo quando o Coral recusou a ação: a solicitação não volta para a fila. */
export const CORAL_REFUSED_NEXT_STEP =
  "Não há nova tentativa por esta solicitação: confira o contrato no Coral e, se a ação ainda for necessária, faça-a em “Ação manual por planilha” no menu (aceita um contrato só).";
/** Próximo passo quando o Coral não confirmou: a ação pode ter sido aplicada. */
export const CORAL_UNCERTAIN_NEXT_STEP =
  "Não aprove de novo: confira o contrato no Coral e abra a solicitação para registrar o que encontrou.";

/** O Coral recusou a ação: não há nova tentativa pela solicitação, então a mensagem indica o caminho. */
export function coralRefusedMessage(forced: boolean, detail?: string) {
  const start = forced ? "Aprovação forçada registrada, mas o Coral recusou a ação." : "Solicitação aprovada, mas o Coral recusou a ação.";
  return `${withDetail(start, detail)} ${CORAL_REFUSED_NEXT_STEP}`;
}

/** O Coral não respondeu a tempo: a ação pode ter sido aplicada, e o administrador registra o que encontrar na própria tela. */
export function coralUncertainMessage(forced: boolean, detail?: string) {
  const start = forced
    ? "Aprovação forçada registrada, mas o Coral não confirmou o resultado."
    : "Solicitação aprovada, mas o Coral não confirmou o resultado.";
  return `${withDetail(start, detail)} Não aprove de novo: confira o contrato no Coral e registre o que encontrou no quadro “Resultado não confirmado pelo Coral”, logo abaixo.`;
}
