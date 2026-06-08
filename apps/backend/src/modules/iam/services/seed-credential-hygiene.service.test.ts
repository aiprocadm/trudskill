import { describe, expect, it, vi } from 'vitest';

import {
  LEAKED_SEED_PASSWORD_HASH,
  SeedCredentialHygiene,
  neutralizeLeakedSeedCredentials
} from './seed-credential-hygiene.service.js';

const makeDb = (rows: unknown[]) => ({
  query: vi.fn().mockResolvedValue(rows)
});

describe('neutralizeLeakedSeedCredentials', () => {
  it('updates only rows whose password_hash is the leaked seed hash, to an unusable value', async () => {
    const db = makeDb([{ id: 'u_tenant_admin' }, { id: 'u_manager' }, { id: 'u_methodist' }]);
    const count = await neutralizeLeakedSeedCredentials(db as never);

    expect(count).toBe(3);
    expect(db.query).toHaveBeenCalledTimes(1);
    const [sql, params] = db.query.mock.calls[0]!;
    expect(sql).toMatch(/update\s+iam\.users/i);
    expect(sql).toMatch(/where\s+password_hash\s*=/i);
    expect(sql).toMatch(/returning\s+id/i);
    expect(params[1]).toBe(LEAKED_SEED_PASSWORD_HASH);
    expect(String(params[0])).toMatch(/^disabled:/);
    // replacement must NOT be 64-hex and must NOT contain '$' (so verifyPassword rejects it)
    expect(String(params[0])).not.toMatch(/^[a-f0-9]{64}$/i);
    expect(String(params[0])).not.toContain('$');
  });

  it('is idempotent: a second run finds nothing to update', async () => {
    const db = makeDb([]);
    const count = await neutralizeLeakedSeedCredentials(db as never);
    expect(count).toBe(0);
  });
});

describe('SeedCredentialHygiene.onApplicationBootstrap', () => {
  it('is a no-op outside production (does not touch the DB)', async () => {
    const db = { query: vi.fn() };
    const hygiene = new SeedCredentialHygiene(db as never);
    await hygiene.onApplicationBootstrap();
    expect(db.query).not.toHaveBeenCalled(); // NODE_ENV is not 'production' in the test env
  });
});
