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

import { ClientEditDrawer } from './client-edit-drawer';
import { CLIENT_STATUS_LABEL, formatInn, formatPhone } from './format';
import { useClientsList } from './hooks';
import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../components/state-wrappers';

import type { ClientListItem, ClientStatus, ClientsListFilters } from './types';
import type { Column } from '@cdoprof/ui';

const PAGE_SIZE = 20;

export function ClientsListScreen() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'' | ClientStatus>('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);

  const filters: ClientsListFilters = useMemo(
    () => ({
      ...(q.trim() ? { q: q.trim() } : {}),
      ...(status ? { status } : {}),
      page,
      pageSize: PAGE_SIZE
    }),
    [q, status, page]
  );

  const list = useClientsList(filters);

  const columns: Column<ClientListItem>[] = [
    {
      key: 'code',
      title: 'Код',
      render: (row) => row.code
    },
    {
      key: 'name',
      title: 'Название',
      render: (row) => <Link href={`/admin/clients/${row.id}`}>{row.name}</Link>
    },
    {
      key: 'inn',
      title: 'ИНН',
      render: (row) => formatInn(row.inn)
    },
    {
      key: 'contactEmail',
      title: 'Email',
      render: (row) => row.contactEmail ?? '—'
    },
    {
      key: 'contactPhone',
      title: 'Телефон',
      render: (row) => formatPhone(row.contactPhone)
    },
    {
      key: 'status',
      title: 'Статус',
      render: (row) => <StatusChip status={CLIENT_STATUS_LABEL[row.status]} />
    }
  ];

  const totalPages = list.data ? Math.max(1, Math.ceil(list.data.total / PAGE_SIZE)) : 1;

  return (
    <PageContainer>
      <PageHeader
        title="Компании"
        subtitle="Компании-заказчики обучения: создание, поиск, редактирование контактов, прогресс по группам."
        actions={
          <button type="button" className="ui-button-primary" onClick={() => setCreating(true)}>
            Добавить компанию
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
            setStatus(e.target.value as '' | ClientStatus);
            setPage(1);
          }}
          aria-label="Статус"
        >
          <option value="">Все статусы</option>
          <option value="active">{CLIENT_STATUS_LABEL.active}</option>
          <option value="archived">{CLIENT_STATUS_LABEL.archived}</option>
        </select>
      </FilterBar>

      <SectionCard title="Список компаний">
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
            message="Компаний нет"
            hint="По текущим фильтрам ни одной записи не найдено."
          />
        ) : (
          <>
            <DataTable<ClientListItem> columns={columns} rows={list.data.items} />
            <Pagination page={page} totalPages={totalPages} onPageChange={(p) => setPage(p)} />
          </>
        )}
      </SectionCard>

      {creating ? (
        <ClientEditDrawer
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            void list.refetch();
          }}
        />
      ) : null}
    </PageContainer>
  );
}
