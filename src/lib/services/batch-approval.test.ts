import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_CONSECUTIVE_CORAL_FAILURES,
  batchConfirmation,
  batchCounts,
  durationLabel,
  batchSummary,
  hasDivergence,
  interpretDecisionResponse,
  runBatchApproval,
  type ApproveResult,
} from "./batch-approval.ts";

const items = (count: number) => Array.from({ length: count }, (_, index) => ({ id: `r${index + 1}`, label: `FOR00${index + 1}-26` }));
const ok: ApproveResult = { ok: true };
const coralFailure: ApproveResult = { ok: false, message: "O Coral recusou.", coral: true, uncertain: false };
const run = async (list: ReturnType<typeof items>, results: Record<string, ApproveResult | Error>) => {
  const called: string[] = [];
  const progress: Array<[number, string | null]> = [];
  const outcome = await runBatchApproval(
    list,
    async (id) => {
      called.push(id);
      const result = results[id] ?? ok;
      if (result instanceof Error) throw result;
      return result;
    },
    { shouldStop: () => false, onProgress: (done, current) => progress.push([done, current?.id ?? null]) },
  );
  return { outcome, called, progress };
};
const ids = (list: Array<{ id: string }>) => list.map((item) => item.id);

describe("runBatchApproval", () => {
  it("aprova todas, uma de cada vez e em ordem", async () => {
    const { outcome, called, progress } = await run(items(3), {});
    assert.deepEqual(called, ["r1", "r2", "r3"]);
    assert.deepEqual(ids(outcome.approved), ["r1", "r2", "r3"]);
    assert.equal(outcome.stoppedBy, null);
    assert.deepEqual(progress, [
      [0, "r1"],
      [1, "r2"],
      [2, "r3"],
      [3, null],
    ]);
  });
  it("registra a falha de uma e segue com as demais quando não é do Coral", async () => {
    const { outcome } = await run(items(3), { r2: { ok: false, message: "Já recebeu decisão.", coral: false, uncertain: false } });
    assert.deepEqual(ids(outcome.approved), ["r1", "r3"]);
    assert.deepEqual(outcome.failed, [{ id: "r2", label: "FOR002-26", message: "Já recebeu decisão.", uncertain: false }]);
    assert.equal(outcome.stoppedBy, null);
  });
  it("para depois de falhas seguidas do Coral e não toca nas demais", async () => {
    const { outcome, called } = await run(items(5), { r2: coralFailure, r3: coralFailure });
    assert.equal(MAX_CONSECUTIVE_CORAL_FAILURES, 2);
    assert.deepEqual(called, ["r1", "r2", "r3"]);
    assert.equal(outcome.stoppedBy, "coral");
    assert.deepEqual(ids(outcome.notProcessed), ["r4", "r5"]);
  });
  it("uma aprovação entre duas falhas do Coral zera a contagem", async () => {
    const { outcome, called } = await run(items(4), { r1: coralFailure, r3: coralFailure });
    assert.deepEqual(called, ["r1", "r2", "r3", "r4"]);
    assert.equal(outcome.stoppedBy, null);
    assert.equal(outcome.failed.length, 2);
  });
  it("para quando o administrador pede, sem interromper a que já foi enviada", async () => {
    let stop = false;
    const called: string[] = [];
    const outcome = await runBatchApproval(
      items(4),
      async (id) => {
        called.push(id);
        if (id === "r2") stop = true;
        return ok;
      },
      { shouldStop: () => stop, onProgress: () => undefined },
    );
    assert.deepEqual(called, ["r1", "r2"]);
    assert.equal(outcome.stoppedBy, "user");
    assert.deepEqual(ids(outcome.notProcessed), ["r3", "r4"]);
  });
  it("trata erro de rede como resultado não confirmado", async () => {
    const { outcome } = await run(items(2), { r1: new Error("fetch failed") });
    assert.equal(outcome.failed[0].uncertain, true);
    assert.match(outcome.failed[0].message, /conferir/);
    assert.equal(outcome.approved.length, 1);
  });
});

describe("interpretDecisionResponse", () => {
  it("200 é aprovada", () => {
    assert.deepEqual(interpretDecisionResponse(200, { status: "COMPLETED" }), ok);
  });
  it("502 com status do Coral é falha do Coral, e a incerta é marcada", () => {
    assert.deepEqual(interpretDecisionResponse(502, { status: "EXECUTION_FAILED", error: "HTTP 500" }), {
      ok: false,
      message: "HTTP 500",
      coral: true,
      uncertain: false,
    });
    assert.equal((interpretDecisionResponse(502, { status: "EXECUTION_UNCERTAIN" }) as { uncertain: boolean }).uncertain, true);
  });
  it("409 e outros códigos são recusas da própria rota, não do Coral", () => {
    assert.deepEqual(interpretDecisionResponse(409, { error: "A solicitação já recebeu uma decisão." }), {
      ok: false,
      message: "A solicitação já recebeu uma decisão.",
      coral: false,
      uncertain: false,
    });
    assert.equal((interpretDecisionResponse(500, null) as { coral: boolean }).coral, false);
  });
});

