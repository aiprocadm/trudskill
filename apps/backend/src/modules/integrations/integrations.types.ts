export type ProviderType =
  | 'frdo'
  | 'eisot'
  | 'email'
  | 'webinar'
  | 'proctoring'
  | 'scorm'
  | 'trainer';
export type CredentialStatus = 'active' | 'inactive';
export type ExportTaskStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'partial_success'
  | 'cancelled';

export interface Provider {
  id: string;
  code: string;
  name: string;
  providerType: ProviderType;
  isActive: boolean;
}

export interface Credential {
  id: string;
  tenantId: string;
  providerId: string;
  name: string;
  settingsJsonb: Record<string, unknown>;
  secretEncrypted: string;
  status: CredentialStatus;
  createdAt: string;
  updatedAt: string;
  secretVersion: number;
}

export interface ExportTask {
  id: string;
  tenantId: string;
  providerCode: string;
  exportType: string;
  sourceFilterJsonb: Record<string, unknown>;
  status: ExportTaskStatus;
  requestedBy: string;
  requestedAt: string;
  startedAt?: string;
  finishedAt?: string;
  resultFileId?: string;
  responsePayloadJsonb?: Record<string, unknown>;
  idempotencyKey?: string;
}

export interface ExportItem {
  id: string;
  tenantId: string;
  taskId: string;
  entityType: string;
  entityId: string;
  status: ExportTaskStatus;
  externalId?: string;
  errorMessage?: string;
}

export interface SyncLog {
  id: string;
  tenantId: string;
  providerCode: string;
  entityType: string;
  entityId: string;
  requestPayloadJsonb?: Record<string, unknown>;
  responsePayloadJsonb?: Record<string, unknown>;
  statusCode: number;
  status: 'success' | 'error' | 'accepted' | 'duplicate';
  createdAt: string;
  taskId?: string;
}

export interface DeadLetterEntry {
  id: string;
  tenantId: string;
  taskId?: string;
  providerCode: string;
  reason: string;
  payload?: Record<string, unknown>;
  createdAt: string;
}
