import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  dashboardQuery,
  elapsed,
  formatDuration,
  ADMIN_REJECTION_REASON,
  businessSeconds,
  previousFilters,
  reasonLabel,
  summarizeDecisionTimes,
  summarizeReasons,
  variation,
  NO_VOUCHER,
  NO_VOUCHER_KEY,
  outcomeLabel,
  pageParam,
  parseDashboardFilters,
  partnerName,
  percent,
  periodLabel,
  periodStart,
  rawPartner,
  timelinePoints,
  timelineUnit,
  UNKNOWN_PARTNER,
} from "./dashboard.ts";

describe("periodStart", () => {
  it("começa hoje à meia-noite de Brasília", () => {
    assert.equal(periodStart("hoje", new Date("2026-11-09T02:30:00Z")).toISOString(), "2026-11-08T03:00:00.000Z");
    assert.equal(periodStart("hoje", new Date("2026-11-09T15:00:00Z")).toISOString(), "2026-11-09T03:00:00.000Z");
  });
  it("conta 7 e 30 dias de calendário, incluindo hoje", () => {
    const now = new Date("2026-11-09T15:00:00Z");
    assert.equal(periodStart("7dias", now).toISOString(), "2026-11-03T03:00:00.000Z");
    assert.equal(periodStart("30dias", now).toISOString(), "2026-10-11T03:00:00.000Z");
  });
});

describe("parseDashboardFilters", () => {
  const now = new Date("2026-11-09T15:00:00Z");
  it("usa os últimos 7 dias sem filtros", () => {
    const filters = parseDashboardFilters({}, now);
    assert.equal(filters.period, "7dias");
    assert.equal(filters.from.toISOString(), "2026-11-03T03:00:00.000Z");
    assert.equal(filters.to, null);
  });
  it("datas De/Até cobrem os dias inteiros de Brasília e têm prioridade sobre o atalho", () => {
    const filters = parseDashboardFilters({ periodo: "hoje", de: "2026-11-01", ate: "2026-11-05" }, now);
    assert.equal(filters.period, "personalizado");
    assert.equal(filters.from.toISOString(), "2026-11-01T03:00:00.000Z");
    assert.equal(filters.to?.toISOString(), "2026-11-06T03:00:00.000Z");
    assert.equal(periodLabel(filters), "De 01/11/2026 até 05/11/2026");
  });
  it("inverte datas trocadas e ignora datas inválidas", () => {
    const swapped = parseDashboardFilters({ de: "2026-11-05", ate: "2026-11-01" }, now);
    assert.deepEqual([swapped.de, swapped.ate], ["2026-11-01", "2026-11-05"]);
    assert.equal(parseDashboardFilters({ de: "05/11/2026" }, now).period, "7dias");
  });
  it("aceita só loja, ação e situação conhecidas", () => {
    const filters = parseDashboardFilters(
      { loja: "SAO10", acao: "DESCONSIDERAR_DMA", atendente: "u1", situacao: "REJECTED", parceiro: "Rentalcars" },
      now,
    );
    assert.equal(filters.partner, "Rentalcars");
    assert.deepEqual(
      [filters.store, filters.actionType, filters.requesterId, filters.status],
      ["SAO10", "DESCONSIDERAR_DMA", "u1", "REJECTED"],
    );
    const invalid = parseDashboardFilters({ loja: "XYZ10", acao: "APAGAR", situacao: "QUALQUER" }, now);
    assert.deepEqual([invalid.store, invalid.actionType, invalid.status], [undefined, undefined, undefined]);
  });
});

describe("dashboardQuery", () => {
  it("mantém os filtros e acrescenta a página", () => {
    const filters = parseDashboardFilters({ periodo: "30dias", loja: "FOR10", situacao: "COMPLETED" });
    assert.equal(dashboardQuery(filters, { p: 2 }), "periodo=30dias&loja=FOR10&situacao=COMPLETED&p=2");
  });
  it("no período personalizado leva as datas, não o atalho", () => {
    assert.equal(dashboardQuery(parseDashboardFilters({ de: "2026-11-01" })), "de=2026-11-01");
  });
});

describe("pageParam e outcomeLabel", () => {
  it("lê a página com 1 como padrão", () => {
    assert.equal(pageParam({ p: "3" }, "p"), 3);
    assert.equal(pageParam({ p: "-2" }, "p"), 1);
    assert.equal(pageParam({}, "p"), 1);
  });
  it("descreve o resultado só das aprovadas", () => {
    assert.equal(outcomeLabel("COMPLETED", true), "Aprovada automaticamente");
    assert.equal(outcomeLabel("EXECUTING", false), "Aprovada pelo administrador");
    assert.equal(outcomeLabel("REJECTED", false), "—");
  });
});

