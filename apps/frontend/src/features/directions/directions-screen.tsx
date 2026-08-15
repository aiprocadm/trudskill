'use client';

import { ListPage } from '@trudskill/ui';

import { PageContainer, PageHeader } from '../../components/state-wrappers';
import { useDirectionsList } from '../mvp/hooks';

/*
 * TPL-001 (Фаза 4, срез 17). Реестр был списком `<ul>` из одних названий: ни состояния,
 * ни кода, ни объяснения, что такое направление. Пустого состояния не было вовсе —
 * при отсутствии данных экран показывал пустую рамку.
 */
export const DirectionsPageScreen = () => {
  const { data, loading, error, refetch } = useDirectionsList({
    page: 1,
    page_size: 100,
    sort: 'name:asc'
  });

  return (
    <PageContainer>
      <PageHeader
        title="Направления обучения"
        subtitle="Группировка курсов по областям: охрана труда, пожарная безопасность, медицина"
      />
      <ListPage<{ id: string; name: string; codeView: string }>
        columns={[
          { key: 'name', title: 'Направление' },
          { key: 'codeView', title: 'Код' }
        ]}
        rows={(data?.items ?? []).map((item) => ({
          id: item.id,
          name: item.name,
          codeView: item.code || '—'
        }))}
        isLoading={loading}
        error={error ? new Error(error) : undefined}
        onRetry={() => void refetch()}
        rowKey={(row) => row.id}
        emptyMessage="Здесь появятся направления обучения"
        emptyHint="Направление объединяет курсы одной области — по нему удобно отбирать курсы и отчитываться перед регулятором."
      />
    </PageContainer>
  );
};
