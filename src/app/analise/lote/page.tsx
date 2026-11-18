import { redirect } from "next/navigation";
import { BatchApprovalRun } from "@/components/batch-approval-run";
import { getUser } from "@/lib/server/auth";

export default async function BatchApprovalPage() {
  const user = await getUser();
  if (!user) redirect("/login?redirect=/analise");
  if (user.role !== "admin") redirect("/minhas-solicitacoes");
  return <BatchApprovalRun />;
}
