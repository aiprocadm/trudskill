import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const SQL = readFileSync(
  join(__dirname, '../../../migrations/0040_assessment_question_types_extension.sql'),
  'utf-8'
);

describe('migration 0040 — assessment question types extension (Phase 3 Plan A Task 1)', () => {
  it('targets assessment.questions table (existing column name `question_type`, not `type`)', () => {
    expect(SQL).toMatch(/ALTER\s+TABLE\s+assessment\.questions/i);
    expect(SQL).toMatch(/question_type/);
  });

  it('extends the type CHECK to include all 5 runtime types + legacy `boolean`', () => {
    expect(SQL).toMatch(/CONSTRAINT\s+questions_type_chk/i);
    for (const t of [
      'single_choice',
      'multiple_choice',
      'number_input',
      'text',
      'essay',
      'boolean'
    ]) {
      expect(SQL).toMatch(new RegExp(`'${t}'`));
    }
  });

  it('drops the old type CHECK before adding the new one (idempotent re-run)', () => {
    expect(SQL).toMatch(/DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+questions_type_chk/i);
  });

  it('adds numeric_expected + numeric_tolerance columns (nullable, numeric)', () => {
    expect(SQL).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+numeric_expected\s+numeric\s+NULL/i);
    expect(SQL).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+numeric_tolerance\s+numeric\s+NULL/i);
  });

  it('enforces partial CHECK: number_input must have numeric_expected', () => {
    expect(SQL).toMatch(/questions_numeric_expected_required_for_number_input_chk/i);
    expect(SQL).toMatch(
      /question_type\s*<>\s*'number_input'\s+OR\s+numeric_expected\s+IS\s+NOT\s+NULL/i
    );
  });

  it('enforces tolerance >= 0 when set', () => {
    expect(SQL).toMatch(/questions_numeric_tolerance_nonneg_chk/i);
    expect(SQL).toMatch(/numeric_tolerance\s+IS\s+NULL\s+OR\s+numeric_tolerance\s*>=\s*0/i);
  });

  it('wraps changes in a BEGIN/COMMIT transaction', () => {
    expect(SQL).toMatch(/^BEGIN;/m);
    expect(SQL).toMatch(/^COMMIT;/m);
  });
});
