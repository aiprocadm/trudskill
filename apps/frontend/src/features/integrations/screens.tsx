'use client';

import { DataTable, FilterBar, LoadingState, StatusChip } from '@cdoprof/ui';
import { useMemo, useState } from 'react';

import { useCredentials, useExportTasks, useProviders, useSyncLogs } from './hooks';
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
  const [name, setName] = useState('');
  const [secret, setSecret] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);

  const onCreateCredential = async () => {
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
      <PageHeader title="Integration settings" />
      <SectionCard title="Providers registry">
        {providersLoading ? <LoadingState message="Загрузка провайдеров…" /> : null}
        {providersError ? <SectionError message={providersError} /> : null}
        {providers.length ? (
          <DataTable
            columns={[
              { key: 'code', title: 'Code' },
              { key: 'name', title: 'Name' },
              { key: 'providerType', title: 'Type' }
            ]}
            rows={providers}
          />
        ) : (
          <SectionEmpty message="Провайдеры не найдены" />
        )}
      </SectionCard>
      <SectionCard title="Tenant credentials">
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
        <FilterBar>
          <select value={providerId} onChange={(event) => setProviderId(event.target.value)}>
            <option value="">Провайдер</option>
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
              </option>
            ))}
          </select>
          <input
            placeholder="Название"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <input
            placeholder="Секрет"
            value={secret}
            onChange={(event) => setSecret(event.target.value)}
          />
          <button
            className="ui-button ui-button--primary"
            onClick={() => void onCreateCredential()}
            type="button"
            disabled={!providerId || !name || !secret}
          >
            Создать
          </button>
        </FilterBar>
        {saveError ? <SectionError message={saveError} /> : null}
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
        title="Export tasks"
        actions={
          <button onClick={() => setLive((c) => !c)}>
            {live ? 'Stop live refresh' : 'Start live refresh'}
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
      <PageHeader title="Sync logs" />
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
