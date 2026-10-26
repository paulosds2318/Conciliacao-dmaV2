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
