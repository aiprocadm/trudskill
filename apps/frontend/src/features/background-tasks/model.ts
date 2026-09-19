/**
 * Раздел «Фоновые задачи» (ТЗ «Стабилизация, UX и развитие», 12.2).
 *
 * **Зачем раздел.** Массовое зачисление уходит в очередь и возвращает человеку номер сообщения.
 * Где смотреть, что с ним стало, не сказано нигде: экран «Эксплуатация» показывает ЗАСТРЯВШИЕ
 * сообщения, а не «моя задача выполняется / готово» (журнал 518).
 *
 * **Название.** «Фоновые задачи», а не «джобы» — правило ТЗ 4.2: технических слов на экранах нет.
 */

export type BackgroundTaskStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface BackgroundTask {
  id: string;
  kind: string;
  title: string;
  status: BackgroundTaskStatus;
  doneCount: number;
  totalCount: number;
  errorText?: string;
  resultHref?: string;
  createdAt: string;
  finishedAt?: string;
}

/**
 * Что сказать человеку про состояние задачи.
 *
 * Подписи приходят с сервера вместе с данными — там же, где ими пользуются письмо и уведомление.
 * Здесь только запасной вариант на случай, если словарь не дошёл: пустое место на экране хуже,
 * чем слово «Выполняется».
 */
export const FALLBACK_STATUS_LABEL: Record<BackgroundTaskStatus, string> = {
  queued: 'В очереди',
  running: 'Выполняется',
  succeeded: 'Готово',
  failed: 'Не выполнена'
};

/** Задача закончилась — значит её больше не нужно ждать. */
export const isFinished = (status: BackgroundTaskStatus): boolean =>
  status === 'succeeded' || status === 'failed';

/**
 * Что показать в колонке «Сделано».
 *
 * «0 из 0» — не прогресс, а недоразумение: объём бывает заранее неизвестен, и тогда честнее
 * промолчать. Прочерк, а не ноль: ноль читается как «ничего не сделано».
 */
export const progressText = (task: Pick<BackgroundTask, 'doneCount' | 'totalCount'>): string =>
  task.totalCount > 0 ? `${task.doneCount} из ${task.totalCount}` : '—';

/**
 * Подсказка, которую человек должен прочитать один раз и успокоиться.
 *
 * Прямая цитата смысла ТЗ: «Задача выполняется, можно продолжать работу» — вкладку держать
 * открытой не нужно.
 */
export const KEEP_WORKING_HINT =
  'Задача выполняется в фоне — можно закрыть страницу и продолжать работу. Итог появится здесь.';
