import { Inject, Injectable, Optional, ServiceUnavailableException } from '@nestjs/common';

import { DatabaseService } from '../../infrastructure/database/database.service.js';

/**
 * ФТ-D7 (Фаза 4 Task 11): здоровье арендаторов — кросс-тенантный экран платформы.
 *
 * **Это единственное место, где чтение НАМЕРЕННО идёт сквозь тенанты**, и потому оно
 * отдаёт ТОЛЬКО агрегаты: счётчики застрявших задач и отметки времени. Ни одного
 * поля с содержимым — ни ФИО, ни номеров документов, ни текстов ошибок. Владелец
 * платформы должен видеть, что у центра встала очередь, но не то, что в этой очереди.
 *
 * Один запрос на весь экран: по каждому источнику — свой агрегат, приклеенный к списку
 * тенантов. Обходить тенантов по одному значило бы N+1 на каждом открытии экрана.
 */

export interface TenantHealthRow {
  tenantId: string;
  code: string;
  name: string;
  status: string;
  /** Задачи выпуска документов, ждущие обработки. */
  documentTasksQueued: number;
  documentTasksFailed: number;
  /** Задания обмена с внешними системами. */
  syncJobsPending: number;
  syncJobsFailed: number;
  /** Необработанные сообщения, ушедшие в «карантин». */
  deadLetters: number;
  /** Выгрузки в госреестры. */
  exportsFailed: number;
  lastExportAt: string | null;
  /** Последняя запись в журнале — признак живого центра. */
  lastActivityAt: string | null;
}

export interface PlatformHealthReport {
  tenants: TenantHealthRow[];
  /** Общая очередь событий платформы: у неё нет привязки к арендатору. */
  platformOutbox: { pending: number; failed: number };
  generatedAt: string;
}

@Injectable()
export class PlatformHealthService {
  constructor(
    @Optional()
    @Inject(DatabaseService)
    private readonly databaseService: DatabaseService | undefined
  ) {}

  private requireDb(): DatabaseService {
    if (!this.databaseService) {
      throw new ServiceUnavailableException({
        code: 'health_store_unavailable',
        message: 'Health store is unavailable'
      });
    }
    return this.databaseService;
  }

  async getReport(): Promise<PlatformHealthReport> {
    const db = this.requireDb();

    // Архивные не показываем: у офбординга свои экраны, а в списке здоровья они
    // навсегда остались бы с нулями и мешали видеть работающие центры.
    const tenants = await db.query<TenantHealthRow>(
      `select
         t.id as "tenantId", t.code, t.name, t.status,
         coalesce(dt.queued, 0)::int   as "documentTasksQueued",
         coalesce(dt.failed, 0)::int   as "documentTasksFailed",
         coalesce(sj.pending, 0)::int  as "syncJobsPending",
         coalesce(sj.failed, 0)::int   as "syncJobsFailed",
         coalesce(dl.total, 0)::int    as "deadLetters",
         coalesce(ex.failed, 0)::int   as "exportsFailed",
         to_json(ex.last_at)#>>'{}' as "lastExportAt",
         to_json(al.last_at)#>>'{}' as "lastActivityAt"
       from core.tenants t
       left join lateral (
         select
           count(*) filter (where status in ('queued', 'running')) as queued,
           count(*) filter (where status = 'failed') as failed
         from documents.document_tasks where tenant_id = t.id
       ) dt on true
       left join lateral (
         select
           count(*) filter (where status in ('queued', 'retry')) as pending,
           count(*) filter (where status = 'failed') as failed
         from integrations.sync_jobs where tenant_id = t.id
       ) sj on true
       left join lateral (
         select count(*) as total
         from integrations.dead_letters
         where tenant_id = t.id and status <> 'resolved'
       ) dl on true
       left join lateral (
         select
           count(*) filter (where status = 'failed') as failed,
           max(requested_at) as last_at
         from integration.export_tasks where tenant_id = t.id
       ) ex on true
       left join lateral (
         select max(created_at) as last_at from audit.audit_log where tenant_id = t.id
       ) al on true
       where t.status <> 'archived'
       order by t.name`
    );

    const outbox = await db.query<{ pending: number; failed: number }>(
      `select
         count(*) filter (where status = 'pending')::int as pending,
         count(*) filter (where status = 'failed')::int as failed
       from core.outbox_events`
    );

    return {
      tenants,
      platformOutbox: { pending: outbox[0]?.pending ?? 0, failed: outbox[0]?.failed ?? 0 },
      generatedAt: new Date().toISOString()
    };
  }
}
