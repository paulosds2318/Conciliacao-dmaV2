"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
type Props = { requestId: string; status: string; actionType: string; observations: string | null; canManage: boolean };
const editableStatuses = ["PENDING_REVIEW", "REJECTED", "ANALYSIS_FAILED"];
const cancellableStatuses = ["DRAFT", "ANALYSIS_FAILED", "PENDING_REVIEW", "REJECTED", "CORRECTION"];
export function RequestManagement({ requestId, status, actionType, observations, canManage }: Props) {
  const router = useRouter(); const [action, setAction] = useState(actionType); const [note, setNote] = useState(observations || "");
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [success, setSuccess] = useState("");
  if (!canManage || (!editableStatuses.includes(status) && !cancellableStatuses.includes(status))) return null;
  async function edit() {
    if (!window.confirm("Confirmar o salvamento das alteracoes desta solicitacao?")) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      const response = await fetch(`/api/requests/${requestId}/edit`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actionType: action, observations: note }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível salvar as alterações.");
      setSuccess("Alterações salvas."); router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Falha ao editar a solicitação."); }
    finally { setBusy(false); }
  }
  async function cancel() {
    if (!window.confirm("Deseja cancelar esta solicitação? Essa operação não pode ser desfeita.")) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      const response = await fetch(`/api/requests/${requestId}/cancel`, { method: "POST" });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível cancelar a solicitação.");
      router.push("/minhas-solicitacoes"); router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Falha ao cancelar a solicitação."); }
    finally { setBusy(false); }
  }
  return <section className="panel"><h2>Gerenciar solicitação</h2>{editableStatuses.includes(status) ? <><label className="filter-field">Ação<select value={action} onChange={(event) => setAction(event.target.value)}><option value="CONSIDERAR_DMA">Considerar DMA</option><option value="DESCONSIDERAR_DMA">Desconsiderar DMA</option></select></label><label className="filter-field">Observações<textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} maxLength={2000} /></label><p className="subcell">O contrato e os PDFs validados não podem ser alterados aqui. Se houver erro nesses dados, peça ao admin para reprovar e então reenvie a correção.</p><div className="form-actions"><button className="button primary" disabled={busy || (action === actionType && note === (observations || ""))} onClick={() => void edit()}>{busy ? "Salvando…" : "Salvar alterações"}</button></div></> : <p className="subcell">Esta solicitação não pode mais ser editada no status atual.</p>}{cancellableStatuses.includes(status) && <div className="form-actions"><button className="button danger" disabled={busy} onClick={() => void cancel()}>Cancelar solicitação</button></div>}{error && <div className="notice error-notice">{error}</div>}{success && <div className="notice">{success}</div>}</section>;
}