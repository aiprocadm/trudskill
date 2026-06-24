'use client';

import { DataTable, FilterBar, LoadingState, StatusChip } from '@trudskill/ui';
import { useMemo, useRef, useState } from 'react';

import {
  useCredentials,
  useExportTasks,
  useIntegrationDiagnostics,
  useProviders,
  useSyncLogs
} from './hooks';
import {
  FieldError,
  FieldHelp,
  FormErrorSummary,
  useFocusFirstError
} from '../../components/form-feedback';
import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../components/state-wrappers';
import { apiRequest } from '../../lib/api/client';

export const IntegrationSettingsScreen = () => {
  const { data: providers, loading: providersLoading, error: providersError } = useProviders();
  const {
    data: credentials,
    loading: credentialsLoading,
    error: credentialsError,
    refetch: refetchCredentials
  } = useCredentials();
  const [providerId, setProviderId] = useState('');
  const [providerSort, setProviderSort] = useState<'asc' | 'desc'>('asc');
  const [name, setName] = useState('');
  const [secret, setSecret] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    providerId?: string;
    name?: string;
    secret?: string;
  }>({});
  const providerRef = useRef<HTMLSelectElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const secretRef = useRef<HTMLInputElement>(null);
  const diagnostics = useIntegrationDiagnostics();
  const providersRows = useMemo(() => {
    const source = [...providers];
    source.sort((a, b) =>
      providerSort === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)
    );
    return source;
  }, [providerSort, providers]);

  const summaryErrors = useMemo(
    () =>
      Object.entries(fieldErrors).map(([field, message]) => ({
        field,
        message: message ?? ''
      })),
    [fieldErrors]
  );

  useFocusFirstError(summaryErrors, {
    providerId: providerRef.current,
    name: nameRef.current,
    secret: secretRef.current
  });

  const onCreateCredential = async () => {
    const nextFieldErrors: typeof fieldErrors = {};
    if (!providerId) nextFieldErrors.providerId = 'Выберите провайдера.';
    if (!name.trim()) nextFieldErrors.name = 'Введите название credentials.';
    if (!secret.trim()) nextFieldErrors.secret = 'Введите секрет.';
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length) return;
    try {
      setSaveError(null);
      await apiRequest('/integrations/credentials', {
        method: 'POST',
        body: { providerId, name, secret, settingsJsonb: {} }
      });
      await refetchCredentials();
      setName('');
      setSecret('');
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Не удалось создать credentials');
    }
  };

  return (
    <PageContainer>
      <PageHeader title="Настройки интеграций" />
      <SectionCard title="Реестр провайдеров">
        {providersLoading ? <LoadingState message="Загрузка провайдеров…" /> : null}
        {providersError ? <SectionError message={providersError} /> : null}
        {providersRows.length ? (
          <DataTable
            sortBy="name"
            sortDir={providerSort}
            onSort={({ dir }) => setProviderSort(dir)}
            columns={[
              { key: 'code', title: 'Код' },
              { key: 'name', title: 'Провайдер', sortable: true },
              { key: 'providerType', title: 'Тип' }
            ]}
            rows={providersRows}
          />
        ) : (
          <SectionEmpty message="Провайдеры не найдены" />
        )}
      </SectionCard>
      <SectionCard title="Подключения тенанта">
        {credentialsLoading ? <LoadingState message="Загрузка учётных данных…" /> : null}
        {credentialsError ? <SectionError message={credentialsError} /> : null}
        {credentials.length ? (
          <DataTable
            columns={[
              { key: 'name', title: 'Name' },
              { key: 'status', title: 'Status' },
              { key: 'secretMasked', title: 'Secret' }
            ]}
            rows={credentials}
          />
        ) : (
          <SectionEmpty message="Нет credentials" />
        )}
        <FormErrorSummary
          id="integration-credential-summary"
          title="Заполните обязательные поля"
          errors={summaryErrors}
        />
        <FilterBar>
          <label htmlFor="providerId" className="ui-field" style={{ minWidth: 220 }}>
            <span className="ui-field-label">Провайдер</span>
            <select
              id="providerId"
              ref={providerRef}
              value={providerId}
              onChange={(event) => setProviderId(event.target.value)}
              aria-invalid={Boolean(fieldErrors.providerId)}
              aria-describedby={fieldErrors.providerId ? 'provider-error' : undefined}
            >
              <option value="">Провайдер</option>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
            <FieldError id="provider-error" message={fieldErrors.providerId} />
          </label>
          <label htmlFor="credential-name" className="ui-field" style={{ minWidth: 220 }}>
            <span className="ui-field-label">Название</span>
            <input
              id="credential-name"
              ref={nameRef}
              placeholder="Название"
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-invalid={Boolean(fieldErrors.name)}
              aria-describedby={[
                'credential-name-help',
                fieldErrors.name ? 'credential-name-error' : ''
              ]
                .filter(Boolean)
                .join(' ')}
            />
            <FieldHelp id="credential-name-help">Например, «Moodle PROD».</FieldHelp>
            <FieldError id="credential-name-error" message={fieldErrors.name} />
          </label>
          <label htmlFor="credential-secret" className="ui-field" style={{ minWidth: 220 }}>
            <span className="ui-field-label">Секрет</span>
            <input
              id="credential-secret"
              ref={secretRef}
              placeholder="Секрет"
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              aria-invalid={Boolean(fieldErrors.secret)}
              aria-describedby={[
                'credential-secret-help',
                fieldErrors.secret ? 'credential-secret-error' : ''
              ]
                .filter(Boolean)
                .join(' ')}
            />
            <FieldHelp id="credential-secret-help">
              Хранится в masked-виде после сохранения.
            </FieldHelp>
            <FieldError id="credential-secret-error" message={fieldErrors.secret} />
          </label>
          <button
            className="ui-button ui-button--primary"
            onClick={() => void onCreateCredential()}
            type="button"
          >
            Создать
          </button>
        </FilterBar>
        {saveError ? <SectionError message={saveError} /> : null}
      </SectionCard>
      <SectionCard title="Диагностика провайдеров">
        {diagnostics.loading ? <LoadingState message="Загрузка диагностики..." /> : null}
        {diagnostics.error ? <SectionError message={diagnostics.error} /> : null}
        {diagnostics.data.length ? (
          <DataTable
            columns={[
              { key: 'providerCode', title: 'Provider' },
              { key: 'providerType', title: 'Type' },
              { key: 'credentialsCount', title: 'Creds' },
              { key: 'activeCredentials', title: 'Active creds' },
              { key: 'lastSyncStatus', title: 'Last sync' },
              { key: 'lastSyncAt', title: 'Last sync at' }
            ]}
            rows={diagnostics.data}
          />
        ) : (
          <SectionEmpty message="Диагностика провайдеров недоступна" />
        )}
      </SectionCard>
    </PageContainer>
  );
};

