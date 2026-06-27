import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const SQL = readFileSync(
  join(__dirname, '../../../migrations/0058_payments_widen_provider_check.sql'),
  'utf-8'
);

describe('migration 0058 — widen payments.payments.provider CHECK', () => {
  it('allows all four shipped acquirer codes from the provider registry', () => {
    // 0054 only allowed manual/noop/fake/yookassa, so tinkoff/cloudpayments/robokassa
    // payments violated the CHECK on real Postgres (in-memory repo has no CHECK → latent).
    for (const code of ['yookassa', 'tinkoff', 'cloudpayments', 'robokassa']) {
      expect(SQL).toContain(`'${code}'`);
    }
  });

  it('keeps the legacy non-acquirer codes', () => {
    for (const code of ['manual', 'noop', 'fake']) {
      expect(SQL).toContain(`'${code}'`);
    }
  });

  it('drops the prior provider constraint before adding the widened one (idempotent)', () => {
    expect(SQL.toLowerCase()).toMatch(/drop constraint/);
    expect(SQL.toLowerCase()).toMatch(/add constraint .*check/s);
  });
});
