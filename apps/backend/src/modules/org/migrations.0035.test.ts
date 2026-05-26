import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const SQL = readFileSync(
  join(__dirname, '../../../migrations/0035_org_training_licenses.sql'),
  'utf-8'
);

describe('migration 0035 — org.training_licenses (Plan C §5.10)', () => {
  it('creates schema org', () => {
    expect(SQL).toMatch(/CREATE\s+SCHEMA\s+IF\s+NOT\s+EXISTS\s+org/i);
  });

  it('creates table org.training_licenses', () => {
    expect(SQL).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+org\.training_licenses/i);
  });

  it('contains all required columns', () => {
    for (const col of [
      'id text PRIMARY KEY',
      'tenant_id text NOT NULL',
      'license_type text NOT NULL',
      'license_number text NOT NULL',
      'issuer_name text NOT NULL',
      'issued_at date NOT NULL',
      'valid_until date',
      'scan_file_id text',
      'permitted_training_types text\\[\\]',
      'permitted_directions text\\[\\]',
      'status text NOT NULL'
    ]) {
      expect(SQL).toMatch(new RegExp(col, 'i'));
    }
  });

  it('constrains license_type to 4 known values', () => {
    expect(SQL).toMatch(
      /license_type\s+IN\s+\(\s*'education_license',\s*'accreditation',\s*'sro_membership',\s*'other'\s*\)/i
    );
  });

  it('constrains status to 3 known values', () => {
    expect(SQL).toMatch(/status\s+IN\s+\(\s*'active',\s*'expired',\s*'revoked'\s*\)/i);
  });

  it('creates index on tenant_id + status', () => {
    expect(SQL).toMatch(
      /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_training_licenses_tenant_status/i
    );
  });

  it('creates partial index on valid_until for active licenses', () => {
    expect(SQL).toMatch(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_training_licenses_valid_until/i);
    expect(SQL).toMatch(/WHERE\s+status\s+=\s+'active'/i);
  });
});
