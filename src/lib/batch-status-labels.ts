export const batchJobStatusLabels: Record<string, string> = {
  READY: "Pronta para iniciar",
  RUNNING: "Em andamento",
  PAUSED: "Pausada · aguardando continuação",
  COMPLETED: "Concluída",
  COMPLETED_WITH_ERRORS: "Concluída com pendências",
};

export const batchItemStatusLabels: Record<string, string> = {
  PENDING: "Aguardando execução",
  RUNNING: "Em andamento",
  SUCCEEDED: "Concluída",
  FAILED: "Falhou",
  UNCERTAIN: "Resultado não confirmado",
  SKIPPED: "Ignorada",
};

export const batchAttemptStatusLabels: Record<string, string> = {
  IN_PROGRESS: "Em processamento",
  SUCCEEDED: "Concluída",
  FAILED: "Falhou",
  UNCERTAIN: "Resultado não confirmado",
  CANCELLED: "Cancelada",
  SIMULATED: "Simulada",
};

export const executionStatusLabels: Record<string, string> = {
  IN_PROGRESS: "Em processamento",
  SUCCEEDED: "Concluída",
  FAILED: "Falhou",
  UNCERTAIN: "Resultado não confirmado",
  CANCELLED: "Cancelada",
  SIMULATED: "Simulada",
};

export const batchAttemptErrorLabels: Record<string, string> = {
  PROCESS_INTERRUPTED_RESULT_UNKNOWN: "O processamento foi interrompido; não foi possível confirmar se o Coral aplicou a ação.",
  JOB_ARCHIVED_BEFORE_CORAL_CALL: "A planilha foi arquivada antes de esta ação ser enviada ao Coral.",
  CORAL_ERROR: "O Coral não conseguiu concluir a ação. Consulte o detalhe informado pelo serviço.",
};

export function batchAttemptErrorLabel(code: string | null | undefined) {
  if (!code) return "Sem detalhe de falha.";
  return batchAttemptErrorLabels[code] || "O Coral não confirmou o resultado. Peça ao administrador para consultar o detalhe técnico.";
}
