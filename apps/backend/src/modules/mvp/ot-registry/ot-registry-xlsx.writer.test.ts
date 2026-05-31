import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import { OtRegistryXlsxWriter } from './ot-registry-xlsx.writer.js';

import type { OtRegistryRow } from '../mvp.types.js';

const row: OtRegistryRow = {
  enrollmentId: 'e1',
  learnerId: 'l1',
  fullName: 'Иванов Иван Иванович',
  snils: '112-233-445 95',
  position: 'Слесарь',
  employerInn: '7707083893',
  programCode: 'OT_A',
  programRegistryId: 1,
  programName: 'Программа А',
  protocolNumber: 'ПР-12/2026',
  knowledgeCheckDate: '10.03.2026',
  result: 'удовлетворительно'
};

describe('OtRegistryXlsxWriter', () => {
  it('writes a workbook readable back with the expected header + values', async () => {
    const buffer = await new OtRegistryXlsxWriter().build([row]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    expect(ws!.getRow(1).getCell(3).value).toBe('ФИО'); // col 3 header
    const dataRow = ws!.getRow(2);
    expect(dataRow.getCell(3).value).toBe('Иванов Иван Иванович'); // col 3 value
    expect(dataRow.getCell(4).value).toBe('112-233-445 95'); // col 4 СНИЛС
    expect(dataRow.getCell(9).value).toBe('удовлетворительно'); // col 9 Результат
  });
});
