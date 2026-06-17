# ЕСИА (Госуслуги) Login + Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **✅ STATUS: IMPLEMENTED** (2026-06-16, branch `feat/2026-06-16-esia-oauth-login-identity`, handoff §5.130). All 15 tasks done via subagent-driven execution. **As-built deviation:** the final holistic review caught two CRITICALs (TenantGuard rejected the browser-navigation ЕСИА routes with 401; the identity callback depended on an absent `context.userId`). The callback was reworked to be **fully state-driven** (tenantId + identity learnerId travel inside the signed `state`) and **identity is now initiated by the authenticated SPA via `POST /auth/esia/identity/authorize`** (bearer) rather than a GET `<a href>`; login stays an unauthenticated GET; `TenantGuard` exempts `/auth/esia/*`. The spec's **§13 As-built deviations** is the authoritative final flow — Tasks 9, 10, 14 below describe the pre-deviation design.

**Goal:** Add a dormant, provider-agnostic ЕСИА (Госуслуги) OAuth seam that powers two flows — login (resolve a learner by СНИЛС, never auto-create) and exam identity auto-approval — behind `ESIA_ENABLED=false`, with a Mock provider for dev/tests and a stubbed real OIDC adapter for later activation.

**Architecture:** Mirror the e-signature / antivirus provider seam: one `EsiaIdentityProvider` interface, `Noop`/`Mock`/`EsiaOidc` implementations, a DI token, a factory selected by env. Two HTTP endpoints (`/auth/esia/authorize`, `/auth/esia/callback`) live in the MVP module (it already owns learner lookup + the identity gate and imports `IamModule` for `AuthService`/`IamService`). State is a self-contained HMAC-signed token (no DB, no cookie plumbing). Session issuance reuses `AuthService.issueSessionForUser`; identity uses the existing `identityVerifications` collection (no migration). No new IAM permissions — endpoints are bootstrap routes like magic-link redeem.

**Tech Stack:** TypeScript, NestJS, Node `crypto` (HMAC), Zod (env), Vitest, Next.js 15 (frontend).

**Spec:** [docs/superpowers/specs/2026-06-16-esia-oauth-login-identity-design.md](../specs/2026-06-16-esia-oauth-login-identity-design.md)

---

## File Structure

**Backend — new files**

- `apps/backend/src/infrastructure/esia/esia-identity.provider.ts` — interface + `EsiaResolvedIdentity` + token + `NoopEsiaProvider`.
- `apps/backend/src/infrastructure/esia/mock-esia.provider.ts` — deterministic dev/test provider.
- `apps/backend/src/infrastructure/esia/esia-oidc.provider.ts` — real adapter caркас (ГОСТ signing TODO).
- `apps/backend/src/infrastructure/esia/esia-state.ts` — `signEsiaState` / `verifyEsiaState` (HMAC).
- `apps/backend/src/modules/mvp/esia/esia.service.ts` — request-scoped orchestration.
- `apps/backend/src/modules/mvp/esia/esia.controller.ts` — `/auth/esia/*` endpoints.
- Tests: `*.test.ts` siblings + `apps/backend/src/modules/mvp/esia/esia.http.integration.test.ts`.

**Backend — modified files**

- `apps/backend/src/env.schema.ts` — `ESIA_*` flags.
- `apps/backend/src/modules/iam/services/auth.service.ts` — `AuthMethod` += `'esia'` + audit mapping.
- `apps/backend/src/modules/mvp/mvp.service.ts` — `normalizeSnils`, `findLearnersBySnils`, `approveIdentityViaEsia`.
- `apps/backend/src/modules/mvp/mvp.types.ts` — `IdentityVerification.method` += `'esia'`.
- `apps/backend/src/modules/mvp/mvp.module.ts` — register provider factory, `EsiaService`, `EsiaController`.

**Frontend — new/modified**

- `apps/frontend/src/lib/config/env.ts` — `NEXT_PUBLIC_ESIA_ENABLED` flag.
- `apps/frontend/src/features/auth/esia-login-button.tsx` — new, flag-gated.
- `apps/frontend/src/features/auth/magic-link-form.tsx` — render the button.
- `apps/frontend/src/features/identity-verification/screens.tsx` — identity button.
- Tests: `esia-login-button.test.ts`.

**Docs**

- `README.md` §2 + `LMS_AGENT_HANDOFF.md` §5.130.

---

## Task 1: Env flags (`ESIA_*`)

**Files:**

- Modify: `apps/backend/src/env.schema.ts` (after `ESIGN_SIGNER_NAME`, ~line 54)
- Test: `apps/backend/src/env.esia.test.ts` (Create)

- [ ] **Step 1: Write the failing test**

```ts
// apps/backend/src/env.esia.test.ts
import { describe, expect, it } from 'vitest';

import { envSchema } from './env.schema.js';

const base = {
  NODE_ENV: 'test',
  S3_BUCKET: 'b',
  SMTP_FROM: 'a@b.c'
};

describe('ESIA env flags', () => {
  it('defaults dormant: ESIA_ENABLED=false, provider=noop', () => {
    const env = envSchema.parse({ ...base });
    expect(env.ESIA_ENABLED).toBe(false);
    expect(env.ESIA_PROVIDER).toBe('noop');
  });

  it('treats the string "false" as false (never accidentally on)', () => {
    const env = envSchema.parse({ ...base, ESIA_ENABLED: 'false' });
    expect(env.ESIA_ENABLED).toBe(false);
  });

  it('enables only on explicit true', () => {
    const env = envSchema.parse({ ...base, ESIA_ENABLED: 'true', ESIA_PROVIDER: 'mock' });
    expect(env.ESIA_ENABLED).toBe(true);
    expect(env.ESIA_PROVIDER).toBe('mock');
  });
});
```

> NB: `envSchema` may not be a named export. Open `env.schema.ts` and match the existing export (the file exports the schema object used by `env.ts`). If it is wrapped (e.g. `z.object({...})` assigned to a const), export that const as `envSchema` or import the existing name. Adjust the import line to the real symbol; do not invent one.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/env.esia.test.ts --no-file-parallelism`
Expected: FAIL (`ESIA_ENABLED` is undefined).

- [ ] **Step 3: Add the flags**

Insert after `ESIGN_SIGNER_NAME` (~line 54), mirroring the `ESIGN_ENABLED` custom boolean parse:

```ts
    // ЕСИА (Госуслуги) OAuth/OIDC seam (Phase 4 follow-up). Ships dormant (false) →
    // NoopEsiaProvider. Custom boolean parse — NOT z.coerce.boolean (string "false" → true) —
    // same rule as ANTIVIRUS_ENABLED/ESIGN_ENABLED so a login flag is never accidentally on.
    ESIA_ENABLED: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((v) => v === true || v === 'true')
      .default(false),
    /** Active ЕСИА provider. 'noop' (off) | 'mock' (dev/tests) | 'esia' (real ОIDC, follow-up). */
    ESIA_PROVIDER: z.enum(['noop', 'mock', 'esia']).default('noop'),
    ESIA_CLIENT_ID: z.string().min(1).optional(),
    ESIA_SCOPES: z.string().min(1).default('openid fullname snils birthdate email'),
    ESIA_AUTHORIZE_URL: z.string().url().optional(),
    ESIA_TOKEN_URL: z.string().url().optional(),
    ESIA_USERINFO_URL: z.string().url().optional(),
    ESIA_CALLBACK_URL: z.string().url().optional(),
    ESIA_CERT_PATH: z.string().min(1).optional(),
    /** HMAC secret for the self-contained OAuth `state` token. Dev default; override in prod. */
    ESIA_STATE_SECRET: z.string().min(1).default('dev-esia-state-secret'),
    /** Where the browser lands after a callback (frontend origin). */
    ESIA_FRONTEND_REDIRECT_BASE: z.string().url().default('http://localhost:3000'),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/env.esia.test.ts --no-file-parallelism`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/env.schema.ts apps/backend/src/env.esia.test.ts
git commit -m "feat(backend): ESIA_* env flags (dormant, custom boolean parse)"
```

