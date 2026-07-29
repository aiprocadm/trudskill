import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(__dirname, '../../../migrations/0069_learning_consent_texts.sql'),
  'utf8'
);

/** Фаза 3 Task 6 (ФТ-C3.2): тексты раздельных согласий, редактируемые тенантом. */
describe('migration 0069', () => {
  it('создаёт таблицу текстов с версией в первичном ключе', () => {
    expect(sql).toContain('learning.consent_texts');
    expect(sql).toMatch(/PRIMARY KEY \(tenant_id, kind, version\)/);
  });

  it('допускает ровно два вида согласия', () => {
    expect(sql).toMatch(/kind IN \('pii', 'photo'\)/);
    expect(sql).toContain('consent_texts_kind_chk');
  });

  it('хранит хэш текста — правка пробелов не должна гнать всех соглашаться заново', () => {
    expect(sql).toContain('body_hash');
  });

  it('право consents.configure выдаётся только администрации', () => {
    expect(sql).toContain("'consents.configure'");
    expect(sql).toMatch(/r\.code IN \('platform_admin', 'tenant_admin'\)/);
    expect(sql).not.toContain('methodist');
  });

  it('НЕ заводит второй журнал доказательств — факты идут в esign.legal_log_entries', () => {
    // Копия доказательной цепочки неизбежно разойдётся с оригиналом.
    expect(sql).not.toMatch(/create table[^;]*consents\b/i);
    expect(sql).not.toContain('granted_at');
  });

  it('идемпотентна и обёрнута в транзакцию', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS');
    expect(sql).toContain('ON CONFLICT (id) DO NOTHING');
    expect(sql).toContain('BEGIN;');
    expect(sql).toContain('COMMIT;');
  });
});
