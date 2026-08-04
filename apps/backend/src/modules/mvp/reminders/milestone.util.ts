import { addDays } from '../../../common/utils/date-math.util.js';

/**
 * Окна напоминаний о переобучении (дней до окончания срока), по возрастанию.
 *
 * ФТ-E4 (Фаза 4 Task 9): приведено к ТЗ — 60/30/7. Раньше стояло 90/30/7: расхождение
 * тянулось с Фазы 5B. Девяносто дней — это «ещё квартал впереди», такое письмо слушатель
 * забывает; шестьдесят попадают в горизонт планирования учебного центра.
 */
export const RECERT_MILESTONES = [7, 30, 60] as const;

/**
 * Окна напоминаний об окончании ЛИЦЕНЗИИ учебного центра (дней), по возрастанию.
 *
 * Намеренно ОТДЕЛЬНАЯ константа, а не общая с переобучением: у этих напоминаний разная
 * цена ошибки. Просроченное удостоверение слушателя — повод записаться на курс; отозванная
 * лицензия центра останавливает выдачу документов вообще, а её продление занимает месяцы.
 * Поэтому при переводе переобучения на 60/30/7 (ФТ-E4) лицензия сохранила 90/30/7 — сузить
 * ей окно значило бы молча ухудшить предупреждение о самом дорогом сбое.
 */
export const LICENSE_EXPIRY_MILESTONES = [7, 30, 90] as const;

/** Course-deadline reminder thresholds (days before planned completion), ascending. */
export const COURSE_DEADLINE_MILESTONES = [1, 7, 14] as const;

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
