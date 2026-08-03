import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(__dirname, '../../../migrations/0073_iam_platform_tenants_permissions.sql'),
  'utf8'
);

/** Фаза 4 Task 3 (ФТ-D2.2): права платформенной админки тенантов. */
describe('migration 0073', () => {
  it('заводит оба права платформенной админки', () => {
    expect(sql).toContain("'platform.tenants.read'");
    expect(sql).toContain("'platform.tenants.write'");
  });

  it('права выдаются ТОЛЬКО platform_admin — tenant_admin арендатора их не получает', () => {
    // Дать tenant_admin кросс-тенантный список означало бы дать каждому арендатору
    // админку всех остальных.
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
