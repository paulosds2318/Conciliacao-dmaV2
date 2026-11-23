import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractAwardable, extractDmaCurrentStatus } from "./coral.ts";

/** Recortes (sem dados pessoais) das respostas reais do Coral de homologação para os dois contratos consultados. */
const DESCONSIDERADO = { id: "x", status: "FINISHED", dma: true, regardDma: false, isExempt: false, awardable: "no" };
const SEM_ACAO = { id: "y", status: "FINISHED", dma: false, regardDma: false, isExempt: true, awardable: "yes" };

describe("situação de DMA pelos campos reais do Coral (dma e regardDma)", () => {
  it("dma verdadeiro e regardDma falso: desconsiderado", () => {
    assert.deepEqual(extractDmaCurrentStatus(DESCONSIDERADO), { status: "DESCONSIDERAR", sourceField: "dma" });
  });
  it("os dois falsos: sem ação de DMA (neutro), e não mais “situação não identificada”", () => {
    assert.deepEqual(extractDmaCurrentStatus(SEM_ACAO), { status: "NEUTRO", sourceField: "dma/regardDma" });
  });
  it("regardDma verdadeiro: considerado (Considerar DMA marcado no contrato)", () => {
    assert.deepEqual(extractDmaCurrentStatus({ ...SEM_ACAO, regardDma: true }), { status: "CONSIDERAR", sourceField: "regardDma" });
  });
  it("regardDma vence dma: com os dois verdadeiros, o contrato conta no DMA", () => {
    assert.deepEqual(extractDmaCurrentStatus({ ...SEM_ACAO, dma: true, regardDma: true }), {
      status: "CONSIDERAR",
      sourceField: "regardDma",
    });
  });
  it("só um dos campos vindo da API: usa o que vier", () => {
    assert.equal(extractDmaCurrentStatus({ dma: true }).status, "DESCONSIDERAR");
    assert.equal(extractDmaCurrentStatus({ regardDma: true }).status, "CONSIDERAR");
    assert.equal(extractDmaCurrentStatus({ dma: false }).status, "UNKNOWN");
  });
  it("sem nenhum dos campos: não identifica", () => {
    assert.deepEqual(extractDmaCurrentStatus({ id: "z", status: "OPEN" }), { status: "UNKNOWN", sourceField: null });
    assert.deepEqual(extractDmaCurrentStatus(null), { status: "UNKNOWN", sourceField: null });
  });
  it("campos que não são booleanos (texto) não valem", () => {
    assert.deepEqual(extractDmaCurrentStatus({ dma: "true", regardDma: "false" }), { status: "UNKNOWN", sourceField: null });
  });
  it("os nomes antigos continuam valendo e têm prioridade", () => {
    assert.equal(extractDmaCurrentStatus({ statusDma: "DESCONSIDERAR", dma: false, regardDma: false }).status, "DESCONSIDERAR");
    assert.equal(extractDmaCurrentStatus({ considerar_dma: true }).status, "CONSIDERAR");
  });
});

describe("premiável pelo awardable do acordo comercial (cdpData)", () => {
  it("lê o awardable de cdpData e ignora o da raiz e o dos opcionais (caso real REC001097-26: raiz no, cdpData yes)", () => {
    assert.equal(extractAwardable({ awardable: "no", cdpData: { awardable: "yes" }, optionals: [{ awardable: "no" }] }), true);
    assert.equal(extractAwardable({ awardable: "yes", cdpData: { awardable: "no" }, optionals: [{ awardable: "yes" }] }), false);
  });
  it("aceita variações e devolve nulo quando não vem ou não se entende", () => {
    assert.equal(extractAwardable({ cdpData: { awardable: " YES " } }), true);
    assert.equal(extractAwardable({ cdpData: { awardable: "sim" } }), true);
    assert.equal(extractAwardable({ cdpData: { awardable: false } }), false);
    assert.equal(extractAwardable({ awardable: "yes" }), null);
    assert.equal(extractAwardable({ cdpData: {} }), null);
    assert.equal(extractAwardable({ cdpData: { awardable: "talvez" } }), null);
    assert.equal(extractAwardable(null), null);
  });
});
