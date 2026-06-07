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

// NB: approve / auto-enroll (POST /recertification-drafts/:id/approve) is intentionally NOT
// exposed here — Phase 5C is visibility-only by owner decision (re-enrollment goes through the
// existing bulk-enrollment flow). See the 5C spec §2/§7. Possible 5C-2 follow-up.
export const recertificationApi = {
  list: (
    session: UserSession,
    status?: RecertificationDraftStatus
  ): Promise<RecertificationDraftView[]> =>
    apiRequest<RecertificationDraftView[]>(
      `/recertification-drafts${status ? `?status=${status}` : ''}`,
      withAuth(session)
    ),

  // Backend's rejectDraft is `Row | null`, but the controller throws NotFound for an unknown id,
  // so the HTTP body is always the updated row here (never null). The screen ignores the result
  // and refetches anyway, so the non-null type is the accurate HTTP contract.
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
