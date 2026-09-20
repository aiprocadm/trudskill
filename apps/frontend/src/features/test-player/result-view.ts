/**
 * Итог проверки знаний для экрана слушателя (ТЗ «Стабилизация, UX и развитие», 10.4).
 *
 * **Что было.** Экран показывал «Тест пройден / не пройден» и число набранных баллов. Ни
 * процента, ни проходного порога, ни времени прохождения, ни — главное — ответа на вопрос
 * «что дальше». Для регулируемого обучения последнее важнее всего: слушатель после неуда не
 * понимает, потерял ли он обучение целиком, и звонит в центр (журнал 595).
 *
 * **Тексты приходят с сервера, а не собираются здесь.** Срок повторной проверки — это
 * требование Порядка № 2464, и считать его в браузере значило бы иметь два расчёта одного
 * срока: один для экрана, другой для центра. Разъедутся они молча.
 */

export type ExamOutcome = 'passed' | 'retake_required' | 'can_try_again' | 'awaiting_review';

export interface ExamResultView {
  outcome: ExamOutcome;
  headline: string;
  nextStep: string;
  purposeLabel: string;
  scorePercent: number;
  passingPercent: number;
  scoreLine: string;
  durationText?: string;
  topicsToRevise: string[];
  showsAnswers: boolean;
  retakeDueAt?: string;
  retakeDueText?: string;
  retakeDaysLeft?: number;
  attemptsUsed: number;
  attemptsLeft: number | null;
}

/**
 * Каким цветом окрашена плашка исхода.
 *
 * **«Требуется повторная проверка» — это ВНИМАНИЕ, а не ошибка.** Красный означает «что-то
 * сломалось»; здесь ничего не сломалось — человеку назначена повторная проверка, и это
 * предусмотренный Порядком ход событий. Красная плашка читается как приговор, а по Р9 неуд
 * приговором не является.
 */
export const outcomeTone = (outcome: ExamOutcome): 'success' | 'warning' | 'info' => {
  if (outcome === 'passed') return 'success';
  if (outcome === 'awaiting_review') return 'info';
  return 'warning';
};

/** Подпись к строке с процентом: показывает и порог, чтобы человеку было с чем сравнить. */
export const scoreSummary = (view: ExamResultView): string =>
  `${view.scorePercent}% из ${view.passingPercent}% нужных (${view.scoreLine} баллов)`;

/**
 * Насколько срочно.
 *
 * Отдельная функция, потому что на экране это решает цвет и порядок слов, а в списке центра —
 * порядок строк. Правило должно быть одно.
 */
export const dueUrgency = (daysLeft: number | undefined): 'overdue' | 'soon' | 'calm' | null => {
  if (daysLeft === undefined) return null;
  if (daysLeft < 0) return 'overdue';
  if (daysLeft <= 7) return 'soon';
  return 'calm';
};

/** Текст ссылки на обращение в центр (ТЗ 10.4, пункт 5). */
export const CONTACT_CENTER_LABEL = 'Написать в учебный центр';

/**
 * Куда ведёт эта ссылка.
 *
 * В форму обращения о проблеме — ту же, что заведена задачей 15.5. Заводить второй канал
 * ради экзамена значило бы, что половина обращений приходит туда, куда центр не смотрит.
 */
export const CONTACT_CENTER_HREF = '/support/problem';
