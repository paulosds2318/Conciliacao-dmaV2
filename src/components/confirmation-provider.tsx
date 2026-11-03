"use client";
import { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";

export type ConfirmationOptions = {
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
};

/** Confirmação que exige um motivo, registrado no histórico de auditoria. */
export type ReasonOptions = ConfirmationOptions & { reasonLabel: string; reasonPlaceholder?: string };

type ConfirmationRequest =
  | { kind: "confirm"; options: ConfirmationOptions; resolve: (confirmed: boolean) => void }
  | { kind: "reason"; options: ReasonOptions; resolve: (reason: string | null) => void };
type ConfirmationApi = {
  confirm: (options: ConfirmationOptions) => Promise<boolean>;
  askReason: (options: ReasonOptions) => Promise<string | null>;
};
const ConfirmationContext = createContext<ConfirmationApi | null>(null);

export function ConfirmationProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<ConfirmationRequest | null>(null);
  const [reason, setReason] = useState("");
  const confirm = useCallback(
    (options: ConfirmationOptions) =>
      new Promise<boolean>((resolve) => {
        setPending({ kind: "confirm", options, resolve });
      }),
    [],
  );
  const askReason = useCallback(
    (options: ReasonOptions) =>
      new Promise<string | null>((resolve) => {
        setReason("");
        setPending({ kind: "reason", options, resolve });
      }),
    [],
  );

  function respond(confirmed: boolean) {
    if (pending?.kind === "reason") pending.resolve(confirmed ? reason.trim() : null);
    else pending?.resolve(confirmed);
    setPending(null);
    setReason("");
  }

  const needsReason = pending?.kind === "reason";
  return (
    <ConfirmationContext.Provider value={{ confirm, askReason }}>
      {children}
      {pending && (
        <div className="deletion-dialog-backdrop">
          <section className="deletion-dialog" role="dialog" aria-modal="true" aria-labelledby="action-confirmation-title">
            <span className="eyebrow">Confirmação necessária</span>
            <h2 id="action-confirmation-title">{pending.options.title}</h2>
            <p>{pending.options.description}</p>
            {pending.kind === "reason" && (
              <label className="filter-field">
                {pending.options.reasonLabel}
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={2000}
                  rows={4}
                  autoFocus
                  placeholder={pending.options.reasonPlaceholder}
                />
                <small>Obrigatório, até 2.000 caracteres. Fica registrado no histórico.</small>
              </label>
            )}
            <div className="form-actions deletion-dialog-actions">
              <button type="button" className="button secondary" onClick={() => respond(false)} autoFocus={!needsReason}>
                Voltar
              </button>
              <button
                type="button"
                className={pending.options.danger ? "button danger" : "button primary"}
                onClick={() => respond(true)}
                disabled={needsReason && !reason.trim()}
              >
                {pending.options.confirmLabel || "Confirmar"}
              </button>
            </div>
          </section>
        </div>
      )}
    </ConfirmationContext.Provider>
  );
}

export function useConfirmation() {
  const api = useContext(ConfirmationContext);
  if (!api) throw new Error("useConfirmation deve ser usado dentro de ConfirmationProvider.");
  return api.confirm;
}

export function useReasonPrompt() {
  const api = useContext(ConfirmationContext);
  if (!api) throw new Error("useReasonPrompt deve ser usado dentro de ConfirmationProvider.");
  return api.askReason;
}
