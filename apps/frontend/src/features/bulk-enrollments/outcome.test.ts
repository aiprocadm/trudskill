import { describe, expect, it } from 'vitest';

import { buildImportOutcome, rowLabel, successfulRows } from './outcome';

import type { BulkImportOutcome, ClassifiedParsedRow } from './types';

const valid = (rowNumber: number, fullName: string): ClassifiedParsedRow => ({
  row: { rowNumber, fullName, email: `u${rowNumber}@example.com` },
  classification: 'valid',
  errors: []
});

const invalid = (rowNumber: number, fullName: string, message: string): ClassifiedParsedRow => ({
  row: { rowNumber, fullName, email: `u${rowNumber}@example.com` },
  classification: 'invalid',
  errors: [{ field: 'snils', code: 'snils_invalid', message }]
});

const serverOutcome = (rows: BulkImportOutcome['rows']): BulkImportOutcome => ({
  idempotencyKey: 'k',
  groupId: 'g',
  total: rows.length,
  created: 0,
  reused: 0,
  enrolled: 0,
  failed: 0,
  rows
});

describe('итог массовой загрузки', () => {
  it('считает от файла, а не от отправленных строк', () => {
    // Раньше две отсеянные строки исчезали из отчёта: в предпросмотре «ошибок 2»,
    // а после загрузки — восемь успешных и ни слова про остальных.
    const classified = [
      valid(2, 'Иванов Иван'),
      invalid(3, 'Петров Пётр', 'СНИЛС не проходит проверку')
    ];
    const outcome = buildImportOutcome(
      classified,
      serverOutcome([{ rowNumber: 2, status: 'created', learnerId: 'l1' }])
    );

    expect(outcome.total).toBe(2);
    expect(outcome.succeeded).toBe(1);
    expect(outcome.failures).toEqual([
      { label: 'Петров Пётр (строка 3)', reason: 'СНИЛС не проходит проверку' }
    ]);
  });

  it('отказы сервера показаны поимённо, а не номером строки', () => {
    const classified = [valid(2, 'Иванов Иван')];
    const outcome = buildImportOutcome(
      classified,
      serverOutcome([
        { rowNumber: 2, status: 'failed', errorCode: 'email_taken', errorMessage: 'Почта занята' }
      ])
    );
    expect(outcome.failures).toEqual([{ label: 'Иванов Иван (строка 2)', reason: 'Почта занята' }]);
  });

  it('отказ без текста причины не показывает человеку код ошибки', () => {
    const outcome = buildImportOutcome(
      [valid(2, 'Иванов Иван')],
      serverOutcome([{ rowNumber: 2, status: 'failed', errorCode: 'internal' }])
    );
    expect(outcome.failures[0]?.reason).toBe('Сервер отклонил строку, причина не указана');
    expect(JSON.stringify(outcome)).not.toContain('internal');
  });

  it('«уже был зачислен» — это успех: повторная загрузка файла не поломка', () => {
    const outcome = buildImportOutcome(
      [valid(2, 'Иванов Иван'), valid(3, 'Сидоров Сидор')],
      serverOutcome([
        { rowNumber: 2, status: 'enrolled_only' },
        { rowNumber: 3, status: 'reused' }
      ])
    );
    expect(outcome.succeeded).toBe(2);
    expect(outcome.failures).toEqual([]);
  });

  it('до отправки итог состоит из одних локальных отказов', () => {
    const outcome = buildImportOutcome([invalid(2, 'Петров Пётр', 'Нет почты')], null);
    expect(outcome).toEqual({
      total: 1,
      succeeded: 0,
      failures: [{ label: 'Петров Пётр (строка 2)', reason: 'Нет почты' }]
    });
  });

  it('строка без ФИО подписывается почтой, а совсем пустая — номером', () => {
    expect(rowLabel({ rowNumber: 5, fullName: '  ', email: 'a@b.ru' })).toBe('a@b.ru (строка 5)');
    expect(rowLabel({ rowNumber: 7 })).toBe('Строка 7');
  });

  it('успешные строки подписаны словами, а не кодом статуса', () => {
    const rows = successfulRows(
      [valid(2, 'Иванов Иван')],
      serverOutcome([{ rowNumber: 2, status: 'created', learnerId: 'l1' }])
    );
    expect(rows).toEqual([
      { label: 'Иванов Иван (строка 2)', status: 'заведён и зачислен', learnerId: 'l1' }
    ]);
  });

  it('ответ по строке, которой нет в файле, не роняет отчёт', () => {
    const outcome = buildImportOutcome(
      [valid(2, 'Иванов Иван')],
      serverOutcome([{ rowNumber: 99, status: 'failed', errorMessage: 'Что-то не так' }])
    );
    expect(outcome.failures).toEqual([{ label: 'Строка 99', reason: 'Что-то не так' }]);
  });
});

// МГ-C3.1 (срез 10.2): без группы «заведён», предупреждение сервера — рядом со статусом.
describe('итог без группы и предупреждения', () => {
  it('созданный без зачисления — «заведён», предупреждение про ИНН видно', () => {
    const rows = successfulRows(
      [
        {
          row: { rowNumber: 2, fullName: 'Иванов Иван', email: 'a@x.ru' },
          classification: 'valid',
          errors: []
        }
      ],
      {
        idempotencyKey: 'k',
        total: 1,
        created: 1,
        reused: 0,
        enrolled: 0,
        failed: 0,
        rows: [
          {
            rowNumber: 2,
            status: 'created',
            learnerId: 'l1',
            warnings: ['Компания с ИНН 9999999999 не найдена — слушатель заведён без компании']
          }
        ]
      }
    );
    expect(rows[0]?.status).toBe(
      'заведён — Компания с ИНН 9999999999 не найдена — слушатель заведён без компании'
    );
  });
});
