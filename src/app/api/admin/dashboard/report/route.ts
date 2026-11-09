import ExcelJS from "exceljs";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAllowed } from "@/lib/server/auth";
import { apiError } from "@/lib/server/http";
import {
  loadDecisionTimes,
  loadRejectionReasons,
  loadSummary,
  loadTimeline,
  outcomeSelect,
  partnerRequestIds,
  periodWhere,
  requestOutcome,
} from "@/lib/server/dashboard-data";
import { safeText, styleHeader } from "@/lib/server/spreadsheet";
import { personName } from "@/lib/person-name";
import { REQUEST_STATUS_LABELS } from "@/lib/services/request-status";
import {
  ACTION_LABELS,
  BUSINESS_HOURS,
  formatDateTime,
  formatDuration,
  outcomeLabel,
  parseDashboardFilters,
  partnerName,
  percent,
  periodLabel,
  previousFilters,
  rawPartner,
  variation,
  type DashboardCounts,
  type DecisionTime,
} from "@/lib/services/dashboard";
import { resolveContractStore, storeLabel } from "@/lib/stores";

const statusLabels: Record<string, string> = REQUEST_STATUS_LABELS;
const COUNT_HEADERS = [
  "Abertas",
  "Aprovadas automaticamente",
  "Aprovadas pelo administrador",
  "Aguardando agora",
  "Recusadas",
  "% recusa",
  "Precisam de atenção agora",
];
const countCells = (item: DashboardCounts) => [
  item.opened,
  item.autoApproved,
  item.adminApproved,
  item.awaiting,
  item.rejected,
  percent(item.rejected, item.opened),
  item.attention,
];
const decisionCells = (time: DecisionTime | undefined) => [
  time?.decisions ?? 0,
  formatDuration(time?.medianSeconds),
  formatDuration(time?.averageSeconds),
  formatDuration(time?.calendarMedianSeconds),
];
const DECISION_HEADERS = [
  "Decisões do administrador",
  `Tempo de decisão no expediente (${BUSINESS_HOURS.label}) · mediana`,
  "Tempo de decisão no expediente · média",
  "Tempo de decisão corrido · mediana",
];

/** Aba de contagens com cabeçalho na linha `headerRow` e uma linha de total em negrito. */
function addCountsSheet(
  workbook: ExcelJS.Workbook,
  name: string,
  nameHeader: string,
  rows: Array<DashboardCounts & { name: string }>,
  totals: DashboardCounts,
) {
  const sheet = workbook.addWorksheet(name);
  sheet.addRow([nameHeader, ...COUNT_HEADERS]);
  for (const row of rows) sheet.addRow([safeText(row.name), ...countCells(row)]);
  sheet.addRow(["Total", ...countCells(totals)]).font = { bold: true };
  sheet.columns.forEach((column, index) => (column.width = index === 0 ? 28 : 18));
  styleHeader(sheet);
}

