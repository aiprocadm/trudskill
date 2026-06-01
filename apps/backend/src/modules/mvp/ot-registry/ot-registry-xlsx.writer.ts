import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';

import type { OtRegistryRow } from '../mvp.types.js';

// PROVISIONAL — сверить с офиц. .xlsx-шаблоном ЛКОТ перед боевой отправкой (spec §13/§16).
// Единственное место маппинга поле→колонка (single swap point). Состав полей подтверждён
// публично (ФИО/СНИЛС/должность/программа/дата/результат); порядок и заголовки — best-effort.
const COLUMNS: { header: string; key: keyof OtRegistryRow; width: number }[] = [
  { header: 'ID программы', key: 'programRegistryId', width: 12 },
  { header: 'Наименование программы', key: 'programName', width: 60 },
  { header: 'ФИО', key: 'fullName', width: 30 },
  { header: 'СНИЛС', key: 'snils', width: 16 },
  { header: 'Должность', key: 'position', width: 24 },
  { header: 'ИНН работодателя', key: 'employerInn', width: 16 },
  { header: 'Номер протокола', key: 'protocolNumber', width: 18 },
  { header: 'Дата проверки знаний', key: 'knowledgeCheckDate', width: 18 },
  { header: 'Результат', key: 'result', width: 18 }
];

@Injectable()
export class OtRegistryXlsxWriter {
  readonly contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  async build(rows: OtRegistryRow[]): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Обученные');
    ws.columns = COLUMNS.map((c) => ({
      header: c.header,
      key: c.key as string,
      width: c.width
    }));
    for (const r of rows) {
      ws.addRow(COLUMNS.reduce((acc, c) => ({ ...acc, [c.key]: r[c.key] }), {}));
    }
    ws.getRow(1).font = { bold: true };
    return (await wb.xlsx.writeBuffer()) as unknown as Buffer;
  }
}
