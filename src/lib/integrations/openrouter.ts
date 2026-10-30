/** Interface isolada para a comparacao documental via OpenRouter. */
export type DocumentIdentity = {
  voucher: { name: string | null; cpf: string | null };
  contract: { name: string | null; cpf: string | null };
  cpfMatch: boolean | null;
  nameMatch: boolean | null;
};

/** Número lido no contrato anexado comparado ao contrato validado no Coral. */
export type ContractNumberCheck = { expected: string; found: string | null; match: boolean | null };
/** Código da reserva Foco (ex.: R1531330-25), presente no voucher e no contrato ("Reserva:"). */
export type ReservationCheck = { voucher: string | null; contract: string | null; match: boolean | null };

export type DocumentComparison = {
  matches: boolean | null;
  contractNumber?: ContractNumberCheck;
  reservation?: ReservationCheck;
  confidence: number | null;
  identity: DocumentIdentity;
  fields: Array<{ name: string; voucherValue?: string; contractValue?: string; match: boolean | null; evidence?: string }>;
  summary: string;
};
export interface DocumentComparisonProvider {
  compare(voucherPdf: Uint8Array | null, contractPdf: Uint8Array, expectedContractNumber: string): Promise<DocumentComparison>;
}
