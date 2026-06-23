import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const projectRoot = process.cwd();
const migrationPath = existsSync(join(projectRoot, 'migrations'))
  ? join(projectRoot, 'migrations/0057_iam_integrations_permissions.sql')
  : join(projectRoot, 'apps/backend/migrations/0057_iam_integrations_permissions.sql');

const sql = readFileSync(migrationPath, 'utf8');

describe('migration 0057', () => {
  it('seeds the integrations.read and integrations.write permissions', () => {
    expect(sql).toMatch(/'integrations\.read'/);
    expect(sql).toMatch(/'integrations\.write'/);
    expect(sql).toMatch(/insert into iam\.permissions/);
  });
  it('assigns the permissions to admin roles for the demo tenant', () => {
    expect(sql).toMatch(/insert into iam\.role_permissions/);
    expect(sql).toMatch(/platform_admin/);
    expect(sql).toMatch(/tenant_admin/);
  });
  it('is idempotent (on conflict do nothing)', () => {
    expect(sql).toMatch(/on conflict .* do nothing/i);
  });
});
