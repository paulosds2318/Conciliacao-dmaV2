"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DeletionConfirmationDialog } from "@/components/deletion-confirmation-dialog";
import { batchJobStatusLabels } from "@/lib/batch-status-labels";

type Job = {
  id: string;
  originalName: string;
  actionType: string;
  status: string;
  totalRows: number;
  succeededCount: number;
  failedCount: number;
  uncertainCount: number;
  createdAt: string;
  deletedAt: string | null;
  deletedByName: string | null;
  deletedByEmail: string | null;
  deletionReason: string | null;
};

export function BatchList() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Job | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void fetch(`/api/batches${showArchived ? "?includeArchived=true" : ""}`, { cache: "no-store" })
        .then(async (response) => {
          const data = await response.json() as { jobs?: Job[]; error?: string };
          if (!response.ok) throw new Error(data.error || "Falha ao carregar ações manuais.");
          if (active) { setJobs(data.jobs || []); setError(""); }
        })
        .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Erro ao carregar ações manuais."); });
    };
    refresh();
    window.addEventListener("app:refresh", refresh);
    return () => { active = false; window.removeEventListener("app:refresh", refresh); };
  }, [showArchived]);

  async function archiveJob(reason: string) {
    if (!deleteTarget || deletingId) return false;
    const target = deleteTarget;
    setDeletingId(target.id);
    setError("");
    try {
      const response = await fetch(`/api/batches/${target.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível excluir esta ação.");
      setJobs((current) => current.filter((job) => job.id !== target.id));
      setNotice("Ação removida do histórico ativo e preservada para auditoria.");
      window.setTimeout(() => setNotice(""), 4000);
      return true;
    } catch (reasonError) {
      setError(reasonError instanceof Error ? reasonError.message : "Não foi possível excluir esta ação.");
      return false;
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Histórico de ações por planilha</h2>
          <p>{showArchived ? "Registros excluídos, com motivo e responsável preservados para auditoria." : "O resultado fica salvo por contrato para retomar o processamento."}</p>
        </div>
        <button className="button secondary" type="button" onClick={() => { setError(""); setShowArchived((value) => !value); }}>
          {showArchived ? "Voltar ao histórico ativo" : "Ver excluídas"}
        </button>
      </div>
      {error && <div className="notice error-notice" role="alert">{error}</div>}
      {notice && <div className="notice" role="status">{notice}</div>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Planilha</th><th>Ação</th><th>Status</th><th>Resultados</th><th>Data</th>
              {showArchived && <><th>Motivo da exclusão</th><th>Excluída por</th><th>Data da exclusão</th></>}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id}>
                <td className="strong">{job.originalName}</td>
                <td>{job.actionType === "CONSIDERAR_DMA" ? "Considerar DMA" : "Desconsiderar DMA"}</td>
                <td>{batchJobStatusLabels[job.status] || "Status desconhecido"}</td>
                <td>{job.succeededCount}/{job.totalRows} concluídos · {job.failedCount} falhas · {job.uncertainCount} incertos</td>
                <td>{new Date(job.createdAt).toLocaleString("pt-BR")}</td>
                {showArchived && <>
                  <td className="audit-reason">{job.deletionReason || "Motivo não informado"}</td>
                  <td>{job.deletedByName || "Não identificado"}{job.deletedByEmail && <small className="subcell">{job.deletedByEmail}</small>}</td>
                  <td>{job.deletedAt ? new Date(job.deletedAt).toLocaleString("pt-BR") : "—"}</td>
                </>}
                <td className="table-actions">
                  {!showArchived && <>
                    <Link href={`/acoes-manuais/${job.id}`}>Abrir</Link>
                    <button className="button danger" type="button" disabled={deletingId === job.id} title="Excluir do histórico ativo" onClick={() => setDeleteTarget(job)}>
                      {deletingId === job.id ? "Excluindo…" : "Excluir"}
                    </button>
                  </>}
                </td>
              </tr>
            ))}
            {!jobs.length && <tr><td className="empty" colSpan={showArchived ? 9 : 6}>{showArchived ? "Nenhuma ação excluída." : "Nenhuma ação por planilha."}</td></tr>}
          </tbody>
        </table>
      </div>
      <DeletionConfirmationDialog
        open={Boolean(deleteTarget)}
        title="Excluir ação do histórico?"
        description={deleteTarget ? `${deleteTarget.status === "RUNNING" ? "A ação está em andamento. Uma chamada já enviada ao Coral ainda pode terminar; os próximos contratos serão interrompidos após essa resposta. " : ""}A ação “${deleteTarget.originalName}” será removida da lista ativa. As tentativas, resultados, responsável e motivo ficarão preservados para auditoria.` : ""}
        confirmLabel="Excluir ação"
        onConfirm={archiveJob}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  );
}
