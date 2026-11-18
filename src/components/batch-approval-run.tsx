"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  BATCH_JUSTIFICATION,
  batchCounts,
  durationLabel,
  interpretDecisionResponse,
  runBatchApproval,
  type ApproveResult,
  type BatchStep,
} from "@/lib/services/batch-approval";
import {
  batchHeadline,
  batchRows,
  interruptedBatch,
  loadBatchState,
  saveBatchState,
  type BatchRunState,
} from "@/lib/services/batch-session";

const actionLabels: Record<string, string> = { CONSIDERAR_DMA: "Considerar DMA", DESCONSIDERAR_DMA: "Desconsiderar DMA" };
/** Relógio fora do componente: o lint de pureza não aceita Date.now() dentro dele. */
const clock = () => Date.now();

async function approveOne(id: string): Promise<ApproveResult> {
  const response = await fetch(`/api/requests/${id}/decision`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision: "APPROVE", justification: BATCH_JUSTIFICATION }),
  });
  const body = (await response.json().catch(() => null)) as { error?: string; status?: string } | null;
  return interpretDecisionResponse(response.status, body);
}

function downloadCsv(state: BatchRunState) {
  const rows = [
    ["Contrato", "Ação", "Status", "Detalhe"],
    ...batchRows(state).map((row) => [row.label, actionLabels[row.actionType] ?? row.actionType, row.status, row.detail]),
  ];
  const csv = "﻿" + rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "resultado-aprovacao-em-lote.csv";
  link.click();
  URL.revokeObjectURL(url);
}

