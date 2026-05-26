import { apiRequest } from '../../lib/api/client';

import type {
  CreateLicensePayload,
  LicenseStatus,
  LicensesListResponse,
  TrainingLicense,
  UpdateLicensePayload
} from './types';
import type { UserSession } from '../../entities/session/model';

const withAuth = (session: UserSession) => ({
  auth: {
    userId: session.user.id,
    tenantId: session.user.tenantId,
    accessToken: session.tokens.accessToken
  }
});

export const licensesApi = {
  list: (session: UserSession, status?: LicenseStatus) =>
    apiRequest<LicensesListResponse>(
      `/admin/licenses${status ? `?status=${status}` : ''}`,
      withAuth(session)
    ),
  get: (session: UserSession, id: string) =>
    apiRequest<TrainingLicense>(`/admin/licenses/${id}`, withAuth(session)),
  create: (session: UserSession, payload: CreateLicensePayload) =>
    apiRequest<TrainingLicense>('/admin/licenses', {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    }),
  update: (session: UserSession, id: string, payload: UpdateLicensePayload) =>
    apiRequest<TrainingLicense>(`/admin/licenses/${id}`, {
      method: 'PATCH',
      body: payload,
      ...withAuth(session)
    }),
  revoke: (session: UserSession, id: string) =>
    apiRequest<TrainingLicense>(`/admin/licenses/${id}/revoke`, {
      method: 'POST',
      ...withAuth(session)
    })
};
