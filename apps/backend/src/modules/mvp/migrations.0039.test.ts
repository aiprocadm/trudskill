import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const SQL = readFileSync(
  join(__dirname, '../../../migrations/0039_counterparty_extended_fields_and_group_link.sql'),
  'utf-8'
);

describe('migration 0039 — counterparty extended fields + group→counterparty link (Plan C Task 1)', () => {
  it('targets crm.counterparties (not mvp — deviation from plan)', () => {
    expect(SQL).toMatch(/ALTER\s+TABLE\s+crm\.counterparties/i);
    expect(SQL).not.toMatch(/ALTER\s+TABLE\s+mvp\.counterparties/i);
  });

  it('adds 6 extended counterparty columns', () => {
    for (const col of ['inn', 'kpp', 'contact_email', 'contact_phone', 'legal_address', 'note']) {
      expect(SQL).toMatch(
        new RegExp(`ADD\\s+COLUMN\\s+IF\\s+NOT\\s+EXISTS\\s+${col}\\s+TEXT`, 'i')
      );
    }
  });

  it('enforces ИНН format constraint (10 or 12 digits or NULL)', () => {
    expect(SQL).toMatch(/counterparties_inn_format_check/i);
    expect(SQL).toMatch(/inn\s+IS\s+NULL\s+OR\s+inn\s+~/i);
  });

  it('adds counterparty_id FK column to learning.groups', () => {
    expect(SQL).toMatch(/ALTER\s+TABLE\s+learning\.groups/i);
    expect(SQL).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+counterparty_id\s+TEXT/i);
  });

  it('uses composite tenant_id+counterparty_id FK against crm.counterparties', () => {
    expect(SQL).toMatch(/groups_counterparty_tenant_fk/i);
    expect(SQL).toMatch(
      /FOREIGN\s+KEY\s*\(\s*tenant_id\s*,\s*counterparty_id\s*\)\s+REFERENCES\s+crm\.counterparties/i
    );
  });

  it('creates partial index for group→counterparty progress aggregation', () => {
    expect(SQL).toMatch(/groups_counterparty_id_idx/i);
    expect(SQL).toMatch(/WHERE\s+counterparty_id\s+IS\s+NOT\s+NULL/i);
  });

  it('wraps changes in a BEGIN/COMMIT transaction', () => {
    expect(SQL).toMatch(/^BEGIN;/m);
    expect(SQL).toMatch(/^COMMIT;/m);
  });
});
