"use client";
import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth-client";

/** Avisa com antecedência; a chave do Coral dura 1 hora. */
const WARN_BEFORE_MS = 15 * 60 * 1000;

function timeLabel(timestamp: number) {
  const date = new Date(timestamp);
  const sameDay = date.toDateString() === new Date().toDateString();
  return sameDay
    ? date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/** Aviso ao administrador quando a chave do Coral está para vencer ou já venceu: consultas e envios ao Coral param sem ela. */
export function CoralTokenNotice({ expiresAt }: { expiresAt: number | null }) {
  const session = useSession();
  // O horário vem do navegador, depois de montar, para não divergir da renderização no servidor.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const interval = window.setInterval(tick, 30_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, []);
  const isAdmin = (session.data?.user as { role?: string } | undefined)?.role === "admin";
  if (!isAdmin || !expiresAt || now === null || expiresAt - now > WARN_BEFORE_MS) return null;
  const expired = expiresAt <= now;
  const minutes = Math.max(1, Math.ceil((expiresAt - now) / 60_000));
  return (
    <div className="coral-token-notice">
      <div className={`notice ${expired ? "error-notice" : "warning-notice"}`} role="alert">
        {expired
          ? `A chave do Coral venceu às ${timeLabel(expiresAt)}. Consultas de contrato e envios ao Coral estão falhando até a chave (CORAL_AUTH_TOKEN) ser renovada.`
          : `A chave do Coral vence às ${timeLabel(expiresAt)} (em ${minutes} min). Renove a chave (CORAL_AUTH_TOKEN) para não interromper consultas e envios ao Coral.`}
      </div>
    </div>
  );
}
