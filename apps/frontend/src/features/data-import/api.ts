import { apiRequest } from '../../lib/api/client';

import type { UserSession } from '../../entities/session/model';

/**
 * Перенос данных из прежней системы обучения (ТЗ перехода §16, МГ-K3.1; срез 23.5).
 *
 * Адрес ручек задан ТЗ и сервером и содержит имя системы-источника — это имя ЧУЖОЙ системы в
 * пути API, а не ключ хранения браузера (исключение сторожа BR-020 записано с причиной).
 */
const BASE = '/import/cdoprof/runs';

export type ImportDomain =
  | 'counterparties'
  | 'directions'
  | 'courses'
  | 'learners'
  | 'groups'
  | 'group_courses'
  | 'enrollments';
export type ImportRunDomain = ImportDomain | 'all';
export type ImportRunStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'partial'
  | 'failed'
  | 'cancelled';
export type ImportRowAction = 'created' | 'updated' | 'skipped' | 'failed';

export interface ImportStats {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  mergeCandidates: number;
  withNotes: number;
  retryOf?: string;
}

export interface ImportRunDto {
  id: string;
  domain: ImportRunDomain;
  status: ImportRunStatus;
  dryRun: boolean;
  stats: ImportStats;
  errorText?: string;
  startedAt?: string;
  finishedAt?: string;
  createdAt: string;
}

export interface ImportRowDto {
  id: string;
  domain: ImportDomain;
  sourceId: string;
  action: ImportRowAction;
  targetId?: string;
  errorCode?: string;
  errorText?: string;
  raw: Record<string, unknown>;
}

export interface ImportRowsQuery {
  action?: ImportRowAction;
  errorCode?: string;
  limit?: number;
  offset?: number;
}

const auth = (session: UserSession) => ({
  accessToken: session.tokens.accessToken,
  tenantId: session.user.tenantId,
  userId: session.user.id
});

export const dataImportApi = {
  listImportRuns: (session: UserSession) =>
    apiRequest<ImportRunDto[]>(BASE, { auth: auth(session) }),
  startImportRun: (session: UserSession, input: { domain: ImportRunDomain; dryRun: boolean }) =>
    apiRequest<ImportRunDto>(BASE, {
      method: 'POST',
      body: { source: 'api', ...input },
      auth: auth(session)
    }),
  retryImportRun: (session: UserSession, runId: string) =>
    apiRequest<ImportRunDto>(`${BASE}/${encodeURIComponent(runId)}/retry-failed`, {
      method: 'POST',
      auth: auth(session)
    }),
  listImportRows: (session: UserSession, runId: string, query: ImportRowsQuery) => {
    const params = new URLSearchParams();
    if (query.action) params.set('action', query.action);
    if (query.errorCode) params.set('errorCode', query.errorCode);
    params.set('limit', String(query.limit ?? 100));
    params.set('offset', String(query.offset ?? 0));
    return apiRequest<{ items: ImportRowDto[]; total: number }>(
      `${BASE}/${encodeURIComponent(runId)}/rows?${params.toString()}`,
      { auth: auth(session) }
    );
  }
};
