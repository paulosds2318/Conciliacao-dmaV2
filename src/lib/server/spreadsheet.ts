import ExcelJS from "exceljs";
import { Readable } from "node:stream";

export const MAX_SPREADSHEET_BYTES = 15 * 1024 * 1024;
export const MAX_SPREADSHEET_ROWS = 1000;
export type SpreadsheetRow = { rowNumber: number; values: string[] };
export type SpreadsheetSheet = { name: string; headers: string[]; rows: SpreadsheetRow[]; rowCount: number };
function cellValue(cell: ExcelJS.Cell) {
  const text = cell.text?.trim();
  return text || (cell.value == null ? "" : String(cell.value).trim());
}
export async function readSpreadsheet(file: File, hasHeader = true): Promise<SpreadsheetSheet[]> {
  const extension = file.name.toLowerCase().split(".").at(-1);
  if (!extension || !["xlsx", "csv"].includes(extension)) throw new Error("Use uma planilha .xlsx ou .csv. Arquivos .xls não são suportados.");
  if (!file.size || file.size > MAX_SPREADSHEET_BYTES) throw new Error("A planilha deve ter até 15 MB.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const workbook = new ExcelJS.Workbook();
  try {
    if (extension === "csv") await workbook.csv.read(Readable.from([bytes]), { sheetName: "Planilha" });
    else await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch { throw new Error("Não foi possível ler a planilha. Verifique o arquivo e tente novamente."); }
  if (workbook.worksheets.length > 20) throw new Error("A planilha excede o limite de 20 abas.");
  return workbook.worksheets.map((worksheet) => {
    const headerRow = worksheet.getRow(1);
    const columns = Math.max(headerRow.cellCount, worksheet.columnCount);
    if (columns > 100) throw new Error("A planilha excede o limite de 100 colunas.");
    if (worksheet.rowCount > MAX_SPREADSHEET_ROWS + (hasHeader ? 1 : 0)) throw new Error(`A planilha excede o limite de ${MAX_SPREADSHEET_ROWS} linhas de contratos.`);
    const headers = Array.from({ length: columns }, (_, index) => hasHeader ? cellValue(headerRow.getCell(index + 1)) || `Coluna ${index + 1}` : `Coluna ${index + 1}`);
    const rows: SpreadsheetRow[] = [];
    const firstDataRow = hasHeader ? 2 : 1;
    for (let rowNumber = firstDataRow; rowNumber <= worksheet.rowCount; rowNumber++) {
      const values = Array.from({ length: columns }, (_, index) => cellValue(worksheet.getRow(rowNumber).getCell(index + 1)));
      if (values.some(Boolean)) rows.push({ rowNumber, values });
    }
    return { name: worksheet.name, headers, rows, rowCount: rows.length };
  }).filter((sheet) => sheet.headers.length > 0 && sheet.rowCount > 0);
}
