import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SAME_FILE_MESSAGE, sameContent } from "./same-file.ts";

const pdf = (content: string, name: string) => new File([content], name, { type: "application/pdf" });

describe("sameContent", () => {
  it("reconhece o mesmo arquivo, mesmo com nome diferente", async () => {
    assert.equal(
      await sameContent(pdf("%PDF-1.4 contrato FLN019192-26", "voucher.pdf"), pdf("%PDF-1.4 contrato FLN019192-26", "contrato.pdf")),
      true,
    );
  });
  it("não confunde arquivos diferentes, nem os de mesmo tamanho", async () => {
    assert.equal(await sameContent(pdf("%PDF-1.4 voucher", "a.pdf"), pdf("%PDF-1.4 contrato longo", "b.pdf")), false);
    assert.equal(await sameContent(pdf("%PDF-1.4 voucher A", "a.pdf"), pdf("%PDF-1.4 voucher B", "b.pdf")), false);
  });
  it("compara o conteúdo, não o tipo informado", async () => {
    const a = new File(["mesmo conteúdo"], "a.pdf", { type: "application/pdf" });
    const b = new File(["mesmo conteúdo"], "a.png", { type: "image/png" });
    assert.equal(await sameContent(a, b), true);
  });
  it("a mensagem diz o que fazer, inclusive quando os dois vêm no mesmo PDF", () => {
    assert.match(SAME_FILE_MESSAGE, /campo Voucher/);
    assert.match(SAME_FILE_MESSAGE, /campo Contrato/);
    assert.match(SAME_FILE_MESSAGE, /mesmo PDF, separe-os/);
  });
});
