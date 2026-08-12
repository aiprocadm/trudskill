'use client';

import {
  AsyncSection,
  BulkActionBar,
  ColumnPicker,
  ConfirmDialog,
  DataTable,
  FilterBar,
  Pagination,
  SearchInput,
  StatusChip
} from '@trudskill/ui';
import { useMemo, useState } from 'react';

import { STATUS_LABEL, formatFullName, formatSnils } from './format';
import { useArchiveLearners, useLearnersList } from './hooks';
import { LearnerEditDrawer } from './learner-edit-drawer';
import { PageContainer, PageHeader } from '../../components/state-wrappers';

import type { LearnerListItem, LearnerStatus, LearnersListFilters } from './types';
import type { BulkOutcome, Column, RowKey } from '@trudskill/ui';

const PAGE_SIZE = 20;

/*
 * Эталонный реестр (Фаза 2 редизайна): выделение строк, массовое действие с поимённым
 * частичным успехом, настройка колонок, панель деталей без ухода со списка.
 *
 * Колонка «Подразделение» скрыта по умолчанию: сервер отдаёт идентификатор, а не название,
 * и показывать пользователю `ou_1f2e…` — прямое нарушение правила «ни одного сырого ID».
 * Справочник названий потребовал бы новой ручки API — вне границ фазы, записано в журнал.
 */
const DEFAULT_COLUMNS = ['lastName', 'email', 'snils', 'position', 'status'];

export function LearnersListScreen() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'' | LearnerStatus>('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<LearnerListItem | null>(null);
  const [selected, setSelected] = useState<RowKey[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(DEFAULT_COLUMNS);
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const [outcome, setOutcome] = useState<BulkOutcome | undefined>(undefined);

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
  const archive = useArchiveLearners();
  const rows = list.data?.items ?? [];

  const columns: Column<LearnerListItem>[] = [
    { key: 'lastName', title: 'ФИО', render: (row) => formatFullName(row) },
    { key: 'email', title: 'Электронная почта', render: (row) => row.email ?? '—' },
    { key: 'snils', title: 'СНИЛС', render: (row) => formatSnils(row.snils) },
    { key: 'position', title: 'Должность', render: (row) => row.position ?? '—' },
    {
      key: 'organizationUnitId',
      title: 'Подразделение',
      render: (row) => row.organizationUnitId ?? '—'
    },
    {
      key: 'status',
      title: 'Статус',
      render: (row) => <StatusChip status={STATUS_LABEL[row.status]} />
    }
  ];

  const totalPages = list.data ? Math.max(1, Math.ceil(list.data.total / PAGE_SIZE)) : 1;
  const activeFilters = (q.trim() ? 1 : 0) + (status ? 1 : 0);

  const selectedLearners = rows.filter((row) => selected.includes(row.id));

  const runArchive = async () => {
    setConfirmingArchive(false);
    const result = await archive.run(selectedLearners);
    setOutcome(result);
    setSelected([]);
    void list.refetch();
  };

  return (
    <PageContainer>
      <PageHeader
        title="Слушатели"
        subtitle="Реестр слушателей: поиск, массовые операции и правка карточки без ухода со списка."
      />

      <div className="ui-stack">
        <FilterBar
          primary={
            <>
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
            </>
          }
          activeCount={activeFilters}
          onReset={() => {
            setQ('');
            setStatus('');
            setPage(1);
          }}
          extra={
            <ColumnPicker
              columns={columns.map((c) => ({ key: String(c.key), title: c.title }))}
              visibleKeys={visibleColumns}
              onChange={setVisibleColumns}
            />
          }
        />

        <AsyncSection
          isLoading={list.isLoading}
          error={list.error}
          isEmpty={rows.length === 0}
          onRetry={() => void list.refetch()}
          emptyMessage="Слушателей пока нет"
          emptyHint="Здесь появятся люди, которых вы зачислите на обучение. Начните с добавления первого."
        >
          <DataTable<LearnerListItem>
            columns={columns}
            rows={rows}
            visibleColumnKeys={visibleColumns}
            selectable
            selectedKeys={selected}
            onSelectionChange={setSelected}
            rowActions={(row) => [{ label: 'Открыть карточку', onSelect: () => setEditing(row) }]}
          />
          <Pagination page={page} totalPages={totalPages} onPageChange={(p) => setPage(p)} />
        </AsyncSection>

        <BulkActionBar
          selectedCount={selected.length}
          isRunning={archive.isRunning}
          {...(outcome ? { outcome } : {})}
          actions={[
            {
              label: 'Архивировать',
              danger: true,
              onSelect: () => setConfirmingArchive(true)
            }
          ]}
          onClear={() => {
            setSelected([]);
            setOutcome(undefined);
          }}
        />
      </div>

      {confirmingArchive ? (
        <ConfirmDialog
          title="Архивировать слушателей"
          message={`Выбрано: ${selected.length}. Архивные слушатели не участвуют в новых зачислениях; данные и документы сохраняются.`}
          confirmLabel="Архивировать"
          onConfirm={() => void runArchive()}
          onCancel={() => setConfirmingArchive(false)}
        />
      ) : null}

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
