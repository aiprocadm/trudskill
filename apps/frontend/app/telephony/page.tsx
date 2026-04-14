'use client';

import { DataTable, FilterBar, LoadingState } from '@cdoprof/ui';
import { useMemo, useState } from 'react';

import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../src/components/state-wrappers';
import { useCredentials, useProviders } from '../../src/features/integrations/hooks';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

export default function TelephonyPage() {
  const [search, setSearch] = useState('');
  const providers = useProviders();
  const credentials = useCredentials();
  const telephonyProviders = useMemo(
    () =>
      providers.data.filter((item) =>
        ['trainer', 'webinar', 'proctoring', 'email'].includes(item.providerType)
      ),
    [providers.data]
  );
  const filteredCredentials = useMemo(
    () => credentials.data.filter((item) => item.name.toLowerCase().includes(search.toLowerCase())),
    [credentials.data, search]
  );

  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader
          title="Телефония"
          subtitle="П. 5.20 ТЗ (опционально II–III этап) — облачная АТС, внутренние номера, CRM"
        />
        <SectionCard title="Провайдеры коммуникаций">
          {providers.loading ? <LoadingState message="Загрузка провайдеров..." /> : null}
          {providers.error ? <SectionError message={providers.error} /> : null}
          {telephonyProviders.length ? (
            <DataTable
              columns={[
                { key: 'code', title: 'Код' },
                { key: 'name', title: 'Провайдер' },
                { key: 'providerType', title: 'Тип' }
              ]}
              rows={telephonyProviders}
            />
          ) : (
            <SectionEmpty message="Провайдеры телефонии/коммуникаций не найдены" />
          )}
        </SectionCard>
        <SectionCard title="Подключения и секреты">
          <FilterBar>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Поиск по названию подключения"
            />
          </FilterBar>
          {credentials.loading ? <LoadingState message="Загрузка подключений..." /> : null}
          {credentials.error ? <SectionError message={credentials.error} /> : null}
          {filteredCredentials.length ? (
            <DataTable
              columns={[
                { key: 'name', title: 'Подключение' },
                { key: 'status', title: 'Статус' },
                { key: 'secretMasked', title: 'Секрет' }
              ]}
              rows={filteredCredentials}
            />
          ) : (
            <SectionEmpty message="Подключения не найдены" />
          )}
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
