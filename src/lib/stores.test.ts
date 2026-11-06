import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { contractAccessError, contractStores, storeLabel } from "./stores.ts";

describe("contractStores", () => {
  it("usa as 3 primeiras letras do contrato", () => {
    assert.deepEqual(contractStores("FOR024159-26"), ["FOR10"]);
  });
  it("leva os contratos de São Paulo à loja do aeroporto", () => {
    assert.deepEqual(contractStores("GRU012345-26"), ["SAO10"]);
    assert.deepEqual(contractStores("cgh012345-26"), ["SAO11"]);
  });
  it("não reconhece prefixo desconhecido", () => {
    assert.deepEqual(contractStores("XYZ012345-26"), []);
  });
});

describe("storeLabel", () => {
  it("mostra o aeroporto nas lojas de São Paulo", () => {
    assert.equal(storeLabel("SAO10"), "SAO10 - GRU");
    assert.equal(storeLabel("SAO11"), "SAO11 - CGH");
    assert.equal(storeLabel("FOR10"), "FOR10");
  });
});

describe("contractAccessError", () => {
  it("libera contrato GRU para quem tem SAO10 e bloqueia para quem só tem SAO11", () => {
    assert.equal(contractAccessError(["SAO10"], "GRU012345-26"), null);
    assert.match(contractAccessError(["SAO11"], "GRU012345-26") ?? "", /é da loja SAO10 - GRU/);
  });
});
