import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import { matchResponseToRecords, parseRegistryResponse } from './ot-registry-response.parser.js';

import type { OtRegistryRecord } from '../mvp.types.js';

async function buildResponseXlsx(
  rows: { snils: string; protocol: string; programId: number; regNo: string }[]
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('resp');
  ws.addRow(['СНИЛС', 'Номер протокола', 'ID программы', 'Регистрационный номер']);
  rows.forEach((r) => ws.addRow([r.snils, r.protocol, r.programId, r.regNo]));
  return (await wb.xlsx.writeBuffer()) as unknown as Buffer;
}

describe('registry response round-trip', () => {
  it('parses rows and matches by snils+protocol+programId', async () => {
    const buf = await buildResponseXlsx([
      { snils: '112-233-445 95', protocol: 'ПР-1', programId: 1, regNo: 'РН-777' }
    ]);
    const parsed = await parseRegistryResponse(buf);
    expect(parsed).toHaveLength(1);
    const records: OtRegistryRecord[] = [
      {
        id: 'r1',
        tenantId: 't',
        status: 'active',
        createdAt: '',
        updatedAt: '',
        batchId: 'b1',
        enrollmentId: 'e1',
        learnerId: 'l1',
        snils: '112-233-445 95',
        programCode: 'OT_A',
        programRegistryId: 1,
        protocolNumber: 'ПР-1'
      }
    ];
    const result = matchResponseToRecords(parsed, records);
    expect(result.matched).toBe(1);
    expect(records[0].registrationNumber).toBe('РН-777');
  });

  it('reports unmatched response rows', async () => {
    const buf = await buildResponseXlsx([
      { snils: '999-999-999 99', protocol: 'X', programId: 9, regNo: 'РН-1' }
    ]);
    const parsed = await parseRegistryResponse(buf);
    const result = matchResponseToRecords(parsed, []);
    expect(result.unmatched).toBe(1);
  });
});
