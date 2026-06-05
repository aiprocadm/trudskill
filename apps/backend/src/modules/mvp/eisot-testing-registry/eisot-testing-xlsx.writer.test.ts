import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import { EisotTestingXlsxWriter } from './eisot-testing-xlsx.writer.js';

import type { EisotTestingRow } from '../mvp.types.js';

const row: EisotTestingRow = {
  enrollmentId: 'enr_1',
  learnerId: 'lrn_1',
  lastName: 'Иванов',
  firstName: 'Иван',
  middleName: 'Иванович',
  fullName: 'Иванов Иван Иванович',
  snils: '112-233-445 95',
  dateOfBirth: '01.05.1990',
  position: 'Электрик',
  employerName: 'ООО Ромашка',
  employerInn: '7707083893',
  programName: 'Охрана труда',
  referralDate: '10.03.2026'
};

describe('EisotTestingXlsxWriter', () => {
  it('writes a workbook readable back with the expected header + values', async () => {
    const buffer = await new EisotTestingXlsxWriter().build([row]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.worksheets[0]!;
    expect(ws.getRow(1).getCell(1).value).toBe('Фамилия');
    const data = ws.getRow(2);
    expect(data.getCell(1).value).toBe('Иванов');
    expect(data.getCell(4).value).toBe('112-233-445 95');
    expect(data.getCell(8).value).toBe('7707083893');
  });
});
