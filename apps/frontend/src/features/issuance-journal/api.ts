import { apiRequest } from '../../lib/api/client';
import { frontendEnv } from '../../lib/config/env';

import type { IssuanceJournalFilter, IssuanceJournalPage } from './types';
import type { UserSession } from '../../entities/session/model';

function buildQuery(filter: IssuanceJournalFilter): string {
  const params = new URLSearchParams();
  if (filter.from) params.set('from', filter.from);
  if (filter.to) params.set('to', filter.to);
  if (filter.types) for (const t of filter.types) params.append('types', t);
  if (filter.status) params.set('status', filter.status);
  if (filter.groupOrderDocumentId) params.set('groupOrderDocumentId', filter.groupOrderDocumentId);
  if (filter.limit !== undefined) params.set('limit', String(filter.limit));
  if (filter.offset !== undefined) params.set('offset', String(filter.offset));
  const s = params.toString();
  return s ? `?${s}` : '';
}

const withAuth = (session: UserSession) => ({
  auth: {
    userId: session.user.id,
    tenantId: session.user.tenantId,
    accessToken: session.tokens.accessToken
  }
});

export interface RevokeReissueResponse {
  status: string;
  id: string;
  revokedAt?: string;
  revocationReason?: string;
}

export interface ReissueResult {
  original: RevokeReissueResponse;
  replacement: RevokeReissueResponse;
}

export const issuanceJournalApi = {
  list: (session: UserSession, filter: IssuanceJournalFilter) =>
    apiRequest<IssuanceJournalPage>(
      `/admin/documents/issuance-journal${buildQuery(filter)}`,
      withAuth(session)
    ),

  revoke: (session: UserSession, documentId: string, reason: string) =>
    apiRequest<RevokeReissueResponse>(`/admin/documents/${documentId}/revoke`, {
      method: 'POST',
      body: { reason },
      ...withAuth(session)
    }),

  reissue: (session: UserSession, documentId: string, reason: string) =>
    apiRequest<ReissueResult>(`/admin/documents/${documentId}/reissue`, {
      method: 'POST',
      body: { reason },
      ...withAuth(session)
    }),

  /**
   * Скачивает CSV в браузере. Не использует apiRequest (тот делает JSON-envelope),
   * а напрямую fetch на бэкенд: ответ — бинарный CSV, не envelope. Авторизация
   * через те же заголовки.
   */
  downloadCsv: async (session: UserSession, filter: IssuanceJournalFilter): Promise<void> => {
    const url = `${frontendEnv.NEXT_PUBLIC_API_BASE_URL}/admin/documents/issuance-journal.csv${buildQuery(filter)}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${session.tokens.accessToken}`,
        'X-Tenant-Id': session.user.tenantId
      }
    });
    if (!response.ok) {
      throw new Error(`CSV export failed: ${response.status}`);
    }
    const blob = await response.blob();
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `issuance-journal-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(downloadUrl);
  }
};
