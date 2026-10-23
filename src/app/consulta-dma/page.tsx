import { redirect } from "next/navigation";
import { ContractStatusChecker } from "@/components/contract-status-checker";
import { getUser } from "@/lib/server/auth";
export default async function ContractStatusPage() {
  const user = await getUser();
  if (!user) redirect("/login?redirect=/consulta-dma");
  if (user.role !== "admin" && user.role !== "attendant") redirect("/");
  return <ContractStatusChecker />;
}