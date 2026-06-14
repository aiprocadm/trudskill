import { describe, expect, it } from 'vitest';

import { buildNmoRows } from './nmo-rows.js';

import type { NmoDocumentBundle } from './nmo-rows.js';
import type { Enrollment, Learner } from '../mvp.types.js';

const learner = (over: Partial<Learner> = {}): Learner =>
  ({
    id: 'l1',
    tenantId: 't1',
    lastName: 'Петрова',
    firstName: 'Анна',
    middleName: 'Сергеевна',
    snils: '112-233-445 95',
    ...over
  }) as Learner;

const bundle = (over: Partial<NmoDocumentBundle> = {}): NmoDocumentBundle => ({
  document: { id: 'd1', documentNumber: 'НМО-7', documentDate: '2026-04-20' },
  enrollment: { id: 'e1', tenantId: 't1', learnerId: 'l1', groupId: 'g1' } as Enrollment,
  learner: learner(),
  programName: 'Кардиология (36 ч)',
  specialty: '',
  creditUnits: 36,
  ...over
});

describe('buildNmoRows', () => {
  it('maps a document bundle to a row with ЗЕТ from credit units and formatted date', () => {
    const [row] = buildNmoRows([bundle()]);
    expect(row).toMatchObject({
      documentId: 'd1',
      learnerId: 'l1',
      fullName: 'Петрова Анна Сергеевна',
      snils: '112-233-445 95',
      specialty: '',
      programName: 'Кардиология (36 ч)',
      creditUnits: '36',
      completionDate: '20.04.2026',
      documentNumber: 'НМО-7'
    });
  });

  it('emits blank ЗЕТ/snils when absent', () => {
    const [row] = buildNmoRows([
      bundle({ creditUnits: undefined, learner: learner({ snils: undefined }) })
    ]);
    expect(row.creditUnits).toBe('');
    expect(row.snils).toBe('');
  });
});
