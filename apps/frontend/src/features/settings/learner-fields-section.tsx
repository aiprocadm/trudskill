'use client';

import { BlockedHint, LoadingState, LookupSelect, blockedProps } from '@trudskill/ui';
import { type ReactElement, useEffect, useState } from 'react';

import { SectionCard, SectionError } from '../../components/state-wrappers';
import { useUnsavedForm } from '../../components/use-unsaved-form';
import { useAuth } from '../auth/context';
import {
  EXTRA_FIELD_TYPE_LABEL,
  type ExtraFieldRow,
  LEARNER_EXTRA_FIELD_TYPES,
  type LearnerExtraFieldType,
  MAX_LEARNER_EXTRA_FIELDS,
  defFromRow,
  extraFieldVariableCode,
  learnerExtraFieldsFrom,
  rowFromDef,
  suggestExtraFieldKey,
  validateExtraFieldRows
} from '../learners/extra-fields';
import { useSaveLearnerExtraFields, useTenantSettings } from '../learners/use-extra-fields';

/** Строка редактора: пока имя не правили руками, оно строится из подписи (РМ88). */
type EditorRow = ExtraFieldRow & { keyEdited: boolean };

const EMPTY_ROW: EditorRow = { key: '', label: '', type: 'text', options: '', keyEdited: false };
const SAVE_KEY = 'learner-fields-save';

/**
 * Раздел настроек «Поля личного дела» (ТЗ перехода §6.4 МГ-C1.3; срез 8.14b).
 *
 * Вместо «дополнительная строка 1–10» из CDOPROF центр сам называет свои поля: подпись, имя
 * для документов, тип. Поля появляются в личном деле каждого слушателя и в шаблонах как
 * `{learner.extra.<имя>}`. Раздел виден только с правом `tenant.settings.write` — без него
 * пустая рамка выглядела бы сломанной.
 */
