'use client';

import { ListPage, SearchInput, StatusChip } from '@trudskill/ui';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { AssignmentEditDrawer } from './assignment-edit-drawer';
import { formatEntityStatus } from './format';
import { useAssignmentsList } from './hooks';
import { PageContainer, PageHeader } from '../../components/state-wrappers';
import { CourseSelect, courseNameCell, useCourseNames } from '../courses/course-picker';

import type { EntityStatus } from './types';
import type { ReactElement } from 'react';

interface AssignmentRow {
  id: string;
  titleView: ReactElement;
  courseView: string;
  maxScoreView: string;
  reviewView: string;
  statusView: ReactElement;
}

const PAGE_SIZE = 20;

export function AssignmentsListScreen() {
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
      ...(courseId ? { courseId } : {}),
      page,
      pageSize: PAGE_SIZE
    }),
    [q, status, courseId, page]
  );

  const list = useAssignmentsList(filters);
  const totalPages = list.data ? Math.max(1, Math.ceil(list.data.total / PAGE_SIZE)) : 1;

  /* Отбор по курсу делает сервер — см. пояснение в списке банков вопросов (журнал 389). */
  const rows: AssignmentRow[] = (list.data?.items ?? []).map((item) => ({
    id: item.id,
    titleView: (
      <Link className="ui-link" href={`/admin/assignments/${item.id}`}>
        {item.title}
      </Link>
    ),
    courseView: courseNameCell(courseNames, item.courseId),
    maxScoreView: `${item.maxScore}`,
    reviewView: item.isReviewRequired ? 'Проверяет преподаватель' : 'Проверяется автоматически',
    statusView: <StatusChip status={item.status} label={formatEntityStatus(item.status)} />
  }));

  return (
    <PageContainer>
      <PageHeader
        title="Задания"
        subtitle="Практические работы, которые слушатель выполняет и сдаёт на проверку"
        primaryAction={{ label: 'Создать задание', onSelect: () => setCreating(true) }}
      />

      <ListPage<AssignmentRow>
        /*
          ТЗ 5.6 (Э6): панель отбора — слот каркаса, а не отдельный блок рядом. Порядок
          «быстрые отборы → поиск и фильтры → колонки → таблица → массовые действия»
          считает каркас, экран лишь передаёт содержимое.
        */
        filters={
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
        activeFilterCount={[q, status, courseId].filter(Boolean).length}
        onResetFilters={() => {
          setQ('');
          setStatus('');
          setCourseId('');
          setPage(1);
        }}
        columns={[
          { key: 'titleView', title: 'Название', render: (row) => row.titleView },
          { key: 'courseView', title: 'Курс' },
          { key: 'maxScoreView', title: 'Максимальный балл' },
          { key: 'reviewView', title: 'Как проверяется' },
          { key: 'statusView', title: 'Статус', render: (row) => row.statusView }
        ]}
        rows={rows}
        isLoading={list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        rowKey={(row) => row.id}
        emptyMessage="Здесь появятся задания"
        emptyHint="Задание — практическая работа, которую слушатель выполняет и сдаёт: её проверяет преподаватель или система."
        emptyAction={{ label: 'Создать первое задание', onSelect: () => setCreating(true) }}
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
      />

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
