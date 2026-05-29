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

import { ENTITY_STATUS_LABEL, formatEntityStatus } from './format';
import { useQuestionBanksList } from './hooks';
import { QuestionBankEditDrawer } from './question-bank-edit-drawer';
import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../components/state-wrappers';

import type { EntityStatus, QuestionBankListItem } from './types';
import type { Column } from '@cdoprof/ui';

const PAGE_SIZE = 20;

export function QuestionBanksListScreen() {
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

  const list = useQuestionBanksList(filters);
  const totalPages = list.data ? Math.max(1, Math.ceil(list.data.total / PAGE_SIZE)) : 1;

  const columns: Column<QuestionBankListItem>[] = [
    { key: 'code', title: 'Код', render: (r) => r.code ?? '—' },
    {
      key: 'title',
      title: 'Название',
      render: (r) => <Link href={`/admin/question-banks/${r.id}`}>{r.title}</Link>
    },
    { key: 'courseId', title: 'Курс', render: (r) => r.courseId ?? '—' },
    {
      key: 'status',
      title: 'Статус',
      render: (r) => <StatusChip status={formatEntityStatus(r.status)} />
    }
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Банки вопросов"
        subtitle="Контейнеры для вопросов теста: создание, фильтрация по курсу, архивирование."
        actions={
          <button type="button" className="ui-button-primary" onClick={() => setCreating(true)}>
            Создать банк
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
          {(Object.keys(ENTITY_STATUS_LABEL) as EntityStatus[]).map((s) => (
            <option key={s} value={s}>
              {ENTITY_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </FilterBar>

      <SectionCard title="Список банков">
        {list.isLoading ? (
          <LoadingState message="Загрузка…" />
        ) : list.error ? (
          <SectionError
            message={list.error instanceof Error ? list.error.message : 'Не удалось загрузить'}
            onRetry={() => void list.refetch()}
          />
        ) : !list.data || list.data.items.length === 0 ? (
          <SectionEmpty message="Банков нет" hint="Создайте первый банк вопросов." />
        ) : (
          <>
            <DataTable<QuestionBankListItem> columns={columns} rows={list.data.items} />
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </>
        )}
      </SectionCard>

      {creating ? (
        <QuestionBankEditDrawer
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