export const ExportTasksScreen = () => {
  const [live, setLive] = useState(false);
  const { data, loading, error } = useExportTasks(live);
  return (
    <PageContainer>
      <PageHeader
        title="Задачи выгрузки"
        actions={
          <button onClick={() => setLive((c) => !c)} aria-pressed={live}>
            {live ? 'Остановить live-обновление' : 'Включить live-обновление'}
          </button>
        }
      />
      <SectionCard title="Реестр задач выгрузки">
        {loading ? <LoadingState message="Загрузка…" /> : null}
        {error ? <SectionError message={error} /> : null}
        {data.length ? (
          <DataTable
            columns={[
              { key: 'id', title: 'Task ID' },
              { key: 'providerCode', title: 'Provider' },
              { key: 'exportType', title: 'Type' },
              { key: 'status', title: 'Status' }
            ]}
            rows={data}
          />
        ) : (
          <SectionEmpty message="Задачи не найдены" />
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          {data.map((task) => (
            <StatusChip key={task.id} status={task.status} />
          ))}
        </div>
      </SectionCard>
    </PageContainer>
  );
};

export const SyncLogsScreen = () => {
  const { data, loading, error } = useSyncLogs();
  const [provider, setProvider] = useState('');
  const filtered = useMemo(
    () => data.filter((item) => (provider ? item.providerCode.includes(provider) : true)),
    [data, provider]
  );

  return (
    <PageContainer>
      <PageHeader title="Журнал синхронизации" />
      <SectionCard title="Журнал синхронизации">
        <FilterBar>
          <input
            placeholder="Фильтр по provider"
            value={provider}
            onChange={(event) => setProvider(event.target.value)}
          />
        </FilterBar>
        {loading ? <LoadingState message="Загрузка…" /> : null}
        {error ? <SectionError message={error} /> : null}
        {filtered.length ? (
          <DataTable
            columns={[
              { key: 'providerCode', title: 'Provider' },
              { key: 'entityType', title: 'Entity' },
              { key: 'statusCode', title: 'HTTP' },
              { key: 'status', title: 'Status' }
            ]}
            rows={filtered}
          />
        ) : (
          <SectionEmpty message="Логи не найдены" />
        )}
      </SectionCard>
    </PageContainer>
  );
};
