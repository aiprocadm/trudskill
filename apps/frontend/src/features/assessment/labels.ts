/**
 * Подписи экрана оценивания (`TXT-006`).
 *
 * На экране значениями стояли коды: статусы фильтра списком как есть, состояния попыток
 * и проверок — `submitted`, `in_review`, `completed`. Плюс результат попытки выводился
 * машинной строкой `score=8/10, passed=да`.
 */

export const CATALOG_STATUS_LABELS: Record<string, string> = {
  draft: 'Черновик',
  active: 'Действующий',
  published: 'Опубликован',
  archived: 'В архиве'
};

/** Что фильтруется на экране: банки и тесты живут в этих трёх состояниях. */
export const CATALOG_STATUS_OPTIONS = ['draft', 'active', 'archived'];

export const ATTEMPT_STATUS_LABELS: Record<string, string> = {
  in_progress: 'Сдаёт',
  submitted: 'Отправлена',
  completed: 'Проверена',
  expired: 'Время вышло',
  cancelled: 'Отменена'
};

export const REVIEW_STATUS_LABELS: Record<string, string> = {
  pending: 'Ждёт проверки',
  submitted: 'Ждёт проверки',
  in_review: 'На проверке',
  completed: 'Проверено',
  returned: 'Возвращено на доработку'
};

export const statusLabel = (dictionary: Record<string, string>, code: string): string =>
  dictionary[code] ?? code;

/** Итог попытки словами: «Зачёт, 8 из 10» вместо `score=8/10, passed=да`. */
export const attemptResultText = (score: number, maxScore: number, passed: boolean): string =>
  `${passed ? 'Зачёт' : 'Не зачтено'}: ${score} из ${maxScore} баллов`;