describe("parceiros", () => {
  it("segue a mesma ordem da aprovação automática", () => {
    assert.equal(
      rawPartner({ voucherTextAvailable: true, voucherTextOrigin: "Rentcars", voucherOrigin: "Booking" }, "DESCONSIDERAR_DMA"),
      "Rentcars",
    );
    assert.equal(rawPartner({ voucherTextAvailable: false, voucherOrigin: "Booking" }, "DESCONSIDERAR_DMA"), "Booking");
    assert.equal(rawPartner({ voucherOrigin: null, voucherBrands: ["Decolar"] }, "DESCONSIDERAR_DMA"), "Decolar");
    assert.equal(rawPartner(null, "DESCONSIDERAR_DMA"), null);
    assert.equal(rawPartner({ voucherOrigin: "Booking" }, "CONSIDERAR_DMA"), NO_VOUCHER_KEY);
  });
  it("junta variações do mesmo parceiro", () => {
    assert.equal(partnerName("Rentalcars.com"), "Rentalcars");
    assert.equal(partnerName("rentcars"), "Rentcars");
    assert.equal(partnerName("Parceiro Novo"), "Parceiro Novo");
    assert.equal(partnerName(null), UNKNOWN_PARTNER);
    assert.equal(partnerName(NO_VOUCHER_KEY), NO_VOUCHER);
  });
});

describe("gráfico de evolução", () => {
  it("escolhe o agrupamento pelo tamanho do período", () => {
    const from = new Date("2026-11-01T03:00:00Z");
    assert.equal(timelineUnit(from, new Date("2026-11-01T20:00:00Z")), "hour");
    assert.equal(timelineUnit(from, new Date("2026-11-30T03:00:00Z")), "day");
    assert.equal(timelineUnit(from, new Date("2027-02-01T03:00:00Z")), "week");
    assert.equal(timelineUnit(from, new Date("2027-11-01T03:00:00Z")), "month");
  });
  it("preenche os dias sem solicitações com zero, no horário de Brasília", () => {
    const points = timelinePoints(
      new Date("2026-11-07T03:00:00Z"),
      new Date("2026-11-09T15:00:00Z"),
      "day",
      new Map([["2026-11-08T00", 4]]),
    );
    assert.deepEqual(
      points.map((point) => [point.key, point.label, point.value]),
      [
        ["2026-11-07T00", "07/11", 0],
        ["2026-11-08T00", "08/11", 4],
        ["2026-11-09T00", "09/11", 0],
      ],
    );
  });
  it("agrupa semanas a partir da segunda-feira e horas do dia", () => {
    const weeks = timelinePoints(new Date("2026-11-04T03:00:00Z"), new Date("2026-11-17T03:00:00Z"), "week", new Map());
    assert.deepEqual(
      weeks.map((point) => point.label),
      ["Semana de 02/11", "Semana de 09/11", "Semana de 16/11"],
    );
    const hours = timelinePoints(new Date("2026-11-09T03:00:00Z"), new Date("2026-11-09T06:00:00Z"), "hour", new Map());
    assert.deepEqual(
      hours.map((point) => point.label),
      ["00h", "01h", "02h"],
    );
  });
});

describe("formatação", () => {
  it("mostra percentual sem base como traço", () => {
    assert.equal(percent(1, 3), "33%");
    assert.equal(percent(0, 0), "—");
  });
  it("resume durações", () => {
    assert.equal(formatDuration(45 * 60), "45 min");
    assert.equal(formatDuration(2 * 3600 + 15 * 60), "2 h 15 min");
    assert.equal(formatDuration(14 * 3600 + 15 * 60), "14 h");
    assert.equal(formatDuration(52 * 3600), "2 d 4 h");
    assert.equal(formatDuration(null), "—");
  });
  it("resume o tempo decorrido", () => {
    const now = new Date("2026-11-09T15:00:00Z");
    assert.equal(elapsed(new Date("2026-11-09T10:00:00Z"), now), "5 h");
    assert.equal(elapsed(new Date("2026-11-07T15:00:00Z"), now), "2 d");
  });
});

