# Magic Link Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add passwordless email-link authentication (magic link) as a new auth method alongside the existing email/password login.

**Architecture:** Magic link is a SEPARATE flow in the existing IAM module. New endpoints `POST /auth/magic-link/request` (issue link) and `POST /auth/magic-link/redeem` (login). Token is generated cryptographically random, only its SHA-256 hash is stored. After redemption, the existing session/refresh/CSRF mechanism is reused — magic link is only an alternative way to obtain a session, not a new session model.

**Tech Stack:** NestJS, TypeScript, PostgreSQL (with `iam` schema), Vitest, the existing crypto utilities in `apps/backend/src/modules/iam/crypto.util.ts`.

**Scope:** This plan covers ONLY the magic link feature. Other Phase 1 features (dashboard, course viewer, document generation) will have their own plans.

**Спецификация:** [../specs/2026-05-21-cdoprof-redesign-design.md](../specs/2026-05-21-cdoprof-redesign-design.md) §4.1

**Роадмап:** [2026-05-21-cdoprof-v1-roadmap.md](2026-05-21-cdoprof-v1-roadmap.md) Phase 1

---

## File Structure

### Create

- `apps/backend/migrations/0028_iam_magic_link_tokens.sql` — DB table
- `apps/backend/src/modules/iam/services/magic-link.service.ts` — business logic
- `apps/backend/src/modules/iam/services/magic-link.service.test.ts` — unit tests
- `apps/backend/src/modules/iam/dto/magic-link.dto.ts` — DTOs (request, redeem)
- `apps/backend/src/modules/iam/magic-link.integration.test.ts` — HTTP integration test
- `apps/frontend/app/login/magic-link/[token]/page.tsx` — landing page
- `apps/frontend/src/features/auth/magic-link.ts` — frontend API client

### Modify

- `apps/backend/src/modules/iam/auth.controller.ts` — add 2 endpoints (`request`, `redeem`)
- `apps/backend/src/modules/iam/iam.module.ts` — register MagicLinkService
- `apps/backend/src/modules/iam/dto/login.dto.ts` — re-export magic link DTOs (or restructure)
- `apps/frontend/app/login/page.tsx` — add "Magic link" tab/section

---

## Task 1: Database migration for magic_link_tokens

**Files:**

- Create: `apps/backend/migrations/0028_iam_magic_link_tokens.sql`

- [x] **Step 1: Write migration SQL**

```sql
-- migration 0028: magic link tokens for passwordless authentication
-- one-time tokens that expire shortly after creation (~15 minutes)
-- stored as SHA-256 hashes; raw token only exists in the email

create table if not exists iam.magic_link_tokens (
  id text primary key default gen_random_uuid()::text,
  tenant_id text not null,
  email text not null,
  token_hash text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  redeemed_user_id text,
  request_ip text,
  request_user_agent text,
  redeem_ip text,
  redeem_user_agent text
);

create unique index if not exists iam_magic_link_tokens_token_hash_uidx
  on iam.magic_link_tokens (tenant_id, token_hash);

create index if not exists iam_magic_link_tokens_email_idx
  on iam.magic_link_tokens (tenant_id, email, expires_at desc);

create index if not exists iam_magic_link_tokens_cleanup_idx
  on iam.magic_link_tokens (expires_at)
  where consumed_at is null;

comment on table iam.magic_link_tokens is
  'Passwordless authentication tokens. Hash-only storage. 15-min lifetime.';
```

- [x] **Step 2: Verify migration runs**

Run: `pnpm --filter @cdoprof/backend run db:migrate`
Expected: migration 0028 applied without errors.

- [x] **Step 3: Verify table exists**

Run: `psql $DATABASE_URL -c '\d iam.magic_link_tokens'`
Expected: shows 11 columns + 3 indexes.

- [x] **Step 4: Commit**

```bash
git add apps/backend/migrations/0028_iam_magic_link_tokens.sql
git commit -m "feat(iam): add magic_link_tokens table for passwordless auth"
```

---

## Task 2: MagicLinkService (business logic) with unit tests

