/**
 * Единый язык долгих операций (ТЗ «Стабилизация, UX и развитие», 12.2).
 *
 * **Как было.** Импорт, выгрузка, госвыгрузка и массовая выдача документов — всё это долгие
 * операции, и каждая вела себя по-своему: у документов своя таблица задач, у зачислений кэш
 * идемпотентности, у госвыгрузок свой статус. Человек, отправивший задачу в очередь, получал
 * номер сообщения и не знал, куда смотреть (журнал 518).
 *
 * **Правило ТЗ 4.2:** слово «джоб» на экран не попадает ни в каком виде. Раздел называется
 * «Фоновые задачи», состояния — человеческими словами.
 */

/** Состояния, одинаковые для всех долгих операций. */
export type BackgroundTaskStatus = 'queued' | 'running' | 'succeeded' | 'failed';

/** Вид операции в терминах продукта, а не очереди. */
export type BackgroundTaskKind = 'bulk_enrollment' | 'document_issue' | 'gov_export';

export interface BackgroundTask {
  id: string;
  tenantId: string;
  kind: BackgroundTaskKind;
  /** Название для человека: «Массовое зачисление в группу „Электробезопасность"». */
  title: string;
  status: BackgroundTaskStatus;
  doneCount: number;
  /** Ноль означает «объём заранее неизвестен», а не «нечего делать». */
  totalCount: number;
  /** Причина отказа человеческими словами; технический код сюда не пишется. */
  errorText?: string;
  /** Куда идти за результатом, если он есть. */
  resultHref?: string;
  createdBy?: string;
  /** Ключ сообщения очереди — связь с воркером и карантином. */
  messageId?: string;
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
}

/**
 * Подписи состояний для человека.
 *
 * Живут в одном месте и на бэкенде, потому что их обязаны одинаково понимать и экран, и письмо,
 * и уведомление в колокольчике. Второй словарь на фронте однажды разошёлся бы с этим.
 */
export const BACKGROUND_TASK_STATUS_LABEL: Record<BackgroundTaskStatus, string> = {
  queued: 'В очереди',
  running: 'Выполняется',
  succeeded: 'Готово',
  failed: 'Не выполнена'
};

/** Названия видов операций — тоже человеческие. */
export const BACKGROUND_TASK_KIND_LABEL: Record<BackgroundTaskKind, string> = {
  bulk_enrollment: 'Массовое зачисление',
  document_issue: 'Выдача документов',
  gov_export: 'Выгрузка в госреестр'
};

/**
 * Завершена ли задача. Одно правило на всех: экран не должен решать это сам, сравнивая строки.
 */
export const isFinished = (status: BackgroundTaskStatus): boolean =>
  status === 'succeeded' || status === 'failed';

/**
 * Что показать человеку вместо прогресса.
 *
 * «0 из 0» — не прогресс, а недоразумение: объём бывает заранее неизвестен, и в этом случае
 * честнее промолчать, чем показывать ноль.
 */
export const progressText = (task: Pick<BackgroundTask, 'doneCount' | 'totalCount'>): string =>
  task.totalCount > 0 ? `${task.doneCount} из ${task.totalCount}` : '';
