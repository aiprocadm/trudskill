import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';

import type { NmoRow } from '../mvp.types.js';

// PROVISIONAL — сверить с эталоном портала НМО (edu.rosminzdrav.ru) перед боевой подачей.
// Единственное место маппинга поле→колонка (single swap point). `specialty`/`ЗЕТ` —
// swap-points (специальность пока пустая; ЗЕТ провизорно = академические часы).
const COLUMNS: { header: string; key: keyof NmoRow; width: number }[] = [
  { header: 'Фамилия', key: 'lastName', width: 18 },
  { header: 'Имя', key: 'firstName', width: 16 },
  { header: 'Отчество', key: 'middleName', width: 18 },
  { header: 'СНИЛС', key: 'snils', width: 16 },
  { header: 'Специальность', key: 'specialty', width: 30 },
  { header: 'Наименование программы', key: 'programName', width: 50 },
  { header: 'ЗЕТ', key: 'creditUnits', width: 10 },
  { header: 'Дата освоения', key: 'completionDate', width: 16 },
  { header: 'Номер документа', key: 'documentNumber', width: 22 }
];

@Injectable()
export class NmoXlsxWriter {
  readonly contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  async build(rows: NmoRow[]): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('НМО');
    ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key as string, width: c.width }));
    for (const r of rows) {
      ws.addRow(COLUMNS.reduce((acc, c) => ({ ...acc, [c.key]: r[c.key] }), {}));
    }
    ws.getRow(1).font = { bold: true };
    return (await wb.xlsx.writeBuffer()) as unknown as Buffer;
  }
}
