'use client';

import {
  BlockedHint,
  DetailLayout,
  FilePicker,
  FormField,
  KeyValueList,
  ListPage,
  LoadingState,
  SelectField,
  StatusChip,
  SystemMessage,
  blockedProps
} from '@trudskill/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { identityVerificationApi } from './api';
import { identitySubmitBlockedReason } from './blocked';
import {
  fileUnavailableLabel,
  formatDateShort,
  formatIdentityStatus,
  formatWaitingTime,
  isWaitingTooLong
} from './format';
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
  SectionError
} from '../../components/state-wrappers';
import { frontendEnv } from '../../lib/config/env';
import { LEARNER_NOT_LINKED_TEXT, isLearnerNotLinked } from '../../lib/errors/learner-link';
import { useAuth } from '../auth/context';
import { useConsentDocuments, useConsentToggle, useMyConsents } from '../consents/hooks';
import { useObjectCrumb } from '../navigation/use-object-crumb';

import type { IdentityVerificationStatus } from './types';
import type { ReactElement } from 'react';

export function LearnerIdentityScreen(): ReactElement {
  const { session } = useAuth();
  const my = useMyIdentityVerification();
  const submission = useIdentitySubmission();

  const [selfie, setSelfie] = useState<File | null>(null);
  const [passport, setPassport] = useState<File | null>(null);
  const [esiaPending, setEsiaPending] = useState(false);

  /*
   * ФТ-C3.2 (Фаза 3 Task 6): согласий ДВА и они независимы, поэтому галочки хранятся не
   * в состоянии экрана, а на сервере: снятая галочка — это отзыв согласия, а отзыв обязан
   * пережить перезагрузку страницы. Отзыв одного вида не трогает другой.
   */
  const consents = useMyConsents();
  const consentDocuments = useConsentDocuments();
  const consentToggle = useConsentToggle();
  const personalDataGranted = consents.data?.personalData.granted ?? false;
  const photoGranted = consents.data?.photo.granted ?? false;

  /* ТЗ 5.8 (Э8): кнопка не просто выключается, а называет недостающее поимённо. */
  const submitBlockedReason = identitySubmitBlockedReason({
    selfie: selfie !== null,
    passport: passport !== null,
    personalDataGranted,
    photoGranted
  });

  const onToggleConsent = async (kind: 'personal_data' | 'photo', next: boolean) => {
    const ok = await consentToggle.toggle(kind, next);
    if (ok) await consents.refetch();
  };

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

  /*
   * ТЗ 2.4 (Б6): нет связи с карточкой слушателя — формы нет вовсе.
   *
   * Как было: экран показывал живую форму загрузки селфи и паспорта человеку, у которого
   * отправка заведомо не пройдёт. Он выбирал два файла, ставил две галочки, жал «Отправить на
   * проверку» — и только тогда узнавал, что учётная запись не связана с личным делом. Галочки
   * согласий при этом тоже не работали: каждая давала свой отказ.
   *
   * Сигнал был на экране всё это время и не читался: `/consents/me` честно отвечает
   * `learner_not_linked`, потому что согласия дают ЗА карточку слушателя, а карточки нет.
   *
   * Почему берём его отсюда, а не из `my`: ручка «мои проверки» отвечает `null` И когда заявки
   * просто ещё нет, И когда профиля не существует, — эти два случая по её ответу неразличимы.
   */
  /* `isError` у нашего слоя загрузки НЕТ — он отдаёт только `data`, `error`, `isLoading`. */
  if (isLearnerNotLinked(consents.error)) {
    return (
      <PageContainer>
        <SystemMessage
          title={LEARNER_NOT_LINKED_TEXT.title}
          what={LEARNER_NOT_LINKED_TEXT.what}
          next={LEARNER_NOT_LINKED_TEXT.next}
          whom={LEARNER_NOT_LINKED_TEXT.whom}
          action={
            <Link href="/chat" className="ui-button ui-button--primary">
              Написать в учебный центр
            </Link>
          }
        />
      </PageContainer>
    );
  }

  if (my.isLoading || consents.isLoading) return <LoadingState message="Загрузка…" />;

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
            <div className="ui-stack">
              <span>Селфи (фото лица)</span>
              <FilePicker
                ariaLabel="Селфи (фото лица)"
                accept="image/png,image/jpeg"
                disabled={submission.isPending}
                fileName={selfie?.name ?? null}
                onSelect={setSelfie}
              />
            </div>

            <div className="ui-stack">
              <span>Фото разворота паспорта</span>
              <FilePicker
                ariaLabel="Фото разворота паспорта"
                accept="image/png,image/jpeg,application/pdf"
                disabled={submission.isPending}
                fileName={passport?.name ?? null}
                onSelect={setPassport}
              />
            </div>

            <label className="ui-inline">
              <input
                type="checkbox"
                data-testid="consent-personal-data"
                checked={personalDataGranted}
                disabled={submission.isPending || consentToggle.pendingKind !== null}
                onChange={(e) => void onToggleConsent('personal_data', e.target.checked)}
              />
              <span>Даю согласие на обработку персональных данных (152-ФЗ)</span>
            </label>
            {consentDocuments.data?.personal_data ? (
              <details className="ui-text-muted">
                <summary>Текст согласия на обработку данных</summary>
                <p>{consentDocuments.data.personal_data.body}</p>
              </details>
            ) : null}

            <label className="ui-inline">
              <input
                type="checkbox"
                data-testid="consent-photo"
                checked={photoGranted}
                disabled={submission.isPending || consentToggle.pendingKind !== null}
                onChange={(e) => void onToggleConsent('photo', e.target.checked)}
              />
              <span>
                Отдельно даю согласие на фотографирование и обработку изображения моего лица
              </span>
            </label>
            {consentDocuments.data?.photo ? (
              <details className="ui-text-muted">
                <summary>Текст согласия на фото</summary>
                <p>{consentDocuments.data.photo.body}</p>
              </details>
            ) : null}

            {!photoGranted ? (
              // Отказ от фото — законное право слушателя, и он должен видеть последствие
              // ЯВНО, а не упереться в молча заблокированную кнопку.
              <p className="ui-text-muted" data-testid="photo-consent-required">
                Без согласия на фото подтверждение личности по документам недоступно. Согласие на
                обработку данных при этом остаётся в силе — его снимать не нужно.
              </p>
            ) : null}

            {consentToggle.error ? <SectionError message={consentToggle.error} /> : null}
            {submission.error ? <SectionError message={submission.error} /> : null}

            {/*
              ТЗ 5.8 (Э8): кнопка была выключена молча — человек жал по бледно-оранжевому
              прямоугольнику и не понимал, чего не хватает (журнал 465). Теперь она серая,
              а рядом стоит строка с недостающим — поимённо, а не «заполните всё».
            */}
            <button
              type="button"
              className={`ui-button ui-button--primary ${submission.isPending ? 'ui-button--loading' : ''}`}
              {...blockedProps('idv-submit', submitBlockedReason)}
              disabled={submitBlockedReason !== undefined || submission.isPending}
              onClick={() => void onSubmit()}
            >
              Отправить на проверку
            </button>
            <BlockedHint hintKey="idv-submit" reason={submitBlockedReason} />
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
  statusView: ReactElement;
  submittedAtView: string;
  /** ФТ-C1.2: сколько заявка ждёт — висящая заявка это заблокированный экзамен. */
  waitingView: ReactElement;
}

