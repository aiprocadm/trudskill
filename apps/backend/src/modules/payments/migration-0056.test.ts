import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const projectRoot = process.cwd();
const migrationPath = existsSync(join(projectRoot, 'migrations'))
  ? join(projectRoot, 'migrations/0056_payments_provider_settings.sql')
  : join(projectRoot, 'apps/backend/migrations/0056_payments_provider_settings.sql');

const sql = readFileSync(migrationPath, 'utf8');

describe('migration 0056', () => {
  it('creates payments.payment_provider_settings', () => {
    expect(sql).toMatch(/create table if not exists payments\.payment_provider_settings/);
    expect(sql).toMatch(/tenant_id text primary key/);
    expect(sql).toMatch(/provider_code text not null default 'noop'/);
    expect(sql).toMatch(/enabled boolean not null default false/);
  });
  it('seeds the payments.configure permission to admin roles', () => {
    expect(sql).toMatch(/'payments\.configure'/);
    expect(sql).toMatch(/platform_admin/);
    expect(sql).toMatch(/tenant_admin/);
  });
});
