'use client';

import {
  BlockedHint,
  BulkActionBar,
  ListPage,
  SavedViews,
  StatusChip,
  blockedProps,
  useConfirmDialog
} from '@trudskill/ui';
import { useMemo, useState } from 'react';

import { formatAssignees, formatDue, formatLinks, isOverdue, localToIso } from './format';
import { useTaskMutations, useTasksList } from './hooks';
import { readTaskViews, taskPresetViews, writeTaskViews } from './saved-views';
import { StaffSelect } from './staff-select';
import { TaskCreateDrawer } from './task-create-drawer';
import { TaskDrawer } from './task-drawer';
import { TASK_STATUS_LABEL, TASK_STATUS_TONE } from './types';
import { PageContainer, PageHeader } from '../../components/state-wrappers';
import { hasPermission } from '../../lib/rbac/permissions';
import { useAuth } from '../auth/context';

import type { Task, TaskListFilter, TasksListFilters } from './types';
import type { BulkOutcome, Column, RowKey, SavedView } from '@trudskill/ui';

/** Решение Р16: страница списка — 50. */
const PAGE_SIZE = 50;

/**
 * Реестр задач сотрудников (`TPL-001`, ТЗ перехода с CDOPROF §5.4 МГ-G2.3).
 *
 * Быстрые отборы: «Поставленные мне» (по умолчанию) · «Поставленные мною» · «Просроченные» ·
 * «Выполненные» · «Все» — последний только с `tasks.manage_all` (иначе сервер ответит 403,
 * и показывать отбор, который не откроется, значит обещать лишнее). Фильтры доходят до
 * сервера как есть: срок с/по, метка; исполнитель — под «Ещё фильтры» и только с `manage_all`.
 * Колонки: задача, срок, исполнители, объект, статус — пять из семи допустимых.
 * Массово: «Выполнить», «Перенести», «Отменить» — частичный успех поимённо (`CMP-011`).
 * Excel-выгрузка — вместе с каталогом отчётов (позиция 12).
 */
