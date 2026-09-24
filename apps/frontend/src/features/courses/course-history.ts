'use client';

import { useQuery } from '@tanstack/react-query';

import { apiRequest } from '../../lib/api/client';
import { useAuth } from '../auth/context';
import { withAuth } from '../mvp/api';

import type { UserSession } from '../../entities/session/model';

export interface CourseHistoryItem {
  id: string;
  createdAt: string;
  action: string;
  entityType: string;
  actorName?: string;
  system: boolean;
}

export interface CourseHistory {
  items: CourseHistoryItem[];
  truncated: boolean;
}

/** МГ-E2.3 (срез 16.4): история курса — курс и его версии из журнала действий. */
export const courseHistoryApi = {
  fetch: (session: UserSession, courseId: string): Promise<CourseHistory> =>
    apiRequest<CourseHistory>(`/courses/${encodeURIComponent(courseId)}/history`, withAuth(session))
};

/** Грузится по кнопке «Показать историю» — карточка курса не ждёт журнал при каждом открытии. */
export function useCourseHistory(courseId: string, enabled: boolean) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['course-history', courseId],
    enabled: Boolean(session) && Boolean(courseId) && enabled,
    queryFn: () => courseHistoryApi.fetch(session!, courseId),
    meta: { suppressGlobalErrorToast: true }
  });
}
