'use client';

import { DirectorySelect } from '@trudskill/ui';
import { useMemo, useState } from 'react';

import { useCoursesList } from '../mvp/hooks';

import type { ReactElement } from 'react';

/*
 * Выбор курса по названию.
 *
 * Курс просили вводить идентификатором в поле «ID курса» — на экране тестов, в панели задания
 * и в панели банка вопросов. Администратор учебного центра идентификаторов не знает: их надо
 * было подсматривать в адресной строке другого экрана. Сюда же ходит выпуск документов.
 *
 * Папка `features/courses/` заведена заранее: по §8.3 (порядок 5) в неё переезжают экраны
 * курсов из монолита в волне 3.
 */

const PAGE = { page: 1, page_size: 200 };

/** Идентификатор → название. Нужен таблицам, которые получают от сервера только идентификатор. */
export const useCourseNames = (): Map<string, string> => {
  const { data } = useCoursesList(PAGE);
  return useMemo(
    () => new Map((data?.items ?? []).map((course) => [course.id, course.title])),
    [data]
  );
};

/**
 * Название курса для ячейки таблицы.
 *
 * Если курса нет в справочнике (например, он архивный и не попал в первую сотню) — честный
 * прочерк, а не идентификатор: код в ячейке человеку ничего не сообщает.
 */
export const courseNameCell = (names: Map<string, string>, courseId?: string): string =>
  (courseId ? names.get(courseId) : undefined) ?? '—';

export const CourseSelect = ({
  value,
  onChange,
  label = 'Курс',
  required = false,
  hint
}: {
  value: string;
  onChange: (courseId: string) => void;
  label?: string;
  required?: boolean;
  hint?: string;
}): ReactElement => {
  const [query, setQuery] = useState('');
  const { data, loading } = useCoursesList({
    ...PAGE,
    ...(query.trim() ? { q: query.trim() } : {})
  });
  const courses = data?.items ?? [];
  const names = useCourseNames();

  /*
   * Поиск идёт на СЕРВЕРЕ, а подсказка называет оба числа: список отдаёт страницу, и без
   * этого центру с тремя сотнями курсов список молча врал бы (журнал 392).
   */
  return (
    <DirectorySelect
      label={label}
      value={value}
      onChange={onChange}
      options={courses.map((course) => ({ value: course.id, label: course.title }))}
      {...(data ? { total: data.total } : {})}
      query={query}
      onQueryChange={setQuery}
      isLoading={loading}
      emptyLabel="— выберите курс —"
      emptyHint={hint ?? 'Курсов пока нет — сначала заведите курс в разделе «Программы обучения».'}
      {...(names.get(value) ? { selectedLabel: names.get(value)! } : {})}
      searchLabel="Поиск курса"
      searchPlaceholder="Название курса"
      required={required}
    />
  );
};
