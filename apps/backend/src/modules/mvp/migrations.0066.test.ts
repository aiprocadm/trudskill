import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(__dirname, '../../../migrations/0066_learning_identity_policy.sql'),
  'utf8'
);

/** Политика идентификации (ФТ-C1, Фаза 3 Task 1). */
describe('migration 0066', () => {
  it('создаёт таблицу политик с областью действия', () => {
    expect(sql).toContain('learning.identity_policies');
    expect(sql).toContain("scope IN ('tenant', 'direction', 'course')");
  });

  it('уровень ограничен диапазоном 0..3 — «ничего не требуется» не бывает', () => {
    expect(sql).toContain('level BETWEEN 0 AND 3');
  });

  it('политика тенанта без объекта, политика курса — только с объектом', () => {
    expect(sql).toContain("(scope = 'tenant' AND scope_id IS NULL)");
    expect(sql).toContain("(scope <> 'tenant' AND scope_id IS NOT NULL)");
  });

  it('одна политика на область — иначе уровень выбирался бы «как повезёт»', () => {
    expect(sql).toContain('uq_identity_policies_scope');
    expect(sql).toContain('CREATE UNIQUE INDEX');
  });

  it('право настройки выдано только администрации центра, не методисту', () => {
    expect(sql).toContain('identity.configure');
    const grant = /p\.code = 'identity\.configure'[\s\S]*?r\.code IN \(([^)]*)\)/.exec(sql);
    expect(grant).not.toBeNull();
    expect(grant![1]).not.toContain('methodist');
    expect(grant![1]).not.toContain('learner');
  });

  it('аддитивна и обёрнута в транзакцию', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS');
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN)/i);
    expect(sql).toContain('BEGIN;');
    expect(sql).toContain('COMMIT;');
  });
});
