import { NextRequest, NextResponse } from "next/server";
import { isAllowed } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";
import { extractDmaCurrentStatus, lookupContract } from "@/lib/server/coral";
import { checkContractAccess } from "@/lib/server/store-access";
export async function GET(request: NextRequest) {
  const user = await isAllowed(["attendant", "admin"]);
  if (!user) return apiError("Apenas usuarios autenticados podem consultar o status DMA.", 403);
  const number = request.nextUrl.searchParams.get("number")?.trim();
  if (!number || number.length > 80) return apiError("Informe um número de contrato válido.");
  const accessError = await checkContractAccess(user, number);
  if (accessError) return apiError(accessError, 403);
  try {
    const contract = await lookupContract(number);
    if (!contract) return apiError("Não encontramos esse contrato no Coral. Confira o número informado ou confirme se ele existe.", 404);
    const coralAccessError = await checkContractAccess(user, contract.number);
    if (coralAccessError) return apiError(coralAccessError, 403);
    const dma = extractDmaCurrentStatus(contract.raw);
    return NextResponse.json({ contract: { number: contract.number, displayName: contract.displayName, currentDmaStatus: dma.status, statusSourceField: dma.sourceField } });
  } catch (error) { return apiError(error instanceof Error ? error.message : "Falha ao consultar o Coral.", 502); }
}
