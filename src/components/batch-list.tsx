"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
  const [showArchived, setShowArchived] = useState(false);

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

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Histórico de ações por planilha</h2>
          <p>{showArchived ? "Ações excluídas antes da remoção da exclusão, mantidas para consulta." : "O resultado fica salvo por contrato para retomar o processamento."}</p>
        </div>
        <button className="button secondary" type="button" onClick={() => { setError(""); setShowArchived((value) => !value); }}>
          {showArchived ? "Voltar ao histórico ativo" : "Ver excluídas"}
        </button>
      </div>
      {error && <div className="notice error-notice" role="alert">{error}</div>}
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
                  {!showArchived && <Link href={`/acoes-manuais/${job.id}`}>Abrir</Link>}
                </td>
              </tr>
            ))}
            {!jobs.length && <tr><td className="empty" colSpan={showArchived ? 9 : 6}>{showArchived ? "Nenhuma ação excluída." : "Nenhuma ação por planilha."}</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
