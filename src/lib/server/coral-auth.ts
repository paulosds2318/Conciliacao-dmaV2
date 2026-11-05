/**
 * Autenticação no Coral (foco-auth) com um usuário de serviço exclusivo deste app.
 *
 * Em produção, CORAL_AUTH_LOGIN e CORAL_AUTH_PASSWORD vêm do segredo foco/office/apps (Secrets Manager),
 * injetados pela task definition do ECS. O token é obtido em POST /api/auth/login e guardado em memória.
 *
 * Regras do gate do Coral que orientam este módulo (foco-node, server.ts):
 * - O token só vale se for igual ao último gravado no Redis para o login, que expira em 1 hora. Cada novo
 *   login invalida o token anterior do mesmo usuário; por isso o usuário de serviço não pode ser usado em
 *   nenhum outro lugar.
 * - Um 401 é dado pelo gate antes do handler: a requisição não foi executada e pode ser repetida.
 * - O foco-auth desativa o usuário após MAX_LOGIN_ATTEMPTS senhas erradas e após MAX_DAYS_WITHOUT_LOGIN
 *   dias sem login: senha recusada bloqueia novas tentativas por alguns minutos e um login periódico
 *   mantém o usuário ativo.
 */

const TOKEN_TTL_MS = 55 * 60 * 1000;
const LOGIN_COOLDOWN_MS = 5 * 60 * 1000;
const LOGIN_TIMEOUT_MS = 15_000;
const KEEPALIVE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_CORAL_ORIGIN = "https://servicescoral.aluguefoco.com.br";

export type CoralAuthErrorKind = "CONFIG" | "CREDENTIALS" | "CHALLENGE" | "UNAVAILABLE" | "UNAUTHORIZED";

/** Falha de autenticação. `uncertain = false`: nenhuma ação chegou a ser executada no Coral. */
export class CoralAuthError extends Error {
  readonly kind: CoralAuthErrorKind;
  readonly uncertain = false;
  constructor(kind: CoralAuthErrorKind, message: string) {
    super(message);
    this.name = "CoralAuthError";
    this.kind = kind;
  }
}

type Env = Record<string, string | undefined>;
type Logger = Pick<Console, "info" | "warn" | "error">;
export type CoralAuthOptions = { fetchImpl?: typeof fetch; now?: () => number; env?: Env; logger?: Logger };

const REFUSED_MESSAGE = "O Coral recusou a autenticação do Conciliação DMA. Avise o suporte para conferir o usuário de serviço.";

