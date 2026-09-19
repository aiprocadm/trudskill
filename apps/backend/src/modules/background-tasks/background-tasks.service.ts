import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Optional } from '@nestjs/common';

import { DatabaseService } from '../../infrastructure/database/database.service.js';
import { NotificationsService } from '../communication/notifications.service.js';

import type {
  BackgroundTask,
  BackgroundTaskKind,
  BackgroundTaskStatus
} from './background-task.types.js';

/**
 * Реестр долгих операций (ТЗ 12.2).
 *
 * **Одно хранилище на все виды операций.** Смысл задачи 12.2 не в том, чтобы завести ещё одну
 * таблицу, а в том, чтобы у импорта, выгрузки, госвыгрузки и массовой выдачи документов был
 * ОДИН способ сказать человеку «поставлено / выполняется / готово / не вышло». Своё
 * представление о состоянии у каждой операции и было причиной, по которой раздела «Фоновые
 * задачи» не могло появиться.
 *
 * **База необязательна.** Как и у остальных служб этого проекта, без подключения к базе служба
 * работает в памяти: внутренние прогоны и режим `ALLOW_IN_MEMORY_STATE` не должны требовать
 * Postgres.
 */

export interface StartTaskInput {
  tenantId: string;
  kind: BackgroundTaskKind;
  title: string;
  createdBy?: string;
  messageId?: string;
  totalCount?: number;
}

@Injectable()
export class BackgroundTasksService {
  /** Память используется, когда базы нет. Ключ — арендатор, чтобы изоляция была видна глазом. */
  private readonly memory = new Map<string, BackgroundTask[]>();

  constructor(
    @Optional() @Inject(DatabaseService) private readonly database?: DatabaseService,
    /* ТЗ 12.2: уведомление при завершении — колокольчик, наполненный в 11.1. */
    @Optional()
    @Inject(NotificationsService)
    private readonly notifications?: NotificationsService
  ) {}

  /** Поставить задачу в очередь: человек сразу видит её в разделе «Фоновые задачи». */
  async start(input: StartTaskInput): Promise<BackgroundTask> {
    const now = new Date().toISOString();
    const task: BackgroundTask = {
      id: `bgt_${randomUUID()}`,
      tenantId: input.tenantId,
      kind: input.kind,
      title: input.title,
      status: 'queued',
      doneCount: 0,
      totalCount: input.totalCount ?? 0,
      ...(input.createdBy ? { createdBy: input.createdBy } : {}),
      ...(input.messageId ? { messageId: input.messageId } : {}),
      createdAt: now,
      updatedAt: now
    };

    if (this.database) {
      await this.database.query(
        `insert into core.background_tasks
           (id, tenant_id, kind, title, status, done_count, total_count, created_by, message_id, created_at, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::timestamptz,$10::timestamptz)`,
        [
          task.id,
          task.tenantId,
          task.kind,
          task.title,
          task.status,
          task.doneCount,
          task.totalCount,
          task.createdBy ?? null,
          task.messageId ?? null,
          now
        ]
      );
      return task;
    }

    const list = this.memory.get(task.tenantId) ?? [];
    list.unshift(task);
    this.memory.set(task.tenantId, list);
    return task;
  }

  /**
   * Чем кончилось. Отказ обязан нести причину словами: «не выполнена» без объяснения — это
   * тупик, из которого человек идёт звонить в учебный центр.
   */
  async finish(
    tenantId: string,
    id: string,
    outcome: {
      status: Extract<BackgroundTaskStatus, 'succeeded' | 'failed'>;
      doneCount?: number;
      errorText?: string;
      resultHref?: string;
    }
  ): Promise<void> {
    const now = new Date().toISOString();
    if (this.database) {
      await this.database.query(
        `update core.background_tasks
            set status = $3,
                done_count = coalesce($4, done_count),
                error_text = $5,
                result_href = $6,
                updated_at = $7::timestamptz,
                finished_at = $7::timestamptz
          where tenant_id = $1 and id = $2`,
        [
          tenantId,
          id,
          outcome.status,
          outcome.doneCount ?? null,
          outcome.errorText ?? null,
          outcome.resultHref ?? null,
          now
        ]
      );
      return;
    }

    const task = (this.memory.get(tenantId) ?? []).find((item) => item.id === id);
    if (!task) return;
    task.status = outcome.status;
    if (outcome.doneCount !== undefined) task.doneCount = outcome.doneCount;
    if (outcome.errorText !== undefined) task.errorText = outcome.errorText;
    if (outcome.resultHref !== undefined) task.resultHref = outcome.resultHref;
    task.updatedAt = now;
    task.finishedAt = now;
  }

