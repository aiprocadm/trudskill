import { describe, expect, it } from 'vitest';

import { validateRostechnadzorRow } from './rostechnadzor-preflight.js';

import type { RostechnadzorRow } from '../mvp.types.js';

const row = (over: Partial<RostechnadzorRow> = {}): RostechnadzorRow => ({
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
  attestationArea: 'Б.1',
  protocolNumber: 'ПБ-42',
  knowledgeCheckDate: '10.05.2026',
  result: 'удовлетворительно',
  ...over
});

describe('validateRostechnadzorRow', () => {
  it('accepts a fully valid row', () => {
    expect(validateRostechnadzorRow(row())).toEqual([]);
  });

  it('flags missing ФИО, протокол, область, bad date', () => {
    const errs = validateRostechnadzorRow(
      row({
        lastName: '',
        fullName: '',
        protocolNumber: '',
        attestationArea: '',
        knowledgeCheckDate: '2026-05-10'
      })
    );
    const fields = errs.map((e) => e.field);
    expect(fields).toContain('fullName');
    expect(fields).toContain('protocolNumber');
    expect(fields).toContain('attestationArea');
    expect(fields).toContain('knowledgeCheckDate');
  });

  it('ФТ-C4.1: пустой СНИЛС — теперь ОШИБКА, а не пустая ячейка в файле', () => {
    const errs = validateRostechnadzorRow(row({ snils: '' }));
    expect(errs.some((e) => e.field === 'snils')).toBe(true);
  });

  it('битая контрольная сумма ловится и объясняется как опечатка', () => {
    const errs = validateRostechnadzorRow(row({ snils: '111-111-111 11' }));
    expect(errs.some((e) => e.field === 'snils')).toBe(true);
  });

  it('validates ИНН format only when present', () => {
    expect(validateRostechnadzorRow(row({ employerInn: '' }))).toEqual([]);
    expect(validateRostechnadzorRow(row({ employerInn: '12345' })).map((e) => e.field)).toContain(
      'employerInn'
    );
  });
});
