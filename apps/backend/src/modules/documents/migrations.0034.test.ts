import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const SQL = readFileSync(
  join(__dirname, '../../../migrations/0034_documents_revoke_reissue.sql'),
  'utf-8'
);

describe('migration 0034 — revoke/reissue (Plan C §5.9)', () => {
  it('adds 5 nullable columns on generated_documents', () => {
    for (const col of [
      'revoked_at',
      'revoked_by',
      'revocation_reason',
      'replaces_document_id',
      'replaced_by_document_id'
    ]) {
      expect(SQL).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${col}`, 'i'));
    }
  });

  it('creates a partial index on revoked_at', () => {
    expect(SQL).toMatch(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_generated_documents_revoked/i);
    expect(SQL).toMatch(/WHERE\s+revoked_at\s+IS\s+NOT\s+NULL/i);
  });
});