**Files:**

- Create: `apps/backend/src/modules/iam/services/magic-link.service.ts`
- Create: `apps/backend/src/modules/iam/services/magic-link.service.test.ts`

### Why service before controller

The service contains the testable business logic: token generation, hashing, expiry validation, idempotent redemption. Controller is just HTTP wrapping; integration-tested separately.

- [x] **Step 1: Write failing test for token generation**

```typescript
// apps/backend/src/modules/iam/services/magic-link.service.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { MagicLinkService } from './magic-link.service.js';
import { createMockTokenRepo } from '../testing/magic-link-test-utils.js';

describe('MagicLinkService.requestLink', () => {
  let service: MagicLinkService;
  let repo: ReturnType<typeof createMockTokenRepo>;

  beforeEach(() => {
    repo = createMockTokenRepo();
    service = new MagicLinkService(repo, { ttlMs: 15 * 60 * 1000 });
  });

  it('creates a token with sha256 hash stored, returns raw token', async () => {
    const { rawToken } = await service.requestLink({
      tenantId: 't1',
      email: 'a@b.ru',
      ip: '1.2.3.4',
      userAgent: 'test'
    });
    expect(rawToken).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(repo.saved.length).toBe(1);
    expect(repo.saved[0].tokenHash).not.toBe(rawToken); // never store raw
    expect(repo.saved[0].tokenHash.length).toBe(64); // sha-256 hex
  });
});
```

