# Production Auth Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the pilot's login actually work and be safe: deliver magic-link by email (A), and automatically neutralize the leaked dev seed password in production while keeping password login enabled (B).

**Architecture:** A — a new `EmailMagicLinkEmailSender` (implements the existing `MagicLinkEmailSender`) sends via the existing `MailerService`/`SmtpMailer`; a small pure factory selects it vs the log-only sender by `NOTIFICATIONS_EMAIL_ENABLED`. B — a pure `neutralizeLeakedSeedCredentials(db)` rotates any `iam.users.password_hash` equal to the known leaked seed hash to an unusable value, invoked from a `SeedCredentialHygiene` provider's `onApplicationBootstrap` ONLY when `NODE_ENV=production` (so dev/tests keep logging in with `Password123!`).

**Tech Stack:** NestJS (providers, `OnApplicationBootstrap`), Vitest, `DatabaseService.query`, existing IAM crypto + mailer infra.

Spec: [docs/superpowers/specs/2026-06-08-production-auth-readiness-design.md](../specs/2026-06-08-production-auth-readiness-design.md).

---

> **Conventions.** Branch `feat/2026-06-08-production-auth-readiness` (spec committed as `faaef0d`). End each commit message with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Run tests with the Bash tool, isolated, `--no-file-parallelism` (Cyrillic-path gotcha, CLAUDE.md). Conventional Commits + pre-commit ESLint/Prettier enforced; never `--no-verify`.
>
> **Run a single backend test file:** `pnpm --filter @cdoprof/backend exec vitest run <path> --no-file-parallelism`

## File Structure

| File                                                                                     | Responsibility                                                           | Task |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---- |
| `apps/backend/src/modules/iam/services/email-magic-link-email-sender.ts` (create)        | `EmailMagicLinkEmailSender` — send magic-link via `MailerService`        | 1    |
| `apps/backend/src/modules/iam/services/email-magic-link-email-sender.test.ts` (create)   | unit test for the sender                                                 | 1    |
| `apps/backend/src/modules/iam/services/magic-link-email-sender.factory.ts` (create)      | pure `createMagicLinkEmailSender(env, mailerFactory)` selector           | 2    |
| `apps/backend/src/modules/iam/services/magic-link-email-sender.factory.test.ts` (create) | unit test for selection by flag                                          | 2    |
| `apps/backend/src/modules/iam/iam.module.ts` (modify)                                    | wire the factory into `MAGIC_LINK_EMAIL_SENDER`                          | 2    |
| `apps/backend/src/modules/iam/services/seed-credential-hygiene.service.ts` (create)      | `neutralizeLeakedSeedCredentials(db)` + `SeedCredentialHygiene` provider | 3    |
| `apps/backend/src/modules/iam/services/seed-credential-hygiene.service.test.ts` (create) | unit test (mocked DB): prod neutralizes, non-prod no-op, idempotent      | 3    |
| `apps/backend/src/modules/iam/iam.module.ts` (modify)                                    | register `SeedCredentialHygiene` provider                                | 4    |

---

### Task 1: EmailMagicLinkEmailSender

**Files:**

- Create: `apps/backend/src/modules/iam/services/email-magic-link-email-sender.ts`
- Test: `apps/backend/src/modules/iam/services/email-magic-link-email-sender.test.ts`

- [x] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest';

import { EmailMagicLinkEmailSender } from './email-magic-link-email-sender.js';

import type { MailerService, SendResult } from '../../../infrastructure/mailer/mailer.service.js';

const makeMailer = (result: SendResult): MailerService & { send: ReturnType<typeof vi.fn> } => ({
  send: vi.fn().mockResolvedValue(result)
});

