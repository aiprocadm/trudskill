import { describe, expect, it } from 'vitest';

import {
  type ExpiringDocumentInput,
  daysBetween,
  selectExpiringDocuments,
  summarize,
  urgencyOf
} from './expiring-documents.util.js';

const TODAY = '2026-08-04';

const doc = (overrides: Partial<ExpiringDocumentInput> = {}): ExpiringDocumentInput => ({
  id: 'gdoc_1',
  documentNumber: 'УД-1',
  documentType: 'certificate',
  learnerNamePublic: 'Иванов И. И.',
  sourceEntityId: 'enr_1',
  validUntil: '2026-08-20',
  status: 'generated',
  ...overrides
});

describe('expiring documents (ФТ-E4)', () => {
  it('дни считаются целыми, знак показывает просрочку', () => {
    expect(daysBetween(TODAY, '2026-08-20')).toBe(16);
    expect(daysBetween(TODAY, TODAY)).toBe(0);
    expect(daysBetween(TODAY, '2026-07-30')).toBe(-5);
  });

  it('срочность соответствует окнам напоминаний 7/30/60', () => {
    expect(urgencyOf(-1)).toBe('expired');
    expect(urgencyOf(0)).toBe('critical');
    expect(urgencyOf(7)).toBe('critical');
    expect(urgencyOf(8)).toBe('soon');
    expect(urgencyOf(30)).toBe('soon');
    expect(urgencyOf(31)).toBe('later');
  });

  it('ПРОСРОЧЕННЫЕ попадают в дашборд и идут первыми — это самая срочная работа', () => {
    const rows = selectExpiringDocuments(
      TODAY,
      [
        doc({ id: 'b', validUntil: '2026-08-20' }),
        doc({ id: 'a', validUntil: '2026-06-01' }),
        doc({ id: 'c', validUntil: '2026-08-05' })
      ],
      60
    );
    expect(rows.map((r) => r.id)).toEqual(['a', 'c', 'b']);
    expect(rows[0]!.urgency).toBe('expired');
    expect(rows[0]!.daysLeft).toBeLessThan(0);
  });

  it('за горизонтом не показываем — иначе дашборд превращается в весь реестр', () => {
    const rows = selectExpiringDocuments(TODAY, [doc({ validUntil: '2027-01-01' })], 60);
    expect(rows).toHaveLength(0);
  });

  it('отозванные, архивные и бессрочные документы продлевать нечего', () => {
    const rows = selectExpiringDocuments(
      TODAY,
      [
        doc({ id: 'revoked', status: 'revoked' }),
        doc({ id: 'revoked_at', revokedAt: '2026-07-01T00:00:00Z' }),
        doc({ id: 'archived', status: 'archived' }),
        doc({ id: 'no_expiry', validUntil: undefined })
      ],
      60
    );
    expect(rows).toHaveLength(0);
  });

  it('сводка считает по группам срочности', () => {
    const rows = selectExpiringDocuments(
      TODAY,
      [
        doc({ id: '1', validUntil: '2026-06-01' }),
        doc({ id: '2', validUntil: '2026-08-05' }),
        doc({ id: '3', validUntil: '2026-08-25' }),
        doc({ id: '4', validUntil: '2026-09-25' })
      ],
      60
    );
    expect(summarize(rows)).toEqual({ total: 4, expired: 1, critical: 1, soon: 1, later: 1 });
  });

  it('проекция не содержит снимка подстановки с ПДн — только то, что нужно списку', () => {
    const [row] = selectExpiringDocuments(TODAY, [doc()], 60);
    expect(Object.keys(row!).sort()).toEqual([
      'daysLeft',
      'documentNumber',
      'documentType',
      'enrollmentId',
      'id',
      'learnerName',
      'urgency',
      'validUntil'
    ]);
  });
});
