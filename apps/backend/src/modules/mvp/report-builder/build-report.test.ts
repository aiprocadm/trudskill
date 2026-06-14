import { describe, expect, it } from 'vitest';

import { buildReport } from './build-report.js';
import { getEntity } from './report-entities.js';

import type { ResolveCtx } from './report-types.js';

const ctx: ResolveCtx = {
  courseTitleById: new Map(),
  groupById: new Map([['g1', { name: 'Группа А', counterpartyId: 'cp1' }]]),
  clientNameById: new Map([['cp1', 'ООО Ромашка']]),
  learnerNameById: new Map([
    ['l1', 'Алексеев А'],
    ['l2', 'Борисов Б']
  ]),
  courseProgressByEnrollment: new Map([['e1', 40]])
};

const rows = [
  {
    id: 'e1',
    learnerId: 'l1',
    groupId: 'g1',
    status: 'active',
    enrolledAt: '2026-01-01T00:00:00.000Z'
  },
  {
    id: 'e2',
    learnerId: 'l2',
    groupId: 'g1',
    status: 'completed',
    enrolledAt: '2026-03-01T00:00:00.000Z'
  }
] as never[];

describe('buildReport', () => {
  it('projects only selected fields, in the selected order', () => {
    const out = buildReport({
      entity: getEntity('enrollments'),
      selectedFields: ['status', 'learnerName'],
      filters: [],
      rows,
      ctx
    });
    expect(out.columns.map((c) => c.key)).toEqual(['status', 'learnerName']);
    expect(out.rows).toEqual([
      { status: 'active', learnerName: 'Алексеев А' },
      { status: 'completed', learnerName: 'Борисов Б' }
    ]);
    expect(out.total).toBe(2);
    expect(out.truncated).toBe(false);
  });

  it('applies an eq filter', () => {
    const out = buildReport({
      entity: getEntity('enrollments'),
      selectedFields: ['learnerName'],
      filters: [{ key: 'status', value: 'completed' }],
      rows,
      ctx
    });
    expect(out.rows).toEqual([{ learnerName: 'Борисов Б' }]);
    expect(out.total).toBe(1);
  });

  it('ignores filters with an empty value', () => {
    const out = buildReport({
      entity: getEntity('enrollments'),
      selectedFields: ['status'],
      filters: [{ key: 'status', value: '' }],
      rows,
      ctx
    });
    expect(out.total).toBe(2);
  });

  it('applies date_from / date_to bounds', () => {
    const out = buildReport({
      entity: getEntity('enrollments'),
      selectedFields: ['status'],
      filters: [
        { key: 'enrolledFrom', value: '2026-02-01' },
        { key: 'enrolledTo', value: '2026-12-31' }
      ],
      rows,
      ctx
    });
    expect(out.total).toBe(1); // only e2 (2026-03-01)
  });

  it('caps rows with limit and marks truncated; total is pre-cap', () => {
    const out = buildReport({
      entity: getEntity('enrollments'),
      selectedFields: ['status'],
      filters: [],
      rows,
      ctx,
      limit: 1
    });
    expect(out.rows).toHaveLength(1);
    expect(out.total).toBe(2);
    expect(out.truncated).toBe(true);
  });

  it('does not mark truncated when total fits under the limit', () => {
    const out = buildReport({
      entity: getEntity('enrollments'),
      selectedFields: ['status'],
      filters: [],
      rows,
      ctx,
      limit: 50
    });
    expect(out.truncated).toBe(false);
  });

  it('throws on empty selectedFields', () => {
    expect(() =>
      buildReport({ entity: getEntity('enrollments'), selectedFields: [], filters: [], rows, ctx })
    ).toThrow(/no_fields_selected/);
  });

  it('throws on unknown field key', () => {
    expect(() =>
      buildReport({
        entity: getEntity('enrollments'),
        selectedFields: ['ghost'],
        filters: [],
        rows,
        ctx
      })
    ).toThrow(/unknown_field:ghost/);
  });

  it('throws on unknown filter key', () => {
    expect(() =>
      buildReport({
        entity: getEntity('enrollments'),
        selectedFields: ['status'],
        filters: [{ key: 'ghost', value: 'x' }],
        rows,
        ctx
      })
    ).toThrow(/unknown_filter:ghost/);
  });
});