export function AdminIdentityQueueScreen(): ReactElement {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<IdentityVerificationStatus | undefined>(
    'pending'
  );
  const { data, isLoading, error } = useIdentityQueue(statusFilter);

  const rows: QueueRow[] = (data ?? []).map((item) => ({
    id: item.id,
    learnerNameView: item.learnerName || '—',
    snilsView: item.learnerSnils ?? '—',
    statusView: (
      <StatusChip
        status={item.verificationStatus}
        label={formatIdentityStatus(item.verificationStatus)}
      />
    ),
    submittedAtView: formatDateShort(item.submittedAt),
    /*
     * Долгое ожидание — не значок «⚠» внутри текста, а отдельный признак: экзамен
     * заблокирован, пока заявку не разобрали. Цвет не единственный носитель смысла —
     * рядом стоит слово (WCAG 1.4.1).
     */
    waitingView: isWaitingTooLong(item.submittedAt) ? (
      <StatusChip
        status="blocked"
        label={`${formatWaitingTime(item.submittedAt)} — ждёт дольше суток`}
      />
    ) : (
      <span>{formatWaitingTime(item.submittedAt)}</span>
    )
  }));

  return (
    <PageContainer>
      <PageHeader
        title="Проверка личности"
        subtitle="Заявки слушателей: селфи и фото паспорта. Пока заявка не разобрана, слушателя не пустит на итоговый экзамен."
      />

      <ListPage<QueueRow>
        filters={
          <SelectField
            label="Статус"
            value={statusFilter ?? ''}
            onChange={(e) =>
              setStatusFilter(
                e.target.value === '' ? undefined : (e.target.value as IdentityVerificationStatus)
              )
            }
            options={STATUS_FILTER_OPTIONS.map((o) => ({ value: o.value ?? '', label: o.label }))}
          />
        }
        columns={[
          { key: 'learnerNameView', title: 'Слушатель' },
          { key: 'snilsView', title: 'СНИЛС' },
          { key: 'statusView', title: 'Статус', render: (row) => row.statusView },
          { key: 'submittedAtView', title: 'Отправлено' },
          { key: 'waitingView', title: 'Ждёт', render: (row) => row.waitingView }
        ]}
        rows={rows}
        isLoading={isLoading}
        error={error ? new Error('Не удалось загрузить очередь заявок') : undefined}
        rowKey={(row) => row.id}
        rowActions={(row) => [
          {
            label: 'Открыть заявку',
            primary: true,
            onSelect: () => router.push(`/admin/identity-verifications/${row.id}`)
          }
        ]}
        emptyMessage="Заявок на проверку нет"
        emptyHint="Слушатель присылает селфи и фото паспорта перед итоговым экзаменом. Заявка появится здесь, как только он их отправит."
      />
    </PageContainer>
  );
}

