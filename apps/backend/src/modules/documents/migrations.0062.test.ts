import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const projectRoot = process.cwd();
const migrationPath = existsSync(join(projectRoot, 'migrations'))
  ? join(projectRoot, 'migrations/0062_generated_documents_snapshot.sql')
  : join(projectRoot, 'apps/backend/migrations/0062_generated_documents_snapshot.sql');

const sql = readFileSync(migrationPath, 'utf8');

describe('migration 0062 (снапшот подстановки, ФТ-A1.4)', () => {
  it('adds the snapshot column to documents.generated_documents', () => {
    expect(sql).toMatch(/alter table documents\.generated_documents/i);
    expect(sql).toMatch(/add column if not exists variables_snapshot jsonb/i);
  });

  it('is additive and idempotent (no drops, no data rewrites)', () => {
    expect(sql).not.toMatch(/drop\s/i);
    expect(sql).not.toMatch(/^\s*update\s/im);
    const alters = sql.match(/alter table/gi) ?? [];
    const guarded = sql.match(/add column if not exists/gi) ?? [];
    expect(alters.length).toBe(guarded.length);
  });
});
