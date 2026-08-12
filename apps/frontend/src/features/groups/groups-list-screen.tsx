'use client';

import { AsyncSection } from '@trudskill/ui';
import Link from 'next/link';
import { useState } from 'react';

import { PageContainer, PageHeader, SectionCard } from '../../components/state-wrappers';
import { hasPermission } from '../../lib/rbac/permissions';
import { useAuth } from '../auth/context';
import { useGroupsList } from '../mvp/hooks';
import { PaginationControls } from '../mvp/screen-helpers';

/*
 * Перенесён «как есть» из features/mvp/screens.tsx (§8.3, порядок 2; правило SCR-001:
 * перенос и редизайн — разные шаги). Редизайн под TPL-001 (ListPage, выделение,
 * «Закрыть группы») — следующий срез.
 */
export const GroupsPageScreen = () => {
  const { session } = useAuth();
  const canCreateGroup = hasPermission(session?.permissions ?? [], 'groups.write');
  const [page, setPage] = useState(1);
  const { data, loading, error } = useGroupsList({ page, page_size: 20 });
  return (
    <PageContainer>
      <PageHeader
        title="Группы"
        actions={
          canCreateGroup ? (
            <Link href="/groups/new">Создать группу</Link>
          ) : (
            <small>Недостаточно прав для создания группы</small>
          )
        }
      />
      <SectionCard title="Реестр групп">
        <AsyncSection
          isLoading={loading}
          error={error ? new Error(error) : undefined}
          isEmpty={!data?.items.length}
          loadingMessage="Загрузка…"
          emptyMessage="Нет групп"
        >
          <ul>
            {(data?.items ?? []).map((group) => (
              <li key={group.id}>
                <Link href={`/groups/${group.id}`}>{group.name}</Link>
              </li>
            ))}
          </ul>
        </AsyncSection>
        <PaginationControls page={page} setPage={setPage} total={data?.total} pageSize={20} />
      </SectionCard>
    </PageContainer>
  );
};
