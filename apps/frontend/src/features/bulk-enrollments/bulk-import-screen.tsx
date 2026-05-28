'use client';

import { type ChangeEvent, useMemo, useState } from 'react';

import { parseExcelBuffer } from './excel-parser';
import { useBulkImportMutation } from './hooks';
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

import type { BulkImportOutcomeRow, ClassifiedParsedRow, ParseError, ParsedRow } from './types';

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `idem_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function statusLabel(status: BulkImportOutcomeRow['status']): string {
  switch (status) {
    case 'created':
      return 'Создан + зачислен';
    case 'reused':
      return 'Переиспользован + зачислен';
    case 'enrolled_only':
      return 'Уже был зачислен';
    case 'failed':
      return 'Ошибка';
  }
}

export const BulkImportScreen = () => {
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [parseErrors, setParseErrors] = useState<ParseError[]>([]);
  const [classified, setClassified] = useState<ClassifiedParsedRow[]>([]);
  const [groupId, setGroupId] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(() => newIdempotencyKey());

  const groups = useGroupsList({ page: 1, page_size: 100 });
  const mutation = useBulkImportMutation();

  const onFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    mutation.reset();
    const buffer = await file.arrayBuffer();
    const result = parseExcelBuffer(buffer);
    setParsed(result.rows);
    setParseErrors(result.errors);
    setClassified(result.errors.length === 0 ? classifyParsedRows(result.rows) : []);
    setIdempotencyKey(newIdempotencyKey());
  };

  const validCount = useMemo(
    () => classified.filter((r) => r.classification === 'valid').length,
    [classified]
  );
  const invalidCount = classified.length - validCount;
  const canSubmit =
    parsed.length > 0 &&
    parseErrors.length === 0 &&
    Boolean(groupId) &&
    validCount > 0 &&
    !mutation.isSubmitting &&
    !mutation.outcome;

  const onSubmit = async () => {
    const validRows = classified.filter((cr) => cr.classification === 'valid').map((cr) => cr.row);
    await mutation.submit({
      idempotencyKey,
      groupId,
      rows: validRows
    });
  };

  const onReset = () => {
    setFileName(null);
    setParsed([]);
    setParseErrors([]);
    setClassified([]);
    setGroupId('');
    setIdempotencyKey(newIdempotencyKey());
    mutation.reset();
  };

  return (
    <PageContainer>
      <PageHeader
        title="Массовая загрузка слушателей"
        subtitle="Excel/CSV — система создаст недостающих учётков и зачислит всех валидных в выбранную группу"
      />

      <SectionCard title="1. Загрузить файл">
        <div className="ui-stack">
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => void onFileChange(e)}
            aria-label="Файл с учениками"
          />
          {fileName ? (
            <div>
              <strong>Файл:</strong> {fileName}
            </div>
          ) : null}
          {parseErrors.length > 0 ? (
            <SectionError message={parseErrors.map((e) => e.message).join('; ')} />
          ) : null}
          <p style={{ fontSize: 13, color: 'var(--ui-text-muted)' }}>
            Обязательные колонки: <strong>ФИО</strong>, <strong>Email</strong>. Опциональные:{' '}
            <strong>СНИЛС</strong>, <strong>Должность</strong>. Принимаются синонимы заголовков
            (например, «Имя» вместо «ФИО»).
          </p>
        </div>
      </SectionCard>

      <SectionCard title="2. Выбрать учебную группу">
        {groups.loading ? (
          <SectionEmpty message="Загрузка списка групп…" />
        ) : groups.data ? (
          <label className="ui-stack">
            Группа
            <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              <option value="">— выбрать —</option>
              {groups.data.items.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.code})
                </option>
              ))}
            </select>
          </label>
        ) : (
          <SectionError message="Не удалось загрузить группы" />
        )}
      </SectionCard>

      {classified.length > 0 ? (
        <SectionCard title="3. Предпросмотр">
          <p>
            Валидно: <strong style={{ color: 'var(--ui-success-700, green)' }}>{validCount}</strong>
            {' · '}Ошибок:{' '}
            <strong style={{ color: invalidCount > 0 ? 'var(--ui-error-700, red)' : undefined }}>
              {invalidCount}
            </strong>
            {' · '}Всего: {classified.length}
          </p>
          <PreviewTable rows={classified} />
        </SectionCard>
      ) : null}

      <SectionCard title="4. Отправить">
        {mutation.error ? <SectionError message={mutation.error} /> : null}
        <div className="ui-stack" style={{ flexDirection: 'row', gap: '0.5rem' }}>
          <button
            type="button"
            className="ui-button"
            onClick={() => void onSubmit()}
            disabled={!canSubmit}
          >
            {mutation.isSubmitting ? 'Загружаем…' : `Загрузить ${validCount} валидных строк`}
          </button>
          <button
            type="button"
            className="ui-button-link"
            onClick={onReset}
            disabled={mutation.isSubmitting}
          >
            Сбросить
          </button>
        </div>
      </SectionCard>

      {mutation.outcome ? (
        <SectionCard title="Результат">
          <p>
            Создано: <strong>{mutation.outcome.created}</strong>
            {' · '}Переиспользовано: <strong>{mutation.outcome.reused}</strong>
            {' · '}Новых зачислений: <strong>{mutation.outcome.enrolled}</strong>
            {' · '}Ошибок: <strong>{mutation.outcome.failed}</strong>
            {' · '}Всего: {mutation.outcome.total}
          </p>
          <ul className="ui-stack" style={{ gap: '0.25rem' }}>
            {mutation.outcome.rows.map((r) => (
              <li key={r.rowNumber}>
                Строка {r.rowNumber}: <strong>{statusLabel(r.status)}</strong>
                {r.errorMessage ? ` — ${r.errorMessage}` : null}
                {r.learnerId ? ` (учётка ${r.learnerId})` : null}
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}
    </PageContainer>
  );
};
