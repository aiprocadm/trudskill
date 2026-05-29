import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const SQL = readFileSync(
  join(__dirname, '../../../migrations/0041_assessment_text_expected_answer.sql'),
  'utf-8'
);

describe('migration 0041 — text expected_answer + attempt auto_graded (Phase 3 Plan B)', () => {
  it('adds expected_answer column to assessment.questions (nullable text)', () => {
    expect(SQL).toMatch(/ALTER\s+TABLE\s+assessment\.questions/i);
    expect(SQL).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+expected_answer\s+text\s+NULL/i);
  });

  it('adds auto_graded column to assessment.attempt_answers (nullable boolean)', () => {
    expect(SQL).toMatch(/ALTER\s+TABLE\s+assessment\.attempt_answers/i);
    expect(SQL).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+auto_graded\s+boolean\s+NULL/i);
  });

  it('is idempotent: IF NOT EXISTS guards both column adds', () => {
    const guards = SQL.match(/IF\s+NOT\s+EXISTS/gi) ?? [];
    expect(guards.length).toBeGreaterThanOrEqual(2);
  });

  it('wraps changes in a BEGIN/COMMIT transaction', () => {
    expect(SQL).toMatch(/^BEGIN;/m);
    expect(SQL).toMatch(/^COMMIT;/m);
  });
});
