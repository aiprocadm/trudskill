import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const SQL = readFileSync(
  join(__dirname, '../../../migrations/0042_assessment_submission_return_attempt_review.sql'),
  'utf-8'
);

describe('migration 0042 — return_comment + attempt review fields (Phase 3 Plan C)', () => {
  it('adds return_comment column to assessment.assignment_submissions (nullable text)', () => {
    expect(SQL).toMatch(/ALTER\s+TABLE\s+assessment\.assignment_submissions/i);
    expect(SQL).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+return_comment\s+text/i);
  });

  it('adds review_comment column to assessment.test_attempts (nullable text)', () => {
    expect(SQL).toMatch(/ALTER\s+TABLE\s+assessment\.test_attempts/i);
    expect(SQL).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+review_comment\s+text/i);
  });

  it('adds reviewed_by column to assessment.test_attempts (nullable text)', () => {
    expect(SQL).toMatch(/ALTER\s+TABLE\s+assessment\.test_attempts/i);
    expect(SQL).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+reviewed_by\s+text/i);
  });

  it('is idempotent: IF NOT EXISTS guards all three column adds', () => {
    const guards = SQL.match(/IF\s+NOT\s+EXISTS/gi) ?? [];
    expect(guards.length).toBeGreaterThanOrEqual(3);
  });
});
