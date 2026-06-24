'use client';

import {
  DataTable,
  FilterBar,
  LoadingState,
  Pagination,
  SearchInput,
  StatusChip
} from '@trudskill/ui';
import { useMemo, useState } from 'react';

import { STATUS_LABEL, formatFullName, formatSnils } from './format';
import { useLearnersList } from './hooks';
import { LearnerEditDrawer } from './learner-edit-drawer';
import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../components/state-wrappers';

import type { LearnerListItem, LearnerStatus, LearnersListFilters } from './types';
import type { Column } from '@trudskill/ui';

const PAGE_SIZE = 20;

export function LearnersListScreen() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'' | LearnerStatus>('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<LearnerListItem | null>(null);

  const filters: LearnersListFilters = useMemo(
    () => ({
      ...(q.trim() ? { q: q.trim() } : {}),
      ...(status ? { status } : {}),
      page,
      pageSize: PAGE_SIZE
    }),
    [q, status, page]
  );

  const list = useLearnersList(filters);

  const columns: Column<LearnerListItem>[] = [
    {
      key: 'lastName',
      title: 'ФИО',
      render: (row) => formatFullName(row)
    },
    {
      key: 'email',
      title: 'Email',
      render: (row) => row.email ?? '—'
    },
    {
      key: 'snils',
      title: 'СНИЛС',
      render: (row) => formatSnils(row.snils)
    },
    {
      key: 'position',
      title: 'Должность',
      render: (row) => row.position ?? '—'
    },
    {
      key: 'organizationUnitId',
      title: 'Подразделение',
      render: (row) => row.organizationUnitId ?? '—'
    },
    {
      key: 'status',
      title: 'Статус',
      render: (row) => <StatusChip status={STATUS_LABEL[row.status]} />
    },
    {
      key: 'id',
      title: '',
      render: (row) => (
        <button type="button" className="ui-button-link" onClick={() => setEditing(row)}>
          Редактировать
        </button>
      )
    }
  ];

  const totalPages = list.data ? Math.max(1, Math.ceil(list.data.total / PAGE_SIZE)) : 1;

  return (
    <PageContainer>
      <PageHeader
        title="Ученики"
        subtitle="Список учётных записей слушателей с поиском, фильтрацией и редактированием."
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
            setStatus(e.target.value as '' | LearnerStatus);
            setPage(1);
          }}
          aria-label="Статус"
        >
          <option value="">Все статусы</option>
          <option value="active">{STATUS_LABEL.active}</option>
          <option value="archived">{STATUS_LABEL.archived}</option>
        </select>
      </FilterBar>

      <SectionCard title="Список учеников">
        {list.isLoading ? (
          <LoadingState message="Загрузка…" />
        ) : list.error ? (
          <SectionError
            message={
              list.error instanceof Error ? list.error.message : 'Не удалось загрузить список'
            }
            onRetry={() => void list.refetch()}
          />
        ) : !list.data || list.data.items.length === 0 ? (
          <SectionEmpty
            message="Учеников нет"
            hint="По текущим фильтрам ни одной записи не найдено."
          />
        ) : (
          <>
            <DataTable<LearnerListItem> columns={columns} rows={list.data.items} />
            <Pagination page={page} totalPages={totalPages} onPageChange={(p) => setPage(p)} />
          </>
        )}
      </SectionCard>

      {editing ? (
        <LearnerEditDrawer
          learner={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void list.refetch();
          }}
        />
      ) : null}
    </PageContainer>
  );
}
