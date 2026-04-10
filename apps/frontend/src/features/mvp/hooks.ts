'use client';

import { useCallback, useEffect, useState } from 'react';

import { mvpApi } from './api';
import { ApiClientError } from '../../lib/api/client';
import { useAuth } from '../auth/context';

import type {
  Assignment,
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
  RoleEntity,
  TestEntity,
  UserEntity
} from './types';

interface QueryState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

const mvpQueryCache = new Map<string, unknown>();

export const clearMvpQueryCache = () => {
  mvpQueryCache.clear();
};

const makeQueryKey = (scope: string, args?: unknown) => `${scope}:${JSON.stringify(args ?? null)}`;

const getErrorMessage = (error: unknown): string => {
  if (error instanceof ApiClientError) return error.normalized.message;
  if (error instanceof Error) return error.message;
  return 'Не удалось выполнить запрос.';
};

const useQueryState = <T>(
  queryKey: string,
  loader: (() => Promise<T>) | null,
  deps: unknown[]
): QueryState<T> => {
  const [data, setData] = useState<T | null>(
    () => (mvpQueryCache.get(queryKey) as T | undefined) ?? null
  );
  const [loading, setLoading] = useState(!mvpQueryCache.has(queryKey));
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!loader) return;
    setLoading(true);
    setError(null);
    try {
      const nextData = await loader();
      setData(nextData);
      mvpQueryCache.set(queryKey, nextData);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, deps);

  useEffect(() => {
    if (mvpQueryCache.has(queryKey)) {
      setData((mvpQueryCache.get(queryKey) as T | undefined) ?? null);
      setLoading(false);
      return;
    }
    void refetch();
  }, [queryKey, refetch]);

  return { data, loading, error, refetch };
};

export const useUsersList = (query: BaseFilterQuery): QueryState<ListResponse<UserEntity>> => {
  const { session } = useAuth();
  return useQueryState(
    makeQueryKey('users', query),
    session ? () => mvpApi.listUsers(session, query) : null,
    [session, JSON.stringify(query)]
  );
};

export const useUser = (id: string): QueryState<UserEntity> => {
  const { session } = useAuth();
  return useQueryState(
    makeQueryKey('user', id),
    session ? () => mvpApi.getUser(session, id) : null,
    [session, id]
  );
};

export const useRoles = (): QueryState<RoleEntity[]> => {
  const { session } = useAuth();
  return useQueryState(makeQueryKey('roles'), session ? () => mvpApi.listRoles(session) : null, [
    session
  ]);
};

export const useUserRoles = (id: string): QueryState<RoleEntity[]> => {
  const { session } = useAuth();
  return useQueryState(
    makeQueryKey('userRoles', id),
    session ? () => mvpApi.getUserRoles(session, id) : null,
    [session, id]
  );
};

export const useCounterpartiesList = (
  query: BaseFilterQuery
): QueryState<ListResponse<Counterparty>> => {
  const { session } = useAuth();
  return useQueryState(
    makeQueryKey('counterparties', query),
    session ? () => mvpApi.listCounterparties(session, query) : null,
    [session, JSON.stringify(query)]
  );
};

export const useCounterparty = (id: string): QueryState<Counterparty> => {
  const { session } = useAuth();
  return useQueryState(
    makeQueryKey('counterparty', id),
    session ? () => mvpApi.getCounterparty(session, id) : null,
    [session, id]
  );
};

export const useDirectionsList = (query: BaseFilterQuery): QueryState<ListResponse<Direction>> => {
  const { session } = useAuth();
  return useQueryState(
    makeQueryKey('directions', query),
    session ? () => mvpApi.listDirections(session, query) : null,
    [session, JSON.stringify(query)]
  );
};

export const useCoursesList = (query: BaseFilterQuery): QueryState<ListResponse<Course>> => {
  const { session } = useAuth();
  return useQueryState(
    makeQueryKey('courses', query),
    session ? () => mvpApi.listCourses(session, query) : null,
    [session, JSON.stringify(query)]
  );
};

