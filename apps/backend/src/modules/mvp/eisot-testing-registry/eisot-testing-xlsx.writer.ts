import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';

import type { EisotTestingRow } from '../mvp.types.js';

// PROVISIONAL — сверить с офиц. .xlsx-шаблоном ЛКОТ «лица на тестирование» (Минтруд) перед боевой
// загрузкой (spec §6/§14). Единственное место маппинга поле→колонка (single swap point). Состав
// полей — best-effort по публичным требованиям ЛКОТ (ФИО / СНИЛС / дата рождения / должность /
// работодатель + ИНН / программа / дата направления).
const COLUMNS: { header: string; key: keyof EisotTestingRow; width: number }[] = [
  { header: 'Фамилия', key: 'lastName', width: 18 },
  { header: 'Имя', key: 'firstName', width: 16 },
  { header: 'Отчество', key: 'middleName', width: 18 },
  { header: 'СНИЛС', key: 'snils', width: 16 },
  { header: 'Дата рождения', key: 'dateOfBirth', width: 14 },
  { header: 'Должность', key: 'position', width: 24 },
  { header: 'Работодатель', key: 'employerName', width: 32 },
  { header: 'ИНН работодателя', key: 'employerInn', width: 16 },
  { header: 'Программа (категория проверки знаний)', key: 'programName', width: 44 },
  { header: 'Дата направления', key: 'referralDate', width: 16 }
];

@Injectable()
export class EisotTestingXlsxWriter {
  readonly contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  async build(rows: EisotTestingRow[]): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Лица на тестирование');
    ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key as string, width: c.width }));
    for (const r of rows) {
      ws.addRow(COLUMNS.reduce((acc, c) => ({ ...acc, [c.key]: r[c.key] }), {}));
    }
    ws.getRow(1).font = { bold: true };
    return (await wb.xlsx.writeBuffer()) as unknown as Buffer;
  }
}
