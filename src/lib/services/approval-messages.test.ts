import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  APPROVE_DIALOG_TEXT,
  approvalFlashMessage,
  coralRefusedMessage,
  coralUncertainMessage,
  forceApproveDialogText,
} from "./approval-messages.ts";

describe("textos das aprovações", () => {
  it("o aviso da fila diz contrato, ação e se foi forçada", () => {
    assert.equal(
      approvalFlashMessage("CNF011109-26", "DESCONSIDERAR_DMA", false),
      "Solicitação CNF011109-26 (Desconsiderar DMA) aprovada e concluída no Coral.",
    );
    assert.equal(
      approvalFlashMessage("CNF011109-26", "CONSIDERAR_DMA", true),
      "Solicitação CNF011109-26 (Considerar DMA) aprovada por aprovação forçada e concluída no Coral.",
    );
    assert.equal(approvalFlashMessage("X1", "OUTRA", false), "Solicitação X1 aprovada e concluída no Coral.");
  });
  it("os diálogos avisam que a pessoa volta para a tela de aprovações", () => {
    assert.match(APPROVE_DIALOG_TEXT, /volta para a tela de aprovações/);
    const forced = forceApproveDialogText(["Motivo A.", "Motivo B."]);
    assert.match(forced, /^Motivo da recusa: Motivo A\. Motivo B\. Ao aprovar/);
    assert.match(forced, /mesmo com a recusa\. Ao concluir, você volta para a tela de aprovações\.$/);
    assert.doesNotMatch(forceApproveDialogText([]), /Motivo da recusa/);
  });
  it("quando o Coral recusa, orienta o próximo passo e mantém o detalhe do Coral", () => {
    const text = coralRefusedMessage(false, "Contrato já está desconsiderado.");
    assert.match(text, /^Solicitação aprovada, mas o Coral recusou a ação\. Contrato já está desconsiderado\. Não há nova tentativa/);
    assert.match(text, /Ação manual por planilha/);
    assert.match(coralRefusedMessage(true), /^Aprovação forçada registrada, mas o Coral recusou a ação\. Não há nova tentativa/);
  });
  it("quando o Coral não confirma, manda conferir e registrar no quadro da própria tela", () => {
    const text = coralUncertainMessage(false);
    assert.match(text, /^Solicitação aprovada, mas o Coral não confirmou o resultado\. Não aprove de novo/);
    assert.match(text, /Resultado não confirmado pelo Coral/);
    assert.match(
      coralUncertainMessage(true, "Tempo esgotado."),
      /^Aprovação forçada registrada, mas o Coral não confirmou o resultado\. Tempo esgotado\. /,
    );
  });
});
