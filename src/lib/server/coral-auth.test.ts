import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CoralAuthError, createCoralAuth, hasCoralCredentials } from "./coral-auth.ts";

const silent = { info() {}, warn() {}, error() {} };
const env = { CORAL_AUTH_LOGIN: "svc-conciliacao-dma", CORAL_AUTH_PASSWORD: "senha" };

/** fetch falso: cada chamada consome a próxima resposta da fila e fica registrada em `calls`. */
function fakeFetch(responses: Array<{ status: number; body?: unknown } | Error>) {
  const calls: Array<{ url: string; body: unknown }> = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null });
    const next = responses.shift();
    if (!next) throw new Error("chamada inesperada ao fetch");
    if (next instanceof Error) throw next;
    return new Response(next.body === undefined ? null : JSON.stringify(next.body), { status: next.status });
  }) as typeof fetch;
  return { impl, calls };
}

function clock(start = 1_000_000) {
  let current = start;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

const ok = (token: string) => ({ status: 200, body: { data: { token } } });

describe("coral-auth", () => {
  it("faz login em /api/auth/login com login e senha e reaproveita o token por 55 minutos", async () => {
    const fetch = fakeFetch([ok("t1"), ok("t2")]);
    const time = clock();
    const auth = createCoralAuth({ fetchImpl: fetch.impl, now: time.now, env, logger: silent });

    assert.equal(await auth.getToken(), "t1");
    assert.equal(fetch.calls[0].url, "https://servicescoral.aluguefoco.com.br/api/auth/login");
    assert.deepEqual(fetch.calls[0].body, { login: "svc-conciliacao-dma", password: "senha" });

    time.advance(54 * 60 * 1000);
    assert.equal(await auth.getToken(), "t1");
    assert.equal(fetch.calls.length, 1);

    time.advance(2 * 60 * 1000);
    assert.equal(await auth.getToken(), "t2");
    assert.equal(fetch.calls.length, 2);
  });

  it("faz um único login quando várias requisições pedem token ao mesmo tempo", async () => {
    const fetch = fakeFetch([ok("t1")]);
    const auth = createCoralAuth({ fetchImpl: fetch.impl, env, logger: silent });
    const tokens = await Promise.all([auth.getToken(), auth.getToken(), auth.getToken()]);
    assert.deepEqual(tokens, ["t1", "t1", "t1"]);
    assert.equal(fetch.calls.length, 1);
  });

  it("usa o host de CORAL_CONTRACT_LOOKUP_URL ou CORAL_AUTH_URL para o login", async () => {
    const fromLookup = fakeFetch([ok("t1")]);
    await createCoralAuth({
      fetchImpl: fromLookup.impl,
      logger: silent,
      env: { ...env, CORAL_CONTRACT_LOOKUP_URL: "https://homologservicescoral.aluguefoco.com.br/api/rentagreement/{CONTRATO}" },
    }).getToken();
    assert.equal(fromLookup.calls[0].url, "https://homologservicescoral.aluguefoco.com.br/api/auth/login");

    const explicit = fakeFetch([ok("t1")]);
    await createCoralAuth({
      fetchImpl: explicit.impl,
      logger: silent,
      env: { ...env, CORAL_AUTH_URL: "http://localhost:4004/api/auth/login" },
    }).getToken();
    assert.equal(explicit.calls[0].url, "http://localhost:4004/api/auth/login");
  });

  it("invalidate força novo login, mas não descarta um token mais novo", async () => {
    const fetch = fakeFetch([ok("t1"), ok("t2")]);
    const auth = createCoralAuth({ fetchImpl: fetch.impl, env, logger: silent });
    const first = await auth.getToken();
    auth.invalidate(first);
    assert.equal(await auth.getToken(), "t2");
    auth.invalidate(first);
    assert.equal(await auth.getToken(), "t2");
    assert.equal(fetch.calls.length, 2);
  });

  it("adota o token renovado que o gate devolve", async () => {
    const fetch = fakeFetch([ok("t1")]);
    const auth = createCoralAuth({ fetchImpl: fetch.impl, env, logger: silent });
    await auth.getToken();
    auth.adopt("renovado");
    assert.equal(await auth.getToken(), "renovado");
    assert.equal(fetch.calls.length, 1);
  });

  it("senha recusada bloqueia novas tentativas por 5 minutos, para não desativar o usuário", async () => {
    const fetch = fakeFetch([{ status: 400, body: { data: { code: "UserNotFoundException" } } }, ok("t1")]);
    const time = clock();
    const auth = createCoralAuth({ fetchImpl: fetch.impl, now: time.now, env, logger: silent });

    await assert.rejects(
      auth.getToken(),
      (error: unknown) => error instanceof CoralAuthError && error.kind === "CREDENTIALS" && error.uncertain === false,
    );
    time.advance(4 * 60 * 1000);
    await assert.rejects(auth.getToken(), (error: unknown) => error instanceof CoralAuthError && error.kind === "CREDENTIALS");
    assert.equal(fetch.calls.length, 1);

    time.advance(2 * 60 * 1000);
    assert.equal(await auth.getToken(), "t1");
    assert.equal(fetch.calls.length, 2);
  });

  it("desafio de primeiro acesso ou MFA vira erro e também bloqueia novas tentativas", async () => {
    const fetch = fakeFetch([{ status: 200, body: { data: { challenge: "NEW_PASSWORD_REQUIRED", session: "s" } } }]);
    const auth = createCoralAuth({ fetchImpl: fetch.impl, env, logger: silent });
    await assert.rejects(auth.getToken(), (error: unknown) => error instanceof CoralAuthError && error.kind === "CHALLENGE");
    await assert.rejects(auth.getToken(), (error: unknown) => error instanceof CoralAuthError && error.kind === "CHALLENGE");
    assert.equal(fetch.calls.length, 1);
  });

  it("falha de rede ou 5xx não bloqueia: a próxima requisição tenta de novo", async () => {
    const fetch = fakeFetch([
      new TypeError("fetch failed"),
      { status: 503, body: { data: { code: "AuthenticationException" } } },
      ok("t1"),
    ]);
    const auth = createCoralAuth({ fetchImpl: fetch.impl, env, logger: silent });
    await assert.rejects(auth.getToken(), (error: unknown) => error instanceof CoralAuthError && error.kind === "UNAVAILABLE");
    await assert.rejects(auth.getToken(), (error: unknown) => error instanceof CoralAuthError && error.kind === "UNAVAILABLE");
    assert.equal(await auth.getToken(), "t1");
  });

  it("sem login e senha lança erro de configuração, mesmo com CORAL_AUTH_TOKEN definido", async () => {
    const fetch = fakeFetch([]);
    const auth = createCoralAuth({ fetchImpl: fetch.impl, env: { CORAL_AUTH_TOKEN: "fixo" }, logger: silent });
    await assert.rejects(auth.getToken(), (error: unknown) => error instanceof CoralAuthError && error.kind === "CONFIG");
    assert.equal(auth.isConfigured(), false);
    assert.equal(fetch.calls.length, 0);
    assert.equal(hasCoralCredentials({ CORAL_AUTH_TOKEN: "fixo" }), false);
    assert.equal(hasCoralCredentials(env), true);
  });
});
