'use client';

import { LoadingState } from '@cdoprof/ui';
import { useState } from 'react';

import { formatDateShort, formatIdentityStatus } from './format';
import { useIdentitySubmission, useMyIdentityVerification } from './hooks';
import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionError
} from '../../components/state-wrappers';

import type { ReactElement } from 'react';

export function LearnerIdentityScreen(): ReactElement {
  const my = useMyIdentityVerification();
  const submission = useIdentitySubmission();

  const [selfie, setSelfie] = useState<File | null>(null);
  const [passport, setPassport] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);

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
              className="ui-button"
              disabled={!selfie || !passport || !consent || submission.isPending}
              onClick={() => void onSubmit()}
            >
              {submission.isPending ? 'Отправка…' : 'Отправить на проверку'}
            </button>
          </div>
        </SectionCard>
      ) : null}
    </PageContainer>
  );
}
