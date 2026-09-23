'use client';

import { DirectorySelect } from '@trudskill/ui';
import { useState } from 'react';

import { useStaffSearch } from './hooks';

import type { ReactElement } from 'react';

/**
 * Выбор сотрудника центра по ФИО (исполнитель задачи, фильтр «исполнитель»).
 *
 * Список приходит с ручки `GET /tasks/staff` под правом `tasks.write`: `GET /users` закрыт
 * правом администратора, а куратору и преподавателю ставить задачи друг другу нужно без
 * него. Наружу — только имена: идентификатор живёт в значении поля.
 */
export const StaffSelect = ({
  value,
  onChange,
  label = 'Сотрудник',
  emptyLabel = '— не выбран —'
}: {
  value: string;
  /** Вызывается с идентификатором и ФИО выбранного: имя нужно экрану, id — запросу. */
  onChange: (userId: string, name: string) => void;
  label?: string;
  emptyLabel?: string;
}): ReactElement => {
  const [query, setQuery] = useState('');
  const { data, isLoading } = useStaffSearch(query);
  const options = (data?.items ?? []).map((member) => ({ value: member.id, label: member.name }));
  return (
    <DirectorySelect
      label={label}
      value={value}
      onChange={(id) => onChange(id, options.find((o) => o.value === id)?.label ?? '')}
      options={options}
      query={query}
      onQueryChange={setQuery}
      isLoading={isLoading}
      emptyLabel={emptyLabel}
      emptyHint="Сотрудников с такими ФИО не нашлось — проверьте написание."
      searchLabel="Поиск сотрудника"
      searchPlaceholder="Фамилия или имя"
    />
  );
};
