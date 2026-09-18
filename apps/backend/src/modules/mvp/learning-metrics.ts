import type { Enrollment, ExamResult } from './mvp.types.js';

/**
 * Показатели обучения — ОДИН слой вычислений на «Аналитику» и «Отчёты»
 * (решение владельца Р4, ТЗ 5.12.8).
 *
 * Зачем. Завершаемость и сдачу экзаменов считали в двух местах: сводка показателей
 * (`MvpService.getKpiSnapshot`, её показывает «Отчётность») и разбор аналитики
 * (`analytics-dashboard.ts`). Правила совпадали слово в слово — и именно поэтому их разъезд
 * был вопросом времени: тот, кто поправит одно, не узнает о втором, и два экрана начнут
 * называть разные числа про один и тот же центр (журнал 483).
 *
 * Решение Р4 разводит экраны по назначению — «Аналитика» показывает, «Отчёты» выгружают, —
 * но требует, чтобы цифры у них были общие. Общие они ровно настолько, насколько общий этот
 * файл.
 */

/** Доля от целого. Ноль вместо деления на ноль: «нет данных» — это 0 %, а не ошибка. */
export const ratio = (part: number, whole: number): number => (whole === 0 ? 0 : part / whole);

/**
 * Зачтённая сдача экзамена.
 *
 * Предварительный результат (лучшая попытка ещё ждёт проверки эссе) сдачей НЕ считается:
 * `passed` при `needs_review` и так false, проверка статуса — защита от того, что это
 * once изменится молча.
 */
export const isGenuinePass = (result: ExamResult): boolean =>
  result.passed && result.status !== 'needs_review';

/** Доля завершивших обучение среди зачисленных. */
export const completionRate = (enrollments: readonly Enrollment[]): number =>
  ratio(enrollments.filter((one) => one.status === 'completed').length, enrollments.length);

/** Доля сдавших экзамен среди тех, у кого есть результат. */
export const examPassRate = (results: readonly ExamResult[]): number =>
  ratio(results.filter(isGenuinePass).length, results.length);
