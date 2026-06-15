import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const SQL = readFileSync(
  join(__dirname, '../../../migrations/0053_iam_documents_sign_permission.sql'),
  'utf-8'
);

describe('migration 0053 — documents.sign permission (Phase 6 e-signature)', () => {
  it('seeds the documents.sign permission', () => {
    expect(SQL).toMatch(/insert into iam\.permissions/i);
    expect(SQL).toContain('documents.sign');
  });

  it('grants it to admin roles and is idempotent', () => {
    expect(SQL).toMatch(/insert into iam\.role_permissions/i);
    expect(SQL).toMatch(/on conflict/i);
  });
});
