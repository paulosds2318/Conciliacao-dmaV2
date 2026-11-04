import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";

/**
 * Simula o gate do Coral: o token só vale se for o último emitido pelo login (como no Redis do foco-node).
 * Um 401 é dado antes do handler; `executed` conta só os PUT que chegaram de fato ao handler.
 */
const gate = {
  validToken: "",
  issued: 0,
  logins: 0,
  executed: 0,
  putStatus: 200 as number,
  rejectAll: false,
  networkErrorOnPut: false,
};

const realFetch = globalThis.fetch;
const realConsole = { info: console.info, warn: console.warn, error: console.error };

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const fakeCoral = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(String(input));
  const headers = new Headers(init?.headers);
  if (url.pathname === "/api/auth/login") {
    gate.logins++;
    gate.validToken = `t${++gate.issued}`;
    return json(200, { data: { token: gate.validToken } });
  }
  if (gate.rejectAll || headers.get("Authorization") !== `Bearer ${gate.validToken}`) return json(401, { message: "Access denied" });
  if (url.pathname === "/api/rentagreement/dma/eligibility" && init?.method === "PUT") {
    if (gate.networkErrorOnPut) throw new TypeError("fetch failed");
    if (gate.putStatus !== 200) return json(gate.putStatus, { message: "Forbidden" });
    gate.executed++;
    return json(200, { data: { action: "REGARD", received: 1, updated: 1 } });
  }
  const number = decodeURIComponent(url.pathname.split("/").pop() ?? "");
  return json(200, { data: { id: `id-${number}`, rentAgreementNumber: number, customerName: "Cliente" } });
}) as typeof fetch;

let coral: typeof import("./coral.ts");

before(async () => {
  Object.assign(process.env, {
    CORAL_AUTH_LOGIN: "svc-conciliacao-dma",
    CORAL_AUTH_PASSWORD: "senha",
    CORAL_CONTRACT_LOOKUP_URL: "https://coral.test/api/rentagreement/{CONTRATO}",
    CORAL_DMA_ELIGIBILITY_URL: "https://coral.test/api/rentagreement/dma/eligibility",
  });
  delete process.env.MODO_TESTE_API;
  globalThis.fetch = fakeCoral;
  console.info = console.warn = console.error = () => {};
  coral = await import("./coral.ts");
});

after(() => {
  globalThis.fetch = realFetch;
  Object.assign(console, realConsole);
});

beforeEach(() => {
  Object.assign(gate, { logins: 0, executed: 0, putStatus: 200, rejectAll: false, networkErrorOnPut: false });
});

describe("cliente Coral com usuário de serviço", () => {
  it("faz login na primeira consulta e reaproveita o token nas seguintes", async () => {
    const first = await coral.lookupContract("123");
    assert.equal(first?.id, "id-123");
    await coral.lookupContract("456");
    assert.equal(gate.logins, 1);
  });

  it("quando outro login invalida o token, renova e repete a consulta uma vez", async () => {
    gate.validToken = "token-de-outro-lugar";
    const contract = await coral.lookupContract("789");
    assert.equal(contract?.id, "id-789");
    assert.equal(gate.logins, 1);
  });

  it("PUT recusado com 401 é repetido após novo login e executa uma única vez", async () => {
    gate.validToken = "token-de-outro-lugar";
    const result = await coral.applyDmaEligibility("id-123", "CONSIDERAR_DMA");
    assert.equal(result.status, "SUCCEEDED");
    assert.equal(gate.logins, 1);
    assert.equal(gate.executed, 1);
  });

  it("406 do gate vira mensagem de permissão e não é incerto", async () => {
    gate.putStatus = 406;
    await assert.rejects(
      coral.applyDmaEligibility("id-123", "CONSIDERAR_DMA"),
      (error: Error & { uncertain?: boolean }) => /BULK_UPDATE_DMA_ELIGIBILITY/.test(error.message) && error.uncertain === false,
    );
    assert.equal(gate.executed, 0);
  });

  it("401 mesmo após renovar: falha sem repetir de novo e sem marcar como incerto", async () => {
    gate.rejectAll = true;
    await assert.rejects(
      coral.applyDmaEligibility("id-123", "CONSIDERAR_DMA"),
      (error: Error & { uncertain?: boolean }) => /recusou a autenticação/.test(error.message) && error.uncertain === false,
    );
    assert.equal(gate.logins, 1);
    assert.equal(gate.executed, 0);
  });

  it("falha de rede no PUT continua incerta, sem nova tentativa automática", async () => {
    gate.networkErrorOnPut = true;
    await assert.rejects(
      coral.applyDmaEligibility("id-123", "CONSIDERAR_DMA"),
      (error: Error & { uncertain?: boolean }) => error.uncertain === true,
    );
  });

  it("consulta recusada por permissão (406) não vira 'contrato não encontrado'", async () => {
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      if (new URL(String(input)).pathname === "/api/auth/login") return fakeCoral(input, init);
      return json(406, { message: "Not acceptable" });
    }) as typeof fetch;
    try {
      await assert.rejects(coral.lookupContract("123"), /permissão para consultar contratos/);
    } finally {
      globalThis.fetch = fakeCoral;
    }
  });
});
