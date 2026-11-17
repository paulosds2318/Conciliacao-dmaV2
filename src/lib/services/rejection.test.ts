import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ADMIN_REJECTION_PREFIX, describeDivergences, rejectionReasons } from "./rejection.ts";

describe("describeDivergences", () => {
  it("mostra o valor lido em cada documento nos campos que divergem", () => {
    assert.deepEqual(
      describeDivergences([
        { name: "CPF do cliente", voucherValue: "111.111.111-11", contractValue: "222.222.222-22", match: false },
        { name: "Nome completo do cliente", voucherValue: "Ana Souza", contractValue: "Ana Souza", match: true },
      ]),
      ["CPF do cliente: voucher “111.111.111-11” · contrato “222.222.222-22” (divergente)."],
    );
  });
  it("diz “não encontrado” quando um dos lados não trouxe o dado", () => {
    assert.deepEqual(
      describeDivergences([{ name: "Nome completo do cliente", voucherValue: undefined, contractValue: "Ana Souza", match: null }]),
      ["Nome completo do cliente: voucher não encontrado · contrato “Ana Souza” (não conclusivo)."],
    );
  });
  it("explica o número do contrato pelo que consta no contrato anexado", () => {
    assert.deepEqual(describeDivergences([{ name: "Número do contrato (Coral: FOR1-26)", contractValue: "FOR9-26", match: false }]), [
      "Número do contrato (Coral: FOR1-26): no contrato anexado consta “FOR9-26”.",
    ]);
    assert.deepEqual(describeDivergences([{ name: "Número do contrato (Coral: FOR1-26)", match: null }]), [
      "Número do contrato (Coral: FOR1-26): no contrato anexado consta nenhum número legível.",
    ]);
  });
  it("ignora o que confere, o que ninguém encontrou e campos extras sem divergência", () => {
    assert.deepEqual(
      describeDivergences([
        { name: "Código da reserva", match: null },
        { name: "Data de retirada", voucherValue: "01/11", contractValue: "02/11", match: null },
        { name: "CPF do cliente", voucherValue: "1", contractValue: "1", match: true },
      ]),
      [],
    );
    assert.deepEqual(describeDivergences([{ name: "Data de retirada", voucherValue: "01/11", contractValue: "02/11", match: false }]), [
      "Data de retirada: voucher “01/11” · contrato “02/11” (divergente).",
    ]);
    assert.deepEqual(describeDivergences(undefined), []);
  });
});

describe("rejectionReasons", () => {
  const events = [
    { event: "AI_AUTO_REJECTED", details: { version: 1, reasons: ["Motivo da versão 1."] } },
    { event: "AI_AUTO_REJECTED", details: { version: 2, reasons: ["CPF ausente.", "  ", 7] } },
  ];
  it("usa os motivos da validação automática da versão atual", () => {
    assert.deepEqual(rejectionReasons({ version: 2, auditEvents: events, decisions: [] }), ["CPF ausente."]);
    assert.deepEqual(rejectionReasons({ version: 1, auditEvents: events, decisions: [] }), ["Motivo da versão 1."]);
  });
  it("acrescenta a justificativa da recusa do administrador na mesma versão", () => {
    const decisions = [
      { decision: "APPROVE", justification: null, requestVersion: 2 },
      { decision: "REJECT", justification: " Voucher de outra reserva ", requestVersion: 2 },
      { decision: "REJECT", justification: "Antiga", requestVersion: 1 },
    ];
    assert.deepEqual(rejectionReasons({ version: 2, auditEvents: [], decisions }), [`${ADMIN_REJECTION_PREFIX}Voucher de outra reserva`]);
  });
  it("devolve lista vazia quando não há motivo registrado", () => {
    assert.deepEqual(rejectionReasons({ version: 3, auditEvents: events, decisions: [] }), []);
    assert.deepEqual(rejectionReasons({ version: 1, auditEvents: [{ event: "AI_AUTO_REJECTED", details: null }], decisions: [] }), []);
  });
});
