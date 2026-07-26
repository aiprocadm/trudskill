import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const projectRoot = process.cwd();
const migrationPath = existsSync(join(projectRoot, 'migrations'))
  ? join(projectRoot, 'migrations/0061_learners_pii_blind_index.sql')
  : join(projectRoot, 'apps/backend/migrations/0061_learners_pii_blind_index.sql');

const sql = readFileSync(migrationPath, 'utf8');

describe('migration 0061 (шифрование ПДн, ФТ-C3.3)', () => {
  it('creates the blind-hash functional indexes on both runtime document tables', () => {
    expect(sql).toMatch(/create index if not exists idx_mvp_runtime_learners_snils_hash/);
    expect(sql).toMatch(/create index if not exists idx_mvp_stage1_learners_snils_hash/);
    expect(sql).toMatch(/data->>'snilsHash'/);
    expect(sql).toMatch(/where collection = 'learners'/);
  });

  it('is additive and idempotent (no drops, no data rewrites)', () => {
    expect(sql).not.toMatch(/drop\s/i);
    expect(sql).not.toMatch(/^\s*update\s/im);
    expect(sql).not.toMatch(/^\s*alter\s/im);
    const creates = sql.match(/create index/gi) ?? [];
    const guarded = sql.match(/create index if not exists/gi) ?? [];
    expect(creates.length).toBe(guarded.length);
  });
});
