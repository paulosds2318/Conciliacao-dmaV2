import { STORES } from "@/lib/stores";
import { REQUEST_STATUS_LABELS } from "@/lib/services/request-status";
import { businessSeconds } from "@/lib/services/business-time";

/** Aprovadas e enviadas ao Coral (em andamento, concluídas ou com falha no envio), como no resumo da página inicial. */
export const APPROVED_STATUSES = ["EXECUTING", "COMPLETED", "EXECUTION_FAILED", "EXECUTION_UNCERTAIN"];
export const ACTION_LABELS: Record<string, string> = { CONSIDERAR_DMA: "Considerar DMA", DESCONSIDERAR_DMA: "Desconsiderar DMA" };
/** Precisam de ação: análise não concluída ou envio ao Coral com falha/sem confirmação. */
export const ATTENTION_STATUSES = ["ANALYSIS_FAILED", "EXECUTION_FAILED", "EXECUTION_UNCERTAIN"];

export const PERIODS = { hoje: "Hoje", "7dias": "Últimos 7 dias", "30dias": "Últimos 30 dias" } as const;
export type Period = keyof typeof PERIODS;

export type DashboardCounts = {
  opened: number;
  autoApproved: number;
  adminApproved: number;
  awaiting: number;
  rejected: number;
  attention: number;
};
/**
 * Tempo entre a solicitação entrar na fila (análise concluída) e a decisão do administrador.
 * Mediana e média contam só o horário comercial; `calendarMedianSeconds` é o tempo corrido.
 */
export type DecisionTime = {
  decisions: number;
  averageSeconds: number | null;
  medianSeconds: number | null;
  calendarMedianSeconds: number | null;
};

