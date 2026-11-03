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

/** "RentalCars" / "Rentalcars.com", sem confundir com outras marcas como "Gotrentalcars". */
export function isRentalcarsOrigin(origin: string | null | undefined) {
  const normalized = origin?.toLowerCase().replace(/[^a-z]/g, "") ?? "";
  return normalized === "rentalcars" || normalized === "rentalcarscom";
}

/**
 * Voucher da Rentalcars dispensa a aprovação do administrador quando o contrato anexado é o validado no Coral
 * e os dados do cliente conferem com o contrato: CPF ou nome iguais, sem nenhuma divergência (CPF, nome ou reserva).
 */
export function isRentalcarsAutoApprovable(comparison: DocumentComparison) {
  const { identity, reservation, contractNumber } = comparison;
  return isRentalcarsOrigin(comparison.voucherOrigin)
    && contractNumber?.match === true
    && (identity.cpfMatch === true || identity.nameMatch === true)
    && identity.cpfMatch !== false && identity.nameMatch !== false && reservation?.match !== false;
}

export function getContractNumberRejectionReasons(check: ContractNumberCheck | undefined) {
  if (!check?.found) return ["Numero do contrato nao localizado no contrato anexado. Confira se o arquivo e o contrato correto e esta legivel."];
  if (check.match === false) return [`O contrato anexado e o ${check.found}, mas o contrato validado no Coral e o ${check.expected}. Anexe o contrato correto.`];
  return [];
}
