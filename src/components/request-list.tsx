"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { RequestAuditList } from "@/components/request-audit-list";
import { personName } from "@/lib/person-name";
import { REQUEST_STATUS_LABELS } from "@/lib/services/request-status";

type RequestRow = {
  id: string;
  contractName: string;
  actionType: string;
  status: string;
  observations: string | null;
  createdAt: string;
  updatedAt: string;
  requester?: { name: string; email?: string };
  analyses?: Array<{ status: string; confidence: number | null; comparison: { summary?: string; confidence?: number | null } | null }>;
  decisions?: Array<{ decision: string; justification: string | null; createdAt: string; reviewer?: { name: string; email?: string } }>;
  auditEvents?: Array<{ id: string; details: { reason?: string } | null }>;
};
const labels: Record<string, string> = REQUEST_STATUS_LABELS;
const actionLabels: Record<string, string> = { CONSIDERAR_DMA: "Considerar DMA", DESCONSIDERAR_DMA: "Desconsiderar DMA" };
function dateLabel(value?: string | null) { return value ? new Date(value).toLocaleString("pt-BR") : ""; }
function withDisplayName(item: RequestRow): RequestRow {
  return {
    ...item,
    requester: item.requester ? { ...item.requester, name: personName(item.requester.name, item.requester.email) } : undefined,
    decisions: item.decisions?.map((decision) => decision.reviewer ? { ...decision, reviewer: { ...decision.reviewer, name: personName(decision.reviewer.name, decision.reviewer.email) } } : decision),
  };
}
function csvCell(value: string | number | null | undefined) {
  const text = value == null ? "" : String(value);
  const safe = /^[\t\r ]*[=+@-]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
export type AdminView = "pending" | "approved" | "returned" | "all";
const approvedStatuses = ["EXECUTING", "COMPLETED", "EXECUTION_FAILED", "EXECUTION_UNCERTAIN"];
const returnedStatuses = ["REJECTED", "ANALYSIS_FAILED", "CANCELLED"];
export function RequestList({ adminQueue = false, initialView = "pending" }: { adminQueue?: boolean; initialView?: AdminView }) {
  const [items, setItems] = useState<RequestRow[]>([]); const [error, setError] = useState(""); const [actionMessage, setActionMessage] = useState(""); const [loading, setLoading] = useState(true); const [adminView, setAdminView] = useState<AdminView>(initialView); const [query, setQuery] = useState(""); const [statusFilter, setStatusFilter] = useState("ALL"); const [pageSize, setPageSize] = useState(25); const [page, setPage] = useState(1);
  useEffect(() => {
    if (!actionMessage) return;
    const timeout = window.setTimeout(() => setActionMessage(""), 4000);
    return () => window.clearTimeout(timeout);
  }, [actionMessage]);

  useEffect(() => {
    let active = true; let loaded = false;
    const refresh = () => fetch("/api/requests").then(async (response) => { const data = await response.json() as { requests?: RequestRow[]; error?: string }; if (!response.ok) throw new Error(data.error); return data.requests || []; }).then((rows) => { if (active) { setItems(rows.map(withDisplayName)); setError(""); } }).catch((reason: unknown) => { if (active && !loaded) setError(reason instanceof Error ? reason.message : "Falha ao carregar solicitações."); }).finally(() => { loaded = true; if (active) setLoading(false); });
    void refresh();
    const interval = window.setInterval(() => void refresh(), 10000);
    window.addEventListener("focus", refresh);
    const onManualRefresh = () => void fetch("/api/requests", { cache: "no-store" }).then((response) => response.json()).then((data: { requests?: RequestRow[]; error?: string }) => { if (!data.requests) throw new Error(data.error || "Falha ao atualizar solicitações."); setItems(data.requests.map(withDisplayName)); setActionMessage("Solicitações atualizadas."); });
    window.addEventListener("app:refresh", onManualRefresh);
    return () => { active = false; window.clearInterval(interval); window.removeEventListener("focus", refresh); window.removeEventListener("app:refresh", onManualRefresh); };
  }, [adminQueue, adminView]);
  const viewStatuses = adminView === "approved" ? approvedStatuses : adminView === "returned" ? returnedStatuses : ["PENDING_REVIEW"];
  const baseRows = adminQueue ? items.filter((item) => viewStatuses.includes(item.status)) : items;
  // Na aba Pendentes só existe um status; o filtro aparece apenas quando há o que escolher.
  const statusOptions = Object.entries(labels).filter(([key]) => !adminQueue || viewStatuses.includes(key));
  const filteredRows = baseRows.filter((item) => { const matchText = !query.trim() || `${item.contractName} ${item.requester?.name || ""} ${item.id}`.toLocaleLowerCase("pt-BR").includes(query.trim().toLocaleLowerCase("pt-BR")); return matchText && (statusFilter === "ALL" || item.status === statusFilter); });
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize)); const currentPage = Math.min(page, pageCount); const shown = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
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
  const adminTabs = adminQueue ? <div className="admin-request-tabs" role="tablist" aria-label="Visões das solicitações">
    <button type="button" role="tab" aria-selected={adminView === "pending"} className={`button ${adminView === "pending" ? "primary" : "secondary"}`} onClick={() => { setAdminView("pending"); setStatusFilter("ALL"); setPage(1); }}>Pendentes</button>
    <button type="button" role="tab" aria-selected={adminView === "approved"} className={`button ${adminView === "approved" ? "primary" : "secondary"}`} onClick={() => { setAdminView("approved"); setStatusFilter("ALL"); setPage(1); }}>Aprovadas</button>
    <button type="button" role="tab" aria-selected={adminView === "returned"} className={`button ${adminView === "returned" ? "primary" : "secondary"}`} onClick={() => { setAdminView("returned"); setStatusFilter("ALL"); setPage(1); }}>Devolvidas e canceladas</button>
    <button type="button" role="tab" aria-selected={adminView === "all"} className={`button ${adminView === "all" ? "primary" : "secondary"}`} onClick={() => { setAdminView("all"); setPage(1); }}>Acompanhamento geral</button>
  </div> : null;
  if (adminQueue && adminView === "all") return <>{adminTabs}<RequestAuditList embedded /></>;
  if (loading) return <section className="panel"><div className="empty">Carregando solicitações…</div></section>;
  if (error) return <section className="panel"><div className="notice error-notice">{error}</div></section>;
  return <>{adminTabs}<section className="panel"><div className="panel-head"><div><h2>{adminQueue ? adminView === "pending" ? "Aprovar solicitações" : adminView === "approved" ? "Solicitações aprovadas e concluídas" : "Solicitações devolvidas e canceladas" : "Minhas solicitações"}</h2><p>{adminQueue ? adminView === "pending" ? "Solicitações aguardando decisão do administrador." : adminView === "approved" ? "Consulte as ações aprovadas, inclusive as aprovadas automaticamente, e seus resultados no Coral." : "Recusadas ou com análise não concluída aguardam a correção do atendente; as canceladas foram encerradas por ele." : "Acompanhe, edite ou cancele suas solicitações."}</p></div><button className="button secondary" onClick={() => void exportExcel()} disabled={!items.length}>Baixar Excel (.xlsx)</button><button className="button secondary" onClick={exportReport} disabled={!items.length}>Baixar relatório CSV</button></div>{actionMessage && <div className="notice" role="status">{actionMessage}</div>}<div className="filter-bar request-list-filters"><label className="filter-field request-search">Buscar contrato, atendente ou ID<input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Digite para buscar" /></label>{statusOptions.length > 1 && <label className="filter-field">Status<select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}><option value="ALL">Todos os status</option>{statusOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>}<button className="button secondary" type="button" onClick={() => { setQuery(""); setStatusFilter("ALL"); setPage(1); }}>Limpar filtros</button></div><div className="audit-results"><span>Exibindo {shown.length} de {filteredRows.length} solicitações</span><label>Linhas por página <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></label></div><div className="table-wrap"><table><thead><tr><th>Contrato</th><th>Ação</th>{adminQueue && <th>Atendente</th>}<th>Status</th><th>Atualizado</th><th></th></tr></thead><tbody>{shown.map((item) => <tr key={item.id}><td className="strong">{item.contractName}</td><td>{actionLabels[item.actionType] || item.actionType}</td>{adminQueue && <td>{item.requester?.name}</td>}<td>{adminQueue && item.auditEvents?.[0] && <span className="status status-pendente">Reaberta · </span>}<span className="status status-pendente">{item.status === "REJECTED" && item.analyses?.at(-1)?.status === "AUTO_REJECTED" ? "Recusada automaticamente pela IA - correção disponível" : labels[item.status] || item.status}</span>{adminQueue && item.auditEvents?.[0] && <small className="subcell">Motivo da reabertura: {item.auditEvents[0].details?.reason}</small>}</td><td>{dateLabel(item.updatedAt)}</td><td className="table-actions"><Link href={`/solicitacoes/${item.id}`}>Abrir</Link></td></tr>)}{!shown.length && <tr><td className="empty" colSpan={adminQueue ? 6 : 5}>{adminQueue ? adminView === "pending" ? "Nenhuma solicitação aguardando decisão do administrador." : adminView === "approved" ? "Nenhuma solicitação aprovada ou concluída." : "Nenhuma solicitação devolvida ou cancelada." : "Nenhuma solicitação encontrada."}</td></tr>}</tbody></table></div><div className="audit-pagination"><span>Página {currentPage} de {pageCount} · {filteredRows.length} registros</span><div><button className="button secondary" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>← Anterior</button><button className="button secondary" disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>Próxima →</button></div></div></section></>;
}
