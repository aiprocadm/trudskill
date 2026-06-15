import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';

import type { RostechnadzorRow } from '../mvp.types.js';

// PROVISIONAL — сверить с офиц. шаблоном/требованиями Ростехнадзора перед боевой подачей.
// Единственное место маппинга поле→колонка (single swap point). `attestationArea`
// провизорно = наименование программы; заменить при наличии классификатора областей.
const COLUMNS: { header: string; key: keyof RostechnadzorRow; width: number }[] = [
  { header: 'Фамилия', key: 'lastName', width: 18 },
  { header: 'Имя', key: 'firstName', width: 16 },
  { header: 'Отчество', key: 'middleName', width: 18 },
  { header: 'СНИЛС', key: 'snils', width: 16 },
  { header: 'Должность', key: 'position', width: 24 },
  { header: 'Работодатель', key: 'employerName', width: 32 },
  { header: 'ИНН работодателя', key: 'employerInn', width: 16 },
  { header: 'Область аттестации', key: 'attestationArea', width: 44 },
  { header: 'Номер протокола', key: 'protocolNumber', width: 18 },
  { header: 'Дата проверки знаний', key: 'knowledgeCheckDate', width: 18 },
  { header: 'Результат', key: 'result', width: 20 }
];

@Injectable()
export class RostechnadzorXlsxWriter {
  readonly contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  async build(rows: RostechnadzorRow[]): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Ростехнадзор');
    ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key as string, width: c.width }));
    for (const r of rows) {
      ws.addRow(COLUMNS.reduce((acc, c) => ({ ...acc, [c.key]: r[c.key] }), {}));
    }
    ws.getRow(1).font = { bold: true };
    return (await wb.xlsx.writeBuffer()) as unknown as Buffer;
  }
}
