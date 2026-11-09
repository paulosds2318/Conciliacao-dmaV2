import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { businessSeconds, easterSunday, extraHolidays, nationalHolidays } from "./business-time.ts";

describe("feriados nacionais", () => {
  it("calcula a Páscoa e a Sexta-feira Santa", () => {
    assert.equal(easterSunday(2026).toISOString().slice(0, 10), "2026-04-05");
    assert.equal(easterSunday(2027).toISOString().slice(0, 10), "2027-03-28");
    assert.ok(nationalHolidays(2026).has("2026-04-03"));
    assert.ok(nationalHolidays(2027).has("2027-03-26"));
  });
  it("inclui os feriados fixos, como a Consciência Negra", () => {
    const holidays = nationalHolidays(2026);
    for (const day of [
      "2026-01-01",
      "2026-04-21",
      "2026-05-01",
      "2026-09-07",
      "2026-10-12",
      "2026-11-02",
      "2026-11-15",
      "2026-11-20",
      "2026-12-25",
    ])
      assert.ok(holidays.has(day), day);
    assert.equal(holidays.size, 10);
  });
  it("lê as folgas extras e ignora valores inválidos", () => {
    assert.deepEqual([...extraHolidays({ FERIADOS_EXTRAS: "2027-02-08, 2027-02-09,08/02/2027," })], ["2027-02-08", "2027-02-09"]);
    assert.equal(extraHolidays({}).size, 0);
  });
});

describe("tempo de expediente", () => {
  it("conta só o horário comercial de dias úteis", () => {
    // Sexta 17h → segunda 9h (Brasília): 1 h na sexta + 1 h na segunda.
    assert.equal(businessSeconds(new Date("2026-11-06T20:00:00Z"), new Date("2026-11-09T12:00:00Z")), 2 * 3600);
    // Dentro do mesmo dia útil, conta o tempo inteiro.
    assert.equal(businessSeconds(new Date("2026-11-09T13:00:00Z"), new Date("2026-11-09T14:30:00Z")), 5400);
    // Noite inteira fora do expediente.
    assert.equal(businessSeconds(new Date("2026-11-09T22:00:00Z"), new Date("2026-11-10T10:00:00Z")), 0);
  });
  it("não conta feriados nacionais", () => {
    // Quinta 19/11 17h → segunda 23/11 9h: 1 h na quinta, sexta 20/11 é feriado, 1 h na segunda.
    assert.equal(businessSeconds(new Date("2026-11-19T20:00:00Z"), new Date("2026-11-23T12:00:00Z")), 2 * 3600);
    // Sexta-feira Santa inteira.
    assert.equal(businessSeconds(new Date("2026-04-03T11:00:00Z"), new Date("2026-04-03T21:00:00Z")), 0);
  });
  it("não conta as folgas extras da empresa", () => {
    const start = new Date("2026-11-10T11:00:00Z");
    const end = new Date("2026-11-10T21:00:00Z");
    assert.equal(businessSeconds(start, end), 10 * 3600);
    assert.equal(businessSeconds(start, end, new Set(["2026-11-10"])), 0);
  });
  it("devolve zero para intervalo invertido", () => {
    assert.equal(businessSeconds(new Date("2026-11-10T15:00:00Z"), new Date("2026-11-10T12:00:00Z")), 0);
  });
});
