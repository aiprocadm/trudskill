/** Parse an ISO date or timestamp to UTC y/m/d parts (time ignored). */
function parts(iso: string): { y: number; m: number; d: number } {
  const date = new Date(iso);
  return { y: date.getUTCFullYear(), m: date.getUTCMonth(), d: date.getUTCDate() };
}

function toIsoDate(y: number, m: number, d: number): string {
  const date = new Date(Date.UTC(y, m, d));
  return date.toISOString().slice(0, 10);
}

/** Last calendar day of a (year, monthIndex). */
function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}

/**
 * Add `months` to an ISO date, clamping the day to the target month's last day
 * (so 2026-01-31 + 1 month = 2026-02-28). Returns `YYYY-MM-DD`.
 */
export function addMonths(iso: string, months: number): string {
  const { y, m, d } = parts(iso);
  const targetMonthAbs = m + months;
  const targetY = y + Math.floor(targetMonthAbs / 12);
  const targetM = ((targetMonthAbs % 12) + 12) % 12;
  const day = Math.min(d, lastDayOfMonth(targetY, targetM));
  return toIsoDate(targetY, targetM, day);
}

/** Add `days` to an ISO date. Returns `YYYY-MM-DD`. */
export function addDays(iso: string, days: number): string {
  const { y, m, d } = parts(iso);
  return toIsoDate(y, m, d + days);
}
