/**
 * История задач госвыгрузки: что, когда, чем кончилось (ТЗ «Стабилизация, UX и развитие», 12.3).
 *
 * **Как было.** Экран показывал три колонки: реестр, что выгружали, статус. Ни времени, ни
 * причины отказа — хотя сервер отдаёт и `requestedAt`, и `finishedAt`, и ответ реестра: описание
 * данных на экране их просто не перечисляло (журнал 523). Кнопки «Повторить» не было, хотя ручка
 * `POST /exports/tasks/:id/retry` существует и работает (524).
 *
 * **Почему это важно.** Выгрузка в госреестр — то, чем центр отчитывается при проверке. «Статус:
 * не выполнена» без причины и без возможности повторить означает звонок разработчику.
 */

export interface ExportTaskView {
  id: string;
  providerCode: string;
  exportType: string;
  status: string;
  requestedAt?: string;
  finishedAt?: string;
  /** Ответ реестра, как его вернул сервер: причина отказа живёт здесь. */
  responsePayload?: Record<string, unknown>;
}

/** Состояния, из которых задачу имеет смысл повторять. */
const RETRYABLE = new Set(['failed', 'rejected', 'error', 'cancelled']);

/**
 * Можно ли повторить задачу.
 *
 * Успешную повторять нельзя: в реестр уйдёт второй такой же пакет. Идущую — тоже: она ещё
 * выполняется, и повтор создаст гонку.
 */
export const canRetry = (task: Pick<ExportTaskView, 'status'>): boolean =>
  RETRYABLE.has(task.status);

/**
 * Причина отказа человеческими словами.
 *
 * Ответ реестра приходит машинным: поля `message`, `error`, `detail` — в разных ведомствах
 * по-разному. Берём первое пригодное; если ничего нет, честно говорим, что причину не сообщили,
 * а не показываем пустоту (правило продукта №4: ошибка говорит, что произошло).
 */
export const failureReason = (task: ExportTaskView): string => {
  if (!RETRYABLE.has(task.status)) return '';
  const payload = task.responsePayload ?? {};
  for (const key of ['message', 'error', 'detail', 'reason']) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return 'Реестр не сообщил причину. Повторите выгрузку; если отказ повторится — обратитесь в поддержку.';
};

/**
 * Когда задача закончилась — или когда поставлена, если ещё идёт.
 *
 * Пустая ячейка вместо времени читается как «данных нет», хотя время постановки известно всегда.
 */
export const whenText = (task: ExportTaskView): string => task.finishedAt ?? task.requestedAt ?? '';
