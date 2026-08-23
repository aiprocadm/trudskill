'use client';

import { FilterBar, ListPage, SearchInput, StatusChip } from '@trudskill/ui';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { ENTITY_STATUS_LABEL, formatEntityStatus } from './format';
import { useQuestionBanksList } from './hooks';
import { QuestionBankEditDrawer } from './question-bank-edit-drawer';
import { PageContainer, PageHeader } from '../../components/state-wrappers';
import { CourseSelect, courseNameCell, useCourseNames } from '../courses/course-picker';

import type { EntityStatus } from './types';
import type { ReactElement } from 'react';

interface BankRow {
  id: string;
  codeView: string;
  titleView: ReactElement;
  courseView: string;
  statusView: ReactElement;
}

const PAGE_SIZE = 20;

export function QuestionBanksListScreen() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'' | EntityStatus>('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [courseId, setCourseId] = useState('');
  const courseNames = useCourseNames();

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

  // Фильтр по курсу сервер не принимает — отбираем на месте, по уже полученной странице.
  const rows: BankRow[] = (list.data?.items ?? [])
    .filter((item) => !courseId || item.courseId === courseId)
    .map((item) => ({
      id: item.id,
      codeView: item.code ?? '—',
      titleView: (
        <Link className="ui-link" href={`/admin/question-banks/${item.id}`}>
          {item.title}
        </Link>
      ),
      courseView: courseNameCell(courseNames, item.courseId),
      statusView: <StatusChip status={item.status} label={formatEntityStatus(item.status)} />
    }));

  return (
    <PageContainer>
      <PageHeader
        title="Банки вопросов"
        subtitle="Наборы вопросов, из которых собираются тесты курса"
        primaryAction={{ label: 'Создать банк', onSelect: () => setCreating(true) }}
      />

      <FilterBar
        activeCount={[q, status, courseId].filter(Boolean).length}
        onReset={() => {
          setQ('');
          setStatus('');
          setCourseId('');
          setPage(1);
        }}
        primary={
          <>
            <SearchInput
              value={q}
              onChange={(value) => {
                setQ(value);
                setPage(1);
              }}
            />
            <CourseSelect value={courseId} onChange={setCourseId} label="Курс" />
            <label className="ui-field">
              <span className="ui-field-label">Статус</span>
              <select
                className="ui-select"
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value as '' | EntityStatus);
                  setPage(1);
                }}
              >
                <option value="">Любое</option>
                {(Object.keys(ENTITY_STATUS_LABEL) as EntityStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {ENTITY_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
          </>
        }
      />

      <ListPage<BankRow>
        columns={[
          { key: 'codeView', title: 'Код' },
          { key: 'titleView', title: 'Название', render: (row) => row.titleView },
          { key: 'courseView', title: 'Курс' },
          { key: 'statusView', title: 'Статус', render: (row) => row.statusView }
        ]}
        rows={rows}
        isLoading={list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        rowKey={(row) => row.id}
        emptyMessage="Здесь появятся банки вопросов"
        emptyHint="Банк — это набор вопросов по теме. Тест берёт вопросы из банка, поэтому банк заводят первым."
        emptyAction={{ label: 'Создать первый банк', onSelect: () => setCreating(true) }}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
      />

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
