/** Interface isolada para a comparacao documental via OpenRouter. */
export type DocumentIdentity = {
  voucher: { name: string | null; cpf: string | null };
  contract: { name: string | null; cpf: string | null };
  cpfMatch: boolean | null;
  nameMatch: boolean | null;
};

export type DocumentComparison = {
  matches: boolean | null;
  confidence: number | null;
  identity: DocumentIdentity;
  fields: Array<{ name: string; voucherValue?: string; contractValue?: string; match: boolean | null; evidence?: string }>;
  summary: string;
};
export interface DocumentComparisonProvider {
  compare(voucherPdf: Uint8Array, contractPdf: Uint8Array): Promise<DocumentComparison>;
}
