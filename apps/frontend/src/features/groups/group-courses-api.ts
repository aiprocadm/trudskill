'use client';

import { useQuery } from '@tanstack/react-query';

import { apiRequest } from '../../lib/api/client';
import { useAuth } from '../auth/context';
import { withAuth } from '../mvp/api';

import type { UserSession } from '../../entities/session/model';
import type { GroupCourse } from '../mvp/types';

export interface GroupCourseTeacher {
  id: string;
  name: string;
}

export interface GroupCoursePatch {
  durationDays?: number | null;
  teacherUserId?: string | null;
}

/** МГ-E4.5 (срез 17.2): курс в группе — срок и преподаватель для протокола. */
export const groupCoursesApi = {
  update: (session: UserSession, id: string, patch: GroupCoursePatch): Promise<GroupCourse> =>
    apiRequest<GroupCourse>(`/group-courses/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: patch,
      ...withAuth(session)
    }),

  teachers: (session: UserSession, q: string): Promise<{ items: GroupCourseTeacher[] }> =>
    apiRequest<{ items: GroupCourseTeacher[] }>(
      `/group-courses/teachers${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`,
      withAuth(session)
    )
};

/** Преподаватели центра (роль «Преподаватель») — выбор и подписи в списке курсов группы. */
export function useGroupCourseTeachers(q: string, enabled = true) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['group-course-teachers', q.trim()],
    enabled: Boolean(session) && enabled,
    queryFn: () => groupCoursesApi.teachers(session!, q),
    meta: { suppressGlobalErrorToast: true }
  });
}