export function LearnerFieldsSettingsSection(): ReactElement | null {
  const { session } = useAuth();
  const settings = useTenantSettings();
  const { save, saving } = useSaveLearnerExtraFields();
  const [rows, setRows] = useState<EditorRow[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const savedRows: EditorRow[] = learnerExtraFieldsFrom(settings.data?.payload).map((def) => ({
    ...rowFromDef(def),
    keyEdited: true
  }));
  const savedKey = JSON.stringify(savedRows);

  // Форма наполняется тем, что вернул сервер, один раз на ответ (данные — источник истины).
  useEffect(() => {
    if (settings.data) setRows(JSON.parse(savedKey) as EditorRow[]);
  }, [settings.data, savedKey]);

  /* Защита от потери правок (ТЗ 10.3): исходное — ответ сервера, пока его нет — текущее. */
  const unsavedGuard = useUnsavedForm(
    { rows },
    { saving, initial: { rows: settings.data ? savedRows : rows } }
  );

  if (!session?.permissions.includes('tenant.settings.write')) return null;

  const setAt = (index: number, patch: Partial<EditorRow>) =>
    setRows((prev) =>
      prev.map((row, i) => {
        if (i !== index) return row;
        const next = { ...row, ...patch };
        if (patch.label !== undefined && !next.keyEdited)
          next.key = suggestExtraFieldKey(next.label);
        return next;
      })
    );
  const removeAt = (index: number) => setRows((prev) => prev.filter((_, i) => i !== index));
  const addRow = () => setRows((prev) => [...prev, { ...EMPTY_ROW }]);

  const problems = validateExtraFieldRows(rows);
  const blockedReason = problems[0];

  const onSave = async () => {
    setNotice(null);
    setActionError(null);
    try {
      const defs = rows.map(defFromRow);
      await save(defs);
      setNotice(
        defs.length > 0
          ? `Сохранено. Полей в личном деле: ${defs.length}.`
          : 'Сохранено. Своих полей в личном деле нет.'
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Не удалось сохранить поля');
    }
  };

  return (
    <SectionCard title="Поля личного дела">
      {unsavedGuard}
      <p className="ui-text-muted">
        Свои поля в карточке слушателя — например, «Отдел», «Табельный номер» или «Дата приёма». Они
        появятся в личном деле каждого слушателя, а в шаблоны документов вставляются по имени:{' '}
        <code>{'{' + extraFieldVariableCode('otdel') + '}'}</code>. Полей — до{' '}
        {MAX_LEARNER_EXTRA_FIELDS}.
      </p>
      {settings.isLoading ? <LoadingState message="Загрузка настроек…" /> : null}
      {settings.error ? <SectionError message="Не удалось загрузить настройки центра" /> : null}

      {!settings.isLoading && !settings.error ? (
        <div className="ui-stack">
          {rows.length === 0 ? (
            <p className="ui-hint">
              Пока ни одного своего поля: в личном деле только стандартные. Добавьте первое —
              например, «Отдел».
            </p>
          ) : null}

          {rows.map((row, index) => (
            <fieldset key={index} className="ui-field">
              <legend className="ui-field-label">Поле {index + 1}</legend>
              <div className="ui-inline">
                <input
                  className="ui-input"
                  aria-label={`Подпись поля ${index + 1}`}
                  value={row.label}
                  onChange={(e) => setAt(index, { label: e.target.value })}
                  placeholder="Подпись в карточке, например: Отдел"
                  maxLength={80}
                />
                <LookupSelect
                  label={`Тип поля ${index + 1}`}
                  value={row.type}
                  onChange={(value) => setAt(index, { type: value as LearnerExtraFieldType })}
                  items={LEARNER_EXTRA_FIELD_TYPES.map((type) => ({
                    value: type,
                    label: EXTRA_FIELD_TYPE_LABEL[type]
                  }))}
                />
                <button
                  type="button"
                  className="ui-button"
                  onClick={() => removeAt(index)}
                  aria-label={`Убрать поле ${index + 1}`}
                >
                  Убрать поле
                </button>
              </div>
              <label className="ui-field">
                <span className="ui-field-label">Имя для документов</span>
                <input
                  className="ui-input"
                  value={row.key}
                  onChange={(e) => setAt(index, { key: e.target.value, keyEdited: true })}
                  maxLength={40}
                />
                <span className="ui-hint">
                  Строится из подписи, можно поправить. В шаблоне документа:{' '}
                  <code>{'{' + extraFieldVariableCode(row.key || '…') + '}'}</code>
                </span>
              </label>
              {row.type === 'list' ? (
                <label className="ui-field">
                  <span className="ui-field-label">Варианты через запятую</span>
                  <input
                    className="ui-input"
                    value={row.options}
                    onChange={(e) => setAt(index, { options: e.target.value })}
                    placeholder="Например: дневная, ночная"
                  />
                </label>
              ) : null}
            </fieldset>
          ))}

          {rows.length < MAX_LEARNER_EXTRA_FIELDS ? (
            <div>
              <button type="button" className="ui-button" onClick={addRow}>
                + Добавить поле
              </button>
            </div>
          ) : (
            <p className="ui-hint">Достигнут предел: {MAX_LEARNER_EXTRA_FIELDS} полей.</p>
          )}

          {problems.length > 1 ? (
            <ul className="ui-callout ui-callout--danger">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          ) : null}
          {notice ? <p className="ui-callout">{notice}</p> : null}
          {actionError ? <SectionError message={actionError} /> : null}

          <div>
            <button
              type="button"
              className={`ui-button ui-button--primary ${saving ? 'ui-button--loading' : ''}`}
              disabled={saving}
              {...blockedProps(SAVE_KEY, blockedReason)}
              onClick={() => void onSave()}
            >
              Сохранить поля личного дела
            </button>
            <BlockedHint hintKey={SAVE_KEY} reason={blockedReason} />
          </div>
        </div>
      ) : null}
    </SectionCard>
  );
}
