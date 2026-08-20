'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DataTable, LoadingState, StatusChip } from '@trudskill/ui';
import { useState } from 'react';

import { type NumberResetPeriod, type NumberingRuleDto, numberingApi, previewNumber } from './api';
import { SectionCard, SectionEmpty, SectionError } from '../../components/state-wrappers';
import { useAuth } from '../auth/context';

/**
 * Настройка нумераторов (ФТ-A4.1, Фаза 1 Task 6).
 *
 * Маска, стартовое значение и период сброса — per tenant per тип документа.
 * Ключевой сценарий: УЦ переносит журнал с бумаги и продолжает нумерацию
 * с нужного номера, а не с единицы. Предпросмотр считается на клиенте той же
 * формулой, что и на сервере, — админ видит результат до сохранения.
 */

/** Те же типы, что в реестре шаблонов (Pillar A Plan B §5.4). */
const DOCUMENT_TYPES = [
  { value: 'certificate', label: 'Удостоверение' },
  { value: 'protocol', label: 'Протокол' },
  { value: 'order', label: 'Приказ' },
  { value: 'diploma', label: 'Диплом' },
  { value: 'attestation', label: 'Свидетельство об аттестации' },
  { value: 'reference', label: 'Справка' },
  { value: 'report', label: 'Отчёт' }
] as const;

const RESET_PERIODS: { value: NumberResetPeriod; label: string }[] = [
  { value: 'none', label: 'Без сброса (сквозная)' },
  { value: 'year', label: 'Каждый год' },
  { value: 'month', label: 'Каждый месяц' }
];

const typeLabel = (value: string) => DOCUMENT_TYPES.find((t) => t.value === value)?.label ?? value;

export function NumberingRulesSection() {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  const [documentType, setDocumentType] = useState<string>('certificate');
  const [prefix, setPrefix] = useState('');
  const [suffix, setSuffix] = useState('');
  const [pattern, setPattern] = useState('{prefix}{counter}{suffix}');
  const [resetPeriod, setResetPeriod] = useState<NumberResetPeriod>('none');
  const [startCounter, setStartCounter] = useState('1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rulesQuery = useQuery({
    queryKey: ['numbering-rules', session?.user.id],
    enabled: Boolean(session),
    queryFn: () => numberingApi.list(session!)
  });

  const rows = (rulesQuery.data?.items ?? []).map((rule) => ({
    ...rule,
    typeTitle: typeLabel(rule.documentType),
    resetTitle: RESET_PERIODS.find((p) => p.value === rule.resetPeriod)?.label ?? rule.resetPeriod,
    // Счётчик хранит последний выданный, поэтому следующий — +1.
    nextNumber: previewNumber(rule, rule.currentCounter + 1)
  }));

  const parsedStart = Number.parseInt(startCounter, 10);
  const startIsValid = Number.isFinite(parsedStart) && parsedStart >= 1;
  const preview = startIsValid
    ? previewNumber({ prefix, suffix, pattern, resetPeriod }, parsedStart)
    : '—';

  const run = async (action: () => Promise<unknown>, failure: string) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: ['numbering-rules'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : failure);
    } finally {
      setBusy(false);
    }
  };

  const createRule = () =>
    run(
      () =>
        numberingApi.create(session!, {
          documentType,
          prefix,
          suffix,
          pattern,
          resetPeriod,
          startCounter: parsedStart
        }),
      'Не удалось сохранить нумератор'
    );

  const toggleRule = (rule: NumberingRuleDto) =>
    run(
      () =>
        rule.isActive
          ? numberingApi.deactivate(session!, rule.id)
          : numberingApi.activate(session!, rule.id),
      'Не удалось переключить нумератор'
    );

  return (
    <SectionCard title="Нумераторы документов">
      <p className="ui-text-muted">
        Маска, стартовое значение и период сброса — отдельно для каждого типа документа. Активным
        может быть один нумератор на тип; новый заменяет прежний.
      </p>

      {rulesQuery.error ? <SectionError error={rulesQuery.error} /> : null}
      {error ? <SectionError message={error} /> : null}
      {rulesQuery.isLoading ? <LoadingState message="Загрузка нумераторов…" /> : null}

      {!rulesQuery.isLoading && rows.length ? (
        <>
          <DataTable
            columns={[
              { key: 'typeTitle', title: 'Тип документа' },
              { key: 'pattern', title: 'Маска' },
              { key: 'resetTitle', title: 'Сброс' },
              { key: 'currentCounter', title: 'Выдано' },
              { key: 'nextNumber', title: 'Следующий номер' }
            ]}
            rows={rows}
          />
          <div className="ui-inline">
            {rows.map((rule) => (
              <button
                key={rule.id}
                type="button"
                onClick={() => void toggleRule(rule)}
                disabled={busy}
              >
                <StatusChip status={rule.isActive ? 'active' : 'inactive'} />
                {rule.typeTitle}: {rule.isActive ? 'выключить' : 'включить'}
              </button>
            ))}
          </div>
        </>
      ) : null}
      {!rulesQuery.isLoading && !rows.length && !rulesQuery.error ? (
        <SectionEmpty
          message="Нумераторы не настроены"
          hint="Пока правила нет, номера выдаются по умолчанию: ТИП-000001"
        />
      ) : null}

      <div className="ui-stack" style={{ marginTop: 12 }}>
        <strong>Новый нумератор</strong>
        <div className="ui-inline">
          <select value={documentType} onChange={(e) => setDocumentType(e.target.value)}>
            {DOCUMENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <input
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
            placeholder="Префикс, напр. УД-"
          />
          <input
            value={suffix}
            onChange={(e) => setSuffix(e.target.value)}
            placeholder="Суффикс, напр. -ОТ"
          />
          <input
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            placeholder="Маска"
            size={32}
          />
          <select
            value={resetPeriod}
            onChange={(e) => setResetPeriod(e.target.value as NumberResetPeriod)}
          >
            {RESET_PERIODS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <input
            value={startCounter}
            onChange={(e) => setStartCounter(e.target.value)}
            placeholder="Начать с"
            inputMode="numeric"
            size={8}
          />
          <button type="button" onClick={() => void createRule()} disabled={busy || !startIsValid}>
            Сохранить нумератор
          </button>
        </div>
        <p className="ui-text-muted">
          Токены маски: <code>{'{prefix}'}</code>, <code>{'{counter}'}</code>,{' '}
          <code>{'{suffix}'}</code>, <code>{'{period}'}</code>. При сбросе по периоду он
          подставляется автоматически, даже если в маске не указан.
        </p>
        <p>
          Первый номер: <strong>{preview}</strong>
          {startIsValid ? null : ' — укажите целое число не меньше 1'}
        </p>
      </div>
    </SectionCard>
  );
}
