'use client';

import { DirectorySelect } from '@trudskill/ui';
import { useMemo, useState } from 'react';

import { useLearnersList } from './hooks';

import type { ReactElement } from 'react';

/**
 * Сколько записей справочника просить у сервера за раз.
 *
 * Двести — НАСТОЯЩИЙ потолок запроса с проволоки (журнал 277: без потолка один запрос
 * отдавал всю таблицу слушателей со СНИЛС). Просить больше значит писать число, которого
 * не будет: обрежется молча. Остальное добирается поиском.
 */
export const LOOKUP_PAGE_SIZE = 200;

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

/**
 * Выбор слушателя с поиском НА СЕРВЕРЕ.
 *
 * Раньше здесь был обычный список поверх первой сотни: в центре со ста одним слушателем
 * последний не выбирался никогда, и понять почему было нельзя (журнал 392). Теперь строка
 * поиска уходит на сервер, а подсказка честно называет, сколько показано из скольких.
 */
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
  const [query, setQuery] = useState('');
  const { data, isLoading } = useLearnersList({
    page: 1,
    pageSize: LOOKUP_PAGE_SIZE,
    ...(query.trim() ? { q: query.trim() } : {})
  });
  const learners = data?.items ?? [];
  const names = useLearnerNames();

  return (
    <DirectorySelect
      label={label}
      value={value}
      onChange={onChange}
      options={learners.map((item) => ({
        value: item.id,
        label: `${item.lastName} ${item.firstName}`.trim()
      }))}
      {...(data ? { total: data.total } : {})}
      query={query}
      onQueryChange={setQuery}
      isLoading={isLoading}
      emptyLabel={emptyLabel}
      emptyHint="Слушателей пока нет — сначала заведите их в разделе «Слушатели»."
      {...(names.get(value) ? { selectedLabel: names.get(value)! } : {})}
      searchLabel="Поиск слушателя"
      searchPlaceholder="Фамилия или имя"
      required={required}
    />
  );
};
