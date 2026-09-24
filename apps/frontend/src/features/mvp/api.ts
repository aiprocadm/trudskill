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
  CoursePayload,
  CourseVersion,
  Direction,
  Enrollment,
  EnrollmentCertificateRow,
  EnrollmentResultCode,
  ExamResult,
  FrdoDocumentKind,
  Group,
  GroupCourse,
  GroupPayload,
  GroupWizardOutcome,
  GroupWizardRequest,
  GroupsListQuery,
  InviteUserOutcome,
  InviteUserPayload,
  KpiFilterQuery,
  KpiSnapshot,
  Learner,
  ListResponse,
  Material,
  PortalDocument,
  ProgramMetaPatch,
  Progress,
  Question,
  QuestionBank,
  RegulatoryAct,
  RoleEntity,
  SessionDto,
  TestEntity,
  UserEntity,
  UsersListQuery
} from './types';
import type { UserSession } from '../../entities/session/model';

/**
 * Фаза 6 Task 1 (дефект D) — строка «моего» зачисления из `GET /me/enrollments`.
 *
 * Название курса приходит с сервера вместе с `courseId`: у зачисления своего курса нет,
 * он висит на группе, а прав ходить за связкой «группа → курс» у слушателя нет.
 */
export interface MyEnrollmentRow extends Enrollment {
  courseTitle?: string;
}

export const withAuth = (session: UserSession) => ({
  auth: {
    userId: session.user.id,
    tenantId: session.user.tenantId,
    accessToken: session.tokens.accessToken
  }
});

export const queryString = (query: BaseFilterQuery = {}) => {
  const search = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== '') search.set(key, String(value));
  });
  return search.toString() ? `?${search.toString()}` : '';
};

