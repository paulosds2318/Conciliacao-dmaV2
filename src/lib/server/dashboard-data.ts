import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { personName } from "@/lib/person-name";
import { wasAutoApproved } from "@/lib/services/request-status";
import { extraHolidays } from "@/lib/services/business-time";
import {
  ADMIN_REJECTION_REASON,
  APPROVED_STATUSES,
  ATTENTION_STATUSES,
  NO_VOUCHER,
  PARTNER_NAMES,
  UNKNOWN_PARTNER,
  UNKNOWN_STORE,
  summarizeDecisionTimes,
  summarizeReasons,
  timelinePoints,
  timelineUnit,
  type DashboardCounts,
  type DashboardFilters,
} from "@/lib/services/dashboard";

/** Loja, atendente e ação: valem para tudo, inclusive as filas atuais. */
export function scopeWhere(filters: DashboardFilters): Prisma.DmaRequestWhereInput {
  return {
    ...(filters.store ? { store: filters.store } : {}),
    ...(filters.requesterId ? { requesterId: filters.requesterId } : {}),
    ...(filters.actionType ? { actionType: filters.actionType } : {}),
  };
}

/**
 * Escopo + período de abertura + situação: lista do período e relatório.
 * O parceiro vem da análise da IA e não é filtrável pelo Prisma; com filtro de parceiro, passe os IDs de `partnerRequestIds`.
 */
export function periodWhere(filters: DashboardFilters, partnerIds?: string[]): Prisma.DmaRequestWhereInput {
  return {
    ...scopeWhere(filters),
    ...(filters.status ? { status: filters.status } : {}),
    ...(partnerIds ? { id: { in: partnerIds } } : {}),
    createdAt: { gte: filters.from, ...(filters.to ? { lt: filters.to } : {}) },
  };
}

/** Parceiro da última análise, na mesma ordem de `rawPartner`: origem do texto do PDF, origem lida pela IA ou primeira marca. */
const latestPartner = (alias: Prisma.Sql) => Prisma.sql`
  LEFT JOIN LATERAL (
    SELECT CASE WHEN a.comparison->>'voucherTextAvailable' = 'true' THEN a.comparison->>'voucherTextOrigin'
                ELSE coalesce(a.comparison->>'voucherOrigin', a.comparison->'voucherBrands'->>0) END AS partner
    FROM ai_analyses a WHERE a."requestId" = ${alias}.id ORDER BY a."createdAt" DESC LIMIT 1
  ) latest ON TRUE`;

/** Nome exibido do parceiro, com as mesmas regras de `partnerName` (variações conhecidas unidas). */
const partnerNameSql = (alias: Prisma.Sql) => Prisma.sql`
  CASE WHEN ${alias}."actionType" = 'CONSIDERAR_DMA' THEN ${NO_VOUCHER}
       WHEN coalesce(btrim(latest.partner), '') = '' THEN ${UNKNOWN_PARTNER}
       ELSE coalesce(
         (SELECT n.name FROM (VALUES ${Prisma.join(Object.entries(PARTNER_NAMES).map(([key, name]) => Prisma.sql`(${key}, ${name})`))}) AS n(key, name)
           WHERE n.key = lower(regexp_replace(latest.partner, '[^a-zA-Z0-9]', '', 'g'))),
         btrim(latest.partner))
  END`;

/** Os mesmos filtros em SQL. As datas são gravadas em UTC sem fuso; o parâmetro é convertido explicitamente. */
function sqlWhere(filters: DashboardFilters, dateColumn: Prisma.Sql, withStatus: boolean) {
  const utc = (date: Date) => Prisma.sql`(CAST(${date.toISOString()} AS timestamptz) AT TIME ZONE 'UTC')`;
  const parts = [Prisma.sql`${dateColumn} >= ${utc(filters.from)}`];
  if (filters.to) parts.push(Prisma.sql`${dateColumn} < ${utc(filters.to)}`);
  if (filters.store) parts.push(Prisma.sql`r.store = ${filters.store}`);
  if (filters.requesterId) parts.push(Prisma.sql`r."requesterId" = ${filters.requesterId}`);
  if (filters.actionType) parts.push(Prisma.sql`r."actionType" = ${filters.actionType}`);
  if (withStatus && filters.status) parts.push(Prisma.sql`r.status = ${filters.status}`);
  if (filters.partner)
    parts.push(Prisma.sql`r.id IN (SELECT p.id FROM dma_requests p ${latestPartner(Prisma.sql`p`)}
      WHERE ${partnerNameSql(Prisma.sql`p`)} = ${filters.partner})`);
  return Prisma.join(parts, " AND ");
}

