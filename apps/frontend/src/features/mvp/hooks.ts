'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import { mvpApi } from './api';
import { pushGlobalSuccessToast } from '../../lib/toast/global-handlers';
import { useAuth } from '../auth/context';

import type { BaseFilterQuery } from './types';

const useMvpQuery = <T>(
  scope: string,
  args: unknown,
  call: (session: NonNullable<ReturnType<typeof useAuth>['session']>) => Promise<T>
) => {
  const { session } = useAuth();
  const query = useQuery({
    queryKey: ['mvp', scope, args],
    enabled: Boolean(session),
    queryFn: () => call(session!)
  });

  return {
    data: query.data ?? null,
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    refetch: async () => {
      await query.refetch();
    }
  };
};

export const useUsersList = (query: BaseFilterQuery) =>
  useMvpQuery('users', query, (s) => mvpApi.listUsers(s, query));
export const useUser = (id: string) => useMvpQuery('user', id, (s) => mvpApi.getUser(s, id));
export const useRoles = () => useMvpQuery('roles', null, (s) => mvpApi.listRoles(s));
export const useUserRoles = (id: string) =>
  useMvpQuery('userRoles', id, (s) => mvpApi.getUserRoles(s, id));
export const useUserSessions = (id: string) =>
  useMvpQuery('userSessions', id, (s) => mvpApi.listUserSessions(s, id));
export const useCounterpartiesList = (query: BaseFilterQuery) =>
  useMvpQuery('counterparties', query, (s) => mvpApi.listCounterparties(s, query));
export const useCounterparty = (id: string) =>
  useMvpQuery('counterparty', id, (s) => mvpApi.getCounterparty(s, id));
export const useDirectionsList = (query: BaseFilterQuery) =>
  useMvpQuery('directions', query, (s) => mvpApi.listDirections(s, query));
export const useCoursesList = (query: BaseFilterQuery) =>
  useMvpQuery('courses', query, (s) => mvpApi.listCourses(s, query));
export const useCourse = (id: string) => useMvpQuery('course', id, (s) => mvpApi.getCourse(s, id));
export const useCourseVersions = (courseId: string) =>
  useMvpQuery('courseVersions', courseId, (s) => mvpApi.listCourseVersions(s, courseId));
export const useModules = (courseVersionId?: string) =>
  useMvpQuery('modules', courseVersionId, (s) => mvpApi.listModules(s, courseVersionId));
export const useMaterials = (moduleId?: string) =>
  useMvpQuery('materials', moduleId, (s) => mvpApi.listMaterials(s, moduleId));
export const useGroupsList = (query: BaseFilterQuery) =>
  useMvpQuery('groups', query, (s) => mvpApi.listGroups(s, query));
export const useGroup = (id: string) => useMvpQuery('group', id, (s) => mvpApi.getGroup(s, id));
export const useGroupCourses = (groupId: string) =>
  useMvpQuery('groupCourses', groupId, (s) => mvpApi.listGroupCourses(s, groupId));
export const useEnrollments = (query: BaseFilterQuery) =>
  useMvpQuery('enrollments', query, (s) => mvpApi.listEnrollments(s, query));
export const useLearnerCourses = (learnerId: string) => useEnrollments({ learner_id: learnerId });
export const useLearnerCourseProgress = (courseId?: string) =>
  useMvpQuery('progress', courseId, (s) => mvpApi.listProgress(s, { course_id: courseId }));
export const useQuestionBanks = (query: BaseFilterQuery) =>
  useMvpQuery('questionBanks', query, (s) => mvpApi.listQuestionBanks(s, query));
export const useTests = (query: BaseFilterQuery) =>
  useMvpQuery('tests', query, (s) => mvpApi.listTests(s, query));
export const useAssignments = (query: BaseFilterQuery) =>
  useMvpQuery('assignments', query, (s) => mvpApi.listAssignments(s, query));
export const useAttempts = (query: BaseFilterQuery) =>
  useMvpQuery('attempts', query, (s) => mvpApi.listAttempts(s, query));
