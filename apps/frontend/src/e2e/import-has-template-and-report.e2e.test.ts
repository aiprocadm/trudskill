import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';

import { fromApp } from './app-root';
import { stripComments } from './backend-source';
import {
  ERROR_REPORT_HEADERS,
  TEMPLATE_COLUMNS,
  TEMPLATE_EXAMPLE,
  buildErrorReport,
  buildTemplateWorkbook,
  errorReportFileName
} from '../features/bulk-enrollments/import-template';
import { buildCsv } from '../lib/export/csv';

/**
 * Импорт списка слушателей: шаблон на входе, отчёт на выходе (ТЗ 12.1).
 *
 * **Как было.** Предпросмотр, построчная проверка с человеческим текстом и подтверждение перед
 * загрузкой уже работали. Не было двух вещей из пяти пунктов ТЗ: **скачиваемого шаблона**
 * (журнал 516) и **отчёта об ошибках файлом** (517). Администратору присылают список из
 * шестидесяти человек в произвольном виде: без шаблона он гадает, какие колонки нужны, а после
 * загрузки ищет две плохие строки среди шестидесяти глазами.
 *
 * **Что закреплено.**
 *
 * 1. Шаблон — настоящая книга Excel: лист с заголовками и строкой-примером плюс лист пояснений.
 * 2. Заголовки шаблона понимает разбор файла — иначе шаблон вёл бы в ошибку.
 * 3. Пояснения лежат ОТДЕЛЬНЫМ листом: строкой под заголовками они попали бы в разбор данными.
 * 4. Отчёт об ошибках берётся из того же итога, что показан на экране.
 */

const SCREEN = fromApp('src', 'features', 'bulk-enrollments', 'bulk-import-screen.tsx');
const PARSER = fromApp('src', 'features', 'bulk-enrollments', 'excel-parser.ts');
const read = (file: string): string => stripComments(readFileSync(file, 'utf8'));

/** Лист книги как таблица строк. */
const rows = (book: XLSX.WorkBook, sheet: string): unknown[][] =>
  XLSX.utils.sheet_to_json(book.Sheets[sheet]!, { header: 1 }) as unknown[][];

describe('импорт: шаблон на входе, отчёт на выходе (ТЗ 12.1)', () => {
  it('шаблон — книга с листом слушателей и листом пояснений', () => {
    const book = buildTemplateWorkbook();
    expect(book.SheetNames).toEqual(['Слушатели', 'Как заполнять']);

    const sheet = rows(book, 'Слушатели');
    expect(sheet[0], 'первая строка — заголовки колонок').toEqual(
      TEMPLATE_COLUMNS.map((column) => column.header)
    );
    expect(sheet[1], 'вторая — пример заполнения').toEqual([...TEMPLATE_EXAMPLE]);
    expect(sheet, 'ничего лишнего: разбор считает данными всё после заголовка').toHaveLength(2);
  });

  it('заголовки шаблона понимает разбор файла', () => {
    /*
     * Главная проверка: шаблон, заголовки которого разбор не узнаёт, ведёт человека прямо в
     * ошибку — он заполнит выданный ему бланк и получит «в файле нет ни одной строки».
     */
    const parser = read(PARSER).toLowerCase();
    for (const column of TEMPLATE_COLUMNS) {
      expect(
        parser.includes(`'${column.header.toLowerCase()}'`),
        `заголовок «${column.header}» обязан быть среди синонимов разбора`
      ).toBe(true);
    }
  });

  it('пояснения лежат отдельным листом, а не строкой под заголовками', () => {
    const help = rows(buildTemplateWorkbook(), 'Как заполнять');
    expect(help[0]).toEqual(['Колонка', 'Что писать']);
    for (const column of TEMPLATE_COLUMNS) {
      expect(
        help.some((row) => row[0] === column.header && String(row[1] ?? '').length > 10),
        `у колонки «${column.header}» обязано быть пояснение`
      ).toBe(true);
    }
    // Про строку-пример сказано прямо: иначе Иванов уедет в группу вместе со всеми.
    expect(JSON.stringify(help)).toContain('удалите');
  });

  it('пояснение СНИЛС называет формат, а не просто «укажите СНИЛС»', () => {
    const snils = TEMPLATE_COLUMNS.find((column) => column.header === 'СНИЛС');
    expect(snils?.hint).toContain('11');
  });

  it('отчёт об ошибках берётся из итога экрана', () => {
    const outcome = {
      total: 3,
      succeeded: 1,
      failures: [
        { label: 'Иванов Иван (строка 14)', reason: 'СНИЛС указан неверно (нужно 11 цифр)' },
        { label: 'Строка 22', reason: 'Такой слушатель уже есть' }
      ]
    };
    expect(buildErrorReport(outcome)).toEqual([
      ['Иванов Иван (строка 14)', 'СНИЛС указан неверно (нужно 11 цифр)'],
      ['Строка 22', 'Такой слушатель уже есть']
    ]);
    expect(buildErrorReport({ total: 1, succeeded: 1, failures: [] })).toEqual([]);

    const csv = buildCsv([...ERROR_REPORT_HEADERS], buildErrorReport(outcome));
    expect(csv, 'в отчёте есть и кто, и почему').toContain('строка 14');
    expect(csv).toContain('11 цифр');
  });

  it('имя файла отчёта человеческое и с датой', () => {
    expect(errorReportFileName('2026-09-19T10:00:00.000Z')).toBe('Ошибки импорта 2026-09-19.csv');
  });

  it('экран даёт скачать и шаблон, и отчёт', () => {
    const screen = read(SCREEN);
    expect(
      /onClick=\{downloadTemplate\}/.test(screen),
      'шаблон скачивается с шага выбора файла'
    ).toBe(true);
    expect(screen, 'кнопка названа результатом, а не «скачать файл»').toContain(
      'Скачать шаблон для заполнения'
    );
    expect(/buildErrorReport\(outcome\)/.test(screen), 'отчёт строится из итога экрана').toBe(true);
    expect(screen).toContain('Скачать отчёт об ошибках');
  });
});
