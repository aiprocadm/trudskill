'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { loadCourseTree } from './api';
import { useAuth } from '../auth/context';
import { mvpApi } from '../mvp/api';

import type { CourseTree, ProgressByMaterial } from './types';
import type { UserSession } from '../../entities/session/model';
import type { CourseVersion, Progress } from '../mvp/types';

const pickPublishedVersion = (versions: CourseVersion[]): CourseVersion | null => {
  const published = versions.filter((v) => v.status === 'published');
  if (published.length === 0) return null;
  return published.reduce((latest, candidate) =>
    candidate.versionNo > latest.versionNo ? candidate : latest
  );
};

const fetchCourseTreeForCourse = async (
  session: UserSession,
  courseId: string
): Promise<{ tree: CourseTree; courseVersionId: string | null }> => {
  const versionsResp = await mvpApi.listCourseVersions(session, courseId);
  const published = pickPublishedVersion(versionsResp.items);
  if (!published) return { tree: [], courseVersionId: null };
  const tree = await loadCourseTree(session, published.id);
  return { tree, courseVersionId: published.id };
};

export const useLearnerEnrollmentForCourse = (courseId: string) => {
  const { session } = useAuth();
  const learnerId = session?.user.id ?? '';
  const query = useQuery({
    queryKey: ['mvp', 'learnerEnrollmentsForCourse', learnerId, courseId],
    enabled: Boolean(session) && learnerId.length > 0 && courseId.length > 0,
    queryFn: () =>
      mvpApi.listEnrollments(session!, {
        learner_id: learnerId,
        course_id: courseId,
        page: 1,
        page_size: 20
      })
  });
  const items = query.data?.items ?? [];
  const enrollment = items.find((e) => e.status === 'active') ?? items[0] ?? null;
  return {
    enrollmentId: enrollment?.id ?? null,
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null
  };
};

export const useCourseTree = (courseId: string) => {
  const { session } = useAuth();
  const query = useQuery({
    queryKey: ['mvp', 'courseTree', courseId],
    enabled: Boolean(session) && Boolean(courseId),
    queryFn: () => fetchCourseTreeForCourse(session!, courseId)
  });
  return {
    tree: query.data?.tree ?? null,
    courseVersionId: query.data?.courseVersionId ?? null,
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null
  };
};

export const buildProgressMap = (progressList: Progress[] | null): ProgressByMaterial => {
  const map: ProgressByMaterial = new Map();
  if (!progressList) return map;
  for (const item of progressList) {
    map.set(item.materialId, item);
  }
  return map;
};

interface UpsertMaterialProgressArgs {
  materialId: string;
  enrollmentId: string;
  studiedSeconds: number;
}

export const useUpsertMaterialProgress = (courseId: string) => {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  return useCallback(
    async ({ materialId, enrollmentId, studiedSeconds }: UpsertMaterialProgressArgs) => {
      if (!session) return;
      await mvpApi.updateMaterialProgress(session, materialId, { enrollmentId, studiedSeconds });
      await queryClient.invalidateQueries({ queryKey: ['mvp', 'progress', courseId] });
    },
    [session, queryClient, courseId]
  );
};
