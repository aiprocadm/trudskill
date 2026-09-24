'use client';

import { BlockedHint, KeyValueList, LoadingState, LookupSelect, blockedProps } from '@trudskill/ui';
import { useState } from 'react';

import { useLearnerFiles } from './hooks';
import { SectionError } from '../../components/state-wrappers';
import { hasPermission } from '../../lib/rbac/permissions';
import { useAuth } from '../auth/context';
import { useLearnerConsents, useMarkPaperConsent } from '../consents/hooks';
import { formatDate } from '../mvp/screen-helpers';

import type { ConsentKind, ConsentStateDto } from '../consents/types';

const KIND_LABEL: Record<ConsentKind, string> = {
  personal_data: 'Согласие на обработку ПДн',
  photo: 'Согласие на фото'
};

const SOURCE_LABEL: Record<string, string> = {
  self: 'дано в кабинете',
  paper: 'бумажное',
  legacy: 'перенесено',
  imported: 'перенесено из прежней системы'
};

const SUBMIT_KEY = 'consent-paper-submit';
const today = (): string => new Date().toISOString().slice(0, 10);

/** Строка состояния согласия — словами: действует с даты и откуда, отозвано, нет. */
export const consentStateLabel = (state: ConsentStateDto): string => {
  if (state.granted) {
    const source = state.source ? (SOURCE_LABEL[state.source] ?? state.source) : undefined;
    const parts = [
      `действует${state.grantedAt ? ` с ${formatDate(state.grantedAt)}` : ''}`,
      source,
      state.evidenceFileId ? 'скан в личном деле' : undefined,
      state.renewalRecommended ? 'текст согласия обновлён — стоит переподписать' : undefined
    ].filter(Boolean);
    return parts.join(', ');
  }
  if (state.revokedAt) return `отозвано ${formatDate(state.revokedAt)}`;
  return 'нет';
};

/**
 * Согласия слушателя на карточке (ТЗ перехода §6.4 МГ-C5.1; срез 12.1, РМ109–РМ111): состояние
 * обоих согласий словами и «Отметить бумажное согласие» — дата подписи и скан из личного дела.
 */
export function LearnerConsentBlock({ learnerId }: { learnerId: string }) {
  const { session } = useAuth();
  const canMark = hasPermission(session?.permissions ?? [], 'learners.write');
  const consents = useLearnerConsents(learnerId);
  const files = useLearnerFiles(learnerId);
  const mark = useMarkPaperConsent();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ConsentKind>('personal_data');
  const [signedAt, setSignedAt] = useState(today());
  const [fileId, setFileId] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);

  const cleanFiles = (files.data?.items ?? []).filter((file) => file.antivirusStatus === 'clean');
  const blockedReason = !signedAt ? 'Укажите дату подписи согласия.' : undefined;

  const submit = () => {
    setActionError(null);
    setNotice(null);
    mark
      .run(learnerId, kind, { signedAt, ...(fileId ? { fileId } : {}) })
      .then(() => {
        setNotice(`${KIND_LABEL[kind]}: бумажное согласие отмечено.`);
        setOpen(false);
        setFileId('');
      })
      .catch((err: unknown) => setActionError(err));
  };

  return (
    <div className="ui-stack">
      {consents.isLoading ? <LoadingState message="Загружаем согласия…" /> : null}
      {consents.error ? <SectionError error={consents.error} /> : null}
      {consents.data ? (
        <KeyValueList
          items={[
            {
              label: KIND_LABEL.personal_data,
              value: consentStateLabel(consents.data.personalData)
            },
            { label: KIND_LABEL.photo, value: consentStateLabel(consents.data.photo) }
          ]}
        />
      ) : null}
      {notice ? (
        <p className="ui-callout" role="status">
          {notice}
        </p>
      ) : null}
      {actionError !== null ? <SectionError error={actionError} /> : null}

      {canMark && !open ? (
        <div className="ui-form-actions">
          <button type="button" className="ui-button" onClick={() => setOpen(true)}>
            Отметить бумажное согласие
          </button>
        </div>
      ) : null}

      {canMark && open ? (
        <div className="ui-stack">
          <div className="ui-field">
            <span className="ui-field-label">Какое согласие</span>
            <LookupSelect
              label="Вид согласия"
              value={kind}
              onChange={(value) => setKind(value as ConsentKind)}
              items={[
                { value: 'personal_data', label: KIND_LABEL.personal_data },
                { value: 'photo', label: KIND_LABEL.photo }
              ]}
            />
          </div>
          <label className="ui-field">
            <span className="ui-field-label">Дата подписи</span>
            <input
              className="ui-input"
              type="date"
              value={signedAt}
              max={today()}
              onChange={(e) => setSignedAt(e.target.value)}
            />
          </label>
          <div className="ui-field">
            <span className="ui-field-label">Скан согласия из личного дела</span>
            <LookupSelect
              label="Скан согласия"
              value={fileId}
              onChange={setFileId}
              items={[
                { value: '', label: 'без скана' },
                ...cleanFiles.map((file) => ({ value: file.fileId, label: file.name }))
              ]}
            />
            <span className="ui-hint">
              Скан загружается во вкладке «Файлы»; здесь выбирается уже проверенный антивирусом.
            </span>
          </div>
          <div className="ui-form-actions">
            <button type="button" className="ui-button" onClick={() => setOpen(false)}>
              Отмена
            </button>
            <button
              type="button"
              className={`ui-button ui-button--primary ${mark.isRunning ? 'ui-button--loading' : ''}`}
              disabled={mark.isRunning}
              {...blockedProps(SUBMIT_KEY, blockedReason)}
              onClick={submit}
            >
              Отметить бумажное согласие
            </button>
            <BlockedHint hintKey={SUBMIT_KEY} reason={blockedReason} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
