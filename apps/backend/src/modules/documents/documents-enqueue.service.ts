import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';

import { backendEnv } from '../../env.js';
import { RabbitMqService } from '../../infrastructure/messaging/rabbitmq.service.js';
import { BackgroundTasksService } from '../background-tasks/background-tasks.service.js';

/**
 * Публикация job'а генерации документа в RabbitMQ (Фаза 1 Task 2, ФТ-A1.1) —
 * по образцу MvpBulkEnqueueService. Envelope несёт tenantId (инвариант Фазы 0)
 * и МИНИМАЛЬНЫЙ payload {taskId}: всё остальное worker забирает через
 * internal-эндпоинты, чтобы очередь не возила устаревающие данные.
 *
 * Best-effort: если RabbitMQ недоступен, задача остаётся `queued` (создание задачи
 * уже сохранено состоянием), а HTTP-запрос/событие выдачи не падает — лог + false.
 */
@Injectable()
export class DocumentsEnqueueService {
  private readonly logger = new Logger(DocumentsEnqueueService.name);

  constructor(
    @Inject(RabbitMqService) private readonly rabbitMq: RabbitMqService,
    /*
     * ТЗ 12.2 (срез 2): выдача документов — такая же долгая операция, как массовое зачисление,
     * и человек обязан видеть её в том же разделе. Своя таблица задач документов остаётся
     * деталью реализации: она про повторы и застревания, а реестр — про «что стало с тем,
     * что я отправил» (журнал 520).
     */
    @Optional()
    @Inject(BackgroundTasksService)
    private readonly tasks?: BackgroundTasksService
  ) {}

  async publishGenerationJob(
    tenantId: string,
    taskId: string,
    options?: { requestId?: string; correlationId?: string }
  ): Promise<boolean> {
    const envelope = {
      messageId: randomUUID(),
      tenantId,
      jobType: 'document' as const,
      payload: { taskId }
    };
    try {
      await this.rabbitMq.publish(
        backendEnv.JOB_EXCHANGE,
        backendEnv.JOB_ROUTING_DOCUMENT,
        envelope,
        options
      );
      /*
       * Запись в общем реестре — ПОСЛЕ успешной публикации, как и у массового зачисления:
       * задача, которой нет в очереди, не должна показываться человеку ожидающей.
       */
      await this.tasks?.start({
        tenantId,
        kind: 'document_issue',
        title: 'Выдача документа',
        messageId: envelope.messageId,
        ...(options?.requestId ? {} : {})
      });
      return true;
    } catch (error) {
      this.logger.warn(
        `Failed to enqueue document generation task ${taskId}: ${
          error instanceof Error ? error.message : String(error)
        } — task stays queued`
      );
      return false;
    }
  }

  /** Публикует все задачи в статусе queued (после сохранения состояния!). */
  async publishQueuedTasks(
    tenantId: string,
    tasks: Array<{ id: string; status: string }>,
    options?: { requestId?: string; correlationId?: string }
  ): Promise<void> {
    for (const task of tasks) {
      if (task.status === 'queued') {
        await this.publishGenerationJob(tenantId, task.id, options);
      }
    }
  }
}