describe("comparação com o período anterior", () => {
  const now = new Date("2026-11-09T15:00:00Z");
  it("compara hoje com ontem nas mesmas horas e 7 dias com os 7 anteriores", () => {
    const today = previousFilters(parseDashboardFilters({ periodo: "hoje" }, now), now)!;
    assert.deepEqual([today.from.toISOString(), today.to?.toISOString()], ["2026-11-08T03:00:00.000Z", "2026-11-08T15:00:00.000Z"]);
    const week = previousFilters(parseDashboardFilters({ periodo: "7dias" }, now), now)!;
    assert.deepEqual([week.from.toISOString(), week.to?.toISOString()], ["2026-10-27T03:00:00.000Z", "2026-11-02T15:00:00.000Z"]);
  });
  it("desloca o intervalo De/Até pela sua duração e não compara sem data inicial", () => {
    const range = previousFilters(parseDashboardFilters({ de: "2026-11-01", ate: "2026-11-05" }, now), now)!;
    assert.deepEqual([range.from.toISOString(), range.to?.toISOString()], ["2026-10-27T03:00:00.000Z", "2026-11-01T03:00:00.000Z"]);
    assert.equal(previousFilters(parseDashboardFilters({ ate: "2026-11-05" }, now), now), null);
  });
  it("descreve a variação", () => {
    assert.equal(variation(56, 50), "▲ 12%");
    assert.equal(variation(45, 50), "▼ 10%");
    assert.equal(variation(50, 50), "sem variação");
    assert.equal(variation(3, 0), "sem base anterior");
    assert.equal(variation(null, 10), null);
  });
});

describe("tempo de decisão em horário comercial", () => {
  it("conta só o expediente de dias úteis", () => {
    // Sexta 17h → segunda 9h (Brasília): 1 h na sexta + 1 h na segunda.
    assert.equal(businessSeconds(new Date("2026-11-06T20:00:00Z"), new Date("2026-11-09T12:00:00Z")), 2 * 3600);
    // Dentro do mesmo dia útil, conta o tempo inteiro.
    assert.equal(businessSeconds(new Date("2026-11-09T13:00:00Z"), new Date("2026-11-09T14:30:00Z")), 5400);
    // Noite inteira fora do expediente.
    assert.equal(businessSeconds(new Date("2026-11-09T22:00:00Z"), new Date("2026-11-10T10:00:00Z")), 0);
  });
  it("resume mediana e média do expediente e mediana corrida, por loja", () => {
    const { total, byStore } = summarizeDecisionTimes([
      { store: "FOR10", queuedAt: new Date("2026-11-09T13:00:00Z"), decidedAt: new Date("2026-11-09T14:00:00Z") },
      { store: "FOR10", queuedAt: new Date("2026-11-06T20:00:00Z"), decidedAt: new Date("2026-11-09T12:00:00Z") },
      { store: "SAO10", queuedAt: new Date("2026-11-09T13:00:00Z"), decidedAt: new Date("2026-11-09T16:00:00Z") },
    ]);
    assert.equal(total.decisions, 3);
    assert.equal(total.medianSeconds, 2 * 3600);
    assert.equal(total.averageSeconds, 2 * 3600);
    assert.equal(total.calendarMedianSeconds, 3 * 3600);
    assert.equal(byStore.get("FOR10")?.medianSeconds, 1.5 * 3600);
  });
});

describe("motivos de recusa", () => {
  it("agrupa o motivo de contrato divergente sem os números", () => {
    assert.equal(
      reasonLabel("O contrato anexado é o FOR1-26, mas o contrato validado no Coral é o FOR2-26. Anexe o contrato correto."),
      "Contrato anexado diferente do validado no Coral",
    );
    assert.equal(reasonLabel("CPF do cliente ausente ou ilegível no voucher."), "CPF do cliente ausente ou ilegível no voucher");
  });
  it("soma as ocorrências e ordena lojas e motivos pelo volume", () => {
    const summary = summarizeReasons([
      { reason: "CPF do cliente ausente ou ilegível no voucher.", store: "FOR10", total: 2 },
      { reason: "O contrato anexado é o A, mas o contrato validado no Coral é o B. Anexe o contrato correto.", store: "SAO10", total: 1 },
      { reason: "O contrato anexado é o C, mas o contrato validado no Coral é o D. Anexe o contrato correto.", store: "SAO10", total: 4 },
      { reason: ADMIN_REJECTION_REASON, store: "FOR10", total: 1 },
    ]);
    assert.deepEqual(
      summary.map((item) => [item.reason, item.total, item.stores.map((store) => `${store.store}:${store.total}`).join(",")]),
      [
        ["Contrato anexado diferente do validado no Coral", 5, "SAO10:5"],
        ["CPF do cliente ausente ou ilegível no voucher", 2, "FOR10:2"],
        ["Recusada pelo administrador (ver justificativa na solicitação)", 1, "FOR10:1"],
      ],
    );
  });
});
