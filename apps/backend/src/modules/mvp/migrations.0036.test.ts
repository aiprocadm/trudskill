import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const SQL = readFileSync(
  join(__dirname, '../../../migrations/0036_learners_personal_data.sql'),
  'utf-8'
);

describe('migration 0036 — learners personal data (Plan C §5.11)', () => {
  it('targets mvp.learners table', () => {
    expect(SQL).toMatch(/ALTER\s+TABLE\s+mvp\.learners/i);
  });

  it('adds snils, middle_name, position columns', () => {
    for (const col of ['snils', 'middle_name', 'position']) {
      expect(SQL).toMatch(
        new RegExp(`ADD\\s+COLUMN\\s+IF\\s+NOT\\s+EXISTS\\s+${col}\\s+text`, 'i')
      );
    }
  });
});
