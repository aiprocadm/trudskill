import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const SQL = readFileSync(
  join(__dirname, '../../../migrations/0036_learners_personal_data.sql'),
  'utf-8'
);

describe('migration 0036 — learners personal data (Plan C §5.11)', () => {
  it('targets learning.learners table', () => {
    // Corrected 2026-06-20 (Issue 4): the learners table lives in the learning
    // schema; the old assertion codified the mvp.learners bug (there is no mvp
    // schema), which only surfaced when applying the full chain to a fresh DB.
    expect(SQL).toMatch(/ALTER\s+TABLE\s+learning\.learners/i);
  });

  it('adds snils, middle_name, position columns', () => {
    for (const col of ['snils', 'middle_name', 'position']) {
      expect(SQL).toMatch(
        new RegExp(`ADD\\s+COLUMN\\s+IF\\s+NOT\\s+EXISTS\\s+${col}\\s+text`, 'i')
      );
    }
  });
});
