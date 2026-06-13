import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';

import type { ReportCellValue, ReportColumn } from './report-types.js';

/**
 * Phase 10 Track A — generalised exceljs writer (dynamic columns).
 *
 * Unlike the regulatory writers (fixed COLUMNS), this one takes the column set
 * produced by buildReport, so any entity/field selection renders to a sheet.
 */
@Injectable()
export class ReportXlsxWriter {
  readonly contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  async build(columns: ReportColumn[], rows: Record<string, ReportCellValue>[]): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Отчёт');
    ws.columns = columns.map((c) => ({
      header: c.header,
      key: c.key,
      width: Math.min(60, Math.max(12, c.header.length + 4))
    }));
    for (const row of rows) {
      ws.addRow(
        columns.reduce<Record<string, ReportCellValue>>((acc, c) => {
          acc[c.key] = row[c.key] ?? null;
          return acc;
        }, {})
      );
    }
    ws.getRow(1).font = { bold: true };
    return (await wb.xlsx.writeBuffer()) as unknown as Buffer;
  }
}
