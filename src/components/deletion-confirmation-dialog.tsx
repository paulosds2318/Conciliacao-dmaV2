"use client";
import { useState } from "react";

type Props = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: (reason: string) => boolean | void | Promise<boolean | void>;
  onCancel: () => void;
};

export function DeletionConfirmationDialog({ open, title, description, confirmLabel = "Confirmar exclusão", onConfirm, onCancel }: Props) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  if (!open) return null;

  function cancel() {
    setReason("");
    onCancel();
  }

  async function confirm() {
    if (!reason.trim() || busy) return;
    setBusy(true);
    try {
      const completed = await onConfirm(reason.trim());
      if (completed !== false) {
        setReason("");
        cancel();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="deletion-dialog-backdrop">
      <section className="deletion-dialog" role="dialog" aria-modal="true" aria-labelledby="deletion-dialog-title">
        <span className="eyebrow">Confirmação necessária</span>
        <h2 id="deletion-dialog-title">{title}</h2>
        <p>{description}</p>
        <label className="filter-field">
          Motivo da exclusão
          <textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={2000} rows={4} autoFocus placeholder="Descreva por que este item está sendo removido." />
          <small>Obrigatório, até 2.000 caracteres.</small>
        </label>
        <div className="form-actions deletion-dialog-actions">
          <button type="button" className="button secondary" onClick={cancel} disabled={busy}>Cancelar</button>
          <button type="button" className="button danger" onClick={() => void confirm()} disabled={!reason.trim() || busy}>{busy ? "Confirmando..." : confirmLabel}</button>
        </div>
      </section>
    </div>
  );
}
