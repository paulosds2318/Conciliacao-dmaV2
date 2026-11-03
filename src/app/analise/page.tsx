import { redirect } from "next/navigation";
import { RequestList, type AdminView } from "@/components/request-list";
import { getUser } from "@/lib/server/auth";
import { RefreshPageButton } from "@/components/refresh-page-button";
const views: Record<string, AdminView> = { pendentes: "pending", aprovadas: "approved", devolvidas: "returned", geral: "all" };
export default async function ApprovalQueuePage({ searchParams }: { searchParams: Promise<{ aba?: string | string[] }> }) {
  const user = await getUser();
  if (!user) redirect("/login?redirect=/analise");
  if (user.role !== "admin") redirect("/minhas-solicitacoes");
  const { aba } = await searchParams;
  const initialView = (typeof aba === "string" && views[aba]) || "pending";
  return (
    <main className="shell">
      <header className="page-heading">
        <div className="page-heading-left">
          <span className="eyebrow">Administração</span>
          <h1>Aprovar solicitações</h1>
          <p>Revise os documentos e a comparação da IA para aprovar ou recusar a ação.</p>
        </div>
        <div className="page-heading-actions">
          <RefreshPageButton />
        </div>
      </header>
      <RequestList adminQueue initialView={initialView} />
    </main>
  );
}
