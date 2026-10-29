"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";
import { RequestManagement } from "@/components/request-management";
import { FileAttachmentField } from "@/components/file-attachment-field";
import { DeletionConfirmationDialog } from "@/components/deletion-confirmation-dialog";
import { useConfirmation } from "@/components/confirmation-provider";
import { personName } from "@/lib/person-name";
import { DOCUMENT_ACCEPT } from "@/lib/document-types";
import { ATTENDANT_MANAGEABLE_STATUSES, requiredDocumentKinds, requiresVoucher } from "@/lib/services/request-policy";
import { REQUEST_STATUS_LABELS } from "@/lib/services/request-status";

type Doc = { id: string; kind: string; version: number; originalName: string };
type Field = { name: string; voucherValue?: string; contractValue?: string; match: boolean | null };
type Comparison = { summary: string; confidence: number | null; fields: Field[] };
type Analysis = { model: string; status: string; errorCode: string | null; comparison: Comparison | null };
type Decision = { id: string; decision: string; justification: string | null; requestVersion: number; reviewer: { name: string; email?: string } };
type AuditEvent = { id: string; event: string; details: (Record<string, unknown> & { reason?: string }) | null; createdAt: string; actor: { name: string; email?: string } | null };
type RequestItem = { id: string; actionType: string; contractName: string; observations: string | null; status: string; version: number; requester: { id: string; name: string; email?: string }; documents: Doc[]; analyses: Analysis[]; decisions: Decision[]; auditEvents: AuditEvent[] };
type SessionUser = { id?: string; role?: string };
const auditLabels: Record<string, string> = { DEMO_REQUEST_CREATED: "Solicitação de demonstração registrada", REQUEST_SUBMITTED: "Solicitação aberta", REQUEST_EDITED: "Solicitação editada", REQUEST_REOPENED: "Solicitação reaberta e reenviada", AI_ANALYSIS_COMPLETED: "Análise automática concluída", AI_AUTO_REJECTED: "Recusa automática da análise documental", AI_ANALYSIS_FAILED: "Análise automática não concluída", REQUEST_REJECTED: "Solicitação recusada pelo administrador", REQUEST_APPROVED_EXECUTION_STARTED: "Ação aprovada; envio ao Coral iniciado", CORAL_EXECUTION_COMPLETED: "Ação concluída no Coral", CORAL_EXECUTION_FAILED: "Falha ao executar a ação no Coral", CORAL_EXECUTION_UNCERTAIN: "Resultado da ação no Coral não confirmado", REQUEST_CANCELLED: "Solicitação cancelada", REQUEST_ARCHIVED: "Solicitação arquivada / excluída" };
auditLabels.AI_ANALYSIS_RETRIED = "Nova tentativa de análise solicitada";
auditLabels.AI_ANALYSIS_SKIPPED = "Análise automática dispensada (Considerar DMA não exige voucher)";
const requestStatusLabels: Record<string, string> = REQUEST_STATUS_LABELS;
const auditDetailLabels: Record<string, string> = { version: "Versão", status: "Situação", previousStatus: "Situação anterior", matches: "Dados dos documentos", rejected: "Recusada automaticamente", reasons: "Motivos", contract: "Contrato", coralSimulated: "Modo de teste", removedAttachments: "Anexos removidos", previousActionType: "Ação anterior", actionType: "Ação", previousObservations: "Observações anteriores", observations: "Observações", justification: "Justificativa", historyRetained: "Histórico preservado", archivedBy: "Perfil que arquivou", reason: "Motivo", message: "Detalhe" };
function auditValue(key: string, value: unknown): string {
  if (key === "matches") return value === true ? "Conferem" : value === false ? "Divergentes" : "Não conclusivo";
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "string") {
    if (key === "status" || key === "previousStatus") return requestStatusLabels[value] || ({ SUCCEEDED: "Concluída", FAILED: "Falhou", UNCERTAIN: "Resultado não confirmado", IN_PROGRESS: "Em processamento" }[value] || value);
    if (key === "actionType" || key === "previousActionType") return value === "CONSIDERAR_DMA" ? "Considerar DMA" : value === "DESCONSIDERAR_DMA" ? "Desconsiderar DMA" : value;
    if (key === "archivedBy") return value === "admin" ? "Administrador" : value === "attendant" ? "Atendente" : value;
    return value;
  }
  if (Array.isArray(value)) return value.map((entry) => {
    if (typeof entry === "string") return entry;
    if (entry && typeof entry === "object") {
      const attachment = entry as { kind?: string; fileName?: string };
      if (attachment.kind && attachment.fileName) return (attachment.kind === "VOUCHER" ? "Voucher: " : "Contrato: ") + attachment.fileName;
    }
    return JSON.stringify(entry);
  }).join(", ");
  return value == null ? "Não informado" : JSON.stringify(value);
}
function auditDetails(details: Record<string, unknown> | null) { return Object.entries(details || {}).filter(([key]) => key !== "idempotencyKey").map(([key, value]) => `${auditDetailLabels[key] || key}: ${auditValue(key, value)}`).join(" · "); }
function analysisFailureMessage(detail: string) {
  const value = detail.toLowerCase();
  if (!detail) return "A análise automática não conseguiu ser concluída. Reenvie os documentos para tentar novamente. Se o problema continuar, peça ajuda ao administrador.";
  if (value.includes("openrouter_api_key") || value.includes("openrouter_model")) return "A análise não começou porque a integração de IA está sem configuração. Avise o administrador para verificar as configurações do serviço.";
  if (value.includes("http 401") || value.includes("http 403")) return "O serviço de análise recusou a autenticação. O administrador precisa verificar a chave de acesso da IA.";
  if (value.includes("http 402")) return "O serviço de análise está sem créditos disponíveis. Avise o administrador para verificar a conta da IA.";
  if (value.includes("http 429")) return "O serviço de análise está temporariamente ocupado. Aguarde um pouco e reenvie os documentos.";
  if (value.includes("http 400")) return "O serviço de análise não aceitou os documentos ou o modelo configurado. Verifique se os documentos estão legíveis e peça ao administrador para conferir a configuração da IA.";
  if (/http 5\d\d/.test(value)) return "O serviço de análise está temporariamente indisponível. Aguarde e reenvie os documentos.";
  if (value.includes("timeout") || value.includes("timed out") || value.includes("aborted")) return "A análise demorou além do limite e foi interrompida. Aguarde e reenvie os documentos.";
  if (value.includes("arquivo não encontrado") || value.includes("arquivo nao encontrado")) return "Não foi possível acessar um dos documentos anexados. Anexe novamente o voucher e o contrato.";
  if (value.includes("ia_resposta_cortada") || value.includes("unterminated string") || value.includes("unexpected end of json")) return "A IA leu os documentos, mas a resposta dela veio incompleta (foi cortada antes do fim). Os documentos não têm problema: use “Tentar análise novamente” com os mesmos documentos.";
  if (value.includes("ia_resposta_vazia")) return "O serviço de IA não devolveu nenhuma resposta para esta análise. Os documentos não têm problema: use “Tentar análise novamente”. Se persistir, avise o administrador.";
  if (value.includes("ia_resposta_invalida") || value.includes("formato invalido") || value.includes("formato inválido") || value.includes("json")) return "A IA respondeu em um formato que o sistema não conseguiu interpretar. Os documentos não têm problema: use “Tentar análise novamente”. Se persistir, avise o administrador.";
  return "A análise automática não foi concluída por um erro inesperado. Tente novamente; se persistir, avise o administrador e informe o detalhe técnico abaixo.";
}
function withDisplayNames(request: RequestItem): RequestItem {
  return {
    ...request,
    requester: { ...request.requester, name: personName(request.requester.name, request.requester.email) },
    decisions: request.decisions.map((decision) => ({ ...decision, reviewer: { ...decision.reviewer, name: personName(decision.reviewer.name, decision.reviewer.email) } })),
    auditEvents: request.auditEvents.map((event) => event.actor ? { ...event, actor: { ...event.actor, name: personName(event.actor.name, event.actor.email) } } : event),
  };
}
export function RequestDetail() {
  const { id } = useParams<{ id: string }>(); const router = useRouter(); const session = useSession(); const confirmAction = useConfirmation(); const [item, setItem] = useState<RequestItem | null>(null); const [error, setError] = useState(""); const [success, setSuccess] = useState(""); const [archiveDialogOpen, setArchiveDialogOpen] = useState(false); const [busy, setBusy] = useState(false); const [justification, setJustification] = useState(""); const [reopenReason, setReopenReason] = useState(""); const [files, setFiles] = useState<{ voucher?: File; contract?: File }>({}); const [removedAttachments, setRemovedAttachments] = useState<Array<{ kind: string; fileName: string; confirmed: true }>>([]);
  async function load() { const response = await fetch(`/api/requests/${id}`); const data = await response.json() as { request?: RequestItem; error?: string }; if (!response.ok || !data.request) throw new Error(data.error || "Solicitação não encontrada."); return withDisplayNames(data.request); }
  useEffect(() => {
    let active = true;
    fetch(`/api/requests/${id}`).then(async (response) => { const data = await response.json() as { request?: RequestItem; error?: string }; if (!response.ok || !data.request) throw new Error(data.error || "Solicitação não encontrada."); return withDisplayNames(data.request); }).then((request) => { if (active) setItem(request); }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Falha ao carregar solicitação."); });
    return () => { active = false; };
  }, [id]);
  async function decide(decision: "APPROVE" | "REJECT") { const message = decision === "APPROVE" ? "Aprovar e executar no Coral esta acao?" : "Recusar e devolver esta solicitacao para correcao?"; if (!await confirmAction({ title: decision === "APPROVE" ? "Aprovar solicitação?" : "Recusar solicitação?", description: message, confirmLabel: decision === "APPROVE" ? "Aprovar e executar" : "Confirmar recusa", danger: decision === "REJECT" })) return; setBusy(true); setError(""); try { const response = await fetch(`/api/requests/${id}/decision`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, justification }) }); const data = await response.json() as { error?: string }; if (!response.ok) throw new Error(data.error); setItem(await load()); router.refresh(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Falha ao decidir."); } finally { setBusy(false); } }
  async function archive(reason: string): Promise<boolean> {
    const isAdmin = (session.data?.user as SessionUser | undefined)?.role === "admin";
    setBusy(true); setError(""); setSuccess("");
    try {
      const response = await fetch(`/api/requests/${id}/archive`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error);
      setItem(await load());
      setSuccess(isAdmin ? "Solicitação arquivada. O histórico e os documentos foram preservados." : "Solicitação excluída da sua lista. O histórico e os documentos foram preservados.");
      router.refresh();
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível excluir a solicitação.");
      return false;
    } finally { setBusy(false); }
  }
  async function correct(event: React.FormEvent) {
    event.preventDefault();
    if (!reopenReason.trim()) { setError("Informe o motivo da reabertura."); return; }
    const needsVoucher = requiresVoucher(item?.actionType || "");
    if (!files.contract || (needsVoucher && !files.voucher)) { setError(needsVoucher ? "Anexe os dois documentos para reabrir a solicitação." : "Anexe o contrato para reabrir a solicitação."); return; }
    if (!await confirmAction({ title: "Reenviar correção?", description: "Os documentos serão analisados novamente e a solicitação voltará para aprovação do administrador.", confirmLabel: "Enviar correção" })) return;
    setBusy(true); setError(""); setSuccess("");
    const form = new FormData(); if (needsVoucher && files.voucher) form.set("voucher", files.voucher); form.set("contract", files.contract); form.set("reason", reopenReason.trim()); form.set("removedAttachments", JSON.stringify(removedAttachments));
    try {
      const response = await fetch(`/api/requests/${id}/correction`, { method: "POST", body: form });
      const data = await response.json() as { error?: string; status?: string };
      if (!response.ok) throw new Error(data.error);
      const updated = await load(); setItem(updated); setReopenReason(""); setRemovedAttachments([]);
      setSuccess(data.status === "PENDING_REVIEW" ? "Correção enviada e análise concluída. A solicitação está na fila de aprovação do administrador." : data.status === "REJECTED" ? "Correção recebida, mas a análise automática ainda recusou a solicitação. Consulte o motivo e corrija os documentos." : data.status === "ANALYSIS_FAILED" ? "Correção recebida, mas a análise falhou. A solicitação foi atualizada; consulte o erro antes de reenviar." : "Correção enviada para análise. A solicitação foi atualizada.");
      router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Falha ao reenviar documentos."); }
    finally { setBusy(false); }
  }
  if (error && !item) return <main className="shell"><div className="notice error-notice">{error}</div></main>;
  if (!item) return <main className="shell"><div className="empty">Carregando solicitacao...</div></main>;
  const sessionUser = session.data?.user as SessionUser | undefined; const role = sessionUser?.role || "attendant"; const admin = role === "admin"; const canManage = !admin && sessionUser?.id === item.requester.id; const latest = item.analyses?.[0]; const lastDecision = item.decisions[0]; const currentRejection = item.status === "REJECTED" && lastDecision?.decision === "REJECT" && lastDecision.requestVersion === item.version ? lastDecision : null; const comparison = latest?.comparison; const currentDocs = item.documents.filter((doc) => doc.version === item.version);
  return <main className="shell"><div className="backline"><Link href={admin ? "/analise" : "/minhas-solicitacoes"}>&larr; Voltar</Link><span>Solicitação {item.id}</span></div><header className="page-heading"><div className="page-heading-left"><span className="eyebrow">{item.contractName}</span><h1>{item.actionType === "CONSIDERAR_DMA" ? "Considerar DMA" : "Desconsiderar DMA"}</h1><p>Versão {item.version} · enviada por {item.requester.name}</p></div><span className="status status-pendente">{latest?.status === "AUTO_REJECTED" ? "Recusada automaticamente pela análise documental" : requestStatusLabels[item.status] || "Status não reconhecido"}</span></header>{error && <div className="notice error-notice">{error}</div>}{success && <div className="notice">{success}</div>}
    {item.observations && <section className="panel"><h2>Observacoes do atendente</h2><p style={{ whiteSpace: "pre-wrap" }}>{item.observations}</p></section>}<RequestManagement requestId={id} status={item.status} actionType={item.actionType} observations={item.observations} canManage={canManage} />{(admin || (canManage && ATTENDANT_MANAGEABLE_STATUSES.includes(item.status))) && item.status !== "ARCHIVED" && <section className="panel"><h2>{admin ? "Gestão da solicitação" : "Excluir solicitação"}</h2><p>{admin ? "Arquivar remove a solicitação das listas ativas e preserva seus documentos e histórico para consulta." : "A solicitação será removida da sua lista. O histórico e os documentos serão preservados para auditoria."}</p><button className="button danger" disabled={busy} onClick={() => setArchiveDialogOpen(true)}>{admin ? "Arquivar solicitação" : "Excluir solicitação"}</button></section>}{item.auditEvents?.filter((event) => event.event === "REQUEST_REOPENED").map((event) => <section className="panel" key={event.id}><h2>Reabertura · motivo informado pelo atendente</h2><p>{event.details?.reason || "Motivo não registrado."}</p></section>)}
    {currentRejection && <section className="panel"><h2>Solicitação recusada</h2><p>{currentRejection.justification}</p></section>}{latest?.status === "AUTO_REJECTED" && <section className="panel"><h2>Recusa automática da validação documental</h2><p>{comparison?.summary || "A análise identificou informações ausentes ou ilegíveis nos documentos."}</p><p className="subcell">{requiresVoucher(item.actionType) ? "Confira se o contrato anexado é o mesmo validado no Coral e envie documentos legíveis com nome completo e CPF do cliente nos dois documentos." : "Confira se o contrato anexado é o mesmo validado no Coral e se o número do contrato está legível."} Depois, use “Corrigir e reabrir”.</p></section>}{item.status === "ANALYSIS_FAILED" && <section className="panel"><h2>Por que a solicitação não seguiu para aprovação?</h2><p>{analysisFailureMessage(String(latest?.errorCode || item.auditEvents.find((event) => event.event === "AI_ANALYSIS_FAILED")?.details?.message || ""))}</p><details><summary>Detalhe do erro</summary><p className="subcell">{String(latest?.errorCode || item.auditEvents.find((event) => event.event === "AI_ANALYSIS_FAILED")?.details?.message || "O sistema não registrou detalhes técnicos adicionais.")}</p></details><p className="subcell">A análise automática não foi concluída, então a solicitação não chegou à fila de aprovação do administrador. Siga a orientação acima: quando o problema não estiver nos documentos, use “Tentar análise novamente” no fim da página; se precisar trocar os documentos, use “Corrigir e reenviar para análise”.</p></section>}
    <section className="panel"><div className="panel-head"><div><h2>Documentos da versão {item.version}</h2><p>Arquivos privados, exibidos somente a participantes autorizados.</p></div></div><div className="document-grid">{(["VOUCHER", "CONTRACT"] as const).filter((kind) => requiredDocumentKinds(item.actionType).includes(kind) || currentDocs.some((entry) => entry.kind === kind)).map((kind) => { const doc = currentDocs.find((entry) => entry.kind === kind); return <article key={kind}><h3>{kind === "VOUCHER" ? "Voucher" : "Contrato"}</h3>{doc ? <><p>{doc.originalName}</p><iframe title={kind} src={`/api/requests/${id}/documents/${doc.id}`} /></> : <p>Documento não encontrado.</p>}</article>; })}</div></section>
    {latest && <section className="panel"><h2>Análise OpenRouter · {latest.model}</h2><p>{comparison?.summary || (latest.errorCode ? analysisFailureMessage(latest.errorCode) : "A análise está em andamento.")}</p>{comparison?.confidence != null && <p>Confiança estimada: {Math.round(comparison.confidence * 100)}%</p>}{comparison?.fields?.length ? <div className="table-wrap"><table><thead><tr><th>Campo</th><th>Voucher</th><th>Contrato</th><th>Resultado</th></tr></thead><tbody>{comparison.fields.map((field, index) => <tr key={`${field.name}-${index}`}><td>{field.name}</td><td>{field.voucherValue || "-"}</td><td>{field.contractValue || "-"}</td><td>{field.match === null ? "Não conclusivo" : field.match ? "Confere" : "Divergente"}</td></tr>)}</tbody></table></div> : null}<p className="subcell">A análise automática é auxiliar; a aprovação é responsabilidade do administrador.</p></section>}
    {admin && item.status === "PENDING_REVIEW" && <section className="panel"><h2>Decisao do administrador</h2><label className="filter-field">Justificativa (obrigatória para recusa)<textarea value={justification} onChange={(event) => setJustification(event.target.value)} rows={4} /></label><div className="form-actions"><button className="button primary" disabled={busy} onClick={() => decide("APPROVE")}>Validar e executar ação</button><button className="button danger" disabled={busy || !justification.trim()} onClick={() => decide("REJECT")}>Recusar e devolver</button></div></section>}
    {canManage && ["REJECTED", "ANALYSIS_FAILED"].includes(item.status) && <section className="panel"><h2>{item.status === "ANALYSIS_FAILED" ? "Corrigir e reenviar para análise" : "Corrigir e reabrir"}</h2><p>Informe o que está corrigindo e envie novamente {requiresVoucher(item.actionType) ? "os dois documentos" : "o contrato"}. O histórico será mantido e, se a análise for concluída, a solicitação seguirá para aprovação do administrador.</p><form className="request-form" onSubmit={correct}><label className="filter-field">Motivo da reabertura<textarea value={reopenReason} onChange={(event) => setReopenReason(event.target.value)} rows={3} maxLength={2000} placeholder="Explique o que foi corrigido ou por que está reenviando." required /></label>{requiresVoucher(item.actionType) && <FileAttachmentField label="Novo voucher (PDF ou imagem)" name="voucher" accept={DOCUMENT_ACCEPT} file={files.voucher || null} required onFileChange={(file) => setFiles((current) => ({ ...current, voucher: file || undefined }))} onRemove={(file) => setRemovedAttachments((current) => [...current, { kind: "VOUCHER", fileName: file.name, confirmed: true }])} />}<FileAttachmentField label="Novo contrato (PDF ou imagem)" name="contract" accept={DOCUMENT_ACCEPT} file={files.contract || null} required onFileChange={(file) => setFiles((current) => ({ ...current, contract: file || undefined }))} onRemove={(file) => setRemovedAttachments((current) => [...current, { kind: "CONTRACT", fileName: file.name, confirmed: true }])} /><button className="button primary" disabled={busy}>{busy ? "Enviando correção…" : "Reabrir após corrigir"}</button></form></section>}
    <section className="panel"><h2>Histórico de ações</h2>{item.auditEvents?.length ? <ol className="activity-list">{item.auditEvents.map((event) => <li key={event.id}><div><strong>{auditLabels[event.event] || event.event}</strong><p>{auditDetails(event.details) || "Sem detalhes adicionais."}</p><small>{event.actor?.name || "Sistema"} · {new Date(event.createdAt).toLocaleString("pt-BR")}</small></div></li>)}</ol> : <p className="subcell">Nenhuma ação registrada.</p>}</section>
  <DeletionConfirmationDialog open={archiveDialogOpen} title={admin ? "Arquivar solicitação?" : "Excluir solicitação?"} description="O motivo será registrado. Os documentos e o histórico da solicitação serão preservados para auditoria." confirmLabel={admin ? "Confirmar arquivamento" : "Confirmar exclusão"} onConfirm={archive} onCancel={() => setArchiveDialogOpen(false)} /></main>;
}
