'use client';

import { useCounterpartiesList, useGroupsList } from '../mvp/hooks';

import type { ReactElement } from 'react';

/*
 * Выбор учебной группы и заказчика по названию.
 *
 * На выгрузках в государственные реестры стояли поля «ID группы (необязательно)» и
 * «ID клиента (необязательно)»: администратор должен был откуда-то взять идентификатор
 * и вставить его руками. Парный к `features/courses/course-picker.tsx`.
 */

const PAGE = { page: 1, page_size: 100 };

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
  const { data, loading } = useGroupsList(PAGE);
  return (
    <label className="ui-field">
      <span className="ui-field-label">{label}</span>
      <select
        className="ui-select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={loading}
      >
        <option value="">{loading ? 'Загружаем группы…' : emptyLabel}</option>
        {(data?.items ?? []).map((group) => (
          <option key={group.id} value={group.id}>
            {group.name} ({group.code})
          </option>
        ))}
      </select>
    </label>
  );
};

export const ClientSelect = ({
  value,
  onChange,
  label = 'Заказчик',
  emptyLabel = 'Все заказчики'
}: {
  value: string;
  onChange: (clientId: string) => void;
  label?: string;
  emptyLabel?: string;
}): ReactElement => {
  const { data, loading } = useCounterpartiesList(PAGE);
  return (
    <label className="ui-field">
      <span className="ui-field-label">{label}</span>
      <select
        className="ui-select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={loading}
      >
        <option value="">{loading ? 'Загружаем заказчиков…' : emptyLabel}</option>
        {(data?.items ?? []).map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    </label>
  );
};
