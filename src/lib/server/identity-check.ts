import type { ContractNumberCheck, DocumentComparison, DocumentIdentity, ReservationCheck } from "@/lib/integrations/openrouter";

export function getIdentityRejectionReasons(identity: DocumentIdentity, reservation?: ReservationCheck) {
  // Basta CPF, nome ou código da reserva conferir entre voucher e contrato para seguir à aprovação do administrador.
  // O código da reserva cobre vouchers estrangeiros, que não trazem CPF.
  if (identity.cpfMatch === true || identity.nameMatch === true || reservation?.match === true) return [];
  const reasons: string[] = [];
  for (const [key, label] of [
    ["voucher", "voucher"],
    ["contract", "contrato"],
  ] as const) {
    const data = identity[key];
    if (!data.name?.trim()) reasons.push(`Nome do cliente ausente ou ilegível no ${label}.`);
    if (!data.cpf?.trim()) reasons.push(`CPF do cliente ausente ou ilegível no ${label}.`);
  }
  return [...new Set(reasons)];
}

/** APROVACAO_AUTOMATICA=false desliga a aprovação sem administrador na hora, sem novo deploy; ausente ou outro valor mantém ligada. */
export function autoApprovalEnabled(env: Record<string, string | undefined> = process.env) {
  return env.APROVACAO_AUTOMATICA?.trim().toLowerCase() !== "false";
}

/** Parceiros cujo voucher dispensa o administrador. Comparação exata, para não aceitar marcas parecidas como "Gotrentalcars" ou "RentingCarz". */
const AUTO_APPROVAL_ORIGINS = new Set(["rentalcars", "rentalcarscom", "rentcars", "rentcarscom"]);
export function isAutoApprovalOrigin(origin: string | null | undefined) {
  return AUTO_APPROVAL_ORIGINS.has(origin?.toLowerCase().replace(/[^a-z]/g, "") ?? "");
}

/**
 * Parceiro lido diretamente do texto do voucher. Só valem marcas que identificam a reserva: "Origem: X" (Confirmação de Reserva Foco)
 * e "Código da Solicitação Rentcars" / "Voucher da Reserva | Rentcars" (voucher Rentcars). Citações soltas como "faturado por rentcars.com",
 * comuns em apólices da RentalCover, não contam.
 */
export function detectPartnerFromText(text: string): string | null {
  const origin = text.match(/origem:\s*([a-z0-9.]+)/i);
  if (origin) return origin[1];
  if (/c[oó]digo\s+da\s+solicita[cç][aã]o\s+rentcars/i.test(text) || /voucher\s+da\s+reserva\s*\|\s*rentcars/i.test(text))
    return "Rentcars";
  return null;
}

/**
 * Voucher da Rentalcars ou da Rentcars dispensa a aprovação do administrador quando o contrato anexado é o validado no Coral
 * e os dados do cliente conferem com o contrato: CPF ou nome iguais, sem nenhuma divergência (CPF, nome ou reserva).
 */
export function isPartnerAutoApprovable(comparison: DocumentComparison) {
  const { identity, reservation, contractNumber } = comparison;
  // Com texto no PDF, decide só o texto (previsível); a leitura da IA vale apenas para imagens e PDFs escaneados.
  // Na IA, a origem identificada manda; só sem origem vale um parceiro aceito entre as marcas citadas no voucher.
  const partner = comparison.voucherTextAvailable
    ? isAutoApprovalOrigin(comparison.voucherTextOrigin)
    : comparison.voucherOrigin
      ? isAutoApprovalOrigin(comparison.voucherOrigin)
      : (comparison.voucherBrands ?? []).some((brand) => isAutoApprovalOrigin(brand));
  return (
    partner &&
    contractNumber?.match === true &&
    (identity.cpfMatch === true || identity.nameMatch === true) &&
    identity.cpfMatch !== false &&
    identity.nameMatch !== false &&
    reservation?.match !== false
  );
}

export function getContractNumberRejectionReasons(check: ContractNumberCheck | undefined) {
  if (!check?.found)
    return ["Número do contrato não localizado no contrato anexado. Confira se o arquivo é o contrato correto e está legível."];
  if (check.match === false)
    return [`O contrato anexado é o ${check.found}, mas o contrato validado no Coral é o ${check.expected}. Anexe o contrato correto.`];
  return [];
}
