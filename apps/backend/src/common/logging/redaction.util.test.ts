import { describe, expect, it } from 'vitest';

import { redactValue } from './redaction.util.js';

describe('redaction util', () => {
  it('redacts sensitive keys recursively', () => {
    const output = redactValue({
      password: 'secret',
      nested: { accessToken: 'abc', value: 123 },
      arr: [{ apiKey: 'x' }],
      email: 'user@example.com'
    });

    expect(output).toEqual({
      password: '[REDACTED]',
      nested: { accessToken: '[REDACTED]', value: 123 },
      arr: [{ apiKey: '[REDACTED]' }],
      email: '[REDACTED]'
    });
  });
});

// === ФТ-G6 (Фаза 4 Task 12) — обезличивание персональных данных в журнале ===
describe('обезличивание ПДн слушателя (ФТ-G6)', () => {
  it('ФИО, СНИЛС и дата рождения не попадают в журнал открытым текстом', () => {
    const output = redactValue({
      firstName: 'Иван',
      lastName: 'Иванов',
      middleName: 'Иванович',
      fullName: 'Иванов Иван Иванович',
      snils: '123-456-789 00',
      dateOfBirth: '1990-05-17',
      passportSeries: '4510'
    }) as Record<string, unknown>;

    for (const key of Object.keys(output)) {
      expect(output[key]).toBe('[REDACTED]');
    }
  });

  it('слепой индекс СНИЛС тоже скрывается — он сопоставляет людей между записями', () => {
    const output = redactValue({ snilsHash: 'a1b2c3', snils_hash: 'd4e5f6' }) as Record<
      string,
      unknown
    >;
    expect(output.snilsHash).toBe('[REDACTED]');
    expect(output.snils_hash).toBe('[REDACTED]');
  });

  it('ПДн скрываются и во вложенных структурах, и в массивах', () => {
    const output = redactValue({
      learner: { lastName: 'Петров', position: 'слесарь' },
      rows: [{ snils: '111-111-111 11' }, { firstName: 'Пётр' }]
    }) as { learner: Record<string, unknown>; rows: Record<string, unknown>[] };

    expect(output.learner.lastName).toBe('[REDACTED]');
    expect(output.rows[0]!.snils).toBe('[REDACTED]');
    expect(output.rows[1]!.firstName).toBe('[REDACTED]');
    // Должность — не идентифицирующий признак, её оставляем: без неё разбор
    // инцидентов теряет смысл.
    expect(output.learner.position).toBe('слесарь');
  });

  it('технические поля разбора не затрагиваются — иначе журнал станет бесполезен', () => {
    const output = redactValue({
      tenantId: 't1',
      learnerId: 'lrn_1',
      requestId: 'r1',
      status: 'failed',
      durationMs: 42
    });
    expect(output).toEqual({
      tenantId: 't1',
      learnerId: 'lrn_1',
      requestId: 'r1',
      status: 'failed',
      durationMs: 42
    });
  });
});
