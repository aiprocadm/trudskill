import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Optional } from '@nestjs/common';

import { DatabaseService } from '../../infrastructure/database/database.service.js';

/**
 * Поля, которые НИКОГДА не должны попадать в audit_log в чистом виде —
 * по 152-ФЗ и здравому смыслу. Если caller передал такое поле в
 * newValues/oldValues, мы заменяем значение на '***'.
 *
 * Это defence in depth: каждый emitter должен сам решать, что класть
 * в audit, но при ошибке здесь — последняя линия защиты.
 */
const SENSITIVE_FIELDS = new Set([
  'snils',
  'email',
  'firstName',
  'lastName',
  'middleName',
  'fullName',
  'passportSeriesNumber',
  'passport',
  'phoneNumber',
  'phone',
  'birthDate',
  'birth_date',
  /* МГ-C1.1 (РМ78): поле карточки называется dateOfBirth; паспорт и адрес — личное дело. */
  'dateOfBirth',
  'date_of_birth',
  'passportHash',
  'registrationAddress',
  'birthPlace'
]);

function maskPii(values: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!values) return values;
  const masked: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    masked[key] = SENSITIVE_FIELDS.has(key) ? '***' : value;
  }
  return masked;
}

export interface AuditLogRecord {
  id: string;
  tenantId: string;
  actorId?: string;
  /** Имя действующего лица: подставляет сервер, чтобы экран не гадал по справочнику. */
  actorName?: string;
  action: string;
  entityType: string;
  entityId?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  requestId?: string;
  ip?: string;
  userAgent?: string;
  createdAt: string;
}

/** Поля записи до материализации `id` / `createdAt`; `correlationId` вкладывается в `metadata.correlation_id`. */
export type AuditWritePayload = Omit<AuditLogRecord, 'id' | 'createdAt'> & {
  correlationId?: string;
  /**
   * Порция 33 (журнал 270): действие совершено поддержкой платформы «от имени» актора.
   * Попадает в `metadata` пометкой — по журналу должно быть видно, что это сделал не
   * сам клиент; тот же приём, что `metadata.delegated` у преподавателя за слушателя.
   */
  impersonatedBy?: string;
};

/** Отбор журнала. Все текстовые поля — поиск по вхождению, как было в прежнем фильтре. */
export interface AuditListFilter {
  actor?: string;
  entity?: string;
  action?: string;
  entityId?: string;
  requestId?: string;
  createdFrom?: string;
  createdTo?: string;
  /** ТЗ 5.12.2: показать служебные события («Сеанс продлён»). По умолчанию они скрыты. */
  includeService?: boolean;
  limit?: number;
  offset?: number;
}

/** Тот же отбор для памяти (режим без базы) — чтобы поведение не разъезжалось. */
/**
 * Служебные события: нужны для разбора инцидента, но не для чтения журнала человеком
 * (ТЗ 5.12.2).
 *
 * «Сеанс продлён» пишется при каждом обновлении токена — сотни строк в день на одного
 * сотрудника. Журнал, где полезное тонет в служебном, перестают открывать. Записи НЕ
 * удаляются (журнал — доказательство, а не лента новостей), а прячутся по умолчанию:
 * `include_service=1` возвращает их обратно.
 */
export const SERVICE_ACTIONS: readonly string[] = ['auth.refresh'];

function matchesFilter(record: AuditLogRecord, filter: AuditListFilter): boolean {
  if (!filter.includeService && SERVICE_ACTIONS.includes(record.action)) return false;
  if (filter.actor && !record.actorId?.includes(filter.actor)) return false;
  if (filter.entity && !record.entityType.includes(filter.entity)) return false;
  if (filter.action && !record.action.includes(filter.action)) return false;
  if (filter.entityId && !record.entityId?.includes(filter.entityId)) return false;
  if (filter.requestId && !record.requestId?.includes(filter.requestId)) return false;
  if (
    filter.createdFrom &&
    new Date(record.createdAt).getTime() < new Date(filter.createdFrom).getTime()
  ) {
    return false;
  }
  if (
    filter.createdTo &&
    new Date(record.createdAt).getTime() > new Date(filter.createdTo).getTime()
  ) {
    return false;
  }
  return true;
}

@Injectable()
export class AuditService {
  private readonly records: AuditLogRecord[] = [];

  constructor(
    @Optional() @Inject(DatabaseService) private readonly databaseService?: DatabaseService
  ) {}