export const mvpApi = {
  listUsers: (session: UserSession, query: UsersListQuery) =>
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
  /* МГ-J3.2: приглашение сотрудника одной ручкой — учётка, роли, письмо со ссылкой входа. */
  inviteUser: (session: UserSession, payload: InviteUserPayload) =>
    apiRequest<InviteUserOutcome>('/users/invite', {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    }),
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

  // ФТ-E5 (Фаза 4 Task 1, срез 3) — портал заказчика: отдельные ручки под правом
  // portal.read; сервер скоупит выдачу по контрагенту представителя.
  listPortalLearners: (session: UserSession, query: BaseFilterQuery) =>
    apiRequest<ListResponse<Learner>>(`/portal/learners${queryString(query)}`, withAuth(session)),
  listPortalGroups: (session: UserSession, query: BaseFilterQuery) =>
    apiRequest<ListResponse<Group>>(`/portal/groups${queryString(query)}`, withAuth(session)),
  /**
   * Порция 32 (журнал 265): скачивание документа сотрудника. Ручка с проверкой владения
   * и записью в журнал существовала с ФТ-E5, но в портале не было кнопки — представитель
   * компании видел список и не мог взять сам документ.
   */
  downloadPortalDocument: (session: UserSession, documentId: string) =>
    apiRequest<{ downloadUrl: string }>(
      `/portal/documents/${documentId}/download`,
      withAuth(session)
    ),
  listPortalDocuments: (session: UserSession, query: BaseFilterQuery) =>
    apiRequest<ListResponse<PortalDocument>>(
      `/portal/documents${queryString(query)}`,
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
  /** МГ-E2.1 (срез 16.3): «Основное» курса — поля карточки CDOPROF. */
  updateCourse: (session: UserSession, id: string, payload: CoursePayload) =>
    apiRequest<Course>(`/courses/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: payload,
      ...withAuth(session)
    }),
  listFrdoDocumentKinds: (session: UserSession) =>
    apiRequest<{ items: FrdoDocumentKind[] }>('/frdo-document-kinds', withAuth(session)),
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
  /**
   * ТЗ 8.4: порядок модулей версии. Список приходит ЦЕЛИКОМ, а не сдвигом по одному —
   * повтор запроса после обрыва связи тогда ничего не ломает.
   */
  reorderModules: (session: UserSession, courseVersionId: string, ids: string[]) =>
    apiRequest<CourseModule[]>(`/course-versions/${courseVersionId}/modules/order`, {
      method: 'PUT',
      body: { ids },
      ...withAuth(session)
    }),
  /** ТЗ 8.4: порядок материалов внутри модуля. Правило то же. */
  reorderMaterials: (session: UserSession, moduleId: string, ids: string[]) =>
    apiRequest<Material[]>(`/modules/${moduleId}/materials/order`, {
      method: 'PUT',
      body: { ids },
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
      scormPackageId?: string;
      /** ТЗ 2.5.a: тело текстового материала. */
      textBody?: string;
      /** ТЗ 2.5.a: адрес внешнего материала. */
      externalUrl?: string;
    }
  ) =>
    apiRequest<Material>(id ? `/materials/${id}` : '/materials', {
      method: id ? 'PUT' : 'POST',
      body: payload,
      ...withAuth(session)
    }),

  listGroups: (session: UserSession, query: GroupsListQuery) =>
    apiRequest<ListResponse<Group>>(`/groups${queryString(query)}`, withAuth(session)),
  getGroup: (session: UserSession, id: string) =>
    apiRequest<Group>(`/groups/${id}`, withAuth(session)),
  saveGroup: (session: UserSession, id: string | null, payload: GroupPayload) =>
    apiRequest<Group>(id ? `/groups/${id}` : '/groups', {
      method: id ? 'PUT' : 'POST',
      body: payload,
      ...withAuth(session)
    }),
  /* МГ-B3.1: ручной переход статуса — только на соседний; сервер отвечает 409 с перечнем. */
  setGroupStatus: (
    session: UserSession,
    id: string,
    payload: { status: string; reason?: string }
  ) =>
    apiRequest<Group>(`/groups/${id}/status`, {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    }),
  /* МГ-B6.2: в архив — только закрытую или отменённую. */
  archiveGroup: (session: UserSession, id: string) =>
    apiRequest<Group>(`/groups/${id}/archive`, { method: 'POST', body: {}, ...withAuth(session) }),
  /* МГ-B2 (срез 8.4): мастер группы одной транзакцией — группа, курсы, слушатели, зачисления. */
  completeGroupWizard: (session: UserSession, payload: GroupWizardRequest) =>
    apiRequest<GroupWizardOutcome>('/groups/wizard', {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    }),
  /* МГ-B1.2: какой код получит новая группа — предзаполнение шага 1 мастера. */
  nextGroupCode: (session: UserSession) =>
    apiRequest<{ code: string }>('/groups/next-code', withAuth(session)),
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
  /**
   * Зачисления текущего пользователя-слушателя. Фильтровать общий `/enrollments` по
   * `learner_id` для этого нельзя: фронт знает идентификатор пользователя IAM, а в
   * зачислении лежит идентификатор карточки слушателя — это разные ключи.
   */
  listMyEnrollments: (session: UserSession) =>
    apiRequest<{ items: MyEnrollmentRow[] }>('/me/enrollments', withAuth(session)),
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
  /* МГ-B7.1 (РМ62): причина отчисления уходит в историю статусов. */
  updateEnrollmentStatus: (
    session: UserSession,
    id: string,
    status: Enrollment['status'],
    reason?: string
  ) =>
    apiRequest<Enrollment>(`/enrollments/${id}/status`, {
      method: 'PATCH',
      body: { status, ...(reason ? { reason } : {}) },
      ...withAuth(session)
    }),
  /* МГ-B7.1 (РМ61, РМ64): «Отметить неявку» / снять — итог, не статус. */
  markEnrollmentResult: (
    session: UserSession,
    id: string,
    payload: { resultCode: EnrollmentResultCode | null; reason?: string }
  ) =>
    apiRequest<Enrollment>(`/enrollments/${id}/result`, {
      method: 'PATCH',
      body: payload,
      ...withAuth(session)
    }),

  listProgress: (session: UserSession, query: BaseFilterQuery) =>
    apiRequest<ListResponse<Progress>>(`/progress${queryString(query)}`, withAuth(session)),
  updateMaterialProgress: (
    session: UserSession,
    materialId: string,
    payload: { enrollmentId: string; studiedSeconds: number }
  ) =>
    apiRequest<Progress>(`/progress/materials/${materialId}`, {
      method: 'PATCH',
      body: payload,
      ...withAuth(session)
    }),
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
    ),

  // === Pillar A — Plan A (§5.5): regulatory acts lookup ===
  listRegulatoryActs: (session: UserSession) =>
    apiRequest<{ items: RegulatoryAct[] }>('/regulatory-acts', withAuth(session)),

  // === Document templates (используется в Pillar A document-set tab) ===
  listDocumentTemplates: (session: UserSession) =>
    apiRequest<
      ListResponse<{
        id: string;
        name: string;
        templateType: string;
        description?: string;
        status: string;
      }>
    >('/templates', withAuth(session))
};
