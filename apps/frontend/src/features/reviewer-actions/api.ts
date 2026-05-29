import { apiRequest } from '../../lib/api/client';

import type {
  AssignmentReviewDto,
  CompleteAttemptReviewPayload,
  CompleteReviewPayload,
  CreateReviewPayload,
  ReturnSubmissionPayload,
  ReviewerQueueSnapshot
} from './types';
import type { UserSession } from '../../entities/session/model';

const withAuth = (session: UserSession) => ({
  auth: {
    userId: session.user.id,
    tenantId: session.user.tenantId,
    accessToken: session.tokens.accessToken
  }
});

export const reviewerActionsApi = {
  queue: (session: UserSession): Promise<ReviewerQueueSnapshot> =>
    apiRequest<ReviewerQueueSnapshot>('/reviewer/queue', { method: 'GET', ...withAuth(session) }),
  takeIntoReview: (
    session: UserSession,
    payload: CreateReviewPayload
  ): Promise<AssignmentReviewDto> =>
    apiRequest<AssignmentReviewDto>('/assignment-reviews', {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    }),
  completeReview: (
    session: UserSession,
    reviewId: string,
    payload: CompleteReviewPayload
  ): Promise<AssignmentReviewDto> =>
    apiRequest<AssignmentReviewDto>(`/assignment-reviews/${reviewId}/complete`, {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    }),
  returnSubmission: (
    session: UserSession,
    submissionId: string,
    payload: ReturnSubmissionPayload
  ) =>
    apiRequest(`/assignment-submissions/${submissionId}/return`, {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    }),
  completeAttemptReview: (
    session: UserSession,
    attemptId: string,
    payload: CompleteAttemptReviewPayload
  ) =>
    apiRequest(`/attempts/${attemptId}/complete-review`, {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    }),
  submissionFileUrl: (session: UserSession, submissionId: string): Promise<{ url: string }> =>
    apiRequest<{ url: string }>(`/assignment-submissions/${submissionId}/file-url`, {
      method: 'GET',
      ...withAuth(session)
    })
};
