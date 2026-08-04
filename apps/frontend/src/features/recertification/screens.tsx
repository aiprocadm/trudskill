'use client';

import { useQuery } from '@tanstack/react-query';
import { DataTable, LoadingState, StatusChip } from '@trudskill/ui';
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
  actionsView: ReactElement;
}

export function RecertificationQueueScreen(): ReactElement {
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

  const onReject = async (id: string) => {
    if (!window.confirm('Убрать запись из очереди?')) return;
    const reason = window.prompt('Причина (необязательно)') ?? undefined;
    setNotice(null);
    setActionError(null);
    try {
      await rejectDraft(id, reason || undefined);
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
    actionsView:
      draft.status === 'pending' ? (
        <span className="ui-inline" style={{ gap: 8 }}>
          <button
            type="button"
            className="ui-button ui-button--primary"
            onClick={() =>
              setApproveTarget({
                id: draft.id,
                learnerName: draft.learnerName,
                courseTitle: draft.courseTitle
              })
            }
            disabled={approvePending}
          >
            Перезачислить
          </button>
          <button
            type="button"
            className="ui-button"
            onClick={() => void onReject(draft.id)}
            disabled={rejectPending}
          >
            Убрать
          </button>
        </span>
      ) : (
        <span className="ui-text-muted">—</span>
      )
  }));

  return (
    <PageContainer>
      <PageHeader
        title="Нужна переаттестация"
        subtitle="Слушатели, у которых истекает срок действия удостоверения. «Перезачислить» — выбрать группу и зачислить повторно; «Убрать» — скрыть запись."
        actions={
          <button
            type="button"
            className="ui-button"
            onClick={() => void onScan()}
            disabled={scanPending}
          >
            {scanPending ? 'Проверяем…' : 'Проверить сейчас'}
          </button>
        }
      />

      <ExpiringDocumentsSection />

      <SectionCard title="Очередь переаттестации">
        <div className="ui-inline" style={{ marginBottom: 12 }}>
          <label className="ui-inline" style={{ gap: 4 }}>
            <span>Статус:</span>
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
        </div>

        {notice ? <p className="ui-callout">{notice}</p> : null}
        {actionError ? <SectionError message={actionError} /> : null}

        {isLoading ? <LoadingState message="Загрузка очереди…" /> : null}
        {error ? <SectionError message="Не удалось загрузить очередь переаттестации" /> : null}
        {!isLoading && !error && rows.length === 0 ? (
          <SectionEmpty
            message="Сейчас никому не нужна переаттестация"
            hint="Нажмите «Проверить сейчас», чтобы проверить сроки удостоверений"
          />
        ) : null}
        {!isLoading && !error && rows.length > 0 ? (
          <DataTable<QueueRow>
            columns={[
              { key: 'learnerView', title: 'Слушатель', render: (row) => row.learnerView },
              { key: 'courseView', title: 'Курс' },
              { key: 'validUntil', title: 'Действует до' },
              { key: 'remainingView', title: 'Осталось' },
              { key: 'statusView', title: 'Статус', render: (row) => row.statusView },
              { key: 'actionsView', title: 'Действие', render: (row) => row.actionsView }
            ]}
            rows={rows}
          />
        ) : null}
      </SectionCard>

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
                { key: 'urgencyTitle', title: 'Состояние' }
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
            <SectionEmpty message="Ближайшие два месяца сроки не истекают" />
          )}
        </div>
      ) : null}
    </SectionCard>
  );
}
