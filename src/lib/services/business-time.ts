type Env = Record<string, string | undefined>;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** Brasília não tem horário de verão desde 2019: o horário local é sempre UTC-3. */
const BRASILIA_OFFSET_MS = 3 * HOUR_MS;

/** Expediente do administrador (horário de Brasília), usado no tempo de decisão. */
export const BUSINESS_HOURS = { start: 8, end: 18, label: "seg a sex, 8h às 18h, sem feriados" };

const pad = (value: number) => String(value).padStart(2, "0");
const isoDay = (date: Date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

/** Domingo de Páscoa do ano (algoritmo de Meeus/Jones/Butcher), como data UTC à meia-noite. */
export function easterSunday(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

const FIXED_HOLIDAYS = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "11-20", "12-25"];
const holidayCache = new Map<number, Set<string>>();

/**
 * Feriados nacionais do ano (AAAA-MM-DD): os fixos e a Sexta-feira Santa.
 * Carnaval e Corpus Christi são ponto facultativo; quando a empresa folgar, entram em FERIADOS_EXTRAS.
 */
export function nationalHolidays(year: number) {
  let holidays = holidayCache.get(year);
  if (!holidays) {
    holidays = new Set([...FIXED_HOLIDAYS.map((day) => `${year}-${day}`), isoDay(new Date(easterSunday(year).getTime() - 2 * DAY_MS))]);
    holidayCache.set(year, holidays);
  }
  return holidays;
}

/** Folgas próprias da empresa em FERIADOS_EXTRAS, separadas por vírgula (ex.: "2027-02-08,2027-02-09"). */
export function extraHolidays(env: Env = process.env) {
  return new Set(
    (env.FERIADOS_EXTRAS ?? "")
      .split(",")
      .map((day) => day.trim())
      .filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day)),
  );
}

/** Segundos de expediente entre duas datas: só dias úteis, fora de feriados e dentro do horário comercial. */
export function businessSeconds(start: Date, end: Date, extra: ReadonlySet<string> = new Set()) {
  const from = start.getTime() - BRASILIA_OFFSET_MS;
  const until = end.getTime() - BRASILIA_OFFSET_MS;
  let total = 0;
  for (let day = Math.floor(from / DAY_MS) * DAY_MS; day < until; day += DAY_MS) {
    const date = new Date(day);
    const weekday = date.getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    const key = isoDay(date);
    if (nationalHolidays(date.getUTCFullYear()).has(key) || extra.has(key)) continue;
    const open = day + BUSINESS_HOURS.start * HOUR_MS;
    const close = day + BUSINESS_HOURS.end * HOUR_MS;
    total += Math.max(0, Math.min(until, close) - Math.max(from, open));
  }
  return total / 1000;
}
