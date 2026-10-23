"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

type RequestRow = {
  id: string;
  contractName: string;
  actionType: string;
  status: string;
  observations: string | null;
  createdAt: string;
  updatedAt: string;
  requester?: { name: string; email?: string };
  analyses?: Array<{ confidence: number | null; comparison: { summary?: string; confidence?: number | null } | null }>;
  decisions?: Array<{ decision: string; justification: string | null; createdAt: string; reviewer?: { name: string } }>;
};
const labels: Record<string, string> = { ANALYZING: "Em análise automática", PENDING_REVIEW: "Aguardando administrador", REJECTED: "Recusada · correção disponível", ANALYSIS_FAILED: "Análise falhou", EXECUTING: "Executando no Coral", EXECUTION_UNCERTAIN: "Execução não confirmada", EXECUTION_FAILED: "Falha na execução", COMPLETED: "Concluída", CANCELLED: "Cancelada" };
const actionLabels: Record<string, string> = { CONSIDERAR_DMA: "Considerar DMA", DESCONSIDERAR_DMA: "Desconsiderar DMA" };
function dateLabel(value?: string | null) { return value ? new Date(value).toLocaleString("pt-BR") : ""; }
function csvCell(value: string | number | null | undefined) {
  const text = value == null ? "" : String(value);
  const safe = /^[\t\r ]*[=+@-]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
export function RequestList({ adminQueue = false }: { adminQueue?: boolean }) {
  const [items, setItems] = useState<RequestRow[]>([]); const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    fetch("/api/requests").then(async (response) => { const data = await response.json() as { requests?: RequestRow[]; error?: string }; if (!response.ok) throw new Error(data.error); return data.requests || []; }).then((rows) => { if (active) setItems(rows); }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Falha ao carregar solicitações."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const shown = adminQueue ? items.filter((item) => item.status === "PENDING_REVIEW") : items;
  async function exportExcel() {
    try {
      const response = await fetch("/api/requests/report");
      if (!response.ok) {
        const data = await response.json() as { error?: string };
        throw new Error(data.error || "Não foi possível gerar o relatório Excel.");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a"); link.href = url;
      link.download = `relatorio-solicitacoes-dma-${new Date().toISOString().slice(0, 10)}.xlsx`;
      link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível baixar o relatório Excel.");
    }
  }  function exportReport() {
    const headers = ["ID", "Contrato", "Ação", "Status", "Solicitante", "Observações", "Resumo da análise IA", "Confiança IA (%)", "Decisão", "Administrador", "Justificativa", "Criada em", "Atualizada em"];
    const rows = items.map((item) => {
      const analysis = item.analyses?.[0]; const decision = item.decisions?.[0];
      const summary = analysis?.comparison?.summary || "";
      const confidence = analysis?.comparison?.confidence ?? analysis?.confidence;
      return [item.id, item.contractName, actionLabels[item.actionType] || item.actionType, labels[item.status] || item.status, item.requester?.name || "", item.observations || "", summary, confidence == null ? "" : Math.round(confidence * 100), decision?.decision === "APPROVE" ? "Aprovada" : decision?.decision === "REJECT" ? "Recusada" : "", decision?.reviewer?.name || "", decision?.justification || "", dateLabel(item.createdAt), dateLabel(item.updatedAt)];
    });
    const csv = "\uFEFF" + [headers, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `relatorio-solicitacoes-dma-${new Date().toISOString().slice(0, 10)}.csv`; link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  if (loading) return <section className="panel"><div className="empty">Carregando solicitações…</div></section>;
  if (error) return <section className="panel"><div className="notice error-notice">{error}</div></section>;
  return <section className="panel"><div className="panel-head"><div><h2>{adminQueue ? "Aprovar solicitações" : "Minhas solicitações"}</h2><p>{adminQueue ? "Solicitações aguardando decisão do administrador." : "Acompanhe, edite ou cancele suas solicitações."}</p></div><button className="button secondary" onClick={() => void exportExcel()} disabled={!items.length}>Baixar Excel (.xlsx)</button><button className="button secondary" onClick={exportReport} disabled={!items.length}>Baixar relatório CSV</button></div><div className="table-wrap"><table><thead><tr><th>Contrato</th><th>Ação</th>{adminQueue && <th>Atendente</th>}<th>Status</th><th>Atualizado</th><th></th></tr></thead><tbody>{shown.map((item) => <tr key={item.id}><td className="strong">{item.contractName}</td><td>{actionLabels[item.actionType] || item.actionType}</td>{adminQueue && <td>{item.requester?.name}</td>}<td><span className="status status-pendente">{labels[item.status] || item.status}</span></td><td>{dateLabel(item.updatedAt)}</td><td><Link href={`/solicitacoes/${item.id}`}>Abrir</Link></td></tr>)}{!shown.length && <tr><td className="empty" colSpan={adminQueue ? 6 : 5}>{adminQueue ? "Nenhuma solicitação aguardando decisão do administrador." : "Nenhuma solicitação encontrada."}</td></tr>}</tbody></table></div></section>;
}