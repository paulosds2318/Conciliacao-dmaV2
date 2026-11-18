import type { BatchItem, BatchStep } from "@/lib/services/batch-approval";

/**
 * Estado da aprovação em lote entre a fila e a página do lote (/analise/lote). A fila grava o lote escolhido e abre a página, que
 * executa e vai atualizando este estado; recarregar a página mostra o que já foi feito, sem reaprovar nada.
 */
export const BATCH_SESSION_KEY = "dma:aprovacao-em-lote";

export type BatchRunItem = BatchItem & { actionType: string };
export type BatchRunState = {
  items: BatchRunItem[];
  steps: Record<string, BatchStep>;
  startedAt: number | null;
  finishedAt: number | null;
  /** pending: escolhido na fila, ainda não iniciado; running: em execução; done: terminou ou foi interrompido. */
  phase: "pending" | "running" | "done";
  stoppedBy: "user" | "coral" | "reload" | null;
};

export function newBatchState(items: BatchRunItem[]): BatchRunState {
  return {
    items,
    steps: Object.fromEntries(items.map((item) => [item.id, { state: "waiting" } as BatchStep])),
    startedAt: null,
    finishedAt: null,
    phase: "pending",
    stoppedBy: null,
  };
}

export const RELOAD_INTERRUPTED_MESSAGE =
  "A página foi recarregada durante a aprovação e não se sabe se ela chegou a ser registrada. Abra a solicitação para conferir antes de aprovar de novo.";

/**
 * Lote que estava em execução quando a página foi fechada ou recarregada: a solicitação que estava sendo aprovada fica como
 * resultado incerto (pode ter sido registrada) e as que aguardavam ficam como não processadas. Nada é reenviado sozinho.
 */
export function interruptedBatch(state: BatchRunState, finishedAt: number): BatchRunState {
  const steps = { ...state.steps };
  for (const item of state.items) {
    const step = steps[item.id];
    if (step?.state === "running") steps[item.id] = { state: "failed", message: RELOAD_INTERRUPTED_MESSAGE, uncertain: true };
    else if (!step || step.state === "waiting") steps[item.id] = { state: "skipped" };
  }
  return { ...state, steps, phase: "done", finishedAt, stoppedBy: state.stoppedBy ?? "reload" };
}

export function saveBatchState(state: BatchRunState | null, storage: Pick<Storage, "setItem" | "removeItem"> | undefined = safeStorage()) {
  try {
    if (!storage) return;
    if (state) storage.setItem(BATCH_SESSION_KEY, JSON.stringify(state));
    else storage.removeItem(BATCH_SESSION_KEY);
  } catch {
    /* sem armazenamento: o lote não pode ser acompanhado nesta página */
  }
}

export function loadBatchState(storage: Pick<Storage, "getItem"> | undefined = safeStorage()): BatchRunState | null {
  try {
    const raw = storage?.getItem(BATCH_SESSION_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw) as BatchRunState;
    return Array.isArray(state.items) && state.items.length && state.steps && state.phase ? state : null;
  } catch {
    return null;
  }
}

function safeStorage() {
  try {
    return typeof window === "undefined" ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
}

export type BatchRow = {
  id: string;
  label: string;
  actionType: string;
  /** Texto de status mostrado na tabela. */
  status: string;
  /** Classe de cor: ok, bad, warn ou vazio. */
  tone: "ok" | "bad" | "warn" | "";
  detail: string;
};

/** Linhas da tabela do lote, uma por solicitação, com o texto e a cor de cada situação. */
export function batchRows(state: BatchRunState): BatchRow[] {
  return state.items.map((item) => {
    const step: BatchStep = state.steps[item.id] ?? { state: "waiting" };
    const base = { id: item.id, label: item.label, actionType: item.actionType };
    switch (step.state) {
      case "approved":
        return { ...base, status: "Concluída", tone: "ok", detail: "Aprovada e enviada ao Coral." };
      case "failed":
        return {
          ...base,
          status: step.uncertain ? "Resultado não confirmado" : "Falhou",
          tone: step.uncertain ? "warn" : "bad",
          detail: `${step.message}${step.uncertain ? " Não reenvie: confira o contrato no Coral." : ""}`,
        };
      case "running":
        return { ...base, status: "Aprovando no Coral…", tone: "", detail: "Em andamento." };
      case "skipped":
        return { ...base, status: "Não processada", tone: "", detail: "Continua pendente na fila." };
      default:
        return { ...base, status: "Aguardando", tone: "", detail: "—" };
    }
  });
}

export function batchHeadline(state: BatchRunState, counts: { failed: number; skipped: number }) {
  if (state.phase !== "done") return "Aprovação em lote em andamento";
  return counts.failed || counts.skipped || state.stoppedBy
    ? "Aprovação em lote concluída com ocorrências"
    : "Aprovação em lote concluída com sucesso";
}
