import { apiRequest } from '../../lib/api/client';

import type { BulkImportOutcome, BulkImportRequest } from './types';
import type { UserSession } from '../../entities/session/model';

const withAuth = (session: UserSession) => ({
  auth: {
    userId: session.user.id,
    tenantId: session.user.tenantId,
    accessToken: session.tokens.accessToken
  }
});

export const bulkEnrollmentsApi = {
  bulkImport: (session: UserSession, payload: BulkImportRequest): Promise<BulkImportOutcome> =>
    apiRequest<BulkImportOutcome>('/learners/bulk-import', {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    })
};