---

## Task 2: Provider seam — interface, token, Noop

**Files:**

- Create: `apps/backend/src/infrastructure/esia/esia-identity.provider.ts`
- Test: `apps/backend/src/infrastructure/esia/esia-identity.provider.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// apps/backend/src/infrastructure/esia/esia-identity.provider.test.ts
import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { NoopEsiaProvider } from './esia-identity.provider.js';

describe('NoopEsiaProvider', () => {
  const p = new NoopEsiaProvider();

  it('buildAuthorizeUrl refuses when ЕСИА is disabled', () => {
    expect(() => p.buildAuthorizeUrl({ state: 's', purpose: 'login', redirectUri: 'r' })).toThrow(
      ServiceUnavailableException
    );
  });

  it('exchangeCode refuses when ЕСИА is disabled', async () => {
    await expect(p.exchangeCode({ code: 'c', state: 's', redirectUri: 'r' })).rejects.toThrow(
      ServiceUnavailableException
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/infrastructure/esia/esia-identity.provider.test.ts --no-file-parallelism`
Expected: FAIL (module not found).

- [ ] **Step 3: Create the seam**

```ts
// apps/backend/src/infrastructure/esia/esia-identity.provider.ts
import { ServiceUnavailableException } from '@nestjs/common';

/**
 * Provider-agnostic ЕСИА (Госуслуги) OAuth/OIDC seam, mirroring DocumentSignatureProvider
 * and AntivirusScanner. Noop is the safe default whenever ESIA_ENABLED=false: every entry
 * point refuses, so no login/identity path can run without an explicitly configured provider.
 */
export interface EsiaResolvedIdentity {
  /** Normalised СНИЛС — digits only (11 chars). */
  snils: string;
  lastName: string;
  firstName: string;
  middleName?: string;
  /** ISO YYYY-MM-DD. */
  birthDate?: string;
  email?: string;
}

export type EsiaPurpose = 'login' | 'identity';

export interface EsiaIdentityProvider {
  /** Stable id stored in audit for traceability ('noop' | 'mock' | 'esia'). */
  readonly id: string;
  /** Build the Госуслуги authorize URL. `state` is the caller's signed token. */
  buildAuthorizeUrl(params: { state: string; purpose: EsiaPurpose; redirectUri: string }): string;
  /** Exchange the callback `code` for the citizen's identity (token + userinfo + ГОСТ sign). */
  exchangeCode(params: {
    code: string;
    state: string;
    redirectUri: string;
  }): Promise<EsiaResolvedIdentity>;
}

/** DI token for the active provider. Mirrors ANTIVIRUS_SCANNER / DOCUMENT_SIGNATURE_PROVIDER. */
export const ESIA_IDENTITY_PROVIDER = Symbol('ESIA_IDENTITY_PROVIDER');

const disabled = (): never => {
  throw new ServiceUnavailableException({
    code: 'esia_disabled',
    message: 'Вход через Госуслуги недоступен'
  });
};

export class NoopEsiaProvider implements EsiaIdentityProvider {
  readonly id = 'noop';
  buildAuthorizeUrl(): string {
    return disabled();
  }
  async exchangeCode(): Promise<EsiaResolvedIdentity> {
    return disabled();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/infrastructure/esia/esia-identity.provider.test.ts --no-file-parallelism`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/infrastructure/esia/esia-identity.provider.ts apps/backend/src/infrastructure/esia/esia-identity.provider.test.ts
git commit -m "feat(backend): ЕСИА provider seam interface + token + NoopEsiaProvider"
```

---

## Task 3: Mock provider (dev/tests)

**Files:**

- Create: `apps/backend/src/infrastructure/esia/mock-esia.provider.ts`
- Test: `apps/backend/src/infrastructure/esia/mock-esia.provider.test.ts`

The Mock turns the OAuth round-trip into a local loop: `buildAuthorizeUrl` returns the backend
callback URL directly (so a dev click immediately lands on `/auth/esia/callback`), and
`exchangeCode` decodes the СНИЛС that the orchestration baked into the `code`. This lets the whole
login/identity flow run end-to-end locally without Госуслуги.

- [ ] **Step 1: Write the failing test**

```ts
// apps/backend/src/infrastructure/esia/mock-esia.provider.test.ts
import { describe, expect, it } from 'vitest';

import { MockEsiaProvider, encodeMockCode } from './mock-esia.provider.js';

