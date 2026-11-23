/** Aprovação em lote: o navegador aprova uma solicitação por vez, chamando a mesma rota de decisão da aprovação individual. */

export const BATCH_JUSTIFICATION = "Aprovação em lote";
/** Máximo por lote, para o administrador conseguir acompanhar e conferir o resultado. */
export const MAX_BATCH_SIZE = 100;
/**
 * Falhas seguidas do Coral que interrompem o lote. Uma solicitação cuja execução falha não tem caminho de volta, então
 * com o Coral fora do ar o lote não pode seguir consumindo as demais.
 */
export const MAX_CONSECUTIVE_CORAL_FAILURES = 2;

export type ApproveResult = { ok: true } | { ok: false; message: string; coral: boolean; uncertain: boolean };
export type BatchItem = { id: string; label: string };
/** Situação de cada solicitação no acompanhamento do lote. */
export type BatchStep =
  | { state: "waiting" }
  | { state: "running" }
  | { state: "approved" }
  | { state: "failed"; message: string; uncertain: boolean; coral: boolean }
  | { state: "skipped" };
export type BatchFailure = BatchItem & { message: string; uncertain: boolean };
export type BatchOutcome = {
  approved: BatchItem[];
  failed: BatchFailure[];
  notProcessed: BatchItem[];
  stoppedBy: "user" | "coral" | null;
};

/** Interpreta a resposta da rota de decisão: 200 aprovada; 502 com status do Coral; outros códigos são recusas da própria rota. */
export function interpretDecisionResponse(status: number, body: { error?: string; status?: string } | null): ApproveResult {
  if (status >= 200 && status < 300) return { ok: true };
  const fromCoral = status === 502 && (body?.status === "EXECUTION_FAILED" || body?.status === "EXECUTION_UNCERTAIN");
  const uncertain = body?.status === "EXECUTION_UNCERTAIN";
  const fallback = fromCoral ? "O Coral não confirmou a ação." : `A aprovação não foi aceita (código ${status}).`;
  return { ok: false, message: body?.error || fallback, coral: fromCoral, uncertain };
}

export async function runBatchApproval(
  items: BatchItem[],
  approveOne: (id: string) => Promise<ApproveResult>,
  hooks: {
    shouldStop: () => boolean;
    onProgress: (done: number, current: BatchItem | null) => void;
    /** Chamado a cada mudança de situação de uma solicitação: em andamento, aprovada, com problema ou não processada. */
    onItem?: (item: BatchItem, step: BatchStep) => void;
  },
): Promise<BatchOutcome> {
  const outcome: BatchOutcome = { approved: [], failed: [], notProcessed: [], stoppedBy: null };
  let consecutiveCoralFailures = 0;
  for (const [index, item] of items.entries()) {
    if (outcome.stoppedBy === null && hooks.shouldStop()) outcome.stoppedBy = "user";
    if (outcome.stoppedBy) {
      outcome.notProcessed.push(item);
      hooks.onItem?.(item, { state: "skipped" });
      continue;
    }
    hooks.onProgress(index, item);
    hooks.onItem?.(item, { state: "running" });
    let result: ApproveResult;
    try {
      result = await approveOne(item.id);
    } catch {
      // Sem resposta do servidor: a aprovação pode ter sido registrada, então não se sabe o resultado.
      result = {
        ok: false,
        message: "Sem resposta do servidor. Abra a solicitação para conferir se a aprovação foi registrada.",
        coral: true,
        uncertain: true,
      };
    }
    if (result.ok) {
      outcome.approved.push(item);
      hooks.onItem?.(item, { state: "approved" });
      consecutiveCoralFailures = 0;
      continue;
    }
    outcome.failed.push({ ...item, message: result.message, uncertain: result.uncertain });
    hooks.onItem?.(item, { state: "failed", message: result.message, uncertain: result.uncertain, coral: result.coral });
    consecutiveCoralFailures = result.coral ? consecutiveCoralFailures + 1 : 0;
    if (consecutiveCoralFailures >= MAX_CONSECUTIVE_CORAL_FAILURES) outcome.stoppedBy = "coral";
  }
  hooks.onProgress(items.length, null);
  return outcome;
}

type RowLike = { actionType: string; analyses?: Array<{ comparison: { matches?: boolean | null } | null }> };

/** A IA apontou que voucher e contrato não conferem; essas solicitações ficam fora do "marcar todas". */
export function hasDivergence(row: RowLike) {
  return row.analyses?.at(-1)?.comparison?.matches === false;
}

/** Texto da confirmação antes de aprovar o lote, com singular e plural certos e o aviso das que a IA apontou como divergentes. */
export function batchConfirmation(rows: RowLike[]) {
  const summary = batchSummary(rows);
  const one = summary.total === 1;
  const byAction = [
    summary.desconsiderar && `${summary.desconsiderar} Desconsiderar DMA`,
    summary.considerar && `${summary.considerar} Considerar DMA`,
  ]
    .filter(Boolean)
    .join(" e ");
  const warning = !summary.withDivergence
    ? ""
    : one
      ? " Atenção: ela tem divergência apontada pela IA entre voucher e contrato."
      : summary.withDivergence === 1
        ? " Atenção: 1 delas tem divergência apontada pela IA entre voucher e contrato."
        : ` Atenção: ${summary.withDivergence} delas têm divergência apontada pela IA entre voucher e contrato.`;
  return {
    title: one ? "Aprovar 1 solicitação?" : `Aprovar ${summary.total} solicitações?`,
    description: one
      ? `Será aprovada 1 solicitação (${byAction}). A ação é executada agora no Coral e não dá para desfazer por aqui.${warning}`
      : `Serão aprovadas ${summary.total} solicitações (${byAction}). A ação é executada no Coral para cada uma, uma de cada vez, e não dá para desfazer por aqui.${warning} Se o Coral falhar duas vezes seguidas, o lote é interrompido. Mantenha esta página aberta até terminar.`,
    confirmLabel: `Aprovar ${summary.total}`,
    danger: summary.withDivergence > 0,
  };
}

/** Duração em texto curto: "45 s" ou "2 min 10 s". */
export function durationLabel(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${String(seconds % 60).padStart(2, "0")} s`;
}

/** Contagens do acompanhamento: aprovadas, com problema, em andamento, aguardando e não processadas. */
export function batchCounts(steps: BatchStep[]) {
  const count = (state: BatchStep["state"]) => steps.filter((step) => step.state === state).length;
  return {
    total: steps.length,
    approved: count("approved"),
    failed: count("failed"),
    running: count("running"),
    waiting: count("waiting"),
    skipped: count("skipped"),
    finished: count("approved") + count("failed") + count("skipped"),
  };
}

export function batchSummary(rows: RowLike[]) {
  return {
    total: rows.length,
    considerar: rows.filter((row) => row.actionType === "CONSIDERAR_DMA").length,
    desconsiderar: rows.filter((row) => row.actionType === "DESCONSIDERAR_DMA").length,
    withDivergence: rows.filter(hasDivergence).length,
  };
}
