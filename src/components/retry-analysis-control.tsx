"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { useConfirmation } from "@/components/confirmation-provider";

type RequestSnapshot = { status: string; requester: { id: string } };
type SessionUser = { id?: string; role?: string };

export function RetryAnalysisControl() {
  const router = useRouter();
  const session = useSession();
  const confirmAction = useConfirmation();
  const [request, setRequest] = useState<RequestSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;
    const requestId = window.location.pathname.split("/").at(-1);
    if (!requestId) return;
    void fetch(`/api/requests/${requestId}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json() as { request?: RequestSnapshot };
        if (!response.ok || !data.request) throw new Error("Não foi possível consultar a solicitação.");
        return data.request;
      })
      .then((data) => { if (active) setRequest(data); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "Não foi possível consultar a solicitação."); });
    return () => { active = false; };
  }, []);

  const user = session.data?.user as SessionUser | undefined;
  const admin = user?.role === "admin";
  if (!user || !request || request.status !== "ANALYSIS_FAILED" || (!admin && (user.role !== "attendant" || request.requester.id !== user.id))) return null;

  async function retry() {
    if (!await confirmAction({ title: "Tentar a análise novamente?", description: "Os documentos já enviados serão analisados novamente. Se a verificação for concluída, a solicitação seguirá para aprovação do administrador.", confirmLabel: "Tentar novamente" })) return;
    setBusy(true); setError(""); setSuccess("");
    const requestId = window.location.pathname.split("/").at(-1);
    try {
      const response = await fetch(`/api/requests/${requestId}/reanalyze`, { method: "POST" });
      const data = await response.json() as { error?: string; status?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível iniciar uma nova análise.");
      if (data.status === "PENDING_REVIEW") {
        setSuccess("Análise concluída. Status: aguardando aprovação do administrador.");
        window.setTimeout(() => window.location.reload(), 1200);
      } else if (data.status === "REJECTED") {
        setSuccess("A análise foi concluída, mas encontrou divergências. Consulte o motivo na solicitação.");
        router.refresh();
      } else {
        setSuccess("A análise não foi concluída. Consulte o detalhe e tente novamente após corrigir o problema.");
      }
      setRequest((current) => current ? { ...current, status: data.status || current.status } : current);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível tentar a análise novamente.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="shell"><div className="panel"><h2>Tentar a análise novamente</h2><p>{admin ? "A última tentativa não foi concluída por uma falha técnica. Você pode repetir a análise com os documentos enviados pelo atendente; se ela for concluída, a solicitação entra na fila de aprovação." : "A última tentativa não foi concluída, então esta solicitação ainda não chegou à fila do administrador. Você pode tentar com os mesmos documentos."}</p><button className="button secondary" type="button" disabled={busy} onClick={() => void retry()}>{busy ? "Analisando…" : "Tentar análise novamente"}</button>{error && <div className="notice error-notice" role="alert">{error}</div>}{success && <div className="notice" role="status">{success}</div>}</div></section>;
}
