/** Textos que explicam uma recusa ou uma divergência entre voucher e contrato, usados na tela, no histórico e no aviso ao atendente. */

export const quote = (value: string) => `“${value.trim()}”`;

export type ComparedField = { name: string; voucherValue?: string; contractValue?: string; match: boolean | null };

/** Campos que sempre interessam ao ler uma divergência; os demais só entram quando a IA os marcou como divergentes. */
const PRIMARY_FIELD = /^(n[úu]mero do contrato|c[óo]digo da reserva|cpf|nome)/i;

/**
 * Frases sobre o que não conferiu, com o valor lido em cada documento (ex.: `CPF do cliente: voucher “123” · contrato
 * “456” (divergente).`). Campos que conferem ficam de fora, assim como os que ninguém encontrou e a IA não marcou.
 */
export function describeDivergences(fields: ComparedField[] | undefined | null) {
  const lines: string[] = [];
  for (const field of fields ?? []) {
    if (field.match === true) continue;
    const primary = PRIMARY_FIELD.test(field.name);
    if (!primary && field.match !== false) continue;
    const voucher = field.voucherValue?.trim();
    const contract = field.contractValue?.trim();
    if (/^n[úu]mero do contrato/i.test(field.name)) {
      lines.push(`${field.name}: no contrato anexado consta ${contract ? quote(contract) : "nenhum número legível"}.`);
      continue;
    }
    if (field.match === null && !voucher && !contract) continue;
    lines.push(
      `${field.name}: voucher ${voucher ? quote(voucher) : "não encontrado"} · contrato ${contract ? quote(contract) : "não encontrado"} (${
        field.match === false ? "divergente" : "não conclusivo"
      }).`,
    );
  }
  return lines;
}

export const ADMIN_REJECTION_PREFIX = "Recusada pelo administrador: ";

type EventLike = { event: string; details?: unknown };
type DecisionLike = { decision: string; justification: string | null; requestVersion: number };

/**
 * Motivos da recusa da versão atual: os da validação automática (evento AI_AUTO_REJECTED) e, se houver, a justificativa
 * da recusa do administrador. `decisions` vem da mais recente para a mais antiga.
 */
export function rejectionReasons(input: { version: number; auditEvents: EventLike[]; decisions: DecisionLike[] }) {
  const reasons: string[] = [];
  const automatic = [...input.auditEvents].reverse().find((entry) => {
    const details = entry.details as { version?: unknown } | null | undefined;
    return entry.event === "AI_AUTO_REJECTED" && details?.version === input.version;
  });
  const listed = (automatic?.details as { reasons?: unknown } | null | undefined)?.reasons;
  if (Array.isArray(listed)) for (const reason of listed) if (typeof reason === "string" && reason.trim()) reasons.push(reason.trim());
  const manual = input.decisions.find((entry) => entry.decision === "REJECT" && entry.requestVersion === input.version);
  if (manual?.justification?.trim()) reasons.push(`${ADMIN_REJECTION_PREFIX}${manual.justification.trim()}`);
  return reasons;
}
