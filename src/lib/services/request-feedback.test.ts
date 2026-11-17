import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { submissionFeedback } from "./request-feedback.ts";

describe("submissionFeedback", () => {
  it("mantém a mensagem padrão quando não há motivos", () => {
    assert.match(submissionFeedback("created", "REJECTED"), /encontrou divergências e recusou/);
    assert.match(submissionFeedback("created", "PENDING_REVIEW"), /aguardando aprovação do administrador/);
  });
  it("na recusa automática, traz o que divergiu", () => {
    const text = submissionFeedback("corrected", "REJECTED", ["CPF do cliente ausente ou ilegível no voucher. No contrato consta: “123”."]);
    assert.equal(
      text,
      "Correção enviada. A análise automática recusou a solicitação. CPF do cliente ausente ou ilegível no voucher. No contrato consta: “123”. Corrija os documentos e reabra.",
    );
  });
  it("mostra até 3 motivos e conta os demais", () => {
    const text = submissionFeedback("created", "REJECTED", ["A.", "B.", "C.", "D.", "E."]);
    assert.match(text, /A\. B\. C\. E mais 2 motivos\./);
    assert.doesNotMatch(text, /D\./);
    assert.match(submissionFeedback("created", "REJECTED", ["A.", "B.", "C.", "D."]), /E mais 1 motivo\./);
  });
  it("ignora os motivos quando o status não é de recusa", () => {
    assert.match(submissionFeedback("retried", "PENDING_REVIEW", ["A."]), /aguardando aprovação/);
  });
});
