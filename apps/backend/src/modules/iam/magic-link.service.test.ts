import { beforeEach, describe, expect, it } from 'vitest';

import {
  MagicLinkInvalidError,
  MagicLinkService,
  type MagicLinkTokenRecord,
  type MagicLinkTokenRepo,
  type PersistedMagicLinkToken
} from './services/magic-link.service.js';

interface InMemoryMagicLinkTokenRepo extends MagicLinkTokenRepo {
  readonly saved: PersistedMagicLinkToken[];
}

function createInMemoryRepo(): InMemoryMagicLinkTokenRepo {
  const saved: PersistedMagicLinkToken[] = [];
  return {
    saved,
    async save(record: MagicLinkTokenRecord): Promise<void> {
      saved.push({
        ...record,
        id: `m_${saved.length + 1}`,
        consumedAt: null
      });
    },
    async findByHash(tenantId: string, tokenHash: string): Promise<PersistedMagicLinkToken | null> {
      return saved.find((r) => r.tenantId === tenantId && r.tokenHash === tokenHash) ?? null;
    },
    async markConsumed(tenantId: string, id: string, redeemedUserId: string): Promise<void> {
      const record = saved.find((r) => r.id === id && r.tenantId === tenantId);
      if (record) {
        record.consumedAt = new Date();
      }
      // redeemedUserId would be persisted in the DB version; the in-memory
      // repo only tracks consumption for the unit-test assertions below.
      void redeemedUserId;
    }
  };
}

const FIFTEEN_MINUTES = 15 * 60 * 1000;

describe('MagicLinkService.requestLink', () => {
  let repo: InMemoryMagicLinkTokenRepo;
  let service: MagicLinkService;

  beforeEach(() => {
    repo = createInMemoryRepo();
    service = new MagicLinkService(repo, { ttlMs: FIFTEEN_MINUTES });
  });

  it('returns an opaque base64url token and stores only its sha256 hash', async () => {
    const { rawToken } = await service.requestLink({
      tenantId: 't1',
      email: 'user@example.ru'
    });

    expect(rawToken).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(rawToken.length).toBeGreaterThanOrEqual(40);
    expect(repo.saved).toHaveLength(1);
    expect(repo.saved[0].tokenHash).not.toBe(rawToken);
    expect(repo.saved[0].tokenHash).toHaveLength(64); // sha-256 hex
  });

  it('normalizes the email (lowercase, trim) before storing', async () => {
    await service.requestLink({
      tenantId: 't1',
      email: '  User@Example.RU  '
    });

    expect(repo.saved[0].email).toBe('user@example.ru');
  });

  it('records request IP and user-agent when provided', async () => {
    await service.requestLink({
      tenantId: 't1',
      email: 'a@b.ru',
      ip: '1.2.3.4',
      userAgent: 'curl/8.0'
    });

    expect(repo.saved[0].requestIp).toBe('1.2.3.4');
    expect(repo.saved[0].requestUserAgent).toBe('curl/8.0');
  });

  it('sets expiresAt to now + ttlMs (within 1 second)', async () => {
    const before = Date.now();
    await service.requestLink({ tenantId: 't1', email: 'a@b.ru' });
    const after = Date.now();

    const expiresMs = repo.saved[0].expiresAt.getTime();
    expect(expiresMs).toBeGreaterThanOrEqual(before + FIFTEEN_MINUTES);
    expect(expiresMs).toBeLessThanOrEqual(after + FIFTEEN_MINUTES + 100);
  });
});

describe('MagicLinkService.redeemLink', () => {
  let repo: InMemoryMagicLinkTokenRepo;
  let service: MagicLinkService;

  beforeEach(() => {
    repo = createInMemoryRepo();
    service = new MagicLinkService(repo, { ttlMs: FIFTEEN_MINUTES });
  });

  it('returns the original email for a valid token and marks it consumed', async () => {
    const { rawToken } = await service.requestLink({
      tenantId: 't1',
      email: 'user@example.ru'
    });

    const result = await service.redeemLink({
      tenantId: 't1',
      rawToken,
      userId: 'u1',
      ip: '5.6.7.8',
      userAgent: 'browser'
    });

    expect(result.email).toBe('user@example.ru');
    expect(repo.saved[0].consumedAt).not.toBeNull();
  });

  it('rejects an unknown token with reason="unknown"', async () => {
    await expect(
      service.redeemLink({
        tenantId: 't1',
        rawToken: 'totally-not-a-real-token-xxx',
        userId: 'u1'
      })
    ).rejects.toMatchObject({
      name: 'MagicLinkInvalidError',
      reason: 'unknown'
    });
  });

  it('rejects an already-consumed token with reason="consumed"', async () => {
    const { rawToken } = await service.requestLink({
      tenantId: 't1',
      email: 'a@b.ru'
    });
    await service.redeemLink({ tenantId: 't1', rawToken, userId: 'u1' });

    await expect(
      service.redeemLink({ tenantId: 't1', rawToken, userId: 'u1' })
    ).rejects.toMatchObject({
      name: 'MagicLinkInvalidError',
      reason: 'consumed'
    });
  });

  it('rejects an expired token with reason="expired"', async () => {
    const expiredService = new MagicLinkService(repo, { ttlMs: -1 });
    const { rawToken } = await expiredService.requestLink({
      tenantId: 't1',
      email: 'a@b.ru'
    });

    await expect(
      expiredService.redeemLink({ tenantId: 't1', rawToken, userId: 'u1' })
    ).rejects.toMatchObject({
      name: 'MagicLinkInvalidError',
      reason: 'expired'
    });
  });

  it('is tenant-scoped: a token from one tenant cannot be redeemed in another', async () => {
    const { rawToken } = await service.requestLink({
      tenantId: 'tenant-a',
      email: 'a@b.ru'
    });

    await expect(
      service.redeemLink({
        tenantId: 'tenant-b',
        rawToken,
        userId: 'u1'
      })
    ).rejects.toMatchObject({
      name: 'MagicLinkInvalidError',
      reason: 'unknown'
    });
  });
});

describe('MagicLinkService.peekEmail', () => {
  let repo: InMemoryMagicLinkTokenRepo;
  let service: MagicLinkService;

  beforeEach(() => {
    repo = createInMemoryRepo();
    service = new MagicLinkService(repo, { ttlMs: FIFTEEN_MINUTES });
  });

  it('returns the email for a valid token without consuming it', async () => {
    const { rawToken } = await service.requestLink({
      tenantId: 't1',
      email: 'peek@example.ru'
    });

    const result = await service.peekEmail({ tenantId: 't1', rawToken });

    expect(result.email).toBe('peek@example.ru');
    expect(repo.saved[0].consumedAt).toBeNull(); // not consumed
  });

  it('throws MagicLinkInvalidError for an unknown token', async () => {
    await expect(service.peekEmail({ tenantId: 't1', rawToken: 'fake' })).rejects.toBeInstanceOf(
      MagicLinkInvalidError
    );
  });
});
