import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const SQL = readFileSync(
  join(__dirname, '../../../migrations/0033_documents_qr_token.sql'),
  'utf-8'
);

describe('migration 0033 — documents qr_token (Plan C §5.8)', () => {
  it('adds qr_token column on documents.generated_documents', () => {
    expect(SQL).toMatch(/ALTER\s+TABLE\s+documents\.generated_documents/i);
    expect(SQL).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+qr_token\s+text/i);
  });

  it('creates a unique index on qr_token (partial — only where NOT NULL)', () => {
    expect(SQL).toMatch(
      /CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_generated_documents_qr_token/i
    );
    expect(SQL).toMatch(/WHERE\s+qr_token\s+IS\s+NOT\s+NULL/i);
  });
});
