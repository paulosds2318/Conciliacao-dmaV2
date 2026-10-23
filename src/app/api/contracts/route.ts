import { NextRequest, NextResponse } from "next/server";
import { isAllowed } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";
import { lookupContract } from "@/lib/server/coral";
export async function GET(request: NextRequest) {
  if (!await isAllowed(["attendant", "admin"])) return apiError("Não autorizado.", 401);
  const number = request.nextUrl.searchParams.get("number")?.trim();
  if (!number || number.length > 80) return apiError("Informe um número de contrato válido.");
  try { const contract = await lookupContract(number); return contract ? NextResponse.json({ contract }) : apiError("Contrato não encontrado no Coral.", 404); }
  catch (error) { return apiError(error instanceof Error ? error.message : "Falha ao consultar o Coral.", 502); }
}
