'use client';

import { BlockedHint, DetailDrawer, DrawerCancelButton, blockedProps } from '@trudskill/ui';
import { useState } from 'react';

import {
  type CreateNumberingRuleInput,
  type NumberPart,
  type NumberResetPeriod,
  numberingApi,
  previewNumber,
  usesGroupFacts
} from './api';
import { NUMBERING_PRESETS, presetOf } from './presets';
import { SectionError } from '../../components/state-wrappers';
import { useAuth } from '../auth/context';
import { kindsForTemplateType, useDocumentKinds } from '../documents/document-kinds';
import { ALL_TEMPLATE_TYPES, TEMPLATE_TYPE_LABELS } from '../documents/document-types';

/** Договор нумеруется в CRM, а не здесь (Pillar A Plan B §5.4). */
const NUMBERED_TYPES = ALL_TEMPLATE_TYPES.filter((type) => type !== 'contract');

export const RESET_PERIODS: { value: NumberResetPeriod; label: string }[] = [
  { value: 'none', label: 'Без сброса (сквозная)' },
  { value: 'year', label: 'Каждый год' },
  { value: 'month', label: 'Каждый месяц' }
];

export interface RuleForm {
  documentType: string;
  kindCode: string;
  pattern: string;
  prefix: string;
  suffix: string;
  series: string;
  parts: NumberPart[];
  resetPeriod: NumberResetPeriod;
  startCounter: string;
}

const EMPTY_FORM: RuleForm = {
  documentType: 'certificate',
  kindCode: '',
  pattern: '{prefix}{counter}{suffix}',
  prefix: '',
  suffix: '',
  series: '',
  parts: [
    { start: 1, auto: false },
    { start: 1, auto: true },
    { start: 1, auto: false }
  ],
  resetPeriod: 'none',
  startCounter: '1'
};

/** Тело запроса из формы: поля, которых нет в маске, не отправляются. */
export const toCreateInput = (form: RuleForm, startCounter: number): CreateNumberingRuleInput => ({
  documentType: form.documentType,
  pattern: form.pattern,
  resetPeriod: form.resetPeriod,
  startCounter,
  ...(form.kindCode ? { kindCode: form.kindCode } : {}),
  ...(form.pattern.includes('{prefix}') && form.prefix ? { prefix: form.prefix } : {}),
  ...(form.pattern.includes('{suffix}') && form.suffix ? { suffix: form.suffix } : {}),
  ...(form.pattern.includes('{series}') && form.series.trim()
    ? { series: form.series.trim() }
    : {}),
  ...(form.pattern.includes('{parts}') ? { parts: form.parts } : {})
});

/**
 * Новый нумератор (МГ-F3.1, срез 19.3). Раньше — семь полей в одну строку под таблицей,
 * маска вписывалась руками по памяти о токенах. Теперь: тип и вид документа, «как нумеровать»
 * фразой CDOPROF, лишние поля скрыты, первый номер виден до сохранения.
 */
