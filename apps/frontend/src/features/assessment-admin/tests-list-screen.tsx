'use client';

import { FilterBar, ListPage, SearchInput, StatusChip } from '@trudskill/ui';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { CreateTestDrawer } from './create-test-drawer';
import { formatEntityStatus, formatTestRule } from './format';
import { useTestsList } from './hooks';
import { PageContainer, PageHeader } from '../../components/state-wrappers';
import { CourseSelect, courseNameCell, useCourseNames } from '../courses/course-picker';

import type { EntityStatus, TestListItem } from './types';
import type { ReactElement } from 'react';

const PAGE_SIZE = 20;

interface TestRow {
  id: string;
  titleView: ReactElement;
  courseView: string;
  rulesView: string;
  statusView: ReactElement;
}

/*
 * TPL-001 (Фаза 4, срез 9, волна 2). Что изменилось:
 *
 * 1. **Колонка «Курс» показывала идентификатор** — код вместо названия курса.
 * 2. Форма создания стояла постоянным блоком НАД списком и просила «ID курса» текстом:
 *    администратору надо было где-то подсмотреть идентификатор. Теперь это первичное
 *    действие в шапке, форма открывается панелью, курс выбирается по названию.
 * 3. Каркас реестра `ListPage` вместо самодельных состояний; пустой экран объясняет,
 *    что такое тест, и даёт первое действие (`CMP-014`).
 */
export function TestsListScreen() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'' | EntityStatus>('');
  const [courseId, setCourseId] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const courseNames = useCourseNames();

  const filters = useMemo(
    () => ({
      ...(q.trim() ? { q: q.trim() } : {}),
      ...(status ? { status } : {}),
      ...(courseId ? { courseId } : {}),
      page,
      pageSize: PAGE_SIZE
    }),
    [q, status, courseId, page]
  );

  const list = useTestsList(filters);
  const totalPages = list.data ? Math.max(1, Math.ceil(list.data.total / PAGE_SIZE)) : 1;

  /* Отбор по курсу делает сервер — см. пояснение в списке банков вопросов (журнал 389). */
  const items: TestListItem[] = list.data?.items ?? [];

  const rows: TestRow[] = items.map((test) => ({
    id: test.id,
    titleView: (
      <Link className="ui-link" href={`/admin/tests/${test.id}`}>
        {test.title}
      </Link>
    ),
    courseView: courseNameCell(courseNames, test.courseId),
    rulesView: formatTestRule(test.rules).slice(0, 2).join(' · '),
    statusView: <StatusChip status={test.status} label={formatEntityStatus(test.status)} />
  }));

  return (
    <PageContainer>
      <PageHeader
        title="Тесты"
        subtitle="Проверка знаний по курсу: правила, вопросы из банка, публикация"
        primaryAction={{ label: 'Создать тест', onSelect: () => setCreating(true) }}
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
            <CourseSelect
              value={courseId}
              onChange={(value) => {
                setCourseId(value);
                setPage(1);
              }}
              label="Курс"
            />
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
                <option value="draft">Черновик</option>
                <option value="published">Опубликован</option>
                <option value="archived">В архиве</option>
              </select>
            </label>
          </>
        }
      />

      <ListPage<TestRow>
        columns={[
          { key: 'titleView', title: 'Название', render: (row) => row.titleView },
          { key: 'courseView', title: 'Курс' },
          { key: 'rulesView', title: 'Как проходит' },
          { key: 'statusView', title: 'Статус', render: (row) => row.statusView }
        ]}
        rows={rows}
        isLoading={list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        rowKey={(row) => row.id}
        emptyMessage="Здесь появятся тесты"
        emptyHint="Тест — это набор вопросов из банка с правилами прохождения: сколько попыток, сколько времени, какой балл считается зачётом."
        emptyAction={{ label: 'Создать первый тест', onSelect: () => setCreating(true) }}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
      />

      <CreateTestDrawer
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={() => void list.refetch()}
      />
    </PageContainer>
  );
}
