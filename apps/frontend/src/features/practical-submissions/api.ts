import { apiRequest } from '../../lib/api/client';

import type {
  AssignmentSubmissionDto,
  CreateSubmissionPayload,
  CreateUploadUrlPayload,
  LearnerAssignmentSummary,
  UpdateSubmissionPayload,
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

export const practicalSubmissionsApi = {
  myAssignments: (session: UserSession): Promise<LearnerAssignmentSummary[]> =>
    apiRequest<LearnerAssignmentSummary[]>('/me/assignments', {
      method: 'GET',
      ...withAuth(session)
    }),
  getSubmission: (session: UserSession, id: string): Promise<AssignmentSubmissionDto> =>
    apiRequest<AssignmentSubmissionDto>(`/assignment-submissions/${id}`, {
      method: 'GET',
      ...withAuth(session)
    }),
  createSubmission: (
    session: UserSession,
    payload: CreateSubmissionPayload
  ): Promise<AssignmentSubmissionDto> =>
    apiRequest<AssignmentSubmissionDto>('/assignment-submissions', {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    }),
  updateSubmission: (
    session: UserSession,
    id: string,
    payload: UpdateSubmissionPayload
  ): Promise<AssignmentSubmissionDto> =>
    apiRequest<AssignmentSubmissionDto>(`/assignment-submissions/${id}`, {
      method: 'PATCH',
      body: payload,
      ...withAuth(session)
    }),
  submitSubmission: (session: UserSession, id: string): Promise<AssignmentSubmissionDto> =>
    apiRequest<AssignmentSubmissionDto>(`/assignment-submissions/${id}/submit`, {
      method: 'POST',
      ...withAuth(session)
    }),
  createUploadUrl: (
    session: UserSession,
    id: string,
    payload: CreateUploadUrlPayload
  ): Promise<UploadIntent> =>
    apiRequest<UploadIntent>(`/assignment-submissions/${id}/upload-url`, {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    })
};

/** Direct PUT of the file bytes to the presigned MinIO URL (bypasses the API envelope). */
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
