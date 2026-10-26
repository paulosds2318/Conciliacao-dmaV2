"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { RequestManagement } from "@/components/request-management";
import { personName } from "@/lib/person-name";

type Doc = { id: string; kind: string; version: number; originalName: string };
type Field = { name: string; voucherValue?: string; contractValue?: string; match: boolean | null };
type Comparison = { summary: string; confidence: number | null; fields: Field[] };
type Analysis = { model: string; status: string; errorCode: string | null; comparison: Comparison | null };
type Decision = { id: string; decision: string; justification: string | null; requestVersion: number; reviewer: { name: string; email?: string } };
type AuditEvent = { id: string; event: string; details: (Record<string, unknown> & { reason?: string }) | null; createdAt: string; actor: { name: string; email?: string } | null };
type RequestItem = { id: string; actionType: string; contractName: string; observations: string | null; status: string; version: number; requester: { id: string; name: string; email?: string }; documents: Doc[]; analyses: Analysis[]; decisions: Decision[]; auditEvents: AuditEvent[] };
type SessionUser = { id?: string; role?: string };
const auditLabels: Record<string, string> = { REQUEST_SUBMITTED: "Solicitação aberta", REQUEST_EDITED: "Dados da solicitação editados", REQUEST_REOPENED: "Solicitação reaberta e reenviada", AI_ANALYSIS_COMPLETED: "Análise automática concluída", AI_AUTO_REJECTED: "Recusa automática da análise documental", REQUEST_REJECTED: "Solicitação recusada", REQUEST_APPROVED_EXECUTION_STARTED: "Ação aprovada; execução iniciada", CORAL_EXECUTION_COMPLETED: "Ação concluída no Coral", CORAL_EXECUTION_FAILED: "Falha ao executar no Coral", CORAL_EXECUTION_UNCERTAIN: "Execução no Coral não confirmada", REQUEST_CANCELLED: "Solicitação cancelada", REQUEST_ARCHIVED: "Solicitação excluída/arquivada" };
function auditDetails(details: Record<string, unknown> | null) { return Object.entries(details || {}).filter(([key]) => key !== "idempotencyKey").map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`).join(" · "); }
function withDisplayNames(request: RequestItem): RequestItem {
  return {
    ...request,
    requester: { ...request.requester, name: personName(request.requester.name, request.requester.email) },
    decisions: request.decisions.map((decision) => ({ ...decision, reviewer: { ...decision.reviewer, name: personName(decision.reviewer.name, decision.reviewer.email) } })),
    auditEvents: request.auditEvents.map((event) => event.actor ? { ...event, actor: { ...event.actor, name: personName(event.actor.name, event.actor.email) } } : event),
  };
}
export function RequestDetail() {
  const { id } = useParams<{ id: string }>(); const router = useRouter(); const session = useSession(); const [item, setItem] = useState<RequestItem | null>(null); const [error, setError] = useState(""); const [success, setSuccess] = useState(""); const [busy, setBusy] = useState(false); const [justification, setJustification] = useState(""); const [reopenReason, setReopenReason] = useState(""); const [files, setFiles] = useState<{ voucher?: File; contract?: File }>({});
  async function load() { const response = await fetch(`/api/requests/${id}`); const data = await response.json() as { request?: RequestItem; error?: string }; if (!response.ok || !data.request) throw new Error(data.error || "Solicitação não encontrada."); return withDisplayNames(data.request); }
  useEffect(() => {
    let active = true;
    fetch(`/api/requests/${id}`).then(async (response) => { const data = await response.json() as { request?: RequestItem; error?: string }; if (!response.ok || !data.request) throw new Error(data.error || "Solicitação não encontrada."); return withDisplayNames(data.request); }).then((request) => { if (active) setItem(request); }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Falha ao carregar solicitação."); });
    return () => { active = false; };
  }, [id]);
  async function decide(decision: "APPROVE" | "REJECT") { const message = decision === "APPROVE" ? "Aprovar e executar no Coral esta acao?" : "Recusar e devolver esta solicitacao para correcao?"; if (!window.confirm(message)) return; setBusy(true); setError(""); try { const response = await fetch(`/api/requests/${id}/decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, justification }) }); const data = await response.json() as { error?: string }; if (!response.ok) throw new Error(data.error); setItem(await load()); router.refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Falha ao decidir."); } finally { setBusy(false); } }
  async function archive() {
    const isAdmin = (session.data?.user as SessionUser | undefined)?.role === "admin";
    const reason = window.prompt("Informe o motivo da exclusão/arquivamento (obrigatório, até 2.000 caracteres):");
    if (reason === null) return;
    if (!reason.trim()) { setError("Informe o motivo da exclusão."); return; }
    if (reason.trim().length > 2000) { setError("O motivo da exclusão deve ter no máximo 2.000 caracteres."); return; }
    const action = isAdmin ? "Arquivar" : "Excluir";
    if (!window.confirm(`${action} esta solicitação? Motivo: ${reason.trim()}. Os documentos e o histórico serão preservados.`)) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      const response = await fetch(`/api/requests/${id}/archive`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: reason.trim() }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error);
      setItem(await load()); setSuccess(isAdmin ? "Solicitação arquivada. O histórico e os documentos foram preservados." : "Solicitação excluída da sua lista. O histórico e os documentos foram preservados."); router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível excluir a solicitação."); }
    finally { setBusy(false); }
  }
  async function correct(event: React.FormEvent) {
    event.preventDefault();
    if (!reopenReason.trim()) { setError("Informe o motivo da reabertura."); return; }
    if (!files.voucher || !files.contract) { setError("Anexe os dois PDFs para reabrir a solicitação."); return; }
    if (!window.confirm("Reenviar os documentos corrigidos e o motivo para nova análise do administrador?")) return;
    setBusy(true); setError(""); setSuccess("");
    const form = new FormData(); form.set("voucher", files.voucher); form.set("contract", files.contract); form.set("reason", reopenReason.trim());
    try {
      const response = await fetch(`/api/requests/${id}/correction`, { method: "POST", body: form });
      const data = await response.json() as { error?: string; status?: string };
      if (!response.ok) throw new Error(data.error);
      const updated = await load(); setItem(updated); setReopenReason("");
      setSuccess(data.status === "PENDING_REVIEW" ? "Correção enviada e análise concluída. A solicitação está na fila de aprovação do administrador." : data.status === "REJECTED" ? "Correção recebida, mas a análise automática ainda recusou a solicitação. Consulte o motivo e corrija os documentos." : data.status === "ANALYSIS_FAILED" ? "Correção recebida, mas a análise falhou. A solicitação foi atualizada; consulte o erro antes de reenviar." : "Correção enviada para análise. A solicitação foi atualizada.");
      router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Falha ao reenviar documentos."); }
    finally { setBusy(false); }
  }
  if (error && !item) return <main className="shell"><div className="notice error-notice">{error}</div></main>;
  if (!item) return <main className="shell"><div className="empty">Carregando solicitacao...</div></main>;
  const sessionUser = session.data?.user as SessionUser | undefined; const role = sessionUser?.role || "attendant"; const admin = role === "admin"; const canManage = !admin && sessionUser?.id === item.requester.id; const latest = item.analyses?.at(-1); const comparison = latest?.comparison; const currentDocs = item.documents.filter((doc) => doc.version === item.version);
  return <main className="shell"><div className="backline"><Link href={admin ? "/analise" : "/minhas-solicitacoes"}>&larr; Voltar</Link><span>Solicitação {item.id}</span></div><header className="page-heading"><div className="page-heading-left"><span className="eyebrow">{item.contractName}</span><h1>{item.actionType === "CONSIDERAR_DMA" ? "Considerar DMA" : "Desconsiderar DMA"}</h1><p>Versão {item.version} · enviada por {item.requester.name}</p></div><span className="status status-pendente">{latest?.status === "AUTO_REJECTED" ? "Recusada automaticamente pela IA" : item.status}</span></header>{error && <div className="notice error-notice">{error}</div>}{success && <div className="notice">{success}</div>}
    {item.observations && <section className="panel"><h2>Observacoes do atendente</h2><p style={{ whiteSpace: "pre-wrap" }}>{item.observations}</p></section>}<RequestManagement requestId={id} status={item.status} actionType={item.actionType} observations={item.observations} canManage={canManage} />{(admin || (canManage && item.status === "PENDING_REVIEW")) && item.status !== "ARCHIVED" && <section className="panel"><h2>{admin ? "Gestão da solicitação" : "Excluir solicitação"}</h2><p>{admin ? "Arquivar remove a solicitação das listas ativas e preserva seus documentos e histórico para consulta." : "A solicitação será removida da sua lista. O histórico e os documentos serão preservados para auditoria."}</p><button className="button danger" disabled={busy} onClick={() => void archive()}>{admin ? "Arquivar solicitação" : "Excluir solicitação"}</button></section>}{item.auditEvents?.filter((event) => event.event === "REQUEST_REOPENED").map((event) => <section className="panel" key={event.id}><h2>Reabertura · motivo informado pelo atendente</h2><p>{event.details?.reason || "Motivo não registrado."}</p></section>)}
    {item.decisions.at(-1)?.decision === "REJECT" && <section className="panel"><h2>Solicitação recusada</h2><p>{item.decisions.at(-1)?.justification}</p></section>}{latest?.status === "AUTO_REJECTED" && <section className="panel"><h2>Recusa automatica da validacao documental</h2><p>{comparison?.summary}</p><p className="subcell">Corrija os dados ou envie PDFs legiveis com nome completo e CPF do cliente nos dois documentos. Depois, use &quot;Corrigir e reabrir&quot;.</p></section>}
    <section className="panel"><div className="panel-head"><div><h2>Documentos da versão {item.version}</h2><p>Arquivos privados, exibidos somente a participantes autorizados.</p></div></div><div className="document-grid">{(["VOUCHER", "CONTRACT"] as const).map((kind) => { const doc = currentDocs.find((entry) => entry.kind === kind); return <article key={kind}><h3>{kind === "VOUCHER" ? "Voucher" : "Contrato"}</h3>{doc ? <><p>{doc.originalName}</p><iframe title={kind} src={`/api/requests/${id}/documents/${doc.id}`} /></> : <p>Documento não encontrado.</p>}</article>; })}</div></section>
    {latest && <section className="panel"><h2>Análise OpenRouter · {latest.model}</h2><p>{comparison?.summary || latest.errorCode || "A análise está em andamento."}</p>{comparison?.confidence != null && <p>Confiança estimada: {Math.round(comparison.confidence * 100)}%</p>}{comparison?.fields?.length ? <div className="table-wrap"><table><thead><tr><th>Campo</th><th>Voucher</th><th>Contrato</th><th>Resultado</th></tr></thead><tbody>{comparison.fields.map((field, index) => <tr key={`${field.name}-${index}`}><td>{field.name}</td><td>{field.voucherValue || "-"}</td><td>{field.contractValue || "-"}</td><td>{field.match === null ? "Não conclusivo" : field.match ? "Confere" : "Divergente"}</td></tr>)}</tbody></table></div> : null}<p className="subcell">A análise automática é auxiliar; a aprovação é responsabilidade do administrador.</p></section>}
    {admin && item.status === "PENDING_REVIEW" && <section className="panel"><h2>Decisao do administrador</h2><label className="filter-field">Justificativa (obrigatória para recusa)<textarea value={justification} onChange={(event) => setJustification(event.target.value)} rows={4} /></label><div className="form-actions"><button className="button primary" disabled={busy} onClick={() => decide("APPROVE")}>Validar e executar ação</button><button className="button danger" disabled={busy || !justification.trim()} onClick={() => decide("REJECT")}>Recusar e devolver</button></div></section>}
    {canManage && item.status === "REJECTED" && <section className="panel"><h2>Corrigir e reabrir</h2><p>Envie novamente os dois documentos. Uma nova análise será feita mantendo o histórico anterior.</p><form className="request-form" onSubmit={correct}><label className="filter-field">Motivo da reabertura<textarea value={reopenReason} onChange={(event) => setReopenReason(event.target.value)} rows={3} maxLength={2000} placeholder="Explique o que foi corrigido ou por que a solicitação está sendo reenviada." required /></label><label className="filter-field">Novo voucher PDF<input type="file" accept="application/pdf,.pdf" onChange={(event) => setFiles((current) => ({ ...current, voucher: event.target.files?.[0] }))} required /></label><label className="filter-field">Novo contrato PDF<input type="file" accept="application/pdf,.pdf" onChange={(event) => setFiles((current) => ({ ...current, contract: event.target.files?.[0] }))} required /></label><button className="button primary" disabled={busy}>Reabrir após corrigir</button></form></section>}
    <section className="panel"><h2>Histórico de ações</h2>{item.auditEvents?.length ? <ol className="activity-list">{item.auditEvents.map((event) => <li key={event.id}><div><strong>{auditLabels[event.event] || event.event}</strong><p>{auditDetails(event.details) || "Sem detalhes adicionais."}</p><small>{event.actor?.name || "Sistema"} · {new Date(event.createdAt).toLocaleString("pt-BR")}</small></div></li>)}</ol> : <p className="subcell">Nenhuma ação registrada.</p>}</section>
  </main>;
}
