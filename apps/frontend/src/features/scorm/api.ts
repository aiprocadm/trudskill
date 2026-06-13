import { apiRequest } from '../../lib/api/client';

import type {
  CommitScormAttemptPayload,
  ScormAttemptDto,
  ScormLaunchDto,
  ScormPackageDto,
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

export const scormApi = {
  uploadUrl: (
    session: UserSession,
    payload: { originalName: string; contentType: string; sizeBytes: number }
  ): Promise<UploadIntent> =>
    apiRequest<UploadIntent>('/scorm-packages/upload-url', {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    }),

  register: (
    session: UserSession,
    payload: { zipFileId: string; title?: string }
  ): Promise<ScormPackageDto> =>
    apiRequest<ScormPackageDto>('/scorm-packages', {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    }),

  list: (session: UserSession): Promise<{ items: ScormPackageDto[]; total: number }> =>
    apiRequest<{ items: ScormPackageDto[]; total: number }>('/scorm-packages', {
      method: 'GET',
      ...withAuth(session)
    }),

  process: (session: UserSession, id: string): Promise<ScormPackageDto> =>
    apiRequest<ScormPackageDto>(`/scorm-packages/${id}/process`, {
      method: 'POST',
      body: {},
      ...withAuth(session)
    }),

  remove: (session: UserSession, id: string): Promise<{ id: string; deleted: true }> =>
    apiRequest<{ id: string; deleted: true }>(`/scorm-packages/${id}`, {
      method: 'DELETE',
      ...withAuth(session)
    }),

  launch: (
    session: UserSession,
    materialId: string,
    enrollmentId: string
  ): Promise<ScormLaunchDto> =>
    apiRequest<ScormLaunchDto>(`/scorm-materials/${materialId}/launch`, {
      method: 'POST',
      body: { enrollmentId },
      ...withAuth(session)
    }),

  commit: (
    session: UserSession,
    attemptId: string,
    payload: CommitScormAttemptPayload
  ): Promise<ScormAttemptDto> =>
    apiRequest<ScormAttemptDto>(`/scorm-attempts/${attemptId}/commit`, {
      method: 'PUT',
      body: payload,
      ...withAuth(session)
    })
};

/** Direct PUT of zip file to presigned MinIO URL (bypasses the API envelope).
 *  Deliberate local copy of proctoring's helper (documented duplication precedent).
 *  Pass the same `contentType` used to sign the upload intent so the presigned
 *  signature and the PUT header are identical (prevents MinIO 403 on Windows where
 *  file.type is often empty for .zip). */
export async function putFileToPresignedUrl(
  uploadUrl: string,
  file: File,
  contentType?: string
): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType ?? (file.type || 'application/zip') },
    body: file
  });
  if (!res.ok) throw new Error(`Upload failed (HTTP ${res.status})`);
}
