'use client';

import { FilePicker, LoadingState, OperationOutcome, WizardSteps } from '@trudskill/ui';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { parseExcelBuffer } from './excel-parser';
import { useBulkImportMutation } from './hooks';
import { buildImportOutcome, successfulRows } from './outcome';
import { PreviewTable } from './preview-table';
import { classifyParsedRows } from './validators';
import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../components/state-wrappers';
import { useGroupsList } from '../mvp/hooks';

import type { ClassifiedParsedRow, ParseError, ParsedRow } from './types';

const STEPS = [
  { id: 'file', title: 'Файл' },
  { id: 'check', title: 'Проверка' },
  { id: 'result', title: 'Результат' }
];

type StepId = 'file' | 'check' | 'result';

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `idem_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Мастер массового зачисления (TPL-004, волна 1 §8.2).
 *
 * Было: четыре пронумерованных блока, открытых одновременно, и кнопка загрузки внизу —
 * человек мог нажать её, не выбрав группу, и не понимал, чего не хватает. Стало: три шага,
 * на каждом одно первичное действие, которое называет результат.
 */
export const BulkImportScreen = () => {
  const [step, setStep] = useState<StepId>('file');
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [parseErrors, setParseErrors] = useState<ParseError[]>([]);
  const [classified, setClassified] = useState<ClassifiedParsedRow[]>([]);
  const [groupId, setGroupId] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(() => newIdempotencyKey());

  const groups = useGroupsList({ page: 1, page_size: 100 });
  const mutation = useBulkImportMutation();

  const onFileChange = async (file: File | null) => {
    if (!file) return;
    setFileName(file.name);
    mutation.reset();
    const buffer = await file.arrayBuffer();
    const result = parseExcelBuffer(buffer);
    setParsed(result.rows);
    setParseErrors(result.errors);
    setClassified(result.errors.length === 0 ? classifyParsedRows(result.rows) : []);
    setIdempotencyKey(newIdempotencyKey());
    if (result.errors.length === 0 && result.rows.length > 0) setStep('check');
  };

  const validRows = useMemo(
    () => classified.filter((r) => r.classification === 'valid').map((r) => r.row),
    [classified]
  );
  const invalidCount = classified.length - validRows.length;
  const selectedGroup = groups.data?.items.find((g) => g.id === groupId);

  const canSubmit =
    Boolean(groupId) && validRows.length > 0 && !mutation.isSubmitting && !mutation.outcome;

  const onSubmit = async () => {
    const result = await mutation.submit({ idempotencyKey, groupId, rows: validRows });
    if (result) setStep('result');
  };

  const onReset = () => {
    setFileName(null);
    setParsed([]);
    setParseErrors([]);
    setClassified([]);
    setGroupId('');
    setIdempotencyKey(newIdempotencyKey());
    mutation.reset();
    setStep('file');
  };

  const outcome = buildImportOutcome(classified, mutation.outcome);
  const enrolled = successfulRows(classified, mutation.outcome);

  return (
    <PageContainer>
      <PageHeader
        title="Зачисление списком"
        subtitle="Файл из Excel: система заведёт недостающих слушателей и зачислит их в выбранную группу"
      />

      <WizardSteps
        steps={STEPS}
        currentId={step}
        label="Шаги зачисления списком"
        /*
         * Назад вернуться можно, вперёд — нет: шаг без файла нечего проверять.
         * После зачисления назад тоже нельзя: там осталась бы кнопка, которая уже
         * ничего не сделает. Путь назад один и понятный — «Загрузить ещё файл».
         */
        {...(mutation.outcome ? {} : { onSelect: (id: string) => setStep(id as StepId) })}
      />

      {step === 'file' ? (
        <SectionCard title="Файл со слушателями">
          <div className="ui-stack">
            <p className="ui-hint">
              Нужны две колонки: <strong>ФИО</strong> и <strong>Email</strong>. По желанию —{' '}
              <strong>СНИЛС</strong> и <strong>Должность</strong>. Заголовки можно писать привычными
              словами: «Имя» вместо «ФИО» система поймёт.
            </p>
            <div className="ui-field">
              <span className="ui-field-label">Файл Excel или CSV</span>
              <FilePicker
                ariaLabel="Файл со списком слушателей"
                accept=".xlsx,.xls,.csv"
                fileName={fileName}
                onSelect={(file) => void onFileChange(file)}
              />
            </div>
            {parseErrors.length > 0 ? (
              <SectionError message={parseErrors.map((e) => e.message).join('; ')} />
            ) : null}
            {parsed.length === 0 && fileName && parseErrors.length === 0 ? (
              <SectionEmpty
                message="В файле нет ни одной строки со слушателем"
                hint="Первая строка файла считается заголовком колонок, поэтому данные должны начинаться со второй строки."
              />
            ) : null}
            {classified.length > 0 ? (
              <div className="ui-form-actions">
                <button
                  type="button"
                  className="ui-button--primary"
                  onClick={() => setStep('check')}
                >
                  Далее: проверка
                </button>
              </div>
            ) : null}
          </div>
        </SectionCard>
      ) : null}

      {step === 'check' ? (
        <>
          <SectionCard title="Куда зачисляем">
            {groups.loading ? (
              <LoadingState message="Загружаем список групп…" />
            ) : groups.data ? (
              <label className="ui-field">
                <span className="ui-field-label">Учебная группа</span>
                <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                  <option value="">— выберите группу —</option>
                  {groups.data.items.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.code})
                    </option>
                  ))}
                </select>
                <p className="ui-field-hint">
                  Все подходящие строки файла попадут в эту группу одним действием.
                </p>
              </label>
            ) : (
              <SectionError message="Не удалось загрузить список групп. Обновите страницу или попробуйте позже." />
            )}
          </SectionCard>

          <SectionCard title={`Что в файле: ${classified.length} строк`}>
            <p className="ui-hint">
              Зачислим: <strong>{validRows.length}</strong>.{' '}
              {invalidCount > 0
                ? `Не пройдут проверку: ${invalidCount} — они останутся в файле, их можно исправить и загрузить снова.`
                : 'Все строки прошли проверку.'}
            </p>
            <PreviewTable rows={classified} />
            {mutation.error ? <SectionError message={mutation.error} /> : null}
            {validRows.length === 0 ? (
              <SectionError message="Ни одна строка файла не прошла проверку — зачислять нечего. Исправьте замечания в таблице выше и загрузите файл заново." />
            ) : null}
            <div className="ui-form-actions">
              <button type="button" className="ui-button-link" onClick={() => setStep('file')}>
                Выбрать другой файл
              </button>
              <button
                type="button"
                className="ui-button--primary"
                onClick={() => void onSubmit()}
                disabled={!canSubmit}
              >
                {mutation.isSubmitting
                  ? 'Зачисляем…'
                  : `Зачислить ${validRows.length} в группу${selectedGroup ? ` «${selectedGroup.name}»` : ''}`}
              </button>
            </div>
          </SectionCard>
        </>
      ) : null}

      {step === 'result' ? (
        <SectionCard title="Что получилось">
          <OperationOutcome
            outcome={outcome}
            successVerb="Зачислено"
            failuresTitle="Не зачислены — построчно:"
          >
            {outcome.failures.length > 0 ? (
              <p className="ui-hint">
                Исправьте эти строки в файле и загрузите его снова — уже зачисленных повторная
                загрузка не тронет.
              </p>
            ) : null}
          </OperationOutcome>

          {enrolled.length > 0 ? (
            <ul className="ui-bare-list">
              {enrolled.map((row) => (
                <li key={row.label}>
                  {row.learnerId ? (
                    <Link className="ui-link" href={`/learners/${row.learnerId}`}>
                      {row.label}
                    </Link>
                  ) : (
                    row.label
                  )}{' '}
                  — {row.status}
                </li>
              ))}
            </ul>
          ) : null}

          <div className="ui-form-actions">
            <button type="button" className="ui-button-link" onClick={onReset}>
              Загрузить ещё файл
            </button>
            {groupId ? (
              <Link className="ui-button--primary" href={`/groups/${groupId}`}>
                Открыть группу
              </Link>
            ) : null}
          </div>
        </SectionCard>
      ) : null}
    </PageContainer>
  );
};
