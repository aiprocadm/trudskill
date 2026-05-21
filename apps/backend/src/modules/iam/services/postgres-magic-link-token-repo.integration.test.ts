import { afterAll, describe, expect, it } from 'vitest';

import { PostgresMagicLinkTokenRepo } from './postgres-magic-link-token-repo.js';
import { stopTestDb, withTestDb } from '../../../testing/with-test-db.js';

import type { DatabaseService } from '../../../infrastructure/database/database.service.js';

afterAll(async () => {
  await stopTestDb();
}, 60_000);

const MAGIC_LINK_TEST_DB = { migrations: ['0028_iam_magic_link_tokens.sql'] };

const SIXTY_FOUR_HEX_A = 'a'.repeat(64);
const SIXTY_FOUR_HEX_B = 'b'.repeat(64);
const SIXTY_FOUR_HEX_C = 'c'.repeat(64);

function inOneMinute(): Date {
  return new Date(Date.now() + 60_000);
}

describe('PostgresMagicLinkTokenRepo', () => {
  it('saves a token and finds it by tenant + hash', async () => {
    await withTestDb(MAGIC_LINK_TEST_DB, async (db) => {
      const repo = new PostgresMagicLinkTokenRepo(db as DatabaseService);
      await repo.save({
        tenantId: 'tenant_demo',
        email: 'user@example.ru',
        tokenHash: SIXTY_FOUR_HEX_A,
        expiresAt: inOneMinute(),
        requestIp: '127.0.0.1',
        requestUserAgent: 'vitest'
      });

      const found = await repo.findByHash('tenant_demo', SIXTY_FOUR_HEX_A);

      expect(found).not.toBeNull();
      expect(found?.email).toBe('user@example.ru');
      expect(found?.tokenHash).toBe(SIXTY_FOUR_HEX_A);
      expect(found?.consumedAt).toBeNull();
      expect(found?.id).toMatch(/.+/);
    });
  });

  it('returns null when token not found in tenant', async () => {
    await withTestDb(MAGIC_LINK_TEST_DB, async (db) => {
      const repo = new PostgresMagicLinkTokenRepo(db as DatabaseService);
      const found = await repo.findByHash('tenant_demo', SIXTY_FOUR_HEX_A);
      expect(found).toBeNull();
    });
  });

  it('does not leak tokens across tenants', async () => {
    await withTestDb(MAGIC_LINK_TEST_DB, async (db) => {
      const repo = new PostgresMagicLinkTokenRepo(db as DatabaseService);
      await repo.save({
        tenantId: 'tenant_alpha',
        email: 'a@x.ru',
        tokenHash: SIXTY_FOUR_HEX_B,
        expiresAt: inOneMinute()
      });

      const fromOtherTenant = await repo.findByHash('tenant_beta', SIXTY_FOUR_HEX_B);
      expect(fromOtherTenant).toBeNull();

      const fromOwnTenant = await repo.findByHash('tenant_alpha', SIXTY_FOUR_HEX_B);
      expect(fromOwnTenant?.email).toBe('a@x.ru');
    });
  });

  it('marks a token consumed and records redeem metadata', async () => {
    await withTestDb(MAGIC_LINK_TEST_DB, async (db) => {
      const repo = new PostgresMagicLinkTokenRepo(db as DatabaseService);
      await repo.save({
        tenantId: 'tenant_demo',
        email: 'consumer@x.ru',
        tokenHash: SIXTY_FOUR_HEX_C,
        expiresAt: inOneMinute()
      });
      const saved = await repo.findByHash('tenant_demo', SIXTY_FOUR_HEX_C);
      expect(saved).not.toBeNull();

      await repo.markConsumed('tenant_demo', saved!.id, 'u_consumer_1', '10.0.0.1', 'redeem-ua');

      const reloaded = await repo.findByHash('tenant_demo', SIXTY_FOUR_HEX_C);
      expect(reloaded?.consumedAt).not.toBeNull();
    });
  });

  it('markConsumed is idempotent: second call leaves the original consumed_at intact', async () => {
    await withTestDb(MAGIC_LINK_TEST_DB, async (db) => {
      const repo = new PostgresMagicLinkTokenRepo(db as DatabaseService);
      await repo.save({
        tenantId: 'tenant_demo',
        email: 'idem@x.ru',
        tokenHash: SIXTY_FOUR_HEX_A,
        expiresAt: inOneMinute()
      });
      const saved = await repo.findByHash('tenant_demo', SIXTY_FOUR_HEX_A);

      await repo.markConsumed('tenant_demo', saved!.id, 'u_first', '1.1.1.1', 'first-ua');
      const afterFirst = await repo.findByHash('tenant_demo', SIXTY_FOUR_HEX_A);
      const firstConsumedAt = afterFirst!.consumedAt!;

      await repo.markConsumed('tenant_demo', saved!.id, 'u_second', '2.2.2.2', 'second-ua');
      const afterSecond = await repo.findByHash('tenant_demo', SIXTY_FOUR_HEX_A);

      expect(afterSecond?.consumedAt?.getTime()).toBe(firstConsumedAt.getTime());
    });
  });

  it('markConsumed does not affect tokens of another tenant with same id', async () => {
    await withTestDb(MAGIC_LINK_TEST_DB, async (db) => {
      const repo = new PostgresMagicLinkTokenRepo(db as DatabaseService);
      await repo.save({
        tenantId: 'tenant_alpha',
        email: 'cross@x.ru',
        tokenHash: SIXTY_FOUR_HEX_B,
        expiresAt: inOneMinute()
      });
      const saved = await repo.findByHash('tenant_alpha', SIXTY_FOUR_HEX_B);

      await repo.markConsumed('tenant_beta', saved!.id, 'u_evil', '6.6.6.6', 'evil-ua');

      const reloaded = await repo.findByHash('tenant_alpha', SIXTY_FOUR_HEX_B);
      expect(reloaded?.consumedAt).toBeNull();
    });
  });

  it('preserves expiresAt as Date', async () => {
    await withTestDb(MAGIC_LINK_TEST_DB, async (db) => {
      const repo = new PostgresMagicLinkTokenRepo(db as DatabaseService);
      const expiresAt = new Date('2030-01-01T12:00:00.000Z');
      await repo.save({
        tenantId: 'tenant_demo',
        email: 'date@x.ru',
        tokenHash: SIXTY_FOUR_HEX_C,
        expiresAt
      });
      const found = await repo.findByHash('tenant_demo', SIXTY_FOUR_HEX_C);
      expect(found?.expiresAt).toBeInstanceOf(Date);
      expect(found?.expiresAt.toISOString()).toBe('2030-01-01T12:00:00.000Z');
    });
  });
});