- [x] **Step 2: Run test to verify it fails (file doesn't exist)**

Run: `pnpm --filter @cdoprof/backend exec vitest run apps/backend/src/modules/iam/services/magic-link.service.test.ts`
Expected: FAIL — `Cannot find module 'magic-link.service'`

- [x] **Step 3: Implement minimal MagicLinkService.requestLink**

```typescript
// apps/backend/src/modules/iam/services/magic-link.service.ts
import { randomBytes, createHash } from 'node:crypto';

export interface MagicLinkTokenRecord {
  tenantId: string;
  email: string;
  tokenHash: string;
  expiresAt: Date;
  requestIp?: string;
  requestUserAgent?: string;
}

export interface MagicLinkTokenRepo {
  save(record: MagicLinkTokenRecord): Promise<void>;
  findByHash(
    tenantId: string,
    tokenHash: string
  ): Promise<(MagicLinkTokenRecord & { id: string; consumedAt: Date | null }) | null>;
  markConsumed(
    tenantId: string,
    id: string,
    redeemedUserId: string,
    ip: string,
    userAgent: string
  ): Promise<void>;
}

export interface RequestLinkInput {
  tenantId: string;
  email: string;
  ip?: string;
  userAgent?: string;
}

export class MagicLinkService {
  constructor(
    private readonly repo: MagicLinkTokenRepo,
    private readonly config: { ttlMs: number }
  ) {}

  async requestLink(input: RequestLinkInput): Promise<{ rawToken: string }> {
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const now = new Date();
    await this.repo.save({
      tenantId: input.tenantId,
      email: input.email.toLowerCase().trim(),
      tokenHash,
      expiresAt: new Date(now.getTime() + this.config.ttlMs),
      requestIp: input.ip,
      requestUserAgent: input.userAgent
    });
    return { rawToken };
  }
}
```

- [x] **Step 4: Create the test util**

```typescript
// apps/backend/src/modules/iam/testing/magic-link-test-utils.ts
import type { MagicLinkTokenRecord, MagicLinkTokenRepo } from '../services/magic-link.service.js';

export const createMockTokenRepo = () => {
  const saved: (MagicLinkTokenRecord & { id: string; consumedAt: Date | null })[] = [];
  const repo: MagicLinkTokenRepo & { saved: typeof saved } = {
    saved,
    async save(rec) {
      saved.push({ ...rec, id: `m_${saved.length + 1}`, consumedAt: null });
    },
    async findByHash(tenantId, tokenHash) {
      return saved.find((r) => r.tenantId === tenantId && r.tokenHash === tokenHash) ?? null;
    },
    async markConsumed(tenantId, id, userId, ip, ua) {
      const rec = saved.find((r) => r.id === id && r.tenantId === tenantId);
      if (rec) rec.consumedAt = new Date();
    }
  };
  return repo;
};
```

- [x] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run apps/backend/src/modules/iam/services/magic-link.service.test.ts`
Expected: PASS

- [x] **Step 6: Add test for redeemLink (happy path)**

```typescript
describe('MagicLinkService.redeemLink', () => {
  it('returns email for a valid token, marks it consumed', async () => {
    const { rawToken } = await service.requestLink({
      tenantId: 't1',
      email: 'user@example.com'
    });
    const result = await service.redeemLink({
      tenantId: 't1',
      rawToken,
      userId: 'u1',
      ip: '1.2.3.4',
      userAgent: 'test'
    });
    expect(result.email).toBe('user@example.com');
    expect(repo.saved[0].consumedAt).not.toBeNull();
  });

  it('rejects expired tokens', async () => {
    const expiredService = new MagicLinkService(repo, { ttlMs: -1 });
    const { rawToken } = await expiredService.requestLink({
      tenantId: 't1',
      email: 'a@b.ru'
    });
    await expect(
      expiredService.redeemLink({
        tenantId: 't1',
        rawToken,
        userId: 'u1'
      })
    ).rejects.toThrow(/expired/i);
  });

  it('rejects already-consumed tokens', async () => {
    const { rawToken } = await service.requestLink({
      tenantId: 't1',
      email: 'a@b.ru'
    });
    await service.redeemLink({ tenantId: 't1', rawToken, userId: 'u1' });
    await expect(
      service.redeemLink({
        tenantId: 't1',
        rawToken,
        userId: 'u1'
      })
    ).rejects.toThrow(/consumed|invalid/i);
  });

  it('rejects unknown tokens', async () => {
    await expect(
      service.redeemLink({
        tenantId: 't1',
        rawToken: 'nonexistent',
        userId: 'u1'
      })
    ).rejects.toThrow(/invalid/i);
  });
});
```

- [x] **Step 7: Run new tests to verify they fail (redeemLink not implemented)**

Run: `pnpm --filter @cdoprof/backend exec vitest run apps/backend/src/modules/iam/services/magic-link.service.test.ts`
Expected: 4 of 5 tests FAIL (only first passes)

- [x] **Step 8: Implement redeemLink in MagicLinkService**

```typescript
// Add to magic-link.service.ts
export interface RedeemLinkInput {
  tenantId: string;
  rawToken: string;
  userId: string;
  ip?: string;
  userAgent?: string;
}

export class MagicLinkService {
  // ... constructor and requestLink as above ...

  async redeemLink(input: RedeemLinkInput): Promise<{ email: string }> {
    const tokenHash = createHash('sha256').update(input.rawToken).digest('hex');
    const record = await this.repo.findByHash(input.tenantId, tokenHash);
    if (!record) {
      throw new Error('Invalid magic link');
    }
    if (record.consumedAt) {
      throw new Error('Magic link already consumed');
    }
    if (record.expiresAt.getTime() < Date.now()) {
      throw new Error('Magic link expired');
    }
    await this.repo.markConsumed(
      input.tenantId,
      record.id,
      input.userId,
      input.ip ?? '',
      input.userAgent ?? ''
    );
    return { email: record.email };
  }
}
```

- [x] **Step 9: Run all tests, verify all pass**

Run: `pnpm --filter @cdoprof/backend exec vitest run apps/backend/src/modules/iam/services/magic-link.service.test.ts`
Expected: All 5 tests PASS.

- [x] **Step 10: Commit**

```bash
git add apps/backend/src/modules/iam/services/magic-link.service.ts \
        apps/backend/src/modules/iam/services/magic-link.service.test.ts \
        apps/backend/src/modules/iam/testing/magic-link-test-utils.ts
git commit -m "feat(iam): add MagicLinkService with request/redeem business logic"
```

---

## Task 3: PostgresMagicLinkTokenRepo (DB layer)

**Files:**

- Create: `apps/backend/src/modules/iam/services/postgres-magic-link-token-repo.ts`
- Create: `apps/backend/src/modules/iam/services/postgres-magic-link-token-repo.integration.test.ts`

- [x] **Step 1: Write failing integration test**

```typescript
// postgres-magic-link-token-repo.integration.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { PostgresMagicLinkTokenRepo } from './postgres-magic-link-token-repo.js';
import { withTestDb } from '../../../testing/with-test-db.js';

describe('PostgresMagicLinkTokenRepo', () => {
  it('saves a token and finds it by hash', async () => {
    await withTestDb(async (db) => {
      const repo = new PostgresMagicLinkTokenRepo(db);
      const expiresAt = new Date(Date.now() + 60_000);
      await repo.save({
        tenantId: 't1',
        email: 'u@x.ru',
        tokenHash: 'a'.repeat(64),
        expiresAt
      });
      const found = await repo.findByHash('t1', 'a'.repeat(64));
      expect(found?.email).toBe('u@x.ru');
      expect(found?.consumedAt).toBeNull();
    });
  });

  it('returns null for non-existent token', async () => {
    await withTestDb(async (db) => {
      const repo = new PostgresMagicLinkTokenRepo(db);
      const found = await repo.findByHash('t1', 'nonexistent');
      expect(found).toBeNull();
    });
  });

  it('marks token consumed', async () => {
    await withTestDb(async (db) => {
      const repo = new PostgresMagicLinkTokenRepo(db);
      await repo.save({
        tenantId: 't1',
        email: 'u@x.ru',
        tokenHash: 'b'.repeat(64),
        expiresAt: new Date(Date.now() + 60_000)
      });
      const saved = await repo.findByHash('t1', 'b'.repeat(64));
      await repo.markConsumed('t1', saved!.id, 'user1', '1.2.3.4', 'browser');
      const reloaded = await repo.findByHash('t1', 'b'.repeat(64));
      expect(reloaded?.consumedAt).not.toBeNull();
    });
  });
});
```

- [x] **Step 2: Run test (expect failure: file doesn't exist)**

Run: `pnpm --filter @cdoprof/backend exec vitest run apps/backend/src/modules/iam/services/postgres-magic-link-token-repo.integration.test.ts`
Expected: FAIL

- [x] **Step 3: Implement Postgres repo using existing DB pattern**

Look at existing patterns: `apps/backend/src/modules/iam/services/postgres-*-repo.ts` (if any) or `apps/backend/src/database/`. Follow the same pattern (likely uses `kysely` or raw `pg`).

```typescript
// postgres-magic-link-token-repo.ts
import type { DbClient } from '../../../database/db-client.js'; // adjust to existing path
import type { MagicLinkTokenRepo, MagicLinkTokenRecord } from './magic-link.service.js';

export class PostgresMagicLinkTokenRepo implements MagicLinkTokenRepo {
  constructor(private readonly db: DbClient) {}

  async save(rec: MagicLinkTokenRecord): Promise<void> {
    await this.db.query(
      `insert into iam.magic_link_tokens
       (tenant_id, email, token_hash, expires_at, request_ip, request_user_agent)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        rec.tenantId,
        rec.email,
        rec.tokenHash,
        rec.expiresAt,
        rec.requestIp ?? null,
        rec.requestUserAgent ?? null
      ]
    );
  }

  async findByHash(tenantId: string, tokenHash: string) {
    const result = await this.db.query(
      `select id, tenant_id, email, token_hash, expires_at, consumed_at
       from iam.magic_link_tokens
       where tenant_id = $1 and token_hash = $2 limit 1`,
      [tenantId, tokenHash]
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      tenantId: row.tenant_id,
      email: row.email,
      tokenHash: row.token_hash,
      expiresAt: new Date(row.expires_at),
      consumedAt: row.consumed_at ? new Date(row.consumed_at) : null
    };
  }

  async markConsumed(tenantId: string, id: string, userId: string, ip: string, userAgent: string) {
    await this.db.query(
      `update iam.magic_link_tokens
       set consumed_at = now(), redeemed_user_id = $3, redeem_ip = $4, redeem_user_agent = $5
       where tenant_id = $1 and id = $2 and consumed_at is null`,
      [tenantId, id, userId, ip, userAgent]
    );
  }
}
```

- [x] **Step 4: Run integration tests**

Run: `pnpm --filter @cdoprof/backend exec vitest run apps/backend/src/modules/iam/services/postgres-magic-link-token-repo.integration.test.ts`
Expected: All 3 tests PASS.

- [x] **Step 5: Commit**

```bash
git add apps/backend/src/modules/iam/services/postgres-magic-link-token-repo.ts \
        apps/backend/src/modules/iam/services/postgres-magic-link-token-repo.integration.test.ts
git commit -m "feat(iam): add Postgres repo for magic_link_tokens"
```

---

## Task 4: DTOs for magic link endpoints

**Files:**

- Create: `apps/backend/src/modules/iam/dto/magic-link.dto.ts`

- [x] **Step 1: Define DTOs with class-validator**

```typescript
// apps/backend/src/modules/iam/dto/magic-link.dto.ts
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class MagicLinkRequestDto {
  @IsEmail()
  @MaxLength(254)
  email!: string;
}

export class MagicLinkRedeemDto {
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token!: string;
}
```

- [x] **Step 2: Verify DTO validation works (add to dto-validation test if pattern exists)**

Look at `apps/backend/src/modules/iam/iam.dto-validation.test.ts` for pattern. Add:

```typescript
describe('MagicLinkRequestDto', () => {
  it('rejects invalid email', async () => {
    const dto = plainToClass(MagicLinkRequestDto, { email: 'not-an-email' });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('accepts valid email', async () => {
    const dto = plainToClass(MagicLinkRequestDto, { email: 'a@b.ru' });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });
});
```

- [x] **Step 3: Run test**

Run: `pnpm --filter @cdoprof/backend exec vitest run apps/backend/src/modules/iam/iam.dto-validation.test.ts`
Expected: PASS.

- [x] **Step 4: Commit**

```bash
git add apps/backend/src/modules/iam/dto/magic-link.dto.ts \
        apps/backend/src/modules/iam/iam.dto-validation.test.ts
git commit -m "feat(iam): add DTOs for magic link request/redeem"
```

---

## Task 5: AuthController endpoints

**Files:**

- Modify: `apps/backend/src/modules/iam/auth.controller.ts`
- Modify: `apps/backend/src/modules/iam/iam.module.ts`

- [x] **Step 1: Register MagicLinkService and repo in IamModule**

Look at `iam.module.ts` for existing providers. Add:

```typescript
// inside @Module providers array
{
  provide: 'MagicLinkTokenRepo',
  useFactory: (db: DbClient) => new PostgresMagicLinkTokenRepo(db),
  inject: ['DbClient']  // adjust to existing injection token
},
{
  provide: MagicLinkService,
  useFactory: (repo: MagicLinkTokenRepo) => new MagicLinkService(repo, { ttlMs: 15 * 60 * 1000 }),
  inject: ['MagicLinkTokenRepo']
}
```

- [x] **Step 2: Add request endpoint to AuthController**

```typescript
// in auth.controller.ts, inject MagicLinkService and EmailSender (see Task 6)

@Post('auth/magic-link/request')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 5, ttl: 60_000 } })  // strict: 5/min per IP
async requestMagicLink(
  @CurrentContext() context: RequestContext,
  @Body() payload: MagicLinkRequestDto,
  @Req() request: Request
): Promise<{ status: 'sent' }> {
  if (!context.tenantId) {
    throw new UnauthorizedException({ code: 'no_tenant', message: 'Tenant not resolved' });
  }
  const { rawToken } = await this.magicLinkService.requestLink({
    tenantId: context.tenantId,
    email: payload.email,
    ip: request.ip,
    userAgent: request.headers['user-agent']
  });
  await this.emailSender.sendMagicLink(payload.email, rawToken);
  // intentionally returns same response whether email exists or not — prevents email enumeration
  return { status: 'sent' };
}
```

- [x] **Step 3: Add redeem endpoint to AuthController**

```typescript
@Post('auth/magic-link/redeem')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 10, ttl: 60_000 } })
async redeemMagicLink(
  @CurrentContext() context: RequestContext,
  @Body() payload: MagicLinkRedeemDto,
  @Req() request: Request,
  @Res({ passthrough: true }) response: Response
) {
  if (!context.tenantId) {
    throw new UnauthorizedException({ code: 'no_tenant', message: 'Tenant not resolved' });
  }

  let email: string;
  try {
    // first verify the token belongs to a valid email
    const tokenInfo = await this.magicLinkService.peekEmail({
      tenantId: context.tenantId,
      rawToken: payload.token
    });
    email = tokenInfo.email;
  } catch (e) {
    throw new UnauthorizedException({ code: 'invalid_magic_link', message: 'Magic link invalid' });
  }

  // find or create user by email (existing flow — likely IamService.findOrCreateByEmail)
  const user = await this.iamService.findOrCreateByEmail(context.tenantId, email);

  // mark token consumed by this user
  await this.magicLinkService.redeemLink({
    tenantId: context.tenantId,
    rawToken: payload.token,
    userId: user.id,
    ip: request.ip,
    userAgent: request.headers['user-agent']
  });

  // issue session tokens the same way as password login
  const tokens = await this.authService.issueSessionForUser(user, context);
  authCookie.attachRefreshAndCsrfCookies(response, tokens.refreshToken, tokens.csrfToken);
  return authCookie.toPublicTokens(tokens);
}
```

> **Note:** `MagicLinkService.peekEmail` is a new helper that returns email without marking consumed — needed to look up/create the user first. Add it to `magic-link.service.ts` and test it in Task 2.

- [x] **Step 4: Add `peekEmail` to MagicLinkService**

```typescript
// in magic-link.service.ts
async peekEmail(input: { tenantId: string; rawToken: string }): Promise<{ email: string }> {
  const tokenHash = createHash('sha256').update(input.rawToken).digest('hex');
  const record = await this.repo.findByHash(input.tenantId, tokenHash);
  if (!record || record.consumedAt || record.expiresAt.getTime() < Date.now()) {
    throw new Error('Invalid magic link');
  }
  return { email: record.email };
}
```

- [x] **Step 5: Add `issueSessionForUser` to AuthService**

This may already exist — look in `auth.service.ts`. If not, extract from `login()` method. Pattern:

```typescript
async issueSessionForUser(user: User, context: RequestContext): Promise<SessionTokens> {
  // ... use existing session-creation logic from `login()` ...
}
```

- [x] **Step 6: Run all IAM tests**

Run: `pnpm --filter @cdoprof/backend exec vitest run apps/backend/src/modules/iam/`
Expected: All existing tests still pass, new tests pass.

- [x] **Step 7: Commit**

```bash
git add apps/backend/src/modules/iam/auth.controller.ts \
        apps/backend/src/modules/iam/iam.module.ts \
        apps/backend/src/modules/iam/services/magic-link.service.ts \
        apps/backend/src/modules/iam/services/magic-link.service.test.ts \
        apps/backend/src/modules/iam/services/auth.service.ts
git commit -m "feat(iam): add magic link request/redeem endpoints"
```

---

## Task 6: Email sender integration

**Files:**

- Check first: search for existing email/notification sender. If exists, extend. If not, create minimal.
- Create or modify: `apps/backend/src/modules/communication/email-sender.service.ts`

> **Note:** A full notification system is Phase 5 deliverable. For Phase 1 magic link, a minimal email-send abstraction is enough. The MVP: log the magic link URL to console in dev, send via SMTP in prod.

- [x] **Step 1: Search for existing email infrastructure**

Run: `grep -r "sendEmail\|nodemailer\|smtp" apps/backend/src/modules/communication/`
Expected: see existing patterns; adapt.

- [x] **Step 2: Add `sendMagicLink` method**

```typescript
// in email-sender.service.ts (or appropriate file)
async sendMagicLink(email: string, rawToken: string): Promise<void> {
  const url = `${process.env.APP_URL}/login/magic-link/${rawToken}`;
  const subject = 'Ссылка для входа в CDOProf';
  const text = `Здравствуйте!\n\nЧтобы войти, перейдите по ссылке (действительна 15 минут):\n${url}\n\nЕсли вы не запрашивали вход, проигнорируйте это письмо.`;
  await this.send({ to: email, subject, text });
}
```

- [x] **Step 3: Add test (use mock for SMTP)**

```typescript
it('sendMagicLink includes the correct URL', async () => {
  const sent: Array<{ to: string; text: string }> = [];
  const sender = new EmailSender({
    send: async (e) => {
      sent.push(e);
    }
  });
  await sender.sendMagicLink('a@b.ru', 'token123');
  expect(sent[0].text).toContain('/login/magic-link/token123');
});
```

- [x] **Step 4: Run test, commit**

```bash
pnpm --filter @cdoprof/backend exec vitest run apps/backend/src/modules/communication/
git add apps/backend/src/modules/communication/email-sender.service.ts \
        apps/backend/src/modules/communication/email-sender.service.test.ts
git commit -m "feat(communication): add sendMagicLink method to email sender"
```

---

## Task 7: HTTP integration test for full flow

**Files:**

- Create: `apps/backend/src/modules/iam/magic-link.integration.test.ts`

- [x] **Step 1: Write integration test**

```typescript
import { describe, it, expect } from 'vitest';
import { withTestHttpApp } from '../../testing/with-test-http-app.js';

describe('Magic link flow (integration)', () => {
  it('full happy path: request → email captured → redeem → session', async () => {
    await withTestHttpApp(async ({ app, emailCapture }) => {
      // Step 1: request link
      const requestRes = await app.inject({
        method: 'POST',
        url: '/auth/magic-link/request',
        headers: { 'x-tenant-id': 'test-tenant' },
        payload: { email: 'newuser@example.ru' }
      });
      expect(requestRes.statusCode).toBe(201);
      expect(JSON.parse(requestRes.body)).toEqual({ status: 'sent' });
      expect(emailCapture.length).toBe(1);

      // Step 2: extract token from email
      const tokenMatch = emailCapture[0].text.match(/magic-link\/([A-Za-z0-9_-]+)/);
      expect(tokenMatch).not.toBeNull();
      const rawToken = tokenMatch![1];

      // Step 3: redeem
      const redeemRes = await app.inject({
        method: 'POST',
        url: '/auth/magic-link/redeem',
        headers: { 'x-tenant-id': 'test-tenant' },
        payload: { token: rawToken }
      });
      expect(redeemRes.statusCode).toBe(201);
      const body = JSON.parse(redeemRes.body);
      expect(body).toHaveProperty('accessToken');
    });
  });

  it('rejects redeem of unknown token', async () => {
    await withTestHttpApp(async ({ app }) => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/magic-link/redeem',
        headers: { 'x-tenant-id': 'test-tenant' },
        payload: { token: 'totally-fake-token-123456' }
      });
      expect(res.statusCode).toBe(401);
    });
  });

  it('does not leak existence of email (always returns "sent")', async () => {
    await withTestHttpApp(async ({ app }) => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/magic-link/request',
        headers: { 'x-tenant-id': 'test-tenant' },
        payload: { email: 'nonexistent@example.ru' }
      });
      expect(res.statusCode).toBe(201);
      expect(JSON.parse(res.body)).toEqual({ status: 'sent' });
    });
  });
});
```

- [x] **Step 2: Run integration test**

Run: `pnpm --filter @cdoprof/backend exec vitest run apps/backend/src/modules/iam/magic-link.integration.test.ts`
Expected: All 3 tests PASS.

- [x] **Step 3: Commit**

```bash
git add apps/backend/src/modules/iam/magic-link.integration.test.ts
git commit -m "test(iam): add HTTP integration tests for magic link flow"
```

---

## Task 8: Frontend — login form with magic link option

**Files:**

- Modify: `apps/frontend/app/login/page.tsx`
- Create: `apps/frontend/src/features/auth/magic-link.ts`

- [x] **Step 1: Create frontend API helper**

```typescript
// apps/frontend/src/features/auth/magic-link.ts
import { apiRequest } from '../../lib/api/client';

export async function requestMagicLink(email: string): Promise<void> {
  await apiRequest('/auth/magic-link/request', {
    method: 'POST',
    body: { email }
  });
}

export async function redeemMagicLink(
  token: string
): Promise<{ accessToken: string; tenantId: string }> {
  return apiRequest('/auth/magic-link/redeem', {
    method: 'POST',
    body: { token }
  });
}
```

- [x] **Step 2: Modify login page to show magic link option**

Look at existing `app/login/page.tsx`. Add a "Login with magic link" button that, when clicked, shows email field + submit. On submit:

- Show "Check your email" state.
- Disable form to prevent spam.

```tsx
// rough sketch — adapt to existing style/components
function MagicLinkForm() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setState('sending');
    try {
      await requestMagicLink(email);
      setState('sent');
    } catch (err) {
      // show error
      setState('idle');
    }
  };
  if (state === 'sent') {
    return <div>Проверьте почту {email}. Ссылка действительна 15 минут.</div>;
  }
  return (
    <form onSubmit={onSubmit}>
      <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      <button type="submit" disabled={state === 'sending'}>
        Отправить ссылку
      </button>
    </form>
  );
}
```

- [x] **Step 3: Commit**

```bash
git add apps/frontend/app/login/page.tsx \
        apps/frontend/src/features/auth/magic-link.ts
git commit -m "feat(frontend): add magic link option to login page"
```

---

## Task 9: Frontend — magic link redemption page

**Files:**

- Create: `apps/frontend/app/login/magic-link/[token]/page.tsx`

- [x] **Step 1: Create redemption page**

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { redeemMagicLink } from '../../../../src/features/auth/magic-link';

export default function MagicLinkRedeemPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    redeemMagicLink(token)
      .then(() => {
        if (mounted) router.replace('/learner');
      })
      .catch((err) => {
        if (mounted) setError(err.message || 'Ссылка недействительна или истекла');
      });
    return () => {
      mounted = false;
    };
  }, [token, router]);

  if (error) {
    return (
      <div>
        <h2>Не получилось войти</h2>
        <p>{error}</p>
        <a href="/login">Запросить новую ссылку</a>
      </div>
    );
  }
  return <div>Вход…</div>;
}
```

- [x] **Step 2: Manual smoke test**

Run dev server: `pnpm --filter @cdoprof/frontend run dev`

- Open `/login`
- Click "Magic link"
- Enter email
- Submit
- Find logged URL in backend console (dev mode logs the magic link URL)
- Open URL — should redirect to `/learner`

- [x] **Step 3: Commit**

```bash
git add apps/frontend/app/login/magic-link/[token]/page.tsx
git commit -m "feat(frontend): add magic link redemption page"
```

---

## Definition of Done for magic link feature

- [x] All 9 tasks committed.
- [x] All tests pass: `pnpm --filter @cdoprof/backend exec vitest run apps/backend/src/modules/iam/`
- [x] Manual smoke test: full flow from `/login` → email → click URL → land on `/learner`.
- [x] CI green: `pnpm -s ci:check`
- [x] No email enumeration: requesting magic link for unknown email returns same response as known email.
- [x] Tokens expire after 15 min, single-use.

---

## What's NOT in this plan (subsequent Phase 1 work)

- Student dashboard with "Next step" card → separate plan
- Course viewer with video player → separate plan
- Document generation → separate plan
- Logging and metrics → covered by existing infrastructure, integrate per existing patterns
- Production email provider integration (SMTP / SendGrid / etc.) → Phase 5 (Notifications)
