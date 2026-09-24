'use client';

import { BlockedHint, blockedProps } from '@trudskill/ui';
import { useState } from 'react';

import { fetchSamplePdfUrl } from './document-sample';
import { useAuth } from '../auth/context';
import { templateTypeLabel } from '../documents/document-types';
import { useDocumentTemplates } from '../mvp/hooks';

const HINT_KEY = 'document-sample';

/**
 * «Показать образец» (МГ-F5.1, срез 20.2): бланк, заполненный данными этой группы и выбранного
 * слушателя, — до выпуска. Номер не тратится: вместо него «ОБРАЗЕЦ». Слушатель нужен для
 * удостоверения; для приказа и протокола — нет.
 */
export function DocumentSampleForm({
  groupId,
  learners
}: {
  groupId: string;
  learners: ReadonlyArray<{ enrollmentId: string; name: string }>;
}) {
  const { session } = useAuth();
  const { data: templates } = useDocumentTemplates();
  const [templateId, setTemplateId] = useState('');
  const [enrollmentId, setEnrollmentId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const blockedReason = templateId ? undefined : 'Выберите шаблон документа';

  const show = async () => {
    if (!session || !templateId) return;
    setBusy(true);
    setError(null);
    try {
      const url = await fetchSamplePdfUrl(session, {
        templateId,
        groupId,
        ...(enrollmentId ? { enrollmentId } : {})
      });
      window.open(url, '_blank', 'noopener');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Образец собрать не удалось.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ui-stack">
      <strong>Образец документа</strong>
      <p className="ui-hint">
        Посмотрите, как выйдет документ на данных этой группы, до выпуска. Номер не расходуется —
        вместо него стоит «ОБРАЗЕЦ».
      </p>
      <div className="ui-inline">
        <label className="ui-field" style={{ minWidth: 0, maxWidth: '100%' }}>
          <span className="ui-field-label">Шаблон</span>
          <select
            value={templateId}
            style={{ maxWidth: '100%' }}
            onChange={(e) => setTemplateId(e.target.value)}
          >
            <option value="">— выберите шаблон —</option>
            {(templates?.items ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({templateTypeLabel(t.templateType)})
              </option>
            ))}
          </select>
        </label>
        <label className="ui-field" style={{ minWidth: 0, maxWidth: '100%' }}>
          <span className="ui-field-label">Слушатель</span>
          <select
            value={enrollmentId}
            style={{ maxWidth: '100%' }}
            onChange={(e) => setEnrollmentId(e.target.value)}
          >
            <option value="">без слушателя — документ на группу</option>
            {learners.map((l) => (
              <option key={l.enrollmentId} value={l.enrollmentId}>
                {l.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={`ui-button ${busy ? 'ui-button--loading' : ''}`}
          onClick={() => void show()}
          disabled={busy}
          {...blockedProps(HINT_KEY, blockedReason)}
        >
          Показать образец
        </button>
      </div>
      <BlockedHint hintKey={HINT_KEY} reason={blockedReason} />
      {error ? (
        <p className="ui-field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
