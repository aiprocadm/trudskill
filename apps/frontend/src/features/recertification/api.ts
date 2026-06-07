import { apiRequest } from '../../lib/api/client';

import type {
  RecertScanSummary,
  RecertificationDraft,
  RecertificationDraftStatus,
  RecertificationDraftView
} from './types';
import type { UserSession } from '../../entities/session/model';

const withAuth = (session: UserSession) => ({
  auth: {
    userId: session.user.id,
    tenantId: session.user.tenantId,
    accessToken: session.tokens.accessToken
  }
});

export const recertificationApi = {
  list: (
    session: UserSession,
    status?: RecertificationDraftStatus
  ): Promise<RecertificationDraftView[]> =>
    apiRequest<RecertificationDraftView[]>(
      `/recertification-drafts${status ? `?status=${status}` : ''}`,
      withAuth(session)
    ),

  reject: (session: UserSession, id: string, reason?: string): Promise<RecertificationDraft> =>
    apiRequest<RecertificationDraft>(`/recertification-drafts/${id}/reject`, {
      method: 'POST',
      body: reason ? { reason } : {},
      ...withAuth(session)
    }),

  scan: (session: UserSession): Promise<RecertScanSummary> =>
    apiRequest<RecertScanSummary>('/recertification/scan', {
      method: 'POST',
      ...withAuth(session)
    })
};
