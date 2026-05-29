'use client';

import {
  DataTable,
  FilterBar,
  LoadingState,
  Pagination,
  SearchInput,
  StatusChip
} from '@cdoprof/ui';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { AssignmentEditDrawer } from './assignment-edit-drawer';
import { formatEntityStatus } from './format';
import { useAssignmentsList } from './hooks';
import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../components/state-wrappers';

import type { AssignmentListItem, EntityStatus } from './types';
import type { Column } from '@cdoprof/ui';

const PAGE_SIZE = 20;

export function AssignmentsListScreen() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'' | EntityStatus>('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);

  const filters = useMemo(
    () => ({
      ...(q.trim() ? { q: q.trim() } : {}),
      ...(status ? { status } : {}),
      page,
      pageSize: PAGE_SIZE
    }),
    [q, status, page]
  );

  const list = useAssignmentsList(filters);
  const totalPages = list.data ? Math.max(1, Math.ceil(list.data.total / PAGE_SIZE)) : 1;

  const columns: Column<AssignmentListItem>[] = [
    {
      key: 'title',
      title: 'Название',
      render: (a) => <Link href={`/admin/assignments/${a.id}`}>{a.title}</Link>
    },
    { key: 'courseId', title: 'Курс', render: (a) => a.courseId },
    { key: 'maxScore', title: 'Макс балл', render: (a) => a.maxScore.toString() },
    {
      key: 'isReviewRequired',
      title: 'Ревью',
      render: (a) => (a.isReviewRequired ? 'Требуется' : 'Не требуется')
    },
    {
      key: 'status',
      title: 'Статус',
      render: (a) => <StatusChip status={formatEntityStatus(a.status)} />
    }
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Задания"
        subtitle="Шаблоны практических работ: создание, ревью, архив."
        actions={
          <button type="button" className="ui-button-primary" onClick={() => setCreating(true)}>
            Создать задание
          </button>
        }
      />

      <FilterBar>
        <SearchInput
          value={q}
          onChange={(v) => {
            setQ(v);
            setPage(1);
          }}
        />
        <select
          className="ui-select"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as '' | EntityStatus);
            setPage(1);
          }}
          aria-label="Статус"
        >
          <option value="">Все статусы</option>
          <option value="draft">Черновик</option>
          <option value="published">Опубликован</option>
          <option value="archived">В архиве</option>
        </select>
      </FilterBar>

      <SectionCard title="Список заданий">
        {list.isLoading ? (
          <LoadingState message="Загрузка…" />
        ) : list.error ? (
          <SectionError
            message={list.error instanceof Error ? list.error.message : 'Не удалось загрузить'}
            onRetry={() => void list.refetch()}
          />
        ) : !list.data || list.data.items.length === 0 ? (
          <SectionEmpty message="Заданий нет" hint="Создайте первое задание." />
        ) : (
          <>
            <DataTable<AssignmentListItem> columns={columns} rows={list.data.items} />
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </>
        )}
      </SectionCard>

      {creating && (
        <AssignmentEditDrawer
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            void list.refetch();
          }}
        />
      )}
    </PageContainer>
  );
}