/** Página da aprovação em lote: executa o lote escolhido na fila e mostra o andamento e o resultado de cada solicitação. */
export function BatchApprovalRun() {
  const [state, setState] = useState<BatchRunState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [now, setNow] = useState(() => clock());
  const [stopping, setStopping] = useState(false);
  const stopRequested = useRef(false);
  const started = useRef(false);

  function update(change: (current: BatchRunState) => BatchRunState) {
    setState((current) => {
      if (!current) return current;
      const next = change(current);
      saveBatchState(next);
      return next;
    });
  }

  async function begin() {
    const saved = loadBatchState();
    if (!saved) {
      setLoaded(true);
      return;
    }
    // Recarregou com o lote em execução: não retoma sozinho, para nunca aprovar duas vezes a mesma solicitação.
    const initial = saved.phase === "running" ? interruptedBatch(saved, clock()) : saved;
    if (initial !== saved) saveBatchState(initial);
    setState(initial);
    setLoaded(true);
    if (initial.phase !== "pending") return;
    const startedAt = clock();
    const running: BatchRunState = { ...initial, phase: "running", startedAt };
    saveBatchState(running);
    setState(running);
    setNow(startedAt);
    void runBatchApproval(running.items, approveOne, {
      shouldStop: () => stopRequested.current,
      onProgress: () => undefined,
      onItem: (item, step: BatchStep) => update((current) => ({ ...current, steps: { ...current.steps, [item.id]: step } })),
    }).then((outcome) => update((current) => ({ ...current, phase: "done", finishedAt: clock(), stoppedBy: outcome.stoppedBy })));
  }

  // Executa uma única vez, ao abrir a página (o ref evita a segunda execução do modo de desenvolvimento).
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void Promise.resolve().then(begin);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `begin` só usa refs e setters estáveis
  }, []);

  const running = state?.phase === "running";
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setNow(clock()), 1000);
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("beforeunload", warn);
    };
  }, [running]);

  if (!loaded)
    return (
      <main className="shell">
        <div className="empty">Carregando…</div>
      </main>
    );
  if (!state)
    return (
      <main className="shell">
        <div className="notice">Nenhum lote em andamento. Marque as solicitações na fila de análise e use “Aprovar selecionadas”.</div>
        <Link className="button secondary" href="/analise">
          Voltar para a fila
        </Link>
      </main>
    );

  const steps = state.items.map((item) => state.steps[item.id] ?? ({ state: "waiting" } as BatchStep));
  const counts = batchCounts(steps);
  const rows = batchRows(state);
  const uncertain = steps.filter((step) => step.state === "failed" && step.uncertain).length;
  const failed = counts.failed - uncertain;
  const percent = counts.total ? Math.round((counts.finished / counts.total) * 100) : 0;
  const current = state.items.find((item) => state.steps[item.id]?.state === "running");
  const elapsed = durationLabel(((state.finishedAt ?? now) || now) - (state.startedAt ?? now));

  return (
    <main className="shell">
      <div className="backline">
        <Link href="/analise">← Fila de análise</Link>
        <span>Aprovação em lote</span>
      </div>
      <header className="page-heading">
        <div className="page-heading-left">
          <span className="eyebrow">Aprovação em lote</span>
          <h1>{batchHeadline(state, { failed: counts.failed, skipped: counts.skipped })}</h1>
          <p>
            {counts.total} {counts.total === 1 ? "solicitação" : "solicitações"} ·{" "}
            {running ? `${counts.finished} de ${counts.total} (${percent}%)` : `concluído em ${elapsed}`}
            {running && ` · decorrido ${elapsed}`}
          </p>
        </div>
        <div className="form-actions">
          <button className="button secondary" type="button" onClick={() => downloadCsv(state)}>
            Baixar resultado CSV
          </button>
          {running ? (
            <button
              className="button danger"
              type="button"
              disabled={stopping}
              onClick={() => {
                stopRequested.current = true;
                setStopping(true);
              }}
            >
              {stopping ? "Parando após esta…" : "Parar após esta"}
            </button>
          ) : (
            <Link className="button primary" href="/analise">
              Voltar para a fila
            </Link>
          )}
        </div>
      </header>
      {running && (
        <div className="notice" role="status">
          {stopping
            ? "Parando: o lote termina a solicitação em andamento e deixa as demais pendentes."
            : `Aprovando${current ? ` ${current.label}` : ""} no Coral, uma solicitação por vez. Mantenha esta página aberta até terminar.`}
          <div
            className="batch-bar-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={counts.total}
            aria-valuenow={counts.finished}
          >
            <div className="batch-bar-fill" style={{ width: `${percent}%` }} />
          </div>
        </div>
      )}
      {!running && state.stoppedBy === "coral" && (
        <div className="notice error-notice">
          O lote foi interrompido porque o Coral falhou duas vezes seguidas. As demais continuam pendentes na fila.
        </div>
      )}
      {!running && state.stoppedBy === "user" && (
        <div className="notice">Lote interrompido por você. As demais continuam pendentes na fila.</div>
      )}
      {!running && state.stoppedBy === "reload" && (
        <div className="notice error-notice">
          A página foi recarregada durante o lote. O que já estava registrado aparece abaixo; confira as solicitações marcadas como não
          confirmadas.
        </div>
      )}
      <section className="summary batch-summary">
        <article>
          <span>Concluídas</span>
          <strong>{counts.approved}</strong>
        </article>
        <article>
          <span>Falhas</span>
          <strong>{failed}</strong>
        </article>
        <article>
          <span>Não confirmadas</span>
          <strong>{uncertain}</strong>
        </article>
        <article>
          <span>{running ? "Aguardando" : "Não processadas"}</span>
          <strong>{running ? counts.waiting + counts.running : counts.skipped}</strong>
        </article>
      </section>
      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Contrato</th>
                <th>Ação</th>
                <th>Status</th>
                <th>Detalhe</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id}>
                  <td>{index + 1}</td>
                  <td className="strong">{row.label}</td>
                  <td>{actionLabels[row.actionType] ?? row.actionType}</td>
                  <td>
                    <span className={`status status-pendente batch-status ${row.tone}`}>{row.status}</span>
                  </td>
                  <td className="batch-detail-cell">{row.detail}</td>
                  <td>
                    <Link href={`/solicitacoes/${row.id}`}>Abrir</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
