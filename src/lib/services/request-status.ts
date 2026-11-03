export const REQUEST_STATUS_LABELS = {
  ANALYZING: "Em análise documental",
  PENDING_REVIEW: "Aguardando aprovação do administrador",
  REJECTED: "Recusada · correção disponível",
  ANALYSIS_FAILED: "Análise não concluída · nova tentativa disponível",
  EXECUTING: "Aprovada · execução no Coral em andamento",
  EXECUTION_UNCERTAIN: "Resultado da ação não confirmado",
  EXECUTION_FAILED: "Falha ao executar ação no Coral",
  COMPLETED: "Ação concluída no Coral",
  CANCELLED: "Cancelada",
  ARCHIVED: "Arquivada / excluída",
} as const;

export const REQUEST_STATUS = Object.keys(REQUEST_STATUS_LABELS) as (keyof typeof REQUEST_STATUS_LABELS)[];
export type RequestStatus = keyof typeof REQUEST_STATUS_LABELS;

export const TRANSITIONS: Record<RequestStatus, readonly RequestStatus[]> = {
  ANALYZING: ["PENDING_REVIEW", "REJECTED", "ANALYSIS_FAILED"],
  PENDING_REVIEW: ["EXECUTING", "REJECTED", "CANCELLED"],
  REJECTED: ["ANALYZING", "CANCELLED"],
  ANALYSIS_FAILED: ["ANALYZING", "CANCELLED"],
  EXECUTING: ["COMPLETED", "EXECUTION_FAILED", "EXECUTION_UNCERTAIN"],
  EXECUTION_UNCERTAIN: [],
  EXECUTION_FAILED: [],
  COMPLETED: [],
  CANCELLED: [],
  ARCHIVED: [],
};

export function canTransition(from: RequestStatus, to: RequestStatus) {
  return TRANSITIONS[from].includes(to);
}