/** IDs das solicitações do período com o parceiro filtrado, para as listas feitas com o Prisma. */
export async function partnerRequestIds(filters: DashboardFilters) {
  if (!filters.partner) return undefined;
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    SELECT r.id FROM dma_requests r WHERE ${sqlWhere(filters, Prisma.sql`r."createdAt"`, true)}`;
  return rows.map((row) => row.id);
}

/** Decisões e eventos necessários para saber se a solicitação foi aprovada automaticamente ou recusada alguma vez. */
export const outcomeSelect = {
  decisions: { orderBy: { createdAt: "desc" }, select: { decision: true, createdAt: true } },
  auditEvents: {
    where: { event: { in: ["REQUEST_AUTO_APPROVED_EXECUTION_STARTED", "AI_AUTO_REJECTED"] } },
    orderBy: { createdAt: "desc" },
    select: { event: true, createdAt: true },
  },
} satisfies Prisma.DmaRequestSelect;

type OutcomeSource = {
  status: string;
  decisions: Array<{ decision: string; createdAt: Date }>;
  auditEvents: Array<{ event: string; createdAt: Date }>;
};
/** Classificação de uma solicitação; `loadSummary` aplica a mesma regra em SQL. */
export function requestOutcome(item: OutcomeSource) {
  return {
    autoApproved: wasAutoApproved(
      item.auditEvents.find((event) => event.event === "REQUEST_AUTO_APPROVED_EXECUTION_STARTED")?.createdAt,
      item.decisions[0]?.createdAt,
    ),
    rejected:
      item.status === "REJECTED" ||
      item.decisions.some((decision) => decision.decision === "REJECT") ||
      item.auditEvents.some((event) => event.event === "AI_AUTO_REJECTED"),
  };
}

/** Quem já abriu solicitações, para o filtro e o resumo por atendente. */
export function listRequesters() {
  return db.user.findMany({
    where: { requests: { some: {} } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true },
  });
}

type SummaryRow = DashboardCounts & { level: number; store: string | null; requesterId: string | null; partner: string | null };

/**
 * Contagens do período feitas no banco, numa única consulta: por loja, por atendente, por parceiro e o total.
 * Aprovada automaticamente = aprovação automática mais recente que a última decisão do administrador (como `wasAutoApproved`).
 */
export async function loadSummary(filters: DashboardFilters) {
  const rows = await db.$queryRaw<SummaryRow[]>`
    WITH base AS (
      SELECT r.store, r."requesterId", r.status, ${partnerNameSql(Prisma.sql`r`)} AS partner,
        r.status IN (${Prisma.join(APPROVED_STATUSES)}) AS approved,
        (SELECT max(e."createdAt") FROM audit_events e
          WHERE e."requestId" = r.id AND e.event = 'REQUEST_AUTO_APPROVED_EXECUTION_STARTED') AS auto_at,
        (SELECT max(d."createdAt") FROM review_decisions d WHERE d."requestId" = r.id) AS decision_at,
        (r.status = 'REJECTED'
          OR EXISTS (SELECT 1 FROM review_decisions d WHERE d."requestId" = r.id AND d.decision = 'REJECT')
          OR EXISTS (SELECT 1 FROM audit_events e WHERE e."requestId" = r.id AND e.event = 'AI_AUTO_REJECTED')) AS rejected
      FROM dma_requests r
      ${latestPartner(Prisma.sql`r`)}
      WHERE ${sqlWhere(filters, Prisma.sql`r."createdAt"`, true)}
    ), classified AS (
      SELECT *, approved AND auto_at IS NOT NULL AND (decision_at IS NULL OR auto_at > decision_at) AS is_auto FROM base
    )
    SELECT GROUPING(store, "requesterId", partner)::int AS level, store, "requesterId", partner,
      count(*)::int AS opened,
      (count(*) FILTER (WHERE is_auto))::int AS "autoApproved",
      (count(*) FILTER (WHERE approved AND NOT is_auto))::int AS "adminApproved",
      (count(*) FILTER (WHERE status = 'PENDING_REVIEW'))::int AS awaiting,
      (count(*) FILTER (WHERE rejected))::int AS rejected,
      (count(*) FILTER (WHERE status IN (${Prisma.join(ATTENTION_STATUSES)})))::int AS attention
    FROM classified
    GROUP BY GROUPING SETS ((store), ("requesterId"), (partner), ())`;
  // GROUPING: 3 = por loja, 5 = por atendente, 6 = por parceiro, 7 = total.
  const counts = ({ opened, autoApproved, adminApproved, awaiting, rejected, attention }: SummaryRow): DashboardCounts => ({
    opened,
    autoApproved,
    adminApproved,
    awaiting,
    rejected,
    attention,
  });
  const empty: DashboardCounts = { opened: 0, autoApproved: 0, adminApproved: 0, awaiting: 0, rejected: 0, attention: 0 };
  const byOpened = <T extends { opened: number; name: string }>(a: T, b: T) => b.opened - a.opened || a.name.localeCompare(b.name);
  const requesterRows = rows.filter((row) => row.level === 5 && row.requesterId);
  const users = await db.user.findMany({
    where: { id: { in: requesterRows.map((row) => row.requesterId!) } },
    select: { id: true, name: true, email: true },
  });
  const names = new Map(users.map((user) => [user.id, personName(user.name, user.email)]));
  const total = rows.find((row) => row.level === 7);
  return {
    totals: total ? counts(total) : empty,
    byStore: rows
      .filter((row) => row.level === 3)
      .map((row) => ({ store: row.store ?? UNKNOWN_STORE, name: row.store ?? UNKNOWN_STORE, ...counts(row) }))
      .sort(byOpened),
    byRequester: requesterRows
      .map((row) => ({ requesterId: row.requesterId!, name: names.get(row.requesterId!) ?? "Usuário removido", ...counts(row) }))
      .sort(byOpened),
    byPartner: rows
      .filter((row) => row.level === 6)
      .map((row) => ({ name: row.partner ?? UNKNOWN_PARTNER, ...counts(row) }))
      .sort(byOpened),
  };
}

/**
 * Tempo de decisão do administrador, das decisões tomadas no período: da conclusão da análise da IA (entrada na fila)
 * até a aprovação ou recusa daquela versão. Aprovações automáticas não entram, porque não passam pelo administrador.
 * O desconto de noites, fins de semana e feriados é feito em `summarizeDecisionTimes`.
 */
export async function loadDecisionTimes(filters: DashboardFilters) {
  const rows = await db.$queryRaw<Array<{ store: string | null; queuedAt: Date; decidedAt: Date }>>`
    SELECT r.store, q.queued_at AS "queuedAt", d."createdAt" AS "decidedAt"
    FROM review_decisions d
    JOIN dma_requests r ON r.id = d."requestId"
    CROSS JOIN LATERAL (
      SELECT max(a."createdAt") AS queued_at
      FROM ai_analyses a
      WHERE a."requestId" = d."requestId" AND a."requestVersion" = d."requestVersion"
        AND a.status = 'COMPLETED' AND a."createdAt" <= d."createdAt"
    ) q
    WHERE q.queued_at IS NOT NULL AND ${sqlWhere(filters, Prisma.sql`d."createdAt"`, false)}`;
  return summarizeDecisionTimes(rows, extraHolidays());
}

/**
 * Motivos das recusas das solicitações abertas no período: os registrados pela validação automática e,
 * como um motivo à parte, as recusas do administrador (cujo motivo é texto livre).
 */
export async function loadRejectionReasons(filters: DashboardFilters) {
  const where = sqlWhere(filters, Prisma.sql`r."createdAt"`, true);
  const rows = await db.$queryRaw<Array<{ reason: string; store: string | null; total: number }>>`
    SELECT reason, r.store, count(*)::int AS total
    FROM dma_requests r
    JOIN audit_events e ON e."requestId" = r.id AND e.event = 'AI_AUTO_REJECTED' AND jsonb_typeof(e.details->'reasons') = 'array'
    CROSS JOIN LATERAL jsonb_array_elements_text(e.details->'reasons') AS reason
    WHERE ${where}
    GROUP BY reason, r.store
    UNION ALL
    SELECT ${ADMIN_REJECTION_REASON}, r.store, count(*)::int
    FROM dma_requests r
    JOIN review_decisions d ON d."requestId" = r.id AND d.decision = 'REJECT'
    WHERE ${where}
    GROUP BY r.store`;
  return summarizeReasons(rows);
}

/** Solicitações abertas por hora, dia, semana ou mês (horário de Brasília), com os grupos vazios preenchidos. */
export async function loadTimeline(filters: DashboardFilters, now = new Date()) {
  const where = sqlWhere(filters, Prisma.sql`r."createdAt"`, true);
  let from = filters.from;
  if (filters.period === "personalizado" && !filters.de) {
    const [first] = await db.$queryRaw<
      Array<{ first: Date | null }>
    >`SELECT min(r."createdAt") AS first FROM dma_requests r WHERE ${where}`;
    from = first?.first ?? now;
  }
  const to = filters.to && filters.to < now ? filters.to : now;
  const unit = timelineUnit(from, to);
  const rows = await db.$queryRaw<Array<{ bucket: string; total: number }>>`
    SELECT to_char(date_trunc(${unit}, r."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM-DD"T"HH24') AS bucket,
      count(*)::int AS total
    FROM dma_requests r
    WHERE ${where}
    GROUP BY 1`;
  return { unit, points: timelinePoints(from, to, unit, new Map(rows.map((row) => [row.bucket, row.total]))) };
}
