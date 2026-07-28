/**
 * Математика просмотренных отрезков (ФТ-B3.1, Фаза 2 Task 6).
 *
 * Зачем вообще отрезки, а не «сколько секунд смотрел»: до этой задачи прогресс считался
 * по времени на открытой вкладке (`use-watch-tracker`), то есть урок засчитывался тому,
 * кто открыл вкладку и ушёл пить чай. Считать надо ПОКРЫТИЕ ролика: какие именно куски
 * реально проиграны. Перемотанное, но не просмотренное, покрытием не становится.
 *
 * Всё здесь — чистые функции: это самая ошибкоопасная часть задачи, и она обязана
 * проверяться тестами без базы и HTTP.
 */

/** Отрезок [from, to] в секундах от начала ролика. */
export type WatchedRange = readonly [number, number];

/** Мусор от клиента: NaN, отрицательные, перевёрнутые и нулевые отрезки. */
function sanitize(range: unknown, durationSeconds?: number): WatchedRange | null {
  if (!Array.isArray(range) || range.length !== 2) return null;
  const [rawFrom, rawTo] = range as [unknown, unknown];
  if (typeof rawFrom !== 'number' || typeof rawTo !== 'number') return null;
  if (!Number.isFinite(rawFrom) || !Number.isFinite(rawTo)) return null;
  let from = Math.max(0, rawFrom);
  let to = Math.max(0, rawTo);
  if (to < from) [from, to] = [to, from];
  if (durationSeconds && durationSeconds > 0) {
    // Клиент может прислать позицию больше длительности (округление, битые метаданные) —
    // обрезаем, иначе покрытие вылезет за 100% и порог сработает раньше времени.
    from = Math.min(from, durationSeconds);
    to = Math.min(to, durationSeconds);
  }
  if (to - from <= 0) return null;
  return [from, to];
}

/**
 * Слияние отрезков в непересекающийся упорядоченный набор.
 * Соседние и пересекающиеся склеиваются: «0–10» и «10–20» — это один кусок 0–20.
 */
export function mergeRanges(ranges: readonly unknown[], durationSeconds?: number): WatchedRange[] {
  const clean = ranges
    .map((range) => sanitize(range, durationSeconds))
    .filter((range): range is WatchedRange => range !== null)
    .sort((a, b) => a[0] - b[0]);

  const merged: Array<[number, number]> = [];
  for (const [from, to] of clean) {
    const last = merged[merged.length - 1];
    if (last && from <= last[1]) {
      last[1] = Math.max(last[1], to);
    } else {
      merged.push([from, to]);
    }
  }
  return merged;
}

/** Суммарная длина просмотренного (секунды), без двойного счёта пересечений. */
export function coveredSeconds(ranges: readonly WatchedRange[]): number {
  return ranges.reduce((sum, [from, to]) => sum + (to - from), 0);
}

/**
 * Доля просмотренного от длительности, 0..1.
 * Длительность неизвестна (видео ещё не обработано) → 0: засчитывать «пройдено» вслепую
 * нельзя, это выдало бы удостоверение за непросмотренный курс.
 */
export function coverageRatio(
  ranges: readonly WatchedRange[],
  durationSeconds: number | undefined
): number {
  if (!durationSeconds || durationSeconds <= 0) return 0;
  return Math.min(1, coveredSeconds(ranges) / durationSeconds);
}

/** Порог зачёта по умолчанию — 90% (ТЗ B3.1). */
export const DEFAULT_COMPLETION_PERCENT = 90;

/** Порог курса в долях единицы; мусор и выход за 1..100 откатываются к умолчанию. */
export function completionThreshold(percent: number | undefined): number {
  if (typeof percent !== 'number' || !Number.isFinite(percent)) {
    return DEFAULT_COMPLETION_PERCENT / 100;
  }
  if (percent < 1 || percent > 100) return DEFAULT_COMPLETION_PERCENT / 100;
  return percent / 100;
}

/**
 * Слияние нового набора отрезков с уже сохранённым.
 * Инвариант: покрытие НЕ УМЕНЬШАЕТСЯ. Запоздавший или повторный heartbeat (обычное дело
 * при плохой связи) не должен откатывать прогресс — тот же принцип, что у `studiedSeconds`
 * в `mvp.service.ts`.
 */
export function accumulateRanges(
  stored: readonly unknown[],
  incoming: readonly unknown[],
  durationSeconds?: number
): WatchedRange[] {
  return mergeRanges([...stored, ...incoming], durationSeconds);
}
