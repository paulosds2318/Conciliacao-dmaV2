import { NextRequest, NextResponse } from "next/server";
import { isAllowed } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";
import { extractDmaCurrentStatus, lookupContract } from "@/lib/server/coral";
export async function GET(request: NextRequest) {
  if (!await isAllowed(["attendant", "admin"])) return apiError("Apenas usuarios autenticados podem consultar o status DMA.", 403);
  const number = request.nextUrl.searchParams.get("number")?.trim();
  if (!number || number.length > 80) return apiError("Informe um número de contrato válido.");
  try {
    const contract = await lookupContract(number);
    if (!contract) return apiError("Contrato não encontrado no Coral.", 404);
    const dma = extractDmaCurrentStatus(contract.raw);
    return NextResponse.json({ contract: { number: contract.number, displayName: contract.displayName, currentDmaStatus: dma.status, statusSourceField: dma.sourceField } });
  } catch (error) { return apiError(error instanceof Error ? error.message : "Falha ao consultar o Coral.", 502); }
}