describe('EmailMagicLinkEmailSender', () => {
  it('sends the magic-link URL to the email via the mailer', async () => {
    const mailer = makeMailer({ status: 'sent' });
    const sender = new EmailMagicLinkEmailSender(mailer);

    await sender.sendMagicLink({ email: 'user@example.ru', rawToken: 'tok-123' });

    expect(mailer.send).toHaveBeenCalledTimes(1);
    const msg = mailer.send.mock.calls[0]![0];
    expect(msg.to).toBe('user@example.ru');
    expect(msg.templateKey).toBe('magic_link');
    expect(msg.subject).toContain('CDOProf');
    expect(msg.body).toContain('/login/magic-link/tok-123');
  });

  it('throws when the mailer reports failure (do not pretend the email was sent)', async () => {
    const sender = new EmailMagicLinkEmailSender(
      makeMailer({ status: 'failed', error: 'smtp down' })
    );
    await expect(sender.sendMagicLink({ email: 'u@e.ru', rawToken: 't' })).rejects.toThrow();
  });

  it('does not throw when the mailer is a noop (email disabled)', async () => {
    const sender = new EmailMagicLinkEmailSender(makeMailer({ status: 'skipped_noop' }));
    await expect(sender.sendMagicLink({ email: 'u@e.ru', rawToken: 't' })).resolves.toBeUndefined();
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/iam/services/email-magic-link-email-sender.test.ts --no-file-parallelism`
Expected: FAIL (module `./email-magic-link-email-sender.js` not found).

- [x] **Step 3: Implement**

```ts
import { type MailerService } from '../../../infrastructure/mailer/mailer.service.js';
import {
  type MagicLinkEmailSender,
  type SendMagicLinkInput,
  buildMagicLinkUrl
} from './magic-link-email-sender.js';

/**
 * Production magic-link delivery: emails the login link via the shared MailerService.
 * Selected over LoggingMagicLinkEmailSender when NOTIFICATIONS_EMAIL_ENABLED=true (see factory).
 */
export class EmailMagicLinkEmailSender implements MagicLinkEmailSender {
  constructor(private readonly mailer: MailerService) {}

  async sendMagicLink(input: SendMagicLinkInput): Promise<void> {
    const url = buildMagicLinkUrl(input.rawToken);
    const body = [
      'Здравствуйте!',
      '',
      'Чтобы войти в CDOProf, перейдите по ссылке (действует 15 минут):',
      url,
      '',
      'Если вы не запрашивали вход, просто проигнорируйте это письмо.'
    ].join('\n');

    const result = await this.mailer.send({
      to: input.email,
      subject: 'Вход в CDOProf',
      body,
      templateKey: 'magic_link'
    });

    if (result.status === 'failed') {
      throw new Error(`magic_link email delivery failed: ${result.error ?? 'unknown error'}`);
    }
  }
}
```

- [x] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/iam/services/email-magic-link-email-sender.test.ts --no-file-parallelism`
Expected: PASS (3 tests).

- [x] **Step 5: Commit**

```bash
git add apps/backend/src/modules/iam/services/email-magic-link-email-sender.ts apps/backend/src/modules/iam/services/email-magic-link-email-sender.test.ts
git commit -m "feat(iam): EmailMagicLinkEmailSender (deliver magic-link via mailer)"
```

---

### Task 2: Sender factory + iam.module wiring

**Files:**

- Create: `apps/backend/src/modules/iam/services/magic-link-email-sender.factory.ts`
- Test: `apps/backend/src/modules/iam/services/magic-link-email-sender.factory.test.ts`
- Modify: `apps/backend/src/modules/iam/iam.module.ts`

- [x] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest';

import { EmailMagicLinkEmailSender } from './email-magic-link-email-sender.js';
import { createMagicLinkEmailSender } from './magic-link-email-sender.factory.js';
import { LoggingMagicLinkEmailSender } from './magic-link-email-sender.js';

import type { MailerService } from '../../../infrastructure/mailer/mailer.service.js';

const fakeMailer: MailerService = { send: vi.fn().mockResolvedValue({ status: 'sent' }) };

describe('createMagicLinkEmailSender', () => {
  it('returns the email sender when notifications email is enabled', () => {
    const sender = createMagicLinkEmailSender(
      { NOTIFICATIONS_EMAIL_ENABLED: true },
      () => fakeMailer
    );
    expect(sender).toBeInstanceOf(EmailMagicLinkEmailSender);
  });

  it('returns the log-only sender when notifications email is disabled', () => {
    const mailerFactory = vi.fn(() => fakeMailer);
    const sender = createMagicLinkEmailSender(
      { NOTIFICATIONS_EMAIL_ENABLED: false },
      mailerFactory
    );
    expect(sender).toBeInstanceOf(LoggingMagicLinkEmailSender);
    expect(mailerFactory).not.toHaveBeenCalled();
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/iam/services/magic-link-email-sender.factory.test.ts --no-file-parallelism`
Expected: FAIL (factory module not found).

- [x] **Step 3: Implement the factory**

```ts
import { EmailMagicLinkEmailSender } from './email-magic-link-email-sender.js';
import {
  LoggingMagicLinkEmailSender,
  type MagicLinkEmailSender
} from './magic-link-email-sender.js';

import type { MailerService } from '../../../infrastructure/mailer/mailer.service.js';

/** Selects the magic-link delivery strategy. Mirrors communication.module's MAILER factory. */
export function createMagicLinkEmailSender(
  env: { NOTIFICATIONS_EMAIL_ENABLED: boolean },
  mailerFactory: () => MailerService
): MagicLinkEmailSender {
  return env.NOTIFICATIONS_EMAIL_ENABLED
    ? new EmailMagicLinkEmailSender(mailerFactory())
    : new LoggingMagicLinkEmailSender();
}
```

- [x] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/iam/services/magic-link-email-sender.factory.test.ts --no-file-parallelism`
Expected: PASS (2 tests).

- [x] **Step 5: Wire the factory into iam.module.ts**

In `apps/backend/src/modules/iam/iam.module.ts`, replace the `MAGIC_LINK_EMAIL_SENDER` provider (currently `{ provide: MAGIC_LINK_EMAIL_SENDER, useClass: LoggingMagicLinkEmailSender }`) with:

```ts
  {
    provide: MAGIC_LINK_EMAIL_SENDER,
    useFactory: () =>
      createMagicLinkEmailSender(backendEnv, () => buildSmtpMailer())
  },
```

Add these imports at the top of the file:

```ts
import { backendEnv } from '../../env.js';
import { SmtpMailer } from '../../infrastructure/mailer/smtp-mailer.service.js';
import { createMagicLinkEmailSender } from './services/magic-link-email-sender.factory.js';
```

And this local helper above the providers array (mirrors `communication.module.ts:54-60` so SMTP construction stays consistent):

```ts
function buildSmtpMailer(): SmtpMailer {
  return new SmtpMailer({
    host: backendEnv.SMTP_HOST ?? '',
    port: backendEnv.SMTP_PORT,
    from: backendEnv.SMTP_FROM,
    ...(backendEnv.SMTP_USER ? { user: backendEnv.SMTP_USER } : {}),
    ...(backendEnv.SMTP_PASSWORD ? { password: backendEnv.SMTP_PASSWORD } : {})
  });
}
```

Keep the existing `LoggingMagicLinkEmailSender` import (still used by the factory).

- [x] **Step 6: Verify the backend still typechecks and the IAM auth tests pass**

Run:

```bash
pnpm --filter @cdoprof/backend exec tsc -p tsconfig.json --noEmit
pnpm --filter @cdoprof/backend exec vitest run src/modules/iam/auth.security.test.ts src/modules/iam/services/magic-link-email-sender.factory.test.ts --no-file-parallelism
```

Expected: tsc clean; tests pass. (If `auth.security.test.ts` does not exist, run `src/modules/iam/auth.service.test.ts` instead.)

- [x] **Step 7: Commit**

```bash
git add apps/backend/src/modules/iam/services/magic-link-email-sender.factory.ts apps/backend/src/modules/iam/services/magic-link-email-sender.factory.test.ts apps/backend/src/modules/iam/iam.module.ts
git commit -m "feat(iam): select magic-link sender by NOTIFICATIONS_EMAIL_ENABLED"
```

---

### Task 3: SeedCredentialHygiene (neutralize leaked seed password)

**Files:**

- Create: `apps/backend/src/modules/iam/services/seed-credential-hygiene.service.ts`
- Test: `apps/backend/src/modules/iam/services/seed-credential-hygiene.service.test.ts`

Background: `crypto.util.ts` `verifyPassword` accepts a hash only if it is scrypt-format (`$`-separated) or exactly 64 lowercase hex (legacy sha256). A value like `disabled:<hex>` is neither → rejected. The leaked seed hash is `d845591b855ba5b9a20db65eee522f76ed85858551b8f813ef146725e1a59264` (= `sha256("pwd:Password123!")`, migration 0010).

- [x] **Step 1: Write the failing test**

```ts
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
    // param 2 is the leaked hash we target; param 1 is the replacement
    expect(params[1]).toBe(LEAKED_SEED_PASSWORD_HASH);
    expect(String(params[0])).toMatch(/^disabled:/);
    // replacement must NOT be 64-hex and must NOT contain '$' (so verifyPassword rejects it)
    expect(String(params[0])).not.toMatch(/^[a-f0-9]{64}$/i);
    expect(String(params[0])).not.toContain('$');
  });

  it('is idempotent: a second run finds nothing to update', async () => {
    const db = makeDb(0);
    const count = await neutralizeLeakedSeedCredentials(db as never);
    expect(count).toBe(0);
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/iam/services/seed-credential-hygiene.service.test.ts --no-file-parallelism`
Expected: FAIL (module not found).

- [x] **Step 3: Implement**

```ts
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

import { backendEnv } from '../../../env.js';
import { DatabaseService } from '../../../infrastructure/database/database.service.js';

/**
 * Publicly-known dev seed password hash (= sha256("pwd:Password123!"), migration 0010).
 * Any account still carrying it can be logged into with `Password123!`.
 */
export const LEAKED_SEED_PASSWORD_HASH =
  'd845591b855ba5b9a20db65eee522f76ed85858551b8f813ef146725e1a59264';

/**
 * Rotates every iam.users row whose password_hash is the leaked seed hash to an unusable
 * value (`disabled:<random hex>` — neither scrypt nor 64-hex, so verifyPassword always
 * rejects it). Targeted at the exact leaked hash, so real passwords are untouched.
 * Returns the number of rows neutralized. Idempotent (the WHERE no longer matches after).
 */
export async function neutralizeLeakedSeedCredentials(db: DatabaseService): Promise<number> {
  const replacement = `disabled:${randomBytes(32).toString('hex')}`;
  const result = await db.query(
    'update iam.users set password_hash = $1, updated_at = now() where password_hash = $2',
    [replacement, LEAKED_SEED_PASSWORD_HASH]
  );
  return result.rowCount ?? 0;
}

/**
 * Production-only startup hook: neutralizes the leaked dev seed password so the
 * (kept-enabled) password login cannot be used with the public `Password123!`.
 * No-op outside production so dev/tests keep logging in with the seed password.
 */
@Injectable()
export class SeedCredentialHygiene implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedCredentialHygiene.name);

  constructor(private readonly db: DatabaseService) {}

  async onApplicationBootstrap(): Promise<void> {
    if (backendEnv.NODE_ENV !== 'production') {
      return;
    }
    try {
      const count = await neutralizeLeakedSeedCredentials(this.db);
      if (count > 0) {
        this.logger.warn(
          `seed_credentials_neutralized count=${count} (leaked Password123! hash rotated)`
        );
      }
    } catch (error) {
      // Do not crash boot, but make it loud — this is a security-relevant step.
      this.logger.error(`seed credential hygiene failed: ${(error as Error).message}`);
    }
  }
}
```

- [x] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/iam/services/seed-credential-hygiene.service.test.ts --no-file-parallelism`
Expected: PASS (2 tests).

- [x] **Step 5: Commit**

```bash
git add apps/backend/src/modules/iam/services/seed-credential-hygiene.service.ts apps/backend/src/modules/iam/services/seed-credential-hygiene.service.test.ts
git commit -m "feat(iam): neutralize leaked seed password in production (hygiene)"
```

---

### Task 4: Register SeedCredentialHygiene + final verification

**Files:**

- Modify: `apps/backend/src/modules/iam/iam.module.ts`

- [x] **Step 1: Register the provider**

In `apps/backend/src/modules/iam/iam.module.ts`, import and add `SeedCredentialHygiene` to the module `providers` array (it does not need to be exported):

```ts
import { SeedCredentialHygiene } from './services/seed-credential-hygiene.service.js';
```

Add `SeedCredentialHygiene` to the `providers: [...]` list (alongside `IamService, AuthService, ...`). Nest will call its `onApplicationBootstrap` after all `onModuleInit` (including `DatabaseService` migrations), so the seed exists by then.

- [x] **Step 2: Verify the test does NOT run the hygiene in the test env (non-prod no-op)**

Add to `seed-credential-hygiene.service.test.ts`:

```ts
import { SeedCredentialHygiene } from './seed-credential-hygiene.service.js';

describe('SeedCredentialHygiene.onApplicationBootstrap', () => {
  it('is a no-op outside production (does not touch the DB)', async () => {
    const db = { query: vi.fn() };
    const hygiene = new SeedCredentialHygiene(db as never);
    await hygiene.onApplicationBootstrap();
    expect(db.query).not.toHaveBeenCalled(); // NODE_ENV=test in the suite
  });
});
```

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/iam/services/seed-credential-hygiene.service.test.ts --no-file-parallelism`
Expected: PASS (3 tests now). This relies on the test env not being `production` (vitest setup sets `NODE_ENV=test`).

- [x] **Step 3: Full IAM typecheck + targeted regression**

```bash
pnpm --filter @cdoprof/backend exec tsc -p tsconfig.json --noEmit
pnpm --filter @cdoprof/backend exec vitest run src/modules/iam/services/email-magic-link-email-sender.test.ts src/modules/iam/services/magic-link-email-sender.factory.test.ts src/modules/iam/services/seed-credential-hygiene.service.test.ts src/modules/iam/crypto.util.test.ts --no-file-parallelism
```

Expected: tsc clean; all listed tests pass (crypto.util still verifies `Password123!` against the seed hash — confirms non-prod did not neutralize it).

- [x] **Step 4: Commit**

```bash
git add apps/backend/src/modules/iam/iam.module.ts apps/backend/src/modules/iam/services/seed-credential-hygiene.service.test.ts
git commit -m "feat(iam): register SeedCredentialHygiene on bootstrap"
```

---

## Plan Self-Review

**1. Spec coverage:**

- Spec §2 (A: EmailMagicLinkEmailSender + factory by `NOTIFICATIONS_EMAIL_ENABLED`) → Tasks 1, 2. ✅
- Spec §3 (B: prod-only `OnApplicationBootstrap` hygiene targeting the exact leaked hash, idempotent, non-prod no-op) → Tasks 3, 4. ✅
- Spec §5 testing (sender unit, factory selection, hygiene prod/non-prod/idempotent, real-password untouched) → covered; "real password untouched" is implied by exact-hash targeting + crypto.util regression (Task 4 Step 3). ✅
- Spec §3.3 runbook update (`infra/bootstrap-admin.md`) — **NOT in this plan**: that file lives on the Phase 0 branch (PR #235), not on `main`/this branch. Do it as a small commit on the Phase 0 branch (or after both merge). Tracked here as a follow-up, not a code gap.

**2. Placeholder scan:** every step has real code + exact run command + expected output. The email body, the leaked-hash constant, the SQL, and the disabled-value shape are all concrete. No TBD/"add error handling"/"similar to". ✅

**3. Type/name consistency:** `MagicLinkEmailSender`, `SendMagicLinkInput`, `buildMagicLinkUrl`, `MailerService`, `SendResult` match the real source. `createMagicLinkEmailSender`, `EmailMagicLinkEmailSender`, `neutralizeLeakedSeedCredentials`, `LEAKED_SEED_PASSWORD_HASH`, `SeedCredentialHygiene` are used consistently across tasks. `db.query(sql, params)` matches `DatabaseService.query`. ✅

**Follow-up (not blocking):** update `infra/bootstrap-admin.md` (Phase 0 branch) to mark the manual demo-account blocking as belt-and-suspenders and note the magic-link now arrives by email.
**Follow-up status (2026-06-10): DONE** — Phase 0 merged to main (#235) and was merged into this branch, so `infra/bootstrap-admin.md` was updated here: §2b describes `NOTIFICATIONS_EMAIL_ENABLED`-selected delivery, new §3.0 documents automatic `SeedCredentialHygiene` at boot, §3a/§3c/§3d demoted to belt-and-suspenders, §4 verification updated to inbox-first.
