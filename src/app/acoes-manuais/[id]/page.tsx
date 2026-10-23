import { redirect } from "next/navigation";
import { BatchDetail } from "@/components/batch-detail";
import { getUser } from "@/lib/server/auth";

export default async function BatchDetailPage() {
  const user = await getUser();
  if (!user) redirect("/login?redirect=/acoes-manuais");
  if (user.role !== "admin") redirect("/");
  return <BatchDetail />;
}