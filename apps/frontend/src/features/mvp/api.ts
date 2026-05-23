import { apiRequest } from '../../lib/api/client';

import type {
  Assignment,
  AssignmentReview,
  AssignmentSubmission,
  Attempt,
  BaseFilterQuery,
  BulkEnrollmentsOutcome,
  BulkEnrollmentsQueuedResponse,
  Commission,
  CommissionMember,
  CommissionMemberRole,
  CommissionStatus,
  CommissionWithMembers,
  Counterparty,
  Course,
  CourseDocumentSetEntry,
  CourseDocumentSetEntryDraft,
  CourseModule,
  CourseVersion,
  Direction,
  Enrollment,
  EnrollmentCertificateRow,
  ExamResult,
  Group,
  GroupCourse,
  KpiFilterQuery,
  KpiSnapshot,
  Learner,
  ListResponse,
  Material,
  ProgramMetaPatch,
  Progress,
  Question,
  QuestionBank,
  RoleEntity,
  SessionDto,
  TestEntity,
  UserEntity
} from './types';
import type { UserSession } from '../../entities/session/model';

const withAuth = (session: UserSession) => ({
  auth: {
    userId: session.user.id,
    tenantId: session.user.tenantId,
    accessToken: session.tokens.accessToken
  }
});

const queryString = (query: BaseFilterQuery = {}) => {
  const search = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== '') search.set(key, String(value));
  });
  return search.toString() ? `?${search.toString()}` : '';
};

