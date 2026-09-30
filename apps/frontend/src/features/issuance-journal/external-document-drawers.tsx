'use client';

import {
  BlockedHint,
  DetailDrawer,
  DrawerCancelButton,
  FilePicker,
  blockedProps
} from '@trudskill/ui';
import { type ReactElement, useState } from 'react';

import {
  EXTERNAL_SCAN_ACCEPT,
  externalDocumentsApi,
  externalFormBlocked
} from './external-documents';
import { SectionError } from '../../components/state-wrappers';
import { hasPermission } from '../../lib/rbac/permissions';
import { useAuth } from '../auth/context';
import { useDocumentKinds } from '../documents/document-kinds';
import { putFileToPresignedUrl } from '../identity-verification/api';
import { LearnerSelect } from '../learners/learner-picker';

import type { UserSession } from '../../entities/session/model';

const REGISTER_HINT = 'external-document-register';
const SCAN_HINT = 'external-document-scan';

/** Файл → хранилище → идентификатор файла (шаги «адрес → загрузка»). */
const uploadScan = async (session: UserSession, file: File): Promise<string> => {
  const intent = await externalDocumentsApi.externalScanUploadUrl(session, file);
  await putFileToPresignedUrl(intent.uploadUrl, file);
  return intent.fileId;
};

/**
 * «Внести внешний документ» (МГ-F4.1, срез 22.2): удостоверение, выданное раньше — в CDOPROF или
 * на бумаге, — заносится реквизитами, чтобы быть в книге выдачи, у слушателя и в отчётах о
 * сроках. Перевыпустить его здесь нельзя, скан можно приложить сразу или позже.
 */
export function ExternalDocumentDrawer({
  onClose,
  onSaved
}: {
  onClose: () => void;
  onSaved: (message: string) => void | Promise<void>;
}): ReactElement | null {
  const { session } = useAuth();
  const kinds = useDocumentKinds().data?.items ?? [];
  const empty = {
    kindCode: '',
    number: '',
    date: '',
    learnerId: '',
    series: '',
    rank: '',
    validUntil: ''
  };
  const [form, setForm] = useState(empty);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const set = (key: keyof typeof empty, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));
  const blockedReason = externalFormBlocked(form);

  if (!session || !hasPermission(session.permissions, 'documents.write')) return null;

  const submit = async () => {
    if (blockedReason) return;
    setSaving(true);
    setError(null);
    try {
      const fileId = file ? await uploadScan(session, file) : undefined;
      const doc = await externalDocumentsApi.registerExternalDocument(session, {
        kindCode: form.kindCode,
        number: form.number.trim(),
        date: form.date,
        learnerId: form.learnerId,
        ...(form.series.trim() ? { series: form.series.trim() } : {}),
        ...(form.rank.trim() ? { rank: form.rank.trim() } : {}),
        ...(form.validUntil ? { validUntil: form.validUntil } : {}),
        ...(fileId ? { fileId } : {})
      });
      await onSaved(`Внешний документ № ${doc.documentNumber} внесён в книгу выдачи.`);
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DetailDrawer
      open
      onClose={onClose}
      title="Внести внешний документ"
      hasUnsavedChanges={JSON.stringify(form) !== JSON.stringify(empty) || file !== null}
    >
      <div className="ui-stack">
        <p className="ui-hint">
          Документ, выданный раньше — в CDOPROF или на бумаге. Он появится в книге выдачи и у
          слушателя, но перевыпустить его здесь нельзя: только приложить скан.
        </p>
        <label className="ui-field">
          <span className="ui-field-label">Вид документа</span>
          <select
            value={form.kindCode}
            style={{ maxWidth: '100%' }}
            onChange={(e) => set('kindCode', e.target.value)}
          >
            <option value="">— выберите вид —</option>
            {kinds.map((kind) => (
              <option key={kind.code} value={kind.code}>
                {kind.name}
              </option>
            ))}
          </select>
        </label>
        <div className="ui-inline">
          <label className="ui-field">
            <span className="ui-field-label">Номер</span>
            <input
              className="ui-input"
              value={form.number}
              onChange={(e) => set('number', e.target.value)}
            />
          </label>
          <label className="ui-field">
            <span className="ui-field-label">Дата выдачи</span>
            <input
              className="ui-input"
              type="date"
              value={form.date}
              onChange={(e) => set('date', e.target.value)}
            />
          </label>
        </div>
        <LearnerSelect value={form.learnerId} onChange={(id) => set('learnerId', id)} />
        <div className="ui-inline">
          <label className="ui-field">
            <span className="ui-field-label">Серия</span>
            <input
              className="ui-input"
              value={form.series}
              onChange={(e) => set('series', e.target.value)}
            />
          </label>
          <label className="ui-field">
            <span className="ui-field-label">Разряд</span>
            <input
              className="ui-input"
              value={form.rank}
              onChange={(e) => set('rank', e.target.value)}
            />
          </label>
          <label className="ui-field">
            <span className="ui-field-label">Действует до</span>
            <input
              className="ui-input"
              type="date"
              value={form.validUntil}
              onChange={(e) => set('validUntil', e.target.value)}
            />
          </label>
        </div>
        <FilePicker
          ariaLabel="Скан документа"
          buttonLabel={file ? `Скан: ${file.name}` : 'Приложить скан (необязательно)'}
          accept={EXTERNAL_SCAN_ACCEPT}
          disabled={saving}
          onSelect={(picked) => setFile(picked)}
        />
        {error !== null ? <SectionError error={error} /> : null}
        <div className="ui-modal-actions">
          <DrawerCancelButton className="ui-button" disabled={saving} onFallbackClose={onClose} />
          <button
            type="button"
            className={`ui-button ui-button--primary ${saving ? 'ui-button--loading' : ''}`}
            onClick={() => void submit()}
            disabled={saving}
            {...blockedProps(REGISTER_HINT, blockedReason)}
          >
            Внести внешний документ
          </button>
        </div>
        <BlockedHint hintKey={REGISTER_HINT} reason={blockedReason} />
      </div>
    </DetailDrawer>
  );
}

