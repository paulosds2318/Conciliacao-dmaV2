import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { forceApprovalSchema } from "./request.ts";

const message = (value: unknown) => {
  const parsed = forceApprovalSchema.safeParse(value);
  return parsed.success ? null : parsed.error.issues[0]?.message;
};

describe("forceApprovalSchema", () => {
  it("aceita justificativa com 10 caracteres ou mais, sem espaços nas pontas", () => {
    const parsed = forceApprovalSchema.safeParse({ justification: "  Conferido com a cliente.  " });
    assert.equal(parsed.success && parsed.data.justification, "Conferido com a cliente.");
  });
  it("recusa justificativa curta, vazia ou ausente, sempre em português", () => {
    for (const value of [{ justification: "curta" }, { justification: "   " }, {}, null, undefined, { justification: 42 }])
      assert.match(message(value) ?? "", /Informe a justificativa da aprovação forçada/, JSON.stringify(value));
  });
  it("recusa justificativa acima de 2.000 caracteres", () => {
    assert.match(message({ justification: "a".repeat(2001) }) ?? "", /no máximo 2\.000/);
  });
});
