'use client';

import {
  DataTable,
  DetailDrawer,
  DrawerCancelButton,
  LoadingState,
  LookupSelect,
  Pagination
} from '@trudskill/ui';
import { useDeferredValue, useState } from 'react';

import { EmployeesPasteDrawer } from './employees-paste-drawer';
import { clientPeopleApi } from './people-api';
import { EMPLOYEE_STATUS_LABEL, employeeName } from './people-format';
import { useClientEmployees } from './people-hooks';
import { SectionCard, SectionEmpty, SectionError } from '../../components/state-wrappers';
import { hasPermission } from '../../lib/rbac/permissions';
import { useAuth } from '../auth/context';

import type { ClientEmployee, EmployeePayload, EmployeeStatus } from './people-types';

const PAGE_SIZE = 25;

interface EmployeeForm {
  lastName: string;
  firstName: string;
  middleName: string;
  position: string;
  email: string;
  phone: string;
  employeeNo: string;
}

const toForm = (employee?: ClientEmployee): EmployeeForm => ({
  lastName: employee?.lastName ?? '',
  firstName: employee?.firstName ?? '',
  middleName: employee?.middleName ?? '',
  position: employee?.position ?? '',
  email: employee?.email ?? '',
  phone: employee?.phone ?? '',
  employeeNo: employee?.employeeNo ?? ''
});

const nullable = (value: string): string | null => (value.trim() ? value.trim() : null);

const TEXT_FIELDS: Array<{
  key: Exclude<keyof EmployeeForm, 'email' | 'phone'>;
  label: string;
  required?: boolean;
  hint?: string;
}> = [
  { key: 'lastName', label: 'Фамилия', required: true },
  { key: 'firstName', label: 'Имя', required: true },
  { key: 'middleName', label: 'Отчество' },
  { key: 'position', label: 'Должность' },
  { key: 'employeeNo', label: 'Табельный номер', hint: 'Необязателен; у компании не повторяется.' }
];

function EmployeeDrawer({
  counterpartyId,
  employee,
  onClose,
  onSaved
}: {
  counterpartyId: string;
  employee?: ClientEmployee;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { session } = useAuth();
  const [form, setForm] = useState<EmployeeForm>(() => toForm(employee));
  const [initial] = useState<EmployeeForm>(() => toForm(employee));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!session || !form.lastName.trim() || !form.firstName.trim()) return;
    setSaving(true);
    setError(null);
    const payload: EmployeePayload = {
      lastName: form.lastName.trim(),
      firstName: form.firstName.trim(),
      middleName: nullable(form.middleName),
      position: nullable(form.position),
      email: nullable(form.email),
      phone: nullable(form.phone),
      employeeNo: nullable(form.employeeNo)
    };
    try {
      const saved = employee
        ? await clientPeopleApi.updateEmployee(session, counterpartyId, employee.id, payload)
        : await clientPeopleApi.createEmployee(session, counterpartyId, payload);
      onSaved(`Сотрудник «${employeeName(saved)}» сохранён.`);
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DetailDrawer
      open
      onClose={onClose}
      title={employee ? `Сотрудник: ${employeeName(employee)}` : 'Новый сотрудник компании'}
      hasUnsavedChanges={JSON.stringify(form) !== JSON.stringify(initial)}
    >
      <form onSubmit={(e) => void submit(e)} className="ui-stack">
        {TEXT_FIELDS.map((field) => (
          <label key={field.key} className="ui-field">
            <span className="ui-field-label">
              {field.label}
              {field.required ? ' *' : ''}
            </span>
            <input
              className="ui-input"
              value={form[field.key]}
              onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
              {...(field.required ? { required: true } : {})}
            />
            {field.hint ? <span className="ui-hint">{field.hint}</span> : null}
          </label>
        ))}
        <label className="ui-field">
          <span className="ui-field-label">Почта</span>
          <input
            className="ui-input"
            type="email"
            inputMode="email"
            autoComplete="off"
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
          />
        </label>
        <label className="ui-field">
          <span className="ui-field-label">Телефон</span>
          <input
            className="ui-input"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            value={form.phone}
            onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
          />
        </label>
        {error !== null ? <SectionError error={error} /> : null}
        <div className="ui-modal-actions">
          <DrawerCancelButton className="ui-button" disabled={saving} onFallbackClose={onClose} />
          <button
            type="submit"
            className={`ui-button ui-button--primary ${saving ? 'ui-button--loading' : ''}`}
            disabled={saving}
          >
            Сохранить сотрудника
          </button>
        </div>
      </form>
    </DetailDrawer>
  );
}

/**
 * Вкладка «Сотрудники» карточки компании (МГ-D2.1, срез 14.2): те, кого учат. Поиск и статус —
 * на сервере, страницами (у компании CDOPROF бывают тысячи). Ушедшего — «уволен», а не удалить:
 * на него ссылается слушатель и его документы.
 */