export const mvpApi = {
  listUsers: (session: UserSession, query: BaseFilterQuery) =>
    apiRequest<ListResponse<UserEntity>>(`/users${queryString(query)}`, withAuth(session)),
  getUser: (session: UserSession, id: string) =>
    apiRequest<UserEntity>(`/users/${id}`, withAuth(session)),
  getUserRoles: (session: UserSession, id: string) =>
    apiRequest<RoleEntity[]>(`/users/${id}/roles`, withAuth(session)),

  listUserSessions: (session: UserSession, userId: string) =>
    apiRequest<SessionDto[]>('/auth/sessions', withAuth(session)).then((items) =>
      items.filter((item) => item.userId === userId)
    ),
  revokeSession: (session: UserSession, sessionId: string) =>
    apiRequest<{ success: boolean }>(`/auth/sessions/${sessionId}`, {
      method: 'DELETE',
      ...withAuth(session)
    }),
  listRoles: (session: UserSession) => apiRequest<RoleEntity[]>('/roles', withAuth(session)),
  setUserRoles: (session: UserSession, id: string, roleCodes: string[]) =>
    apiRequest<RoleEntity[]>(`/users/${id}/roles`, {
      method: 'PUT',
      body: { roleCodes },
      ...withAuth(session)
    }),

  listLearners: (session: UserSession, query: BaseFilterQuery) =>
    apiRequest<ListResponse<Learner>>(`/learners${queryString(query)}`, withAuth(session)),
  getLearner: (session: UserSession, id: string) =>
    apiRequest<Learner>(`/learners/${id}`, withAuth(session)),

  listCounterparties: (session: UserSession, query: BaseFilterQuery) =>
    apiRequest<ListResponse<Counterparty>>(
      `/counterparties${queryString(query)}`,
      withAuth(session)
    ),
  getCounterparty: (session: UserSession, id: string) =>
    apiRequest<Counterparty>(`/counterparties/${id}`, withAuth(session)),
  saveCounterparty: (
    session: UserSession,
    id: string | null,
    payload: { code: string; name: string; status: string }
  ) =>
    apiRequest<Counterparty>(id ? `/counterparties/${id}` : '/counterparties', {
      method: id ? 'PUT' : 'POST',
      body: payload,
      ...withAuth(session)
    }),

  listDirections: (session: UserSession, query: BaseFilterQuery) =>
    apiRequest<ListResponse<Direction>>(`/directions${queryString(query)}`, withAuth(session)),

  listCourses: (session: UserSession, query: BaseFilterQuery) =>
    apiRequest<ListResponse<Course>>(`/courses${queryString(query)}`, withAuth(session)),
  getCourse: (session: UserSession, id: string) =>
    apiRequest<Course>(`/courses/${id}`, withAuth(session)),
  saveCourse: (
    session: UserSession,
    id: string | null,
    payload: { code?: string; title: string; description?: string; directionId?: string }
  ) =>
    apiRequest<Course>(id ? `/courses/${id}` : '/courses', {
      method: id ? 'PUT' : 'POST',
      body: payload,
      ...withAuth(session)
    }),
  publishCourse: (session: UserSession, id: string) =>
    apiRequest<Course>(`/courses/${id}/publish`, { method: 'POST', ...withAuth(session) }),
  archiveCourse: (session: UserSession, id: string) =>
    apiRequest<Course>(`/courses/${id}/archive`, { method: 'POST', ...withAuth(session) }),
  listCourseVersions: (session: UserSession, courseId: string) =>
    apiRequest<ListResponse<CourseVersion>>(
      `/course-versions${queryString({ course_id: courseId })}`,
      withAuth(session)
    ),
  createCourseVersion: (session: UserSession, courseId: string) =>
    apiRequest<CourseVersion>(`/course-versions/${courseId}`, {
      method: 'POST',
      ...withAuth(session)
    }),

  listModules: (session: UserSession, courseVersionId?: string) =>
    apiRequest<ListResponse<CourseModule>>(
      `/modules${queryString({ course_version_id: courseVersionId })}`,
      withAuth(session)
    ),
  saveModule: (
    session: UserSession,
    id: string | null,
    payload: {
      courseVersionId?: string;
      title: string;
      minViewSeconds?: number;
      isRequired?: boolean;
    }
  ) =>
    apiRequest<CourseModule>(id ? `/modules/${id}` : '/modules', {
      method: id ? 'PUT' : 'POST',
      body: payload,
      ...withAuth(session)
    }),
  listMaterials: (session: UserSession, moduleId?: string) =>
    apiRequest<ListResponse<Material>>(
      `/materials${queryString({ module_id: moduleId })}`,
      withAuth(session)
    ),
  saveMaterial: (
    session: UserSession,
    id: string | null,
    payload: {
      moduleId?: string;
      title: string;
      materialType: string;
      minViewSeconds?: number;
      isRequired?: boolean;
    }
  ) =>
    apiRequest<Material>(id ? `/materials/${id}` : '/materials', {
      method: id ? 'PUT' : 'POST',
      body: payload,
      ...withAuth(session)
    }),

  listGroups: (session: UserSession, query: BaseFilterQuery) =>
    apiRequest<ListResponse<Group>>(`/groups${queryString(query)}`, withAuth(session)),
  getGroup: (session: UserSession, id: string) =>
    apiRequest<Group>(`/groups/${id}`, withAuth(session)),
  saveGroup: (
    session: UserSession,
    id: string | null,
    payload: { code: string; name: string; status: string }
  ) =>
    apiRequest<Group>(id ? `/groups/${id}` : '/groups', {
      method: id ? 'PUT' : 'POST',
      body: payload,
      ...withAuth(session)
    }),
  listGroupCourses: (session: UserSession, groupId: string) =>
    apiRequest<ListResponse<GroupCourse>>(
      `/group-courses${queryString({ group_id: groupId })}`,
      withAuth(session)
    ),
  createGroupCourse: (session: UserSession, payload: { groupId: string; courseId: string }) =>
    apiRequest<GroupCourse>('/group-courses', {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    }),
  listEnrollments: (session: UserSession, query: BaseFilterQuery) =>
    apiRequest<ListResponse<Enrollment>>(`/enrollments${queryString(query)}`, withAuth(session)),
  createEnrollment: (session: UserSession, payload: { groupId: string; learnerId: string }) =>
    apiRequest<Enrollment>('/enrollments', { method: 'POST', body: payload, ...withAuth(session) }),
  createBulkEnrollments: (
    session: UserSession,
    payload: {
      idempotencyKey: string;
      groupId: string;
      learnerIds?: string[];
      organizationUnitId?: string;
      deliveryMode?: 'immediate' | 'queued';
    }
  ) =>
    apiRequest<BulkEnrollmentsOutcome | BulkEnrollmentsQueuedResponse>('/enrollments/bulk', {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    }),
  getKpiSnapshot: (session: UserSession, query: KpiFilterQuery) =>
    apiRequest<KpiSnapshot>(`/reports/kpi-snapshot${queryString(query)}`, withAuth(session)),
  listEnrollmentCertificates: (session: UserSession, enrollmentId: string) =>
    apiRequest<{ items: EnrollmentCertificateRow[] }>(
      `/enrollments/${enrollmentId}/certificates`,
      withAuth(session)
    ),
  updateEnrollmentStatus: (session: UserSession, id: string, status: Enrollment['status']) =>
    apiRequest<Enrollment>(`/enrollments/${id}/status`, {
      method: 'PATCH',
      body: { status },
      ...withAuth(session)
    }),

  listProgress: (session: UserSession, query: BaseFilterQuery) =>
    apiRequest<ListResponse<Progress>>(`/progress${queryString(query)}`, withAuth(session)),
  listQuestionBanks: (session: UserSession, query: BaseFilterQuery) =>
    apiRequest<ListResponse<QuestionBank>>(
      `/question-banks${queryString(query)}`,
      withAuth(session)
    ),
  listTests: (session: UserSession, query: BaseFilterQuery) =>
    apiRequest<ListResponse<TestEntity>>(`/tests${queryString(query)}`, withAuth(session)),
  listAttempts: (session: UserSession, query: BaseFilterQuery) =>
    apiRequest<ListResponse<Attempt>>(`/attempts${queryString(query)}`, withAuth(session)),
  listExamResults: (session: UserSession, query: BaseFilterQuery) =>
    apiRequest<ListResponse<ExamResult>>(`/exam-results${queryString(query)}`, withAuth(session)),
  startAttempt: (
    session: UserSession,
    payload: { testId: string; enrollmentId: string; learnerId: string }
  ) =>
    apiRequest<Attempt>('/attempts/start', { method: 'POST', body: payload, ...withAuth(session) }),
  getAttemptResult: (session: UserSession, attemptId: string) =>
    apiRequest<ExamResult>(`/attempts/${attemptId}/result`, withAuth(session)),
  listAssignments: (session: UserSession, query: BaseFilterQuery) =>
    apiRequest<ListResponse<Assignment>>(`/assignments${queryString(query)}`, withAuth(session)),
  listAssignmentSubmissions: (session: UserSession, query: BaseFilterQuery) =>
    apiRequest<ListResponse<AssignmentSubmission>>(
      `/assignment-submissions${queryString(query)}`,
      withAuth(session)
    ),
  listAssignmentReviews: (session: UserSession, query: BaseFilterQuery) =>
    apiRequest<ListResponse<AssignmentReview>>(
      `/assignment-reviews${queryString(query)}`,
      withAuth(session)
    ),
  saveQuestionBank: (
    session: UserSession,
    id: string | null,
    payload: { code?: string; title: string; description?: string }
  ) =>
    apiRequest<QuestionBank>(id ? `/question-banks/${id}` : '/question-banks', {
      method: id ? 'PATCH' : 'POST',
      body: payload,
      ...withAuth(session)
    }),
  listQuestions: (session: UserSession, query: BaseFilterQuery) =>
    apiRequest<ListResponse<Question>>(`/questions${queryString(query)}`, withAuth(session)),
  saveQuestion: (session: UserSession, id: string | null, payload: Record<string, unknown>) =>
    apiRequest<Question>(id ? `/questions/${id}` : '/questions', {
      method: id ? 'PATCH' : 'POST',
      body: payload,
      ...withAuth(session)
    }),
  saveTest: (session: UserSession, id: string | null, payload: Record<string, unknown>) =>
    apiRequest<TestEntity>(id ? `/tests/${id}` : '/tests', {
      method: id ? 'PATCH' : 'POST',
      body: payload,
      ...withAuth(session)
    }),
  publishTest: (session: UserSession, id: string) =>
    apiRequest<TestEntity>(`/tests/${id}/publish`, { method: 'POST', ...withAuth(session) }),
  saveAttemptAnswer: (session: UserSession, attemptId: string, payload: Record<string, unknown>) =>
    apiRequest(`/attempts/${attemptId}/answers`, {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    }),
  submitAttempt: (session: UserSession, attemptId: string) =>
    apiRequest<Attempt>(`/attempts/${attemptId}/submit`, { method: 'POST', ...withAuth(session) }),
  saveAssignment: (session: UserSession, id: string | null, payload: Record<string, unknown>) =>
    apiRequest<Assignment>(id ? `/assignments/${id}` : '/assignments', {
      method: id ? 'PATCH' : 'POST',
      body: payload,
      ...withAuth(session)
    }),
  createAssignmentSubmission: (session: UserSession, payload: Record<string, unknown>) =>
    apiRequest<AssignmentSubmission>('/assignment-submissions', {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    }),
  submitAssignmentSubmission: (session: UserSession, submissionId: string) =>
    apiRequest<AssignmentSubmission>(`/assignment-submissions/${submissionId}/submit`, {
      method: 'POST',
      ...withAuth(session)
    }),
  createAssignmentReview: (session: UserSession, payload: Record<string, unknown>) =>
    apiRequest<AssignmentReview>('/assignment-reviews', {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    }),
  updateAssignmentReview: (
    session: UserSession,
    reviewId: string,
    payload: {
      score?: number;
      comment?: string;
      reviewStatus?: 'pending' | 'in_review' | 'completed';
    }
  ) =>
    apiRequest<AssignmentReview>(`/assignment-reviews/${reviewId}`, {
      method: 'PATCH',
      body: payload,
      ...withAuth(session)
    }),
  completeAssignmentReview: (
    session: UserSession,
    reviewId: string,
    payload: { score?: number; comment?: string }
  ) =>
    apiRequest<AssignmentReview>(`/assignment-reviews/${reviewId}/complete`, {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    }),

  // === Pillar A — Plan A (§5.2): commissions ===
  listCommissions: (session: UserSession, status?: CommissionStatus) =>
    apiRequest<{ items: Commission[] }>(
      `/commissions${status ? `?status=${status}` : ''}`,
      withAuth(session)
    ),
  getCommission: (session: UserSession, id: string) =>
    apiRequest<CommissionWithMembers>(`/commissions/${id}`, withAuth(session)),
  createCommission: (
    session: UserSession,
    payload: { code: string; name: string; description?: string }
  ) =>
    apiRequest<Commission>('/commissions', {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    }),
  updateCommission: (
    session: UserSession,
    id: string,
    payload: { name?: string; description?: string }
  ) =>
    apiRequest<Commission>(`/commissions/${id}`, {
      method: 'PATCH',
      body: payload,
      ...withAuth(session)
    }),
  archiveCommission: (session: UserSession, id: string) =>
    apiRequest<Commission>(`/commissions/${id}/archive`, {
      method: 'POST',
      ...withAuth(session)
    }),
  addCommissionMember: (
    session: UserSession,
    commissionId: string,
    payload: {
      role: CommissionMemberRole;
      userId?: string;
      externalFullName?: string;
      externalPosition?: string;
      signatureFileId?: string;
      positionInOrder: number;
    }
  ) =>
    apiRequest<CommissionMember>(`/commissions/${commissionId}/members`, {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    }),
  removeCommissionMember: (session: UserSession, commissionId: string, memberId: string) =>
    apiRequest<{ ok: true }>(`/commissions/${commissionId}/members/${memberId}`, {
      method: 'DELETE',
      ...withAuth(session)
    }),

  // === Pillar A — Plan A (§5.1): program meta + course version publish ===
  updateCourseVersionProgramMeta: (
    session: UserSession,
    courseVersionId: string,
    payload: ProgramMetaPatch
  ) =>
    apiRequest<CourseVersion>(`/course-versions/${courseVersionId}/program-meta`, {
      method: 'PATCH',
      body: payload,
      ...withAuth(session)
    }),
  publishCourseVersion: (session: UserSession, courseVersionId: string) =>
    apiRequest<CourseVersion>(`/course-versions/${courseVersionId}/publish`, {
      method: 'POST',
      ...withAuth(session)
    }),

  // === Pillar A — Plan A (§5.3): course document sets ===
  getCourseDocumentSet: (session: UserSession, courseVersionId: string) =>
    apiRequest<{ items: CourseDocumentSetEntry[] }>(
      `/course-versions/${courseVersionId}/document-set`,
      withAuth(session)
    ),
  setCourseDocumentSet: (
    session: UserSession,
    courseVersionId: string,
    entries: CourseDocumentSetEntryDraft[]
  ) =>
    apiRequest<{ items: CourseDocumentSetEntry[] }>(
      `/course-versions/${courseVersionId}/document-set`,
      {
        method: 'PUT',
        body: { entries },
        ...withAuth(session)
      }
    )
};
