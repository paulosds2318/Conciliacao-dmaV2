import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BATCH_SESSION_KEY,
  RELOAD_INTERRUPTED_MESSAGE,
  batchHeadline,
  batchRows,
  interruptedBatch,
  loadBatchState,
  newBatchState,
  saveBatchState,
} from "./batch-session.ts";

const items = [1, 2, 3, 4].map((n) => ({
  id: `r${n}`,
  label: `TST00${n}-26`,
  actionType: n === 3 ? "CONSIDERAR_DMA" : "DESCONSIDERAR_DMA",
}));

describe("estado do lote entre a fila e a página", () => {
  it("começa pendente, com todas aguardando", () => {
    const state = newBatchState(items);
    assert.equal(state.phase, "pending");
    assert.deepEqual(Object.values(state.steps), Array(4).fill({ state: "waiting" }));
  });
  it("recarregar no meio: a que rodava fica incerta, as que aguardavam ficam sem processar e as feitas ficam como estão", () => {
    const state = {
      ...newBatchState(items),
      phase: "running" as const,
      startedAt: 1,
      steps: {
        r1: { state: "approved" as const },
        r2: { state: "running" as const },
        r3: { state: "waiting" as const },
        r4: { state: "failed" as const, message: "x", uncertain: false },
      },
    };
    const result = interruptedBatch(state, 99);
    assert.equal(result.phase, "done");
    assert.equal(result.finishedAt, 99);
    assert.equal(result.stoppedBy, "reload");
    assert.deepEqual(result.steps.r1, { state: "approved" });
    assert.deepEqual(result.steps.r2, { state: "failed", message: RELOAD_INTERRUPTED_MESSAGE, uncertain: true });
    assert.deepEqual(result.steps.r3, { state: "skipped" });
    assert.equal(result.steps.r4.state, "failed");
  });
  it("grava e lê o estado; sem armazenamento ou com lixo, devolve null", () => {
    const saved = new Map<string, string>();
    const storage = {
      setItem: (key: string, value: string) => void saved.set(key, value),
      removeItem: (key: string) => void saved.delete(key),
      getItem: (key: string) => saved.get(key) ?? null,
    };
    const state = newBatchState(items);
    saveBatchState(state, storage);
    assert.deepEqual(loadBatchState(storage), state);
    saveBatchState(null, storage);
    assert.equal(loadBatchState(storage), null);
    saved.set(BATCH_SESSION_KEY, "{lixo");
    assert.equal(loadBatchState(storage), null);
    saved.set(BATCH_SESSION_KEY, JSON.stringify({ items: [], steps: {}, phase: "done" }));
    assert.equal(loadBatchState(storage), null);
    assert.equal(loadBatchState(undefined), null);
  });
});

describe("linhas e título do lote", () => {
  it("cada situação tem texto e cor próprios", () => {
    const state = {
      ...newBatchState(items),
      steps: {
        r1: { state: "approved" as const },
        r2: { state: "failed" as const, message: "O Coral recusou.", uncertain: false },
        r3: { state: "failed" as const, message: "Sem resposta.", uncertain: true },
        r4: { state: "skipped" as const },
      },
    };
    const rows = batchRows(state);
    assert.deepEqual(
      rows.map((row) => [row.status, row.tone]),
      [
        ["Concluída", "ok"],
        ["Falhou", "bad"],
        ["Resultado não confirmado", "warn"],
        ["Não processada", ""],
      ],
    );
    assert.match(rows[2].detail, /Não reenvie: confira o contrato no Coral\./);
    assert.equal(rows[1].detail, "O Coral recusou.");
  });
  it("o título depende de o lote ter terminado e de ter ocorrências", () => {
    const state = newBatchState(items);
    assert.equal(batchHeadline(state, { failed: 0, skipped: 0 }), "Aprovação em lote em andamento");
    const done = { ...state, phase: "done" as const };
    assert.equal(batchHeadline(done, { failed: 0, skipped: 0 }), "Aprovação em lote concluída com sucesso");
    assert.equal(batchHeadline(done, { failed: 1, skipped: 0 }), "Aprovação em lote concluída com ocorrências");
    assert.equal(batchHeadline({ ...done, stoppedBy: "user" }, { failed: 0, skipped: 0 }), "Aprovação em lote concluída com ocorrências");
  });
});
