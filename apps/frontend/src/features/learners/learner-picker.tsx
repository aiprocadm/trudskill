'use client';

import { useMemo } from 'react';

import { useLearnersList } from './hooks';

import type { ReactElement } from 'react';

/*
 * Выбор слушателя по фамилии.
 *
 * Третий из пары к `features/courses/course-picker.tsx` и `features/groups/group-picker.tsx`:
 * экраны просили «ID слушателя» и «UUID слушателя или контрагента» текстом, а взять этот
 * идентификатор человеку было неоткуда.
 */

const NAMES_PAGE = { page: 1, pageSize: 100 } as const;

/**
 * Справочник «идентификатор → фамилия и имя» для ячеек таблиц и списков.
 *
 * Пара к `useCourseNames` из подборщика курсов: экраны выводили `item.learnerId` прямо
 * значением — список зачисленных в группу состоял из идентификаторов вместо людей.
 */
/*
 * Справочник «идентификатор → фамилия». `enabled: false` — для экранов, которые видят
 * и роли без права `learners.read` (например календарь у слушателя): без гейта хук
 * дёргал бы запретную ручку и сыпал тосты «Permission denied» на каждый заход.
 */
export const useLearnerNames = (opts?: { enabled?: boolean }): Map<string, string> => {
  const { data } = useLearnersList(NAMES_PAGE, {
    enabled: opts?.enabled ?? true,
    silent: true
  });
  return useMemo(
    () =>
      new Map(
        (data?.items ?? []).map((item) => [item.id, `${item.lastName} ${item.firstName}`.trim()])
      ),
    [data]
  );
};

/**
 * Имя слушателя для ячейки.
 *
 * Если человека нет в справочнике (архивный, не попал в первую сотню) — честная фраза
 * «слушатель не найден», а не идентификатор: код в ячейке ничего не сообщает.
 */
export const learnerNameCell = (names: Map<string, string>, learnerId?: string): string => {
  if (!learnerId) return '—';
  return names.get(learnerId) ?? 'слушатель не найден';
};

export const LearnerSelect = ({
  value,
  onChange,
  label = 'Слушатель',
  emptyLabel = '— выберите слушателя —',
  required = false
}: {
  value: string;
  onChange: (learnerId: string) => void;
  label?: string;
  emptyLabel?: string;
  required?: boolean;
}): ReactElement => {
  const { data, isLoading } = useLearnersList({ page: 1, pageSize: 100 });
  const learners = data?.items ?? [];

  return (
    <label className="ui-field">
      <span className="ui-field-label">{label}</span>
      <select
        className="ui-select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        disabled={isLoading}
      >
        <option value="">{isLoading ? 'Загружаем слушателей…' : emptyLabel}</option>
        {learners.map((item) => (
          <option key={item.id} value={item.id}>
            {`${item.lastName} ${item.firstName}`.trim()}
          </option>
        ))}
      </select>
      {!isLoading && learners.length === 0 ? (
        <p className="ui-field-hint">
          Слушателей пока нет — сначала заведите их в разделе «Слушатели».
        </p>
      ) : null}
    </label>
  );
};
