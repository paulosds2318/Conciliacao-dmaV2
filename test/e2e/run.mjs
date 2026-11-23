// Testes de tela (navegador real) contra o app local em Docker, com dados FICTÍCIOS e o Coral SIMULADO.
// Uso: npm run test:e2e   (veja test/e2e/README.md para preparar o ambiente)
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { connect, reporter, sleep } from "./lib/cdp.mjs";
import { writePdfs } from "./lib/pdfs.mjs";
import { runAccessibility } from "./acessibilidade.mjs";
import { runFlows } from "./fluxos.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const env = process.env;
const BASE = env.E2E_BASE || "http://localhost:3001";
const PORT = Number(env.E2E_PORT || 9333);
const APP = env.E2E_APP_CONTAINER || "conciliao_dmav2-app-1";
const DB = env.E2E_DB_CONTAINER || "conciliao_dmav2-db-1";
const DB_NAME = env.E2E_DB_NAME || "conciliacao_dma";
const DB_USER = env.E2E_DB_USER || "postgres";
const AXE_VERSION = "4.10.2";

const docker = (...args) => spawnSync("docker", args, { encoding: "utf8" });
const fail = (message) => {
  console.error(`\n${message}`);
  process.exit(2);
};

function browserPath() {
  const candidates = [
    env.E2E_BROWSER,
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate));
}

/** Remove os dados de teste (usuários @local.test e solicitações q1 a q3) do banco local. */
function cleanup() {
  const sql =
    "delete from audit_events where \"requestId\" in ('q1','q2','q3'); delete from dma_requests where id in ('q1','q2','q3'); " +
    "delete from audit_events where \"actorId\" in (select id from users where email like '%@local.test'); delete from users where email like '%@local.test';";
  docker("exec", DB, "psql", "-U", DB_USER, "-d", DB_NAME, "-c", sql);
}

// Segurança: só roda contra um app em modo de teste (Coral simulado). Em outro modo, aprovações seriam reais.
const mode = docker("exec", APP, "printenv", "MODO_TESTE_API");
if (mode.status !== 0) fail(`Não consegui falar com o container "${APP}". Suba o app (veja test/e2e/README.md).`);
if (mode.stdout.trim() !== "true")
  fail(`O app não está em modo de teste (MODO_TESTE_API=true). Recusei rodar: as aprovações seriam reais.`);

const browser = browserPath();
if (!browser) fail("Navegador não encontrado. Defina E2E_BROWSER com o caminho do Edge ou do Chrome.");

const work = join(realpathSync.native(tmpdir()), `dma-e2e-${randomBytes(4).toString("hex")}`);
mkdirSync(work, { recursive: true });
const docs = work.replaceAll("\\", "/");
writePdfs(docs);

const axePath = join(realpathSync.native(tmpdir()), `axe-core-${AXE_VERSION}.min.js`);
if (!existsSync(axePath)) {
  const response = await fetch(`https://cdnjs.cloudflare.com/ajax/libs/axe-core/${AXE_VERSION}/axe.min.js`);
  if (!response.ok) fail("Não consegui baixar o axe-core (verificador de acessibilidade).");
  writeFileSync(axePath, await response.text());
}
const axeSource = readFileSync(axePath, "utf8");

const password = `T-${randomBytes(9).toString("base64url")}`;
cleanup();
const copy = docker("cp", join(here, "seed.mjs"), `${APP}:/app/e2e-seed.mjs`);
if (copy.status !== 0) fail(`Não consegui copiar o seed para o container: ${copy.stderr}`);
const seeded = docker("exec", "-e", `E2E_PASSWORD=${password}`, APP, "node", "/app/e2e-seed.mjs");
if (seeded.status !== 0) {
  cleanup();
  fail(`O seed falhou:\n${seeded.stderr || seeded.stdout}`);
}

const profile = join(work, "perfil");
const child = spawn(
  browser,
  ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "about:blank"],
  {
    stdio: "ignore",
  },
);
const stopBrowser = () => {
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"]);
  else child.kill("SIGKILL");
};

const report = reporter();
let page;
try {
  for (let i = 0; i < 30; i++) {
    try {
      await fetch(`http://127.0.0.1:${PORT}/json/version`);
      break;
    } catch {
      await sleep(500);
    }
  }
  page = await connect(PORT);
  const context = { page, base: BASE, docs, password, report, axeSource };
  const only = env.E2E_ONLY;
  // A auditoria vem primeiro: os fluxos aprovam q1 e q3, e a auditoria precisa delas pendentes.
  if (!only || only === "acessibilidade") {
    console.log("\n=== Celular e acessibilidade ===");
    await runAccessibility(context);
  }
  if (!only || only === "fluxos") {
    console.log("\n=== Fluxos de tela ===");
    await runFlows(context);
  }
} finally {
  page?.close();
  stopBrowser();
  cleanup();
  // O Windows pode demorar a soltar os arquivos do navegador; apagar a pasta temporária é só faxina e nunca derruba o resultado.
  await sleep(1500);
  try {
    rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  } catch {
    console.warn(`(não consegui apagar ${work}; pode remover depois)`);
  }
}
console.log(`\n${report.total() - report.failures()}/${report.total()} verificações OK`);
process.exit(report.failures() ? 1 : 0);
