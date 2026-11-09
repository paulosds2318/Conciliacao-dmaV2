import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getUser } from "@/lib/server/auth";
import { recoverStaleRequests } from "@/lib/server/stale-requests";
import {
  listRequesters,
  loadDecisionTimes,
  loadRejectionReasons,
  loadSummary,
  loadTimeline,
  outcomeSelect,
  partnerRequestIds,
  periodWhere,
  requestOutcome,
  scopeWhere,
} from "@/lib/server/dashboard-data";
import { RefreshPageButton } from "@/components/refresh-page-button";
import { LinkPagination } from "@/components/link-pagination";
import { TimelineChart } from "@/components/timeline-chart";
import { personName } from "@/lib/person-name";
import { REQUEST_STATUS_LABELS } from "@/lib/services/request-status";
import {
  ACTION_LABELS,
  ATTENTION_STATUSES,
  BUSINESS_HOURS,
  PERIODS,
  dashboardQuery,
  elapsed,
  formatDateTime,
  formatDuration,
  outcomeLabel,
  pageParam,
  parseDashboardFilters,
  partnerName,
  percent,
  periodLabel,
  previousFilters,
  rawPartner,
  variation,
  type DashboardCounts,
  type Period,
  type TimelineUnit,
} from "@/lib/services/dashboard";
import { STORES, resolveContractStore, storeLabel } from "@/lib/stores";

const statusLabels: Record<string, string> = REQUEST_STATUS_LABELS;
const PERIOD_PAGE_SIZE = 20;
const QUEUE_PAGE_SIZE = 10;
const UNIT_LABELS: Record<TimelineUnit, string> = { hour: "hora", day: "dia", week: "semana", month: "mês" };
const listSelect = {
  id: true,
  contractName: true,
  store: true,
  status: true,
  actionType: true,
  createdAt: true,
  submittedAt: true,
  updatedAt: true,
  requester: { select: { name: true, email: true } },
} as const;

function requestStore(item: { store: string | null; contractName: string }) {
  const store = item.store ?? resolveContractStore(item.contractName);
  return store ? storeLabel(store) : "—";
}