export const useExamResults = (query: BaseFilterQuery) =>
  useMvpQuery('examResults', query, (s) => mvpApi.listExamResults(s, query));
export const useAssignmentSubmissions = (query: BaseFilterQuery) =>
  useMvpQuery('assignmentSubmissions', query, (s) => mvpApi.listAssignmentSubmissions(s, query));
export const useAssignmentReviews = (query: BaseFilterQuery) =>
  useMvpQuery('assignmentReviews', query, (s) => mvpApi.listAssignmentReviews(s, query));

export const useDomainMutations = () => {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  const wrap = async <T>(
    action: (sessionValue: NonNullable<typeof session>) => Promise<T>,
    silentSuccessToast = false
  ) => {
    if (!session) throw new Error('Нет активной сессии');
    const result = await action(session);
    if (!silentSuccessToast) {
      pushGlobalSuccessToast('Готово', 'Изменения сохранены');
    }
    await queryClient.invalidateQueries({ queryKey: ['mvp'] });
    return result;
  };

  return {
    saveCounterparty: (
      id: string | null,
      payload: { code: string; name: string; status: string }
    ) => wrap((authSession) => mvpApi.saveCounterparty(authSession, id, payload)),
    saveCourse: (
      id: string | null,
      payload: { code?: string; title: string; description?: string; directionId?: string }
    ) => wrap((authSession) => mvpApi.saveCourse(authSession, id, payload)),
    publishCourse: (id: string) => wrap((authSession) => mvpApi.publishCourse(authSession, id)),
    archiveCourse: (id: string) => wrap((authSession) => mvpApi.archiveCourse(authSession, id)),
    createCourseVersion: (courseId: string) =>
      wrap((authSession) => mvpApi.createCourseVersion(authSession, courseId)),
    saveModule: (
      id: string | null,
      payload: {
        courseVersionId?: string;
        title: string;
        minViewSeconds?: number;
        isRequired?: boolean;
      }
    ) => wrap((authSession) => mvpApi.saveModule(authSession, id, payload)),
    saveMaterial: (
      id: string | null,
      payload: {
        moduleId?: string;
        title: string;
        materialType: string;
        minViewSeconds?: number;
        isRequired?: boolean;
      }
    ) => wrap((authSession) => mvpApi.saveMaterial(authSession, id, payload)),
    saveGroup: (id: string | null, payload: { code: string; name: string; status: string }) =>
      wrap((authSession) => mvpApi.saveGroup(authSession, id, payload)),
    createGroupCourse: (payload: { groupId: string; courseId: string }) =>
      wrap((authSession) => mvpApi.createGroupCourse(authSession, payload)),
    createEnrollment: (payload: { groupId: string; learnerId: string }) =>
      wrap((authSession) => mvpApi.createEnrollment(authSession, payload)),
    setUserRoles: (id: string, roleCodes: string[]) =>
      wrap((authSession) => mvpApi.setUserRoles(authSession, id, roleCodes)),
    revokeSession: (sessionId: string) =>
      wrap((authSession) => mvpApi.revokeSession(authSession, sessionId)),
    startAttempt: (payload: { testId: string; enrollmentId: string; learnerId: string }) =>
      wrap((authSession) => mvpApi.startAttempt(authSession, payload)),
    getAttemptResult: (attemptId: string) =>
      wrap((authSession) => mvpApi.getAttemptResult(authSession, attemptId), true),
    createAssignmentReview: (payload: Record<string, unknown>) =>
      wrap((authSession) => mvpApi.createAssignmentReview(authSession, payload)),
    updateAssignmentReview: (
      reviewId: string,
      payload: {
        score?: number;
        comment?: string;
        reviewStatus?: 'pending' | 'in_review' | 'completed';
      }
    ) => wrap((authSession) => mvpApi.updateAssignmentReview(authSession, reviewId, payload)),
    completeAssignmentReview: (reviewId: string, payload: { score?: number; comment?: string }) =>
      wrap((authSession) => mvpApi.completeAssignmentReview(authSession, reviewId, payload))
  };
};
