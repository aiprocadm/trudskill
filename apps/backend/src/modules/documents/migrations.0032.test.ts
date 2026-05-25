import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATION_PATH = join(__dirname, '../../../migrations/0032_documents_pillar_a_plan_b.sql');

describe('migration 0032 — documents pillar A plan B', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf-8');

  it('adds CHECK constraint on documents.templates.template_type', () => {
    expect(sql).toMatch(/templates_type_chk/i);
    // Educational document types from spec §5.4.
    for (const t of [
      'certificate',
      'protocol',
      'order',
      'diploma',
      'attestation',
      'reference',
      'report'
    ]) {
      expect(sql).toContain(`'${t}'`);
    }
    // Pre-existing 'contract' type — kept in allow-list for backward compatibility
    // (deviation from spec; см. Plan B deviations).
    expect(sql).toContain(`'contract'`);
  });

  it('adds CHECK constraint on documents.template_variables.category_code', () => {
    expect(sql).toMatch(/template_variables_category_chk/i);
    for (const code of [
      'tenant',
      'group',
      'learner',
      'counterparty',
      'course',
      'commission',
      'document',
      'program',
      'enrollment',
      'group_learners'
    ]) {
      expect(sql).toContain(`'${code}'`);
    }
  });

  it('adds group_order_document_id column on documents.generated_documents', () => {
    expect(sql).toMatch(/ALTER\s+TABLE\s+documents\.generated_documents/i);
    expect(sql).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+group_order_document_id\s+text/i);
  });

  it('creates partial index on group_order_document_id', () => {
    expect(sql).toMatch(
      /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_generated_documents_group_order/i
    );
    expect(sql).toMatch(/WHERE\s+group_order_document_id\s+IS\s+NOT\s+NULL/i);
  });

  it('is idempotent (uses DO-block guard for ADD CONSTRAINT)', () => {
    // ADD CONSTRAINT IF NOT EXISTS отсутствует в PG <16, оборачиваем в pg_constraint check.
    expect(sql).toMatch(/pg_constraint/i);
    expect(sql).toMatch(/DO\s+\$\$/i);
  });
});
