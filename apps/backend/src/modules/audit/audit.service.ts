import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Optional } from '@nestjs/common';

import { DatabaseService } from '../../infrastructure/database/database.service.js';

export interface AuditLogRecord {
  id: string;
  tenantId: string;
  actorId?: string;
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
};

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
    const { correlationId, metadata: incomingMetadata, ...base } = record;
    const metadata: Record<string, unknown> | undefined = (() => {
      const merged: Record<string, unknown> = {
        ...(incomingMetadata ?? {}),
        ...(correlationId ? { correlation_id: correlationId } : {})
      };
      return Object.keys(merged).length ? merged : undefined;
    })();

    const result: AuditLogRecord = {
      ...base,
      metadata,
      id: `audit_${randomUUID().replace(/-/g, '')}`,
      createdAt: new Date().toISOString()
    };
    return result;
  }

  /** Без непустого `tenantId` возвращает `[]` (защита от cross-tenant read). */
  async list(tenantId?: string): Promise<AuditLogRecord[]> {
    const tid = tenantId?.trim();
    if (!tid) {
      return [];
    }

    if (!this.databaseService) {
      return this.records.filter((record) => record.tenantId === tid);
    }

    const rows = await this.databaseService.query<{
      id: string;
      tenant_id: string;
      actor_id: string | null;
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
    }>(
      `
        select
          id,
          tenant_id,
          actor_id,
          action,
          entity_type,
          entity_id,
          old_values,
          new_values,
          metadata,
          request_id,
          ip,
          user_agent,
          created_at::text as created_at
        from audit.audit_log
        where tenant_id = $1
        order by created_at desc
      `,
      [tid]
    );

    return rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      actorId: row.actor_id ?? undefined,
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
  }
}
