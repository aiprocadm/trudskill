'use client';

import { useMemo } from 'react';

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

const PAGE = { page: 1, page_size: 100 };

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
  const { data, loading } = useCoursesList(PAGE);
  const courses = data?.items ?? [];

  return (
    <label className="ui-field">
      <span className="ui-field-label">{label}</span>
      <select
        className="ui-select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        disabled={loading}
      >
        <option value="">{loading ? 'Загружаем курсы…' : '— выберите курс —'}</option>
        {courses.map((course) => (
          <option key={course.id} value={course.id}>
            {course.title}
          </option>
        ))}
      </select>
      {hint ? <p className="ui-field-hint">{hint}</p> : null}
      {!loading && courses.length === 0 ? (
        <p className="ui-field-hint">
          Курсов пока нет — сначала заведите курс в разделе «Программы обучения».
        </p>
      ) : null}
    </label>
  );
};
