"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useConfirmation, useReasonPrompt } from "@/components/confirmation-provider";
import { CANCELLABLE_BATCH_STATUSES, batchAttemptErrorLabel, batchItemStatusLabels, batchJobStatusLabels } from "@/lib/batch-status-labels";
type Attempt = { attemptNumber: number; status: string; errorCode: string | null };
type Item = { id: string; rowNumber: number; contractNumber: string; status: string; note: string | null; attempts: Attempt[] };
type Job = {
  id: string;
  originalName: string;
  actionType: string;
  worksheetName: string;
  contractColumn: string;
  status: string;
  totalRows: number;
  succeededCount: number;
  failedCount: number;
  uncertainCount: number;
  skippedCount: number;
  items: Item[];
  cancellation?: { createdAt: string; details: { reason?: string } | null; actor: { name: string } | null } | null;
};
export function BatchDetail() {
  const { id } = useParams<{ id: string }>();
  const confirmAction = useConfirmation();
  const askReason = useReasonPrompt();
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch(`/api/batches/${id}`);
    const data = (await response.json()) as { job?: Job; error?: string };
    if (!response.ok || !data.job) throw new Error(data.error || "Ação manual não encontrada.");
    setJob(data.job);
    return data.job;
  }, [id]);
  useEffect(() => {
    let active = true;
    fetch(`/api/batches/${id}`)
      .then(async (response) => {
        const data = (await response.json()) as { job?: Job; error?: string };
        if (!response.ok || !data.job) throw new Error(data.error || "Ação manual não encontrada.");
        return data.job;
      })
      .then((value) => {
        if (active) setJob(value);
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Falha ao carregar a planilha.");
      });
    return () => {
      active = false;
    };
  }, [id]);
  // O processamento roda no servidor; enquanto estiver em andamento, a tela só acompanha.
  const running = job?.status === "RUNNING";
  useEffect(() => {
    if (!running) return;
    const interval = window.setInterval(() => void load().catch(() => undefined), 3000);
    return () => window.clearInterval(interval);
  }, [running, load]);
  async function execute() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/batches/${id}/execute`, { method: "POST" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível iniciar o processamento.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao iniciar o processamento da planilha.");
      await load().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }
  async function pause() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/batches/${id}/pause`, { method: "POST" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível pausar.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao pausar a planilha.");
    } finally {
      setBusy(false);
    }
  }
  async function retry(type: "FAILED" | "UNCERTAIN") {
    const uncertain = type === "UNCERTAIN";
    if (
      !(await confirmAction({
        title: uncertain ? "Reenviar ações com resultado incerto?" : "Tentar novamente as ações com falha?",
        description: uncertain
          ? "O Coral pode já ter aplicado algumas destas ações. O reenvio pode duplicar o resultado."
          : "As ações que falharam serão enviadas novamente ao Coral.",
        confirmLabel: uncertain ? "Confirmar reenvio" : "Tentar novamente",
        danger: uncertain,
      }))
    )
      return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/batches/${id}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, confirmDuplicateRisk: type === "UNCERTAIN" }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error);
      await execute();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao preparar nova tentativa.");
      setBusy(false);
    }
  }
  async function exportExcel() {
    try {
      const response = await fetch(`/api/batches/${id}/report`);
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error || "Não foi possível gerar o relatório Excel.");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `resultado-dma-${id}.xlsx`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível baixar o relatório Excel.");
    }
  }
  function exportCsv() {
    if (!job) return;
    const rows = [
      ["Linha", "Contrato", "Status", "Tentativas", "Observação"],
      ...job.items.map((item) => [
        String(item.rowNumber),
        item.contractNumber,
        batchItemStatusLabels[item.status] || "Status desconhecido",
        String(item.attempts.length),
        item.note || "",
      ]),
    ];
    const csv = "\uFEFF" + rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `resultado-${job.id}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }
  if (error && !job)
    return (
      <main className="shell">
        <div className="notice error-notice">{error}</div>
      </main>
    );
  if (!job)
    return (
      <main className="shell">
        <div className="empty">Carregando ação…</div>
      </main>
    );
  const countItems = (status: string) => job.items.filter((item) => item.status === status).length;
  // Contagem pelos itens: os contadores da planilha só são consolidados ao fim do processamento.
  const pending = countItems("PENDING");
  const processed = job.items.length - pending - countItems("RUNNING");
  async function cancelBatch() {
    const reason = await askReason({
      title: "Cancelar planilha?",
      description:
        "Os contratos ainda não enviados não serão mais executados. O que já foi enviado ao Coral mantém o resultado, e a planilha continua no histórico como Cancelada.",
      reasonLabel: "Motivo do cancelamento",
      reasonPlaceholder: "Ex.: planilha importada errada, ação duplicada.",
      confirmLabel: "Cancelar planilha",
      danger: true,
    });
    if (!reason) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/batches/${id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível cancelar a planilha.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao cancelar a planilha.");
    } finally {
      setBusy(false);
    }
  }
  async function confirmExecute() {
    if (!job) return;
    const actionLabel = job.actionType === "CONSIDERAR_DMA" ? "Considerar DMA" : "Desconsiderar DMA";
    if (
      await confirmAction({
        title: "Executar ações no Coral?",
        description: `Serão processados ${pending} contrato(s) restantes com a ação ${actionLabel}.`,
        confirmLabel: "Executar ações",
        danger: true,
      })
    )
      void execute();
  }
  return (
    <main className="shell">
      <div className="backline">
        <Link href="/acoes-manuais">← Ações por planilha</Link>
        <span>{job.originalName}</span>
      </div>
      <header className="page-heading">
        <div className="page-heading-left">
          <span className="eyebrow">
            {job.worksheetName} · {job.contractColumn}
          </span>
          <h1>{job.actionType === "CONSIDERAR_DMA" ? "Considerar DMA" : "Desconsiderar DMA"}</h1>
          <p>
            {job.totalRows} linhas · status {batchJobStatusLabels[job.status] || "Status desconhecido"}
          </p>
        </div>
        <div className="form-actions">
          <button className="button secondary" onClick={() => void exportExcel()}>
            Baixar Excel (.xlsx)
          </button>
          <button className="button secondary" onClick={exportCsv}>
            Baixar resultado CSV
          </button>
          {running ? (
            <button className="button danger" disabled={busy} onClick={() => void pause()}>
              Pausar após o contrato atual
            </button>
          ) : (
            <>
              {CANCELLABLE_BATCH_STATUSES.includes(job.status) && (
                <button className="button danger" disabled={busy} onClick={() => void cancelBatch()}>
                  Cancelar planilha
                </button>
              )}
              {pending > 0 && job.status !== "CANCELLED" && (
                <button className="button primary" disabled={busy} onClick={() => void confirmExecute()}>
                  Executar / continuar
                </button>
              )}
            </>
          )}
        </div>
      </header>
      {error && <div className="notice error-notice">{error}</div>}
      {job.status === "CANCELLED" && (
        <div className="notice">
          Planilha cancelada{job.cancellation?.actor?.name ? ` por ${job.cancellation.actor.name}` : ""}
          {job.cancellation ? ` em ${new Date(job.cancellation.createdAt).toLocaleString("pt-BR")}` : ""}. Motivo:{" "}
          {job.cancellation?.details?.reason || "não informado"}
        </div>
      )}
      {running && (
        <div className="notice" role="status">
          Processando no servidor: {processed} de {job.items.length} contratos. Pode fechar esta tela; o processamento continua e contratos
          já confirmados não são enviados de novo.
        </div>
      )}
      <section className="summary batch-summary">
        <article>
          <span>Concluídos</span>
          <strong>{countItems("SUCCEEDED")}</strong>
        </article>
        <article>
          <span>Falhas</span>
          <strong>{countItems("FAILED")}</strong>
        </article>
        <article>
          <span>Incertos</span>
          <strong>{countItems("UNCERTAIN")}</strong>
        </article>
        <article>
          <span>Ignorados</span>
          <strong>{countItems("SKIPPED")}</strong>
        </article>
      </section>
      {(countItems("FAILED") > 0 || countItems("UNCERTAIN") > 0) && !running && !busy && job.status !== "CANCELLED" && (
        <section className="panel">
          <h2>Nova tentativa</h2>
          <p>
            Falhas definitivas podem ser reenviadas. Resultados incertos exigem confirmação explícita porque a ação pode já ter sido
            aplicada no Coral.
          </p>
          <div className="form-actions">
            {countItems("FAILED") > 0 && (
              <button className="button secondary" onClick={() => void retry("FAILED")}>
                Tentar novamente as falhas ({countItems("FAILED")})
              </button>
            )}
            {countItems("UNCERTAIN") > 0 && (
              <button className="button danger" onClick={() => void retry("UNCERTAIN")}>
                Confirmar reenvio dos incertos ({countItems("UNCERTAIN")})
              </button>
            )}
          </div>
        </section>
      )}
      <section className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Linha</th>
                <th>Contrato</th>
                <th>Status</th>
                <th>Tentativas</th>
                <th>Detalhe</th>
              </tr>
            </thead>
            <tbody>
              {job.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.rowNumber}</td>
                  <td className="strong">{item.contractNumber}</td>
                  <td>
                    <span className="status status-pendente">{batchItemStatusLabels[item.status] || "Status desconhecido"}</span>
                  </td>
                  <td>{item.attempts.length}</td>
                  <td>{item.note || (item.attempts.at(-1)?.errorCode ? batchAttemptErrorLabel(item.attempts.at(-1)?.errorCode) : "—")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
