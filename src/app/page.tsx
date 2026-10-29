import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getUser } from "@/lib/server/auth";
import { RefreshPageButton } from "@/components/refresh-page-button";
import { REQUEST_STATUS_LABELS } from "@/lib/services/request-status";

const actionLabels: Record<string, string> = {
  CONSIDERAR_DMA: "Considerar DMA",
  DESCONSIDERAR_DMA: "Desconsiderar DMA",
};
const statusLabels: Record<string, string> = REQUEST_STATUS_LABELS;

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

export default async function HomePage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const isAdmin = user.role === "admin";
  const scope = isAdmin ? {} : { requesterId: user.id };
  const [total, pending, completed, archived, corrections, recent] = await Promise.all([
    db.dmaRequest.count({ where: scope }),
    db.dmaRequest.count({ where: { ...scope, status: "PENDING_REVIEW" } }),
    db.dmaRequest.count({ where: { ...scope, status: { in: ["EXECUTING", "COMPLETED", "EXECUTION_FAILED", "EXECUTION_UNCERTAIN"] } } }),
    isAdmin ? db.dmaRequest.count({ where: { status: "ARCHIVED" } }) : Promise.resolve(0),
    isAdmin ? Promise.resolve(0) : db.dmaRequest.count({ where: { ...scope, status: { in: ["REJECTED", "ANALYSIS_FAILED"] } } }),
    db.dmaRequest.findMany({
      where: scope,
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: {
        id: true,
        contractName: true,
        actionType: true,
        status: true,
        updatedAt: true,
        requester: { select: { name: true, email: true } },
      },
    }),
  ]);

  const metrics = isAdmin
    ? [
        { label: "Aguardando aprovação", value: pending, detail: "Solicitações que precisam de decisão", href: "/analise" },
        { label: "Ações enviadas ao Coral", value: completed, detail: "Em andamento, concluídas ou com falha no processamento", href: "/analise" },
        { label: "Arquivadas / excluídas", value: archived, detail: "Registros preservados para auditoria", href: "/analise" },
      ]
    : [
        { label: "Minhas solicitações", value: total, detail: "Solicitações abertas por você", href: "/minhas-solicitacoes" },
        { label: "Aguardando aprovação", value: pending, detail: "Em análise do administrador", href: "/minhas-solicitacoes" },
        { label: "Correções disponíveis", value: corrections, detail: "Revise solicitações recusadas ou com falha na análise", href: "/minhas-solicitacoes" },
      ];

  const shortcuts = isAdmin
    ? [
        { href: "/analise", title: "Aprovar solicitações", text: "Revise documentos, decisões e histórico da equipe.", primary: true },
        { href: "/acoes-manuais", title: "Ação manual por planilha", text: "Importe contratos e acompanhe a execução DMA." },
        { href: "/consulta-dma", title: "Situação DMA", text: "Consulte contratos individualmente ou por planilha." },
        { href: "/gestao-usuarios", title: "Gestão de usuários", text: "Crie contas e gerencie os perfis de acesso." },
      ]
    : [
        { href: "/solicitacoes/nova", title: "Nova solicitação", text: "Envie o contrato e o voucher para análise.", primary: true },
        { href: "/minhas-solicitacoes", title: "Minhas solicitações", text: "Acompanhe, corrija ou edite solicitações permitidas." },
        { href: "/consulta-dma", title: "Situação DMA", text: "Consulte a situação atual de um contrato ou planilha." },
      ];

  return (
    <main className="shell dashboard-shell">
      <header className="dashboard-heading">
        <div>
          <span className="eyebrow">{isAdmin ? "Painel administrativo" : "Área do atendente"}</span>
          <h1>Conciliação DMA</h1>
          <p>{isAdmin ? "Acompanhe as solicitações e gerencie as ações da equipe." : "Abra solicitações e acompanhe o andamento dos seus contratos."}</p>
        </div>
        <div className="dashboard-heading-actions">
          <RefreshPageButton />
          <Link className="button primary" href={isAdmin ? "/analise" : "/solicitacoes/nova"}>
            {isAdmin ? "Aprovar solicitações" : "Nova solicitação"}
          </Link>
        </div>
      </header>

      <section className="dashboard-metrics" aria-label="Resumo das solicitações">
        {metrics.map((metric) => (
          <Link className="dashboard-metric" href={metric.href} key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.detail}</small>
          </Link>
        ))}
      </section>

      <section className="panel dashboard-recent">
        <div className="panel-head">
          <div>
            <h2>{isAdmin ? "Solicitações recentes" : "Minhas solicitações recentes"}</h2>
            <p>{isAdmin ? "Visão rápida das últimas movimentações de toda a equipe." : "Acompanhe as últimas atualizações das solicitações abertas por você."}</p>
          </div>
          <Link className="button secondary" href={isAdmin ? "/analise" : "/minhas-solicitacoes"}>
            {isAdmin ? "Ver todas" : "Ver minhas solicitações"} →
          </Link>
        </div>
        <div className="table-wrap">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Contrato</th>
                <th>Ação</th>
                {isAdmin && <th>Atendente</th>}
                <th>Situação</th>
                <th>Atualizado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {recent.map((request) => (
                <tr key={request.id}>
                  <td className="strong">{request.contractName}</td>
                  <td>{actionLabels[request.actionType] || request.actionType}</td>
                  {isAdmin && <td>{request.requester.name || request.requester.email}</td>}
                  <td><span className="dashboard-status">{statusLabels[request.status] || "Situação não identificada"}</span></td>
                  <td>{formatDate(request.updatedAt)}</td>
                  <td><Link href={`/solicitacoes/${request.id}`}>Abrir →</Link></td>
                </tr>
              ))}
              {!recent.length && (
                <tr>
                  <td className="empty" colSpan={isAdmin ? 6 : 5}>
                    {isAdmin ? "Ainda não há solicitações para exibir." : "Você ainda não abriu solicitações."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="dashboard-shortcuts" aria-label="Atalhos">
        {shortcuts.map((shortcut) => (
          <Link className={`dashboard-shortcut ${shortcut.primary ? "primary-shortcut" : ""}`} href={shortcut.href} key={shortcut.href}>
            <strong>{shortcut.title}<span aria-hidden="true">→</span></strong>
            <small>{shortcut.text}</small>
          </Link>
        ))}
      </section>
    </main>
  );
}
