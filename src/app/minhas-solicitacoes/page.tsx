import { redirect } from "next/navigation";
import { RequestList } from "@/components/request-list";
import { getUser } from "@/lib/server/auth";
export default async function MyRequestsPage() {
  const user = await getUser();
  if (!user) redirect("/login?redirect=/minhas-solicitacoes");
  if (user.role !== "attendant") redirect("/analise");
  return <main className="shell"><header className="page-heading"><div className="page-heading-left"><span className="eyebrow">Solicita&ccedil;&otilde;es</span><h1>Minhas solicita&ccedil;&otilde;es</h1><p>Acompanhe, edite ou cancele as solicita&ccedil;&otilde;es que voc&ecirc; abriu.</p></div></header><RequestList /></main>;
}