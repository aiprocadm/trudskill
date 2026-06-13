import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import { ReportXlsxWriter } from './report-xlsx.writer.js';

import type { ReportColumn } from './report-types.js';

const columns: ReportColumn[] = [
  { key: 'fullName', header: 'ФИО', type: 'string' },
  { key: 'progressPercent', header: 'Прогресс, %', type: 'number' },
  { key: 'enrolledAt', header: 'Дата назначения', type: 'date' }
];

describe('ReportXlsxWriter', () => {
  it('writes dynamic columns with a bold header row, readable back', async () => {
    const writer = new ReportXlsxWriter();
    const buffer = await writer.build(columns, [
      { fullName: 'Иванов Иван', progressPercent: 75, enrolledAt: '2026-01-02T00:00:00.000Z' },
      { fullName: 'Петров Пётр', progressPercent: null, enrolledAt: null }
    ]);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.worksheets[0]!;

    expect(ws.getRow(1).getCell(1).value).toBe('ФИО');
    expect(ws.getRow(1).getCell(2).value).toBe('Прогресс, %');
    expect(ws.getRow(1).getCell(3).value).toBe('Дата назначения');
    expect(ws.getRow(1).getCell(1).font?.bold).toBe(true);

    expect(ws.getRow(2).getCell(1).value).toBe('Иванов Иван');
    expect(ws.getRow(2).getCell(2).value).toBe(75);
    expect(ws.getRow(2).getCell(3).value).toBe('2026-01-02T00:00:00.000Z');

    // null cells must not crash and render empty
    expect(ws.getRow(3).getCell(2).value ?? null).toBeNull();
  });

  it('exposes the xlsx mime type', () => {
    expect(new ReportXlsxWriter().contentType).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
  });
});
