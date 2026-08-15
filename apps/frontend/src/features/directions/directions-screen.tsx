'use client';

import { AsyncSection } from '@trudskill/ui';

import { PageContainer, PageHeader, SectionCard } from '../../components/state-wrappers';
import { useDirectionsList } from '../mvp/hooks';

/*
 * Перенесён «как есть» из features/mvp/screens.tsx (§8.3, порядок 9; правило SCR-001).
 * Редизайн — следующим коммитом.
 */

export const DirectionsPageScreen = () => {
  const { data, loading, error } = useDirectionsList({ page: 1, page_size: 20, sort: 'name:asc' });
  return (
    <PageContainer>
      <PageHeader title="Направления" />
      <SectionCard title="Реестр направлений">
        <AsyncSection
          isLoading={loading}
          error={error ? new Error(error) : undefined}
          loadingMessage="Загрузка…"
        >
          <ul>
            {(data?.items ?? []).map((item) => (
              <li key={item.id}>{item.name}</li>
            ))}
          </ul>
        </AsyncSection>
      </SectionCard>
    </PageContainer>
  );
};
