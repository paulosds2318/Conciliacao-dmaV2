"use client";
import Link from "next/link";
import { useState } from "react";
import { useConfirmation } from "@/components/confirmation-provider";
import { useRouter } from "next/navigation";
import { FileAttachmentField } from "@/components/file-attachment-field";
import { DOCUMENT_ACCEPT, DOCUMENT_FORMATS_LABEL } from "@/lib/document-types";
import { requiresVoucher } from "@/lib/services/request-policy";

type Removal = { kind: string; fileName: string; confirmed: true };

export function RequestForm() {
  const router = useRouter();
  const confirmAction = useConfirmation();
  const [contract, setContract] = useState("");
  const [valid, setValid] = useState(false);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [actionType, setActionType] = useState("");
  const [voucherFile, setVoucherFile] = useState<File | null>(null);
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [removedAttachments, setRemovedAttachments] = useState<Removal[]>([]);

  async function validateContract() {
    setChecking(true); setValid(false); setMessage("");
    try {
      const response = await fetch(`/api/contracts?number=${encodeURIComponent(contract.trim())}`, { cache: "no-store" });
      const data = await response.json() as { contract?: { id?: string | null; displayName?: string }; error?: string };
      if (response.status === 401) throw new Error("Sua sessão expirou. Entre novamente para validar o contrato.");
      if (response.status === 404) throw new Error(data.error || "Contrato não encontrado no Coral. Confira o número e tente novamente.");
      if (!response.ok || !data.contract) throw new Error(data.error || "Não foi possível validar o contrato no Coral.");
      if (!data.contract.id) throw new Error("O Coral não retornou o identificador interno deste contrato. Não é possível abrir uma solicitação para ele agora.");
      setValid(true); setMessage(`Contrato validado no Coral: ${data.contract.displayName || contract.trim()}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao validar contrato no Coral.");
    } finally { setChecking(false); }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage("");
    const form = event.currentTarget;
    const data = new FormData(form);
    const voucher = data.get("voucher");
    const pdfContract = data.get("contract");
    if (!(pdfContract instanceof File) || !pdfContract.size) { setMessage("Anexe o contrato."); return; }
    if (needsVoucher && (!(voucher instanceof File) || !voucher.size)) {
      setMessage("Anexe o voucher e o contrato. Os dois arquivos são obrigatórios para desconsiderar DMA."); return;
    }
    if (!needsVoucher) data.delete("voucher");
    if (!valid) { setMessage("Valide o contrato no Coral antes de enviar."); return; }
    if (!await confirmAction({ title: "Enviar solicitação?", description: needsVoucher ? "Os dois documentos serão analisados e a solicitação seguirá para decisão do administrador." : "O número do contrato anexado será conferido com o contrato validado no Coral e a solicitação seguirá para decisão do administrador.", confirmLabel: "Enviar para análise" })) return;
    data.set("removedAttachments", JSON.stringify(removedAttachments));
    setBusy(true);
    try {
      const response = await fetch("/api/requests", { method: "POST", body: data });
      const result = await response.json();
      if (!response.ok && response.status !== 201) throw new Error(result.error);
      router.push(`/solicitacoes/${result.requestId}`); router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao enviar solicitação.");
    } finally { setBusy(false); }
  }

  const pdfAccept = DOCUMENT_ACCEPT;
  const needsVoucher = requiresVoucher(actionType);
  return (
    <main className="shell">
      <header className="page-heading">
        <div className="page-heading-left"><span className="eyebrow">Atendente</span><h1>Nova solicitação</h1><p>Escolha a ação, valide o contrato no Coral e anexe os documentos.</p></div>
        <Link className="button secondary" href="/">Voltar</Link>
      </header>
      <section className="panel">
        <div className="notice">Desconsiderar DMA exige voucher e contrato; Considerar DMA exige somente o contrato ({DOCUMENT_FORMATS_LABEL}). O administrador tomará a decisão final.</div>
        <form className="request-form" onSubmit={submit}>
          <label className="filter-field">Ação desejada<select name="actionType" value={actionType} onChange={(event) => setActionType(event.target.value)} required><option value="" disabled>Selecione uma ação</option><option value="CONSIDERAR_DMA">Considerar DMA</option><option value="DESCONSIDERAR_DMA">Desconsiderar DMA</option></select></label>
          <label className="filter-field">Observações (opcional)<textarea name="observations" rows={4} maxLength={2000} placeholder="Inclua contexto ou detalhes importantes para a análise." /></label>
          <p className="subcell">Máximo de 2.000 caracteres.</p>
          <label className="filter-field">Número do contrato<input name="contractName" value={contract} onChange={(event) => { setContract(event.target.value); setValid(false); setMessage(""); }} placeholder="Digite o número do contrato" required /></label>
          <button className="button secondary" type="button" onClick={() => void validateContract()} disabled={checking || !contract.trim()}>{checking ? "Consultando..." : "Validar contrato no Coral"}</button>
          {message && <div className={`notice ${valid ? "" : "error-notice"}`}>{message}</div>}
          <div className="filter-bar">
            {needsVoucher && <FileAttachmentField label="Voucher (PDF ou imagem)" name="voucher" accept={pdfAccept} file={voucherFile} required onFileChange={setVoucherFile} onRemove={(file) => setRemovedAttachments((current) => [...current, { kind: "VOUCHER", fileName: file.name, confirmed: true }])} />}
            <FileAttachmentField label="Contrato (PDF ou imagem)" name="contract" accept={pdfAccept} file={contractFile} required onFileChange={setContractFile} onRemove={(file) => setRemovedAttachments((current) => [...current, { kind: "CONTRACT", fileName: file.name, confirmed: true }])} />
          </div>
          <p className="subcell">Limite: {process.env.NEXT_PUBLIC_MAX_PDF_SIZE_MB || "20"} MB por arquivo. Formatos aceitos: {DOCUMENT_FORMATS_LABEL}. O formato real será conferido no servidor.</p>
          <button className="button primary" type="submit" disabled={busy || !valid}>{busy ? "Enviando e analisando…" : "Enviar para análise"}</button>
        </form>
      </section>
    </main>
  );
}
