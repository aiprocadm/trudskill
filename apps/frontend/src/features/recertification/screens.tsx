'use client';

import { useQuery } from '@tanstack/react-query';
import {
  DataTable,
  FilterBar,
  ListPage,
  LoadingState,
  StatusChip,
  useConfirmDialog
} from '@trudskill/ui';
import { type ReactElement, useState } from 'react';

import { ApproveRecertModal } from './approve-recert-modal';
import { URGENCY_LABELS, formatDaysLeft, recertificationApi } from './expiring';
import { formatRemaining, formatSnils } from './format';
import { useRecertificationMutations, useRecertificationQueue } from './hooks';
import { RECERT_STATUS_LABELS, type RecertificationDraftStatus } from './types';
import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../components/state-wrappers';
import { useAuth } from '../auth/context';

const STATUS_FILTER_OPTIONS: Array<{ value: RecertificationDraftStatus | ''; label: string }> = [
  { value: 'pending', label: 'Ожидают' },
  { value: 'rejected', label: 'Отклонённые' },
  { value: '', label: 'Все' }
];

interface QueueRow {
  id: string;
  status: RecertificationDraftStatus;
  learnerView: ReactElement;
  courseView: string;
  validUntil: string;
  remainingView: string;
  statusView: ReactElement;
  /** Нужны для текста подтверждения: «Перезачислить Иванова на курс…». */
  learnerName: string;
  courseTitle: string;
}

export function RecertificationQueueScreen(): ReactElement {
  const { ask, dialog } = useConfirmDialog();
  const today = new Date().toISOString().slice(0, 10);
  const [statusFilter, setStatusFilter] = useState<RecertificationDraftStatus | ''>('pending');
  const { data, isLoading, error } = useRecertificationQueue(
    statusFilter === '' ? undefined : statusFilter
  );
  const { rejectPending, approvePending, scanPending, rejectDraft, approveDraft, runScan } =
    useRecertificationMutations();
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [approveTarget, setApproveTarget] = useState<{
    id: string;
    learnerName: string;
    courseTitle: string;
  } | null>(null);

  const onScan = async () => {
    setNotice(null);
    setActionError(null);
    try {
      const summary = await runScan();
      setNotice(`Проверка завершена: создано черновиков — ${summary.draftsCreated}.`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Не удалось запустить проверку');
    }
  };

  const onApproveSuccess = () => {
    setActionError(null);
    setNotice('Слушатель перезачислен на переаттестацию.');
    setApproveTarget(null);
  };

  // CMP-006: были подряд window.confirm и window.prompt — два окна браузера на одно действие.
  // Теперь один диалог приложения с полем причины.
  const onReject = (id: string) => {
    ask(
      {
        title: 'Убрать запись из очереди',
        message: 'Слушатель не попадёт в переаттестацию по этой записи.',
        confirmLabel: 'Убрать из очереди',
        tone: 'danger',
        input: { label: 'Причина (необязательно)', placeholder: 'Например: уволен' }
      },
      (reason) => void runReject(id, reason)
    );
  };

  const runReject = async (id: string, reason: string | undefined) => {
    setNotice(null);
    setActionError(null);
    try {
      await rejectDraft(id, reason);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Не удалось убрать запись');
    }
  };

  const rows: QueueRow[] = (data ?? []).map((draft) => ({
    id: draft.id,
    status: draft.status,
    learnerView: (
      <span>
        {draft.learnerName || '—'}
        <br />
        <span className="ui-text-muted">{formatSnils(draft.learnerSnils)}</span>
      </span>
    ),
    courseView: draft.courseTitle || '—',
    validUntil: draft.validUntil,
    remainingView: formatRemaining(draft.validUntil, today),
    statusView: <StatusChip status={RECERT_STATUS_LABELS[draft.status]} />,
    learnerName: draft.learnerName,
    courseTitle: draft.courseTitle
  }));

  return (
    <PageContainer>
      <PageHeader
        title="Нужна переаттестация"
        subtitle="Слушатели, у которых истекает срок действия удостоверения. «Перезачислить» — выбрать группу и зачислить повторно; «Убрать» — скрыть запись."
        actions={
          <button
            type="button"
            className="ui-button--primary"
            onClick={() => void onScan()}
            disabled={scanPending}
          >
            {scanPending ? 'Проверяем сроки…' : 'Проверить сроки'}
          </button>
        }
      />

      <ExpiringDocumentsSection />

      {notice ? <p className="ui-callout ui-callout--success">{notice}</p> : null}
      {actionError ? <SectionError message={actionError} /> : null}

      <FilterBar
        primary={
          <label className="ui-field">
            <span className="ui-field-label">Статус</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as RecertificationDraftStatus | '')}
            >
              {STATUS_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        }
      />

      <ListPage<QueueRow>
        columns={[
          { key: 'learnerView', title: 'Слушатель', render: (row) => row.learnerView },
          { key: 'courseView', title: 'Курс' },
          { key: 'validUntil', title: 'Действует до' },
          { key: 'remainingView', title: 'Осталось' },
          { key: 'statusView', title: 'Статус', render: (row) => row.statusView }
        ]}
        rows={rows}
        isLoading={isLoading}
        error={error ? new Error('Не удалось загрузить очередь переаттестации') : undefined}
        rowKey={(row) => row.id}
        rowActions={(row) =>
          row.status === 'pending'
            ? [
                {
                  label: 'Перезачислить',
                  disabled: approvePending,
                  onSelect: () =>
                    setApproveTarget({
                      id: row.id,
                      learnerName: row.learnerName,
                      courseTitle: row.courseTitle
                    })
                },
                {
                  label: 'Убрать из очереди',
                  danger: true,
                  disabled: rejectPending,
                  onSelect: () => void onReject(row.id)
                }
              ]
            : []
        }
        emptyMessage="Сейчас никому не нужна переаттестация"
        emptyHint="Сюда попадают слушатели, у которых заканчивается срок действия удостоверения. Проверка сроков идёт сама; кнопкой в шапке её можно запустить прямо сейчас."
      />

      <ApproveRecertModal
        open={approveTarget !== null}
        learnerName={approveTarget?.learnerName ?? ''}
        courseTitle={approveTarget?.courseTitle ?? ''}
        pending={approvePending}
        onConfirm={async (targetGroupId) => {
          if (approveTarget) await approveDraft(approveTarget.id, targetGroupId);
        }}
        onSuccess={onApproveSuccess}
        onClose={() => setApproveTarget(null)}
      />
      {dialog}
    </PageContainer>
  );
}

