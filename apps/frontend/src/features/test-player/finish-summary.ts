import { isAnswered } from './exam-mode';
import { plural } from '../../lib/format/plural';

import type { AnswerDraftMap, AttemptQuestion } from './types';

/** Формы для «из N вопрос…»: родительный падеж после числа. */
const QUESTION_FORMS: [string, string, string] = ['вопроса', 'вопросов', 'вопросов'];

/**
 * Сводка перед завершением теста (ТЗ «Стабилизация, UX и развитие», 6.4 / С4).
 *
 * **Как было.** Пролистать все вопросы, не ответив ни на один, и нажать «Завершить тест» было
 * можно. С задачи 5.3 диалог хотя бы называл ЧИСЛО неотвеченных («Без ответа: 2 из 3»), но не
 * говорил, КАКИЕ именно, и не давал к ним вернуться: человек знал, что что-то пропустил, и
 * искал это перебором. Про «попытка последняя» не говорилось вовсе — а именно это превращает
 * ошибку в непоправимую (журнал 498, 499).
 *
 * **Правило.** Перед завершением — экран-сводка: сколько отвечено, какие вопросы без ответа
 * (с переходом к каждому), и прямо сказано, если попытка последняя. Только после него —
 * подтверждение и само завершение.
 *
 * Правила живут чистыми функциями: во фронте нет React Testing Library (`RISK-002`), поэтому
 * проверяются ЗНАЧЕНИЯ, а не текст разметки.
 */

/** Номера вопросов без ответа — те же, что человек видит на карте вопросов. */
export const unansweredNumbers = (
  questions: readonly AttemptQuestion[],
  drafts: AnswerDraftMap
): number[] =>
  questions
    .map((question, index) => ({ number: index + 1, answered: isAnswered(drafts[question.id]) }))
    .filter((item) => !item.answered)
    .map((item) => item.number);

export interface FinishSummary {
  answered: number;
  total: number;
  /** Номера вопросов без ответа, по порядку попытки. */
  unanswered: number[];
  /** Попытка последняя: следующей не будет. */
  lastAttempt: boolean;
  /** «Вы ответили на 1 из 3 вопросов» — формулировка из ТЗ. */
  headline: string;
  /** Предупреждение о последней попытке; пустая строка, если попытки ещё есть. */
  lastAttemptWarning: string;
}

/**
 * Что показать человеку перед завершением.
 *
 * `attemptLimit` — это НАСТРОЙКА теста, а не число в коде: сколько попыток разрешено, решает
 * методист. Считаем «последняя» только когда предел известен и достигнут; неизвестный предел
 * не повод пугать.
 */
export const finishSummary = (input: {
  questions: readonly AttemptQuestion[];
  drafts: AnswerDraftMap;
  attemptsUsed?: number;
  attemptLimit?: number;
}): FinishSummary => {
  const total = input.questions.length;
  const unanswered = unansweredNumbers(input.questions, input.drafts);
  const answered = total - unanswered.length;
  const lastAttempt =
    typeof input.attemptsUsed === 'number' &&
    typeof input.attemptLimit === 'number' &&
    input.attemptLimit > 0 &&
    input.attemptsUsed >= input.attemptLimit;

  return {
    answered,
    total,
    unanswered,
    lastAttempt,
    /* Склонение — общим помощником проекта: «из 1 вопроса», «из 3 вопросов». */
    headline: `Вы ответили на ${answered} из ${total} ${plural(total, QUESTION_FORMS)}`,
    lastAttemptWarning: lastAttempt
      ? 'Это последняя попытка: после завершения пересдать тест не получится.'
      : ''
  };
};
