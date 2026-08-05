import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(__dirname, '../../../migrations/0079_iam_learner_pii_permission.sql'),
  'utf8'
);

const ddl = sql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

/** Фаза 4 Task 12 (ФТ-G6): право на выгрузку и обезличивание ПДн слушателя. */
describe('migration 0079', () => {
  it('заводит отдельное право learners.pii.manage', () => {
    expect(ddl).toContain("'learners.pii.manage'");
  });

  it('право выдаётся только администрации, но не методисту', () => {
    const grant = ddl.slice(ddl.indexOf('INSERT INTO iam.role_permissions'));
    expect(grant).toContain("'platform_admin'");
    expect(grant).toContain("'tenant_admin'");
    // Методист ведёт карточки, но выгружать и стирать ПДн по заявлению субъекта —
    // не его полномочие.
    expect(grant).not.toContain("'methodist'");
  });

  it('идемпотентна и обёрнута в транзакцию', () => {
    expect(sql).toContain('ON CONFLICT (id) DO NOTHING');
    expect(sql).toContain('ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING');
    expect(sql).toContain('BEGIN;');
    expect(sql).toContain('COMMIT;');
  });

  it('только добавляет — ничего не удаляет и не переписывает', () => {
    expect(ddl).not.toMatch(/\bDROP\b/i);
    expect(ddl).not.toMatch(/\bDELETE\b/i);
    expect(ddl).not.toMatch(/\bALTER\b/i);
  });
});
