'use client';

import { ListPage, StatusChip } from '@trudskill/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { PageContainer, PageHeader, SectionCard } from '../../components/state-wrappers';
import { hasPermission } from '../../lib/rbac/permissions';
import { useAuth } from '../auth/context';
import { useGroupsList } from '../mvp/hooks';

import type { Group } from '../mvp/types';

const PAGE_SIZE = 20;

/*
 * TPL-001 (Фаза 4 срез 3). Было: маркированный список ссылок `<ul><li>` — ни статуса,
 * ни кода, ни действия, и пустое состояние сообщало «Нет групп» (формулировка запрещена
 * TXT-005). Стало: таблица со статусом словом, действие строки и пустой экран, который
 * объясняет, что это за раздел и что сделать первым.
 *
 * Выделение строк (CMP-001) здесь НЕ включено намеренно: массового действия для групп в
 * API нет — закрытие группы требует выбора шаблонов протокола и удостоверения и делается
 * по одной. Ставить чекбоксы, за которыми нет операции, — обман интерфейса; записано
 * в журнал расхождений.
 */
export const GroupsPageScreen = () => {
  const { session } = useAuth();
  const router = useRouter();
  const canCreateGroup = hasPermission(session?.permissions ?? [], 'groups.write');
  const [page, setPage] = useState(1);
  const { data, loading, error } = useGroupsList({ page, page_size: PAGE_SIZE });

  const totalPages = data?.total ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <PageContainer>
      <PageHeader
        title="Группы"
        subtitle="Учебные группы центра: состав, назначенные курсы, закрытие с выдачей документов."
        {...(canCreateGroup
          ? { primaryAction: { label: 'Создать группу', href: '/groups/new' } }
          : {})}
      />
      <SectionCard title="Реестр групп">
        {/* GOAL-4 волна 4: реестр групп на общем каркасе. */}
        <ListPage<Group>
          isLoading={loading}
          error={error ? new Error(error) : undefined}
          rows={data?.items ?? []}
          emptyMessage="Групп пока нет"
          emptyHint="Группа объединяет слушателей одной программы: по ней назначают курсы, ведут журнал часов и выдают документы."
          {...(canCreateGroup
            ? { emptyAction: { label: 'Создать первую группу', href: '/groups/new' } }
            : {})}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
          columns={[
            {
              key: 'name',
              title: 'Название',
              render: (row) => <Link href={`/groups/${row.id}`}>{row.name}</Link>
            },
            { key: 'code', title: 'Код' },
            {
              key: 'status',
              title: 'Статус',
              render: (row) => <StatusChip status={row.status} />
            }
          ]}
          rowActions={(row) => [
            { label: 'Открыть группу', onSelect: () => router.push(`/groups/${row.id}`) }
          ]}
        />
      </SectionCard>
    </PageContainer>
  );
};
