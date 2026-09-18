import { REMINDER_DEFAULTS } from './reminder-settings.js';
import { addDays } from '../../../common/utils/date-math.util.js';

/*
 * Пороги напоминаний ПЕРЕЕХАЛИ в `reminder-settings.ts` (ТЗ 11.3): теперь это настройка центра
 * с умолчаниями решения Р11, а не константы. Здесь оставлены псевдонимы для тех мест, где нужно
 * именно умолчание, — чтобы источник значения остался ОДИН и они не разошлись снова.
 *
 * Заодно исправлено расхождение с Р11: у сроков обучения стояло 14/7/1, а решение владельца
 * называет 14/3/1. Три дня и семь — разные вещи: за три дня человек ещё успевает дочитать курс,
 * за семь он про письмо забывает (журнал 513).
 */
export const RECERT_MILESTONES = REMINDER_DEFAULTS.recertification;
export const LICENSE_EXPIRY_MILESTONES = REMINDER_DEFAULTS.licenseExpiry;
export const COURSE_DEADLINE_MILESTONES = REMINDER_DEFAULTS.courseDeadline;

/**
 * Return the smallest threshold `t` (from `thresholdsAsc`) such that `target` falls on or
 * before `asOf + t` days; `null` when `target` is beyond the largest threshold. Both dates
 * are normalized to their `YYYY-MM-DD` part, so an ISO timestamp `target` compares correctly.
 */
export function pickMilestone(
  asOf: string,
  target: string,
  thresholdsAsc: readonly number[]
): number | null {
  const asOfDate = asOf.slice(0, 10);
  const targetDate = target.slice(0, 10);
  for (const t of thresholdsAsc) {
    if (targetDate <= addDays(asOfDate, t)) {
      return t;
    }
  }
  return null;
}
