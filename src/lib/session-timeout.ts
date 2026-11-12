/**
 * Encerramento da sessão por inatividade, por segurança.
 *
 * O navegador mede o uso real (mouse, teclado, rolagem, toque) e encerra a sessão após IDLE_TIMEOUT_MS sem uso,
 * com um aviso antes. As telas que se atualizam sozinhas não contam como uso.
 * No servidor a sessão vence um pouco depois, para cobrir quem fecha o navegador sem sair: o navegador a renova
 * a cada KEEPALIVE_INTERVAL_MS enquanto a pessoa usa o sistema, e o servidor só regrava após SESSION_UPDATE_AGE_SECONDS.
 */
export const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
export const IDLE_WARNING_MS = 60 * 1000;
export const KEEPALIVE_INTERVAL_MS = 4 * 60 * 1000;
export const SESSION_UPDATE_AGE_SECONDS = 5 * 60;
/** Inatividade + intervalo de renovação + regravação + folga: a sessão nunca vence no servidor antes do aviso. */
export const SESSION_EXPIRES_IN_SECONDS = 40 * 60;

export const IDLE_TIMEOUT_MINUTES = IDLE_TIMEOUT_MS / 60_000;
export const LAST_ACTIVITY_KEY = "conciliacao-dma-last-activity";
export const LOGOUT_KEY = "conciliacao-dma-logout";
export const IDLE_LOGOUT_REASON = "inatividade";

export type IdleState = { kind: "active" } | { kind: "warning"; remainingMs: number } | { kind: "expired" };

/** Situação da sessão a partir do último uso registrado (em qualquer aba). */
export function idleState(now: number, lastActivity: number): IdleState {
  const idle = Math.max(0, now - lastActivity);
  if (idle >= IDLE_TIMEOUT_MS) return { kind: "expired" };
  if (idle >= IDLE_TIMEOUT_MS - IDLE_WARNING_MS) return { kind: "warning", remainingMs: IDLE_TIMEOUT_MS - idle };
  return { kind: "active" };
}

/** Destino após o login: só caminhos internos, para o parâmetro não levar a outro site. */
export function safeRedirect(value: string | null | undefined) {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/";
}
