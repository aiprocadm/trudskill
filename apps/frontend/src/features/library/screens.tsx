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
            { key: 'title', title: 'Программа' },
            { key: 'code', title: 'Код' },
            { key: 'summary', title: 'Состав' }
          ]}
          rows={courses.map((course) => ({ ...course, summary: describeLibraryCourse(course) }))}
          rowKey={(row) => row.id}
          /*
           * Действия жили ОТДЕЛЬНЫМ списком под таблицей: каждая программа выводилась
           * второй раз строкой с кнопками. Та же беда, что в реестре пользователей
           * (срез 17) и у арендаторов платформы.
           */
          rowActions={(row) => [
            ...(canCopy
              ? [
                  {
                    label: 'Скопировать себе',
                    disabled: busy,
                    onSelect: () => void copy(row.id)
                  }
                ]
              : []),
            ...(canPublish
              ? [
                  {
                    label: 'Убрать из библиотеки',
                    danger: true,
                    disabled: busy,
                    onSelect: () => void unpublish(row.id)
                  }
                ]
              : [])
          ]}
        />
      ) : null}
      {!libraryQuery.isLoading && !libraryQuery.error && !courses.length ? (
        <SectionEmpty
          message="Библиотека пока пуста"
          hint="Здесь появятся курсы платформы, доступные вашему центру для подключения."
        />
      ) : null}

      {/*
        Раньше здесь же писалось «нужен доступ «courses.write»» — код права как значение
        на экране. Администратору учебного центра он ничего не говорит.
      */}
      {courses.length && !canCopy ? (
        <p className="ui-text-muted">
          Подключать программы к центру может сотрудник с правом на редактирование программ.
          Обратитесь к администратору вашего центра.
        </p>
      ) : null}
    </SectionCard>
  );
}