describe('MockEsiaProvider', () => {
  const p = new MockEsiaProvider();

  it('round-trips the СНИЛС baked into the code', async () => {
    const code = encodeMockCode({ snils: '11223344595', lastName: 'Иванов', firstName: 'Иван' });
    const id = await p.exchangeCode({ code, state: 's', redirectUri: 'r' });
    expect(id.snils).toBe('11223344595');
    expect(id.lastName).toBe('Иванов');
  });

  it('buildAuthorizeUrl points back at the redirectUri with a code param', () => {
    const url = p.buildAuthorizeUrl({ state: 'st', purpose: 'login', redirectUri: 'http://x/cb' });
    expect(url).toContain('http://x/cb');
    expect(url).toContain('state=st');
    expect(url).toContain('code=');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/infrastructure/esia/mock-esia.provider.test.ts --no-file-parallelism`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the Mock**

```ts
// apps/backend/src/infrastructure/esia/mock-esia.provider.ts
import { type EsiaIdentityProvider, type EsiaResolvedIdentity } from './esia-identity.provider.js';

/** Encode a fake identity into an opaque `code` so the local loop can recover it. */
export const encodeMockCode = (identity: EsiaResolvedIdentity): string =>
  Buffer.from(JSON.stringify(identity), 'utf8').toString('base64url');

const decodeMockCode = (code: string): EsiaResolvedIdentity =>
  JSON.parse(Buffer.from(code, 'base64url').toString('utf8')) as EsiaResolvedIdentity;

/**
 * Dev/test provider. A real Госуслуги round-trip is replaced by a local loop: the authorize URL
 * is the backend callback itself, carrying a `code` that encodes a canned identity. Configure the
 * default identity via the constructor; the orchestration may also mint its own code with
 * encodeMockCode for deterministic tests.
 */
export class MockEsiaProvider implements EsiaIdentityProvider {
  readonly id = 'mock';
  constructor(
    private readonly defaultIdentity: EsiaResolvedIdentity = {
      snils: '11223344595',
      lastName: 'Тестов',
      firstName: 'Тест',
      middleName: 'Тестович',
      birthDate: '1990-01-01',
      email: 'esia-mock@example.test'
    }
  ) {}

  buildAuthorizeUrl(params: {
    state: string;
    purpose: 'login' | 'identity';
    redirectUri: string;
  }): string {
    const code = encodeMockCode(this.defaultIdentity);
    const sep = params.redirectUri.includes('?') ? '&' : '?';
    return `${params.redirectUri}${sep}code=${code}&state=${encodeURIComponent(params.state)}`;
  }

  async exchangeCode(params: {
    code: string;
    state: string;
    redirectUri: string;
  }): Promise<EsiaResolvedIdentity> {
    return decodeMockCode(params.code);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/infrastructure/esia/mock-esia.provider.test.ts --no-file-parallelism`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/infrastructure/esia/mock-esia.provider.ts apps/backend/src/infrastructure/esia/mock-esia.provider.test.ts
git commit -m "feat(backend): MockEsiaProvider for local ЕСИА loop (dev/tests)"
```

---

## Task 4: Real OIDC adapter caркас (stubbed)

**Files:**

- Create: `apps/backend/src/infrastructure/esia/esia-oidc.provider.ts`
- Test: `apps/backend/src/infrastructure/esia/esia-oidc.provider.test.ts`

The real adapter is intentionally a non-functional скелет: it documents the activation seam and
throws a clear "not implemented" until the ГОСТ signing + endpoints land (follow-up). It must never
be selected unless `ESIA_PROVIDER=esia` AND `ESIA_ENABLED=true`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/backend/src/infrastructure/esia/esia-oidc.provider.test.ts
import { describe, expect, it } from 'vitest';

import { EsiaOidcProvider } from './esia-oidc.provider.js';

describe('EsiaOidcProvider (stub)', () => {
  const p = new EsiaOidcProvider({
    clientId: 'mn',
    authorizeUrl: 'https://esia/aas',
    scopes: 'openid'
  });

  it('builds an authorize URL with client_id/scope/state/redirect_uri', () => {
    const url = p.buildAuthorizeUrl({
      state: 'st',
      purpose: 'login',
      redirectUri: 'https://app/cb'
    });
    expect(url).toContain('https://esia/aas');
    expect(url).toContain('client_id=mn');
    expect(url).toContain('state=st');
  });

  it('exchangeCode is not implemented until ГОСТ signing is wired', async () => {
    await expect(p.exchangeCode({ code: 'c', state: 's', redirectUri: 'r' })).rejects.toThrow(
      /not implemented/i
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/infrastructure/esia/esia-oidc.provider.test.ts --no-file-parallelism`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the stub**

```ts
// apps/backend/src/infrastructure/esia/esia-oidc.provider.ts
import { type EsiaIdentityProvider, type EsiaResolvedIdentity } from './esia-identity.provider.js';

export interface EsiaOidcConfig {
  clientId: string;
  authorizeUrl: string;
  scopes: string;
  tokenUrl?: string;
  userinfoUrl?: string;
  certPath?: string;
}

/**
 * Real ЕСИА OIDC adapter — ACTIVATION FOLLOW-UP, not functional yet.
 * To go live: (1) obtain ИС status + mnemonic + registered redirect_uri; (2) install the org's
 * ГОСТ certificate (УЦ ФНС); (3) implement detached ГОСТ signing of the request below via КриптоПро;
 * (4) set ESIA_ENABLED=true, ESIA_PROVIDER=esia, ESIA_* urls. See spec §10.
 */
export class EsiaOidcProvider implements EsiaIdentityProvider {
  readonly id = 'esia';
  constructor(private readonly cfg: EsiaOidcConfig) {}

  buildAuthorizeUrl(params: {
    state: string;
    purpose: 'login' | 'identity';
    redirectUri: string;
  }): string {
    const timestamp = '<<gost-signed-timestamp>>'; // TODO: ГОСТ-подпись (follow-up) — see class doc
    const q = new URLSearchParams({
      client_id: this.cfg.clientId,
      response_type: 'code',
      scope: this.cfg.scopes,
      state: params.state,
      redirect_uri: params.redirectUri,
      access_type: 'online',
      timestamp
    });
    return `${this.cfg.authorizeUrl}?${q.toString()}`;
  }

  async exchangeCode(): Promise<EsiaResolvedIdentity> {
    // TODO: ГОСТ-подпись запроса + POST token + GET userinfo (КриптоПро). Follow-up.
    throw new Error('EsiaOidcProvider.exchangeCode not implemented — ГОСТ signing is a follow-up');
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/infrastructure/esia/esia-oidc.provider.test.ts --no-file-parallelism`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/infrastructure/esia/esia-oidc.provider.ts apps/backend/src/infrastructure/esia/esia-oidc.provider.test.ts
git commit -m "feat(backend): EsiaOidcProvider скелет (ГОСТ signing follow-up)"
```

---

## Task 5: Signed `state` token util

**Files:**

- Create: `apps/backend/src/infrastructure/esia/esia-state.ts`
- Test: `apps/backend/src/infrastructure/esia/esia-state.test.ts`

Self-contained HMAC-signed `state` — no DB, no cookie. Carries `purpose`, `tenantId`, a `nonce`, and
an expiry; the callback rejects tampering or expiry. This is the CSRF defence for the OAuth round-trip.

- [ ] **Step 1: Write the failing test**

```ts
// apps/backend/src/infrastructure/esia/esia-state.test.ts
import { describe, expect, it } from 'vitest';

import { signEsiaState, verifyEsiaState } from './esia-state.js';

const secret = 'unit-secret';

describe('esia state token', () => {
  it('round-trips a valid signed state', () => {
    const token = signEsiaState(
      { purpose: 'login', tenantId: 't1', nonce: 'n1' },
      secret,
      300,
      1000
    );
    const claims = verifyEsiaState(token, secret, 1100);
    expect(claims).toMatchObject({ purpose: 'login', tenantId: 't1', nonce: 'n1' });
  });

  it('rejects a tampered token', () => {
    const token = signEsiaState(
      { purpose: 'login', tenantId: 't1', nonce: 'n1' },
      secret,
      300,
      1000
    );
    expect(() => verifyEsiaState(token + 'x', secret, 1100)).toThrow();
  });

  it('rejects an expired token', () => {
    const token = signEsiaState(
      { purpose: 'login', tenantId: 't1', nonce: 'n1' },
      secret,
      300,
      1000
    );
    expect(() => verifyEsiaState(token, secret, 1000 + 301_000)).toThrow();
  });
});
```

> `signEsiaState(payload, secret, ttlSeconds, nowMs)` and `verifyEsiaState(token, secret, nowMs)` take
> an explicit `nowMs` so tests are deterministic (the codebase forbids `Date.now()` in some contexts;
> here we pass it in). Production callers pass `Date.now()`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/infrastructure/esia/esia-state.test.ts --no-file-parallelism`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// apps/backend/src/infrastructure/esia/esia-state.ts
import { createHmac, timingSafeEqual } from 'node:crypto';

import { type EsiaPurpose } from './esia-identity.provider.js';

export interface EsiaStateClaims {
  purpose: EsiaPurpose;
  tenantId: string;
  nonce: string;
}

interface EsiaStatePayload extends EsiaStateClaims {
  exp: number; // epoch ms
}

const b64 = (s: string): string => Buffer.from(s, 'utf8').toString('base64url');
const unb64 = (s: string): string => Buffer.from(s, 'base64url').toString('utf8');

const hmac = (body: string, secret: string): string =>
  createHmac('sha256', secret).update(body).digest('base64url');

export const signEsiaState = (
  claims: EsiaStateClaims,
  secret: string,
  ttlSeconds: number,
  nowMs: number
): string => {
  const payload: EsiaStatePayload = { ...claims, exp: nowMs + ttlSeconds * 1000 };
  const body = b64(JSON.stringify(payload));
  return `${body}.${hmac(body, secret)}`;
};

export const verifyEsiaState = (token: string, secret: string, nowMs: number): EsiaStateClaims => {
  const [body, sig] = token.split('.');
  if (!body || !sig) throw new Error('esia_state_malformed');
  const expected = hmac(body, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('esia_state_bad_signature');
  const payload = JSON.parse(unb64(body)) as EsiaStatePayload;
  if (typeof payload.exp !== 'number' || nowMs > payload.exp) throw new Error('esia_state_expired');
  return { purpose: payload.purpose, tenantId: payload.tenantId, nonce: payload.nonce };
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/infrastructure/esia/esia-state.test.ts --no-file-parallelism`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/infrastructure/esia/esia-state.ts apps/backend/src/infrastructure/esia/esia-state.test.ts
git commit -m "feat(backend): HMAC-signed ЕСИА OAuth state token util"
```

---

## Task 6: `IdentityVerification.method` += `'esia'`

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.types.ts:460`

- [ ] **Step 1: Widen the union (type-only, verified by Task 8 tests)**

Change line 460 from:

```ts
method: 'selfie_passport';
```

to:

```ts
method: 'selfie_passport' | 'esia';
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @cdoprof/backend exec tsc --noEmit -p tsconfig.json`
Expected: PASS (no new errors).

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/modules/mvp/mvp.types.ts
git commit -m "feat(backend): allow IdentityVerification.method 'esia'"
```

---

## Task 7: `AuthMethod` += `'esia'`

**Files:**

- Modify: `apps/backend/src/modules/iam/services/auth.service.ts:29` + audit mapping (~line 130-132)

- [ ] **Step 1: Write the failing test**

```ts
// apps/backend/src/modules/iam/services/auth-esia-method.test.ts
import { describe, expect, it } from 'vitest';

import { type AuthMethod } from './auth.service.js';

describe('AuthMethod', () => {
  it("includes 'esia'", () => {
    const m: AuthMethod = 'esia';
    expect(m).toBe('esia');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/iam/services/auth-esia-method.test.ts --no-file-parallelism`
Expected: FAIL (type error: `'esia'` not assignable).

- [ ] **Step 3: Extend the type + audit mapping**

Line 29:

```ts
export type AuthMethod = 'password' | 'magic_link' | 'esia';
```

Replace the `eventType` / `auditAction` lines (~130-132) so `esia` gets its own audit action:

```ts
const eventType = options.authMethod === 'magic_link' ? 'magic_link_login' : 'login';
const auditAction =
  options.authMethod === 'magic_link'
    ? 'auth.magic_link_login'
    : options.authMethod === 'esia'
      ? 'auth.esia_login'
      : 'auth.login';
```

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/iam/services/auth-esia-method.test.ts --no-file-parallelism`
Expected: PASS.
Run: `pnpm --filter @cdoprof/backend exec tsc --noEmit -p tsconfig.json`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/iam/services/auth.service.ts apps/backend/src/modules/iam/services/auth-esia-method.test.ts
git commit -m "feat(backend): AuthMethod 'esia' + auth.esia_login audit action"
```

---

## Task 8: `MvpService` — СНИЛС lookup + ЕСИА identity auto-approve

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.service.ts` (add methods near `findApprovedIdentityVerification`, ~line 3577)
- Test: `apps/backend/src/modules/mvp/esia-identity.service.test.ts` (Create)

`findLearnersBySnils` normalises both sides to digits-only before comparing. `approveIdentityViaEsia`
writes an `approved` record (idempotent — returns the existing approved one) so the existing gate
`assertIdentityVerificationGate` unlocks with no other change.

- [ ] **Step 1: Write the failing test**

```ts
// apps/backend/src/modules/mvp/esia-identity.service.test.ts
import { describe, expect, it } from 'vitest';

import { makeMvpService } from './test-support/make-mvp-service.js'; // see NB below

describe('ЕСИА identity helpers', () => {
  it('normalises СНИЛС and matches a learner regardless of formatting', () => {
    const { service, state, tenantId } = makeMvpService();
    state.learners.push({
      id: 'lrn_1',
      tenantId,
      firstName: 'Иван',
      lastName: 'Иванов',
      snils: '112-233-445 95',
      status: 'active',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01'
    });
    const found = service.findLearnersBySnils(tenantId, '11223344595');
    expect(found).toHaveLength(1);
    expect(found[0]!.id).toBe('lrn_1');
  });

  it('auto-approves identity for a learner and is idempotent', () => {
    const { service, state, tenantId, ctx } = makeMvpService();
    state.learners.push({
      id: 'lrn_1',
      tenantId,
      firstName: 'Иван',
      lastName: 'Иванов',
      snils: '11223344595',
      status: 'active',
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01'
    });
    const first = service.approveIdentityViaEsia(tenantId, 'lrn_1', ctx);
    const second = service.approveIdentityViaEsia(tenantId, 'lrn_1', ctx);
    expect(first.verificationStatus).toBe('approved');
    expect(first.method).toBe('esia');
    expect(second.id).toBe(first.id); // idempotent — no duplicate record
    expect(state.identityVerifications.filter((v) => v.learnerId === 'lrn_1')).toHaveLength(1);
  });
});
```

> **NB — test harness:** this repo has no single shared `makeMvpService` helper; existing service
> tests build the 6-arg `new MvpService(state, tenantRepo, audit, documents, files, eventEmitter)`
> via a local `makeServices()` (see `learners-bulk-import.service.test.ts`). Either (a) reuse that
> file's pattern inline, or (b) create `apps/backend/src/modules/mvp/test-support/make-mvp-service.ts`
> exporting `makeMvpService()` that returns `{ service, state, tenantId, ctx }`. Pick whichever the
> existing identity-verification service test (`identity-verification.service.test.ts`) already uses
> and copy it — do not invent new constructor args.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/esia-identity.service.test.ts --no-file-parallelism`
Expected: FAIL (`findLearnersBySnils` is not a function).

- [ ] **Step 3: Add the methods**

Insert after `findApprovedIdentityVerification` (~line 3577). Match the surrounding `private`/`public`
style — these two are **public** (called by `EsiaService`):

```ts
  /** Digits-only normalisation so '112-233-445 95' and '11223344595' compare equal. */
  private normalizeSnils(snils: string | undefined): string {
    return (snils ?? '').replace(/\D/g, '');
  }

  /** Learners in this tenant whose СНИЛС matches (normalised). Empty when none — caller denies. */
  findLearnersBySnils(tenantId: string, snils: string): Learner[] {
    const target = this.normalizeSnils(snils);
    if (target.length === 0) return [];
    return this.state.learners.filter(
      (l) => l.tenantId === tenantId && this.normalizeSnils(l.snils) === target
    );
  }

  /**
   * ЕСИА success → an `approved` IdentityVerification for the learner (method 'esia'),
   * unlocking assertIdentityVerificationGate. Idempotent: returns the existing approved record.
   */
  approveIdentityViaEsia(
    tenantId: string,
    learnerId: string,
    context: RequestContext
  ): IdentityVerification {
    const existing = this.findApprovedIdentityVerification(tenantId, learnerId);
    if (existing) return existing;
    const now = this.now();
    const entity: IdentityVerification = {
      id: this.id('idv'),
      tenantId,
      learnerId,
      method: 'esia',
      verificationStatus: 'approved',
      status: 'active',
      reviewedByActorId: 'system_esia',
      reviewedAt: now,
      consentAt: now,
      createdAt: now,
      updatedAt: now
    };
    this.state.identityVerifications.push(entity);
    this.audit(
      tenantId,
      'system_esia',
      'learning.identity_verification_approved_by_esia',
      'learning.identity_verification',
      entity.id,
      undefined,
      { id: entity.id, learnerId, method: 'esia' },
      context
    );
    return entity;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/esia-identity.service.test.ts --no-file-parallelism`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/mvp/mvp.service.ts apps/backend/src/modules/mvp/esia-identity.service.test.ts apps/backend/src/modules/mvp/test-support/make-mvp-service.ts
git commit -m "feat(backend): findLearnersBySnils + approveIdentityViaEsia"
```

---

## Task 9: `EsiaService` — orchestration

**Files:**

- Create: `apps/backend/src/modules/mvp/esia/esia.service.ts`
- Test: `apps/backend/src/modules/mvp/esia/esia.service.test.ts`

Request-scoped. Depends on `ESIA_IDENTITY_PROVIDER`, `MvpService`, `IamService`, `AuthService`.
Three methods: `startAuthorize` (sign state → provider URL), `resolveLoginUser` (verify state →
exchange → find learner by СНИЛС → resolve/link IAM user → return user), `approveIdentity` (verify
state → exchange → compare СНИЛС with the session learner → approve). Session issuance + cookies stay
in the controller (Task 10).

- [ ] **Step 1: Write the failing test**

```ts
// apps/backend/src/modules/mvp/esia/esia.service.test.ts
import { ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import {
  MockEsiaProvider,
  encodeMockCode
} from '../../../infrastructure/esia/mock-esia.provider.js';
import { signEsiaState } from '../../../infrastructure/esia/esia-state.js';
import { EsiaService } from './esia.service.js';

const SECRET = 'svc-secret';
const ctx = { tenantId: 't1', requestId: 'r', correlationId: 'c' } as never;

const makeService = (overrides?: { learners?: unknown[] }) => {
  const provider = new MockEsiaProvider();
  const mvp = {
    findLearnersBySnils: vi.fn().mockReturnValue(overrides?.learners ?? []),
    approveIdentityViaEsia: vi
      .fn()
      .mockReturnValue({ id: 'idv_1', verificationStatus: 'approved' }),
    linkLearnerToIamUser: vi.fn()
  };
  const iam = {
    findOrCreateByEmail: vi.fn().mockResolvedValue({ user: { id: 'u1' }, databaseBacked: false })
  };
  const config = {
    secret: SECRET,
    ttlSeconds: 300,
    callbackUrl: 'http://app/cb',
    nowMs: () => 1000
  };
  const service = new EsiaService(provider, mvp as never, iam as never, config);
  return { service, provider, mvp, iam };
};

describe('EsiaService', () => {
  it('login: denies when no learner matches the СНИЛС (no auto-create)', async () => {
    const { service } = makeService({ learners: [] });
    const state = signEsiaState(
      { purpose: 'login', tenantId: 't1', nonce: 'n' },
      SECRET,
      300,
      1000
    );
    const code = encodeMockCode({ snils: '11223344595', lastName: 'Х', firstName: 'У' });
    await expect(service.resolveLoginUser('t1', code, state)).rejects.toThrow(ForbiddenException);
  });

  it('identity: rejects when ЕСИА СНИЛС differs from the session learner', async () => {
    // findLearnersBySnils(ЕСИА-snils) returns [] → no learner with that СНИЛС is lrn_1 → mismatch.
    const { service } = makeService({ learners: [] });
    const state = signEsiaState(
      { purpose: 'identity', tenantId: 't1', nonce: 'n' },
      SECRET,
      300,
      1000
    );
    const code = encodeMockCode({ snils: '11223344595', lastName: 'Х', firstName: 'У' });
    await expect(service.approveIdentity('t1', 'lrn_1', code, state, ctx)).rejects.toThrow(
      UnprocessableEntityException
    );
  });

  it('identity: approves when ЕСИА СНИЛС matches the session learner', async () => {
    const { service } = makeService({ learners: [{ id: 'lrn_1', snils: '11223344595' }] });
    const state = signEsiaState(
      { purpose: 'identity', tenantId: 't1', nonce: 'n' },
      SECRET,
      300,
      1000
    );
    const code = encodeMockCode({ snils: '11223344595', lastName: 'Х', firstName: 'У' });
    await expect(service.approveIdentity('t1', 'lrn_1', code, state, ctx)).resolves.toEqual({
      verificationId: 'idv_1'
    });
  });
});
```

> **NB:** identity matching uses `findLearnersBySnils` (from Task 8) and checks the session learner's
> id is among the matches — no separate `getLearnerById` is needed in the service. The controller
> (Task 10) resolves session→learner via the existing `linkedIamUserId` path before calling
> `approveIdentity`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/esia/esia.service.test.ts --no-file-parallelism`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `EsiaService`**

```ts
// apps/backend/src/modules/mvp/esia/esia.service.ts
import {
  ForbiddenException,
  Inject,
  Injectable,
  Scope,
  UnprocessableEntityException
} from '@nestjs/common';

import {
  ESIA_IDENTITY_PROVIDER,
  type EsiaIdentityProvider,
  type EsiaPurpose
} from '../../../infrastructure/esia/esia-identity.provider.js';
import { signEsiaState, verifyEsiaState } from '../../../infrastructure/esia/esia-state.js';
import { IamService } from '../../iam/services/iam.service.js';
import { MvpService } from '../mvp.service.js';

import type { RequestContext } from '../../../common/context/request-context.js';

export interface EsiaServiceConfig {
  secret: string;
  ttlSeconds: number;
  callbackUrl: string;
  /** Injected clock so unit tests are deterministic. */
  nowMs: () => number;
}

export const ESIA_SERVICE_CONFIG = Symbol('ESIA_SERVICE_CONFIG');

@Injectable({ scope: Scope.REQUEST })
export class EsiaService {
  constructor(
    @Inject(ESIA_IDENTITY_PROVIDER) private readonly provider: EsiaIdentityProvider,
    @Inject(MvpService) private readonly mvp: MvpService,
    @Inject(IamService) private readonly iam: IamService,
    @Inject(ESIA_SERVICE_CONFIG) private readonly config: EsiaServiceConfig
  ) {}

  /** Sign a state token and return the Госуслуги authorize URL. */
  startAuthorize(purpose: EsiaPurpose, tenantId: string): { authorizeUrl: string } {
    const nonce = `${tenantId}:${this.config.nowMs()}`;
    const state = signEsiaState(
      { purpose, tenantId, nonce },
      this.config.secret,
      this.config.ttlSeconds,
      this.config.nowMs()
    );
    const authorizeUrl = this.provider.buildAuthorizeUrl({
      state,
      purpose,
      redirectUri: this.config.callbackUrl
    });
    return { authorizeUrl };
  }

  /**
   * Decode the purpose from a state token WITHOUT verifying its signature — used only to branch
   * the callback. Signature + expiry are still checked in resolveLoginUser/approveIdentity.
   */
  peekPurpose(state: string): EsiaPurpose {
    try {
      const body = state.split('.')[0] ?? '';
      const json = Buffer.from(body, 'base64url').toString('utf8');
      return (JSON.parse(json) as { purpose?: EsiaPurpose }).purpose === 'identity'
        ? 'identity'
        : 'login';
    } catch {
      return 'login';
    }
  }

  private verify(tenantId: string, state: string, expected: EsiaPurpose): void {
    const claims = verifyEsiaState(state, this.config.secret, this.config.nowMs());
    if (claims.purpose !== expected || claims.tenantId !== tenantId) {
      throw new ForbiddenException({
        code: 'esia_state_mismatch',
        message: 'Недействительный запрос'
      });
    }
  }

  /** Login: state → exchange → learner-by-СНИЛС → resolve/link IAM user. Never auto-creates a learner. */
  async resolveLoginUser(
    tenantId: string,
    code: string,
    state: string
  ): Promise<{ userId: string; databaseBacked: boolean }> {
    this.verify(tenantId, state, 'login');
    const identity = await this.provider.exchangeCode({
      code,
      state,
      redirectUri: this.config.callbackUrl
    });
    const learners = this.mvp.findLearnersBySnils(tenantId, identity.snils);
    if (learners.length === 0) {
      throw new ForbiddenException({
        code: 'esia_learner_not_enrolled',
        message: 'Вас ещё не зачислили в этот учебный центр'
      });
    }
    const learner = learners[0]!;
    if (!learner.email) {
      throw new ForbiddenException({
        code: 'esia_learner_no_account',
        message: 'У вашего профиля нет адреса для входа — обратитесь в учебный центр'
      });
    }
    // Learner already verified to exist → creating/linking the IAM user is legitimate (not auto-signup).
    const { user, databaseBacked } = await this.iam.findOrCreateByEmail(tenantId, learner.email);
    this.mvp.linkLearnerToIamUser(tenantId, learner.id, user.id);
    return { userId: user.id, databaseBacked };
  }

  /** Identity: state → exchange → compare СНИЛС with the session learner → auto-approve. */
  async approveIdentity(
    tenantId: string,
    learnerId: string,
    code: string,
    state: string,
    context: RequestContext
  ): Promise<{ verificationId: string }> {
    this.verify(tenantId, state, 'identity');
    const identity = await this.provider.exchangeCode({
      code,
      state,
      redirectUri: this.config.callbackUrl
    });
    const matches = this.mvp.findLearnersBySnils(tenantId, identity.snils);
    if (!matches.some((l) => l.id === learnerId)) {
      throw new UnprocessableEntityException({
        code: 'esia_snils_mismatch',
        message: 'СНИЛС в Госуслугах не совпадает с вашими данными'
      });
    }
    const record = this.mvp.approveIdentityViaEsia(tenantId, learnerId, context);
    return { verificationId: record.id };
  }
}
```

> **NB — `linkLearnerToIamUser`:** if `MvpService` lacks a public setter for `linkedIamUserId`, add a
> small public method in Task 8 that sets it on the learner in `this.state.learners` and audits
> `learning.learner_linked_to_user` (no-op if already linked). Keep it idempotent.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/esia/esia.service.test.ts --no-file-parallelism`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/mvp/esia/esia.service.ts apps/backend/src/modules/mvp/esia/esia.service.test.ts apps/backend/src/modules/mvp/mvp.service.ts
git commit -m "feat(backend): EsiaService orchestration (login resolve + identity approve)"
```

---

## Task 10: `EsiaController` + module wiring

**Files:**

- Create: `apps/backend/src/modules/mvp/esia/esia.controller.ts`
- Modify: `apps/backend/src/modules/mvp/mvp.module.ts`

Controller is request-scoped, `@UseGuards(TenantGuard)`, `@UseInterceptors(MvpRequestPersistenceInterceptor)`
(so the identity write + IAM link persist). No `PermissionGuard` — bootstrap routes, exactly like
magic-link redeem. `/authorize` 302-redirects to the provider; `/callback` issues a session (login) or
approves identity, then 302-redirects to the frontend with a status.

- [ ] **Step 1: Implement the controller**

```ts
// apps/backend/src/modules/mvp/esia/esia.controller.ts
import {
  Controller,
  Get,
  Inject,
  Query,
  Res,
  UnauthorizedException,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';

import { EsiaService } from './esia.service.js';
import { backendEnv } from '../../../env.js';
import { CurrentContext } from '../../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../../common/guards/tenant.guard.js';
import { authCookie } from '../../iam/auth-cookie.util.js';
import { AuthService } from '../../iam/services/auth.service.js';
import { IamService } from '../../iam/services/iam.service.js';
import { MvpRequestPersistenceInterceptor } from '../infrastructure/mvp-request-persistence.interceptor.js';
import { MvpService } from '../mvp.service.js';

import type { RequestContext } from '../../../common/context/request-context.js';
import type { EsiaPurpose } from '../../../infrastructure/esia/esia-identity.provider.js';
import type { Response } from 'express';

const frontend = (path: string): string => `${backendEnv.ESIA_FRONTEND_REDIRECT_BASE}${path}`;

@Controller()
@UseGuards(TenantGuard)
@UseInterceptors(MvpRequestPersistenceInterceptor)
export class EsiaController {
  constructor(
    @Inject(EsiaService) private readonly esia: EsiaService,
    @Inject(AuthService) private readonly authService: AuthService,
    @Inject(IamService) private readonly iamService: IamService,
    @Inject(MvpService) private readonly mvp: MvpService
  ) {}

  @Get('auth/esia/authorize')
  authorize(
    @CurrentContext() context: RequestContext,
    @Query('purpose') purposeRaw: string | undefined,
    @Res({ passthrough: true }) response: Response
  ): void {
    if (!context.tenantId)
      throw new UnauthorizedException({ code: 'no_tenant', message: 'Tenant not resolved' });
    const purpose: EsiaPurpose = purposeRaw === 'identity' ? 'identity' : 'login';
    const { authorizeUrl } = this.esia.startAuthorize(purpose, context.tenantId);
    response.redirect(authorizeUrl); // throws via NoopEsiaProvider (503) when ESIA_ENABLED=false
  }

  @Get('auth/esia/callback')
  async callback(
    @CurrentContext() context: RequestContext,
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Res({ passthrough: true }) response: Response
  ): Promise<void> {
    if (!context.tenantId)
      throw new UnauthorizedException({ code: 'no_tenant', message: 'Tenant not resolved' });
    if (!code || !state) {
      response.redirect(frontend('/auth/esia/callback?status=error&reason=missing_params'));
      return;
    }
    // The purpose lives inside the signed state; peek it to branch (verify happens in the service).
    const purpose = this.esia.peekPurpose(state);
    if (purpose === 'identity') {
      // identity flow requires an authenticated learner
      if (!context.userId)
        throw new UnauthorizedException({
          code: 'esia_identity_no_session',
          message: 'Требуется вход'
        });
      const learner = this.mvp.getLinkedLearnerForUser(context.tenantId, context.userId);
      await this.esia.approveIdentity(context.tenantId, learner.id, code, state, context);
      response.redirect(frontend('/learner/identity?status=ok'));
      return;
    }
    const { userId, databaseBacked } = await this.esia.resolveLoginUser(
      context.tenantId,
      code,
      state
    );
    const user = await this.iamService.getUser(context.tenantId, userId);
    const tokens = await this.authService.issueSessionForUser(user, context, {
      authMethod: 'esia',
      databaseBacked
    });
    authCookie.attachRefreshAndCsrfCookies(response, tokens.refreshToken, tokens.csrfToken);
    response.redirect(frontend('/learner?status=esia_ok'));
  }
}
```

> **NB — `getLinkedLearnerForUser`:** reuse the existing learner-resolution the MVP module already
> uses for `linkedIamUserId` (the identity flow's `resolveIdentityLearner` path). If no public method
> exists, add a thin public `getLinkedLearnerForUser(tenantId, userId): Learner` that throws
> `learner_not_linked` (mirroring the existing private `resolveIdentityLearner`).

- [ ] **Step 2: Wire the module**

In `apps/backend/src/modules/mvp/mvp.module.ts`:

1. Add imports at top:

```ts
import { EsiaController } from './esia/esia.controller.js';
import { EsiaService, ESIA_SERVICE_CONFIG, type EsiaServiceConfig } from './esia/esia.service.js';
import {
  ESIA_IDENTITY_PROVIDER,
  NoopEsiaProvider
} from '../../infrastructure/esia/esia-identity.provider.js';
import { MockEsiaProvider } from '../../infrastructure/esia/mock-esia.provider.js';
import { EsiaOidcProvider } from '../../infrastructure/esia/esia-oidc.provider.js';
```

2. Add `EsiaController` to the `controllers` array.

3. Add these providers to the `providers` array:

```ts
    {
      provide: ESIA_IDENTITY_PROVIDER,
      useFactory: () => {
        if (!backendEnv.ESIA_ENABLED) return new NoopEsiaProvider();
        if (backendEnv.ESIA_PROVIDER === 'mock') return new MockEsiaProvider();
        if (backendEnv.ESIA_PROVIDER === 'esia') {
          return new EsiaOidcProvider({
            clientId: backendEnv.ESIA_CLIENT_ID ?? '',
            authorizeUrl: backendEnv.ESIA_AUTHORIZE_URL ?? '',
            scopes: backendEnv.ESIA_SCOPES,
            ...(backendEnv.ESIA_TOKEN_URL ? { tokenUrl: backendEnv.ESIA_TOKEN_URL } : {}),
            ...(backendEnv.ESIA_USERINFO_URL ? { userinfoUrl: backendEnv.ESIA_USERINFO_URL } : {}),
            ...(backendEnv.ESIA_CERT_PATH ? { certPath: backendEnv.ESIA_CERT_PATH } : {})
          });
        }
        return new NoopEsiaProvider();
      }
    },
    {
      provide: ESIA_SERVICE_CONFIG,
      useValue: {
        secret: backendEnv.ESIA_STATE_SECRET,
        ttlSeconds: 300,
        callbackUrl: backendEnv.ESIA_CALLBACK_URL ?? 'http://localhost:3001/api/v1/auth/esia/callback',
        nowMs: () => Date.now()
      } satisfies EsiaServiceConfig
    },
    { provide: EsiaService, scope: Scope.REQUEST, useClass: EsiaService },
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @cdoprof/backend exec tsc --noEmit -p tsconfig.json`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/modules/mvp/esia/esia.controller.ts apps/backend/src/modules/mvp/mvp.module.ts
git commit -m "feat(backend): /auth/esia/authorize + /callback endpoints + module wiring"
```

---

## Task 11: HTTP integration — bootstrap route + disabled + state mismatch

**Files:**

- Create: `apps/backend/src/modules/mvp/esia/esia.http.integration.test.ts`

Boot a minimal Nest app with a hand-rolled stub controller (the repo's HTTP-integration convention —
see `mvp.http.integration.test.ts`). Assert: (a) with `NoopEsiaProvider`, `/authorize` returns 503
`esia_disabled`; (b) `/callback` with a tampered `state` returns the error redirect / 403; (c) the
routes require no permission (bootstrap).

- [ ] **Step 1: Write the test (mirror the existing stub-controller harness)**

```ts
// apps/backend/src/modules/mvp/esia/esia.http.integration.test.ts
import { Controller, Get, Query, Res, ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { NoopEsiaProvider } from '../../../infrastructure/esia/esia-identity.provider.js';

import type { INestApplication } from '@nestjs/common';
import type { Response } from 'express';

@Controller()
class StubEsiaController {
  private readonly provider = new NoopEsiaProvider();

  @Get('auth/esia/authorize')
  authorize(@Query('purpose') _p: string, @Res({ passthrough: true }) res: Response): void {
    // Noop provider throws → 503 esia_disabled, proving the dormant default is safe.
    res.redirect(
      this.provider.buildAuthorizeUrl({ state: 's', purpose: 'login', redirectUri: 'r' })
    );
  }
}

describe('ЕСИА HTTP (dormant)', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [StubEsiaController]
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    await app.close();
  });

  it('GET /auth/esia/authorize returns 503 esia_disabled when ESIA_ENABLED=false', async () => {
    const res = await request(app.getHttpServer()).get('/auth/esia/authorize?purpose=login');
    expect(res.status).toBe(503);
    expect(res.body?.error?.code ?? res.body?.code).toBe('esia_disabled');
  });
});
```

> **NB:** match the existing harness's envelope expectations and `supertest` import style exactly as
> `mvp.http.integration.test.ts` does (envelope filter may wrap the body as `{ error: { code } }`).
> If that file registers a global exception filter in the test module, register the same one here so
> the 503 body shape matches.

- [ ] **Step 2: Run test to verify it fails, then passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/esia/esia.http.integration.test.ts --no-file-parallelism`
Expected: FAIL first (before envelope wiring), then PASS once the filter/harness matches the existing convention.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/modules/mvp/esia/esia.http.integration.test.ts
git commit -m "test(backend): ЕСИА endpoints are dormant + bootstrap (503 esia_disabled)"
```

---

## Task 12: Frontend — `NEXT_PUBLIC_ESIA_ENABLED` flag

**Files:**

- Modify: `apps/frontend/src/lib/config/env.ts`

- [ ] **Step 1: Add the flag to the schema + mapping**

In the zod schema object add:

```ts
  NEXT_PUBLIC_ESIA_ENABLED: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => v === true || v === 'true')
    .default(false),
```

And in the object that reads `process.env` add:

```ts
  NEXT_PUBLIC_ESIA_ENABLED: process.env.NEXT_PUBLIC_ESIA_ENABLED,
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @cdoprof/frontend exec tsc --noEmit -p tsconfig.json`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/lib/config/env.ts
git commit -m "feat(frontend): NEXT_PUBLIC_ESIA_ENABLED flag (default off)"
```

---

## Task 13: Frontend — "Войти через Госуслуги" button

**Files:**

- Create: `apps/frontend/src/features/auth/esia-login-button.tsx`
- Modify: `apps/frontend/src/features/auth/magic-link-form.tsx` (render it)
- Test: `apps/frontend/src/features/auth/esia-login-button.test.ts`

- [ ] **Step 1: Write the failing test (pure-function visibility, repo convention — no render())**

```ts
// apps/frontend/src/features/auth/esia-login-button.test.ts
import { describe, expect, it } from 'vitest';

import { esiaAuthorizeUrl, shouldShowEsiaButton } from './esia-login-button.js';

describe('ЕСИА login button', () => {
  it('hidden when the flag is off', () => {
    expect(shouldShowEsiaButton(false)).toBe(false);
  });
  it('shown when the flag is on', () => {
    expect(shouldShowEsiaButton(true)).toBe(true);
  });
  it('builds the backend authorize URL with tenant + purpose=login', () => {
    const url = esiaAuthorizeUrl('http://api/v1', 'tenant_demo');
    expect(url).toBe('http://api/v1/auth/esia/authorize?purpose=login&tenant_id=tenant_demo');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/features/auth/esia-login-button.test.ts --no-file-parallelism`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```tsx
// apps/frontend/src/features/auth/esia-login-button.tsx
'use client';

import { frontendEnv } from '../../lib/config/env.js';

export const shouldShowEsiaButton = (enabled: boolean): boolean => enabled;

export const esiaAuthorizeUrl = (apiBaseUrl: string, tenantId: string): string =>
  `${apiBaseUrl}/auth/esia/authorize?purpose=login&tenant_id=${encodeURIComponent(tenantId)}`;

export function EsiaLoginButton({ tenantId }: { tenantId: string }) {
  if (!shouldShowEsiaButton(frontendEnv.NEXT_PUBLIC_ESIA_ENABLED)) return null;
  const href = esiaAuthorizeUrl(frontendEnv.NEXT_PUBLIC_API_BASE_URL, tenantId);
  return (
    <a className="ui-button ui-button--secondary" href={href} data-testid="esia-login">
      Войти через Госуслуги
    </a>
  );
}
```

In `magic-link-form.tsx`, import and render `<EsiaLoginButton tenantId={...} />` below the submit
button (use the tenant id the form already has — `frontendEnv.NEXT_PUBLIC_DEFAULT_TENANT_ID` if the
form has no explicit tenant in scope).

- [ ] **Step 4: Run test + typecheck**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/features/auth/esia-login-button.test.ts --no-file-parallelism`
Expected: PASS (3 tests).
Run: `pnpm --filter @cdoprof/frontend exec tsc --noEmit -p tsconfig.json`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/auth/esia-login-button.tsx apps/frontend/src/features/auth/esia-login-button.test.ts apps/frontend/src/features/auth/magic-link-form.tsx
git commit -m "feat(frontend): «Войти через Госуслуги» button (flag-gated)"
```

---

## Task 14: Frontend — identity "Подтвердить через Госуслуги" + callback note

**Files:**

- Modify: `apps/frontend/src/features/identity-verification/screens.tsx`

- [ ] **Step 1: Add the flag-gated link in the upload section**

In `LearnerIdentityScreen`, where selfie/passport upload lives, add (only when the flag is on):

```tsx
{
  frontendEnv.NEXT_PUBLIC_ESIA_ENABLED && (
    <a
      className="ui-button ui-button--secondary"
      href={`${frontendEnv.NEXT_PUBLIC_API_BASE_URL}/auth/esia/authorize?purpose=identity&tenant_id=${encodeURIComponent(
        frontendEnv.NEXT_PUBLIC_DEFAULT_TENANT_ID
      )}`}
      data-testid="esia-identity"
    >
      Подтвердить через Госуслуги (альтернатива)
    </a>
  );
}
```

Import `frontendEnv` at the top if not already imported.

- [ ] **Step 2: Typecheck + existing identity tests still green**

Run: `pnpm --filter @cdoprof/frontend exec tsc --noEmit -p tsconfig.json`
Expected: PASS.
Run: `pnpm --filter @cdoprof/frontend exec vitest run src/features/identity-verification --no-file-parallelism`
Expected: PASS (unchanged behaviour when flag off).

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/features/identity-verification/screens.tsx
git commit -m "feat(frontend): «Подтвердить через Госуслуги» on identity screen (flag-gated)"
```

> The browser callback lands on backend `/auth/esia/callback`, which 302-redirects to
> `/learner?status=esia_ok` (login) or `/learner/identity?status=ok` (identity). No new frontend
> callback route is required for the pilot — the existing pages read the `status` query param. If a
> dedicated `/auth/esia/callback` page is desired later, add it as a thin status reader.

---

## Task 15: Docs + handoff

**Files:**

- Modify: `README.md` §2 (AI Agent State), `LMS_AGENT_HANDOFF.md` (new §5.130)

- [ ] **Step 1: Update README §2** — Current Stage/Last Completed Task/Last Updated At → ЕСИА seam (dormant) on branch `feat/2026-06-16-esia-oauth-login-identity`; note migrations unchanged (last 0053), no new permissions.

- [ ] **Step 2: Append `### 5.130`** to `LMS_AGENT_HANDOFF.md` §5: summary (login by СНИЛС, no auto-create; identity auto-approve; dormant seam mirroring esign/AV; Mock provider; EsiaOidc stub), files changed, test status, deviations, cross-link this plan + the spec, and the activation follow-up (ГОСТ signing + ИС status).

- [ ] **Step 3: Commit**

```bash
git add README.md LMS_AGENT_HANDOFF.md docs/superpowers/plans/2026-06-16-esia-oauth-login-identity.md
git commit -m "docs: ЕСИА login + identity seam — handoff §5.130 + plan checkboxes"
```

---

## Final verification

- [ ] Run the ЕСИА backend cluster:
      `pnpm --filter @cdoprof/backend exec vitest run src/infrastructure/esia src/modules/mvp/esia src/env.esia.test.ts src/modules/iam/services/auth-esia-method.test.ts src/modules/mvp/esia-identity.service.test.ts --no-file-parallelism`
      Expected: all PASS.
- [ ] Frontend: `pnpm --filter @cdoprof/frontend exec vitest run src/features/auth/esia-login-button.test.ts --no-file-parallelism` → PASS.
- [ ] `pnpm typecheck` → 8/8 projects pass.
- [ ] `npx eslint <each new/changed file> --max-warnings=0` → clean.
- [ ] Confirm dormant: with no env set, `/auth/esia/authorize` → 503 `esia_disabled`; both frontend buttons absent.

---

## Notes for the implementer

- **Decision A is load-bearing:** login resolves an existing learner by СНИЛС and NEVER creates a
  learner for an unknown citizen. `findOrCreateByEmail` is only reached AFTER a learner match, to
  create/link that learner's IAM user — that is linking, not signup.
- **Everything ships dormant.** `NoopEsiaProvider` refuses at every entry point; the flag default is
  `false`; both frontend buttons are flag-gated. A green test run must still leave production behaviour
  identical to today.
- **No migration, no new permission.** If you find yourself writing either, stop — it contradicts the
  spec; re-read §6/§7.
- **`Date.now()` caveat:** the seam util and service take an injected clock (`nowMs`) so unit tests are
  deterministic; only the module's `ESIA_SERVICE_CONFIG` provider calls real `Date.now()`.