/** Tabela de contagens (por parceiro ou por atendente); `href` transforma o nome em filtro quando existe. */
function CountsTable({
  title,
  description,
  rows,
  nameHeader,
}: {
  title: string;
  description: string;
  nameHeader: string;
  rows: Array<DashboardCounts & { name: string; href?: string }>;
}) {
  return (
    <section className="panel dashboard-recent">
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      <div className="table-wrap">
        <table className="dashboard-table dashboard-numbers">
          <thead>
            <tr>
              <th>{nameHeader}</th>
              <th>Abertas</th>
              <th>Aprov. automática</th>
              <th>Aprov. administrador</th>
              <th>Recusadas</th>
              <th>% recusa</th>
              <th>Aguardando agora</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.name}>
                <td className="strong">{row.href ? <Link href={row.href}>{row.name}</Link> : row.name}</td>
                <td>{row.opened}</td>
                <td>{row.autoApproved}</td>
                <td>{row.adminApproved}</td>
                <td>{row.rejected}</td>
                <td>{percent(row.rejected, row.opened)}</td>
                <td>{row.awaiting}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td className="empty" colSpan={7}>
                  Nenhuma solicitação aberta no período.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getUser();
  if (!user) redirect("/login?redirect=/painel");
  if (user.role !== "admin") redirect("/minhas-solicitacoes");
  const params = await searchParams;
  const filters = parseDashboardFilters(params);
  const periodPage = pageParam(params, "p");
  const waitingPage = pageParam(params, "pa");
  const attentionPage = pageParam(params, "pt");
  const pages: Record<string, number> = { p: periodPage, pa: waitingPage, pt: attentionPage };
  const pageHref = (key: string) => (page: number) => {
    const extra = Object.fromEntries(
      Object.entries({ ...pages, [key]: page }).map(([name, value]) => [name, value > 1 ? value : undefined]),
    );
    return `/painel?${dashboardQuery(filters, extra)}`;
  };

  await recoverStaleRequests();
  const scope = scopeWhere(filters);
  const waitingWhere = { ...scope, status: "PENDING_REVIEW" };
  const attentionWhere = { ...scope, status: { in: ATTENTION_STATUSES } };
  const previous = previousFilters(filters);
  const partnerIds = await partnerRequestIds(filters);
  const [
    summary,
    decisionTimes,
    timeline,
    reasons,
    previousSummary,
    previousDecision,
    periodList,
    waiting,
    waitingCount,
    attention,
    attentionCount,
    requesters,
  ] = await Promise.all([
    loadSummary(filters),
    loadDecisionTimes(filters),
    loadTimeline(filters),
    loadRejectionReasons(filters),
    previous ? loadSummary(previous) : null,
    previous ? loadDecisionTimes(previous) : null,
    db.dmaRequest.findMany({
      where: periodWhere(filters, partnerIds),
      orderBy: { createdAt: "desc" },
      skip: (periodPage - 1) * PERIOD_PAGE_SIZE,
      take: PERIOD_PAGE_SIZE,
      select: {
        ...listSelect,
        ...outcomeSelect,
        analyses: { orderBy: { createdAt: "desc" }, take: 1, select: { comparison: true } },
      },
    }),
    db.dmaRequest.findMany({
      where: waitingWhere,
      orderBy: { submittedAt: "asc" },
      skip: (waitingPage - 1) * QUEUE_PAGE_SIZE,
      take: QUEUE_PAGE_SIZE,
      select: listSelect,
    }),
    db.dmaRequest.count({ where: waitingWhere }),
    db.dmaRequest.findMany({
      where: attentionWhere,
      orderBy: { updatedAt: "asc" },
      skip: (attentionPage - 1) * QUEUE_PAGE_SIZE,
      take: QUEUE_PAGE_SIZE,
      select: listSelect,
    }),
    db.dmaRequest.count({ where: attentionWhere }),
    listRequesters(),
  ]);

  const { totals, byStore, byPartner, byRequester } = summary;
  const label = periodLabel(filters);
  const hasScope = Boolean(filters.store || filters.requesterId || filters.actionType || filters.status || filters.partner);
  const decision = decisionTimes.total;
  const before = previousSummary?.totals;
  /** Variação do indicador contra o período anterior, com o valor anterior para referência. */
  const change = (current: number | null, prior: number | null | undefined, format: (value: number) => string = String) => {
    if (!previous || prior == null) return undefined;
    const text = variation(current, prior);
    if (text === "sem variação") return `Igual ao período anterior (${format(prior)})`;
    if (text === "sem base anterior") return `Período anterior: ${format(prior)}`;
    return text ? `${text} vs. período anterior (${format(prior)})` : undefined;
  };
  const metrics = [
    {
      label: "Abertas",
      value: String(totals.opened),
      detail: "Solicitações abertas pelas lojas no período",
      change: change(totals.opened, before?.opened),
    },
    {
      label: "Aprovadas automaticamente",
      value: String(totals.autoApproved),
      detail: `${percent(totals.autoApproved, totals.opened)} das abertas · Rentalcars e Rentcars`,
      change: change(totals.autoApproved, before?.autoApproved),
    },
    {
      label: "Aprovadas pelo administrador",
      value: String(totals.adminApproved),
      detail: `${percent(totals.adminApproved, totals.opened)} das abertas`,
      change: change(totals.adminApproved, before?.adminApproved),
    },
    {
      label: "Recusadas",
      value: String(totals.rejected),
      detail: `${percent(totals.rejected, totals.opened)} das abertas · ao menos uma vez`,
      change: change(totals.rejected, before?.rejected),
    },
    {
      label: "Tempo de decisão",
      value: formatDuration(decision.medianSeconds),
      detail: decision.decisions
        ? `Mediana no expediente (${BUSINESS_HOURS.label}) · média ${formatDuration(decision.averageSeconds)} · corrido ${formatDuration(decision.calendarMedianSeconds)} · ${decision.decisions} ${decision.decisions === 1 ? "decisão" : "decisões"}`
        : "Nenhuma decisão do administrador no período",
      change: decision.decisions ? change(decision.medianSeconds, previousDecision?.total.medianSeconds, formatDuration) : undefined,
    },
  ];

  return (
    <main className="shell dashboard-shell">
      <header className="dashboard-heading">
        <div>
          <span className="eyebrow">Administração</span>
          <h1>Painel de acompanhamento</h1>
          <p>Abertura de solicitações pelas lojas, aprovações, tempo de decisão e o que está parado.</p>
        </div>
        <div className="dashboard-heading-actions">
          <RefreshPageButton />
          <a className="button primary" href={`/api/admin/dashboard/report?${dashboardQuery(filters)}`} download>
            Exportar relatório
          </a>
        </div>
      </header>

      <section className="panel dashboard-filters" aria-label="Filtros">
        <nav className="admin-request-tabs period-tabs" aria-label="Período">
          {(Object.keys(PERIODS) as Period[]).map((key) => (
            <Link
              key={key}
              href={`/painel?${dashboardQuery({ ...filters, period: key, de: undefined, ate: undefined })}`}
              className={`button ${key === filters.period ? "primary" : "secondary"}`}
              aria-current={key === filters.period ? "page" : undefined}
            >
              {PERIODS[key]}
            </Link>
          ))}
        </nav>
        <form className="filter-bar" action="/painel">
          {filters.period !== "personalizado" && <input type="hidden" name="periodo" value={filters.period} />}
          <label className="filter-field">
            De
            <input type="date" name="de" defaultValue={filters.de} />
          </label>
          <label className="filter-field">
            Até
            <input type="date" name="ate" defaultValue={filters.ate} />
          </label>
          <label className="filter-field">
            Loja
            <select name="loja" defaultValue={filters.store ?? ""}>
              <option value="">Todas</option>
              {STORES.map((store) => (
                <option key={store} value={store}>
                  {storeLabel(store)}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-field">
            Atendente
            <select name="atendente" defaultValue={filters.requesterId ?? ""}>
              <option value="">Todos</option>
              {requesters.map((requester) => (
                <option key={requester.id} value={requester.id}>
                  {personName(requester.name, requester.email)}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-field">
            Ação
            <select name="acao" defaultValue={filters.actionType ?? ""}>
              <option value="">Todas</option>
              {Object.entries(ACTION_LABELS).map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-field">
            Situação
            <select name="situacao" defaultValue={filters.status ?? ""}>
              <option value="">Todas</option>
              {Object.entries(statusLabels).map(([value, text]) => (
                <option key={value} value={value}>
                  {text}
                </option>
              ))}
            </select>
          </label>
          {filters.partner && <input type="hidden" name="parceiro" value={filters.partner} />}
          <button className="button primary" type="submit">
            Filtrar
          </button>
          {(filters.period === "personalizado" || hasScope) && (
            <Link className="button secondary" href="/painel">
              Limpar filtros
            </Link>
          )}
        </form>
        {filters.partner && (
          <p className="dashboard-active-filter">
            Parceiro: <strong>{filters.partner}</strong>
            <Link
              href={`/painel?${dashboardQuery({ ...filters, partner: undefined })}`}
              aria-label={`Remover filtro de parceiro ${filters.partner}`}
            >
              Remover ✕
            </Link>
          </p>
        )}
      </section>

      <section className="dashboard-metrics dashboard-metrics-auto" aria-label={`Resumo · ${label}`}>
        {metrics.map((metric) => (
          <div className="dashboard-metric" key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.detail}</small>
            {metric.change && <small className="metric-change">{metric.change}</small>}
          </div>
        ))}
      </section>

      <section className="panel dashboard-recent">
        <div className="panel-head">
          <div>
            <h2>
              Solicitações abertas por {UNIT_LABELS[timeline.unit]} · {label}
            </h2>
            <p>Passe o mouse sobre uma barra para ver o total.</p>
          </div>
        </div>
        <TimelineChart points={timeline.points} unitLabel={UNIT_LABELS[timeline.unit]} />
      </section>

      <section className="panel dashboard-recent">
        <div className="panel-head">
          <div>
            <h2>Por loja · {label}</h2>
            <p>
              Solicitações abertas no período, pela loja do contrato. Clique na loja para filtrar o painel. &quot;Agora&quot; mostra a
              situação atual dessas solicitações; o tempo de decisão é a mediana no expediente ({BUSINESS_HOURS.label}) das decisões tomadas
              no período.
            </p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="dashboard-table dashboard-numbers">
            <thead>
              <tr>
                <th>Loja</th>
                <th>Abertas</th>
                <th>Aprov. automática</th>
                <th>Aprov. administrador</th>
                <th>Recusadas</th>
                <th>% recusa</th>
                <th>Aguardando agora</th>
                <th>Atenção agora</th>
                <th>Tempo de decisão</th>
              </tr>
            </thead>
            <tbody>
              {byStore.map((item) => {
                const time = decisionTimes.byStore.get(item.store);
                return (
                  <tr key={item.store}>
                    <td className="strong">
                      {STORES.some((store) => store === item.store) ? (
                        <Link href={`/painel?${dashboardQuery({ ...filters, store: item.store })}`}>{storeLabel(item.store)}</Link>
                      ) : (
                        item.store
                      )}
                    </td>
                    <td>{item.opened}</td>
                    <td>{item.autoApproved}</td>
                    <td>{item.adminApproved}</td>
                    <td>{item.rejected}</td>
                    <td>{percent(item.rejected, item.opened)}</td>
                    <td>{item.awaiting}</td>
                    <td>{item.attention}</td>
                    <td
                      title={
                        time
                          ? `Média ${formatDuration(time.averageSeconds)} · corrido ${formatDuration(time.calendarMedianSeconds)} · ${time.decisions} decisões`
                          : undefined
                      }
                    >
                      {formatDuration(time?.medianSeconds)}
                    </td>
                  </tr>
                );
              })}
              {!byStore.length && (
                <tr>
                  <td className="empty" colSpan={9}>
                    Nenhuma solicitação aberta no período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel dashboard-recent">
        <div className="panel-head">
          <div>
            <h2>Motivos de recusa · {label}</h2>
            <p>
              Por que as solicitações abertas no período foram recusadas. Uma solicitação pode ter mais de um motivo; a recusa do
              administrador tem o motivo escrito na própria solicitação.
            </p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Motivo</th>
                <th>Ocorrências</th>
                <th>Lojas com mais ocorrências</th>
              </tr>
            </thead>
            <tbody>
              {reasons.map((item) => (
                <tr key={item.reason}>
                  <td className="strong dashboard-wrap">{item.reason}</td>
                  <td>{item.total}</td>
                  <td className="dashboard-wrap">
                    {item.stores
                      .slice(0, 3)
                      .map((store) => `${storeLabel(store.store)} (${store.total})`)
                      .join(" · ")}
                    {item.stores.length > 3 ? ` · +${item.stores.length - 3}` : ""}
                  </td>
                </tr>
              ))}
              {!reasons.length && (
                <tr>
                  <td className="empty" colSpan={3}>
                    Nenhuma recusa no período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <CountsTable
        title={`Por parceiro · ${label}`}
        description="Parceiro que vendeu a reserva, lido no voucher pela análise. Solicitações de considerar DMA não têm voucher. Clique no parceiro para filtrar o painel."
        nameHeader="Parceiro"
        rows={byPartner.map((item) => ({
          ...item,
          href: item.name === filters.partner ? undefined : `/painel?${dashboardQuery({ ...filters, partner: item.name })}`,
        }))}
      />

      <CountsTable
        title={`Por atendente · ${label}`}
        description="Quem abriu as solicitações. Clique no nome para filtrar o painel pelo atendente."
        nameHeader="Atendente"
        rows={byRequester.map((item) => ({ ...item, href: `/painel?${dashboardQuery({ ...filters, requesterId: item.requesterId })}` }))}
      />

      <section className="panel dashboard-recent" id="solicitacoes">
        <div className="panel-head">
          <div>
            <h2>Solicitações do período · {totals.opened}</h2>
            <p>Todas as solicitações dos filtros acima, das mais recentes para as mais antigas.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Contrato</th>
                <th>Loja</th>
                <th>Atendente</th>
                <th>Parceiro</th>
                <th>Situação</th>
                <th>Aberta em</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {periodList.map((item) => {
                const outcome = outcomeLabel(item.status, requestOutcome(item).autoApproved);
                return (
                  <tr key={item.id}>
                    <td className="strong">
                      {item.contractName}
                      <span className="subcell">{ACTION_LABELS[item.actionType] || item.actionType}</span>
                    </td>
                    <td>{requestStore(item)}</td>
                    <td>{personName(item.requester.name, item.requester.email)}</td>
                    <td>{partnerName(rawPartner(item.analyses[0]?.comparison, item.actionType))}</td>
                    <td>
                      <span className="dashboard-status">{statusLabels[item.status] || "Situação não identificada"}</span>
                      {outcome !== "—" && <span className="subcell">{outcome}</span>}
                    </td>
                    <td>{formatDateTime(item.createdAt)}</td>
                    <td>
                      <Link href={`/solicitacoes/${item.id}`}>Abrir →</Link>
                    </td>
                  </tr>
                );
              })}
              {!periodList.length && (
                <tr>
                  <td className="empty" colSpan={7}>
                    Nenhuma solicitação nesta página.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <LinkPagination page={periodPage} total={totals.opened} pageSize={PERIOD_PAGE_SIZE} href={pageHref("p")} />
      </section>

      <section className="panel dashboard-recent" id="aguardando">
        <div className="panel-head">
          <div>
            <h2>Aguardando o administrador · {waitingCount}</h2>
            <p>As que esperam decisão há mais tempo. Vale a loja, o atendente e a ação filtrados, não o período nem a situação.</p>
          </div>
          <Link className="button secondary" href="/analise?aba=pendentes">
            Ver fila completa →
          </Link>
        </div>
        <div className="table-wrap">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Contrato</th>
                <th>Loja</th>
                <th>Atendente</th>
                <th>Aguardando há</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {waiting.map((item) => (
                <tr key={item.id}>
                  <td className="strong">{item.contractName}</td>
                  <td>{requestStore(item)}</td>
                  <td>{personName(item.requester.name, item.requester.email)}</td>
                  <td>{elapsed(item.submittedAt ?? item.createdAt)}</td>
                  <td>
                    <Link href={`/solicitacoes/${item.id}`}>Abrir →</Link>
                  </td>
                </tr>
              ))}
              {!waiting.length && (
                <tr>
                  <td className="empty" colSpan={5}>
                    Nenhuma solicitação aguardando decisão.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <LinkPagination page={waitingPage} total={waitingCount} pageSize={QUEUE_PAGE_SIZE} href={pageHref("pa")} />
      </section>

      <section className="panel dashboard-recent" id="atencao">
        <div className="panel-head">
          <div>
            <h2>Precisam de atenção · {attentionCount}</h2>
            <p>Análise da IA não concluída ou envio ao Coral com falha ou sem confirmação, das mais antigas para as mais recentes.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Contrato</th>
                <th>Loja</th>
                <th>Atendente</th>
                <th>Situação</th>
                <th>Parada há</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {attention.map((item) => (
                <tr key={item.id}>
                  <td className="strong">{item.contractName}</td>
                  <td>{requestStore(item)}</td>
                  <td>{personName(item.requester.name, item.requester.email)}</td>
                  <td>
                    <span className="dashboard-status">{statusLabels[item.status] || "Situação não identificada"}</span>
                  </td>
                  <td>{elapsed(item.updatedAt)}</td>
                  <td>
                    <Link href={`/solicitacoes/${item.id}`}>Abrir →</Link>
                  </td>
                </tr>
              ))}
              {!attention.length && (
                <tr>
                  <td className="empty" colSpan={6}>
                    Nada precisando de atenção agora.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <LinkPagination page={attentionPage} total={attentionCount} pageSize={QUEUE_PAGE_SIZE} href={pageHref("pt")} />
      </section>
    </main>
  );
}
