import { NextRequest, NextResponse } from "next/server";
import { isAllowed } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";
import { attachmentError } from "@/lib/server/attachment-check";

export const maxDuration = 60;

/**
 * Confere um anexo assim que ele é escolhido, antes do envio: o contrato precisa ser o PDF do modelo padrão da Foco e o voucher
 * não pode ser contrato nem o mesmo arquivo. Não grava nada; devolve `{ error }` com a mensagem do problema, ou `{ error: null }`.
 */
export async function POST(request: NextRequest) {
  const user = await isAllowed(["attendant", "admin"]);
  if (!user) return apiError("Não autorizado.", 401);
  const form = await request.formData();
  const voucher = form.get("voucher");
  const contract = form.get("contract");
  const error = await attachmentError({
    voucher: voucher instanceof File && voucher.size ? voucher : null,
    contract: contract instanceof File && contract.size ? contract : null,
  });
  return NextResponse.json({ error });
}