export function NumberingRuleDrawer({
  onClose,
  onSaved
}: {
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { session } = useAuth();
  const kinds = useDocumentKinds().data?.items ?? [];
  const [form, setForm] = useState<RuleForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const set = <K extends keyof RuleForm>(key: K, value: RuleForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));
  const setPart = (index: number, patch: Partial<NumberPart>) =>
    setForm((prev) => ({
      ...prev,
      parts: prev.parts.map((part, i) => (i === index ? { ...part, ...patch } : part))
    }));

  const fittingKinds = kindsForTemplateType(kinds, form.documentType);
  const preset = presetOf(form.pattern);
  const parsedStart = Number.parseInt(form.startCounter, 10);
  const startIsValid = Number.isFinite(parsedStart) && parsedStart >= 1;
  const preview = startIsValid
    ? previewNumber(
        {
          prefix: form.prefix,
          suffix: form.suffix,
          pattern: form.pattern,
          resetPeriod: form.resetPeriod,
          series: form.series,
          parts: form.parts
        },
        parsedStart
      )
    : null;

  // ТЗ 5.8: выключенная кнопка говорит, чего не хватает, — а не молчит.
  const startBlockedReason = startIsValid
    ? undefined
    : 'Укажите, с какого номера начать: целое число от 1';

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!session || !startIsValid) return;
    setSaving(true);
    setError(null);
    try {
      await numberingApi.create(session, toCreateInput(form, parsedStart));
      onSaved('Нумератор сохранён. Он заменил прежний нумератор того же типа и вида.');
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
      title="Новый нумератор"
      hasUnsavedChanges={JSON.stringify(form) !== JSON.stringify(EMPTY_FORM)}
    >
      <form onSubmit={(e) => void submit(e)} className="ui-stack">
        <label className="ui-field">
          <span className="ui-field-label">Тип документа</span>
          <select
            value={form.documentType}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, documentType: e.target.value, kindCode: '' }))
            }
          >
            {NUMBERED_TYPES.map((type) => (
              <option key={type} value={type}>
                {TEMPLATE_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
        {fittingKinds.length > 0 ? (
          <label className="ui-field">
            <span className="ui-field-label">Вид документа</span>
            <select
              value={form.kindCode}
              style={{ maxWidth: '100%' }}
              onChange={(e) => set('kindCode', e.target.value)}
            >
              <option value="">Все виды этого типа — общий счётчик</option>
              {fittingKinds.map((kind) => (
                <option key={kind.code} value={kind.code}>
                  {kind.name}
                </option>
              ))}
            </select>
            <span className="ui-hint">
              Свой нумератор у вида — например, у приказа о зачислении отдельно от приказа об
              окончании. Номер повторяться не может только внутри одного вида.
            </span>
          </label>
        ) : null}
        <label className="ui-field">
          <span className="ui-field-label">Как нумеровать</span>
          <select
            value={preset}
            style={{ maxWidth: '100%' }}
            onChange={(e) => {
              const chosen = NUMBERING_PRESETS.find((p) => p.id === e.target.value);
              if (chosen) set('pattern', chosen.pattern);
            }}
          >
            {NUMBERING_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
            {preset === 'custom' ? <option value="custom">Своя маска</option> : null}
          </select>
          <span className="ui-hint">
            {NUMBERING_PRESETS.find((p) => p.id === preset)?.hint ??
              'Маска собрана вручную из частей ниже.'}
          </span>
        </label>
        <label className="ui-field">
          <span className="ui-field-label">Маска номера</span>
          <input
            className="ui-input"
            value={form.pattern}
            onChange={(e) => set('pattern', e.target.value)}
          />
          <span className="ui-hint">
            Части маски: {'{prefix}'} — префикс, {'{counter}'} — счётчик, {'{suffix}'} — суффикс,{' '}
            {'{series}'} — серия, {'{parts}'} — номер из частей, {'{group.code}'} — код группы,{' '}
            {'{protocol.number}'} — номер протокола группы, {'{seq.group}'} — порядок слушателя.
          </span>
        </label>
        {form.pattern.includes('{prefix}') ? (
          <label className="ui-field">
            <span className="ui-field-label">Префикс</span>
            <input
              className="ui-input"
              value={form.prefix}
              onChange={(e) => set('prefix', e.target.value)}
              placeholder="Например, УД-"
            />
          </label>
        ) : null}
        {form.pattern.includes('{suffix}') ? (
          <label className="ui-field">
            <span className="ui-field-label">Суффикс</span>
            <input
              className="ui-input"
              value={form.suffix}
              onChange={(e) => set('suffix', e.target.value)}
              placeholder="Например, -ОТ"
            />
          </label>
        ) : null}
        {form.pattern.includes('{series}') ? (
          <label className="ui-field">
            <span className="ui-field-label">Серия бланка</span>
            <input
              className="ui-input"
              value={form.series}
              onChange={(e) => set('series', e.target.value)}
              placeholder="Например, АБ"
            />
          </label>
        ) : null}
        {form.pattern.includes('{parts}') ? (
          <fieldset className="ui-stack">
            <legend className="ui-field-label">Части номера</legend>
            {form.parts.map((part, index) => (
              <div key={index} className="ui-inline">
                <label className="ui-field">
                  <span className="ui-field-label">Часть {index + 1}: начать с</span>
                  <input
                    className="ui-input"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={part.start}
                    onChange={(e) =>
                      setPart(index, {
                        start: Math.max(0, Number.parseInt(e.target.value, 10) || 0)
                      })
                    }
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={part.auto}
                    onChange={(e) => setPart(index, { auto: e.target.checked })}
                  />{' '}
                  растёт сама
                </label>
              </div>
            ))}
          </fieldset>
        ) : null}
        <label className="ui-field">
          <span className="ui-field-label">Когда начинать заново</span>
          <select
            value={form.resetPeriod}
            onChange={(e) => set('resetPeriod', e.target.value as NumberResetPeriod)}
          >
            {RESET_PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className="ui-field">
          <span className="ui-field-label">Начать с номера</span>
          <input
            className="ui-input"
            type="number"
            inputMode="numeric"
            min={1}
            value={form.startCounter}
            onChange={(e) => set('startCounter', e.target.value)}
          />
          <span className="ui-hint">
            Переносите нумерацию с бумаги или из CDOPROF — укажите следующий свободный номер.
          </span>
        </label>
        <p>
          Первый номер будет: <strong>{preview ?? '—'}</strong>
          {preview && usesGroupFacts(form.pattern)
            ? ' — пример для группы с кодом 264501 и первого слушателя'
            : null}
          {startIsValid ? null : ' — укажите целое число не меньше 1'}
        </p>
        {error !== null ? <SectionError error={error} /> : null}
        <div className="ui-modal-actions">
          <DrawerCancelButton className="ui-button" disabled={saving} onFallbackClose={onClose} />
          <button
            type="submit"
            className={`ui-button ui-button--primary ${saving ? 'ui-button--loading' : ''}`}
            disabled={saving}
            {...blockedProps('numbering-start', startBlockedReason)}
          >
            Сохранить нумератор
          </button>
        </div>
        <BlockedHint hintKey="numbering-start" reason={startBlockedReason} />
      </form>
    </DetailDrawer>
  );
}
