import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import { RostechnadzorXlsxWriter } from './rostechnadzor-xlsx.writer.js';

import type { RostechnadzorRow } from '../mvp.types.js';

const row: RostechnadzorRow = {
  enrollmentId: 'e1',
  learnerId: 'l1',
  lastName: 'Иванов',
  firstName: 'Иван',
  middleName: 'Иванович',
  fullName: 'Иванов Иван Иванович',
  snils: '112-233-445 95',
  position: 'Инженер',
  employerName: 'ООО Ромашка',
  employerInn: '7701234567',
  attestationArea: 'Б.1',
  protocolNumber: 'ПБ-42',
  knowledgeCheckDate: '10.05.2026',
  result: 'удовлетворительно'
};

describe('RostechnadzorXlsxWriter', () => {
  it('writes a header row + one data row in column order', async () => {
    const buffer = await new RostechnadzorXlsxWriter().build([row]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.worksheets[0]!;
    expect(ws.getRow(1).getCell(1).value).toBe('Фамилия');
    expect(ws.getRow(1).getCell(8).value).toBe('Область аттестации');
    expect(ws.getRow(2).getCell(1).value).toBe('Иванов');
    expect(ws.getRow(2).getCell(11).value).toBe('удовлетворительно');
  });
});
