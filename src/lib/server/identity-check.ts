import type { ContractNumberCheck, DocumentComparison, DocumentIdentity, ReservationCheck } from "@/lib/integrations/openrouter";
import { quote } from "@/lib/services/rejection";

export const NO_IDENTITY_MATCH_REASON =
  "Nenhum dado de identificação do cliente confere entre voucher e contrato: é preciso que o CPF, o nome ou o código da reserva confiram.";

export function getIdentityRejectionReasons(identity: DocumentIdentity, reservation?: ReservationCheck) {
  // Basta CPF, nome ou código da reserva conferir entre voucher e contrato para seguir à aprovação do administrador.
  // O código da reserva cobre vouchers estrangeiros, que não trazem CPF.
  if (identity.cpfMatch === true || identity.nameMatch === true || reservation?.match === true) return [];
  // A recusa automática acontece quando falta dado em algum documento. Cada motivo diz o que faltou e, quando o outro documento
  // traz o dado, o que foi lido nele.
  const missing: string[] = [];
  for (const [field, label] of [
    ["name", "Nome"],
    ["cpf", "CPF"],
  ] as const) {
    const voucher = identity.voucher[field]?.trim();
    const contract = identity.contract[field]?.trim();
    if (!voucher && !contract) missing.push(`${label} do cliente não encontrado no voucher nem no contrato.`);
    else if (!voucher) missing.push(`${label} do cliente ausente ou ilegível no voucher. No contrato consta: ${quote(contract!)}.`);
    else if (!contract) missing.push(`${label} do cliente ausente ou ilegível no contrato. No voucher consta: ${quote(voucher)}.`);
  }
  if (!missing.length) return [];
  // O que está divergente entre os documentos também é motivo: mostra o valor lido em cada um, para ver a causa real da recusa.
  const divergent: string[] = [];
  const reservationVoucher = reservation?.voucher?.trim();
  const reservationContract = reservation?.contract?.trim();
  if (reservationVoucher && reservationContract)
    divergent.push(
      `Código da reserva diverge entre voucher e contrato. No voucher consta ${quote(reservationVoucher)} e no contrato ${quote(reservationContract)}.`,
    );
  const nameVoucher = identity.voucher.name?.trim();
  const nameContract = identity.contract.name?.trim();
  if (nameVoucher && nameContract)
    divergent.push(
      `Nome do cliente diverge entre voucher e contrato. No voucher consta ${quote(nameVoucher)} e no contrato ${quote(nameContract)}.`,
    );
  const cpfVoucher = identity.voucher.cpf?.trim();
  const cpfContract = identity.contract.cpf?.trim();
  if (cpfVoucher && cpfContract)
    divergent.push(
      `CPF do cliente diverge entre voucher e contrato. No voucher consta ${quote(cpfVoucher)} e no contrato ${quote(cpfContract)}.`,
    );
  return [NO_IDENTITY_MATCH_REASON, ...divergent, ...missing];
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
    return [
      `Número do contrato não localizado no contrato anexado${check?.expected ? ` (o contrato validado no Coral é o ${check.expected})` : ""}. Confira se o arquivo é o contrato correto e está legível.`,
    ];
  if (check.match === false)
    return [`O contrato anexado é o ${check.found}, mas o contrato validado no Coral é o ${check.expected}. Anexe o contrato correto.`];
  return [];
}
