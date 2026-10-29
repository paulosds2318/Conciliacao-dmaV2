"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { personName } from "@/lib/person-name";
import { REQUEST_STATUS_LABELS } from "@/lib/services/request-status";

type AuditEvent = { id: string; event: string; details: Record<string, unknown> | null; createdAt: string; actor: { name: string; email?: string } | null };
type Row = { id: string; contractName: string; actionType: string; status: string; requester: { name: string; email: string }; createdAt: string; updatedAt: string; decisions: Array<{ decision: string; justification: string | null; createdAt: string; reviewer: { name: string } }>; auditEvents: AuditEvent[] };
const statusLabels: Record<string, string> = REQUEST_STATUS_LABELS;
const eventLabel: Record<string, string> = { REQUEST_ARCHIVED: "Solicitação excluída", REQUEST_REOPENED: "Solicitação reaberta" };
function date(value: string) { return new Date(value).toLocaleString("pt-BR"); }
function withDisplayNames(row: Row): Row {
  return {
    ...row,
    requester: { ...row.requester, name: personName(row.requester.name, row.requester.email) },
    auditEvents: row.auditEvents.map((event) => event.actor ? { ...event, actor: { ...event.actor, name: personName(event.actor.name, event.actor.email) } } : event),
  };
}
export function RequestAuditList({ mode, embedded = false }: { mode: "all" | "deleted"; embedded?: boolean }) {
  const [rows, setRows] = useState<Row[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [search, setSearch] = useState(""); const [status, setStatus] = useState("ALL"); const [requester, setRequester] = useState("ALL"); const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [size, setSize] = useState(25); const [page, setPage] = useState(1);
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const refresh = useCallback(async (manual = false) => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/requests?includeArchived=true", { cache: "no-store" }); const data = await response.json() as { requests?: Row[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível atualizar as solicitações.");
      setRows((data.requests || []).map(withDisplayNames)); if (manual) setNotice("Acompanhamento atualizado.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao consultar o acompanhamento."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); const onRefresh = () => void refresh(true); window.addEventListener("app:refresh", onRefresh); return () => window.removeEventListener("app:refresh", onRefresh); }, [refresh]);
  const requesters = useMemo(() => [...new Set(rows.map((row) => personName(row.requester.name, row.requester.email)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR")), [rows]);
  const availableStatuses = useMemo(() => [...new Set(rows.filter((row) => mode !== "deleted" || row.status === "ARCHIVED").map((row) => row.status))].filter((value) => value in statusLabels).sort((a, b) => statusLabels[a].localeCompare(statusLabels[b], "pt-BR")), [rows, mode]);
  const filtered = useMemo(() => rows.filter((row) => {
    if (mode === "deleted" && row.status !== "ARCHIVED") return false;
    const query = search.trim().toLocaleLowerCase("pt-BR");
    if (query && ![row.contractName, personName(row.requester.name, row.requester.email), row.requester.email, row.id].some((value) => value.toLocaleLowerCase("pt-BR").includes(query))) return false;
    if (status !== "ALL" && row.status !== status) return false;
    if (requester !== "ALL" && personName(row.requester.name, row.requester.email) !== requester) return false;
    const created = row.createdAt.slice(0, 10); if (from && created < from) return false; if (to && created > to) return false;
    return true;
  }), [rows, mode, search, status, requester, from, to]);
  const pages = Math.max(1, Math.ceil(filtered.length / size)); const currentPage = Math.min(page, pages); const visible = filtered.slice((currentPage - 1) * size, currentPage * size);
  function reset() { setSearch(""); setStatus("ALL"); setRequester("ALL"); setFrom(""); setTo(""); setPage(1); }
  return <div className={embedded ? "audit-embedded" : "shell"}>{!embedded && <header className="page-heading"><div className="page-heading-left"><span className="eyebrow">Administração · Auditoria</span><h1>{mode === "deleted" ? "Solicitações excluídas" : "Acompanhamento geral"}</h1><p>{mode === "deleted" ? "Consulte o motivo, responsável e data de cada exclusão, com acesso ao histórico completo." : "Consulte todas as solicitações, independentemente do status ou de quem abriu."}</p></div></header>}
    {error && <div className="notice error-notice" role="alert">{error}</div>}{notice && <div className="notice" role="status">{notice}</div>}
    <section className="panel audit-panel"><div className="filter-bar audit-filters"><label className="search-field">Buscar contrato, atendente ou ID<input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Digite para buscar" /></label><label className="filter-field">Status<select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="ALL">Todos os status</option>{Object.entries(statusLabels).filter(([key]) => mode !== "deleted" || key === "ARCHIVED").map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></label><label className="filter-field">Atendente<select value={requester} onChange={(e) => { setRequester(e.target.value); setPage(1); }}><option value="ALL">Todos</option>{requesters.map((name) => <option key={name} value={name}>{name}</option>)}</select></label><label className="filter-field">Criada a partir de<input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} /></label><label className="filter-field">Criada até<input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} /></label><button className="button secondary" type="button" onClick={reset}>Limpar filtros</button></div>
      <div className="audit-results"><span>{loading ? "Atualizando…" : `Exibindo ${visible.length} de ${filtered.length} solicitação(ões)`}</span><label>Linhas por página <select value={size} onChange={(e) => { setSize(Number(e.target.value)); setPage(1); }}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></label></div>
      <div className="table-wrap"><table><thead><tr><th>Contrato / ID</th><th>Ação</th><th>Atendente</th><th>Status</th>{mode === "deleted" && <><th>Motivo da exclusão</th><th>Excluída por</th><th>Data da exclusão</th></>}<th>Atualizada</th><th></th></tr></thead><tbody>{visible.map((row) => { const archived = row.auditEvents.find((event) => event.event === "REQUEST_ARCHIVED"); const reopen = row.auditEvents.find((event) => event.event === "REQUEST_REOPENED"); return <tr key={row.id}><td><strong>{row.contractName}</strong><small className="subcell">{row.id}</small></td><td>{row.actionType === "CONSIDERAR_DMA" ? "Considerar DMA" : "Desconsiderar DMA"}</td><td>{row.requester.name}<small className="subcell">{row.requester.email}</small></td><td><span className="status status-pendente">{statusLabels[row.status] || "Status não reconhecido"}</span>{reopen && <small className="subcell">Reaberta: {String(reopen.details?.reason || "")}</small>}</td>{mode === "deleted" && <><td className="audit-reason">{String(archived?.details?.reason || "Motivo não informado")}</td><td>{archived?.actor?.name || "Não identificado"}{archived?.actor?.email && <small className="subcell">{archived.actor.email}</small>}</td><td>{archived ? date(archived.createdAt) : "Registro indisponível"}</td></>}<td>{date(row.updatedAt)}</td><td><Link href={`/solicitacoes/${row.id}`}>Detalhes</Link></td></tr>; })}{!visible.length && <tr><td className="empty" colSpan={mode === "deleted" ? 9 : 6}>{loading ? "Carregando solicitações…" : "Nenhuma solicitação encontrada para os filtros selecionados."}</td></tr>}</tbody></table></div>
      <div className="audit-pagination"><span>Página <strong>{currentPage}</strong> de <strong>{pages}</strong> · {filtered.length} registros</span><div><button className="button secondary" disabled={currentPage <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>← Anterior</button>{Array.from({ length: pages }, (_, i) => i + 1).filter((p) => p === 1 || p === pages || Math.abs(p - currentPage) <= 1).map((p, i, list) => <span key={p}>{i > 0 && list[i - 1] !== p - 1 && <span className="pagination-ellipsis">…</span>}<button className={`button ${p === currentPage ? "primary" : "secondary"}`} onClick={() => setPage(p)}>{p}</button></span>)}<button className="button secondary" disabled={currentPage >= pages || loading} onClick={() => setPage((p) => Math.min(pages, p + 1))}>Próxima →</button></div></div>
    </section></div>;
}
