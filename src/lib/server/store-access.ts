import { db } from "@/lib/db";
import type { AppRole } from "@/lib/server/auth";
import { contractAccessError } from "@/lib/stores";

/** Administradores enxergam todas as lojas; atendentes só as lojas definidas no cadastro. */
export async function checkContractAccess(user: { id: string; role: AppRole }, ...contractNumbers: string[]) {
  if (user.role === "admin") return null;
  const record = await db.user.findUnique({ where: { id: user.id }, select: { stores: true } });
  for (const contractNumber of contractNumbers) {
    const error = contractAccessError(record?.stores ?? [], contractNumber);
    if (error) return error;
  }
  return null;
}