  /**
   * Fire-and-forget запись audit-события. Используется для CRUD по справочникам
   * (шаблоны, переменные, биндинги, numbering rules), где потеря одной записи
   * не делает невозможной forensic-реконструкцию.
   *
   * Для критичных мутаций (revoke/reissue/finalize/group_order/license CRUD,
   * выпуск документа, доступ к ПДн, публичные эндпоинты) используй
   * `writeCritical()` — он awaited и пробрасывает ошибку БД наверх.
   */
  write(record: AuditWritePayload, options?: { skipDatabase?: boolean }): AuditLogRecord {
    const result = this.buildRecord(record);
    this.records.push(result);

    if (this.databaseService && !options?.skipDatabase) {
      void this.databaseService.query(
        `
          insert into audit.audit_log
            (id, tenant_id, actor_id, action, entity_type, entity_id, old_values, new_values, metadata, request_id, ip, user_agent, created_at)
          values
            ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11, $12, $13::timestamptz)
        `,
        [
          result.id,
          result.tenantId,
          result.actorId ?? null,
          result.action,
          result.entityType,
          result.entityId ?? null,
          result.oldValues ? JSON.stringify(result.oldValues) : null,
          result.newValues ? JSON.stringify(result.newValues) : null,
          result.metadata ? JSON.stringify(result.metadata) : null,
          result.requestId ?? null,
          result.ip ?? null,
          result.userAgent ?? null,
          result.createdAt
        ]
      );
    }

    return result;
  }

  /**
   * Awaited запись audit-события. Используется для:
   *   - мутаций выданных документов (revoke, reissue, finalize, archive);
   *   - массовых операций (group order, batch generate);
   *   - изменения прав (org licenses CRUD, iam permission changes);
   *   - доступа к ПДн (`learner.personal_data_accessed`);
   *   - публичных эндпоинтов (`/public/verify/:token`).
   *
   * При падении БД промис rejects — caller обязан либо обработать, либо дать
   * упасть на уровне http-фильтра. Это важно: потеря audit-записи для этих
   * категорий нарушает forensic-реконструкцию и/или 152-ФЗ.
   */
  async writeCritical(
    record: AuditWritePayload,
    options?: { skipDatabase?: boolean }
  ): Promise<AuditLogRecord> {
    const result = this.buildRecord(record);
    this.records.push(result);

    if (this.databaseService && !options?.skipDatabase) {
      await this.databaseService.query(
        `
          insert into audit.audit_log
            (id, tenant_id, actor_id, action, entity_type, entity_id, old_values, new_values, metadata, request_id, ip, user_agent, created_at)
          values
            ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11, $12, $13::timestamptz)
        `,
        [
          result.id,
          result.tenantId,
          result.actorId ?? null,
          result.action,
          result.entityType,
          result.entityId ?? null,
          result.oldValues ? JSON.stringify(result.oldValues) : null,
          result.newValues ? JSON.stringify(result.newValues) : null,
          result.metadata ? JSON.stringify(result.metadata) : null,
          result.requestId ?? null,
          result.ip ?? null,
          result.userAgent ?? null,
          result.createdAt
        ]
      );
    }

    return result;
  }

  private buildRecord(record: AuditWritePayload): AuditLogRecord {
    const {
      correlationId,
      impersonatedBy,
      metadata: incomingMetadata,
      oldValues,
      newValues,
      ...base
    } = record;
    const metadata: Record<string, unknown> | undefined = (() => {
      const merged: Record<string, unknown> = {
        ...(incomingMetadata ?? {}),
        ...(correlationId ? { correlation_id: correlationId } : {}),
        // Порция 33 (журнал 270): и признак, и КТО именно — по журналу отвечают на
        // вопрос «это наш клиент или наш сотрудник поддержки».
        ...(impersonatedBy ? { impersonated: true, impersonated_by: impersonatedBy } : {})
      };
      return Object.keys(merged).length ? merged : undefined;
    })();

    const result: AuditLogRecord = {
      ...base,
      oldValues: maskPii(oldValues),
      newValues: maskPii(newValues),
      metadata,
      id: `audit_${randomUUID().replace(/-/g, '')}`,
      createdAt: new Date().toISOString()
    };
    return result;
  }

