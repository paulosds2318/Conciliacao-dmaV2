"use client";
import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "@/lib/auth-client";
import { IDLE_LOGOUT_REASON, IDLE_TIMEOUT_MINUTES, safeRedirect } from "@/lib/session-timeout";
export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const redirect = safeRedirect(params.get("redirect"));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    const result = await signIn.email({
      email: String(data.get("email")),
      password: String(data.get("password")),
      callbackURL: redirect,
    });
    setBusy(false);
    if (result.error) {
      setError("Não foi possível entrar. Confira seu e-mail e senha.");
      return;
    }
    router.push(redirect);
    router.refresh();
  }
  return (
    <form className="request-form login-form" onSubmit={submit}>
      {params.get("motivo") === IDLE_LOGOUT_REASON && (
        <div className="notice" role="status">
          Sua sessão foi encerrada após {IDLE_TIMEOUT_MINUTES} minutos sem atividade. Entre novamente para continuar.
        </div>
      )}
      <label className="filter-field">
        E-mail corporativo
        <input name="email" type="email" autoComplete="username" required />
      </label>
      <label className="filter-field">
        Senha
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      {error && <div className="notice error-notice">{error}</div>}
      <button className="button primary" disabled={busy}>
        {busy ? "Entrando…" : "Entrar na Plataforma"}
      </button>
    </form>
  );
}
