import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { alertLine } from "./alert-log.ts";

describe("linha de alerta", () => {
  it("tem marcador fixo, código e id da solicitação, nada mais", () => {
    assert.equal(alertLine("EXECUCAO_FALHOU", "abc123"), "[ALERTA] EXECUCAO_FALHOU solicitacao=abc123");
    assert.match(alertLine("PROCESSO_INTERROMPIDO", "x"), /^\[ALERTA\] [A-Z_]+ solicitacao=\S+$/);
  });
});