  /**
   * Журнал аудита с фильтрами и постранично (Фаза 6 Task 9).
   *
   * РАНЬШЕ читался ЦЕЛИКОМ: `select ... where tenant_id = $1 order by created_at desc` без
   * предела, а фильтры применялись уже в памяти — то есть поиск по одному действию всё
   * равно вытаскивал весь журнал центра. У работающего центра это сотни тысяч строк:
   * экран открывался всё дольше, а на большом объёме процесс просто съедал память.
   * Теперь и отбор, и предел живут в SQL.
   *
   * Без непустого `tenantId` возвращает пусто (защита от чтения чужого журнала).
   */
  async list(tenantId?: string, filter: AuditListFilter = {}): Promise<AuditLogRecord[]> {
    const page = await this.listPage(tenantId, filter);
    return page.items;
  }

  async listPage(
    tenantId?: string,
    filter: AuditListFilter = {}
  ): Promise<{ items: AuditLogRecord[]; total: number; limit: number; offset: number }> {
    const tid = tenantId?.trim();
    // Предел сверху жёсткий: запрос `?limit=1000000` не должен возвращать нас к прежнему
    // поведению «весь журнал в память».
    const limit = Math.min(Math.max(filter.limit ?? 100, 1), 500);
    const offset = Math.max(filter.offset ?? 0, 0);
    if (!tid) {
      return { items: [], total: 0, limit, offset };
    }

    if (!this.databaseService) {
      const matched = this.records.filter(
        (record) => record.tenantId === tid && matchesFilter(record, filter)
      );
      return {
        items: matched.slice(offset, offset + limit),
        total: matched.length,
        limit,
        offset
      };
    }

    const rows = await this.databaseService.query<{
      id: string;
      tenant_id: string;
      actor_id: string | null;
      actor_name: string | null;
      action: string;
      entity_type: string;
      entity_id: string | null;
      old_values: Record<string, unknown> | null;
      new_values: Record<string, unknown> | null;
      metadata: Record<string, unknown> | null;
      request_id: string | null;
      ip: string | null;
      user_agent: string | null;
      created_at: string;
      total_count: string;
    }>(
      `
        -- Имя действующего лица подставляет СЕРВЕР (ревизия 2026-08-26).
        -- Экран собирал справочник имён отдельным запросом на 100 записей и на ненайденном
        -- идентификаторе писал «система». В центре, где сотрудников больше сотни, журнал
        -- приписывал действие человека системе — то есть врал ровно там, где по нему
        -- разбирают спор. Соединение дешевле справочника и не имеет потолка; удалённая
        -- учётная запись даёт пусто, и экран говорит об этом прямо.
        select
          l.id,
          l.tenant_id,
          l.actor_id,
          u.display_name as actor_name,
          l.action,
          l.entity_type,
          l.entity_id,
          l.old_values,
          l.new_values,
          l.metadata,
          l.request_id,
          l.ip,
          l.user_agent,
          l.created_at::text as created_at,
          count(*) over()::text as total_count
        from audit.audit_log l
        left join iam.users u
          on u.id = l.actor_id
         and u.tenant_id = l.tenant_id
        where l.tenant_id = $1
          and ($2::text is null or l.actor_id like '%' || $2 || '%')
          and ($3::text is null or l.entity_type like '%' || $3 || '%')
          and ($4::text is null or l.action like '%' || $4 || '%')
          and ($5::text is null or l.entity_id like '%' || $5 || '%')
          and ($6::text is null or l.request_id like '%' || $6 || '%')
          and ($7::timestamptz is null or l.created_at >= $7)
          and ($8::timestamptz is null or l.created_at <= $8)
          -- ТЗ 5.12.2: служебные события скрыты по умолчанию, но остаются в базе.
          and ($9::boolean or not (l.action = any($10::text[])))
        order by l.created_at desc, l.id desc
        limit $11 offset $12
      `,
      [
        tid,
        filter.actor ?? null,
        filter.entity ?? null,
        filter.action ?? null,
        filter.entityId ?? null,
        filter.requestId ?? null,
        filter.createdFrom ?? null,
        filter.createdTo ?? null,
        Boolean(filter.includeService),
        SERVICE_ACTIONS,
        limit,
        offset
      ]
    );

    const items = rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      actorId: row.actor_id ?? undefined,
      ...(row.actor_name ? { actorName: row.actor_name } : {}),
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id ?? undefined,
      oldValues: row.old_values ?? undefined,
      newValues: row.new_values ?? undefined,
      metadata: row.metadata ?? undefined,
      requestId: row.request_id ?? undefined,
      ip: row.ip ?? undefined,
      userAgent: row.user_agent ?? undefined,
      createdAt: row.created_at
    }));

    return { items, total: Number(rows[0]?.total_count ?? 0), limit, offset };
  }
}
