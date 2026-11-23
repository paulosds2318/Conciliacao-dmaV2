// Auditoria de celular e acessibilidade (axe-core) em todas as telas principais: rolagem horizontal, contraste, rótulos, regiões.
import { login } from "./lib/cdp.mjs";

/** Telas auditadas. `role`: quem entra; null = sem login. As do admin e do atendente usam os usuários de teste. */
const SCREENS = [
  { name: "Login", path: "/login", role: null },
  { name: "Início (atendente)", path: "/", role: "atendente" },
  { name: "Nova solicitação", path: "/solicitacoes/nova", role: "atendente" },
  { name: "Minhas solicitações", path: "/minhas-solicitacoes", role: "atendente" },
  { name: "Consulta DMA", path: "/consulta-dma", role: "atendente" },
  { name: "Início (admin)", path: "/", role: "admin" },
  { name: "Fila de aprovações", path: "/analise", role: "admin" },
  { name: "Detalhe da solicitação", path: "/solicitacoes/q1", role: "admin" },
  { name: "Painel do administrador", path: "/painel", role: "admin" },
  { name: "Ação manual por planilha", path: "/acoes-manuais", role: "admin" },
  { name: "Gestão de usuários", path: "/gestao-usuarios", role: "admin" },
];

const BATCH_STATE = {
  items: [
    { id: "q1", label: "FOR710001-26", actionType: "DESCONSIDERAR_DMA" },
    { id: "q2", label: "FOR710002-26", actionType: "CONSIDERAR_DMA" },
    { id: "q3", label: "FOR710003-26", actionType: "DESCONSIDERAR_DMA" },
    { id: "q4", label: "FOR710004-26", actionType: "DESCONSIDERAR_DMA" },
  ],
  steps: {
    q1: { state: "approved" },
    q2: { state: "failed", message: "O Coral recusou a ação.", uncertain: false, coral: true },
    q3: { state: "failed", message: "Sem resposta do servidor.", uncertain: true, coral: true },
    q4: { state: "skipped" },
  },
  startedAt: 0,
  finishedAt: 95000,
  phase: "done",
  stoppedBy: "coral",
};

async function audit(page, axeSource, report, label) {
  const metrics = JSON.parse(
    await page.evaluate(`JSON.stringify({
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
      smallText: [...document.querySelectorAll("main p, main td, main span, main label, main small")]
        .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 11 && el.textContent.trim())
        .map((el) => el.tagName.toLowerCase() + "." + String(el.className).slice(0, 30) + " (" + getComputedStyle(el).fontSize + ")")
    })`),
  );
  await page.evaluate(axeSource);
  const violations = JSON.parse(
    await page.evaluate(
      `axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "best-practice"] }).then((r) => JSON.stringify(r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, first: v.nodes[0].target.join(" ").slice(0, 80) }))))`,
    ),
  );
  report.check(`${label}: sem rolagem horizontal`, metrics.overflowX <= 1, metrics.overflowX > 1 ? `+${metrics.overflowX}px` : "");
  report.check(`${label}: sem texto menor que 11px`, metrics.smallText.length === 0, metrics.smallText.slice(0, 4).join(", "));
  report.check(
    `${label}: acessibilidade (axe)`,
    violations.length === 0,
    violations.map((v) => `[${v.impact}] ${v.id} x${v.n} em ${v.first}`).join(" | "),
  );
}

export async function runAccessibility({ page, base, password, report, axeSource }) {
  for (const mode of [
    { name: "celular", metrics: { width: 375, height: 812, mobile: true } },
    { name: "desktop", metrics: { width: 1366, height: 900, mobile: false } },
  ]) {
    await page.send("Emulation.setDeviceMetricsOverride", { ...mode.metrics, deviceScaleFactor: 1 });
    let current = "";
    for (const screen of SCREENS) {
      const who = screen.role ?? "anon";
      if (who !== current) {
        if (screen.role) await login(page, base, `teste.${screen.role}@local.test`, password);
        else await page.send("Network.clearBrowserCookies");
        current = who;
      }
      await page.navigate(`${base}${screen.path}`);
      await audit(page, axeSource, report, `${screen.name} (${mode.name})`);
    }
    // Telas que dependem de interação: fila com seleção, diálogo de confirmação e página do lote.
    await login(page, base, "teste.admin@local.test", password);
    await page.navigate(`${base}/analise`);
    await page.evaluate(`document.querySelector("td.batch-check input")?.click()`);
    await page.sleep(500);
    await audit(page, axeSource, report, `Fila com seleção (${mode.name})`);
    await page.navigate(`${base}/solicitacoes/q1`);
    await page.click("Validar e executar ação");
    await page.sleep(700);
    await audit(page, axeSource, report, `Diálogo de confirmação (${mode.name})`);
    await page.navigate(`${base}/analise`);
    await page.evaluate(`sessionStorage.setItem("dma:aprovacao-em-lote", JSON.stringify(${JSON.stringify(BATCH_STATE)}))`);
    await page.navigate(`${base}/analise/lote`);
    await audit(page, axeSource, report, `Página do lote (${mode.name})`);
  }
}
