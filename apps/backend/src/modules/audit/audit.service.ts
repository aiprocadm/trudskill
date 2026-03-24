import { Injectable } from '@nestjs/common';

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

  write(record: Omit<AuditLogRecord, 'id' | 'createdAt'>): AuditLogRecord {
    const result: AuditLogRecord = {
      ...record,
      id: `audit_${this.records.length + 1}`,
      createdAt: new Date().toISOString()
    };
    this.records.push(result);
    return result;
  }

  list(): AuditLogRecord[] {
    return [...this.records];
  }
}
