import { describe, expect, it } from 'vitest';

import { buildRostechnadzorRows } from './rostechnadzor-rows.js';

import type { RostechnadzorBundle } from './rostechnadzor-rows.js';
import type { Enrollment, Learner } from '../mvp.types.js';

const learner = (over: Partial<Learner> = {}): Learner =>
  ({
    id: 'l1',
    tenantId: 't1',
    status: 'active',
    createdAt: '',
    updatedAt: '',
    lastName: 'Иванов',
    firstName: 'Иван',
    middleName: 'Иванович',
    snils: '112-233-445 95',
    position: 'Инженер',
    ...over
  }) as Learner;

const enrollment = (over: Partial<Enrollment> = {}): Enrollment =>
  ({ id: 'e1', tenantId: 't1', learnerId: 'l1', groupId: 'g1', ...over }) as Enrollment;

const bundle = (over: Partial<RostechnadzorBundle> = {}): RostechnadzorBundle => ({
  enrollment: enrollment(),
  learner: learner(),
  employerName: 'ООО Ромашка',
  employerInn: '7701234567',
  attestationArea: 'Б.1 Эксплуатация ОПО',
  protocol: { documentNumber: 'ПБ-42', documentDate: '2026-05-10' },
  ...over
});

describe('buildRostechnadzorRows', () => {
  it('maps a bundle to a row with formatted protocol date and passed result', () => {
    const [row] = buildRostechnadzorRows([bundle()]);
    expect(row).toMatchObject({
      enrollmentId: 'e1',
      learnerId: 'l1',
      lastName: 'Иванов',
      firstName: 'Иван',
      middleName: 'Иванович',
      fullName: 'Иванов Иван Иванович',
      snils: '112-233-445 95',
      position: 'Инженер',
      employerName: 'ООО Ромашка',
      employerInn: '7701234567',
      attestationArea: 'Б.1 Эксплуатация ОПО',
      protocolNumber: 'ПБ-42',
      knowledgeCheckDate: '10.05.2026',
      result: 'удовлетворительно'
    });
  });

  it('emits blank cells (not crashes) for missing optional fields', () => {
    const [row] = buildRostechnadzorRows([
      bundle({
        learner: learner({ snils: undefined, position: undefined, middleName: undefined }),
        protocol: { documentNumber: '', documentDate: '' }
      })
    ]);
    expect(row.snils).toBe('');
    expect(row.position).toBe('');
    expect(row.middleName).toBe('');
    expect(row.knowledgeCheckDate).toBe('');
  });
});
