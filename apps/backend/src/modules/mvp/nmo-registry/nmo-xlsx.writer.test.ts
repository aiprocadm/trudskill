import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import { NmoXlsxWriter } from './nmo-xlsx.writer.js';

import type { NmoRow } from '../mvp.types.js';

const row: NmoRow = {
  documentId: 'd1',
  enrollmentId: 'e1',
  learnerId: 'l1',
  lastName: 'Петрова',
  firstName: 'Анна',
  middleName: 'Сергеевна',
  fullName: 'Петрова Анна Сергеевна',
  snils: '112-233-445 95',
  specialty: 'Кардиология',
  programName: 'Кардиология (36 ч)',
  creditUnits: '36',
  completionDate: '20.04.2026',
  documentNumber: 'НМО-7'
};

describe('NmoXlsxWriter', () => {
  it('writes header + data row in column order', async () => {
    const buffer = await new NmoXlsxWriter().build([row]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.worksheets[0]!;
    expect(ws.getRow(1).getCell(1).value).toBe('Фамилия');
    expect(ws.getRow(1).getCell(7).value).toBe('ЗЕТ');
    expect(ws.getRow(2).getCell(7).value).toBe('36');
    expect(ws.getRow(2).getCell(9).value).toBe('НМО-7');
  });
});
