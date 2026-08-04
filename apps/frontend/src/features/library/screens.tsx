'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DataTable, LoadingState } from '@trudskill/ui';
import { useState } from 'react';

import { describeCopyResult, describeLibraryCourse, libraryApi } from './api';
import { SectionCard, SectionEmpty, SectionError } from '../../components/state-wrappers';
import { useAuth } from '../auth/context';

/**
 * ФТ-D6: библиотека курсов платформы.
 *
 * Каталог видит любой сотрудник с `courses.read`, копирует — с `courses.write`.
 * Число материалов-заготовок показывается ДО копирования: методист должен понимать,
 * что курс приедет со структурой, но своё содержимое к файлам он приложит сам.
 */
export function PlatformLibraryScreen() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const canCopy = Boolean(session?.permissions.includes('courses.write'));
  const canPublish = Boolean(session?.permissions.includes('library.publish'));

  const libraryQuery = useQuery({
    queryKey: ['platform-library', session?.user.tenantId],
    enabled: Boolean(session),
    queryFn: () => libraryApi.list(session!)
  });

  const courses = libraryQuery.data ?? [];

  const copy = async (libraryCourseId: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await libraryApi.copy(session!, libraryCourseId);
      setNotice(describeCopyResult(result));
      await queryClient.invalidateQueries({ queryKey: ['courses'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось скопировать курс');
    } finally {
      setBusy(false);
    }
  };

  const unpublish = async (libraryCourseId: string) => {
    setBusy(true);
    setError(null);
    try {
      await libraryApi.unpublish(session!, libraryCourseId);
      await queryClient.invalidateQueries({ queryKey: ['platform-library'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось убрать курс из библиотеки');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard title="Библиотека курсов платформы">
      <p className="ui-text-muted">
        Готовые программы платформы. «Скопировать себе» создаёт курс в вашем центре — дальше он ваш:
        правьте, публикуйте, выдавайте документы. Файлы и видео не переносятся между центрами,
        поэтому такие материалы приезжают заготовками — содержимое приложите своё.
      </p>

      {libraryQuery.isLoading ? <LoadingState message="Загрузка библиотеки…" /> : null}
      {libraryQuery.error ? (
        <SectionError
          message={
            libraryQuery.error instanceof Error
              ? libraryQuery.error.message
              : 'Не удалось загрузить библиотеку'
          }
        />
      ) : null}
      {error ? <SectionError message={error} /> : null}
      {notice ? <p className="ui-callout ui-callout--success">{notice}</p> : null}

      {!libraryQuery.isLoading && courses.length ? (
        <DataTable
          columns={[
            { key: 'code', title: 'Код' },
            { key: 'title', title: 'Программа' },
            { key: 'summary', title: 'Состав' }
          ]}
          rows={courses.map((course) => ({ ...course, summary: describeLibraryCourse(course) }))}
        />
      ) : null}
      {!libraryQuery.isLoading && !libraryQuery.error && !courses.length ? (
        <SectionEmpty message="Библиотека пока пуста" />
      ) : null}

      {courses.map((course) => (
        <div key={course.id} className="ui-inline">
          <span>{course.title}:</span>
          {canCopy ? (
            <button type="button" disabled={busy} onClick={() => void copy(course.id)}>
              Скопировать себе
            </button>
          ) : (
            <span className="ui-text-muted">нужен доступ «courses.write»</span>
          )}
          {canPublish ? (
            <button type="button" disabled={busy} onClick={() => void unpublish(course.id)}>
              Убрать из библиотеки
            </button>
          ) : null}
        </div>
      ))}
    </SectionCard>
  );
}
