import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(__dirname, '../../../migrations/0074_iam_platform_impersonate_permission.sql'),
  'utf8'
);

/** Фаза 4 Task 3, срез 2 (ФТ-D2.2): право входа «от имени». */
describe('migration 0074', () => {
  it('заводит отдельное право platform.impersonate', () => {
    // Видеть список арендаторов и входить в их кабинеты — разные полномочия.
    expect(sql).toContain("'platform.impersonate'");
  });

  it('право выдаётся ТОЛЬКО platform_admin', () => {
    const grant = sql.slice(sql.indexOf('INSERT INTO iam.role_permissions'));
    expect(grant).toMatch(/WHERE r\.code = 'platform_admin'/);
    expect(grant).not.toContain("'tenant_admin'");
  });

  it('идемпотентна и обёрнута в транзакцию', () => {
    expect(sql).toContain('ON CONFLICT (id) DO NOTHING');
    expect(sql).toContain('ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING');
    expect(sql).toContain('BEGIN;');
    expect(sql).toContain('COMMIT;');
  });
});
