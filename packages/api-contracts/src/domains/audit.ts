/**
 * Контракты для чтения журнала аудита (см. `audit.audit_log` в backend).
 * Поле `metadata` после миграции 0027 — jsonb; известные ключи фиксируем типом.
 */

/** Запись делегированного действия от имени слушателя (`learners.act_as`). */
export interface AuditLogDelegatedLearningMetadata {
  delegated: true;
  learnerId: string;
  viaPermission: 'learners.act_as';
}

export type AuditLogMetadata = AuditLogDelegatedLearningMetadata | Record<string, unknown>;

/** Обобщённая строка лога для клиентов, читающих аудит из API. */
export interface AuditLogRecordContract {
  id: string;
  tenantId: string;
  actorId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  metadata?: AuditLogMetadata;
  requestId?: string;
  ip?: string;
  userAgent?: string;
  createdAt: string;
}
