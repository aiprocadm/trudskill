'use client';

import {
  BulkActionBar,
  ColumnPicker,
  ConfirmDialog,
  DetailDrawer,
  ListPage,
  SavedViews,
  SearchInput,
  StatusChip
} from '@trudskill/ui';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { fetchLearnersXlsxUrl } from './api';
import { STATUS_LABEL, formatFullName, formatSnils } from './format';
import {
  useArchiveLearners,
  useEnrollLearnersToGroup,
  useLearnersList,
  useSendAccessToLearners
} from './hooks';
import { LearnerCreateDrawer } from './learner-create-drawer';
import { LearnerEditDrawer } from './learner-edit-drawer';
import { LearnerPasteDrawer } from './learner-paste-drawer';
import { companyLabel, consentLabel, currentGroupLabel, lastLoginLabel } from './registry-labels';
import { LEARNER_PRESET_VIEWS, matchesQuery, readSavedViews, writeSavedViews } from './saved-views';
import { PageContainer, PageHeader, SectionError } from '../../components/state-wrappers';
import { buildCsv, downloadCsv } from '../../lib/export/csv';
import { hasPermission } from '../../lib/rbac/permissions';
import { useAuth } from '../auth/context';
import { ClientSelect, GroupSelect } from '../groups/group-picker';

import type { LearnerListItem, LearnerStatus, LearnersListFilters } from './types';
import type { SavedView } from '@trudskill/ui';
import type { BulkOutcome, Column, RowKey } from '@trudskill/ui';

/** Строка реестра: карточка плюс подписи сведений (МГ-C3.2) — ключи колонок должны быть полями строки. */
type LearnerRow = LearnerListItem & {
  company: string;
  currentGroup: string;
  lastLoginAt: string;
  consent: string;
};

const PAGE_SIZE = 20;

/*
 * Эталонный реестр (Фаза 2 редизайна): выделение строк, массовое действие с поимённым
 * частичным успехом, настройка колонок, панель деталей без ухода со списка.
 *
 * Колонка «Подразделение» скрыта по умолчанию: сервер отдаёт идентификатор, а не название,
 * и показывать пользователю `ou_1f2e…` — прямое нарушение правила «ни одного сырого ID».
 * Справочник названий потребовал бы новой ручки API — вне границ фазы, записано в журнал.
 */
/* МГ-C3.2 (срез 11.2): семь колонок по умолчанию (§13.2); последний вход и согласие — через выбор колонок. */
const DEFAULT_COLUMNS = [
  'lastName',
  'email',
  'snils',
  'position',
  'company',
  'currentGroup',
  'status'
];

/**
 * Значение колонки для выгрузки — ПЛОСКИМ текстом (ТЗ 5.5 / Э5).
 *
 * Брать `column.render` нельзя: часть колонок возвращает разметку (значок статуса), и в файл
 * попал бы объект вместо слова. Статус выгружается тем же русским словом, что на экране, —
 * иначе человек откроет файл и увидит `archived`.
 */
const csvValue = (learner: LearnerRow, key: string): string => {
  switch (key) {
    case 'lastName':
      return formatFullName(learner);
    case 'snils':
      return formatSnils(learner.snils);
    case 'status':
      return STATUS_LABEL[learner.status];
    case 'email':
      return learner.email ?? '';
    case 'position':
      return learner.position ?? '';
    case 'organizationUnitId':
      return learner.organizationUnitId ?? '';
    case 'company':
      return learner.company;
    case 'currentGroup':
      return learner.currentGroup;
    case 'lastLoginAt':
      return learner.lastLoginAt;
    case 'consent':
      return learner.consent;
    default:
      return '';
  }
};

