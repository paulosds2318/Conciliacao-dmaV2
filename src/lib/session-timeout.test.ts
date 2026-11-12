import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  IDLE_TIMEOUT_MS,
  IDLE_WARNING_MS,
  KEEPALIVE_INTERVAL_MS,
  SESSION_EXPIRES_IN_SECONDS,
  SESSION_UPDATE_AGE_SECONDS,
  idleState,
  safeRedirect,
} from "./session-timeout.ts";

describe("idleState", () => {
  const start = 1_000_000;
  it("fica ativa até faltar um minuto", () => {
    assert.deepEqual(idleState(start, start), { kind: "active" });
    assert.deepEqual(idleState(start + IDLE_TIMEOUT_MS - IDLE_WARNING_MS - 1, start), { kind: "active" });
  });
  it("avisa no último minuto, com o tempo restante", () => {
    assert.deepEqual(idleState(start + IDLE_TIMEOUT_MS - IDLE_WARNING_MS, start), { kind: "warning", remainingMs: IDLE_WARNING_MS });
    assert.deepEqual(idleState(start + IDLE_TIMEOUT_MS - 5000, start), { kind: "warning", remainingMs: 5000 });
  });
  it("encerra após 30 minutos sem uso", () => {
    assert.deepEqual(idleState(start + IDLE_TIMEOUT_MS, start), { kind: "expired" });
    assert.deepEqual(idleState(start + 3 * IDLE_TIMEOUT_MS, start), { kind: "expired" });
  });
  it("trata uso registrado no futuro (relógio de outra aba) como ativo", () => {
    assert.deepEqual(idleState(start, start + 5000), { kind: "active" });
  });
});

describe("prazos da sessão", () => {
  it("a sessão do servidor dura mais que a inatividade somada aos intervalos de renovação", () => {
    // Pior caso: a última regravação aconteceu até (renovação + regravação) antes do último uso.
    const worstGapMs = KEEPALIVE_INTERVAL_MS + SESSION_UPDATE_AGE_SECONDS * 1000;
    assert.ok(SESSION_EXPIRES_IN_SECONDS * 1000 > IDLE_TIMEOUT_MS + worstGapMs);
  });
  it("renova antes de o servidor aceitar a regravação seguinte", () => {
    assert.ok(KEEPALIVE_INTERVAL_MS < SESSION_UPDATE_AGE_SECONDS * 1000);
  });
});

describe("safeRedirect", () => {
  it("aceita caminhos internos", () => {
    assert.equal(safeRedirect("/painel?periodo=hoje"), "/painel?periodo=hoje");
    assert.equal(safeRedirect("/solicitacoes/abc"), "/solicitacoes/abc");
  });
  it("recusa outros sites e valores vazios", () => {
    for (const value of ["https://exemplo.com", "//exemplo.com", "/\\exemplo.com", "javascript:alert(1)", "", null, undefined])
      assert.equal(safeRedirect(value), "/", String(value));
  });
});
