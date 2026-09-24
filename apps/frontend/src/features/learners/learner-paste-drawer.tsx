'use client';

import {
  BlockedHint,
  DetailDrawer,
  DrawerCancelButton,
  OperationOutcome,
  blockedProps
} from '@trudskill/ui';
import { useMemo, useState } from 'react';

import { SectionError } from '../../components/state-wrappers';
import { useBulkImportMutation } from '../bulk-enrollments/hooks';
import { buildImportOutcome, successfulRows } from '../bulk-enrollments/outcome';
import { classifyParsedRows } from '../bulk-enrollments/validators';

import type { ParsedRow } from '../bulk-enrollments/types';

const FORM_ID = 'learner-paste-form';
const SUBMIT_KEY = 'learner-paste-submit';

/**
 * Вставка списком: одна строка — один человек, поля через «;» или табуляцию, порядок как в
 * мастере группы (TXT-002 — один формат на оба входа): ФИО; должность; СНИЛС; почта; телефон.
 */
export const parsePastedLearners = (text: string): ParsedRow[] => {
  const rows: ParsedRow[] = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line) return;
    const [fullName = '', position, snils, email = '', phone] = line
      .split(/;|\t/)
      .map((cell) => cell.trim());
    rows.push({
      rowNumber: index + 1,
      fullName,
      email,
      ...(position ? { position } : {}),
      ...(snils ? { snils } : {}),
      ...(phone ? { phone } : {})
    });
  });
  return rows;
};

const newIdempotencyKey = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `paste_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

/**
 * «Добавить слушателей списком» в реестре (ТЗ перехода §6.4 МГ-C3.1; срез 10.2, РМ102): тот же
 * импорт, что из файла, но без группы — люди только заводятся. Отказы — поимённо, как в файле.
 */
export function LearnerPasteDrawer({
  onClose,
  onDone
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const [text, setText] = useState('');
  const [idempotencyKey] = useState(() => newIdempotencyKey());
  const mutation = useBulkImportMutation();
  /* Сторож Э8 различает «занято» по имени: занятость — отдельной переменной, а не полем объекта. */
  const submitting = mutation.isSubmitting;

  const classified = useMemo(() => classifyParsedRows(parsePastedLearners(text)), [text]);
  const validRows = classified
    .filter((row) => row.classification === 'valid')
    .map((row) => row.row);
  const invalid = classified.filter((row) => row.classification === 'invalid');
  const blockedReason =
    classified.length === 0
      ? 'Вставьте хотя бы одну строку: ФИО; должность; СНИЛС; почта; телефон.'
      : validRows.length === 0
        ? 'Ни одна строка не прошла проверку — поправьте замечания ниже.'
        : undefined;

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (blockedReason) return;
    const result = await mutation.submit({ idempotencyKey, rows: validRows });
    if (result) onDone();
  };

  const outcome = mutation.outcome ? buildImportOutcome(classified, mutation.outcome) : null;
  const created = successfulRows(classified, mutation.outcome);

  return (
    <DetailDrawer
      open
      onClose={onClose}
      hasUnsavedChanges={text.trim() !== '' && !mutation.outcome}
      title="Добавить слушателей списком"
      subtitle="Из письма, таблицы или блокнота — одна строка на человека"
      width="md"
      footer={
        <div className="ui-inline">
          <DrawerCancelButton
            className="ui-button"
            disabled={submitting}
            onFallbackClose={onClose}
          />
          {mutation.outcome ? (
            <button type="button" className="ui-button ui-button--primary" onClick={onClose}>
              Готово: к списку слушателей
            </button>
          ) : (
            <>
              <button
                type="submit"
                form={FORM_ID}
                className={`ui-button ui-button--primary ${submitting ? 'ui-button--loading' : ''}`}
                disabled={submitting}
                {...blockedProps(SUBMIT_KEY, blockedReason)}
              >
                Завести слушателей
              </button>
              <BlockedHint hintKey={SUBMIT_KEY} reason={blockedReason} />
            </>
          )}
        </div>
      }
    >
      {outcome ? (
        <OperationOutcome
          outcome={outcome}
          successVerb="Заведено"
          failuresTitle="Не заведены — построчно:"
        >
          {created.length > 0 ? (
            <ul className="ui-stack">
              {created.map((row) => (
                <li key={row.label}>
                  {row.label} — {row.status}
                </li>
              ))}
            </ul>
          ) : null}
        </OperationOutcome>
      ) : (
        <form id={FORM_ID} onSubmit={(e) => void onSubmit(e)} className="ui-stack">
          <label className="ui-field">
            <span className="ui-field-label">Список слушателей</span>
            <textarea
              className="ui-input"
              rows={10}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                'Иванов Иван Иванович; Электромонтёр; 112-233-445 95; почта; телефон\nПетрова Анна Сергеевна; Бухгалтер; ; почта'
              }
            />
            <span className="ui-hint">
              Поля через «;» или табуляцию: ФИО; должность; СНИЛС; почта; телефон. Обязательны ФИО и
              почта — на неё придёт ссылка для входа. Те, кто уже есть в базе, повторно не
              заводятся.
            </span>
          </label>
          {classified.length > 0 ? (
            <p className="ui-hint" role="status">
              Строк: {classified.length}, заведём: {validRows.length}
              {invalid.length > 0 ? `, не пройдут проверку: ${invalid.length}` : ''}.
            </p>
          ) : null}
          {invalid.length > 0 ? (
            <ul className="ui-callout ui-callout--danger">
              {invalid.slice(0, 10).map((row) => (
                <li key={row.row.rowNumber}>
                  Строка {row.row.rowNumber}: {row.errors.map((error) => error.message).join('; ')}
                </li>
              ))}
              {invalid.length > 10 ? <li>…и ещё {invalid.length - 10}</li> : null}
            </ul>
          ) : null}
          {mutation.error ? <SectionError message={mutation.error} /> : null}
        </form>
      )}
    </DetailDrawer>
  );
}
