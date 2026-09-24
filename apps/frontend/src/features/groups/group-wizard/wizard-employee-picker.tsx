'use client';

import { LoadingState } from '@trudskill/ui';
import { useDeferredValue, useState } from 'react';

import { SectionError } from '../../../components/state-wrappers';
import { employeeName } from '../../clients/people-format';
import { useClientEmployees } from '../../clients/people-hooks';

import type { ReactElement } from 'react';

/**
 * «Из сотрудников компании» в шаге «Слушатели» мастера (МГ-D2.1, срез 14.4; отложено РМ53):
 * работающие сотрудники компании группы галочками. Кто уже учился — «уже слушатель»: сервер
 * возьмёт того же слушателя, второго не заведёт. Новым сотрудникам сервер заведёт слушателей
 * при зачислении и запишет связь.
 */
export const WizardEmployeePicker = ({
  counterpartyId,
  selected,
  onChange
}: {
  counterpartyId: string;
  selected: string[];
  onChange: (employeeIds: string[], names: Record<string, string>) => void;
}): ReactElement => {
  const [query, setQuery] = useState('');
  const deferred = useDeferredValue(query.trim());
  const employees = useClientEmployees(
    counterpartyId,
    { status: 'active', pageSize: 200, ...(deferred ? { q: deferred } : {}) },
    Boolean(counterpartyId)
  );
  const items = employees.data?.items ?? [];
  const [names, setNames] = useState<Record<string, string>>({});

  const toggle = (id: string, name: string, checked: boolean) => {
    const nextNames = { ...names, [id]: name };
    setNames(nextNames);
    onChange(checked ? [...selected, id] : selected.filter((value) => value !== id), nextNames);
  };

  return (
    <fieldset className="ui-fieldset">
      <legend>Из сотрудников компании</legend>
      <label className="ui-field">
        <span className="ui-field-label">Поиск сотрудника</span>
        <input
          className="ui-input"
          type="search"
          value={query}
          placeholder="Фамилия или должность"
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {employees.isLoading ? <LoadingState message="Загружаем сотрудников…" /> : null}
      {employees.error ? (
        <SectionError error={employees.error} onRetry={() => void employees.refetch()} />
      ) : null}
      {employees.data && items.length === 0 ? (
        <p className="ui-hint">
          {deferred
            ? 'Никого не нашлось — измените поиск.'
            : 'У компании пока нет сотрудников. Их заводят во вкладке «Сотрудники» карточки компании — или вставьте людей списком ниже.'}
        </p>
      ) : null}
      {items.length > 0 ? (
        <ul className="ui-bare-list" aria-label="Сотрудники компании">
          {items.map((employee) => {
            const name = employeeName(employee);
            return (
              <li key={employee.id}>
                <label className="ui-inline">
                  <input
                    type="checkbox"
                    checked={selected.includes(employee.id)}
                    onChange={(e) => toggle(employee.id, name, e.target.checked)}
                  />
                  <span>
                    {name}
                    {employee.position ? `, ${employee.position}` : ''}
                    {employee.learnerId ? ' — уже слушатель' : ''}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      ) : null}
      {employees.data && employees.data.total > items.length ? (
        <p className="ui-hint">
          Показаны первые {items.length} из {employees.data.total} — уточните поиск.
        </p>
      ) : null}
    </fieldset>
  );
};
