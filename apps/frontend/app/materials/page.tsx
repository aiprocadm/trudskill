'use client';

import { DataTable, FilterBar, LoadingState } from '@cdoprof/ui';
import Link from 'next/link';
import { useState } from 'react';

import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../src/components/state-wrappers';
import { useMaterials } from '../../src/features/mvp/hooks';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

export default function MaterialsHubPage() {
  const [moduleId, setModuleId] = useState('');
  const { data, loading, error } = useMaterials(moduleId || undefined);

  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader title="Учебный контент" subtitle="Модули и материалы курса (п. 5.5 ТЗ)" />
        <SectionCard title="Реестр материалов">
          <FilterBar>
            <input
              value={moduleId}
              onChange={(event) => setModuleId(event.target.value)}
              placeholder="Фильтр по module_id"
            />
            <Link href="/courses">Открыть карточки курсов</Link>
          </FilterBar>
          {loading ? <LoadingState message="Загрузка материалов..." /> : null}
          {error ? <SectionError message={error} /> : null}
          {!loading && !error && !data?.items.length ? (
            <SectionEmpty
              message="Материалы не найдены"
              hint="Добавьте материалы в карточке курса."
            />
          ) : null}
          {data?.items.length ? (
            <DataTable
              columns={[
                { key: 'title', title: 'Название' },
                { key: 'materialType', title: 'Тип' },
                { key: 'moduleId', title: 'Модуль' },
                { key: 'minViewSeconds', title: 'Мин. просмотр (сек)' }
              ]}
              rows={data.items}
            />
          ) : null}
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