export const useCourse = (id: string): QueryState<Course> => {
  const { session } = useAuth();
  return useQueryState(
    makeQueryKey('course', id),
    session ? () => mvpApi.getCourse(session, id) : null,
    [session, id]
  );
};

export const useCourseVersions = (courseId: string): QueryState<ListResponse<CourseVersion>> => {
  const { session } = useAuth();
  return useQueryState(
    makeQueryKey('courseVersions', courseId),
    session ? () => mvpApi.listCourseVersions(session, courseId) : null,
    [session, courseId]
  );
};

export const useModules = (courseVersionId?: string): QueryState<ListResponse<CourseModule>> => {
  const { session } = useAuth();
  return useQueryState(
    makeQueryKey('modules', courseVersionId),
    session ? () => mvpApi.listModules(session, courseVersionId) : null,
    [session, courseVersionId]
  );
};

export const useMaterials = (moduleId?: string): QueryState<ListResponse<Material>> => {
  const { session } = useAuth();
  return useQueryState(
    makeQueryKey('materials', moduleId),
    session ? () => mvpApi.listMaterials(session, moduleId) : null,
    [session, moduleId]
  );
};

export const useGroupsList = (query: BaseFilterQuery): QueryState<ListResponse<Group>> => {
  const { session } = useAuth();
  return useQueryState(
    makeQueryKey('groups', query),
    session ? () => mvpApi.listGroups(session, query) : null,
    [session, JSON.stringify(query)]
  );
};

export const useGroup = (id: string): QueryState<Group> => {
  const { session } = useAuth();
  return useQueryState(
    makeQueryKey('group', id),
    session ? () => mvpApi.getGroup(session, id) : null,
    [session, id]
  );
};

export const useGroupCourses = (groupId: string): QueryState<ListResponse<GroupCourse>> => {
  const { session } = useAuth();
  return useQueryState(
    makeQueryKey('groupCourses', groupId),
    session ? () => mvpApi.listGroupCourses(session, groupId) : null,
    [session, groupId]
  );
};

export const useEnrollments = (query: BaseFilterQuery): QueryState<ListResponse<Enrollment>> => {
  const { session } = useAuth();
  return useQueryState(
    makeQueryKey('enrollments', query),
    session ? () => mvpApi.listEnrollments(session, query) : null,
    [session, JSON.stringify(query)]
  );
};

export const useLearnerCourses = (learnerId: string): QueryState<ListResponse<Enrollment>> =>
  useEnrollments({ learner_id: learnerId });

export const useLearnerCourseProgress = (courseId?: string): QueryState<ListResponse<Progress>> => {
  const { session } = useAuth();
  return useQueryState(
    makeQueryKey('progress', courseId),
    session ? () => mvpApi.listProgress(session, { course_id: courseId }) : null,
    [session, courseId]
  );
};

export const useQuestionBanks = (
  query: BaseFilterQuery
): QueryState<ListResponse<QuestionBank>> => {
  const { session } = useAuth();
  return useQueryState(
    makeQueryKey('questionBanks', query),
    session ? () => mvpApi.listQuestionBanks(session, query) : null,
    [session, JSON.stringify(query)]
  );
};

export const useTests = (query: BaseFilterQuery): QueryState<ListResponse<TestEntity>> => {
  const { session } = useAuth();
  return useQueryState(
    makeQueryKey('tests', query),
    session ? () => mvpApi.listTests(session, query) : null,
    [session, JSON.stringify(query)]
  );
};

export const useAssignments = (query: BaseFilterQuery): QueryState<ListResponse<Assignment>> => {
  const { session } = useAuth();
  return useQueryState(
    makeQueryKey('assignments', query),
    session ? () => mvpApi.listAssignments(session, query) : null,
    [session, JSON.stringify(query)]
  );
};

export const useDomainMutations = () => {
  const { session } = useAuth();

  const wrap = async <T>(action: (sessionValue: NonNullable<typeof session>) => Promise<T>) => {
    if (!session) throw new Error('Нет активной сессии');
    const result = await action(session);
    clearMvpQueryCache();
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
