import type { ContractNumberCheck, DocumentIdentity } from "@/lib/integrations/openrouter";

export function getIdentityRejectionReasons(identity: DocumentIdentity) {
  // Basta CPF ou nome conferir entre voucher e contrato para seguir à aprovação do administrador.
  if (identity.cpfMatch === true || identity.nameMatch === true) return [];
  const reasons: string[] = [];
  for (const [key, label] of [["voucher", "voucher"], ["contract", "contrato"]] as const) {
    const data = identity[key];
    if (!data.name?.trim()) reasons.push(`Nome do cliente ausente ou ilegivel no ${label}.`);
    if (!data.cpf?.trim()) reasons.push(`CPF do cliente ausente ou ilegivel no ${label}.`);
  }
  return [...new Set(reasons)];
}

export function getContractNumberRejectionReasons(check: ContractNumberCheck | undefined) {
  if (!check?.found) return ["Numero do contrato nao localizado no contrato anexado. Confira se o arquivo e o contrato correto e esta legivel."];
  if (check.match === false) return [`O contrato anexado e o ${check.found}, mas o contrato validado no Coral e o ${check.expected}. Anexe o contrato correto.`];
  return [];
}
