import { describe, expect, it } from 'vitest';

import { assertAppliedMigrationUnchanged, computeMigrationSqlChecksum } from './migration-integrity.js';

describe('migration-integrity', () => {
  it('allows unchanged applied migration', () => {
    const sql = 'select 1;';
    const checksum = computeMigrationSqlChecksum(sql);
    expect(() => assertAppliedMigrationUnchanged(checksum, sql)).not.toThrow();
  });

  it('ignores when no stored checksum', () => {
    expect(() => assertAppliedMigrationUnchanged(undefined, 'anything')).not.toThrow();
  });

  it('rejects drift between disk and database checksum', () => {
    const sql = 'original';
    const stored = computeMigrationSqlChecksum(sql);
    expect(() => assertAppliedMigrationUnchanged(stored, 'tampered')).toThrow(/checksum mismatch/i);
  });
});
