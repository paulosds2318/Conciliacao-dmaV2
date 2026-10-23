"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function RequestForm() {
  const router = useRouter(); const [contract, setContract] = useState(""); const [valid, setValid] = useState(false); const [checking, setChecking] = useState(false); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  async function validateContract() {
    setChecking(true); setValid(false); setMessage("");
    try { const r = await fetch(`/api/contracts?number=${encodeURIComponent(contract.trim())}`); const data = await r.json(); if (!r.ok) throw new Error(data.error); setValid(true); setMessage(`Contrato validado no Coral: ${data.contract.displayName}`); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Não foi possível validar o contrato."); }
    finally { setChecking(false); }
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(""); const form = event.currentTarget; const data = new FormData(form); const voucher = data.get("voucher"); const pdfContract = data.get("contract");
    if (!(voucher instanceof File) || !voucher.size || !(pdfContract instanceof File) || !pdfContract.size) { setMessage("Anexe o voucher e o contrato. Os dois arquivos são obrigatórios."); return; }
    if (!valid) { setMessage("Valide o contrato no Coral antes de enviar."); return; }
    if (!window.confirm("Enviar esta solicitacao para analise automatica e decisao do administrador?")) return;
    setBusy(true);
    try { const response = await fetch("/api/requests", { method: "POST", body: data }); const result = await response.json(); if (!response.ok && response.status !== 201) throw new Error(result.error); router.push(`/solicitacoes/${result.requestId}`); router.refresh(); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Falha ao enviar solicitação."); }
    finally { setBusy(false); }
  }
  return <main className="shell"><header className="page-heading"><div className="page-heading-left"><span className="eyebrow">Atendente</span><h1>Nova solicitação</h1><p>Escolha a ação, valide o contrato e envie os dois documentos.</p></div><Link className="button secondary" href="/">Voltar</Link></header><section className="panel"><div className="notice">Voucher e contrato em PDF são obrigatórios. O administrador tomará a decisão final após a análise automática.</div><form className="request-form" onSubmit={submit}><label className="filter-field">Ação desejada<select name="actionType" defaultValue="" required><option value="" disabled>Selecione uma ação</option><option value="CONSIDERAR_DMA">Considerar DMA</option><option value="DESCONSIDERAR_DMA">Desconsiderar DMA</option></select></label><label className="filter-field">Observações (opcional)<textarea name="observations" rows={4} maxLength={2000} placeholder="Inclua contexto ou detalhes importantes para a análise." /></label><p className="subcell">Máximo de 2.000 caracteres.</p><label className="filter-field">Número do contrato Coral<input name="contractName" value={contract} onChange={(e) => { setContract(e.target.value); setValid(false); }} placeholder="Digite o número do contrato" required /></label><button className="button secondary" type="button" onClick={validateContract} disabled={checking || !contract.trim()}>{checking ? "Consultando…" : "Validar contrato no Coral"}</button>{message && <div className={`notice ${valid ? "" : "error-notice"}`}>{message}</div>}<div className="filter-bar"><label className="filter-field">Voucher (PDF)<input name="voucher" type="file" accept="application/pdf,.pdf" required /></label><label className="filter-field">Contrato (PDF)<input name="contract" type="file" accept="application/pdf,.pdf" required /></label></div><p className="subcell">Limite: {process.env.NEXT_PUBLIC_MAX_PDF_SIZE_MB || "20"} MB por arquivo. A validade real do PDF será conferida no servidor.</p><button className="button primary" type="submit" disabled={busy || !valid}>{busy ? "Enviando e analisando…" : "Enviar para análise"}</button></form></section></main>;
}
