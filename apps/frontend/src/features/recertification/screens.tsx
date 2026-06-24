'use client';

import { DataTable, LoadingState, StatusChip } from '@trudskill/ui';
import { type ReactElement, useState } from 'react';

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
  const { rejectPending, scanPending, rejectDraft, runScan } = useRecertificationMutations();
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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
        <button
          type="button"
          className="ui-button"
          onClick={() => void onReject(draft.id)}
          disabled={rejectPending}
        >
          Убрать
        </button>
      ) : (
        <span className="ui-text-muted">—</span>
      )
  }));

  return (
    <PageContainer>
      <PageHeader
        title="Нужна переаттестация"
        subtitle="Слушатели, у которых истекает срок действия удостоверения. Перезачисление — через «Массовую загрузку»."
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
    </PageContainer>
  );
}
