'use client';

import { useQuery } from '@tanstack/react-query';

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

interface CourseDetailsBundle {
  coursesByCourseId: Record<string, Course | null>;
  progressByCourseId: Record<string, Progress[]>;
}

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
  ).sort();

  const detailsQuery = useQuery({
    queryKey: ['mvp', 'learnerHomeDetails', courseIds.join(',')],
    enabled: Boolean(session) && courseIds.length > 0,
    queryFn: async (): Promise<CourseDetailsBundle> => {
      const courseResults = await Promise.allSettled(
        courseIds.map((courseId) => mvpApi.getCourse(session!, courseId))
      );
      const progressResults = await Promise.allSettled(
        courseIds.map((courseId) => mvpApi.listProgress(session!, { course_id: courseId }))
      );
      const coursesByCourseId: Record<string, Course | null> = {};
      const progressByCourseId: Record<string, Progress[]> = {};
      courseIds.forEach((courseId, index) => {
        const courseResult = courseResults[index];
        coursesByCourseId[courseId] =
          courseResult?.status === 'fulfilled' ? courseResult.value : null;
        const progressResult = progressResults[index];
        progressByCourseId[courseId] =
          progressResult?.status === 'fulfilled' ? progressResult.value.items : [];
      });
      return { coursesByCourseId, progressByCourseId };
    }
  });

  const data = assembleHomeData({
    enrollments,
    coursesByCourseId: detailsQuery.data?.coursesByCourseId ?? {},
    progressByCourseId: detailsQuery.data?.progressByCourseId ?? {}
  });

  const isLoading = enrollmentsQuery.isLoading || (courseIds.length > 0 && detailsQuery.isLoading);

  const error =
    enrollmentsQuery.error instanceof Error
      ? enrollmentsQuery.error.message
      : detailsQuery.error instanceof Error
        ? detailsQuery.error.message
        : null;

  return { data, isLoading, error };
};
