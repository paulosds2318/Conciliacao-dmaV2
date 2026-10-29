import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAllowed } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";
import { MAX_SPREADSHEET_ROWS, readSpreadsheet } from "@/lib/server/spreadsheet";
export async function GET(request: NextRequest) {
  const user = await isAllowed(["admin"]);
  if (!user) return apiError("Não autorizado.", 401);
  const includeArchived = request.nextUrl.searchParams.get("includeArchived") === "true";
  const jobs = await db.bulkActionJob.findMany({ where: { deletedAt: includeArchived ? { not: null } : null }, orderBy: { createdAt: "desc" }, include: { requester: { select: { name: true } }, _count: { select: { items: true } } } });
  return NextResponse.json({ jobs });
}
export async function POST(request: NextRequest) {
  const user = await isAllowed(["admin"]);
  if (!user) return apiError("Não autorizado.", 401);
  const form = await request.formData(); const file = form.get("file"); const actionType = form.get("actionType"); const worksheetName = form.get("worksheetName"); const columnIndex = Number(form.get("columnIndex")); const hasHeader = form.get("hasHeader") !== "false";
  if (actionType !== "CONSIDERAR_DMA" && actionType !== "DESCONSIDERAR_DMA") return apiError("Selecione uma ação DMA válida.");
  const singleContract = form.get("contractNumber");
  if (typeof singleContract === "string") {
    const contractNumber = singleContract.trim();
    if (!contractNumber || contractNumber.length > 80) return apiError("Informe um número de contrato válido.");
    try {
      const job = await db.bulkActionJob.create({ data: { requesterId: user.id, originalName: `Ação individual - ${contractNumber}`, actionType, worksheetName: "Contrato único", contractColumn: "Contrato", totalRows: 1, items: { create: [{ rowNumber: 1, contractNumber }] } } });
      return NextResponse.json({ jobId: job.id, totalRows: job.totalRows, skippedCount: 0 }, { status: 201 });
    } catch (error) { return apiError(error instanceof Error ? error.message : "Falha ao preparar a ação individual."); }
  }
  if (!(file instanceof File)) return apiError("Selecione uma planilha ou informe um contrato.");
  if (typeof worksheetName !== "string" || !Number.isInteger(columnIndex) || columnIndex < 0) return apiError("Selecione a aba e a coluna dos contratos.");
  try {
    const sheets = await readSpreadsheet(file, hasHeader); const sheet = sheets.find((entry) => entry.name === worksheetName);
    if (!sheet || !sheet.headers[columnIndex]) return apiError("Aba ou coluna não encontrada na planilha.");
    if (sheet.rowCount > MAX_SPREADSHEET_ROWS) return apiError(`A planilha excede o limite de ${MAX_SPREADSHEET_ROWS} linhas.`);
    const rows = sheet.rows.map(({ rowNumber, values }) => ({ rowNumber, contractNumber: values[columnIndex]?.trim() || "", status: "PENDING", note: null as string | null }));
    const seen = new Set<string>();
    for (const row of rows) {
      const normalized = row.contractNumber.toLocaleLowerCase("pt-BR");
      if (!normalized) { row.status = "SKIPPED"; row.contractNumber = "(vazio)"; row.note = "Linha sem contrato"; }
      else if (seen.has(normalized)) { row.status = "SKIPPED"; row.note = "Contrato repetido na planilha; primeira ocorrência mantida"; }
      else seen.add(normalized);
    }
    if (!seen.size) return apiError("A coluna selecionada não contém números de contrato.");
    const job = await db.bulkActionJob.create({ data: { requesterId: user.id, originalName: file.name, actionType, worksheetName, contractColumn: `${sheet.headers[columnIndex]} (coluna ${columnIndex + 1})`, totalRows: rows.length, skippedCount: rows.filter((row) => row.status === "SKIPPED").length, items: { create: rows } } });
    return NextResponse.json({ jobId: job.id, totalRows: job.totalRows, skippedCount: job.skippedCount }, { status: 201 });
  } catch (error) { return apiError(error instanceof Error ? error.message : "Falha ao preparar a ação manual."); }
}
