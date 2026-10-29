import { NextRequest, NextResponse } from "next/server";
import { isAllowed } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";
import { MAX_SPREADSHEET_ROWS, readSpreadsheet } from "@/lib/server/spreadsheet";
export async function POST(request: NextRequest) {
  if (!await isAllowed(["attendant", "admin"])) return apiError("Apenas usuarios autenticados podem consultar planilhas de status DMA.", 403);
  const form = await request.formData();
  const file = form.get("file"); const worksheetName = form.get("worksheetName"); const columnIndex = Number(form.get("columnIndex")); const hasHeader = form.get("hasHeader") !== "false";
  if (!(file instanceof File)) return apiError("Selecione uma planilha.");
  if (typeof worksheetName !== "string" || !Number.isInteger(columnIndex) || columnIndex < 0) return apiError("Selecione a aba e a coluna dos contratos.");
  try {
    const sheets = await readSpreadsheet(file, hasHeader);
    const sheet = sheets.find((entry) => entry.name === worksheetName);
    if (!sheet || !sheet.headers[columnIndex]) return apiError("Aba ou coluna não encontrada na planilha.");
    if (sheet.rowCount > MAX_SPREADSHEET_ROWS) return apiError(`A planilha excede o limite de ${MAX_SPREADSHEET_ROWS} linhas.`);
    const contracts = sheet.rows.map(({ rowNumber, values }) => ({ rowNumber, contractNumber: values[columnIndex]?.trim() || "" })).filter((row) => !!row.contractNumber);
    if (!contracts.length) return apiError("A coluna selecionada não contém números de contrato.");
    return NextResponse.json({ contracts, totalRows: contracts.length });
  } catch (error) { return apiError(error instanceof Error ? error.message : "Falha ao ler a planilha."); }
}
