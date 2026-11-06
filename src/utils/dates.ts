// Date helpers. All dates are ISO text (YYYY-MM-DD). Local-timezone Date getters
// are never used: arithmetic goes through UTC only.

type Ymd = { y: number; m: number; d: number };

function parse(date: string): Ymd {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d };
}

function toIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function utc(y: number, m: number, d: number): number {
  return Date.UTC(y, m - 1, d);
}

// Calendar months counted inclusive of the first and last month (year*12+month).
// Example: 1996-01 to 2005-11 is 119.
export function monthsInclusive(from: string, to: string): number {
  const a = parse(from);
  const b = parse(to);
  return b.y * 12 + b.m - (a.y * 12 + a.m) + 1;
}

// Full months elapsed from `from` to `to` (a month is complete on the same day number).
export function completedMonths(from: string, to: string): number {
  const a = parse(from);
  const b = parse(to);
  const diff = b.y * 12 + b.m - (a.y * 12 + a.m);
  return b.d < a.d ? diff - 1 : diff;
}

export function addDays(date: string, days: number): string {
  const { y, m, d } = parse(date);
  return toIso(utc(y, m, d) + days * 86_400_000);
}

// Same day and month, `years` later. Without that day (29/02) it falls on the next one, as in
// Codigo Civil, art. 132, par. 3.
export function addYears(date: string, years: number): string {
  const { y, m, d } = parse(date);
  return toIso(utc(y + years, m, d));
}

// Brasilia has been a fixed UTC-3 since 2019, so no local-timezone getter is needed.
const BRASILIA_OFFSET_MS = -3 * 3_600_000;

export function todayInBrazil(): string {
  return toIso(Date.now() + BRASILIA_OFFSET_MS);
}

// Real calendar date in ISO form. addDays normalizes overflow, so 2025-02-30 does not round-trip.
export function isValidDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && addDays(date, 0) === date;
}

// Easter Sunday (Anonymous Gregorian algorithm), returned as ISO date.
function easter(year: number): string {
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
  return toIso(utc(year, month, day));
}

// Fixed national holidays (MM-DD): Confraternizacao Universal, Tiradentes, Dia do Trabalho,
// Independencia, N. Sra. Aparecida, Finados, Proclamacao da Republica, Consciencia Negra
// (national since Lei 14.759/2023), Natal. Carnival is an optional day off, so it is excluded.
const FIXED_HOLIDAYS = new Set([
  "01-01",
  "04-21",
  "05-01",
  "09-07",
  "10-12",
  "11-02",
  "11-15",
  "11-20",
  "12-25",
]);

export function isNationalHoliday(date: string): boolean {
  if (FIXED_HOLIDAYS.has(date.slice(5))) return true;
  const { y } = parse(date);
  // Paixao de Cristo (Good Friday): two days before Easter Sunday.
  return date === addDays(easter(y), -2);
}

function isBusinessDay(date: string): boolean {
  const { y, m, d } = parse(date);
  const dow = new Date(utc(y, m, d)).getUTCDay();
  return dow !== 0 && dow !== 6 && !isNationalHoliday(date);
}

// Last business day (not weekend, not national holiday) of the month after `date`.
export function lastBusinessDayOfNextMonth(date: string): string {
  const { y, m } = parse(date);
  // Day 0 of the month after next is the last day of next month.
  let cur = toIso(Date.UTC(y, m + 1, 0));
  while (!isBusinessDay(cur)) cur = addDays(cur, -1);
  return cur;
}
