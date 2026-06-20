import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(process.cwd(), 'migrations', '0055_communication_webinar_provider_seam.sql'),
  'utf8'
);

describe('migration 0055', () => {
  it('seeds the four webinar permissions', () => {
    for (const code of [
      'webinars.read',
      'webinars.write',
      'webinars.attend',
      'webinars.configure'
    ]) {
      expect(sql).toContain(code);
    }
  });

  it('creates the provider settings table', () => {
    expect(sql).toContain('communication.webinar_provider_settings');
  });

  it('creates the provider_session_id lookup index', () => {
    expect(sql).toContain('provider_session_id');
    expect(sql.toLowerCase()).toContain('create index');
  });
});