export function ClientEmployeesSection({
  counterpartyId,
  active
}: {
  counterpartyId: string;
  active: boolean;
}) {
  const { session } = useAuth();
  const canWrite = hasPermission(session?.permissions ?? [], 'counterparties.write');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query.trim());
  const [status, setStatus] = useState<EmployeeStatus | ''>('active');
  const [page, setPage] = useState(1);
  const employees = useClientEmployees(
    counterpartyId,
    {
      ...(deferredQuery ? { q: deferredQuery } : {}),
      ...(status ? { status } : {}),
      page,
      pageSize: PAGE_SIZE
    },
    active
  );
  const [drawer, setDrawer] = useState<ClientEmployee | 'new' | 'paste' | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const items = employees.data?.items ?? [];
  const total = employees.data?.total ?? 0;
  const filtered = Boolean(deferredQuery) || status !== 'active';

  const setEmployeeStatus = (row: ClientEmployee, next: EmployeeStatus, message: string) => {
    if (!session) return;
    setBusy(true);
    setActionError(null);
    setNotice(null);
    clientPeopleApi
      .updateEmployee(session, counterpartyId, row.id, { status: next })
      .then(async () => {
        await employees.refetch();
        setNotice(message);
      })
      .catch((err: unknown) => setActionError(err))
      .finally(() => setBusy(false));
  };

  const rowActions = (row: ClientEmployee) =>
    canWrite
      ? [
          { label: 'Изменить сотрудника', disabled: busy, onSelect: () => setDrawer(row) },
          row.status === 'active'
            ? {
                label: 'Отметить уволенным',
                disabled: busy,
                onSelect: () =>
                  setEmployeeStatus(row, 'dismissed', `«${employeeName(row)}» отмечен уволенным.`)
              }
            : {
                label: 'Вернуть в работающие',
                disabled: busy,
                onSelect: () =>
                  setEmployeeStatus(row, 'active', `«${employeeName(row)}» снова работает.`)
              }
        ]
      : [];

  return (
    <SectionCard title="Сотрудники">
      <p className="ui-text-muted">
        Работники компании, которых центр обучает. При зачислении сотрудник становится слушателем.
      </p>
      <div className="ui-inline">
        <label className="ui-field">
          <span className="ui-field-label">Поиск</span>
          <input
            className="ui-input"
            type="search"
            value={query}
            placeholder="Фамилия, должность, почта или табельный номер"
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <LookupSelect
          label="Статус"
          value={status}
          onChange={(value) => {
            setStatus(value as EmployeeStatus | '');
            setPage(1);
          }}
          items={[
            { value: 'active', label: EMPLOYEE_STATUS_LABEL.active },
            { value: 'dismissed', label: EMPLOYEE_STATUS_LABEL.dismissed },
            { value: 'inactive', label: EMPLOYEE_STATUS_LABEL.inactive },
            { value: '', label: 'все' }
          ]}
        />
      </div>

      {employees.isLoading ? <LoadingState message="Загружаем сотрудников…" /> : null}
      {employees.error ? (
        <SectionError error={employees.error} onRetry={() => void employees.refetch()} />
      ) : null}
      {actionError !== null ? <SectionError error={actionError} /> : null}
      {notice ? (
        <p className="ui-callout" role="status">
          {notice}
        </p>
      ) : null}

      {employees.data && items.length === 0 ? (
        <SectionEmpty
          message={filtered ? 'Никого не нашлось' : 'Сотрудников пока нет'}
          hint={
            filtered
              ? 'Измените поиск или выберите «все» в состоянии.'
              : canWrite
                ? 'Вставьте список из письма кадровика — «Вставить списком» заведёт всех разом, отказы покажет поимённо.'
                : 'Сотрудников компании добавляет сотрудник центра с правом на правку компаний.'
          }
        />
      ) : null}

      {items.length > 0 ? (
        <>
          <DataTable
            columns={[
              { key: 'name', title: 'Сотрудник' },
              { key: 'position', title: 'Должность' },
              { key: 'number', title: 'Табельный номер' },
              { key: 'email', title: 'Почта' },
              { key: 'state', title: 'Статус' },
              { key: 'learner', title: 'Слушатель' }
            ]}
            rows={items.map((row) => ({
              ...row,
              name: employeeName(row),
              position: row.position ?? '—',
              number: row.employeeNo ?? '—',
              email: row.email ?? '—',
              state: EMPLOYEE_STATUS_LABEL[row.status],
              learner: row.learnerId ? 'заведён' : 'ещё не учился'
            }))}
            rowActions={(row) => rowActions(row)}
          />
          {total > PAGE_SIZE ? (
            <Pagination
              page={page}
              totalPages={Math.ceil(total / PAGE_SIZE)}
              onPageChange={setPage}
              label="Страницы сотрудников"
            />
          ) : null}
        </>
      ) : null}

      {canWrite && employees.data ? (
        <div className="ui-form-actions">
          <button
            type="button"
            className="ui-button"
            disabled={busy}
            onClick={() => setDrawer('paste')}
          >
            Вставить списком
          </button>
          <button
            type="button"
            className="ui-button"
            disabled={busy}
            onClick={() => setDrawer('new')}
          >
            Добавить сотрудника
          </button>
        </div>
      ) : null}

      {drawer === 'paste' ? (
        <EmployeesPasteDrawer
          counterpartyId={counterpartyId}
          onClose={() => setDrawer(null)}
          onDone={() => void employees.refetch()}
        />
      ) : drawer ? (
        <EmployeeDrawer
          counterpartyId={counterpartyId}
          {...(drawer === 'new' ? {} : { employee: drawer })}
          onClose={() => setDrawer(null)}
          onSaved={(message) => {
            setDrawer(null);
            setNotice(message);
            void employees.refetch();
          }}
        />
      ) : null}
    </SectionCard>
  );
}
