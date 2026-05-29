import { apiRequest } from '../../lib/api/client';

import type {
  AddTestQuestionPayload,
  AssignmentListItem,
  AssignmentsListFilters,
  CreateAssignmentPayload,
  CreateQuestionBankPayload,
  CreateQuestionPayload,
  CreateTestPayload,
  PaginatedListResponse,
  QuestionBankListItem,
  QuestionBanksListFilters,
  QuestionListItem,
  QuestionsForBankFilters,
  ReviewerQueueResponse,
  TestListItem,
  TestQuestionLink,
  UpdateAssignmentPayload,
  UpdateQuestionBankPayload,
  UpdateQuestionPayload,
  UpdateTestPayload,
  UpdateTestRulePayload
} from './types';
import type { UserSession } from '../../entities/session/model';

const withAuth = (session: UserSession) => ({
  auth: {
    userId: session.user.id,
    tenantId: session.user.tenantId,
    accessToken: session.tokens.accessToken
  }
});

function qs(filters: Record<string, string | number | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== '') p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

export const assessmentAdminApi = {
  // ---------- Question banks ----------
  questionBanks: {
    list: (
      session: UserSession,
      filters: QuestionBanksListFilters
    ): Promise<PaginatedListResponse<QuestionBankListItem>> =>
      apiRequest<PaginatedListResponse<QuestionBankListItem>>(
        `/question-banks${qs({
          q: filters.q,
          status: filters.status,
          courseId: filters.courseId,
          page: filters.page,
          page_size: filters.pageSize
        })}`,
        { method: 'GET', ...withAuth(session) }
      ),
    get: (session: UserSession, id: string): Promise<QuestionBankListItem> =>
      apiRequest<QuestionBankListItem>(`/question-banks/${id}`, {
        method: 'GET',
        ...withAuth(session)
      }),
    create: (
      session: UserSession,
      payload: CreateQuestionBankPayload
    ): Promise<QuestionBankListItem> =>
      apiRequest<QuestionBankListItem>('/question-banks', {
        method: 'POST',
        body: payload,
        ...withAuth(session)
      }),
    update: (
      session: UserSession,
      id: string,
      payload: UpdateQuestionBankPayload
    ): Promise<QuestionBankListItem> =>
      apiRequest<QuestionBankListItem>(`/question-banks/${id}`, {
        method: 'PATCH',
        body: payload,
        ...withAuth(session)
      }),
    archive: (session: UserSession, id: string): Promise<QuestionBankListItem> =>
      apiRequest<QuestionBankListItem>(`/question-banks/${id}/archive`, {
        method: 'POST',
        ...withAuth(session)
      })
  },

  // ---------- Questions ----------
  questions: {
    listForBank: (
      session: UserSession,
      bankId: string,
      filters: QuestionsForBankFilters
    ): Promise<PaginatedListResponse<QuestionListItem>> =>
      apiRequest<PaginatedListResponse<QuestionListItem>>(
        `/question-banks/${bankId}/questions${qs({
          type: filters.type,
          tag: filters.tag,
          q: filters.q,
          page: filters.page,
          page_size: filters.pageSize
        })}`,
        { method: 'GET', ...withAuth(session) }
      ),
    get: (session: UserSession, id: string): Promise<QuestionListItem> =>
      apiRequest<QuestionListItem>(`/questions/${id}`, {
        method: 'GET',
        ...withAuth(session)
      }),
    create: (session: UserSession, payload: CreateQuestionPayload): Promise<QuestionListItem> =>
      apiRequest<QuestionListItem>('/questions', {
        method: 'POST',
        body: payload,
        ...withAuth(session)
      }),
    update: (
      session: UserSession,
      id: string,
      payload: UpdateQuestionPayload
    ): Promise<QuestionListItem> =>
      apiRequest<QuestionListItem>(`/questions/${id}`, {
        method: 'PATCH',
        body: payload,
        ...withAuth(session)
      }),
    archive: (session: UserSession, id: string): Promise<QuestionListItem> =>
      apiRequest<QuestionListItem>(`/questions/${id}/archive`, {
        method: 'POST',
        ...withAuth(session)
      })
  },

  // ---------- Tests ----------
  tests: {
    list: (
      session: UserSession,
      filters: { q?: string; status?: string; page?: number; pageSize?: number }
    ): Promise<PaginatedListResponse<TestListItem>> =>
      apiRequest<PaginatedListResponse<TestListItem>>(
        `/tests${qs({
          q: filters.q,
          status: filters.status,
          page: filters.page,
          page_size: filters.pageSize
        })}`,
        { method: 'GET', ...withAuth(session) }
      ),
    get: (session: UserSession, id: string): Promise<TestListItem> =>
      apiRequest<TestListItem>(`/tests/${id}`, { method: 'GET', ...withAuth(session) }),
    create: (session: UserSession, payload: CreateTestPayload): Promise<TestListItem> =>
      apiRequest<TestListItem>('/tests', { method: 'POST', body: payload, ...withAuth(session) }),
    update: (session: UserSession, id: string, payload: UpdateTestPayload): Promise<TestListItem> =>
      apiRequest<TestListItem>(`/tests/${id}`, {
        method: 'PATCH',
        body: payload,
        ...withAuth(session)
      }),
    archive: (session: UserSession, id: string): Promise<TestListItem> =>
      apiRequest<TestListItem>(`/tests/${id}/archive`, { method: 'POST', ...withAuth(session) }),
    publish: (session: UserSession, id: string): Promise<TestListItem> =>
      apiRequest<TestListItem>(`/tests/${id}/publish`, { method: 'POST', ...withAuth(session) }),
    upsertRule: (
      session: UserSession,
      id: string,
      payload: UpdateTestRulePayload
    ): Promise<TestListItem> =>
      apiRequest<TestListItem>(`/tests/${id}/rules`, {
        method: 'PUT',
        body: payload,
        ...withAuth(session)
      }),
    listQuestions: (session: UserSession, id: string): Promise<TestQuestionLink[]> =>
      apiRequest<TestQuestionLink[]>(`/tests/${id}/questions`, {
        method: 'GET',
        ...withAuth(session)
      }),
    addQuestion: (
      session: UserSession,
      id: string,
      payload: AddTestQuestionPayload
    ): Promise<TestQuestionLink> =>
      apiRequest<TestQuestionLink>(`/tests/${id}/questions/single`, {
        method: 'POST',
        body: payload,
        ...withAuth(session)
      }),
    removeQuestion: (
      session: UserSession,
      id: string,
      questionId: string
    ): Promise<{ removed: boolean }> =>
      apiRequest<{ removed: boolean }>(`/tests/${id}/questions/${questionId}`, {
        method: 'DELETE',
        ...withAuth(session)
      }),
    reorderQuestion: (
      session: UserSession,
      id: string,
      questionId: string,
      sortOrder: number
    ): Promise<TestQuestionLink> =>
      apiRequest<TestQuestionLink>(`/tests/${id}/questions/${questionId}`, {
        method: 'PATCH',
        body: { sortOrder },
        ...withAuth(session)
      })
  },

  // ---------- Assignments ----------
  assignments: {
    list: (
      session: UserSession,
      filters: AssignmentsListFilters
    ): Promise<PaginatedListResponse<AssignmentListItem>> =>
      apiRequest<PaginatedListResponse<AssignmentListItem>>(
        `/assignments${qs({
          q: filters.q,
          status: filters.status,
          courseId: filters.courseId,
          page: filters.page,
          page_size: filters.pageSize
        })}`,
        { method: 'GET', ...withAuth(session) }
      ),
    get: (session: UserSession, id: string): Promise<AssignmentListItem> =>
      apiRequest<AssignmentListItem>(`/assignments/${id}`, {
        method: 'GET',
        ...withAuth(session)
      }),
    create: (session: UserSession, payload: CreateAssignmentPayload): Promise<AssignmentListItem> =>
      apiRequest<AssignmentListItem>('/assignments', {
        method: 'POST',
        body: payload,
        ...withAuth(session)
      }),
    update: (
      session: UserSession,
      id: string,
      payload: UpdateAssignmentPayload
    ): Promise<AssignmentListItem> =>
      apiRequest<AssignmentListItem>(`/assignments/${id}`, {
        method: 'PATCH',
        body: payload,
        ...withAuth(session)
      }),
    archive: (session: UserSession, id: string): Promise<AssignmentListItem> =>
      apiRequest<AssignmentListItem>(`/assignments/${id}/archive`, {
        method: 'POST',
        ...withAuth(session)
      })
  },

  // ---------- Reviewer queue ----------
  reviewerQueue: {
    get: (session: UserSession): Promise<ReviewerQueueResponse> =>
      apiRequest<ReviewerQueueResponse>('/reviewer/queue', {
        method: 'GET',
        ...withAuth(session)
      })
  }
};
