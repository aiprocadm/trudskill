'use client';

import { DirectorySelect } from '@trudskill/ui';
import { useState } from 'react';

import { useCounterpartiesList, useGroupsList } from '../mvp/hooks';

import type { ReactElement } from 'react';

/*
 * Выбор учебной группы и заказчика по названию.
 *
 * На выгрузках в государственные реестры стояли поля «ID группы (необязательно)» и
 * «ID клиента (необязательно)»: администратор должен был откуда-то взять идентификатор
 * и вставить его руками. Парный к `features/courses/course-picker.tsx`.
 */

const PAGE = { page: 1, page_size: 200 };

export const GroupSelect = ({
  value,
  onChange,
  label = 'Учебная группа',
  emptyLabel = 'Все группы'
}: {
  value: string;
  onChange: (groupId: string) => void;
  label?: string;
  emptyLabel?: string;
}): ReactElement => {
  const [query, setQuery] = useState('');
  const { data, loading } = useGroupsList({
    ...PAGE,
    ...(query.trim() ? { q: query.trim() } : {})
  });
  const options = (data?.items ?? []).map((group) => ({
    value: group.id,
    label: `${group.name} (${group.code})`
  }));
  /* Поиск на сервере и честные числа — см. `DirectorySelect` (журнал 392). */
  return (
    <DirectorySelect
      label={label}
      value={value}
      onChange={onChange}
      options={options}
      {...(data ? { total: data.total } : {})}
      query={query}
      onQueryChange={setQuery}
      isLoading={loading}
      emptyLabel={emptyLabel}
      emptyHint="Учебных групп пока нет — заведите группу в разделе «Группы»."
      searchLabel="Поиск группы"
      searchPlaceholder="Название или код группы"
    />
  );
};

/*
 * §5.433: «Компания» — одно слово на одну сущность. Раздел, хлебные крошки, сделки и
 * переменные шаблонов говорят «Компания» (решение владельца IA-017 от 14.08.2026); подпись
 * выбора говорила «Заказчик».
 */
export const ClientSelect = ({
  value,
  onChange,
  label = 'Компания',
  emptyLabel = 'Все компании'
}: {
  value: string;
  onChange: (clientId: string) => void;
  label?: string;
  emptyLabel?: string;
}): ReactElement => {
  const [query, setQuery] = useState('');
  const { data, loading } = useCounterpartiesList({
    ...PAGE,
    ...(query.trim() ? { q: query.trim() } : {})
  });
  return (
    <DirectorySelect
      label={label}
      value={value}
      onChange={onChange}
      options={(data?.items ?? []).map((item) => ({ value: item.id, label: item.name }))}
      {...(data ? { total: data.total } : {})}
      query={query}
      onQueryChange={setQuery}
      isLoading={loading}
      emptyLabel={emptyLabel}
      emptyHint="Компаний пока нет — заведите компанию в разделе «Компании»."
      searchLabel="Поиск компании"
      searchPlaceholder="Название компании"
    />
  );
};
