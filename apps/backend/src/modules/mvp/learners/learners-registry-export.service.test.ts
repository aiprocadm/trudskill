import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import {
  LEARNERS_EXPORT_COLUMNS,
  LearnersRegistryExportService,
  learnerExportRow
} from './learners-registry-export.service.js';

import type { LearnerRegistryRow } from '../infrastructure/repositories/learners-registry.js';

const row: LearnerRegistryRow = {
  id: 'l1',
  tenantId: 't',
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  firstName: 'Иван',
  lastName: 'Иванов',
  middleName: 'Иванович',
  email: 'a@x.ru',
  snils: '***-***-*** 95',
  position: 'Инженер',
  registry: {
    companyName: 'ООО «Ромб»',
    currentGroupName: 'ОТ-14',
    lastLoginAt: '2026-09-20T10:00:00.000Z',
    consentGranted: true
  }
};

/** Выгрузка реестра слушателей (МГ-C3.2, срез 11.1, РМ105). */
describe('LearnersRegistryExportService', () => {
  it('строка выгрузки — подписи, а не коды; СНИЛС остаётся маской; без сведений — пусто', () => {
    expect(learnerExportRow(row)).toEqual({
      fullName: 'Иванов Иван Иванович',
      email: 'a@x.ru',
      snils: '***-***-*** 95',
      position: 'Инженер',
      company: 'ООО «Ромб»',
      group: 'ОТ-14',
      lastLoginAt: '20.09.2026',
      consent: 'действует',
      status: 'Активен'
    });
    const bare = learnerExportRow({ ...row, registry: undefined, status: 'archived' });
    expect(bare).toMatchObject({
      company: null,
      group: null,
      lastLoginAt: null,
      consent: null,
      status: 'В архиве'
    });
  });

  it('книга XLSX: заголовки по-русски в порядке колонок, одна строка данных', async () => {
    const buffer = await new LearnersRegistryExportService().build([row]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    const ws = wb.worksheets[0]!;
    const headers = (ws.getRow(1).values as unknown[]).slice(1);
    expect(headers).toEqual(LEARNERS_EXPORT_COLUMNS.map((c) => c.header));
    expect(ws.getRow(2).getCell(1).value).toBe('Иванов Иван Иванович');
    expect(ws.getRow(2).getCell(5).value).toBe('ООО «Ромб»');
    expect(ws.rowCount).toBe(2);
  });
});
