import { apiRequest } from '../../lib/api/client';

import type {
  CreateUploadUrlPayload,
  IdentityVerificationDetail,
  IdentityVerificationDto,
  IdentityVerificationStatus,
  IdentityVerificationView,
  ReviewIdentityVerificationPayload,
  SubmitIdentityVerificationPayload,
  UploadIntent
} from './types';
import type { UserSession } from '../../entities/session/model';

const withAuth = (session: UserSession) => ({
  auth: {
    userId: session.user.id,
    tenantId: session.user.tenantId,
    accessToken: session.tokens.accessToken
  }
});

export const identityVerificationApi = {
  me: (session: UserSession): Promise<IdentityVerificationDto | null> =>
    apiRequest<IdentityVerificationDto | null>('/identity-verifications/me', {
      method: 'GET',
      ...withAuth(session)
    }),
  start: (
    session: UserSession,
    payload: { learnerId?: string } = {}
  ): Promise<IdentityVerificationDto> =>
    apiRequest<IdentityVerificationDto>('/identity-verifications', {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    }),
  createUploadUrl: (
    session: UserSession,
    id: string,
    payload: CreateUploadUrlPayload
  ): Promise<UploadIntent> =>
    apiRequest<UploadIntent>(`/identity-verifications/${id}/upload-url`, {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    }),
  submit: (
    session: UserSession,
    id: string,
    payload: SubmitIdentityVerificationPayload
  ): Promise<IdentityVerificationDto> =>
    apiRequest<IdentityVerificationDto>(`/identity-verifications/${id}/submit`, {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    }),
  list: (
    session: UserSession,
    status?: IdentityVerificationStatus
  ): Promise<IdentityVerificationView[]> =>
    apiRequest<IdentityVerificationView[]>(
      `/identity-verifications${status ? `?status=${status}` : ''}`,
      { method: 'GET', ...withAuth(session) }
    ),
  get: (session: UserSession, id: string): Promise<IdentityVerificationDetail> =>
    apiRequest<IdentityVerificationDetail>(`/identity-verifications/${id}`, {
      method: 'GET',
      ...withAuth(session)
    }),
  review: (
    session: UserSession,
    id: string,
    payload: ReviewIdentityVerificationPayload
  ): Promise<IdentityVerificationDto> =>
    apiRequest<IdentityVerificationDto>(`/identity-verifications/${id}/review`, {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    }),
  /** ЕСИА identity: bearer-authenticated POST (can't be an <a href> — that wouldn't send the token).
   *  Returns the Госуслуги authorize URL the SPA then navigates to. */
  esiaIdentityAuthorize: (session: UserSession): Promise<{ authorizeUrl: string }> =>
    apiRequest<{ authorizeUrl: string }>('/auth/esia/identity/authorize', {
      method: 'POST',
      ...withAuth(session)
    })
};

/** Direct PUT of the file bytes to the presigned MinIO URL (bypasses the API envelope).
 *  Deliberate local copy of practical-submissions' helper (same precedent as the СНИЛС validator). */
export async function putFileToPresignedUrl(uploadUrl: string, file: File): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file
  });
  if (!res.ok) {
    throw new Error(`Не удалось загрузить файл (HTTP ${res.status})`);
  }
}
