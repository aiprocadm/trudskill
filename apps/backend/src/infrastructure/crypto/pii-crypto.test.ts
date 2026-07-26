import { describe, expect, it } from 'vitest';

import {
  decryptLearnerPiiAtRest,
  encryptLearnerPiiAtRest,
  isEncryptedPiiValue,
  snilsBlindIndex
} from './pii-crypto.js';

const learner = {
  id: 'learner_1',
  tenantId: 'tenant_demo',
  name: 'Иванов Иван',
  snils: '112-233-445 95',
  status: 'active'
};

describe('pii-crypto (ФТ-C3.3)', () => {
  it('encrypts snils at rest and adds the blind index; other fields untouched', () => {
    const atRest = encryptLearnerPiiAtRest(learner) as Record<string, unknown>;
    expect(isEncryptedPiiValue(atRest.snils)).toBe(true);
    expect(String(atRest.snils)).not.toContain('112');
    expect(atRest.snilsHash).toMatch(/^[0-9a-f]{64}$/);
    expect(atRest.name).toBe('Иванов Иван');
    expect(atRest.id).toBe('learner_1');
    // Исходный объект не мутирован (state в памяти остаётся открытым).
    expect(learner.snils).toBe('112-233-445 95');
  });

  it('round-trips: decrypt restores the original snils and strips the hash', () => {
    const atRest = encryptLearnerPiiAtRest(learner);
    const restored = decryptLearnerPiiAtRest(atRest) as Record<string, unknown>;
    expect(restored.snils).toBe('112-233-445 95');
    expect('snilsHash' in restored).toBe(false);
  });

  it('blind index is keyed and normalization-insensitive (mask vs digits)', () => {
    expect(snilsBlindIndex('112-233-445 95')).toBe(snilsBlindIndex('11223344595'));
    expect(snilsBlindIndex('11223344595')).not.toBe(snilsBlindIndex('11223344596'));
  });

  it('serialized at-rest JSON never contains the raw digits', () => {
    const json = JSON.stringify(encryptLearnerPiiAtRest(learner));
    expect(json).not.toContain('11223344595');
    expect(json).not.toContain('112-233-445');
  });

  it('passes through learners without snils and legacy plaintext documents', () => {
    const noSnils = { id: 'l2', tenantId: 't', name: 'Без СНИЛС' };
    expect(encryptLearnerPiiAtRest(noSnils)).toBe(noSnils);
    // Legacy plaintext из БД до Task 7 — отдаётся как есть (lazy-миграция при записи).
    const legacy = { id: 'l3', tenantId: 't', snils: '11223344595' };
    expect(decryptLearnerPiiAtRest(legacy)).toBe(legacy);
  });

  it('does not double-encrypt an already encrypted document', () => {
    const once = encryptLearnerPiiAtRest(learner);
    const twice = encryptLearnerPiiAtRest(once) as Record<string, unknown>;
    expect(twice.snils).toBe((once as Record<string, unknown>).snils);
  });
});
