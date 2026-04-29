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
  requestId?: string;
  ip?: string;
  userAgent?: string;
  createdAt: string;
}

@Injectable()
export class AuditService {
  private readonly records: AuditLogRecord[] = [];

  constructor(
    @Optional() @Inject(DatabaseService) private readonly databaseService?: DatabaseService
  ) {}

  write(
    record: Omit<AuditLogRecord, 'id' | 'createdAt'>,
    options?: { skipDatabase?: boolean }
  ): AuditLogRecord {
    const result = this.buildRecord(record);
    this.records.push(result);

    if (this.databaseService && !options?.skipDatabase) {
      void this.databaseService.query(
        `
          insert into audit.audit_log
            (id, tenant_id, actor_id, action, entity_type, entity_id, old_values, new_values, request_id, ip, user_agent, created_at)
          values
            ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11, $12::timestamptz)
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
          result.requestId ?? null,
          result.ip ?? null,
          result.userAgent ?? null,
          result.createdAt
        ]
      );
    }

    return result;
  }

  async writeCritical(
    record: Omit<AuditLogRecord, 'id' | 'createdAt'>,
    options?: { skipDatabase?: boolean }
  ): Promise<AuditLogRecord> {
    const result = this.buildRecord(record);
    this.records.push(result);

    if (this.databaseService && !options?.skipDatabase) {
      await this.databaseService.query(
        `
          insert into audit.audit_log
            (id, tenant_id, actor_id, action, entity_type, entity_id, old_values, new_values, request_id, ip, user_agent, created_at)
          values
            ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11, $12::timestamptz)
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
          result.requestId ?? null,
          result.ip ?? null,
          result.userAgent ?? null,
          result.createdAt
        ]
      );
    }

    return result;
  }

  private buildRecord(record: Omit<AuditLogRecord, 'id' | 'createdAt'>): AuditLogRecord {
    const result: AuditLogRecord = {
      ...record,
      id: `audit_${randomUUID().replace(/-/g, '')}`,
      createdAt: new Date().toISOString()
    };
    return result;
  }

  async list(tenantId?: string): Promise<AuditLogRecord[]> {
    if (!this.databaseService) {
      return tenantId
        ? this.records.filter((record) => record.tenantId === tenantId)
        : [...this.records];
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
          request_id,
          ip,
          user_agent,
          created_at::text as created_at
        from audit.audit_log
        where ($1::text is null or tenant_id = $1)
        order by created_at desc
      `,
      [tenantId ?? null]
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
      requestId: row.request_id ?? undefined,
      ip: row.ip ?? undefined,
      userAgent: row.user_agent ?? undefined,
      createdAt: row.created_at
    }));
  }
}