/** Relatório do painel: resumos, evolução e a lista completa das solicitações, com os mesmos filtros da tela. */
export async function GET(request: NextRequest) {
  const user = await isAllowed(["admin"]);
  if (!user) return apiError("Não autorizado.", 401);
  const filters = parseDashboardFilters(Object.fromEntries(request.nextUrl.searchParams));
  const previous = previousFilters(filters);
  const partnerIds = await partnerRequestIds(filters);
  const [summary, decisionTimes, timeline, reasons, previousSummary, previousDecision, requests, requester] = await Promise.all([
    loadSummary(filters),
    loadDecisionTimes(filters),
    loadTimeline(filters),
    loadRejectionReasons(filters),
    previous ? loadSummary(previous) : null,
    previous ? loadDecisionTimes(previous) : null,
    db.dmaRequest.findMany({
      where: periodWhere(filters, partnerIds),
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        contractName: true,
        store: true,
        actionType: true,
        status: true,
        createdAt: true,
        submittedAt: true,
        updatedAt: true,
        requester: { select: { name: true, email: true } },
        analyses: { orderBy: { createdAt: "desc" }, take: 1, select: { comparison: true } },
        ...outcomeSelect,
      },
    }),
    filters.requesterId ? db.user.findUnique({ where: { id: filters.requesterId }, select: { name: true, email: true } }) : null,
  ]);
  const { totals, byStore, byPartner, byRequester } = summary;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Conciliação DMA";
  workbook.created = new Date();

  const stores = workbook.addWorksheet("Resumo por loja");
  const applied = [
    ["Período", periodLabel(filters)],
    ["Loja", filters.store ? storeLabel(filters.store) : "Todas"],
    ["Atendente", requester ? personName(requester.name, requester.email) : "Todos"],
    ["Ação", filters.actionType ? ACTION_LABELS[filters.actionType] : "Todas"],
    ["Situação", filters.status ? statusLabels[filters.status] : "Todas"],
    ["Parceiro", filters.partner ?? "Todos"],
    ["Gerado em", formatDateTime(new Date())],
  ];
  for (const [name, value] of applied) stores.addRow([name, safeText(value)]).getCell(1).font = { bold: true };
  stores.addRow([]);
  const headerRow = applied.length + 2;
  stores.addRow(["Loja", ...COUNT_HEADERS, ...DECISION_HEADERS]);
  for (const item of byStore)
    stores.addRow([storeLabel(item.store), ...countCells(item), ...decisionCells(decisionTimes.byStore.get(item.store))]);
  stores.addRow(["Total", ...countCells(totals), ...decisionCells(decisionTimes.total)]).font = { bold: true };
  stores.columns.forEach((column, index) => (column.width = index === 0 ? 22 : 18));
  styleHeader(stores, headerRow);

  const comparison = workbook.addWorksheet("Comparação");
  comparison.columns = [
    { header: "Indicador", key: "name", width: 34 },
    { header: "Período atual", key: "current", width: 18 },
    { header: "Período anterior", key: "previous", width: 18 },
    { header: "Variação", key: "change", width: 18 },
  ];
  if (previous) {
    const before = previousSummary!.totals;
    const rows: Array<[string, number | null, number | null, (value: number | null) => string | number]> = [
      ["Abertas", totals.opened, before.opened, (value) => value ?? 0],
      ["Aprovadas automaticamente", totals.autoApproved, before.autoApproved, (value) => value ?? 0],
      ["Aprovadas pelo administrador", totals.adminApproved, before.adminApproved, (value) => value ?? 0],
      ["Recusadas", totals.rejected, before.rejected, (value) => value ?? 0],
      [
        "Tempo de decisão no expediente (mediana)",
        decisionTimes.total.medianSeconds,
        previousDecision!.total.medianSeconds,
        formatDuration,
      ],
    ];
    for (const [name, current, prior, format] of rows)
      comparison.addRow({ name, current: format(current), previous: format(prior), change: variation(current, prior) ?? "—" });
    comparison.addRow([]);
    comparison.addRow([`Período anterior: ${formatDateTime(previous.from)} até ${formatDateTime(previous.to!)}`]);
  } else comparison.addRow({ name: "Sem período anterior para comparar: informe a data inicial (De)." });
  styleHeader(comparison);

  const reasonSheet = workbook.addWorksheet("Motivos de recusa");
  reasonSheet.columns = [
    { header: "Motivo", key: "reason", width: 60 },
    { header: "Ocorrências", key: "total", width: 14 },
    { header: "Lojas", key: "stores", width: 60 },
  ];
  for (const item of reasons)
    reasonSheet.addRow({
      reason: safeText(item.reason),
      total: item.total,
      stores: item.stores.map((store) => `${storeLabel(store.store)} (${store.total})`).join(" · "),
    });
  styleHeader(reasonSheet);

  addCountsSheet(workbook, "Por parceiro", "Parceiro", byPartner, totals);
  addCountsSheet(workbook, "Por atendente", "Atendente", byRequester, totals);

  const evolution = workbook.addWorksheet("Evolução");
  evolution.columns = [
    { header: "Período", key: "label", width: 22 },
    { header: "Abertas", key: "value", width: 14 },
  ];
  for (const point of timeline.points) evolution.addRow({ label: point.label, value: point.value });
  styleHeader(evolution);

  const list = workbook.addWorksheet("Solicitações");
  list.columns = [
    { header: "ID", key: "id", width: 28 },
    { header: "Contrato", key: "contract", width: 20 },
    { header: "Loja", key: "store", width: 16 },
    { header: "Atendente", key: "requester", width: 26 },
    { header: "E-mail", key: "email", width: 32 },
    { header: "Ação", key: "action", width: 20 },
    { header: "Parceiro", key: "partner", width: 22 },
    { header: "Situação", key: "status", width: 40 },
    { header: "Resultado", key: "outcome", width: 28 },
    { header: "Recusada ao menos uma vez", key: "rejected", width: 16 },
    { header: "Aberta em", key: "createdAt", width: 18 },
    { header: "Último envio", key: "submittedAt", width: 18 },
    { header: "Atualizada em", key: "updatedAt", width: 18 },
  ];
  for (const item of requests) {
    const outcome = requestOutcome(item);
    const store = item.store ?? resolveContractStore(item.contractName);
    list.addRow({
      id: safeText(item.id),
      contract: safeText(item.contractName),
      store: store ? storeLabel(store) : "Não identificada",
      requester: safeText(personName(item.requester.name, item.requester.email)),
      email: safeText(item.requester.email),
      action: ACTION_LABELS[item.actionType] || safeText(item.actionType),
      partner: safeText(partnerName(rawPartner(item.analyses[0]?.comparison, item.actionType))),
      status: statusLabels[item.status] || "Situação não identificada",
      outcome: outcomeLabel(item.status, outcome.autoApproved),
      rejected: outcome.rejected ? "Sim" : "Não",
      createdAt: formatDateTime(item.createdAt),
      submittedAt: item.submittedAt ? formatDateTime(item.submittedAt) : "",
      updatedAt: formatDateTime(item.updatedAt),
    });
  }
  styleHeader(list);

  const bytes = await workbook.xlsx.writeBuffer();
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="painel-dma-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
