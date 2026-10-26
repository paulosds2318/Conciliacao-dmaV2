import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAllowed } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";
import { personName } from "@/lib/person-name";

const statusLabels: Record<string, string> = {
  ANALYZING: "Em análise automática", PENDING_REVIEW: "Aguardando administrador",
  REJECTED: "Recusada", ANALYSIS_FAILED: "Análise falhou",
  EXECUTING: "Executando no Coral", EXECUTION_UNCERTAIN: "Execução não confirmada",
  EXECUTION_FAILED: "Falha na execução", COMPLETED: "Concluída", CANCELLED: "Cancelada",
};
const actionLabels: Record<string, string> = { CONSIDERAR_DMA: "Considerar DMA", DESCONSIDERAR_DMA: "Desconsiderar DMA" };
function safeText(value: unknown) {
  const text = value == null ? "" : String(value);
  return /^[\t\r ]*[=+@-]/.test(text) ? `'${text}` : text;
}

export async function GET() {
  const user = await isAllowed(["attendant", "admin"]);
  if (!user) return apiError("Não autorizado.", 401);
  const requests = await db.dmaRequest.findMany({
    where: user.role === "attendant" ? { requesterId: user.id } : {},
    orderBy: { updatedAt: "desc" },
    include: {
      requester: { select: { name: true, email: true } },
      analyses: { orderBy: { createdAt: "desc" }, take: 1 },
      decisions: { orderBy: { createdAt: "desc" }, take: 1, include: { reviewer: { select: { name: true, email: true } } } },
      executionAttempts: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Conciliação DMA";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Solicitações DMA");
  sheet.columns = [
    { header: "ID", key: "id", width: 28 }, { header: "Contrato", key: "contract", width: 24 },
    { header: "Ação", key: "action", width: 22 }, { header: "Status final/atual", key: "status", width: 30 },
    { header: "Atendente", key: "requester", width: 28 }, { header: "E-mail", key: "email", width: 34 },
    { header: "Observações", key: "observations", width: 42 }, { header: "Resumo da análise IA", key: "summary", width: 50 },
    { header: "Confiança IA (%)", key: "confidence", width: 18 }, { header: "Decisão do administrador", key: "decision", width: 22 },
    { header: "Administrador", key: "reviewer", width: 28 }, { header: "Justificativa", key: "justification", width: 42 },
    { header: "Resultado Coral", key: "coralResult", width: 30 }, { header: "Criada em", key: "createdAt", width: 22 },
    { header: "Atualizada em", key: "updatedAt", width: 22 },
  ];
  for (const request of requests) {
    const analysis = request.analyses[0];
    const comparison = analysis?.comparison && typeof analysis.comparison === "object" ? analysis.comparison as { summary?: string; confidence?: number | null } : null;
    const decision = request.decisions[0];
    const execution = request.executionAttempts[0];
    sheet.addRow({
      id: safeText(request.id), contract: safeText(request.contractName), action: actionLabels[request.actionType] || safeText(request.actionType),
      status: statusLabels[request.status] || safeText(request.status), requester: safeText(personName(request.requester.name, request.requester.email)), email: safeText(request.requester.email),
      observations: safeText(request.observations), summary: safeText(comparison?.summary),
      confidence: comparison?.confidence ?? analysis?.confidence == null ? "" : Math.round((comparison?.confidence ?? analysis?.confidence ?? 0) * 100),
      decision: decision?.decision === "APPROVE" ? "Aprovada" : decision?.decision === "REJECT" ? "Recusada" : "",
      reviewer: safeText(decision ? personName(decision.reviewer.name, decision.reviewer.email) : ""), justification: safeText(decision?.justification),
      coralResult: safeText(execution?.status || "Ainda não executada"),
      createdAt: request.createdAt.toLocaleString("pt-BR"), updatedAt: request.updatedAt.toLocaleString("pt-BR"),
    });
  }
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: "A1", to: "O1" };
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF20000" } };
  sheet.eachRow((row) => row.eachCell((cell) => { cell.alignment = { vertical: "top", wrapText: true }; }));
  const bytes = await workbook.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="relatorio-solicitacoes-dma-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
