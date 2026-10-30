import { NextRequest, NextResponse } from "next/server";
import { isAllowed } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";
import { lookupContract } from "@/lib/server/coral";
import { checkContractAccess } from "@/lib/server/store-access";
export async function GET(request: NextRequest) {
  const user = await isAllowed(["attendant", "admin"]);
  if (!user) return apiError("Não autorizado.", 401);
  const number = request.nextUrl.searchParams.get("number")?.trim();
  if (!number || number.length > 80) return apiError("Informe um número de contrato válido.");
  const accessError = await checkContractAccess(user, number);
  if (accessError) return apiError(accessError, 403);
  try { const contract = await lookupContract(number); const coralAccessError = contract ? await checkContractAccess(user, contract.number, contract.store) : null; if (coralAccessError) return apiError(coralAccessError, 403); return contract ? NextResponse.json({ contract }) : apiError("Não encontramos esse contrato no Coral. Confira o número informado ou confirme se ele existe.", 404); }
  catch (error) { return apiError(error instanceof Error ? error.message : "Falha ao consultar o Coral.", 502); }
}
