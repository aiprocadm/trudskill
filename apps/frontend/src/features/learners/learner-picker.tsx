'use client';

import { useLearnersList } from './hooks';

import type { ReactElement } from 'react';

/*
 * Выбор слушателя по фамилии.
 *
 * Третий из пары к `features/courses/course-picker.tsx` и `features/groups/group-picker.tsx`:
 * экраны просили «ID слушателя» и «UUID слушателя или контрагента» текстом, а взять этот
 * идентификатор человеку было неоткуда.
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