export function AdminIdentityDetailScreen({ id }: { id: string }): ReactElement {
  const { data: detail, isLoading, error, refetch } = useIdentityDetail(id);
  useObjectCrumb(detail?.learnerName, { failed: Boolean(error) });
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
        title={detail.learnerName}
        subtitle={`Подтверждение личности — ${formatIdentityStatus(detail.verificationStatus)}`}
      />

      <DetailLayout
        aside={
          <SectionCard title="Сверьте с паспортом">
            <KeyValueList
              items={[
                { label: 'ФИО', value: detail.learnerName },
                { label: 'СНИЛС', value: detail.learnerSnils ?? '—' },
                { label: 'Дата рождения', value: formatDateShort(detail.learnerDateOfBirth) },
                { label: 'Согласие на обработку данных', value: formatDateShort(detail.consentAt) },
                /* ФТ-C3.2: отдельное согласие на фото — отдельная строка доказательной базы. */
                { label: 'Согласие на фото', value: formatDateShort(detail.photoConsentAt) }
              ]}
            />
          </SectionCard>
        }
      >
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
                  <img src={detail.selfieUrl} alt="Селфи" className="ui-doc-preview" />
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
                        className="ui-doc-preview ui-doc-preview--wide"
                      />
                    ) : null}
                    <a
                      href={detail.passportUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="ui-doc-link"
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
              {/*
               * Причина отклонения обязательна. Сервер её не требует, и раньше заявку можно
               * было отклонить молча: слушатель видел «Отклонена» без единого слова о том,
               * что переснять, и звонил в центр. `TXT-004` — сообщение говорит, что делать.
               */}
              <FormField
                label="Причина отклонения"
                hint="Слушатель увидит эту причину и по ней поймёт, что переснять. Для подтверждения личности заполнять не нужно."
                value={reason}
                disabled={isPending}
                onChange={(e) => setReason(e.target.value)}
              />
              {reviewError ? <SectionError message={reviewError} /> : null}
              <div className="ui-inline">
                <button
                  type="button"
                  className={`ui-button-primary ${isPending ? 'ui-button--loading' : ''}`}
                  disabled={isPending}
                  onClick={() => void onApprove()}
                >
                  {/* TXT-003: подпись неподвижна, занятость показывает крутилка. */}
                  Подтвердить личность
                </button>
                <button
                  type="button"
                  className="ui-button ui-button--danger"
                  disabled={isPending || reason.trim() === ''}
                  title={
                    reason.trim() === ''
                      ? 'Укажите причину — слушатель должен её увидеть'
                      : undefined
                  }
                  onClick={() => void onReject()}
                >
                  Отклонить заявку
                </button>
              </div>
            </div>
          </SectionCard>
        ) : null}
      </DetailLayout>
    </PageContainer>
  );
}
