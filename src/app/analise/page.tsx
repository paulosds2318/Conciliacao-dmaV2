import { redirect } from "next/navigation";
import { RequestList } from "@/components/request-list";
import { getUser } from "@/lib/server/auth";
import { RefreshPageButton } from "@/components/refresh-page-button";
export default async function ApprovalQueuePage() {
  const user = await getUser();
  if (!user) redirect("/login?redirect=/analise");
  if (user.role !== "admin") redirect("/minhas-solicitacoes");
  return <main className="shell"><header className="page-heading"><div className="page-heading-left"><span className="eyebrow">Administração</span><h1>Aprovar solicitações</h1><p>Revise os PDFs e a comparação da IA para aprovar ou reprovar a ação.</p></div><div className="page-heading-actions"><RefreshPageButton /></div></header><RequestList adminQueue /></main>;
}