/** «Загрузить скан» внешнего документа — единственное, что с ним можно сделать (МГ-F4.1). */
export function ExternalScanDrawer({
  documentId,
  documentNumber,
  onClose,
  onSaved
}: {
  documentId: string;
  documentNumber?: string | undefined;
  onClose: () => void;
  onSaved: (message: string) => void | Promise<void>;
}): ReactElement | null {
  const { session } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const blockedReason = file ? undefined : 'Выберите файл скана';

  if (!session || !hasPermission(session.permissions, 'documents.write')) return null;

  const submit = async () => {
    if (!file) return;
    setSaving(true);
    setError(null);
    try {
      const fileId = await uploadScan(session, file);
      await externalDocumentsApi.attachExternalScan(session, documentId, fileId);
      await onSaved('Скан загружен. Скачать его можно после проверки антивирусом.');
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DetailDrawer
      open
      onClose={onClose}
      title={`Загрузить скан${documentNumber ? `: № ${documentNumber}` : ''}`}
      hasUnsavedChanges={file !== null}
    >
      <div className="ui-stack">
        <FilePicker
          ariaLabel="Скан документа"
          buttonLabel={file ? `Скан: ${file.name}` : 'Выбрать файл'}
          accept={EXTERNAL_SCAN_ACCEPT}
          disabled={saving}
          onSelect={(picked) => setFile(picked)}
        />
        {error !== null ? <SectionError error={error} /> : null}
        <div className="ui-modal-actions">
          <DrawerCancelButton className="ui-button" disabled={saving} onFallbackClose={onClose} />
          <button
            type="button"
            className={`ui-button ui-button--primary ${saving ? 'ui-button--loading' : ''}`}
            onClick={() => void submit()}
            disabled={saving}
            {...blockedProps(SCAN_HINT, blockedReason)}
          >
            Загрузить скан
          </button>
        </div>
        <BlockedHint hintKey={SCAN_HINT} reason={blockedReason} />
      </div>
    </DetailDrawer>
  );
}
