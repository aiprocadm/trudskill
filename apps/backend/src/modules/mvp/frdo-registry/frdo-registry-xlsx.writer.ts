import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';

import type { FrdoRegistryRow } from '../mvp.types.js';

// PROVISIONAL — сверить с офиц. .xlsx-шаблоном ФИС ФРДО (Рособрнадзор) перед боевой отправкой (spec §6/§14).
// Единственное место маппинга поле→колонка (single swap point). Состав полей — best-effort по публичным
// требованиям ФРДО ДПО (вид документа / номер / дата / ФИО / СНИЛС / дата рождения / программа / часы).
const COLUMNS: { header: string; key: keyof FrdoRegistryRow; width: number }[] = [
  { header: 'Вид документа', key: 'documentKind', width: 40 },
  { header: 'Регистрационный номер', key: 'registrationNumber', width: 22 },
  { header: 'Дата выдачи', key: 'issueDate', width: 14 },
  { header: 'Фамилия', key: 'lastName', width: 18 },
  { header: 'Имя', key: 'firstName', width: 16 },
  { header: 'Отчество', key: 'middleName', width: 18 },
  { header: 'СНИЛС', key: 'snils', width: 16 },
  { header: 'Дата рождения', key: 'dateOfBirth', width: 14 },
  { header: 'Наименование программы', key: 'programName', width: 50 },
  { header: 'Количество часов', key: 'academicHours', width: 14 },
  { header: 'Квалификация', key: 'qualification', width: 24 }
];

@Injectable()
export class FrdoRegistryXlsxWriter {
  readonly contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  async build(rows: FrdoRegistryRow[]): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('ФРДО');
    ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key as string, width: c.width }));
    for (const r of rows) {
      ws.addRow(COLUMNS.reduce((acc, c) => ({ ...acc, [c.key]: r[c.key] }), {}));
    }
    ws.getRow(1).font = { bold: true };
    return (await wb.xlsx.writeBuffer()) as unknown as Buffer;
  }
}