export const UNKNOWN_STORE = "Não identificada";
export const UNKNOWN_PARTNER = "Não identificado";
export const NO_VOUCHER = "Sem voucher";
/** Marca de `rawPartner` para solicitações de considerar DMA, que não têm voucher. */
export const NO_VOUCHER_KEY = "__sem_voucher__";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Brasília não tem horário de verão desde 2019: o horário local é sempre UTC-3. */
const BRASILIA_OFFSET_MS = 3 * 60 * 60 * 1000;
const brasiliaToday = (now: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
const brasiliaMidnight = (day: string) => new Date(`${day}T00:00:00-03:00`);

/** Início do período: meia-noite de Brasília de hoje, de 6 ou de 29 dias atrás (o dia de hoje conta). */
export function periodStart(period: Period, now = new Date()) {
  const today = brasiliaMidnight(brasiliaToday(now));
  const daysBack = period === "hoje" ? 0 : period === "7dias" ? 6 : 29;
  return new Date(today.getTime() - daysBack * DAY_MS);
}

/** Filtros do painel, lidos da URL; valem para a tela e para o relatório exportado. */
export type DashboardFilters = {
  period: Period | "personalizado";
  /** Início (inclusivo) e fim (exclusivo) da data de abertura; sem fim, vai até agora. */
  from: Date;
  to: Date | null;
  de?: string;
  ate?: string;
  store?: string;
  requesterId?: string;
  actionType?: string;
  status?: string;
  /** Nome do parceiro como exibido no painel (ex.: "Rentalcars"). */
  partner?: string;
};
type SearchParams = Record<string, string | string[] | undefined>;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
function param(params: SearchParams, key: string) {
  const value = params[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function validDay(value: string | undefined) {
  return value && DAY.test(value) && !Number.isNaN(brasiliaMidnight(value).getTime()) ? value : undefined;
}

/** Datas De/Até (dias de Brasília) têm prioridade sobre os atalhos; sem nenhum, últimos 7 dias. */
export function parseDashboardFilters(params: SearchParams, now = new Date()): DashboardFilters {
  const store = param(params, "loja");
  const actionType = param(params, "acao");
  const status = param(params, "situacao");
  const scope = {
    store: STORES.find((item) => item === store),
    requesterId: param(params, "atendente"),
    actionType: actionType && ACTION_LABELS[actionType] ? actionType : undefined,
    status: status && status in REQUEST_STATUS_LABELS ? status : undefined,
    partner: param(params, "parceiro")?.slice(0, 120),
  };
  let de = validDay(param(params, "de"));
  let ate = validDay(param(params, "ate"));
  if (de || ate) {
    if (de && ate && de > ate) [de, ate] = [ate, de];
    const to = ate ? new Date(brasiliaMidnight(ate).getTime() + DAY_MS) : null;
    return { period: "personalizado", from: de ? brasiliaMidnight(de) : new Date(0), to, de, ate, ...scope };
  }
  const requested = param(params, "periodo");
  const period: Period = requested && requested in PERIODS ? (requested as Period) : "7dias";
  return { period, from: periodStart(period, now), to: null, ...scope };
}

/** Monta a query string mantendo os filtros; `extra` acrescenta ou troca parâmetros (ex.: página). */
export function dashboardQuery(filters: DashboardFilters, extra: Record<string, string | number | undefined> = {}) {
  const query = new URLSearchParams();
  if (filters.period !== "personalizado") query.set("periodo", filters.period);
  const values = {
    de: filters.de,
    ate: filters.ate,
    loja: filters.store,
    atendente: filters.requesterId,
    acao: filters.actionType,
    situacao: filters.status,
    parceiro: filters.partner,
    ...extra,
  };
  for (const [key, value] of Object.entries(values)) if (value !== undefined && value !== "") query.set(key, String(value));
  return query.toString();
}

/** Página pedida na URL (1 quando ausente ou inválida). */
export function pageParam(params: SearchParams, key: string) {
  const page = Number.parseInt(param(params, key) ?? "", 10);
  return Number.isFinite(page) && page > 1 ? page : 1;
}

const brDay = (day: string) => day.split("-").reverse().join("/");
export function periodLabel(filters: DashboardFilters) {
  if (filters.period !== "personalizado") return PERIODS[filters.period];
  if (filters.de && filters.ate)
    return filters.de === filters.ate ? `Em ${brDay(filters.de)}` : `De ${brDay(filters.de)} até ${brDay(filters.ate)}`;
  return filters.de ? `A partir de ${brDay(filters.de)}` : `Até ${brDay(filters.ate!)}`;
}

/**
 * Período anterior de mesma duração, para comparação: ontem nas mesmas horas, os 7 ou 30 dias anteriores,
 * ou o intervalo De/Até deslocado. Sem data inicial não há base de comparação.
 */
export function previousFilters(filters: DashboardFilters, now = new Date()): DashboardFilters | null {
  if (filters.period === "personalizado" && !filters.de) return null;
  const end = filters.to ?? now;
  const days =
    filters.period === "hoje"
      ? 1
      : filters.period === "7dias"
        ? 7
        : filters.period === "30dias"
          ? 30
          : Math.ceil((end.getTime() - filters.from.getTime()) / DAY_MS);
  const shift = days * DAY_MS;
  return { ...filters, from: new Date(filters.from.getTime() - shift), to: new Date(end.getTime() - shift) };
}

/** Variação em relação ao período anterior (ex.: "▲ 12%"); sem base quando o anterior é zero ou não existe. */
export function variation(current: number | null | undefined, previous: number | null | undefined) {
  if (current == null || previous == null) return null;
  if (previous === 0) return current === 0 ? "sem variação" : "sem base anterior";
  const change = Math.round(((current - previous) / previous) * 100);
  return change === 0 ? "sem variação" : `${change > 0 ? "▲" : "▼"} ${Math.abs(change)}%`;
}

/** Resultado da solicitação para listas e relatório. */
export function outcomeLabel(status: string, autoApproved: boolean) {
  if (!APPROVED_STATUSES.includes(status)) return "—";
  return autoApproved ? "Aprovada automaticamente" : "Aprovada pelo administrador";
}

/** Variações conhecidas do nome (só letras e números, minúsculas) → nome exibido. Também usado na consulta SQL. */
export const PARTNER_NAMES: Record<string, string> = {
  rentalcars: "Rentalcars",
  rentalcarscom: "Rentalcars",
  rentcars: "Rentcars",
  rentcarscom: "Rentcars",
  booking: "Booking.com",
  bookingcom: "Booking.com",
  discovercars: "Discover Cars",
  discovercarscom: "Discover Cars",
  decolar: "Decolar",
  decolarcom: "Decolar",
  autoeurope: "Auto Europe",
  economybookings: "EconomyBookings",
  economybookingscom: "EconomyBookings",
};

/**
 * Parceiro bruto da última análise, na mesma ordem da aprovação automática: com texto no PDF vale a origem do texto;
 * senão a origem lida pela IA ou a primeira marca citada. A consulta agregada do painel repete esta regra em SQL.
 */
export function rawPartner(comparison: unknown, actionType: string) {
  if (actionType === "CONSIDERAR_DMA") return NO_VOUCHER_KEY;
  if (!comparison || typeof comparison !== "object") return null;
  const data = comparison as {
    voucherTextAvailable?: unknown;
    voucherTextOrigin?: unknown;
    voucherOrigin?: unknown;
    voucherBrands?: unknown;
  };
  const text = (value: unknown) => (typeof value === "string" ? value : null);
  if (data.voucherTextAvailable === true) return text(data.voucherTextOrigin);
  return text(data.voucherOrigin) ?? (Array.isArray(data.voucherBrands) ? text(data.voucherBrands[0]) : null);
}

/** Nome do parceiro para exibição, juntando variações como "Rentalcars.com" e "rentalcars". */
export function partnerName(raw: string | null | undefined) {
  if (raw === NO_VOUCHER_KEY) return NO_VOUCHER;
  const trimmed = raw?.trim();
  if (!trimmed) return UNKNOWN_PARTNER;
  return PARTNER_NAMES[trimmed.toLowerCase().replace(/[^a-z0-9]/g, "")] ?? trimmed;
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Mediana e média (expediente, sem feriados) e mediana corrida das decisões, no total e por loja. */
export function summarizeDecisionTimes(
  rows: Array<{ store: string | null; queuedAt: Date; decidedAt: Date }>,
  holidays: ReadonlySet<string> = new Set(),
) {
  const groups = new Map<string, Array<{ business: number; calendar: number }>>();
  const all: Array<{ business: number; calendar: number }> = [];
  for (const row of rows) {
    const item = {
      business: businessSeconds(row.queuedAt, row.decidedAt, holidays),
      calendar: Math.max(0, (row.decidedAt.getTime() - row.queuedAt.getTime()) / 1000),
    };
    all.push(item);
    const store = row.store ?? UNKNOWN_STORE;
    groups.set(store, [...(groups.get(store) ?? []), item]);
  }
  const summarize = (items: typeof all): DecisionTime => ({
    decisions: items.length,
    medianSeconds: median(items.map((item) => item.business)),
    averageSeconds: items.length ? items.reduce((sum, item) => sum + item.business, 0) / items.length : null,
    calendarMedianSeconds: median(items.map((item) => item.calendar)),
  });
  return { total: summarize(all), byStore: new Map([...groups].map(([store, items]) => [store, summarize(items)])) };
}

export const ADMIN_REJECTION_REASON = "Recusada pelo administrador (ver justificativa na solicitação)";

/** Motivo da recusa automática sem os números de contrato, para agrupar ocorrências iguais. */
export function reasonLabel(reason: string) {
  const text = reason.trim();
  if (/^O contrato anexado é o .+ mas o contrato validado no Coral é o /i.test(text))
    return "Contrato anexado diferente do validado no Coral";
  if (/^Número do contrato não localizado/i.test(text)) return "Número do contrato não localizado no contrato anexado";
  return text.replace(/\.$/, "");
}

/** Ocorrências por motivo, do mais frequente para o menos, com as lojas que mais tiveram cada motivo. */
export function summarizeReasons(rows: Array<{ reason: string; store: string | null; total: number }>) {
  const reasons = new Map<string, { total: number; stores: Map<string, number> }>();
  for (const row of rows) {
    const label = reasonLabel(row.reason);
    const entry = reasons.get(label) ?? { total: 0, stores: new Map<string, number>() };
    entry.total += row.total;
    const store = row.store ?? UNKNOWN_STORE;
    entry.stores.set(store, (entry.stores.get(store) ?? 0) + row.total);
    reasons.set(label, entry);
  }
  return [...reasons]
    .map(([reason, entry]) => ({
      reason,
      total: entry.total,
      stores: [...entry.stores].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([store, total]) => ({ store, total })),
    }))
    .sort((a, b) => b.total - a.total || a.reason.localeCompare(b.reason));
}

export function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(date);
}

/** Percentual inteiro para exibição; "—" quando não há base. */
export function percent(part: number, total: number) {
  return total ? `${Math.round((part / total) * 100)}%` : "—";
}

/** Duração em texto curto (ex.: "45 min", "5 h", "2 d 4 h"); "—" sem valor. */
export function formatDuration(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const minutes = Math.max(0, Math.floor(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 && hours < 10 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  return hours % 24 ? `${days} d ${hours % 24} h` : `${days} d`;
}

/** Tempo decorrido desde a data (ex.: "45 min", "5 h", "2 d 4 h"). */
export function elapsed(since: Date, now = new Date()) {
  return formatDuration((now.getTime() - since.getTime()) / 1000);
}

export type TimelineUnit = "hour" | "day" | "week" | "month";
export type TimelinePoint = { key: string; label: string; value: number };

/** Agrupamento do gráfico: por hora num dia, por dia até ~2 meses, por semana até ~6 meses e por mês acima disso. */
export function timelineUnit(from: Date, to: Date): TimelineUnit {
  const days = (to.getTime() - from.getTime()) / DAY_MS;
  return days <= 1 ? "hour" : days <= 62 ? "day" : days <= 183 ? "week" : "month";
}

const pad = (value: number) => String(value).padStart(2, "0");
/** Chave do grupo no horário de Brasília, no mesmo formato da consulta SQL (AAAA-MM-DDTHH). */
function bucketKey(local: Date) {
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}T${pad(local.getUTCHours())}`;
}
function truncate(local: Date, unit: TimelineUnit) {
  const date = new Date(local);
  date.setUTCMinutes(0, 0, 0);
  if (unit === "hour") return date;
  date.setUTCHours(0);
  if (unit === "week") date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  if (unit === "month") date.setUTCDate(1);
  return date;
}
function advance(local: Date, unit: TimelineUnit) {
  const date = new Date(local);
  if (unit === "hour") date.setUTCHours(date.getUTCHours() + 1);
  else if (unit === "day") date.setUTCDate(date.getUTCDate() + 1);
  else if (unit === "week") date.setUTCDate(date.getUTCDate() + 7);
  else date.setUTCMonth(date.getUTCMonth() + 1);
  return date;
}
const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
function bucketLabel(local: Date, unit: TimelineUnit) {
  const dayMonth = `${pad(local.getUTCDate())}/${pad(local.getUTCMonth() + 1)}`;
  if (unit === "hour") return `${pad(local.getUTCHours())}h`;
  if (unit === "day") return dayMonth;
  if (unit === "week") return `Semana de ${dayMonth}`;
  return `${MONTHS[local.getUTCMonth()]}/${local.getUTCFullYear()}`;
}

/** Todos os grupos do período, inclusive os sem solicitações (valor 0). */
export function timelinePoints(from: Date, to: Date, unit: TimelineUnit, totals: Map<string, number>, limit = 400): TimelinePoint[] {
  const end = new Date(to.getTime() - 1 - BRASILIA_OFFSET_MS);
  const points: TimelinePoint[] = [];
  for (
    let local = truncate(new Date(from.getTime() - BRASILIA_OFFSET_MS), unit);
    local <= end && points.length < limit;
    local = advance(local, unit)
  ) {
    const key = bucketKey(local);
    points.push({ key, label: bucketLabel(local, unit), value: totals.get(key) ?? 0 });
  }
  return points;
}
