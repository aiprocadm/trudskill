'use client';

import { useQueries, useQuery } from '@tanstack/react-query';

import { useAuth } from '../auth/context';
import { mvpApi } from '../mvp/api';

import type { EnrollmentWithDetails } from './types';
import type { Course, Enrollment, ListResponse, Progress } from '../mvp/types';

export interface AssembleInput {
  enrollments: Enrollment[];
  coursesByCourseId: Record<string, Course | null>;
  progressByCourseId: Record<string, Progress[]>;
}

export const assembleHomeData = (input: AssembleInput): EnrollmentWithDetails[] =>
  input.enrollments.map((enrollment) => {
    const courseId = enrollment.courseId;
    const course = courseId ? (input.coursesByCourseId[courseId] ?? null) : null;
    const progress = courseId ? (input.progressByCourseId[courseId] ?? []) : [];
    return { enrollment, course, progress };
  });

export const useLearnerHomeData = () => {
  const { session } = useAuth();
  const learnerId = session?.user.id ?? '';

  const enrollmentsQuery = useQuery({
    queryKey: ['mvp', 'learnerHomeEnrollments', learnerId],
    enabled: Boolean(session) && learnerId.length > 0,
    queryFn: () =>
      mvpApi.listEnrollments(session!, { learner_id: learnerId, page: 1, page_size: 50 })
  });

  const enrollments = (enrollmentsQuery.data as ListResponse<Enrollment> | undefined)?.items ?? [];
  const courseIds = Array.from(
    new Set(enrollments.map((e) => e.courseId).filter((id): id is string => Boolean(id)))
  );

  const courseQueries = useQueries({
    queries: courseIds.map((courseId) => ({
      queryKey: ['mvp', 'learnerHomeCourse', courseId],
      enabled: Boolean(session),
      queryFn: () => mvpApi.getCourse(session!, courseId)
    }))
  });

  const progressQueries = useQueries({
    queries: courseIds.map((courseId) => ({
      queryKey: ['mvp', 'learnerHomeProgress', courseId],
      enabled: Boolean(session),
      queryFn: () => mvpApi.listProgress(session!, { course_id: courseId })
    }))
  });

  const coursesByCourseId: Record<string, Course | null> = {};
  courseIds.forEach((courseId, index) => {
    const result = courseQueries[index];
    coursesByCourseId[courseId] = (result?.data as Course | undefined) ?? null;
  });

  const progressByCourseId: Record<string, Progress[]> = {};
  courseIds.forEach((courseId, index) => {
    const result = progressQueries[index];
    const items = (result?.data as ListResponse<Progress> | undefined)?.items ?? [];
    progressByCourseId[courseId] = items;
  });

  const data = assembleHomeData({ enrollments, coursesByCourseId, progressByCourseId });

  const isLoading =
    enrollmentsQuery.isLoading ||
    courseQueries.some((q) => q.isLoading) ||
    progressQueries.some((q) => q.isLoading);

  const error = enrollmentsQuery.error instanceof Error ? enrollmentsQuery.error.message : null;

  return { data, isLoading, error };
};
