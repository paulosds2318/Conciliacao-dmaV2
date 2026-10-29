import { NextRequest, NextResponse } from "next/server";
import { isAllowed } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";
import { readSpreadsheet } from "@/lib/server/spreadsheet";
export async function POST(request: NextRequest) {
  if (!await isAllowed(["attendant", "admin"])) return apiError("Não autorizado.", 401);
  const form = await request.formData(); const file = form.get("file"); const hasHeader = form.get("hasHeader") !== "false";
  if (!(file instanceof File)) return apiError("Selecione uma planilha.");
  try {
    const sheets = await readSpreadsheet(file, hasHeader);
    if (!sheets.length) return apiError("A planilha não contém linhas com cabeçalho e contratos.");
    return NextResponse.json({ sheets: sheets.map(({ name, headers, rows, rowCount }) => ({ name, headers, rows: rows.slice(0, 8), rowCount })) });
  } catch (error) { return apiError(error instanceof Error ? error.message : "Falha ao ler a planilha."); }
}
