/** Contratos conhecidos na V1; busca/validação de contrato ainda precisa de endpoint próprio. */
export type DmaAction = "CONSIDERAR_DMA" | "DESCONSIDERAR_DMA";
export type CoralContract = { id: string; number: string; displayName: string; status?: string };
export type DmaActionPayload = { contrato: string; considerar_dma: boolean; desconsiderar_dma: boolean };
export function buildDmaActionPayload(contractNumber: string, action: DmaAction): DmaActionPayload {
  const consider = action === "CONSIDERAR_DMA";
  return { contrato: contractNumber, considerar_dma: consider, desconsiderar_dma: !consider };
}
export interface CoralGateway {
  findContract(query: string): Promise<CoralContract[]>;
  validateContract(contractId: string): Promise<CoralContract>;
  applyDmaAction(contractNumber: string, action: DmaAction): Promise<{ status: string }>;
}