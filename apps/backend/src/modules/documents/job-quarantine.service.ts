import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { backendEnv } from '../../env.js';
import { DatabaseService } from '../../infrastructure/database/database.service.js';
import { RabbitMqService } from '../../infrastructure/messaging/rabbitmq.service.js';
import { AuditService } from '../audit/audit.service.js';

import type { RequestContext } from '../../common/context/request-context.js';

/**
 * Карантин упавших задач (ФТ-I1, Фаза 6 Task 7).
 *
 * ЗАЧЕМ. Очередь `jobs.dead-letter` наполнялась с Фазы 0, но читать её было некому:
 * ни консьюмера, ни таблицы, ни экрана. Неудавшийся выпуск удостоверения исчезал молча —
 * слушатель ждал документ, которого никто уже не выпустит, и узнавали об этом по звонку.
 *
 * Воркер теперь складывает такие сообщения в `documents.job_quarantine`, а этот сервис
 * даёт их увидеть, переотправить или отбросить.
 *
 * ПОЧЕМУ НЕ ЧЕРЕЗ СОСТОЯНИЕ MVP. Карантин — эксплуатационные данные: их пишет ВОРКЕР,
 * отдельный процесс, который к запросно-скоупному состоянию бэкенда не имеет доступа.
 * Поэтому обычная таблица и обычный SQL.
 */

export interface QuarantineItem {
  id: string;
  tenantId: string | null;
  messageId: string | null;
  jobType: string | null;
  queueName: string;
  routingKey: string | null;
  retryCount: number;
  lastError: string | null;
  status: 'quarantined' | 'republished' | 'discarded';
  quarantinedAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  republishCount: number;
  payload: unknown;
  /** Разбирается ли тело как JSON. Неразбираемое переотправить нельзя — только отбросить. */
  replayable: boolean;
}

interface QuarantineRow {
  id: string;
  tenant_id: string | null;
  message_id: string | null;
  job_type: string | null;
  queue_name: string;
  routing_key: string | null;
  retry_count: number;
  last_error: string | null;
  status: string;
  quarantined_at: Date | string;
  resolved_at: Date | string | null;
  resolved_by: string | null;
  republish_count: number;
  payload: unknown;
  raw_body: string;
}

const toIso = (value: Date | string | null): string | null => {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
};

const isReplayable = (rawBody: string): boolean => {
  try {
    const parsed: unknown = JSON.parse(rawBody);
    return Boolean(parsed) && typeof parsed === 'object' && !Array.isArray(parsed);
  } catch {
    // Не разбирается как JSON — значит повторять нечего: это и есть ответ проверки.
    return false;
  }
};

