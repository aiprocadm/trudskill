'use client';

import { useCallback, useEffect, useState } from 'react';

import { mvpApi } from './api';
import { ApiClientError } from '../../lib/api/client';
import { useInvalidateQuery, useQueryCache } from '../../lib/query/provider';
import { useAuth } from '../auth/context';

import type { BaseFilterQuery } from './types';

interface QueryState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}
const makeQueryKey = (scope: string, args?: unknown) => `${scope}:${JSON.stringify(args ?? null)}`;
const getErrorMessage = (error: unknown): string =>
  error instanceof ApiClientError
    ? error.normalized.message
    : error instanceof Error
      ? error.message
      : 'Не удалось выполнить запрос.';

const useQueryState = <T>(queryKey: string, loader: (() => Promise<T>) | null): QueryState<T> => {
  const cache = useQueryCache();
  const cacheEntry = cache.get<T>(queryKey);
  const [data, setData] = useState<T | null>(cacheEntry?.data ?? null);
  const [loading, setLoading] = useState(!cacheEntry);
  const [error, setError] = useState<string | null>(cacheEntry?.error ?? null);

  const refetch = useCallback(async () => {
    if (!loader) return;
    setLoading(true);
    setError(null);
    try {
      const nextData = await loader();
      cache.set(queryKey, { data: nextData, updatedAt: Date.now() });
      setData(nextData);
    } catch (err) {
      const message = getErrorMessage(err);
      setError(message);
      cache.set(queryKey, { error: message, updatedAt: Date.now() });
    } finally {
      setLoading(false);
    }
  }, [cache, loader, queryKey]);

  useEffect(() => {
    const nextEntry = cache.get<T>(queryKey);
    if (nextEntry?.data) {
      setData(nextEntry.data);
      setError(nextEntry.error ?? null);
      setLoading(false);
      return;
    }
    void refetch();
  }, [cache.version, queryKey, refetch]);

  return { data, loading, error, refetch };
};

const useMvp = <T>(
  scope: string,
  args: unknown,
  call: (session: NonNullable<ReturnType<typeof useAuth>['session']>) => Promise<T>
) => {
  const { session } = useAuth();
  return useQueryState(makeQueryKey(scope, args), session ? () => call(session) : null);
};

export const useUsersList = (query: BaseFilterQuery) =>
  useMvp('users', query, (s) => mvpApi.listUsers(s, query));
export const useUser = (id: string) => useMvp('user', id, (s) => mvpApi.getUser(s, id));
export const useRoles = () => useMvp('roles', null, (s) => mvpApi.listRoles(s));
export const useUserRoles = (id: string) =>
  useMvp('userRoles', id, (s) => mvpApi.getUserRoles(s, id));
export const useCounterpartiesList = (query: BaseFilterQuery) =>
  useMvp('counterparties', query, (s) => mvpApi.listCounterparties(s, query));
export const useCounterparty = (id: string) =>
  useMvp('counterparty', id, (s) => mvpApi.getCounterparty(s, id));
export const useDirectionsList = (query: BaseFilterQuery) =>
  useMvp('directions', query, (s) => mvpApi.listDirections(s, query));
export const useCoursesList = (query: BaseFilterQuery) =>
  useMvp('courses', query, (s) => mvpApi.listCourses(s, query));
export const useCourse = (id: string) => useMvp('course', id, (s) => mvpApi.getCourse(s, id));
export const useCourseVersions = (courseId: string) =>
  useMvp('courseVersions', courseId, (s) => mvpApi.listCourseVersions(s, courseId));
export const useModules = (courseVersionId?: string) =>
  useMvp('modules', courseVersionId, (s) => mvpApi.listModules(s, courseVersionId));
export const useMaterials = (moduleId?: string) =>
  useMvp('materials', moduleId, (s) => mvpApi.listMaterials(s, moduleId));
export const useGroupsList = (query: BaseFilterQuery) =>
  useMvp('groups', query, (s) => mvpApi.listGroups(s, query));
export const useGroup = (id: string) => useMvp('group', id, (s) => mvpApi.getGroup(s, id));
export const useGroupCourses = (groupId: string) =>
  useMvp('groupCourses', groupId, (s) => mvpApi.listGroupCourses(s, groupId));
export const useEnrollments = (query: BaseFilterQuery) =>
  useMvp('enrollments', query, (s) => mvpApi.listEnrollments(s, query));
export const useLearnerCourses = (learnerId: string) => useEnrollments({ learner_id: learnerId });
export const useLearnerCourseProgress = (courseId?: string) =>
  useMvp('progress', courseId, (s) => mvpApi.listProgress(s, { course_id: courseId }));
export const useQuestionBanks = (query: BaseFilterQuery) =>
  useMvp('questionBanks', query, (s) => mvpApi.listQuestionBanks(s, query));
export const useTests = (query: BaseFilterQuery) =>
  useMvp('tests', query, (s) => mvpApi.listTests(s, query));
export const useAssignments = (query: BaseFilterQuery) =>
  useMvp('assignments', query, (s) => mvpApi.listAssignments(s, query));

export const useDomainMutations = () => {
  const { session } = useAuth();
  const invalidate = useInvalidateQuery();
  const wrap = async <T>(action: (sessionValue: NonNullable<typeof session>) => Promise<T>) => {
    if (!session) throw new Error('Нет активной сессии');
    const result = await action(session);
    invalidate();
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
    startAttempt: (payload: { testId: string; enrollmentId: string; learnerId: string }) =>
      wrap((authSession) => mvpApi.startAttempt(authSession, payload)),
    getAttemptResult: (attemptId: string) =>
      wrap((authSession) => mvpApi.getAttemptResult(authSession, attemptId))
  };
};
