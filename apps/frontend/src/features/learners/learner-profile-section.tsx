'use client';

import { KeyValueList, useConfirmDialog } from '@trudskill/ui';
import { useState } from 'react';

import { learnersApi } from './api';
import { SectionCard, SectionError } from '../../components/state-wrappers';
import { hasPermission } from '../../lib/rbac/permissions';
import { useAuth } from '../auth/context';
import { educationLevelLabel } from '../lookup/labels';
import { useCounterpartiesList } from '../mvp/hooks';
import { formatDate } from '../mvp/screen-helpers';

import type { LearnerPassport, LearnerProfile } from './types';

export const GENDER_LABEL: Record<string, string> = { m: 'мужской', f: 'женский' };

/** Паспорт для чтения: с сервера приходит маской (строкой) или, после раскрытия, объектом. */
export const passportLabel = (passport: LearnerPassport | string | undefined): string => {
  if (!passport) return 'не указан';
  if (typeof passport === 'string') return passport;
  const issued = [
    passport.issuedAt ? `выдан ${formatDate(passport.issuedAt)}` : '',
    passport.issuedBy ?? ''
  ]
    .filter(Boolean)
    .join(', ');
  return (
    `${passport.series ?? ''} ${passport.number ?? ''}`.trim() + (issued ? ` (${issued})` : '')
  );
};

export const diplomaLabel = (diploma: LearnerProfile['diploma']): string => {
  if (!diploma) return 'не указан';
  const parts = [
    [diploma.series, diploma.number].filter(Boolean).join(' '),
    diploma.institution ?? '',
    diploma.surnameInDiploma ? `фамилия в дипломе: ${diploma.surnameInDiploma}` : ''
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : 'не указан';
};

/**
 * Личное дело слушателя на карточке (ТЗ перехода §4, МГ-C1.1; срез 8.12b, РМ79).
 *
 * Сервер отдаёт СНИЛС, дату рождения и паспорт масками; настоящие значения — только по
 * кнопке с причиной и правом `learners.pii.manage` (ручка `POST /learners/:id/pii/reveal`,
 * каждое раскрытие — в журнале). Раскрытое живёт в памяти экрана до перезагрузки.
 */
export function LearnerProfileSection({ learner }: { learner: LearnerProfile }) {
  const { session } = useAuth();
  const canReveal = hasPermission(session?.permissions ?? [], 'learners.pii.manage');
  const { ask, dialog } = useConfirmDialog();
  const [revealed, setRevealed] = useState<{
    snils?: string;
    passport?: LearnerPassport | string;
    birthDate?: string;
  } | null>(null);
  const [revealError, setRevealError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const { data: counterparties } = useCounterpartiesList({ page: 1, page_size: 200 });
  const companyName = learner.counterpartyId
    ? (counterparties?.items.find((item) => item.id === learner.counterpartyId)?.name ?? 'компания')
    : 'не указана';

  const reveal = () =>
    ask(
      {
        title: `Показать СНИЛС, паспорт и дату рождения: ${learner.lastName} ${learner.firstName}`,
        message:
          'Раскрытие персональных данных записывается в журнал с вашим именем и причиной. Назовите обращение или задачу, ради которой нужны настоящие значения.',
        confirmLabel: 'Показать данные',
        input: {
          label: 'Причина',
          placeholder: 'Например: заявка на удостоверение №12',
          required: true
        }
      },
      (reason) => {
        if (!session) return;
        setBusy(true);
        setRevealError(null);
        learnersApi
          .revealPii(session, learner.id, reason ?? '')
          .then((data) => setRevealed(data))
          .catch((error) => setRevealError(error))
          .finally(() => setBusy(false));
      }
    );

  return (
    <SectionCard title="Личное дело">
      {dialog}
      {revealError !== null ? <SectionError error={revealError} /> : null}
      <KeyValueList
        items={[
          {
            label: 'Дата рождения',
            value: revealed?.birthDate
              ? formatDate(revealed.birthDate)
              : (learner.dateOfBirth ?? 'не указана')
          },
          {
            label: 'Пол',
            value: learner.gender ? (GENDER_LABEL[learner.gender] ?? learner.gender) : 'не указан'
          },
          { label: 'СНИЛС', value: revealed?.snils ?? learner.snils ?? 'не указан' },
          { label: 'Паспорт', value: passportLabel(revealed?.passport ?? learner.passport) },
          { label: 'Гражданство', value: learner.citizenship ?? 'не указано' },
          { label: 'Место рождения', value: learner.birthPlace ?? 'не указано' },
          { label: 'Адрес регистрации', value: learner.registrationAddress ?? 'не указан' },
          { label: 'Образование', value: educationLevelLabel(learner.educationLevel) },
          { label: 'Диплом', value: diplomaLabel(learner.diploma) },
          { label: 'Компания', value: companyName },
          { label: 'Должность', value: learner.position ?? 'не указана' },
          { label: 'Телефон', value: learner.phone ?? 'не указан' },
          {
            label: 'Доставка документов',
            value:
              [
                learner.deliveryMethod,
                learner.trackingNumber ? `трек ${learner.trackingNumber}` : ''
              ]
                .filter(Boolean)
                .join(', ') || 'не указана'
          }
        ]}
      />
      {canReveal && !revealed ? (
        <div className="ui-form-actions">
          <button type="button" className="ui-button" onClick={reveal} disabled={busy}>
            Показать СНИЛС, паспорт и дату рождения
          </button>
        </div>
      ) : null}
      {!canReveal ? (
        <p className="ui-hint">
          СНИЛС, паспорт и дата рождения показаны частично: настоящие значения открывает
          администратор центра по причине.
        </p>
      ) : null}
    </SectionCard>
  );
}
