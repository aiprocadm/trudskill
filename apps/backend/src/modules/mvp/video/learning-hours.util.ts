/**
 * Расчёт журнала учебных часов (ФТ-B3.4, Фаза 2 Task 8).
 *
 * Зачем: это доказательная база на проверке ГИТ/Минтруда. Инспектор спрашивает не
 * «стоит ли галочка “пройдено”», а «докажите, что 40-часовая программа реально освоена».
 * Значит, нужно сопоставить фактически затраченное время с плановыми часами программы
 * (`program.academic_hours`, миграция `0030`).
 *
 * Расчёт вынесен в чистые функции: это арифметика, и она обязана проверяться без базы.
 */

export interface LearningHoursInput {
  /** Время в материалах (`material_progress.studied_seconds`), секунды. */
  materialSeconds: number;
  /** Время в видео по РЕАЛЬНОМУ покрытию (`learning.video_progress`), секунды. */
  videoSeconds: number;
  /** Время в тестовых попытках, секунды. */
  testSeconds: number;
  /** ФТ-F4 (Фаза 5 Task 9): время посещённых вебинаров группы, секунды. */
  webinarSeconds?: number;
  /** Плановые часы программы; не заданы — сравнивать не с чем. */
  plannedAcademicHours?: number;
}

export interface LearningHoursRow {
  factSeconds: number;
  factHours: number;
  plannedHours?: number;
  /** `true`, если факт меньше плана — именно это и есть вопрос инспектора. */
  belowPlan: boolean;
  /** Доля выполнения плана в процентах; без плана — `undefined`. */
  completionPercent?: number;
}

/**
 * Академический час — 45 минут (норма ДПО), а не 60. Считать «часы» по 60 минут
 * значило бы занижать выполнение программы примерно на четверть и врать инспектору
 * в невыгодную для центра сторону.
 */
export const ACADEMIC_HOUR_MINUTES = 45;
const ACADEMIC_HOUR_SECONDS = ACADEMIC_HOUR_MINUTES * 60;

/** Секунды в академические часы с одним знаком после запятой. */
export function toAcademicHours(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.round((seconds / ACADEMIC_HOUR_SECONDS) * 10) / 10;
}

/**
 * Итог по одному слушателю.
 *
 * Видео-время НЕ складывается с временем материалов: видео-урок — это тоже материал,
 * и его секунды уже лежат в `material_progress`. Берём максимум из двух источников —
 * покрытие видео точнее (Task 6), но для не-видео материалов существует только
 * `material_progress`. Вебинары (ФТ-F4) — отдельная активность вне материалов,
 * их секунды складываются.
 */
export function calculateLearningHours(input: LearningHoursInput): LearningHoursRow {
  const safe = (value: number): number => (Number.isFinite(value) && value > 0 ? value : 0);
  const factSeconds = Math.round(
    Math.max(safe(input.materialSeconds), safe(input.videoSeconds)) +
      safe(input.testSeconds) +
      safe(input.webinarSeconds ?? 0)
  );
  const factHours = toAcademicHours(factSeconds);
  const plannedHours =
    typeof input.plannedAcademicHours === 'number' && input.plannedAcademicHours > 0
      ? input.plannedAcademicHours
      : undefined;

  return {
    factSeconds,
    factHours,
    ...(plannedHours !== undefined ? { plannedHours } : {}),
    belowPlan: plannedHours !== undefined && factHours < plannedHours,
    ...(plannedHours !== undefined
      ? { completionPercent: Math.round((factHours / plannedHours) * 100) }
      : {})
  };
}

/** Длительность попытки теста; незавершённая попытка времени не даёт. */
export function attemptSeconds(attempt: {
  startedAt?: string;
  finishedAt?: string;
  submittedAt?: string;
}): number {
  const end = attempt.finishedAt ?? attempt.submittedAt;
  if (!attempt.startedAt || !end) return 0;
  const seconds = (Date.parse(end) - Date.parse(attempt.startedAt)) / 1000;
  // Битые даты и «отрицательная» длительность (часы сервера переставили) — ноль,
  // а не мусор в отчёте для инспектора.
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0;
}
