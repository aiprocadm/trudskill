import { apiRequest } from '../../lib/api/client';

import type {
  AttemptDto,
  AttemptQuestion,
  ExamResultDto,
  LearnerTestSummary,
  PreExamTokenDelivery,
  RequestPreExamTokenPayload,
  SaveAnswerPayload,
  StartAttemptPayload,
  VerifyPreExamTokenResult
} from './types';
import type { UserSession } from '../../entities/session/model';

const withAuth = (session: UserSession) => ({
  auth: {
    userId: session.user.id,
    tenantId: session.user.tenantId,
    accessToken: session.tokens.accessToken
  }
});

export const testPlayerApi = {
  /** Server resolves the caller's linked learner(s); no learnerId param. */
  myTests: (session: UserSession): Promise<LearnerTestSummary[]> =>
    apiRequest<LearnerTestSummary[]>('/me/tests', {
      method: 'GET',
      ...withAuth(session)
    }),
  startAttempt: (session: UserSession, payload: StartAttemptPayload): Promise<AttemptDto> =>
    apiRequest<AttemptDto>('/attempts/start', {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    }),
  getAttempt: (session: UserSession, attemptId: string): Promise<AttemptDto> =>
    apiRequest<AttemptDto>(`/attempts/${attemptId}`, { method: 'GET', ...withAuth(session) }),
  getAttemptQuestions: (session: UserSession, attemptId: string): Promise<AttemptQuestion[]> =>
    apiRequest<AttemptQuestion[]>(`/attempts/${attemptId}/questions`, {
      method: 'GET',
      ...withAuth(session)
    }),
  saveAnswer: (
    session: UserSession,
    attemptId: string,
    payload: SaveAnswerPayload
  ): Promise<unknown> =>
    apiRequest(`/attempts/${attemptId}/answers`, {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    }),
  submitAttempt: (session: UserSession, attemptId: string): Promise<AttemptDto> =>
    apiRequest<AttemptDto>(`/attempts/${attemptId}/submit`, {
      method: 'POST',
      ...withAuth(session)
    }),
  getAttemptResult: (session: UserSession, attemptId: string): Promise<ExamResultDto> =>
    apiRequest<ExamResultDto>(`/attempts/${attemptId}/result`, {
      method: 'GET',
      ...withAuth(session)
    }),
  requestPreExamToken: (
    session: UserSession,
    payload: RequestPreExamTokenPayload
  ): Promise<PreExamTokenDelivery> =>
    apiRequest<PreExamTokenDelivery>('/attempts/request-pre-exam-token', {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    }),
  verifyPreExamToken: (session: UserSession, token: string): Promise<VerifyPreExamTokenResult> =>
    apiRequest<VerifyPreExamTokenResult>('/attempts/verify-pre-exam-token', {
      method: 'POST',
      body: { token },
      ...withAuth(session)
    })
};
