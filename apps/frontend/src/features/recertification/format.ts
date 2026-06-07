/** YYYY-MM-DD → integer day index in UTC (для безопасной арифметики дат без TZ-сдвигов). */
function toUtcDayIndex(iso: string): number {
  const parts = iso.split('-');
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const d = Number(parts[2]);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

/**
 * Сколько осталось до `validUntil` относительно `today` (обе строки — YYYY-MM-DD).
 * «дн.» — единая безопасная аббревиатура для любого числа дней (день/дня/дней).
 */
export function formatRemaining(validUntil: string, today: string): string {
  const target = toUtcDayIndex(validUntil);
  const base = toUtcDayIndex(today);
  if (!Number.isFinite(target) || !Number.isFinite(base)) return '—';
  const days = Math.round(target - base);
  if (days > 0) return `через ${days} дн.`;
  if (days === 0) return 'сегодня';
  return `просрочено ${Math.abs(days)} дн.`;
}

/** Маска СНИЛС для отображения; «—» при отсутствии, без изменений при нестандартной длине. */
export function formatSnils(snils: string | undefined): string {
  if (!snils) return '—';
  const digits = snils.replace(/\D/g, '');
  if (digits.length !== 11) return snils;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 9)} ${digits.slice(9, 11)}`;
}