/**
 * ФТ-E4 (Фаза 4 Task 9): дашборд «истекающие удостоверения».
 *
 * Живёт рядом с очередью переаттестации, а не отдельным экраном: это две стороны одной
 * работы — «что истекает» и «кого перезачислить». Просроченные показываются НАРАВНЕ с
 * истекающими и первыми: срок, вышедший вчера, — самая срочная строка, а не архив.
 */
export function ExpiringDocumentsSection(): ReactElement {
  const { session } = useAuth();
  const expiringQuery = useQuery({
    queryKey: ['recert-expiring', session?.user.tenantId],
    enabled: Boolean(session),
    queryFn: () => recertificationApi.listExpiring(session!)
  });

  const data = expiringQuery.data;

  return (
    <SectionCard title="Истекающие удостоверения">
      {expiringQuery.isLoading ? <LoadingState message="Считаем сроки…" /> : null}
      {expiringQuery.error ? (
        <SectionError
          message={
            expiringQuery.error instanceof Error
              ? expiringQuery.error.message
              : 'Не удалось загрузить сроки'
          }
        />
      ) : null}

      {data ? (
        <div className="ui-stack">
          <p className="ui-text-muted">
            Документы, срок которых уже вышел или выходит в ближайшие {data.horizonDays} дней —
            ровно те, по которым идут напоминания (за 60, 30 и 7 дней).
          </p>
          {data.summary.expired > 0 ? (
            <p className="ui-callout ui-callout--danger">
              Просрочено: {data.summary.expired}. Эти слушатели работают без действующего
              удостоверения.
            </p>
          ) : null}
          {data.summary.critical > 0 ? (
            <p className="ui-callout ui-callout--warning">
              Истекает в течение недели: {data.summary.critical}.
            </p>
          ) : null}

          {data.items.length ? (
            <DataTable
              columns={[
                { key: 'learnerTitle', title: 'Слушатель' },
                { key: 'numberTitle', title: '№ документа' },
                { key: 'validUntil', title: 'Действует до' },
                { key: 'daysTitle', title: 'Срок' },
                { key: 'urgencyTitle', title: 'Статус' }
              ]}
              rows={data.items.map((item) => ({
                ...item,
                learnerTitle: item.learnerName ?? '—',
                numberTitle: item.documentNumber ?? '—',
                daysTitle: formatDaysLeft(item.daysLeft),
                urgencyTitle: URGENCY_LABELS[item.urgency]
              }))}
            />
          ) : (
            <SectionEmpty
              message="Ближайшие два месяца сроки не истекают"
              hint="Мы проверяем сроки удостоверений сами — если что-то будет истекать, оно появится здесь."
            />
          )}
        </div>
      ) : null}
    </SectionCard>
  );
}
