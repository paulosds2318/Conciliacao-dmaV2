import type { DocumentIdentity } from "@/lib/integrations/openrouter";

export function getIdentityRejectionReasons(identity: DocumentIdentity) {
  const reasons: string[] = [];
  for (const [key, label] of [["voucher", "voucher"], ["contract", "contrato"]] as const) {
    const data = identity[key];
    if (!data.name?.trim()) reasons.push(`Nome do cliente ausente ou ilegivel no ${label}.`);
    if (!data.cpf?.trim()) reasons.push(`CPF do cliente ausente ou ilegivel no ${label}.`);
  }
  return [...new Set(reasons)];
}
