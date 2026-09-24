'use client';

import {
  BlockedHint,
  DetailDrawer,
  DrawerCancelButton,
  OperationOutcome,
  blockedProps
} from '@trudskill/ui';
import { useMemo, useState } from 'react';

import { clientPeopleApi } from './people-api';
import { employeesBulkSummary, parseEmployeesPaste } from './people-format';
import { SectionError } from '../../components/state-wrappers';
import { useAuth } from '../auth/context';

import type { EmployeesBulkOutcome } from './people-types';

const FORM_ID = 'client-employees-paste';
const SUBMIT_KEY = 'client-employees-paste-submit';

/**
 * «Вставить сотрудников списком» (МГ-D2.1, срез 14.2): из письма кадровика или таблицы —
 * одна строка на человека. Частичный успех: заведённые — сразу в списке, пропущенные
 * (уже есть) и не добавленные (нет имени, кривая почта) — поимённо с причиной.
 */
export function EmployeesPasteDrawer({
  counterpartyId,
  onClose,
  onDone
}: {
  counterpartyId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { session } = useAuth();
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [outcome, setOutcome] = useState<EmployeesBulkOutcome | null>(null);
  const rows = useMemo(() => parseEmployeesPaste(text), [text]);

  const blockedReason =
    rows.length === 0
      ? 'Вставьте хотя бы одну строку: ФИО; должность; почта; телефон; табельный номер.'
      : undefined;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!session || blockedReason) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await clientPeopleApi.bulkEmployees(session, counterpartyId, rows);
      setOutcome(result);
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DetailDrawer
      open
      onClose={onClose}
      hasUnsavedChanges={text.trim() !== '' && !outcome}
      title="Вставить сотрудников списком"
      subtitle="Из письма или таблицы — одна строка на человека"
      width="md"
      footer={
        <div className="ui-inline">
          <DrawerCancelButton
            className="ui-button"
            disabled={submitting}
            onFallbackClose={onClose}
          />
          {outcome ? (
            <button type="button" className="ui-button ui-button--primary" onClick={onClose}>
              Готово: к списку сотрудников
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
                Добавить сотрудников
              </button>
              <BlockedHint hintKey={SUBMIT_KEY} reason={blockedReason} />
            </>
          )}
        </div>
      }
    >
      {outcome ? (
        <OperationOutcome
          outcome={employeesBulkSummary(outcome)}
          successVerb="Добавлено"
          failuresTitle="Не добавлены — построчно:"
        />
      ) : (
        <form id={FORM_ID} onSubmit={(e) => void submit(e)} className="ui-stack">
          <label className="ui-field">
            <span className="ui-field-label">Список сотрудников</span>
            <textarea
              className="ui-input"
              rows={10}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                'Иванов Иван Иванович; Электромонтёр; ivanov@romashka.ru; +7 900 000-00-00; 117\nПетрова Анна; Бухгалтер'
              }
            />
            <span className="ui-hint">
              Поля через «;» или табуляцию: ФИО; должность; почта; телефон; табельный номер.
              Обязательны фамилия и имя. Те, кто уже работает в компании, повторно не заводятся.
            </span>
          </label>
          {rows.length > 0 ? (
            <p className="ui-hint" role="status">
              Строк к добавлению: {rows.length}.
            </p>
          ) : null}
          {error !== null ? <SectionError error={error} /> : null}
        </form>
      )}
    </DetailDrawer>
  );
}