export function LearnersListScreen() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'' | LearnerStatus>('');
  /* МГ-C3.2 (срез 11.2): компания и группа — в «Ещё фильтры», два переключателя — рядом. */
  const [companyId, setCompanyId] = useState('');
  const [groupId, setGroupId] = useState('');
  const [noEmail, setNoEmail] = useState(false);
  const [neverLoggedIn, setNeverLoggedIn] = useState(false);
  const [exportError, setExportError] = useState<unknown>(null);
  const [exporting, setExporting] = useState(false);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<LearnerListItem | null>(null);
  const [creating, setCreating] = useState(false);
  /* МГ-C3.1 (срез 10.2): вставка списком — тем же импортом, без группы. */
  const [pasting, setPasting] = useState(false);
  /*
    CMP-012. Свои отборы читаются один раз при первом отрисовывании: хранилище браузера
    синхронное, и дёргать его на каждый ввод в поиске незачем.
  */
  const [ownViews, setOwnViews] = useState<SavedView[]>(() => readSavedViews());
  const [selected, setSelected] = useState<RowKey[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(DEFAULT_COLUMNS);
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const [outcome, setOutcome] = useState<BulkOutcome | undefined>(undefined);
  /* ТЗ 5.5: зачисление выбранных в группу — панель выбора группы рядом со списком. */
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollGroupId, setEnrollGroupId] = useState('');

  const filters: LearnersListFilters = useMemo(
    () => ({
      ...(q.trim() ? { q: q.trim() } : {}),
      ...(status ? { status } : {}),
      ...(companyId ? { companyId } : {}),
      ...(groupId ? { groupId } : {}),
      ...(noEmail ? { noEmail: true } : {}),
      ...(neverLoggedIn ? { neverLoggedIn: true } : {}),
      page,
      pageSize: PAGE_SIZE
    }),
    [q, status, companyId, groupId, noEmail, neverLoggedIn, page]
  );

  const { session } = useAuth();
  /* Право то же, что требует ручка `POST /enrollments/bulk`; сверено по живой iam.role_permissions. */
  const canEnroll = hasPermission(session?.permissions ?? [], 'enrollments.write');
  const canImport = canEnroll && hasPermission(session?.permissions ?? [], 'learners.write');
  const list = useLearnersList(filters);
  const archive = useArchiveLearners();
  const enroll = useEnrollLearnersToGroup();
  const access = useSendAccessToLearners();
  const canSendAccess = hasPermission(session?.permissions ?? [], 'learners.write');
  const rows: LearnerRow[] = (list.data?.items ?? []).map((item) => ({
    ...item,
    company: companyLabel(item.registry),
    currentGroup: currentGroupLabel(item.registry),
    lastLoginAt: lastLoginLabel(item.registry),
    consent: consentLabel(item.registry)
  }));

  const columns: Column<LearnerRow>[] = [
    { key: 'lastName', title: 'ФИО', render: (row) => formatFullName(row) },
    { key: 'email', title: 'Электронная почта', render: (row) => row.email ?? '—' },
    { key: 'snils', title: 'СНИЛС', render: (row) => formatSnils(row.snils) },
    { key: 'position', title: 'Должность', render: (row) => row.position ?? '—' },
    {
      key: 'organizationUnitId',
      title: 'Подразделение',
      render: (row) => row.organizationUnitId ?? '—'
    },
    /* МГ-C3.2 (срез 11.2): сведения реестра — компания, текущая группа, последний вход, согласие. */
    { key: 'company', title: 'Компания', render: (row) => row.company },
    {
      key: 'currentGroup',
      title: 'Группа (текущая)',
      /* Идентификатор группы — только в адрес ссылки; на экране всегда название и статус. */
      render: (row) => {
        const groupHref = row.registry?.currentGroupId
          ? `/groups/${row.registry.currentGroupId}`
          : null;
        return groupHref ? (
          <Link className="ui-link" href={groupHref}>
            {row.currentGroup}
          </Link>
        ) : (
          row.currentGroup
        );
      }
    },
    { key: 'lastLoginAt', title: 'Последний вход', render: (row) => row.lastLoginAt },
    { key: 'consent', title: 'Согласие ПДн', render: (row) => row.consent },
    {
      key: 'status',
      title: 'Статус',
      render: (row) => <StatusChip status={row.status} label={STATUS_LABEL[row.status]} />
    }
  ];

  const totalPages = list.data ? Math.max(1, Math.ceil(list.data.total / PAGE_SIZE)) : 1;
  const activeFilters =
    (q.trim() ? 1 : 0) +
    (status ? 1 : 0) +
    (companyId ? 1 : 0) +
    (groupId ? 1 : 0) +
    (noEmail ? 1 : 0) +
    (neverLoggedIn ? 1 : 0);
  /* Подсвечен тот отбор, чьи значения сейчас и стоят в фильтрах. */
  const activeView = [...LEARNER_PRESET_VIEWS, ...ownViews].find((view) =>
    matchesQuery(view, { q, status })
  );

  const selectedLearners = rows.filter((row) => selected.includes(row.id));

  const runArchive = async () => {
    setConfirmingArchive(false);
    const result = await archive.run(selectedLearners);
    setOutcome(result);
    setSelected([]);
    void list.refetch();
  };

  /*
   * ТЗ 5.5 (Э5): в панели было ровно одно действие, и то красное. Теперь полезные — впереди,
   * опасное — последним (порядок расставляет сам компонент).
   */
  const runEnroll = async () => {
    if (!enrollGroupId) return;
    const result = await enroll.run(selectedLearners, enrollGroupId, `bulk-enroll-${Date.now()}`);
    setOutcome(result);
    setEnrollOpen(false);
    setEnrollGroupId('');
    setSelected([]);
    void list.refetch();
  };

  /* МГ-C3.2 (срез 11.2): массово «Выслать доступы» — по одному, отказы поимённо. */
  const runSendAccess = async () => {
    const result = await access.run(selectedLearners);
    setOutcome(result);
    void list.refetch();
  };

  /* Выгрузка XLSX с сервера (РМ105): весь реестр по текущим фильтрам, не только страница. */
  const exportXlsx = () => {
    if (!session) return;
    setExporting(true);
    setExportError(null);
    fetchLearnersXlsxUrl(session, filters)
      .then((url) => {
        const link = document.createElement('a');
        link.href = url;
        link.download = 'slushateli.xlsx';
        link.click();
      })
      .catch((err: unknown) => setExportError(err))
      .finally(() => setExporting(false));
  };

  /* Выгружается то, что человек видит: выбранные строки и колонки, которые он оставил. */
  const exportSelected = () => {
    const shown = columns.filter((column) => visibleColumns.includes(String(column.key)));
    downloadCsv(
      'slushateli',
      buildCsv(
        shown.map((column) => column.title),
        selectedLearners.map((learner) =>
          shown.map((column) => csvValue(learner, String(column.key)))
        )
      )
    );
  };

  return (
    <PageContainer>
      <PageHeader
        title="Слушатели"
        subtitle="Реестр слушателей: поиск, массовые операции и правка карточки без ухода со списка."
        /*
          UI-007. Первичного действия у эталонного реестра не было вовсе: экран не отвечал
          на вопрос «как завести человека», и единственным путём оставался массовый импорт
          Excel — даже когда человек один (журнал 200). Пока панель открыта, действие
          шапки не показывается: оно уже нажато.
        */
        {...(creating
          ? {}
          : { primaryAction: { label: 'Завести слушателя', onSelect: () => setCreating(true) } })}
        {...(canImport && !creating
          ? {
              secondaryActions: [
                { label: 'Добавить слушателей списком', onSelect: () => setPasting(true) },
                { label: 'Загрузить из файла', href: '/admin/bulk-enrollments' }
              ]
            }
          : {})}
      />
      {exportError !== null ? <SectionError error={exportError} /> : null}

      {/*
        ТЗ 5.6 (Э6): порядок блоков списка считает каркас, а не экран. Быстрые отборы, поиск
        с фильтрами, выбор колонок, таблица и массовые действия приходят слотами — собрать их
        в другом порядке нельзя. Раньше каждый из них рисовался здесь рядом, и порядок жил в
        памяти автора экрана.
      */}
      <ListPage<LearnerRow>
        /*
          CMP-012: быстрые отборы. Приходят с тремя готовыми — пустой список «сохранённых»
          бесполезен: им нельзя воспользоваться, пока сам что-нибудь не сохранишь.
        */
        savedViews={
          <SavedViews
            views={[...LEARNER_PRESET_VIEWS, ...ownViews]}
            {...(activeView ? { activeId: activeView.id } : {})}
            onApply={(id) => {
              const view = [...LEARNER_PRESET_VIEWS, ...ownViews].find((item) => item.id === id);
              if (!view) return;
              setQ(view.query.q ?? '');
              setStatus((view.query.status ?? '') as '' | LearnerStatus);
              setPage(1);
            }}
            onSave={(label) => {
              const view: SavedView = {
                id: `own-${label}-${status}-${q}`,
                label,
                query: { q, status }
              };
              const next = [...ownViews.filter((item) => item.id !== view.id), view];
              setOwnViews(next);
              writeSavedViews(next);
            }}
            onDelete={(id) => {
              const next = ownViews.filter((item) => item.id !== id);
              setOwnViews(next);
              writeSavedViews(next);
            }}
          />
        }
        filters={
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
        secondaryFilters={
          <>
            <ClientSelect
              value={companyId}
              onChange={(value) => {
                setCompanyId(value);
                setPage(1);
              }}
            />
            <GroupSelect
              value={groupId}
              onChange={(value) => {
                setGroupId(value);
                setPage(1);
              }}
            />
            <label className="ui-inline">
              <input
                type="checkbox"
                checked={noEmail}
                onChange={(e) => {
                  setNoEmail(e.target.checked);
                  setPage(1);
                }}
              />
              Без почты
            </label>
            <label className="ui-inline">
              <input
                type="checkbox"
                checked={neverLoggedIn}
                onChange={(e) => {
                  setNeverLoggedIn(e.target.checked);
                  setPage(1);
                }}
              />
              Ни разу не входил
            </label>
          </>
        }
        activeFilterCount={activeFilters}
        onResetFilters={() => {
          setQ('');
          setStatus('');
          setCompanyId('');
          setGroupId('');
          setNoEmail(false);
          setNeverLoggedIn(false);
          setPage(1);
        }}
        columnPicker={
          <ColumnPicker
            columns={columns.map((c) => ({ key: String(c.key), title: c.title }))}
            visibleKeys={visibleColumns}
            onChange={setVisibleColumns}
          />
        }
        isLoading={list.isLoading}
        error={list.error}
        onRetry={() => void list.refetch()}
        rows={rows}
        columns={columns}
        visibleColumnKeys={visibleColumns}
        selectable
        selectedKeys={selected}
        onSelectionChange={setSelected}
        rowActions={(row) => [
          { label: 'Открыть карточку', primary: true, onSelect: () => setEditing(row) }
        ]}
        emptyMessage="Слушателей пока нет"
        emptyHint="Здесь появятся люди, которых вы зачислите на обучение. Начните с добавления первого."
        page={page}
        totalPages={totalPages}
        onPageChange={(p) => setPage(p)}
        bulkBar={
          <BulkActionBar
            selectedCount={selected.length}
            isRunning={archive.isRunning || access.isRunning || exporting}
            {...(outcome ? { outcome } : {})}
            /*
              ТЗ 5.5 (Э5): полезные действия, а не одно красное. «Назначить курс» из списка ТЗ
              здесь нет намеренно: курс назначается ГРУППЕ, а не слушателю, — зачисление в группу
              и есть путь к курсу (журнал 449).
            */
            actions={[
              ...(canEnroll
                ? [{ label: 'Добавить в группу', onSelect: () => setEnrollOpen(true) }]
                : []),
              ...(canSendAccess
                ? [{ label: 'Выслать доступы', onSelect: () => void runSendAccess() }]
                : []),
              { label: 'Выгрузить выбранных', onSelect: exportSelected },
              { label: 'Выгрузить XLSX', onSelect: exportXlsx },
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
        }
      />

      <DetailDrawer
        open={enrollOpen}
        onClose={() => setEnrollOpen(false)}
        title="Добавить в группу"
        subtitle={`Выбрано слушателей: ${selectedLearners.length}`}
        width="sm"
        hasUnsavedChanges={enrollGroupId.trim().length > 0}
      >
        <div className="ui-stack">
          <GroupSelect
            value={enrollGroupId}
            onChange={setEnrollGroupId}
            emptyLabel="Выберите группу"
          />
          <p className="ui-field-hint">
            Слушатели попадут в состав группы и получат доступ к её курсам. Кто уже состоит в группе
            — останется как есть, второго зачисления не будет.
          </p>
          <button
            type="button"
            className={`ui-button ui-button--primary${enroll.isRunning ? ' ui-button--loading' : ''}`}
            disabled={!enrollGroupId || enroll.isRunning}
            aria-busy={enroll.isRunning || undefined}
            onClick={() => void runEnroll()}
          >
            Добавить в группу
          </button>
        </div>
      </DetailDrawer>

      {confirmingArchive ? (
        <ConfirmDialog
          title="Архивировать слушателей"
          message={`Выбрано: ${selected.length}. Архивные слушатели не участвуют в новых зачислениях; данные и документы сохраняются.`}
          confirmLabel="Архивировать"
          tone="danger"
          onConfirm={() => void runArchive()}
          onCancel={() => setConfirmingArchive(false)}
        />
      ) : null}

      {pasting ? (
        <LearnerPasteDrawer
          onClose={() => setPasting(false)}
          onDone={() => {
            void list.refetch();
          }}
        />
      ) : null}

      {creating ? (
        <LearnerCreateDrawer
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            void list.refetch();
          }}
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