@Injectable()
export class JobQuarantineService {
  private readonly logger = new Logger(JobQuarantineService.name);

  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(RabbitMqService) private readonly rabbitMq: RabbitMqService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  private toItem(row: QuarantineRow): QuarantineItem {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      messageId: row.message_id,
      jobType: row.job_type,
      queueName: row.queue_name,
      routingKey: row.routing_key,
      retryCount: row.retry_count,
      lastError: row.last_error,
      status: row.status as QuarantineItem['status'],
      quarantinedAt: toIso(row.quarantined_at)!,
      resolvedAt: toIso(row.resolved_at),
      resolvedBy: row.resolved_by,
      republishCount: row.republish_count,
      payload: row.payload ?? null,
      replayable: isReplayable(row.raw_body)
    };
  }

  /**
   * Список карантина своего центра.
   *
   * Строки с `tenant_id IS NULL` (мусор, который не удалось разобрать) НЕ показываются
   * арендатору: чужого сообщения там быть не может, но и приписывать неизвестное
   * конкретному центру нельзя. Их разбирает владелец платформы по журналу воркера.
   */
  async list(
    tenantId: string,
    options: { status?: string; limit?: number } = {}
  ): Promise<{ items: QuarantineItem[]; total: number }> {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const status = options.status;
    const rows = await this.db.query<QuarantineRow>(
      `select id, tenant_id, message_id, job_type, queue_name, routing_key, retry_count,
              last_error, status, quarantined_at, resolved_at, resolved_by, republish_count,
              payload, raw_body
         from documents.job_quarantine
        where tenant_id = $1
          and ($2::text is null or status = $2)
        order by quarantined_at desc
        limit $3`,
      [tenantId, status ?? null, limit]
    );
    const totals = await this.db.query<{ count: string }>(
      `select count(*)::text as count
         from documents.job_quarantine
        where tenant_id = $1 and ($2::text is null or status = $2)`,
      [tenantId, status ?? null]
    );
    return {
      items: rows.map((row) => this.toItem(row)),
      total: Number(totals[0]?.count ?? 0)
    };
  }

  /** Сколько сообщений сейчас ждут разбора — для экрана здоровья и метрики. */
  async countQuarantined(tenantId?: string): Promise<number> {
    const rows = await this.db.query<{ count: string }>(
      `select count(*)::text as count
         from documents.job_quarantine
        where status = 'quarantined' and ($1::text is null or tenant_id = $1)`,
      [tenantId ?? null]
    );
    return Number(rows[0]?.count ?? 0);
  }

  private async requireOwn(tenantId: string, id: string): Promise<QuarantineRow> {
    const rows = await this.db.query<QuarantineRow>(
      `select id, tenant_id, message_id, job_type, queue_name, routing_key, retry_count,
              last_error, status, quarantined_at, resolved_at, resolved_by, republish_count,
              payload, raw_body
         from documents.job_quarantine
        where id = $1 and tenant_id = $2`,
      [id, tenantId]
    );
    const row = rows[0];
    if (!row) {
      // 404, а не 403: чужая запись не должна даже подтверждать своё существование.
      throw new NotFoundException({ code: 'not_found', message: 'Quarantined job not found' });
    }
    return row;
  }

  /**
   * Переотправить сообщение в очередь.
   *
   * Счётчик попыток обнуляется намеренно: сообщение возвращают в работу ПОСЛЕ того, как
   * человек починил причину (поднял Gotenberg, исправил шаблон). Оставить прежние десять
   * попыток означало бы, что оно улетит обратно в карантин с первой же ошибкой.
   */
  async republish(tenantId: string, id: string, ctx: RequestContext): Promise<QuarantineItem> {
    const row = await this.requireOwn(tenantId, id);
    if (row.status === 'republished') {
      throw new BadRequestException({
        code: 'already_republished',
        message: 'Job has already been sent back to the queue'
      });
    }
    if (!isReplayable(row.raw_body)) {
      // Честный отказ вместо публикации мусора, который тут же вернётся в карантин.
      throw new BadRequestException({
        code: 'not_replayable',
        message: 'Message body is not valid JSON and cannot be republished; discard it instead'
      });
    }

    const payload = JSON.parse(row.raw_body) as Record<string, unknown>;
    await this.rabbitMq.publish(
      backendEnv.JOB_EXCHANGE,
      row.routing_key ?? backendEnv.JOB_ROUTING_DOCUMENT,
      payload,
      {
        ...(ctx.requestId ? { requestId: ctx.requestId } : {}),
        ...(ctx.correlationId ? { correlationId: ctx.correlationId } : {}),
        headers: { 'x-republished-from-quarantine': row.id }
      }
    );

    const updated = await this.db.query<QuarantineRow>(
      `update documents.job_quarantine
          set status = 'republished',
              resolved_at = now(),
              resolved_by = $3,
              republish_count = republish_count + 1,
              updated_at = now()
        where id = $1 and tenant_id = $2
        returning id, tenant_id, message_id, job_type, queue_name, routing_key, retry_count,
                  last_error, status, quarantined_at, resolved_at, resolved_by, republish_count,
                  payload, raw_body`,
      [id, tenantId, ctx.userId ?? null]
    );

    this.audit.write({
      tenantId,
      ...(ctx.userId ? { actorId: ctx.userId } : {}),
      action: 'operations.quarantine_republished',
      entityType: 'job_quarantine',
      entityId: id,
      oldValues: { status: row.status },
      newValues: { status: 'republished' },
      ...(ctx.requestId ? { requestId: ctx.requestId } : {}),
      ...(ctx.correlationId ? { correlationId: ctx.correlationId } : {}),
      ...(ctx.ip ? { ip: ctx.ip } : {}),
      ...(ctx.userAgent ? { userAgent: ctx.userAgent } : {}),
      metadata: { messageId: row.message_id, jobType: row.job_type }
    });

    this.logger.log(`Quarantined job ${id} republished by ${ctx.userId ?? 'unknown'}`);
    return this.toItem(updated[0]!);
  }

  /** Отбросить: сообщение бесполезно (мусор, устаревшая задача, выпущено вручную). */
  async discard(
    tenantId: string,
    id: string,
    reason: string | undefined,
    ctx: RequestContext
  ): Promise<QuarantineItem> {
    const row = await this.requireOwn(tenantId, id);
    if (row.status === 'discarded') {
      throw new BadRequestException({
        code: 'already_discarded',
        message: 'Job has already been discarded'
      });
    }

    const updated = await this.db.query<QuarantineRow>(
      `update documents.job_quarantine
          set status = 'discarded', resolved_at = now(), resolved_by = $3, updated_at = now()
        where id = $1 and tenant_id = $2
        returning id, tenant_id, message_id, job_type, queue_name, routing_key, retry_count,
                  last_error, status, quarantined_at, resolved_at, resolved_by, republish_count,
                  payload, raw_body`,
      [id, tenantId, ctx.userId ?? null]
    );

    this.audit.write({
      tenantId,
      ...(ctx.userId ? { actorId: ctx.userId } : {}),
      action: 'operations.quarantine_discarded',
      entityType: 'job_quarantine',
      entityId: id,
      oldValues: { status: row.status },
      newValues: { status: 'discarded' },
      ...(ctx.requestId ? { requestId: ctx.requestId } : {}),
      ...(ctx.correlationId ? { correlationId: ctx.correlationId } : {}),
      ...(ctx.ip ? { ip: ctx.ip } : {}),
      ...(ctx.userAgent ? { userAgent: ctx.userAgent } : {}),
      metadata: { messageId: row.message_id, reason: reason ?? null }
    });

    return this.toItem(updated[0]!);
  }
}