describe("batchConfirmation", () => {
  const row = (actionType: string, matches?: boolean | null) => ({ actionType, analyses: [{ comparison: { matches } }] });
  it("no plural, descreve o lote por ação e avisa da regra de interrupção", () => {
    const text = batchConfirmation([row("DESCONSIDERAR_DMA", true), row("DESCONSIDERAR_DMA", true), row("CONSIDERAR_DMA", true)]);
    assert.equal(text.title, "Aprovar 3 solicitações?");
    assert.equal(text.confirmLabel, "Aprovar 3");
    assert.equal(text.danger, false);
    assert.match(text.description, /^Serão aprovadas 3 solicitações \(2 Desconsiderar DMA e 1 Considerar DMA\)\./);
    assert.match(text.description, /Se o Coral falhar duas vezes seguidas, o lote é interrompido\./);
    assert.doesNotMatch(text.description, /Atenção/);
  });
  it("com uma só, usa o singular e não fala de lote", () => {
    const text = batchConfirmation([row("DESCONSIDERAR_DMA", true)]);
    assert.equal(text.title, "Aprovar 1 solicitação?");
    assert.match(text.description, /^Será aprovada 1 solicitação \(1 Desconsiderar DMA\)\./);
    assert.doesNotMatch(text.description, /lote/);
  });
  it("avisa das divergências com a concordância certa e destaca o botão", () => {
    assert.match(batchConfirmation([row("DESCONSIDERAR_DMA", false)]).description, /Atenção: ela tem divergência/);
    assert.match(
      batchConfirmation([row("DESCONSIDERAR_DMA", false), row("DESCONSIDERAR_DMA", true)]).description,
      /Atenção: 1 delas tem divergência/,
    );
    const many = batchConfirmation([row("DESCONSIDERAR_DMA", false), row("DESCONSIDERAR_DMA", false), row("DESCONSIDERAR_DMA", true)]);
    assert.match(many.description, /Atenção: 2 delas têm divergência/);
    assert.equal(many.danger, true);
  });
});

describe("resumo do lote", () => {
  const row = (actionType: string, matches?: boolean | null) => ({ actionType, analyses: [{ comparison: { matches } }] });
  it("conta por ação e as com divergência apontada pela IA", () => {
    const rows = [
      row("CONSIDERAR_DMA", true),
      row("DESCONSIDERAR_DMA", false),
      row("DESCONSIDERAR_DMA", null),
      { actionType: "DESCONSIDERAR_DMA" },
    ];
    assert.deepEqual(batchSummary(rows), { total: 4, considerar: 1, desconsiderar: 3, withDivergence: 1 });
    assert.equal(hasDivergence(rows[1]), true);
    assert.equal(hasDivergence(rows[3]), false);
  });
});

describe("acompanhamento do lote", () => {
  it("avisa a situação de cada solicitação: em andamento, aprovada, com problema e não processada", async () => {
    const events: string[] = [];
    const list = [1, 2, 3, 4].map((n) => ({ id: `r${n}`, label: `C${n}` }));
    const result = async (id: string): Promise<ApproveResult> =>
      id === "r2" ? { ok: false, message: "Coral recusou", coral: false, uncertain: false } : { ok: true };
    let stop = false;
    await runBatchApproval(list, result, {
      shouldStop: () => stop,
      onProgress: (done) => {
        if (done === 2) stop = true;
      },
      onItem: (item, step) => events.push(`${item.id}:${step.state}`),
    });
    assert.deepEqual(events, ["r1:running", "r1:approved", "r2:running", "r2:failed", "r3:running", "r3:approved", "r4:skipped"]);
  });
  it("conta e mede o tempo do lote", () => {
    const counts = batchCounts([
      { state: "approved" },
      { state: "failed", message: "x", uncertain: false, coral: false },
      { state: "running" },
      { state: "waiting" },
      { state: "skipped" },
    ]);
    assert.deepEqual(counts, { total: 5, approved: 1, failed: 1, running: 1, waiting: 1, skipped: 1, finished: 3 });
    assert.equal(durationLabel(45_000), "45 s");
    assert.equal(durationLabel(130_000), "2 min 10 s");
    assert.equal(durationLabel(-5), "0 s");
  });
});
