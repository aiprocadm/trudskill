import ExcelJS from 'exceljs';

import type {
  OtRegistryImportOutcome,
  OtRegistryRecord,
  OtRegistryResponseRow
} from '../mvp.types.js';

// Сверить с реальным файлом-ответом (план §13 #2): индексы колонок 1..4.
const RESPONSE_COLUMNS = {
  snils: 1,
  protocolNumber: 2,
  programRegistryId: 3,
  registrationNumber: 4
};

export async function parseRegistryResponse(buffer: Buffer): Promise<OtRegistryResponseRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  const rows: OtRegistryResponseRow[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const cell = (i: number) => String(row.getCell(i).value ?? '').trim();
    const snils = cell(RESPONSE_COLUMNS.snils);
    const registrationNumber = cell(RESPONSE_COLUMNS.registrationNumber);
    if (!snils || !registrationNumber) return;
    rows.push({
      snils,
      protocolNumber: cell(RESPONSE_COLUMNS.protocolNumber),
      programRegistryId: Number(cell(RESPONSE_COLUMNS.programRegistryId)),
      registrationNumber
    });
  });
  return rows;
}

const key = (snils: string, protocol: string, programId: number): string =>
  `${snils.replace(/\D/g, '')}|${protocol}|${programId}`;

export function matchResponseToRecords(
  response: OtRegistryResponseRow[],
  records: OtRegistryRecord[]
): OtRegistryImportOutcome {
  const byKey = new Map(
    records.map((r) => [key(r.snils, r.protocolNumber, r.programRegistryId), r])
  );
  let matched = 0;
  const unmatchedRows: OtRegistryResponseRow[] = [];
  for (const row of response) {
    const rec = byKey.get(key(row.snils, row.protocolNumber, row.programRegistryId));
    if (rec) {
      rec.registrationNumber = row.registrationNumber;
      rec.updatedAt = new Date().toISOString();
      matched += 1;
    } else {
      unmatchedRows.push(row);
    }
  }
  return { matched, unmatched: unmatchedRows.length, unmatchedRows };
}