export function createCoralAuth(options: CoralAuthOptions = {}) {
  const fetchImpl: typeof fetch = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const now = options.now ?? Date.now;
  const env: Env = options.env ?? process.env;
  const logger: Logger = options.logger ?? console;

  let cached: { token: string; expiresAt: number } | null = null;
  let pending: Promise<string> | null = null;
  let blocked: { until: number; error: CoralAuthError } | null = null;

  function credentials() {
    const login = env.CORAL_AUTH_LOGIN?.trim();
    const password = env.CORAL_AUTH_PASSWORD;
    return login && password ? { login, password } : null;
  }
  function loginUrl() {
    const explicit = env.CORAL_AUTH_URL?.trim();
    if (explicit) return explicit;
    let origin = DEFAULT_CORAL_ORIGIN;
    try {
      origin = new URL((env.CORAL_CONTRACT_LOOKUP_URL || DEFAULT_CORAL_ORIGIN).replace("{CONTRATO}", "x")).origin;
    } catch {
      /* mantém o padrão */
    }
    return `${origin}/api/auth/login`;
  }

  async function login(creds: { login: string; password: string }): Promise<string> {
    let response: Response;
    try {
      response = await fetchImpl(loginUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ login: creds.login, password: creds.password }),
        signal: AbortSignal.timeout(LOGIN_TIMEOUT_MS),
        cache: "no-store",
      });
    } catch (error) {
      logger.error(`[coral-auth] login indisponível em ${loginUrl()}:`, error instanceof Error ? error.message : error);
      throw new CoralAuthError("UNAVAILABLE", "Não foi possível conectar ao login do Coral. Tente novamente em instantes.");
    }
    const body: unknown = await response.json().catch(() => null);
    const envelope = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const data = envelope.data && typeof envelope.data === "object" ? (envelope.data as Record<string, unknown>) : envelope;

    if (response.ok && typeof data.token === "string" && data.token) return data.token;
    if (response.ok && data.challenge) {
      logger.error(
        `[coral-auth] o login de ${creds.login} pediu o desafio ${String(data.challenge)}: conclua o primeiro acesso ou desative o MFA desse usuário.`,
      );
      throw new CoralAuthError("CHALLENGE", REFUSED_MESSAGE);
    }
    if (response.status >= 400 && response.status < 500) {
      logger.error(
        `[coral-auth] login de ${creds.login} recusado (HTTP ${response.status}, ${String(data.code ?? "sem código")}). Confira CORAL_AUTH_LOGIN/CORAL_AUTH_PASSWORD e se o usuário está ativo. Nova tentativa só em ${LOGIN_COOLDOWN_MS / 60000} min, para não bloquear o usuário.`,
      );
      throw new CoralAuthError("CREDENTIALS", REFUSED_MESSAGE);
    }
    logger.error(`[coral-auth] login respondeu HTTP ${response.status} sem token.`);
    throw new CoralAuthError("UNAVAILABLE", "O login do Coral está indisponível. Tente novamente em instantes.");
  }

  /** Token válido para o header Authorization (sem o prefixo Bearer). Faz login só quando preciso. */
  async function getToken(): Promise<string> {
    const creds = credentials();
    if (!creds)
      throw new CoralAuthError("CONFIG", "A integração com o Coral não está configurada: defina CORAL_AUTH_LOGIN e CORAL_AUTH_PASSWORD.");
    if (cached && now() < cached.expiresAt) return cached.token;
    if (blocked && now() < blocked.until) throw blocked.error;
    pending ??= login(creds)
      .then((token) => {
        cached = { token, expiresAt: now() + TOKEN_TTL_MS };
        blocked = null;
        logger.info(`[coral-auth] token obtido para ${creds.login}.`);
        return token;
      })
      .catch((error: unknown) => {
        if (error instanceof CoralAuthError && (error.kind === "CREDENTIALS" || error.kind === "CHALLENGE")) {
          blocked = { until: now() + LOGIN_COOLDOWN_MS, error };
        }
        throw error;
      })
      .finally(() => {
        pending = null;
      });
    return pending;
  }

  /** Descarta o token depois de um 401. Ignora se outro pedido já trocou o token em uso. */
  function invalidate(token: string) {
    if (cached?.token === token) cached = null;
  }

  /** Usa o token renovado que o gate devolve no envelope `{ data, token }` quando o anterior expirou. */
  function adopt(token: unknown) {
    if (typeof token !== "string" || !token || !credentials() || cached?.token === token) return;
    cached = { token, expiresAt: now() + TOKEN_TTL_MS };
  }

  function isConfigured() {
    return credentials() !== null;
  }

  /** Login ao subir e a cada 24h, para o foco-auth não desativar o usuário por falta de uso. */
  function startKeepAlive() {
    if (!credentials()) return;
    const run = () => {
      getToken().catch(() => {
        /* o motivo já foi registrado no log */
      });
    };
    run();
    const timer = setInterval(run, KEEPALIVE_INTERVAL_MS);
    timer.unref?.();
  }

  return { getToken, invalidate, adopt, isConfigured, startKeepAlive };
}

export type CoralAuth = ReturnType<typeof createCoralAuth>;

// Uma instância por processo: o Next carrega este módulo em bundles diferentes (rotas e instrumentation).
// Sem compartilhar o cache, cada bundle faria o próprio login e invalidaria o token dos outros.
const shared = globalThis as unknown as { coralAuth?: CoralAuth };
export const coralAuth: CoralAuth = (shared.coralAuth ??= createCoralAuth());

/** Para o menu e o modo de teste: login e senha do usuário de serviço configurados. */
export function hasCoralCredentials(env: Env = process.env) {
  return Boolean(env.CORAL_AUTH_LOGIN?.trim() && env.CORAL_AUTH_PASSWORD);
}
