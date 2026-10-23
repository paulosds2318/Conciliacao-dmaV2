import { redirect } from "next/navigation";
import { UserManagement } from "@/components/user-management";
import { getUser } from "@/lib/server/auth";
export default async function UserManagementPage() { const user = await getUser(); if (!user) redirect("/login?redirect=/gestao-usuarios"); if (user.role !== "admin") redirect("/"); return <UserManagement />; }