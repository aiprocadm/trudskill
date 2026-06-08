import { describe, expect, it, vi } from 'vitest';

import {
  LEAKED_SEED_PASSWORD_HASH,
  neutralizeLeakedSeedCredentials
} from './seed-credential-hygiene.service.js';

const makeDb = (rowCount: number) => ({
  query: vi.fn().mockResolvedValue({ rowCount, rows: [] })
});

describe('neutralizeLeakedSeedCredentials', () => {
  it('updates only rows whose password_hash is the leaked seed hash, to an unusable value', async () => {
    const db = makeDb(3);
    const count = await neutralizeLeakedSeedCredentials(db as never);

    expect(count).toBe(3);
    expect(db.query).toHaveBeenCalledTimes(1);
    const [sql, params] = db.query.mock.calls[0]!;
    expect(sql).toMatch(/update\s+iam\.users/i);
    expect(sql).toMatch(/where\s+password_hash\s*=/i);
    expect(params[1]).toBe(LEAKED_SEED_PASSWORD_HASH);
    expect(String(params[0])).toMatch(/^disabled:/);
    expect(String(params[0])).not.toMatch(/^[a-f0-9]{64}$/i);
    expect(String(params[0])).not.toContain('$');
  });

  it('is idempotent: a second run finds nothing to update', async () => {
    const db = makeDb(0);
    const count = await neutralizeLeakedSeedCredentials(db as never);
    expect(count).toBe(0);
  });
});