export function TasksListScreen() {
  const { session } = useAuth();
  const permissions = session?.permissions ?? [];
  const canWrite = hasPermission(permissions, 'tasks.write');
  const manageAll = hasPermission(permissions, 'tasks.manage_all');

  const [filter, setFilter] = useState<TaskListFilter>('assigned_to_me');
  const [assignee, setAssignee] = useState('');
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');
  const [label, setLabel] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<RowKey[]>([]);
  const [outcome, setOutcome] = useState<BulkOutcome | undefined>(undefined);
  const [opened, setOpened] = useState<Task | null>(null);
  const [creating, setCreating] = useState(false);
  const [bulkDue, setBulkDue] = useState('');
  const [bulkRescheduling, setBulkRescheduling] = useState(false);
  /* CMP-012: свои отборы читаются один раз — хранилище браузера синхронное. */
  const [ownViews, setOwnViews] = useState<SavedView[]>(() => readTaskViews());
  const { ask, dialog } = useConfirmDialog();

  const filters: TasksListFilters = useMemo(
    () => ({
      filter,
      ...(assignee ? { assignee } : {}),
      ...(dueFrom ? { dueFrom: `${dueFrom}T00:00:00.000Z` } : {}),
      ...(dueTo ? { dueTo: `${dueTo}T23:59:59.999Z` } : {}),
      ...(label.trim() ? { label: label.trim() } : {}),
      page,
      pageSize: PAGE_SIZE
    }),
    [filter, assignee, dueFrom, dueTo, label, page]
  );

  const list = useTasksList(filters);
  const mutations = useTaskMutations();
  const { isPending } = mutations;
  const rows = list.data?.items ?? [];
  const totalPages = list.data ? Math.max(1, Math.ceil(list.data.total / PAGE_SIZE)) : 1;
  const activeCount =
    (assignee ? 1 : 0) + (dueFrom ? 1 : 0) + (dueTo ? 1 : 0) + (label.trim() ? 1 : 0);

  /* CMP-012: предустановленные отборы ТЗ + свои (в браузере). Активен тот, чей отбор стоит сейчас. */
  const views: SavedView[] = [...taskPresetViews(manageAll), ...ownViews];
  const activeView =
    activeCount === 0
      ? views.find((view) => view.query.filter === filter && !view.id.startsWith('own-'))
      : ownViews.find((view) => view.query.filter === filter && view.query.label === label.trim());

  const columns: Column<Task>[] = [
    { key: 'title', title: 'Задача', render: (row) => row.title },
    {
      key: 'dueAt',
      title: 'Срок',
      render: (row) => (
        <span className={isOverdue(row) ? 'ui-badge ui-badge--danger' : undefined}>
          {formatDue(row.dueAt)}
        </span>
      )
    },
    { key: 'assignees', title: 'Исполнители', render: (row) => formatAssignees(row) },
    { key: 'links', title: 'Объект', render: (row) => formatLinks(row) },
    {
      key: 'status',
      title: 'Статус',
      render: (row) => (
        <StatusChip status={TASK_STATUS_TONE[row.status]} label={TASK_STATUS_LABEL[row.status]} />
      )
    }
  ];

  const selectedIds = rows.filter((row) => selected.includes(row.id)).map((row) => row.id);

  const runBulk = async (
    action: 'complete' | 'cancel' | 'reschedule',
    payload?: { dueAt?: string }
  ) => {
    const result = await mutations.bulk(selectedIds, action, payload);
    if (!result) return;
    /* `CMP-011`: отказы поимённо — названием задачи и причиной словами, не кодом. */
    setOutcome({
      total: result.total,
      succeeded: result.done,
      failures: result.rows
        .filter((row) => row.status === 'failed')
        .map((row) => ({
          label: rows.find((task) => task.id === row.taskId)?.title ?? 'Задача',
          reason: row.error?.message ?? 'Не удалось выполнить'
        }))
    });
    setSelected([]);
    setBulkRescheduling(false);
    void list.refetch();
  };

  return (
    <PageContainer>
      <PageHeader
        title="Задачи"
        subtitle="Что нужно сделать по группам, слушателям и компаниям: свои задачи, сроки и переписка по каждой."
        {...(canWrite && !creating
          ? { primaryAction: { label: 'Поставить задачу', onSelect: () => setCreating(true) } }
          : {})}
      />

      <ListPage<Task>
        savedViews={
          <SavedViews
            views={views}
            {...(activeView ? { activeId: activeView.id } : {})}
            onApply={(id) => {
              const view = views.find((item) => item.id === id);
              if (!view) return;
              setFilter((view.query.filter as TaskListFilter) ?? 'assigned_to_me');
              setLabel(view.query.label ?? '');
              setPage(1);
            }}
            onSave={(name) => {
              const view: SavedView = {
                id: `own-${name}-${filter}-${label.trim()}`,
                label: name,
                query: { filter, label: label.trim() }
              };
              const next = [...ownViews.filter((item) => item.id !== view.id), view];
              setOwnViews(next);
              writeTaskViews(next);
            }}
            onDelete={(id) => {
              const next = ownViews.filter((item) => item.id !== id);
              setOwnViews(next);
              writeTaskViews(next);
            }}
          />
        }
        filters={
          <>
            <label className="ui-field">
              <span className="ui-field-label">Срок с</span>
              <input
                className="ui-input"
                type="date"
                value={dueFrom}
                onChange={(event) => {
                  setDueFrom(event.target.value);
                  setPage(1);
                }}
              />
            </label>
            <label className="ui-field">
              <span className="ui-field-label">Срок по</span>
              <input
                className="ui-input"
                type="date"
                value={dueTo}
                onChange={(event) => {
                  setDueTo(event.target.value);
                  setPage(1);
                }}
              />
            </label>
            <label className="ui-field">
              <span className="ui-field-label">Метка</span>
              <input
                className="ui-input"
                value={label}
                onChange={(event) => {
                  setLabel(event.target.value);
                  setPage(1);
                }}
                placeholder="Метка"
              />
            </label>
          </>
        }
        {...(manageAll
          ? {
              secondaryFilters: (
                <StaffSelect
                  value={assignee}
                  onChange={(id) => {
                    setAssignee(id);
                    setPage(1);
                  }}
                  label="Исполнитель"
                  emptyLabel="Любой исполнитель"
                />
              )
            }
          : {})}
        activeFilterCount={activeCount}
        onResetFilters={() => {
          setAssignee('');
          setDueFrom('');
          setDueTo('');
          setLabel('');
          setPage(1);
        }}
        isLoading={list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        rows={rows}
        columns={columns}
        selectable={canWrite}
        selectedKeys={selected}
        onSelectionChange={setSelected}
        rowActions={(row) => [
          { label: 'Открыть задачу', primary: true, onSelect: () => setOpened(row) }
        ]}
        emptyMessage={activeCount > 0 ? 'По этим условиям задач нет' : 'Задач пока нет'}
        emptyHint={
          activeCount > 0
            ? 'Снимите часть условий — и список покажет остальные задачи.'
            : 'Здесь собираются задачи по группам, слушателям и компаниям: кому что сделать и к какому сроку. Начните с первой.'
        }
        {...(canWrite && activeCount === 0
          ? { emptyAction: { label: 'Поставить задачу', onSelect: () => setCreating(true) } }
          : {})}
        page={page}
        totalPages={totalPages}
        onPageChange={(next) => setPage(next)}
        bulkBar={
          canWrite ? (
            <BulkActionBar
              selectedCount={selected.length}
              isRunning={isPending}
              {...(outcome ? { outcome } : {})}
              actions={[
                { label: 'Выполнить', onSelect: () => void runBulk('complete') },
                { label: 'Перенести срок', onSelect: () => setBulkRescheduling(true) },
                {
                  label: 'Отменить задачи',
                  danger: true,
                  onSelect: () =>
                    ask(
                      {
                        title: 'Отменить задачи',
                        message: `Выбрано задач: ${selectedIds.length}. Исполнители перестанут видеть их в своих списках; история и комментарии сохранятся.`,
                        confirmLabel: 'Отменить задачи',
                        tone: 'danger'
                      },
                      () => void runBulk('cancel')
                    )
                }
              ]}
              onClear={() => {
                setSelected([]);
                setOutcome(undefined);
              }}
            />
          ) : null
        }
      />

      {bulkRescheduling ? (
        <div className="ui-card ui-stack" role="group" aria-label="Перенести срок выбранных">
          <label className="ui-field">
            <span className="ui-field-label">
              Новый срок для выбранных ({selectedIds.length}) *
            </span>
            <input
              className="ui-input"
              type="datetime-local"
              value={bulkDue}
              onChange={(event) => setBulkDue(event.target.value)}
            />
          </label>
          <div className="ui-inline">
            {/* UI-007: первичное действие экрана одно — «Поставить задачу»; перенос вторичный. */}
            <button
              type="button"
              className="ui-button"
              disabled={isPending}
              {...blockedProps(
                'tasks-bulk-due',
                !localToIso(bulkDue) ? 'Укажите новый срок' : undefined
              )}
              onClick={() => void runBulk('reschedule', { dueAt: localToIso(bulkDue)! })}
            >
              Перенести срок
            </button>
            <button type="button" className="ui-button" onClick={() => setBulkRescheduling(false)}>
              Оставить как есть
            </button>
          </div>
          <BlockedHint
            hintKey="tasks-bulk-due"
            reason={!localToIso(bulkDue) ? 'Укажите новый срок' : undefined}
          />
        </div>
      ) : null}

      {dialog}

      {creating ? (
        <TaskCreateDrawer
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            void list.refetch();
          }}
        />
      ) : null}

      {opened ? (
        <TaskDrawer
          task={opened}
          onClose={() => setOpened(null)}
          onChanged={() => {
            setOpened(null);
            void list.refetch();
          }}
        />
      ) : null}
    </PageContainer>
  );
}
