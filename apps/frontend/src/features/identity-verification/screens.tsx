'use client';

import { DataTable, LoadingState } from '@cdoprof/ui';
import Link from 'next/link';
import { useState } from 'react';

import { identityVerificationApi } from './api';
import { fileUnavailableLabel, formatDateShort, formatIdentityStatus } from './format';
import {
  useIdentityDetail,
  useIdentityQueue,
  useIdentityReview,
  useIdentitySubmission,
  useMyIdentityVerification
} from './hooks';
import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../components/state-wrappers';
import { frontendEnv } from '../../lib/config/env';
import { useAuth } from '../auth/context';

import type { IdentityVerificationStatus } from './types';
import type { ReactElement } from 'react';

export function LearnerIdentityScreen(): ReactElement {
  const { session } = useAuth();
  const my = useMyIdentityVerification();
  const submission = useIdentitySubmission();

  const [selfie, setSelfie] = useState<File | null>(null);
  const [passport, setPassport] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [esiaPending, setEsiaPending] = useState(false);

  const onEsiaIdentity = async () => {
    if (!session) return;
    setEsiaPending(true);
    try {
      const res = await identityVerificationApi.esiaIdentityAuthorize(session);
      window.location.href = res.authorizeUrl;
    } catch {
      setEsiaPending(false);
    }
  };

  if (my.isLoading) return <LoadingState message="Загрузка…" />;

  const record = my.data ?? null;

  // Show the submit form when there is no record yet, or the status allows resubmission.
  const canSubmit =
    record === null ||
    record.verificationStatus === 'draft' ||
    record.verificationStatus === 'rejected';

  const onSubmit = async () => {
    if (!selfie || !passport) return;
    const ok = await submission.submitAll(selfie, passport);
    if (ok) {
      setSelfie(null);
      setPassport(null);
      setConsent(false);
      void my.refetch();
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="Подтверждение личности"
        subtitle="Селфи и фото паспорта для допуска к итоговому экзамену"
      />

      {record ? (
        <SectionCard title="Текущий статус">
          <p>
            <strong>Статус:</strong> {formatIdentityStatus(record.verificationStatus)}
          </p>
          <p>
            <strong>Дата подачи:</strong> {formatDateShort(record.submittedAt ?? record.createdAt)}
          </p>
          {record.verificationStatus === 'rejected' && record.rejectionReason ? (
            <p className="ui-text-muted">
              <strong>Причина отклонения:</strong> {record.rejectionReason}
            </p>
          ) : null}
        </SectionCard>
      ) : null}

      {canSubmit ? (
        <SectionCard title="Загрузить документы">
          <div className="ui-stack">
            <label className="ui-stack">
              <span>Селфи (фото лица)</span>
              <input
                type="file"
                accept="image/png,image/jpeg"
                disabled={submission.isPending}
                onChange={(e) => setSelfie(e.target.files?.[0] ?? null)}
              />
            </label>

            <label className="ui-stack">
              <span>Фото разворота паспорта</span>
              <input
                type="file"
                accept="image/png,image/jpeg,application/pdf"
                disabled={submission.isPending}
                onChange={(e) => setPassport(e.target.files?.[0] ?? null)}
              />
            </label>

            <label className="ui-inline" style={{ gap: 8 }}>
              <input
                type="checkbox"
                checked={consent}
                disabled={submission.isPending}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span>Даю согласие на обработку персональных данных (152-ФЗ)</span>
            </label>

            {submission.error ? <SectionError message={submission.error} /> : null}

            <button
              type="button"
              className="ui-button ui-button--primary"
              disabled={!selfie || !passport || !consent || submission.isPending}
              onClick={() => void onSubmit()}
            >
              {submission.isPending ? 'Отправка…' : 'Отправить на проверку'}
            </button>
            {frontendEnv.NEXT_PUBLIC_ESIA_ENABLED && (
              <button
                type="button"
                className="ui-button ui-button--secondary"
                disabled={esiaPending || submission.isPending}
                onClick={() => void onEsiaIdentity()}
                data-testid="esia-identity"
              >
                {esiaPending
                  ? 'Переход в Госуслуги…'
                  : 'Подтвердить через Госуслуги (альтернатива)'}
              </button>
            )}
          </div>
        </SectionCard>
      ) : null}
    </PageContainer>
  );
}

// ─── Admin screens ────────────────────────────────────────────────────────────

const STATUS_FILTER_OPTIONS: Array<{
  value: IdentityVerificationStatus | undefined;
  label: string;
}> = [
  { value: 'pending', label: 'На проверке' },
  { value: undefined, label: 'Все' }
];

interface QueueRow {
  id: string;
  learnerNameView: string;
  snilsView: string;
  statusView: string;
  submittedAtView: string;
  actionView: ReactElement;
}

export function AdminIdentityQueueScreen(): ReactElement {
  const [statusFilter, setStatusFilter] = useState<IdentityVerificationStatus | undefined>(
    'pending'
  );
  const { data, isLoading, error } = useIdentityQueue(statusFilter);

  const rows: QueueRow[] = (data ?? []).map((item) => ({
    id: item.id,
    learnerNameView: item.learnerName || '—',
    snilsView: item.learnerSnils ?? '—',
    statusView: formatIdentityStatus(item.verificationStatus),
    submittedAtView: formatDateShort(item.submittedAt),
    actionView: (
      <Link href={`/admin/identity-verifications/${item.id}`} className="ui-button">
        Открыть
      </Link>
    )
  }));

  return (
    <PageContainer>
      <PageHeader
        title="Идентификация личности"
        subtitle="Заявки слушателей на подтверждение личности (селфи + паспорт)"
      />

      <SectionCard title="Очередь идентификации">
        <div className="ui-inline" style={{ marginBottom: 12, gap: 8 }}>
          <span>Статус:</span>
          {STATUS_FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value ?? 'all'}
              type="button"
              className="ui-button"
              style={statusFilter === opt.value ? { fontWeight: 700 } : undefined}
              onClick={() => setStatusFilter(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {isLoading ? <LoadingState message="Загрузка очереди…" /> : null}
        {error ? <SectionError message="Не удалось загрузить очередь идентификации" /> : null}
        {!isLoading && !error && rows.length === 0 ? (
          <SectionEmpty message="Заявок нет" hint="Нет заявок с выбранным статусом" />
        ) : null}
        {!isLoading && !error && rows.length > 0 ? (
          <DataTable<QueueRow>
            columns={[
              { key: 'learnerNameView', title: 'Слушатель' },
              { key: 'snilsView', title: 'СНИЛС' },
              { key: 'statusView', title: 'Статус' },
              { key: 'submittedAtView', title: 'Отправлено' },
              { key: 'actionView', title: '', render: (row) => row.actionView }
            ]}
            rows={rows}
          />
        ) : null}
      </SectionCard>
    </PageContainer>
  );
}

export function AdminIdentityDetailScreen({ id }: { id: string }): ReactElement {
  const { data: detail, isLoading, error, refetch } = useIdentityDetail(id);
  const { review, isPending, error: reviewError } = useIdentityReview();
  const [reason, setReason] = useState('');

  if (isLoading) return <LoadingState message="Загрузка…" />;
  if (error || !detail) return <SectionError message="Не удалось загрузить данные идентификации" />;

  const isPdf = (url?: string) => Boolean(url && url.toLowerCase().includes('.pdf'));

  const onApprove = async () => {
    const ok = await review(id, { decision: 'approve' });
    if (ok) void refetch();
  };

  const onReject = async () => {
    const payload: Parameters<typeof review>[1] = {
      decision: 'reject',
      ...(reason ? { rejectionReason: reason } : {})
    };
    const ok = await review(id, payload);
    if (ok) void refetch();
  };

  return (
    <PageContainer>
      <PageHeader
        title={`Идентификация: ${detail.learnerName}`}
        subtitle={formatIdentityStatus(detail.verificationStatus)}
      />

      <SectionCard title="Данные слушателя (для сверки с паспортом)">
        <dl className="kv-list">
          <div className="kv-list__row">
            <dt>ФИО</dt>
            <dd>{detail.learnerName}</dd>
          </div>
          <div className="kv-list__row">
            <dt>СНИЛС</dt>
            <dd>{detail.learnerSnils ?? '—'}</dd>
          </div>
          <div className="kv-list__row">
            <dt>Дата рождения</dt>
            <dd>{detail.learnerDateOfBirth ?? '—'}</dd>
          </div>
          <div className="kv-list__row">
            <dt>Согласие на обработку ПДн</dt>
            <dd>{formatDateShort(detail.consentAt)}</dd>
          </div>
        </dl>
      </SectionCard>

      <SectionCard title="Документы">
        {detail.imagesPurgedAt ? (
          <p className="ui-text-muted">
            Изображения удалены по сроку хранения ({formatDateShort(detail.imagesPurgedAt)})
          </p>
        ) : (
          <div className="ui-stack">
            <div>
              <p>
                <strong>Селфи:</strong>
              </p>
              {detail.selfieUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- presigned MinIO URL, next/image needs static domain config
                <img
                  src={detail.selfieUrl}
                  alt="Селфи"
                  style={{ maxWidth: 320, display: 'block', marginTop: 8 }}
                />
              ) : (
                <p className="ui-text-muted">
                  {detail.selfieFileError
                    ? `Селфи: ${fileUnavailableLabel(detail.selfieFileError)}`
                    : 'Селфи: нет файла'}
                </p>
              )}
            </div>
            <div>
              <p>
                <strong>Паспорт:</strong>
              </p>
              {detail.passportUrl ? (
                <>
                  {!isPdf(detail.passportUrl) ? (
                    // eslint-disable-next-line @next/next/no-img-element -- presigned MinIO URL, next/image needs static domain config
                    <img
                      src={detail.passportUrl}
                      alt="Паспорт"
                      style={{ maxWidth: 480, display: 'block', marginTop: 8 }}
                    />
                  ) : null}
                  <a
                    href={detail.passportUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: 'inline-block', marginTop: 8 }}
                  >
                    Открыть документ
                  </a>
                </>
              ) : (
                <p className="ui-text-muted">
                  {detail.passportFileError
                    ? `Паспорт: ${fileUnavailableLabel(detail.passportFileError)}`
                    : 'Паспорт: нет файла'}
                </p>
              )}
            </div>
          </div>
        )}
      </SectionCard>

      {detail.verificationStatus === 'pending' ? (
        <SectionCard title="Решение">
          <div className="ui-stack">
            <label className="ui-stack">
              <span>Причина отклонения (для «Отклонить»)</span>
              <input
                type="text"
                value={reason}
                disabled={isPending}
                onChange={(e) => setReason(e.target.value)}
                style={{ width: '100%' }}
              />
            </label>
            {reviewError ? <SectionError message={reviewError} /> : null}
            <div className="ui-inline" style={{ gap: 8 }}>
              <button
                type="button"
                className="ui-button ui-button--primary"
                disabled={isPending}
                onClick={() => void onApprove()}
              >
                {isPending ? 'Сохраняем…' : 'Подтвердить личность'}
              </button>
              <button
                type="button"
                className="ui-button ui-button--danger"
                disabled={isPending}
                onClick={() => void onReject()}
              >
                Отклонить
              </button>
            </div>
          </div>
        </SectionCard>
      ) : null}
    </PageContainer>
  );
}
