"use client";
import { useEffect, useRef, useState } from "react";
import { authClient, signOut, useSession } from "@/lib/auth-client";
import {
  IDLE_LOGOUT_REASON,
  IDLE_TIMEOUT_MINUTES,
  KEEPALIVE_INTERVAL_MS,
  LAST_ACTIVITY_KEY,
  LOGOUT_KEY,
  idleState,
} from "@/lib/session-timeout";

const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "wheel", "scroll", "touchstart"] as const;

function readStored(key: string) {
  try {
    return Number(window.localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
}
function writeStored(key: string, value: number) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    /* armazenamento bloqueado: cada aba conta só o próprio uso */
  }
}
function loginUrl() {
  const back = `${window.location.pathname}${window.location.search}`;
  return `/login?motivo=${IDLE_LOGOUT_REASON}&redirect=${encodeURIComponent(back)}`;
}

/**
 * Encerra a sessão após o tempo de inatividade, com aviso no último minuto. O uso em qualquer aba conta para todas,
 * e o encerramento em uma aba leva as outras para o login. Enquanto há uso, renova a sessão no servidor.
 */
export function SessionTimeout() {
  const session = useSession();
  const signedIn = Boolean(session.data);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const continueRef = useRef<() => void>(() => undefined);
  const logoutRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (!signedIn) return;
    let lastActivity = Date.now();
    let lastWrite = 0;
    let lastKeepAlive = Date.now();
    let ended = false;

    const markActivity = () => {
      const now = Date.now();
      lastActivity = now;
      if (now - lastWrite > 5000) {
        lastWrite = now;
        writeStored(LAST_ACTIVITY_KEY, now);
      }
      if (now - lastKeepAlive >= KEEPALIVE_INTERVAL_MS) {
        lastKeepAlive = now;
        void authClient.getSession().catch(() => undefined);
      }
      setRemainingMs(null);
    };
    const endSession = () => {
      if (ended) return;
      ended = true;
      writeStored(LOGOUT_KEY, Date.now());
      void signOut()
        .catch(() => undefined)
        .finally(() => window.location.replace(loginUrl()));
    };
    const check = () => {
      if (ended) return;
      const state = idleState(Date.now(), Math.max(lastActivity, readStored(LAST_ACTIVITY_KEY)));
      if (state.kind === "expired") endSession();
      else setRemainingMs(state.kind === "warning" ? state.remainingMs : null);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== LOGOUT_KEY || ended) return;
      ended = true;
      window.location.replace(loginUrl());
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };

    continueRef.current = () => {
      lastKeepAlive = 0;
      markActivity();
    };
    logoutRef.current = endSession;
    lastWrite = Date.now();
    writeStored(LAST_ACTIVITY_KEY, lastActivity);
    const options = { capture: true, passive: true } as const;
    for (const name of ACTIVITY_EVENTS) window.addEventListener(name, markActivity, options);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(check, 1000);
    return () => {
      for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, markActivity, options);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
      setRemainingMs(null);
    };
  }, [signedIn]);

  if (!signedIn || remainingMs === null) return null;
  const seconds = Math.max(1, Math.ceil(remainingMs / 1000));
  return (
    <div className="deletion-dialog-backdrop">
      <section
        className="deletion-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="session-timeout-title"
        aria-describedby="session-timeout-description"
      >
        <span className="eyebrow">Segurança</span>
        <h2 id="session-timeout-title">Sua sessão vai expirar</h2>
        <p id="session-timeout-description">
          Por segurança, a sessão é encerrada após {IDLE_TIMEOUT_MINUTES} minutos sem atividade. Você será desconectado em{" "}
          <strong>
            {seconds} {seconds === 1 ? "segundo" : "segundos"}
          </strong>
          .
        </p>
        <div className="form-actions deletion-dialog-actions">
          <button type="button" className="button secondary" onClick={() => logoutRef.current()}>
            Sair agora
          </button>
          <button type="button" className="button primary" onClick={() => continueRef.current()} autoFocus>
            Continuar conectado
          </button>
        </div>
      </section>
    </div>
  );
}
