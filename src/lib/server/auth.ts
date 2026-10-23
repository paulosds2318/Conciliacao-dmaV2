import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export type AppRole = "attendant" | "admin";
export async function getUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  const storedRole = (session.user as typeof session.user & { role?: string }).role;
  const role: AppRole = storedRole === "admin" ? "admin" : "attendant";
  return { ...session.user, role };
}
export async function isAllowed(roles: AppRole[]) {
  const user = await getUser();
  return user && roles.includes(user.role) ? user : null;
}