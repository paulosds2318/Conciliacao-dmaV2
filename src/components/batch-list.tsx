"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { batchJobStatusLabels } from "@/lib/batch-status-labels";
type Job = { id: string; originalName: string; actionType: string; status: string; totalRows: number; succeededCount: number; failedCount: number; uncertainCount: number; createdAt: string };
export function BatchList() {
  const [jobs, setJobs] = useState<Job[]>([]); const [error, setError] = useState("");
  useEffect(() => { let active = true; fetch("/api/batches").then(async (response) => { const data = await response.json() as { jobs?: Job[]; error?: string }; if (!response.ok) throw new Error(data.error); return data.jobs || []; }).then((rows) => { if (active) setJobs(rows); }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Erro ao carregar planilhas."); }); return () => { active = false; }; }, []);
  return <section className="panel"><div className="panel-head"><div><h2>Histórico de ações por planilha</h2><p>O resultado fica salvo por contrato para retomar o processamento.</p></div></div>{error && <div className="notice error-notice">{error}</div>}<div className="table-wrap"><table><thead><tr><th>Planilha</th><th>Ação</th><th>Status</th><th>Resultados</th><th>Data</th><th></th></tr></thead><tbody>{jobs.map((job) => <tr key={job.id}><td className="strong">{job.originalName}</td><td>{job.actionType === "CONSIDERAR_DMA" ? "Considerar DMA" : "Desconsiderar DMA"}</td><td>{batchJobStatusLabels[job.status] || "Status desconhecido"}</td><td>{job.succeededCount}/{job.totalRows} concluídos · {job.failedCount} falhas · {job.uncertainCount} incertos</td><td>{new Date(job.createdAt).toLocaleString("pt-BR")}</td><td><Link href={`/acoes-manuais/${job.id}`}>Abrir</Link></td></tr>)}{!jobs.length && <tr><td className="empty" colSpan={6}>Nenhuma ação por planilha.</td></tr>}</tbody></table></div></section>;
}
