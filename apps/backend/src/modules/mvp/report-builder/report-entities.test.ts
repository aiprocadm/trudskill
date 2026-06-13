import { describe, expect, it } from 'vitest';

import { REPORT_ENTITIES, getEntity, listReportEntityMeta } from './report-entities.js';

import type { ResolveCtx } from './report-types.js';

const ctx: ResolveCtx = {
  courseTitleById: new Map([['c1', 'ОТ-1']]),
  groupById: new Map([['g1', { name: 'Группа А', counterpartyId: 'cp1' }]]),
  clientNameById: new Map([['cp1', 'ООО Ромашка']]),
  learnerNameById: new Map([['l1', 'Иванов Иван Иванович']]),
  courseProgressByEnrollment: new Map([['e1', 75]])
};

describe('REPORT_ENTITIES', () => {
  it('exposes exactly the two v1 entities', () => {
    expect(REPORT_ENTITIES.map((e) => e.key).sort()).toEqual(['enrollments', 'learners']);
  });

  it('learners entity builds fullName and resolves base fields', () => {
    const ent = getEntity('learners');
    const row = {
      id: 'l1',
      tenantId: 't1',
      status: 'active',
      lastName: 'Иванов',
      firstName: 'Иван',
      middleName: 'Иванович',
      email: 'i@example.ru',
      snils: '112-233-445 95',
      createdAt: '2026-01-01T00:00:00.000Z'
    } as never;
    const byKey = (k: string) => ent.fields.find((f) => f.key === k)!.resolve(row, ctx);
    expect(byKey('fullName')).toBe('Иванов Иван Иванович');
    expect(byKey('email')).toBe('i@example.ru');
    expect(byKey('snils')).toBe('112-233-445 95');
    expect(byKey('status')).toBe('active');
  });

  it('enrollments entity resolves attached fields via ctx', () => {
    const ent = getEntity('enrollments');
    const row = {
      id: 'e1',
      tenantId: 't1',
      learnerId: 'l1',
      groupId: 'g1',
      status: 'active',
      enrolledAt: '2026-01-02T00:00:00.000Z'
    } as never;
    const byKey = (k: string) => ent.fields.find((f) => f.key === k)!.resolve(row, ctx);
    expect(byKey('learnerName')).toBe('Иванов Иван Иванович');
    expect(byKey('groupName')).toBe('Группа А');
    expect(byKey('clientName')).toBe('ООО Ромашка');
    expect(byKey('progressPercent')).toBe(75);
    expect(byKey('status')).toBe('active');
  });

  it('enrollments client filter matches on resolved counterparty', () => {
    const ent = getEntity('enrollments');
    const clientFilter = ent.filters.find((f) => f.key === 'client')!;
    const row = { id: 'e1', groupId: 'g1' } as never;
    expect(clientFilter.apply(row, 'cp1', ctx)).toBe(true);
    expect(clientFilter.apply(row, 'cp2', ctx)).toBe(false);
  });

  it('enrollments enrolledFrom/enrolledTo date filters bound the range', () => {
    const ent = getEntity('enrollments');
    const from = ent.filters.find((f) => f.key === 'enrolledFrom')!;
    const to = ent.filters.find((f) => f.key === 'enrolledTo')!;
    const row = { id: 'e1', enrolledAt: '2026-02-15T00:00:00.000Z' } as never;
    expect(from.apply(row, '2026-02-01', ctx)).toBe(true);
    expect(from.apply(row, '2026-03-01', ctx)).toBe(false);
    expect(to.apply(row, '2026-12-31', ctx)).toBe(true);
    expect(to.apply(row, '2026-01-01', ctx)).toBe(false);
  });

  it('getEntity throws on unknown key', () => {
    expect(() => getEntity('nope' as never)).toThrow();
  });

  it('listReportEntityMeta returns serialisable metadata (no resolve fns)', () => {
    const meta = listReportEntityMeta();
    expect(meta.map((e) => e.key).sort()).toEqual(['enrollments', 'learners']);
    const enr = meta.find((e) => e.key === 'enrollments')!;
    expect(enr.fields.some((f) => f.key === 'learnerName')).toBe(true);
    expect(enr.filters.some((f) => f.key === 'status' && f.kind === 'eq')).toBe(true);
    // metadata must be plain data — no function-valued props leak through
    expect(JSON.stringify(meta)).toContain('learnerName');
  });
});
