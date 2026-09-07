/**
 * Экран «Эксплуатация» (ФТ-I2, Фаза 6 Task 8).
 *
 * Тут собрано то, из-за чего центр звонит разработчику: не выпустилось удостоверение,
 * не ушло письмо, задача застряла. Раньше всё это было видно только в базе и логах.
 */

export type QuarantineStatus = 'quarantined' | 'republished' | 'discarded';

export interface QuarantinedJob {
  id: string;
  messageId: string | null;
  jobType: string | null;
  queueName: string;
  routingKey: string | null;
  retryCount: number;
  lastError: string | null;
  status: QuarantineStatus;
  quarantinedAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  /**
   * Имя разобравшего — подставляет сервер (§5.431).
   *
   * Пусто, если разбирал никто (сообщение ещё в карантине) либо учётную запись удалили:
   * экран говорит об этом прямо, а не подставляет «система» и не показывает сырой
   * идентификатор (правило продукта №2).
   */
  resolvedByName: string | null;
  republishCount: number;
  /** Неразбираемое сообщение переотправить нельзя — только отбросить. */
  replayable: boolean;
}

export interface QuarantinePage {
  items: QuarantinedJob[];
  total: number;
}

export interface DocumentTaskSummary {
  id: string;
  status: string;
  documentType?: string;
  errorMessage?: string;
  requestedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  reviveCount?: number;
}

export interface DocumentTasksPage {
  items: DocumentTaskSummary[];
  total?: number;
}

export interface EmailDelivery {
  id: string;
  templateKey: string;
  recipientEmail: string;
  subject: string;
  status: string;
  error?: string;
  /** Есть ли сохранённое тело: без него дословный повтор невозможен. */
  body?: string;
  resentFromId?: string;
  createdAt: string;
}

export interface EmailDeliveriesPage {
  items: EmailDelivery[];
  total: number;
}

export type OperationsTab = 'tasks' | 'quarantine' | 'emails';
