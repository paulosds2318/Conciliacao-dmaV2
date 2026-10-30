import { db } from "@/lib/db";
import type { AppRole } from "@/lib/server/auth";
import { contractAccessError } from "@/lib/stores";

/**
 * Administradores enxergam todas as lojas; atendentes só as lojas definidas no cadastro.
 * Passe `exactStore` quando o Coral informar a loja do contrato.
 */
export async function checkContractAccess(user: { id: string; role: AppRole }, contractNumber: string, exactStore?: string | null) {
  if (user.role === "admin") return null;
  const record = await db.user.findUnique({ where: { id: user.id }, select: { stores: true } });
  return contractAccessError(record?.stores ?? [], contractNumber, exactStore);
}
