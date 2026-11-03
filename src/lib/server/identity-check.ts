import type { ContractNumberCheck, DocumentComparison, DocumentIdentity, ReservationCheck } from "@/lib/integrations/openrouter";

export function getIdentityRejectionReasons(identity: DocumentIdentity, reservation?: ReservationCheck) {
  // Basta CPF, nome ou código da reserva conferir entre voucher e contrato para seguir à aprovação do administrador.
  // O código da reserva cobre vouchers estrangeiros, que não trazem CPF.
  if (identity.cpfMatch === true || identity.nameMatch === true || reservation?.match === true) return [];
  const reasons: string[] = [];
  for (const [key, label] of [["voucher", "voucher"], ["contract", "contrato"]] as const) {
    const data = identity[key];
    if (!data.name?.trim()) reasons.push(`Nome do cliente ausente ou ilegivel no ${label}.`);
    if (!data.cpf?.trim()) reasons.push(`CPF do cliente ausente ou ilegivel no ${label}.`);
  }
  return [...new Set(reasons)];
}

/** Parceiros cujo voucher dispensa o administrador. Comparação exata, para não aceitar marcas parecidas como "Gotrentalcars" ou "RentingCarz". */
const AUTO_APPROVAL_ORIGINS = new Set(["rentalcars", "rentalcarscom", "rentcars", "rentcarscom"]);
export function isAutoApprovalOrigin(origin: string | null | undefined) {
  return AUTO_APPROVAL_ORIGINS.has(origin?.toLowerCase().replace(/[^a-z]/g, "") ?? "");
}

/**
 * Voucher da Rentalcars ou da Rentcars dispensa a aprovação do administrador quando o contrato anexado é o validado no Coral
 * e os dados do cliente conferem com o contrato: CPF ou nome iguais, sem nenhuma divergência (CPF, nome ou reserva).
 */
export function isPartnerAutoApprovable(comparison: DocumentComparison) {
  const { identity, reservation, contractNumber } = comparison;
  // Origem identificada manda; só sem origem vale um parceiro aceito entre as marcas citadas no voucher.
  const partner = comparison.voucherOrigin
    ? isAutoApprovalOrigin(comparison.voucherOrigin)
    : (comparison.voucherBrands ?? []).some(isAutoApprovalOrigin);
  return partner
    && contractNumber?.match === true
    && (identity.cpfMatch === true || identity.nameMatch === true)
    && identity.cpfMatch !== false && identity.nameMatch !== false && reservation?.match !== false;
}

export function getContractNumberRejectionReasons(check: ContractNumberCheck | undefined) {
  if (!check?.found) return ["Numero do contrato nao localizado no contrato anexado. Confira se o arquivo e o contrato correto e esta legivel."];
  if (check.match === false) return [`O contrato anexado e o ${check.found}, mas o contrato validado no Coral e o ${check.expected}. Anexe o contrato correto.`];
  return [];
}
