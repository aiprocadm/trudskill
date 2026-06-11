import { apiRequest } from '../../lib/api/client';

import type {
  ActiveProctoringDto,
  ProctoringChunkUploadPayload,
  ProctoringRecordingDetail,
  ProctoringRecordingDto,
  ProctoringRecordingStatus,
  ProctoringRecordingView,
  SetProctoringOverridePayload,
  StartProctoringPayload,
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

export const proctoringApi = {
  start: (session: UserSession, payload: StartProctoringPayload): Promise<ProctoringRecordingDto> =>
    apiRequest<ProctoringRecordingDto>('/proctoring-recordings', {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    }),
  chunkUploadUrl: (
    session: UserSession,
    id: string,
    payload: ProctoringChunkUploadPayload
  ): Promise<UploadIntent> =>
    apiRequest<UploadIntent>(`/proctoring-recordings/${id}/chunk-upload-intent`, {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    }),
  complete: (session: UserSession, id: string): Promise<ProctoringRecordingDto> =>
    apiRequest<ProctoringRecordingDto>(`/proctoring-recordings/${id}/complete`, {
      method: 'POST',
      body: {},
      ...withAuth(session)
    }),
  active: (
    session: UserSession,
    enrollmentId: string,
    courseId: string
  ): Promise<ActiveProctoringDto | null> =>
    apiRequest<ActiveProctoringDto | null>(
      `/proctoring-recordings/active?enrollmentId=${encodeURIComponent(enrollmentId)}&courseId=${encodeURIComponent(courseId)}`,
      { method: 'GET', ...withAuth(session) }
    ),
  list: (
    session: UserSession,
    status?: ProctoringRecordingStatus
  ): Promise<ProctoringRecordingView[]> =>
    apiRequest<ProctoringRecordingView[]>(
      `/proctoring-recordings${status ? `?status=${status}` : ''}`,
      { method: 'GET', ...withAuth(session) }
    ),
  get: (session: UserSession, id: string): Promise<ProctoringRecordingDetail> =>
    apiRequest<ProctoringRecordingDetail>(`/proctoring-recordings/${id}`, {
      method: 'GET',
      ...withAuth(session)
    }),
  setOverride: (
    session: UserSession,
    enrollmentId: string,
    payload: SetProctoringOverridePayload
  ): Promise<{ id: string; proctoringOverride: string | null }> =>
    apiRequest<{ id: string; proctoringOverride: string | null }>(
      `/enrollments/${enrollmentId}/proctoring-override`,
      { method: 'PATCH', body: payload, ...withAuth(session) }
    )
};

/** Direct PUT of chunk bytes to the presigned MinIO URL (bypasses the API envelope).
 *  Deliberate local copy of identity-verification's helper (documented duplication precedent). */
export async function putBlobToPresignedUrl(
  uploadUrl: string,
  blob: Blob,
  contentType: string
): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: blob
  });
  if (!res.ok) {
    throw new Error(`Не удалось загрузить фрагмент записи (HTTP ${res.status})`);
  }
}

/** MediaRecorder reports e.g. 'video/webm;codecs=vp8,opus' — the backend allowlist wants the base type. */
export function baseMimeType(blobType: string): string {
  return (blobType || 'video/webm').split(';')[0]!;
}
