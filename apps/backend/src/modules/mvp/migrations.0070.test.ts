import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(__dirname, '../../../migrations/0070_identity_photo_max_age.sql'),
  'utf8'
);

/** ФТ-C1.2: срок годности подтверждения с фото (ответ владельца 2026-07-29). */
describe('migration 0070', () => {
  it('добавляет срок туда же, где живёт само требование фото', () => {
    expect(sql).toContain('learning.identity_policies');
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS photo_max_age_hours integer NULL/);
  });

  it('аддитивна — существующие записи не трогает', () => {
    expect(sql).not.toMatch(/DROP COLUMN|UPDATE learning\.identity_policies SET/);
  });

  it('границы проверяются в БД, а не только в коде', () => {
    // Настройку правят и напрямую в базе.
    expect(sql).toContain('identity_policies_photo_max_age_chk');
    expect(sql).toMatch(/photo_max_age_hours >= 1 AND photo_max_age_hours <= 720/);
  });

  it('NULL допустим — это «работает умолчание 24 часа»', () => {
    expect(sql).toMatch(/photo_max_age_hours IS NULL OR/);
  });

  it('идемпотентна и обёрнута в транзакцию', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS');
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS');
    expect(sql).toContain('BEGIN;');
    expect(sql).toContain('COMMIT;');
  });
});
