import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAllowed } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";
import { batchAttemptErrorLabel, batchAttemptStatusLabels, batchItemStatusLabels, batchJobStatusLabels } from "@/lib/batch-status-labels";

type Context = { params: Promise<{ id: string }> };
function safeText(value: unknown) {
  const text = value == null ? "" : String(value);
  return /^[\t\r ]*[=+@-]/.test(text) ? `'${text}` : text;
}

export async function GET(_request: Request, { params }: Context) {
  const user = await isAllowed(["admin"]);
  if (!user) return apiError("Não autorizado.", 401);
  const { id } = await params;
  const job = await db.bulkActionJob.findUnique({
    where: { id },
    include: { requester: { select: { name: true } }, items: { orderBy: { rowNumber: "asc" }, include: { attempts: { orderBy: { attemptNumber: "asc" } } } } },
  });
  if (!job || job.deletedAt) return apiError("Ação manual não encontrada.", 404);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Conciliação DMA";
  const summary = workbook.addWorksheet("Resumo");
  summary.addRows([
    ["Relatório da ação manual DMA"], ["Arquivo", safeText(job.originalName)], ["Aba", safeText(job.worksheetName)],
    ["Coluna do contrato", safeText(job.contractColumn)], ["Ação", job.actionType === "CONSIDERAR_DMA" ? "Considerar DMA" : "Desconsiderar DMA"],
    ["Status do processamento", batchJobStatusLabels[job.status] || "Status desconhecido"], ["Solicitante", safeText(job.requester.name)],
    ["Total", job.totalRows], ["Concluídos", job.succeededCount], ["Falhas", job.failedCount],
    ["Incertos", job.uncertainCount], ["Ignorados", job.skippedCount], ["Criado em", job.createdAt.toLocaleString("pt-BR")],
    ["Atualizado em", job.updatedAt.toLocaleString("pt-BR")],
  ]);
  summary.getColumn(1).width = 28; summary.getColumn(2).width = 60;
  summary.getRow(1).font = { bold: true, size: 15, color: { argb: "FFF20000" } };
  const details = workbook.addWorksheet("Contratos");
  details.columns = [
    { header: "Linha original", key: "row", width: 16 }, { header: "Contrato", key: "contract", width: 24 },
    { header: "Status", key: "status", width: 20 }, { header: "Tentativas", key: "attempts", width: 14 },
    { header: "Último resultado", key: "lastStatus", width: 24 }, { header: "Detalhe da falha", key: "error", width: 60 },
    { header: "Observação", key: "note", width: 52 }, { header: "Processado em", key: "completedAt", width: 22 },
  ];
  for (const item of job.items) {
    const lastAttempt = item.attempts.at(-1);
    details.addRow({ row: item.rowNumber, contract: safeText(item.contractNumber), status: batchItemStatusLabels[item.status] || "Status desconhecido", attempts: item.attempts.length,
      lastStatus: lastAttempt ? batchAttemptStatusLabels[lastAttempt.status] || "Status desconhecido" : "Sem tentativa",
      error: safeText(lastAttempt?.errorCode ? batchAttemptErrorLabel(lastAttempt.errorCode) : "Sem falha registrada"), note: safeText(item.note),
      completedAt: item.completedAt?.toLocaleString("pt-BR") || "" });
  }
  details.views = [{ state: "frozen", ySplit: 1 }];
  details.autoFilter = { from: "A1", to: "H1" };
  details.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  details.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF20000" } };
  details.eachRow((row) => row.eachCell((cell) => { cell.alignment = { vertical: "top", wrapText: true }; }));
  const bytes = await workbook.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="resultado-dma-${job.id}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
