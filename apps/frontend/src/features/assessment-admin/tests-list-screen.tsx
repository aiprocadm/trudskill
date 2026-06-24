'use client';

import {
  DataTable,
  FilterBar,
  LoadingState,
  Pagination,
  SearchInput,
  StatusChip
} from '@trudskill/ui';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { formatEntityStatus, formatTestRule } from './format';
import { useCreateTest, useTestsList } from './hooks';
import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../components/state-wrappers';

import type { EntityStatus, TestListItem } from './types';
import type { Column } from '@trudskill/ui';

const PAGE_SIZE = 20;

export function TestsListScreen() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'' | EntityStatus>('');
  const [page, setPage] = useState(1);
  const [creatingTitle, setCreatingTitle] = useState('');
  const [creatingCourseId, setCreatingCourseId] = useState('');
  const createTest = useCreateTest();

  const filters = useMemo(
    () => ({
      ...(q.trim() ? { q: q.trim() } : {}),
      ...(status ? { status } : {}),
      page,
      pageSize: PAGE_SIZE
    }),
    [q, status, page]
  );

  const list = useTestsList(filters);
  const totalPages = list.data ? Math.max(1, Math.ceil(list.data.total / PAGE_SIZE)) : 1;

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!creatingTitle.trim() || !creatingCourseId.trim()) return;
    const result = await createTest.mutate({
      courseId: creatingCourseId.trim(),
      title: creatingTitle.trim()
    });
    if (result) {
      setCreatingTitle('');
      setCreatingCourseId('');
      void list.refetch();
    }
  };

  const columns: Column<TestListItem>[] = [
    {
      key: 'title',
      title: 'Название',
      render: (t) => <Link href={`/admin/tests/${t.id}`}>{t.title}</Link>
    },
    { key: 'courseId', title: 'Курс', render: (t) => t.courseId },
    {
      key: 'rules',
      title: 'Правила',
      render: (t) => formatTestRule(t.rules).slice(0, 2).join(' · ')
    },
    {
      key: 'status',
      title: 'Статус',
      render: (t) => <StatusChip status={formatEntityStatus(t.status)} />
    }
  ];

  return (
    <PageContainer>
      <PageHeader
        title="Тесты"
        subtitle="Тесты курса: правила, подбор вопросов из банка, публикация."
      />

      <SectionCard title="Создать новый">
        <form className="ui-inline" onSubmit={onCreate}>
          <input
            type="text"
            className="ui-input"
            value={creatingCourseId}
            onChange={(e) => setCreatingCourseId(e.target.value)}
            placeholder="ID курса"
            required
          />
          <input
            type="text"
            className="ui-input"
            value={creatingTitle}
            onChange={(e) => setCreatingTitle(e.target.value)}
            placeholder="Название теста"
            required
          />
          <button
            type="submit"
            className="ui-button-primary"
            disabled={createTest.isPending || !creatingTitle.trim() || !creatingCourseId.trim()}
          >
            {createTest.isPending ? 'Создание…' : 'Создать'}
          </button>
        </form>
        {createTest.error ? <p className="ui-field-error">{createTest.error}</p> : null}
      </SectionCard>

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

      <SectionCard title="Список тестов">
        {list.isLoading ? (
          <LoadingState message="Загрузка…" />
        ) : list.error ? (
          <SectionError
            message={list.error instanceof Error ? list.error.message : 'Не удалось загрузить'}
            onRetry={() => void list.refetch()}
          />
        ) : !list.data || list.data.items.length === 0 ? (
          <SectionEmpty message="Тестов нет" hint="Создайте первый тест выше." />
        ) : (
          <>
            <DataTable<TestListItem> columns={columns} rows={list.data.items} />
            <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
          </>
        )}
      </SectionCard>
    </PageContainer>
  );
}
