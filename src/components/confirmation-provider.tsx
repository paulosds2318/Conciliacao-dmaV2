"use client";
import { createContext, useCallback, useContext, useState } from "react";
import type { ReactNode } from "react";

export type ConfirmationOptions = {
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
};

type ConfirmationRequest = { options: ConfirmationOptions; resolve: (confirmed: boolean) => void };
const ConfirmationContext = createContext<((options: ConfirmationOptions) => Promise<boolean>) | null>(null);

export function ConfirmationProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<ConfirmationRequest | null>(null);
  const confirm = useCallback((options: ConfirmationOptions) => new Promise<boolean>((resolve) => {
    setPending({ options, resolve });
  }), []);

  function respond(confirmed: boolean) {
    pending?.resolve(confirmed);
    setPending(null);
  }

  return (
    <ConfirmationContext.Provider value={confirm}>
      {children}
      {pending && (
        <div className="deletion-dialog-backdrop">
          <section className="deletion-dialog" role="dialog" aria-modal="true" aria-labelledby="action-confirmation-title">
            <span className="eyebrow">Confirmação necessária</span>
            <h2 id="action-confirmation-title">{pending.options.title}</h2>
            <p>{pending.options.description}</p>
            <div className="form-actions deletion-dialog-actions">
              <button type="button" className="button secondary" onClick={() => respond(false)} autoFocus>Cancelar</button>
              <button type="button" className={pending.options.danger ? "button danger" : "button primary"} onClick={() => respond(true)}>
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
  const confirm = useContext(ConfirmationContext);
  if (!confirm) throw new Error("useConfirmation deve ser usado dentro de ConfirmationProvider.");
  return confirm;
}
