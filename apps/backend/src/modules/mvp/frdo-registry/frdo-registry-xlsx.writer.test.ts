import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import { FrdoRegistryXlsxWriter } from './frdo-registry-xlsx.writer.js';

import type { FrdoRegistryRow } from '../mvp.types.js';

const row: FrdoRegistryRow = {
  documentId: 'doc_1',
  enrollmentId: 'e1',
  learnerId: 'l1',
  documentKindCode: 'PK',
  documentKind: 'Удостоверение о повышении квалификации',
  registrationNumber: 'УД-000123',
  issueDate: '10.03.2026',
  lastName: 'Иванов',
  firstName: 'Иван',
  middleName: 'Иванович',
  fullName: 'Иванов Иван Иванович',
  snils: '112-233-445 95',
  dateOfBirth: '01.05.1990',
  programName: 'Охрана труда',
  academicHours: '40',
  qualification: ''
};

describe('FrdoRegistryXlsxWriter', () => {
  it('writes a workbook readable back with the expected header + values', async () => {
    const buffer = await new FrdoRegistryXlsxWriter().build([row]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.worksheets[0]!;
    expect(ws.getRow(1).getCell(1).value).toBe('Вид документа');
    const data = ws.getRow(2);
    expect(data.getCell(1).value).toBe('Удостоверение о повышении квалификации');
    expect(data.getCell(2).value).toBe('УД-000123');
    expect(data.getCell(4).value).toBe('Иванов');
  });
});
