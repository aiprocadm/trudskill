import { apiRequest } from '../../lib/api/client';
import type { UserSession } from '../../entities/session/model';
import type {
  BaseFilterQuery,
  Counterparty,
  Course,
  CourseModule,
  CourseVersion,
  Direction,
  Enrollment,
  Group,
  GroupCourse,
  ListResponse,
  Material,
  Progress,
  QuestionBank,
  TestEntity,
  Attempt,
  ExamResult,
  Assignment,
  RoleEntity,
  UserEntity
} from './types';

const withAuth = (session: UserSession) => ({
  auth: { userId: session.user.id, tenantId: session.user.tenantId, accessToken: session.tokens.accessToken }
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
  getUser: (session: UserSession, id: string) => apiRequest<UserEntity>(`/users/${id}`, withAuth(session)),
  getUserRoles: (session: UserSession, id: string) => apiRequest<RoleEntity[]>(`/users/${id}/roles`, withAuth(session)),
  listRoles: (session: UserSession) => apiRequest<RoleEntity[]>('/roles', withAuth(session)),
  setUserRoles: (session: UserSession, id: string, roleCodes: string[]) =>
    apiRequest<RoleEntity[]>(`/users/${id}/roles`, { method: 'PUT', body: { roleCodes }, ...withAuth(session) }),

  listCounterparties: (session: UserSession, query: BaseFilterQuery) =>
    apiRequest<ListResponse<Counterparty>>(`/counterparties${queryString(query)}`, withAuth(session)),
  getCounterparty: (session: UserSession, id: string) => apiRequest<Counterparty>(`/counterparties/${id}`, withAuth(session)),
  saveCounterparty: (session: UserSession, id: string | null, payload: { code: string; name: string; status: string }) =>
    apiRequest<Counterparty>(id ? `/counterparties/${id}` : '/counterparties', {
      method: id ? 'PUT' : 'POST',
      body: payload,
      ...withAuth(session)
    }),

  listDirections: (session: UserSession, query: BaseFilterQuery) =>
    apiRequest<ListResponse<Direction>>(`/directions${queryString(query)}`, withAuth(session)),

  listCourses: (session: UserSession, query: BaseFilterQuery) =>
    apiRequest<ListResponse<Course>>(`/courses${queryString(query)}`, withAuth(session)),
  getCourse: (session: UserSession, id: string) => apiRequest<Course>(`/courses/${id}`, withAuth(session)),
  saveCourse: (session: UserSession, id: string | null, payload: { code?: string; title: string; description?: string; directionId?: string }) =>
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
    apiRequest<ListResponse<CourseVersion>>(`/course-versions${queryString({ course_id: courseId })}`, withAuth(session)),
  createCourseVersion: (session: UserSession, courseId: string) =>
    apiRequest<CourseVersion>(`/course-versions/${courseId}`, { method: 'POST', ...withAuth(session) }),

  listModules: (session: UserSession, courseVersionId?: string) =>
    apiRequest<ListResponse<CourseModule>>(`/modules${queryString({ course_version_id: courseVersionId })}`, withAuth(session)),
  saveModule: (
    session: UserSession,
    id: string | null,
    payload: { courseVersionId?: string; title: string; minViewSeconds?: number; isRequired?: boolean }
  ) =>
    apiRequest<CourseModule>(id ? `/modules/${id}` : '/modules', {
      method: id ? 'PUT' : 'POST',
      body: payload,
      ...withAuth(session)
    }),
  listMaterials: (session: UserSession, moduleId?: string) =>
    apiRequest<ListResponse<Material>>(`/materials${queryString({ module_id: moduleId })}`, withAuth(session)),
  saveMaterial: (
    session: UserSession,
    id: string | null,
    payload: { moduleId?: string; title: string; materialType: string; minViewSeconds?: number; isRequired?: boolean }
  ) =>
    apiRequest<Material>(id ? `/materials/${id}` : '/materials', {
      method: id ? 'PUT' : 'POST',
      body: payload,
      ...withAuth(session)
    }),

  listGroups: (session: UserSession, query: BaseFilterQuery) =>
    apiRequest<ListResponse<Group>>(`/groups${queryString(query)}`, withAuth(session)),
  getGroup: (session: UserSession, id: string) => apiRequest<Group>(`/groups/${id}`, withAuth(session)),
  saveGroup: (session: UserSession, id: string | null, payload: { code: string; name: string; status: string }) =>
    apiRequest<Group>(id ? `/groups/${id}` : '/groups', {
      method: id ? 'PUT' : 'POST',
      body: payload,
      ...withAuth(session)
    }),
  listGroupCourses: (session: UserSession, groupId: string) =>
    apiRequest<ListResponse<GroupCourse>>(`/group-courses${queryString({ group_id: groupId })}`, withAuth(session)),
  createGroupCourse: (session: UserSession, payload: { groupId: string; courseId: string }) =>
    apiRequest<GroupCourse>('/group-courses', { method: 'POST', body: payload, ...withAuth(session) }),
  listEnrollments: (session: UserSession, query: BaseFilterQuery) =>
    apiRequest<ListResponse<Enrollment>>(`/enrollments${queryString(query)}`, withAuth(session)),
  createEnrollment: (session: UserSession, payload: { groupId: string; learnerId: string }) =>
    apiRequest<Enrollment>('/enrollments', { method: 'POST', body: payload, ...withAuth(session) }),
  updateEnrollmentStatus: (session: UserSession, id: string, status: Enrollment['status']) =>
    apiRequest<Enrollment>(`/enrollments/${id}/status`, { method: 'PATCH', body: { status }, ...withAuth(session) }),

  listProgress: (session: UserSession, query: BaseFilterQuery) =>
    apiRequest<ListResponse<Progress>>(`/progress${queryString(query)}`, withAuth(session)),
  listQuestionBanks: (session: UserSession, query: BaseFilterQuery) =>
    apiRequest<ListResponse<QuestionBank>>(`/question-banks${queryString(query)}`, withAuth(session)),
  listTests: (session: UserSession, query: BaseFilterQuery) =>
    apiRequest<ListResponse<TestEntity>>(`/tests${queryString(query)}`, withAuth(session)),
  startAttempt: (session: UserSession, payload: { testId: string; enrollmentId: string; learnerId: string }) =>
    apiRequest<Attempt>('/attempts/start', { method: 'POST', body: payload, ...withAuth(session) }),
  getAttemptResult: (session: UserSession, attemptId: string) =>
    apiRequest<ExamResult>(`/attempts/${attemptId}/result`, withAuth(session)),
  listAssignments: (session: UserSession, query: BaseFilterQuery) =>
    apiRequest<ListResponse<Assignment>>(`/assignments${queryString(query)}`, withAuth(session))
};
