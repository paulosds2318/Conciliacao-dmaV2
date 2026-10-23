import { redirect } from "next/navigation";
import { ManualActionForm } from "@/components/manual-action-form";
import { BatchList } from "@/components/batch-list";
import { getUser } from "@/lib/server/auth";

export default async function ManualActionsPage() {
  const user = await getUser();
  if (!user) redirect("/login?redirect=/acoes-manuais");
  if (user.role !== "admin") redirect("/");
  return <><ManualActionForm /><main className="shell batch-history"><BatchList /></main></>;
}