  /**
   * Закрыть задачу по ключу сообщения очереди (ТЗ 12.2, срез 2).
   *
   * Воркер знает ключ сообщения, а не наш внутренний номер задачи, — поэтому закрытие ищет
   * запись именно по нему. Если записи нет (задача поставлена до появления реестра), молчим:
   * отсутствие записи не повод ронять обработку сообщения.
   */
  async finishByMessage(
    tenantId: string,
    messageId: string,
    outcome: {
      status: Extract<BackgroundTaskStatus, 'succeeded' | 'failed'>;
      doneCount?: number;
      errorText?: string;
      resultHref?: string;
    }
  ): Promise<void> {
    const found = (await this.list(tenantId, 200)).find((task) => task.messageId === messageId);
    if (!found) return;
    await this.finish(tenantId, found.id, outcome);
    await this.announce(tenantId, found.title, outcome);
  }

  /**
   * Сказать человеку, что задача закончилась.
   *
   * Колокольчик наполнен в 11.1, и ТЗ 12.2 прямо требует «уведомление при завершении»: иначе
   * человек, которому сказали «можно закрыть страницу», узнает об итоге, только вернувшись.
   * Отказ уведомления не роняет закрытие задачи: сама задача уже закрыта, и повторять нечего.
   */
  private async announce(
    tenantId: string,
    title: string,
    outcome: { status: BackgroundTaskStatus; errorText?: string }
  ): Promise<void> {
    if (!this.notifications) return;
    try {
      await this.notifications.create({
        tenantId,
        channelCode: 'in_app',
        subjectText:
          outcome.status === 'succeeded' ? `Готово: ${title}` : `Не выполнена задача: ${title}`,
        bodyText: outcome.errorText ?? 'Подробности — в разделе «Фоновые задачи».',
        relatedEntityType: 'background_task'
      });
    } catch {
      /* Второстепенный канал: задача уже закрыта, повторять её нельзя. */
    }
  }

  /** Задачи центра, свежие сверху. */
  async list(tenantId: string, limit = 50): Promise<BackgroundTask[]> {
    if (this.database) {
      /* `query` отдаёт строки массивом — обёртки `{ rows }` здесь нет. */
      const rows = await this.database.query<Record<string, unknown>>(
        `select id, tenant_id, kind, title, status, done_count, total_count, error_text,
                result_href, created_by, message_id, created_at, updated_at, finished_at
           from core.background_tasks
          where tenant_id = $1
          order by created_at desc
          limit $2`,
        [tenantId, limit]
      );
      return rows.map((row: Record<string, unknown>) => this.fromRow(row));
    }
    return (this.memory.get(tenantId) ?? []).slice(0, limit);
  }

  private fromRow(row: Record<string, unknown>): BackgroundTask {
    const text = (value: unknown): string | undefined =>
      typeof value === 'string' && value.length > 0 ? value : undefined;
    return {
      id: String(row.id),
      tenantId: String(row.tenant_id),
      kind: String(row.kind) as BackgroundTaskKind,
      title: String(row.title),
      status: String(row.status) as BackgroundTaskStatus,
      doneCount: Number(row.done_count ?? 0),
      totalCount: Number(row.total_count ?? 0),
      ...(text(row.error_text) ? { errorText: String(row.error_text) } : {}),
      ...(text(row.result_href) ? { resultHref: String(row.result_href) } : {}),
      ...(text(row.created_by) ? { createdBy: String(row.created_by) } : {}),
      ...(text(row.message_id) ? { messageId: String(row.message_id) } : {}),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      ...(text(row.finished_at) ? { finishedAt: String(row.finished_at) } : {})
    };
  }
}
