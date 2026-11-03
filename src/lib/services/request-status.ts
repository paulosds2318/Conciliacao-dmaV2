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
} as const;

export const REQUEST_STATUS = Object.keys(REQUEST_STATUS_LABELS) as (keyof typeof REQUEST_STATUS_LABELS)[];
export type RequestStatus = keyof typeof REQUEST_STATUS_LABELS;

export const TRANSITIONS: Record<RequestStatus, readonly RequestStatus[]> = {
  ANALYZING: ["PENDING_REVIEW", "REJECTED", "ANALYSIS_FAILED"],
  PENDING_REVIEW: ["EXECUTING", "REJECTED", "CANCELLED"],
  REJECTED: ["ANALYZING", "CANCELLED"],
  ANALYSIS_FAILED: ["ANALYZING", "CANCELLED"],
  EXECUTING: ["COMPLETED", "EXECUTION_FAILED", "EXECUTION_UNCERTAIN"],
  EXECUTION_UNCERTAIN: ["COMPLETED", "EXECUTION_FAILED"],
  EXECUTION_FAILED: [],
  COMPLETED: [],
  CANCELLED: [],
};

/** Foi aprovada pelo sistema quando a aprovação automática é mais recente que a última decisão do administrador (ex.: recusada pelo admin e reaberta com voucher Rentcars). */
export function wasAutoApproved(autoApprovedAt: Date | string | null | undefined, lastDecisionAt: Date | string | null | undefined) {
  if (!autoApprovedAt) return false;
  return !lastDecisionAt || new Date(autoApprovedAt).getTime() > new Date(lastDecisionAt).getTime();
}

export function canTransition(from: RequestStatus, to: RequestStatus) {
  return TRANSITIONS[from].includes(to);
}
