'use client';

import { useQuery } from '@tanstack/react-query';

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
