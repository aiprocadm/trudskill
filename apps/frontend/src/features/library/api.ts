import { apiRequest } from '../../lib/api/client';

import type { UserSession } from '../../entities/session/model';

/**
 * ФТ-D6 (Фаза 4 Task 10): библиотека курсов платформы.
 *
 * Каталог читает любой центр (`courses.read`), копирует себе — правом `courses.write`:
 * копия появляется в его собственных курсах. Наполняет каталог только платформа.
 */

export interface LibraryCourseDto {
  id: string;
  code: string;
  title: string;
  description: string;
  publishedAt: string;
  moduleCount: number;
  /** Сколько материалов приедет заготовками — центру видно ДО копирования. */
  materialsNeedingContent: number;
}

export interface CopyResultDto {
  courseId: string;
  code: string;
  materialsNeedingContent: number;
}

const auth = (session: UserSession) => ({
  accessToken: session.tokens.accessToken,
  tenantId: session.user.tenantId,
  userId: session.user.id
});

export const libraryApi = {
  list: (session: UserSession) =>
    apiRequest<LibraryCourseDto[]>('/library/courses', { auth: auth(session) }),

  copy: (session: UserSession, libraryCourseId: string) =>
    apiRequest<CopyResultDto>(`/library/courses/${libraryCourseId}/copy`, {
      method: 'POST',
      auth: auth(session)
    }),

  publish: (session: UserSession, input: { sourceTenantId: string; courseId: string }) =>
    apiRequest<{ id: string; code: string; title: string }>('/platform/library/courses', {
      method: 'POST',
      body: input,
      auth: auth(session)
    }),

  unpublish: (session: UserSession, libraryCourseId: string) =>
    apiRequest<{ removed: true }>(`/platform/library/courses/${libraryCourseId}`, {
      method: 'DELETE',
      auth: auth(session)
    })
};

/** Что увидит методист после копирования — честно про заготовки. */
export const describeCopyResult = (result: CopyResultDto): string =>
  result.materialsNeedingContent > 0
    ? `Курс «${result.code}» скопирован. Материалов без содержимого: ${result.materialsNeedingContent} — их нужно наполнить своими файлами.`
    : `Курс «${result.code}» скопирован полностью.`;

/** Подпись к карточке каталога: сколько модулей и сколько заготовок. */
export const describeLibraryCourse = (course: LibraryCourseDto): string => {
  const parts = [`модулей: ${course.moduleCount}`];
  if (course.materialsNeedingContent > 0) {
    parts.push(`материалов без содержимого: ${course.materialsNeedingContent}`);
  }
  return parts.join(' · ');
};
