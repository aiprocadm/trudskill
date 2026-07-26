import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const projectRoot = process.cwd();
const migrationPath = existsSync(join(projectRoot, 'migrations'))
  ? join(projectRoot, 'migrations/0060_iam_totp_2fa.sql')
  : join(projectRoot, 'apps/backend/migrations/0060_iam_totp_2fa.sql');

const sql = readFileSync(migrationPath, 'utf8');

describe('migration 0060 (2FA TOTP, ФТ-G3)', () => {
  it('adds the three totp columns to iam.users', () => {
    expect(sql).toMatch(
      /alter table iam\.users add column if not exists totp_secret_encrypted text/
    );
    expect(sql).toMatch(
      /alter table iam\.users add column if not exists totp_enabled boolean not null default false/
    );
    expect(sql).toMatch(
      /alter table iam\.users add column if not exists totp_last_used_step bigint/
    );
  });

  it('is additive and idempotent (only add column if not exists, no drops/updates)', () => {
    expect(sql).not.toMatch(/drop\s/i);
    expect(sql).not.toMatch(/^\s*update\s/im);
    const alters = sql.match(/alter table/gi) ?? [];
    const guarded = sql.match(/add column if not exists/gi) ?? [];
    expect(alters.length).toBe(guarded.length);
  });
});
