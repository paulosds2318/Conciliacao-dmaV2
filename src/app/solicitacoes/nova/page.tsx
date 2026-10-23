import { redirect } from "next/navigation";
import { RequestForm } from "@/components/request-form";
import { getUser } from "@/lib/server/auth";
export default async function NewRequestPage() {
  const user = await getUser();
  if (!user) redirect("/login?redirect=/solicitacoes/nova");
  if (user.role !== "attendant") redirect("/");
  return <RequestForm />;
}