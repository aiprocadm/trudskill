# Phase 8 — Webinar Provider Seam Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dormant, multi-provider, per-tenant webinar seam over the existing `communication` CRUD stub: tenants pick a provider (Jitsi/Fake/Noop) whose `createSession` issues join links and whose `parseWebhook` records attendance — all asleep behind `WEBINARS_ENABLED=false`.

**Architecture:** Provider strategy registry + per-tenant resolver (not a single global DI token). `WebinarProvider` interface with `NoopWebinarProvider` (default), `FakeWebinarProvider` (staging, prod-guarded in the resolver), `JitsiWebinarProvider` (skeleton). A new `communication.webinar_provider_settings` table holds each tenant's non-secret provider choice. `WebinarsService.create` resolves the tenant's provider and calls `createSession` fail-soft; an unguarded `WebinarsWebhookController` resolves the tenant from `provider_session_id` and upserts participant attendance. The existing `WebinarsController` is hardened to project conventions (permissions + DTO validation).

**Tech Stack:** NestJS, TypeScript (ESM `.js` import suffix), PostgreSQL (raw SQL via `DatabaseService`), Zod env schema, Vitest, Next.js 15 App Router frontend.

---

## Conventions for every task

- **ESM imports** use the `.js` suffix even for `.ts` files (e.g. `import { X } from './x.js'`).
- **Run a single backend test file** (Cyrillic-path safe):
  `pnpm --filter @cdoprof/backend exec vitest run <relative-path> --no-file-parallelism`
- **Run a single frontend test file:**
  `pnpm --filter @cdoprof/frontend exec vitest run <relative-path> --no-file-parallelism`
- **Commit** after each task with the shown message. Never use `--no-verify`.
- All amounts/ids are strings unless noted. `tenant_demo` is the seeded demo tenant used in migration seeds and tests.

## File structure (created/modified)

Backend — `apps/backend/src/`:

- Create `infrastructure/webinar-provider/webinar.provider.ts` — interface + types + `NoopWebinarProvider` + `WEBINAR_PROVIDER_REGISTRY` token.
- Create `infrastructure/webinar-provider/fake-webinar.provider.ts` — staging provider.
- Create `infrastructure/webinar-provider/jitsi-webinar.provider.ts` — skeleton.
- Create `modules/communication/webinar-provider-resolver.service.ts` — registry + per-tenant resolver.
- Create `modules/communication/webinar-provider-settings.repository.ts` — interface + token.
- Create `modules/communication/in-memory-webinar-provider-settings.repository.ts`.
- Create `modules/communication/postgres-webinar-provider-settings.repository.ts`.
- Create `modules/communication/webinar-provider-settings.service.ts`.
- Create `modules/communication/webinars.dto.ts` — request DTOs.
- Create `modules/communication/webinars-webhook.controller.ts` — unguarded webhook.
- Modify `modules/communication/in-memory-webinars.state.ts` — add `findByProviderSessionId` + `upsertParticipantAttendance`.
- Modify `modules/communication/webinars.repository.ts` — extend interface.
- Modify `modules/communication/postgres-webinars.repository.ts` — implement new methods.
- Modify `modules/communication/webinars.service.ts` — provider wiring + my-webinars + attendance.
- Modify `modules/communication/webinars.controller.ts` — permissions + DTO + `/me/webinars` + settings endpoints.
- Modify `modules/communication/communication.module.ts` — register providers/registry/resolver/settings/webhook.
- Modify `env.schema.ts` — add `WEBINARS_ENABLED`.
- Create migration `migrations/0055_communication_webinar_provider_seam.sql`.

Frontend — `apps/frontend/`:

- Create `src/features/webinars/{types,api,hooks,screens}.ts(x)` + `api.contract.test.ts`.
- Create `app/admin/webinars/page.tsx`, `app/admin/webinars/settings/page.tsx`, `app/learner/webinars/page.tsx`.
- Modify `src/features/navigation/model.ts` — routeMeta + nav entries.
- Delete `app/webinars/page.tsx` + `src/lib/communication/webinars-api.ts` (superseded).
- Create `src/e2e/webinars.e2e.test.ts`.

---

### Task 1: Provider seam interface + Noop + registry token

**Files:**

- Create: `apps/backend/src/infrastructure/webinar-provider/webinar.provider.ts`
- Test: `apps/backend/src/infrastructure/webinar-provider/webinar.provider.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/infrastructure/webinar-provider/webinar.provider.test.ts
import { describe, expect, it } from 'vitest';

import { NoopWebinarProvider } from './webinar.provider.js';

describe('NoopWebinarProvider', () => {
  it('has id "noop"', () => {
    expect(new NoopWebinarProvider().code).toBe('noop');
  });

  it('createSession returns null (provider asleep)', async () => {
    const result = await new NoopWebinarProvider().createSession({
      tenantId: 't1',
      webinarId: 'w1',
      title: 'Intro',
      plannedStartAt: '2026-07-01T10:00:00.000Z',
      plannedEndAt: '2026-07-01T11:00:00.000Z'
    });
    expect(result).toBeNull();
  });

  it('parseWebhook returns null', async () => {
    const events = await new NoopWebinarProvider().parseWebhook(Buffer.from('{}'), {});
    expect(events).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/infrastructure/webinar-provider/webinar.provider.test.ts --no-file-parallelism`
Expected: FAIL — `Cannot find module './webinar.provider.js'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/infrastructure/webinar-provider/webinar.provider.ts
/**
 * Provider-agnostic seam for webinars, mirroring the PaymentProvider seam but multi-provider:
 * the active provider is chosen PER TENANT (see WebinarProviderResolver), not by one global env
 * enum. Noop is the safe default for any tenant with no/disabled provider config and for the whole
 * subsystem while WEBINARS_ENABLED=false. Real adapters (Jitsi, etc.) plug into the registry later.
 */
export type WebinarProviderCode = 'noop' | 'fake' | 'jitsi' | 'pruffme' | 'zoom' | 'bbb';

export interface CreateSessionInput {
  tenantId: string;
  webinarId: string;
  title: string;
  plannedStartAt: string;
  plannedEndAt: string;
}

export interface ProviderSession {
  providerSessionId: string;
  joinUrl: string;
  hostUrl: string;
}

export interface WebinarAttendanceEvent {
  providerSessionId: string;
  /** Stable participant key from the provider; matched to user_id or learner_id. */
  participantRef: string;
  type: 'joined' | 'left';
  occurredAt: string;
  durationSeconds?: number;
}

export interface WebinarProvider {
  readonly code: WebinarProviderCode;
  /** Returns null when the provider is asleep/unavailable (webinar still created, fail-soft). */
  createSession(input: CreateSessionInput): Promise<ProviderSession | null>;
  /** Verifies signature internally; returns null for unrecognized/unsigned payloads. */
  parseWebhook(
    raw: Buffer,
    headers: Record<string, string | undefined>
  ): Promise<WebinarAttendanceEvent[] | null>;
}

/** DI token for the registry of all compiled-in providers (Map<code, provider>). */
export const WEBINAR_PROVIDER_REGISTRY = Symbol('WEBINAR_PROVIDER_REGISTRY');
export type WebinarProviderRegistry = Map<WebinarProviderCode, WebinarProvider>;

export class NoopWebinarProvider implements WebinarProvider {
  readonly code = 'noop' as const;
  async createSession(): Promise<ProviderSession | null> {
    return null;
  }
  async parseWebhook(): Promise<WebinarAttendanceEvent[] | null> {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/infrastructure/webinar-provider/webinar.provider.test.ts --no-file-parallelism`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/infrastructure/webinar-provider/webinar.provider.ts apps/backend/src/infrastructure/webinar-provider/webinar.provider.test.ts
git commit -m "feat(backend): webinar provider seam interface + Noop + registry token"
```

---

### Task 2: Fake (staging) webinar provider

**Files:**

- Create: `apps/backend/src/infrastructure/webinar-provider/fake-webinar.provider.ts`
- Test: `apps/backend/src/infrastructure/webinar-provider/fake-webinar.provider.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/infrastructure/webinar-provider/fake-webinar.provider.test.ts
import { describe, expect, it } from 'vitest';

import { FakeWebinarProvider } from './fake-webinar.provider.js';

describe('FakeWebinarProvider', () => {
  it('createSession returns synthetic, self-marked URLs', async () => {
    const s = await new FakeWebinarProvider().createSession({
      tenantId: 't1',
      webinarId: 'w1',
      title: 'Intro',
      plannedStartAt: '2026-07-01T10:00:00.000Z',
      plannedEndAt: '2026-07-01T11:00:00.000Z'
    });
    expect(s?.providerSessionId).toBe('fake-webinar:w1');
    expect(s?.joinUrl).toContain('fake-webinar://');
    expect(s?.hostUrl).toContain('fake-webinar://');
  });

  it('parseWebhook maps a synthetic attendance payload', async () => {
    const raw = Buffer.from(
      JSON.stringify({
        providerSessionId: 'fake-webinar:w1',
        events: [{ participantRef: 'l1', type: 'joined', occurredAt: '2026-07-01T10:00:00.000Z' }]
      })
    );
    const events = await new FakeWebinarProvider().parseWebhook(raw, {});
    expect(events?.[0]?.participantRef).toBe('l1');
    expect(events?.[0]?.type).toBe('joined');
  });

  it('parseWebhook returns null for garbage', async () => {
    expect(await new FakeWebinarProvider().parseWebhook(Buffer.from('not json'), {})).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/infrastructure/webinar-provider/fake-webinar.provider.test.ts --no-file-parallelism`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/infrastructure/webinar-provider/fake-webinar.provider.ts
import type {
  CreateSessionInput,
  ProviderSession,
  WebinarAttendanceEvent,
  WebinarProvider
} from './webinar.provider.js';

/**
 * STAGING-ONLY webinar provider. Produces synthetic join/host URLs and accepts a synthetic
 * attendance webhook WITHOUT any real conferencing, so dev/staging can exercise
 * create → join → webhook → attendance end-to-end. FORBIDDEN in production by the resolver
 * (WebinarProviderResolver): prod must never present a fake meeting as real. URLs are
 * self-marked `fake-webinar://` so they are obviously not a real meeting.
 */
export class FakeWebinarProvider implements WebinarProvider {
  readonly code = 'fake' as const;

  async createSession(input: CreateSessionInput): Promise<ProviderSession | null> {
    return {
      providerSessionId: `fake-webinar:${input.webinarId}`,
      joinUrl: `fake-webinar://staging/join/${input.webinarId}`,
      hostUrl: `fake-webinar://staging/host/${input.webinarId}`
    };
  }

  async parseWebhook(raw: Buffer): Promise<WebinarAttendanceEvent[] | null> {
    try {
      const body = JSON.parse(raw.toString('utf8')) as {
        providerSessionId?: unknown;
        events?: unknown;
      };
      if (typeof body.providerSessionId !== 'string' || !Array.isArray(body.events)) return null;
      const out: WebinarAttendanceEvent[] = [];
      for (const e of body.events as Record<string, unknown>[]) {
        if (
          typeof e.participantRef !== 'string' ||
          (e.type !== 'joined' && e.type !== 'left') ||
          typeof e.occurredAt !== 'string'
        ) {
          return null;
        }
        out.push({
          providerSessionId: body.providerSessionId,
          participantRef: e.participantRef,
          type: e.type,
          occurredAt: e.occurredAt,
          ...(typeof e.durationSeconds === 'number' ? { durationSeconds: e.durationSeconds } : {})
        });
      }
      return out;
    } catch {
      return null;
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/infrastructure/webinar-provider/fake-webinar.provider.test.ts --no-file-parallelism`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/infrastructure/webinar-provider/fake-webinar.provider.ts apps/backend/src/infrastructure/webinar-provider/fake-webinar.provider.test.ts
git commit -m "feat(backend): fake (staging) webinar provider"
```

---

### Task 3: Jitsi webinar provider skeleton

**Files:**

- Create: `apps/backend/src/infrastructure/webinar-provider/jitsi-webinar.provider.ts`
- Test: `apps/backend/src/infrastructure/webinar-provider/jitsi-webinar.provider.test.ts`

The self-hosted Jitsi adapter is the realistic first real provider, but real room creation / JWT /
HMAC verification are activation follow-ups. This skeleton self-identifies and stays inert
(returns null) so it can sit in the registry without pretending to work.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/infrastructure/webinar-provider/jitsi-webinar.provider.test.ts
import { describe, expect, it } from 'vitest';

import { JitsiWebinarProvider } from './jitsi-webinar.provider.js';

describe('JitsiWebinarProvider (skeleton)', () => {
  it('has code "jitsi"', () => {
    expect(new JitsiWebinarProvider('https://meet.example.org').code).toBe('jitsi');
  });

  it('createSession returns null until the real adapter is implemented', async () => {
    const result = await new JitsiWebinarProvider('https://meet.example.org').createSession({
      tenantId: 't1',
      webinarId: 'w1',
      title: 'Intro',
      plannedStartAt: '2026-07-01T10:00:00.000Z',
      plannedEndAt: '2026-07-01T11:00:00.000Z'
    });
    expect(result).toBeNull();
  });

  it('parseWebhook returns null', async () => {
    expect(
      await new JitsiWebinarProvider('https://meet.example.org').parseWebhook(Buffer.from('{}'), {})
    ).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/infrastructure/webinar-provider/jitsi-webinar.provider.test.ts --no-file-parallelism`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/infrastructure/webinar-provider/jitsi-webinar.provider.ts
import type {
  CreateSessionInput,
  ProviderSession,
  WebinarAttendanceEvent,
  WebinarProvider
} from './webinar.provider.js';

/**
 * Skeleton for a SELF-HOSTED Jitsi Meet adapter — the «собственное решение». Activation follow-up
 * implements: room name derivation, moderator/attendee JWT (app id + secret), and webhook signature
 * verification (Jitsi/Prosody events). Until then it returns null so the registry can list it
 * without presenting a non-functional meeting. baseUrl comes from per-tenant settings; the JWT
 * secret will come from a secret-ref (NOT the settings table) at activation time.
 */
export class JitsiWebinarProvider implements WebinarProvider {
  readonly code = 'jitsi' as const;
  constructor(private readonly baseUrl: string) {}

  async createSession(_input: CreateSessionInput): Promise<ProviderSession | null> {
    console.warn(
      `[webinars] JitsiWebinarProvider is a skeleton (baseUrl=${this.baseUrl}); no room created — implement the real adapter to activate`
    );
    return null;
  }

  async parseWebhook(): Promise<WebinarAttendanceEvent[] | null> {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/infrastructure/webinar-provider/jitsi-webinar.provider.test.ts --no-file-parallelism`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/infrastructure/webinar-provider/jitsi-webinar.provider.ts apps/backend/src/infrastructure/webinar-provider/jitsi-webinar.provider.test.ts
git commit -m "feat(backend): jitsi webinar provider skeleton (self-hosted, dormant)"
```

---

### Task 4: `WEBINARS_ENABLED` env flag

**Files:**

- Modify: `apps/backend/src/env.schema.ts` (add flag next to `PAYMENTS_ENABLED`, ~line 70)
- Test: `apps/backend/src/env.webinars.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/env.webinars.test.ts
import { describe, expect, it } from 'vitest';

import { envSchema } from './env.schema.js';

const base = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  JWT_SECRET: 'x'.repeat(32),
  SESSION_SECRET: 'y'.repeat(32)
};

describe('WEBINARS_ENABLED env flag', () => {
  it('defaults to false', () => {
    const env = envSchema.parse({ ...base });
    expect(env.WEBINARS_ENABLED).toBe(false);
  });

  it('parses the literal string "true" (custom boolean parse)', () => {
    const env = envSchema.parse({ ...base, WEBINARS_ENABLED: 'true' });
    expect(env.WEBINARS_ENABLED).toBe(true);
  });

  it('treats "false" as false (not coerced-true)', () => {
    const env = envSchema.parse({ ...base, WEBINARS_ENABLED: 'false' });
    expect(env.WEBINARS_ENABLED).toBe(false);
  });
});
```

> NOTE: if the existing env requires more mandatory keys, copy the `base` object from
> `apps/backend/src/env.esign.test.ts` so the schema parses; only `WEBINARS_ENABLED` assertions matter.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/env.webinars.test.ts --no-file-parallelism`
Expected: FAIL — `WEBINARS_ENABLED` is undefined.

- [ ] **Step 3: Write minimal implementation**

In `apps/backend/src/env.schema.ts`, immediately after the `PAYMENTS_CURRENCY` field (≈ line 77), add:

```typescript
    // Phase 8 webinars seam master switch. Ships dormant (false → every tenant resolves to
    // NoopWebinarProvider regardless of their saved provider_code). Custom boolean parse — NOT
    // z.coerce.boolean (string "false" → true) — so the subsystem is never accidentally on.
    WEBINARS_ENABLED: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((v) => v === true || v === 'true')
      .default(false),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/env.webinars.test.ts --no-file-parallelism`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/env.schema.ts apps/backend/src/env.webinars.test.ts
git commit -m "feat(backend): WEBINARS_ENABLED env flag (dormant master switch)"
```

---

### Task 5: Migration 0055 — permissions + settings table + index

**Files:**

- Create: `apps/backend/migrations/0055_communication_webinar_provider_seam.sql`
- Test: `apps/backend/src/modules/communication/migrations.0055.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/modules/communication/migrations.0055.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/communication/migrations.0055.test.ts --no-file-parallelism`
Expected: FAIL — file does not exist (ENOENT).

- [ ] **Step 3: Write minimal implementation**

```sql
-- apps/backend/migrations/0055_communication_webinar_provider_seam.sql
-- Phase 8 — provider-agnostic webinar seam (dormant, multi-provider, per-tenant).
-- No changes to communication.webinars / webinar_participants (they exist since 0007 with all
-- needed columns). This migration adds: (1) four webinar permissions, (2) a per-tenant provider
-- settings table holding NON-SECRET config only, (3) a lookup index for the webhook tenant resolve.

insert into iam.permissions (id, code, description)
values
  ('p_webinars_read', 'webinars.read', 'List/read webinars and participants'),
  ('p_webinars_write', 'webinars.write', 'Create/manage webinars and participants'),
  ('p_webinars_attend', 'webinars.attend', 'View own webinars and obtain join link (learner)'),
  ('p_webinars_configure', 'webinars.configure', 'Configure the tenant webinar provider')
on conflict (id) do nothing;

insert into iam.role_permissions (id, tenant_id, role_id, permission_id)
select concat('rp_', r.id, '_', p.id), r.tenant_id, r.id, p.id
from iam.roles r
join iam.permissions p on true
where r.tenant_id = 'tenant_demo'
  and (
    (p.code in ('webinars.read', 'webinars.write') and r.code in ('platform_admin', 'tenant_admin', 'methodist'))
    or (p.code = 'webinars.attend' and r.code = 'learner')
    or (p.code = 'webinars.configure' and r.code in ('platform_admin', 'tenant_admin'))
  )
on conflict (tenant_id, role_id, permission_id) do nothing;

create table if not exists communication.webinar_provider_settings (
  tenant_id text primary key,
  provider_code text not null default 'noop',
  base_url text null,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_webinars_provider_session_id
  on communication.webinars (provider_session_id)
  where provider_session_id is not null;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/communication/migrations.0055.test.ts --no-file-parallelism`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/migrations/0055_communication_webinar_provider_seam.sql apps/backend/src/modules/communication/migrations.0055.test.ts
git commit -m "feat(backend): migration 0055 — webinar permissions + provider settings + index"
```

---

### Task 6: Provider settings repository (interface + in-memory + token)

**Files:**

- Create: `apps/backend/src/modules/communication/webinar-provider-settings.repository.ts`
- Create: `apps/backend/src/modules/communication/in-memory-webinar-provider-settings.repository.ts`
- Test: `apps/backend/src/modules/communication/in-memory-webinar-provider-settings.repository.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/modules/communication/in-memory-webinar-provider-settings.repository.test.ts
import { describe, expect, it } from 'vitest';

import { InMemoryWebinarProviderSettingsRepository } from './in-memory-webinar-provider-settings.repository.js';

describe('InMemoryWebinarProviderSettingsRepository', () => {
  it('returns null when a tenant has no settings', async () => {
    const repo = new InMemoryWebinarProviderSettingsRepository();
    expect(await repo.get('t1')).toBeNull();
  });

  it('upserts and reads back settings', async () => {
    const repo = new InMemoryWebinarProviderSettingsRepository();
    const saved = await repo.upsert('t1', {
      providerCode: 'jitsi',
      baseUrl: 'https://meet.example.org',
      enabled: true
    });
    expect(saved.providerCode).toBe('jitsi');
    const read = await repo.get('t1');
    expect(read?.enabled).toBe(true);
    expect(read?.baseUrl).toBe('https://meet.example.org');
  });

  it('upsert overwrites an existing row', async () => {
    const repo = new InMemoryWebinarProviderSettingsRepository();
    await repo.upsert('t1', { providerCode: 'jitsi', enabled: true });
    const updated = await repo.upsert('t1', { providerCode: 'noop', enabled: false });
    expect(updated.providerCode).toBe('noop');
    expect(updated.enabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/communication/in-memory-webinar-provider-settings.repository.test.ts --no-file-parallelism`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/modules/communication/webinar-provider-settings.repository.ts
import type { WebinarProviderCode } from '../../infrastructure/webinar-provider/webinar.provider.js';

export const WEBINAR_PROVIDER_SETTINGS_REPOSITORY = Symbol('WEBINAR_PROVIDER_SETTINGS_REPOSITORY');

export interface WebinarProviderSettings {
  tenantId: string;
  providerCode: WebinarProviderCode;
  baseUrl?: string;
  enabled: boolean;
  updatedAt: string;
}

export interface WebinarProviderSettingsInput {
  providerCode: WebinarProviderCode;
  baseUrl?: string;
  enabled: boolean;
}

export interface WebinarProviderSettingsRepository {
  get(tenantId: string): Promise<WebinarProviderSettings | null>;
  upsert(tenantId: string, input: WebinarProviderSettingsInput): Promise<WebinarProviderSettings>;
}
```

```typescript
// apps/backend/src/modules/communication/in-memory-webinar-provider-settings.repository.ts
import { Injectable } from '@nestjs/common';

import type {
  WebinarProviderSettings,
  WebinarProviderSettingsInput,
  WebinarProviderSettingsRepository
} from './webinar-provider-settings.repository.js';

@Injectable()
export class InMemoryWebinarProviderSettingsRepository implements WebinarProviderSettingsRepository {
  private readonly rows = new Map<string, WebinarProviderSettings>();

  async get(tenantId: string): Promise<WebinarProviderSettings | null> {
    return this.rows.get(tenantId) ?? null;
  }

  async upsert(
    tenantId: string,
    input: WebinarProviderSettingsInput
  ): Promise<WebinarProviderSettings> {
    const row: WebinarProviderSettings = {
      tenantId,
      providerCode: input.providerCode,
      enabled: input.enabled,
      updatedAt: new Date().toISOString(),
      ...(input.baseUrl ? { baseUrl: input.baseUrl } : {})
    };
    this.rows.set(tenantId, row);
    return row;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/communication/in-memory-webinar-provider-settings.repository.test.ts --no-file-parallelism`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/communication/webinar-provider-settings.repository.ts apps/backend/src/modules/communication/in-memory-webinar-provider-settings.repository.ts apps/backend/src/modules/communication/in-memory-webinar-provider-settings.repository.test.ts
git commit -m "feat(backend): webinar provider settings repository (interface + in-memory)"
```

---

### Task 7: Postgres provider settings repository

**Files:**

- Create: `apps/backend/src/modules/communication/postgres-webinar-provider-settings.repository.ts`

No new test file (exercised via HTTP integration in Task 14; the in-memory impl is the unit-tested
contract). Mirror `PostgresWebinarsRepository` style.

- [ ] **Step 1: Write the implementation**

```typescript
// apps/backend/src/modules/communication/postgres-webinar-provider-settings.repository.ts
import { Inject, Injectable } from '@nestjs/common';

import type {
  WebinarProviderSettings,
  WebinarProviderSettingsInput,
  WebinarProviderSettingsRepository
} from './webinar-provider-settings.repository.js';
import { DatabaseService } from '../../infrastructure/database/database.service.js';
import type { WebinarProviderCode } from '../../infrastructure/webinar-provider/webinar.provider.js';

@Injectable()
export class PostgresWebinarProviderSettingsRepository implements WebinarProviderSettingsRepository {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async get(tenantId: string): Promise<WebinarProviderSettings | null> {
    const rows = await this.db.query<{
      tenant_id: string;
      provider_code: WebinarProviderCode;
      base_url: string | null;
      enabled: boolean;
      updated_at: string;
    }>(
      `select tenant_id, provider_code, base_url, enabled, updated_at
       from communication.webinar_provider_settings where tenant_id = $1`,
      [tenantId]
    );
    const row = rows[0];
    if (!row) return null;
    return {
      tenantId: row.tenant_id,
      providerCode: row.provider_code,
      enabled: row.enabled,
      updatedAt: row.updated_at,
      ...(row.base_url ? { baseUrl: row.base_url } : {})
    };
  }

  async upsert(
    tenantId: string,
    input: WebinarProviderSettingsInput
  ): Promise<WebinarProviderSettings> {
    const updatedAt = new Date().toISOString();
    await this.db.query(
      `insert into communication.webinar_provider_settings
         (tenant_id, provider_code, base_url, enabled, updated_at)
       values ($1, $2, $3, $4, $5::timestamptz)
       on conflict (tenant_id) do update set
         provider_code = excluded.provider_code,
         base_url = excluded.base_url,
         enabled = excluded.enabled,
         updated_at = excluded.updated_at`,
      [tenantId, input.providerCode, input.baseUrl ?? null, input.enabled, updatedAt]
    );
    return {
      tenantId,
      providerCode: input.providerCode,
      enabled: input.enabled,
      updatedAt,
      ...(input.baseUrl ? { baseUrl: input.baseUrl } : {})
    };
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @cdoprof/backend exec tsc --noEmit`
Expected: PASS (no errors in the new file).

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/modules/communication/postgres-webinar-provider-settings.repository.ts
git commit -m "feat(backend): postgres webinar provider settings repository"
```

---

### Task 8: Provider settings service

**Files:**

- Create: `apps/backend/src/modules/communication/webinar-provider-settings.service.ts`
- Test: `apps/backend/src/modules/communication/webinar-provider-settings.service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/modules/communication/webinar-provider-settings.service.test.ts
import { describe, expect, it } from 'vitest';

import { InMemoryWebinarProviderSettingsRepository } from './in-memory-webinar-provider-settings.repository.js';
import { WebinarProviderSettingsService } from './webinar-provider-settings.service.js';

const make = () => {
  const repo = new InMemoryWebinarProviderSettingsRepository();
  return { repo, service: new WebinarProviderSettingsService(repo) };
};

describe('WebinarProviderSettingsService', () => {
  it('returns a default noop/disabled view when unset', async () => {
    const { service } = make();
    const view = await service.get('t1');
    expect(view.providerCode).toBe('noop');
    expect(view.enabled).toBe(false);
  });

  it('saves and returns settings', async () => {
    const { service } = make();
    const saved = await service.save('t1', {
      providerCode: 'jitsi',
      baseUrl: 'https://meet.example.org',
      enabled: true
    });
    expect(saved.providerCode).toBe('jitsi');
    expect((await service.get('t1')).enabled).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/communication/webinar-provider-settings.service.test.ts --no-file-parallelism`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/modules/communication/webinar-provider-settings.service.ts
import { Inject, Injectable } from '@nestjs/common';

import {
  WEBINAR_PROVIDER_SETTINGS_REPOSITORY,
  type WebinarProviderSettings,
  type WebinarProviderSettingsInput,
  type WebinarProviderSettingsRepository
} from './webinar-provider-settings.repository.js';

@Injectable()
export class WebinarProviderSettingsService {
  constructor(
    @Inject(WEBINAR_PROVIDER_SETTINGS_REPOSITORY)
    private readonly repo: WebinarProviderSettingsRepository
  ) {}

  /** Returns the saved settings or a safe default view (noop, disabled). */
  async get(tenantId: string): Promise<WebinarProviderSettings> {
    const saved = await this.repo.get(tenantId);
    if (saved) return saved;
    return {
      tenantId,
      providerCode: 'noop',
      enabled: false,
      updatedAt: new Date(0).toISOString()
    };
  }

  async save(
    tenantId: string,
    input: WebinarProviderSettingsInput
  ): Promise<WebinarProviderSettings> {
    return this.repo.upsert(tenantId, input);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/communication/webinar-provider-settings.service.test.ts --no-file-parallelism`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/communication/webinar-provider-settings.service.ts apps/backend/src/modules/communication/webinar-provider-settings.service.test.ts
git commit -m "feat(backend): webinar provider settings service (default-noop view)"
```

---

### Task 9: Provider registry + per-tenant resolver

**Files:**

- Create: `apps/backend/src/modules/communication/webinar-provider-resolver.service.ts`
- Test: `apps/backend/src/modules/communication/webinar-provider-resolver.service.test.ts`

This is the heart of the multi-provider/per-tenant design and where the `fake`-in-production guard lives.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/modules/communication/webinar-provider-resolver.service.test.ts
import { describe, expect, it } from 'vitest';

import { InMemoryWebinarProviderSettingsRepository } from './in-memory-webinar-provider-settings.repository.js';
import { WebinarProviderResolver } from './webinar-provider-resolver.service.js';
import { WebinarProviderSettingsService } from './webinar-provider-settings.service.js';
import { FakeWebinarProvider } from '../../infrastructure/webinar-provider/fake-webinar.provider.js';
import {
  NoopWebinarProvider,
  type WebinarProviderRegistry
} from '../../infrastructure/webinar-provider/webinar.provider.js';

const registry: WebinarProviderRegistry = new Map([
  ['noop', new NoopWebinarProvider()],
  ['fake', new FakeWebinarProvider()]
]);

const make = (opts: { enabledGlobally: boolean; nodeEnv: string }) => {
  const repo = new InMemoryWebinarProviderSettingsRepository();
  const settings = new WebinarProviderSettingsService(repo);
  const resolver = new WebinarProviderResolver(
    registry,
    settings,
    opts.enabledGlobally,
    opts.nodeEnv
  );
  return { repo, settings, resolver };
};

describe('WebinarProviderResolver', () => {
  it('resolves Noop when WEBINARS_ENABLED is false even if tenant picked fake', async () => {
    const { settings, resolver } = make({ enabledGlobally: false, nodeEnv: 'staging' });
    await settings.save('t1', { providerCode: 'fake', enabled: true });
    expect((await resolver.forTenant('t1')).code).toBe('noop');
  });

  it('resolves Noop when the tenant has no/disabled settings', async () => {
    const { resolver } = make({ enabledGlobally: true, nodeEnv: 'staging' });
    expect((await resolver.forTenant('t1')).code).toBe('noop');
  });

  it('resolves the tenant provider when enabled globally + per-tenant', async () => {
    const { settings, resolver } = make({ enabledGlobally: true, nodeEnv: 'staging' });
    await settings.save('t1', { providerCode: 'fake', enabled: true });
    expect((await resolver.forTenant('t1')).code).toBe('fake');
  });

  it('forces Noop for a fake provider in production (prod-guard)', async () => {
    const { settings, resolver } = make({ enabledGlobally: true, nodeEnv: 'production' });
    await settings.save('t1', { providerCode: 'fake', enabled: true });
    expect((await resolver.forTenant('t1')).code).toBe('noop');
  });

  it('resolves Noop for an unregistered provider code', async () => {
    const { settings, resolver } = make({ enabledGlobally: true, nodeEnv: 'staging' });
    await settings.save('t1', { providerCode: 'zoom', enabled: true });
    expect((await resolver.forTenant('t1')).code).toBe('noop');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/communication/webinar-provider-resolver.service.test.ts --no-file-parallelism`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/modules/communication/webinar-provider-resolver.service.ts
import { Inject, Injectable } from '@nestjs/common';

import { WebinarProviderSettingsService } from './webinar-provider-settings.service.js';
import { backendEnv } from '../../env.js';
import {
  NoopWebinarProvider,
  WEBINAR_PROVIDER_REGISTRY,
  type WebinarProvider,
  type WebinarProviderRegistry
} from '../../infrastructure/webinar-provider/webinar.provider.js';

/**
 * Resolves the active WebinarProvider FOR A TENANT. Unlike the single-token PaymentProvider, the
 * webinar provider is per-tenant (different учебные центры → different providers). This is also
 * where the prod-guard lives: a tenant whose saved provider is `fake` is forced to Noop in
 * production (env refinement can't catch it — env doesn't name the per-tenant provider).
 */
@Injectable()
export class WebinarProviderResolver {
  private readonly noop = new NoopWebinarProvider();

  constructor(
    @Inject(WEBINAR_PROVIDER_REGISTRY) private readonly registry: WebinarProviderRegistry,
    @Inject(WebinarProviderSettingsService)
    private readonly settings: WebinarProviderSettingsService,
    // Overridable in tests; defaults to real env at DI time (see provider factory in the module).
    private readonly enabledGlobally: boolean = backendEnv.WEBINARS_ENABLED,
    private readonly nodeEnv: string = backendEnv.NODE_ENV
  ) {}

  async forTenant(tenantId: string): Promise<WebinarProvider> {
    if (!this.enabledGlobally) return this.noop;
    const cfg = await this.settings.get(tenantId);
    if (!cfg.enabled || cfg.providerCode === 'noop') return this.noop;
    if (cfg.providerCode === 'fake' && this.nodeEnv === 'production') {
      console.warn(
        `[webinars] tenant ${tenantId} has provider=fake in production — forcing Noop (fake is staging-only)`
      );
      return this.noop;
    }
    return this.registry.get(cfg.providerCode) ?? this.noop;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/communication/webinar-provider-resolver.service.test.ts --no-file-parallelism`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/communication/webinar-provider-resolver.service.ts apps/backend/src/modules/communication/webinar-provider-resolver.service.test.ts
git commit -m "feat(backend): per-tenant webinar provider resolver (registry + prod-guard)"
```

---

### Task 10: Repository extensions — webhook lookup + attendance upsert

**Files:**

- Modify: `apps/backend/src/modules/communication/webinars.repository.ts` (extend interface)
- Modify: `apps/backend/src/modules/communication/in-memory-webinars.state.ts`
- Modify: `apps/backend/src/modules/communication/postgres-webinars.repository.ts`
- Test: `apps/backend/src/modules/communication/in-memory-webinars.state.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/modules/communication/in-memory-webinars.state.test.ts
import { describe, expect, it } from 'vitest';

import { InMemoryWebinarsState } from './in-memory-webinars.state.js';

const baseWebinar = {
  id: 'w1',
  tenantId: 't1',
  title: 'Intro',
  plannedStartAt: '2026-07-01T10:00:00.000Z',
  plannedEndAt: '2026-07-01T11:00:00.000Z',
  status: 'planned' as const,
  createdBy: 'u1',
  createdAt: '2026-07-01T09:00:00.000Z',
  updatedAt: '2026-07-01T09:00:00.000Z'
};

describe('InMemoryWebinarsState — provider/attendance extensions', () => {
  it('findByProviderSessionId locates a webinar across tenants', async () => {
    const state = new InMemoryWebinarsState();
    await state.create({ ...baseWebinar, providerSessionId: 'ps_1' });
    const found = await state.findByProviderSessionId('ps_1');
    expect(found?.tenantId).toBe('t1');
    expect(await state.findByProviderSessionId('missing')).toBeNull();
  });

  it('upsertParticipantAttendance creates then updates a participant', async () => {
    const state = new InMemoryWebinarsState();
    await state.create(baseWebinar);
    await state.upsertParticipantAttendance('t1', 'w1', {
      participantRef: 'l1',
      attendanceStatus: 'joined',
      joinedAt: '2026-07-01T10:00:00.000Z'
    });
    await state.upsertParticipantAttendance('t1', 'w1', {
      participantRef: 'l1',
      attendanceStatus: 'left',
      leftAt: '2026-07-01T10:30:00.000Z',
      durationSeconds: 1800
    });
    const { items } = await state.listParticipants('t1', 'w1', {});
    expect(items).toHaveLength(1);
    expect(items[0]?.attendanceStatus).toBe('left');
    expect(items[0]?.durationSeconds).toBe(1800);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/communication/in-memory-webinars.state.test.ts --no-file-parallelism`
Expected: FAIL — `findByProviderSessionId` is not a function.

- [ ] **Step 3a: Extend the interface**

In `apps/backend/src/modules/communication/webinars.repository.ts`, add to the `WebinarsRepository` interface (after `addParticipant`):

```typescript
  findByProviderSessionId(providerSessionId: string): Promise<WebinarRow | null>;
  upsertParticipantAttendance(
    tenantId: string,
    webinarId: string,
    update: AttendanceUpdate
  ): Promise<void>;
```

And add this exported type at the top of the same file (after the imports):

```typescript
export interface AttendanceUpdate {
  /** Matches participant by user_id OR learner_id (provider participant key). */
  participantRef: string;
  attendanceStatus: WebinarParticipantRow['attendanceStatus'];
  joinedAt?: string;
  leftAt?: string;
  durationSeconds?: number;
}
```

- [ ] **Step 3b: Implement in the in-memory state**

In `apps/backend/src/modules/communication/in-memory-webinars.state.ts`, import the new type:

```typescript
import type {
  AttendanceUpdate,
  WebinarParticipantsQuery,
  WebinarsQuery,
  WebinarsRepository
} from './webinars.repository.js';
```

Add these two methods to the `InMemoryWebinarsState` class:

```typescript
  async findByProviderSessionId(providerSessionId: string) {
    return this.webinars.find((w) => w.providerSessionId === providerSessionId) ?? null;
  }

  async upsertParticipantAttendance(
    tenantId: string,
    webinarId: string,
    update: AttendanceUpdate
  ) {
    const existing = this.participants.find(
      (p) =>
        p.tenantId === tenantId &&
        p.webinarId === webinarId &&
        (p.learnerId === update.participantRef || p.userId === update.participantRef)
    );
    if (existing) {
      existing.attendanceStatus = update.attendanceStatus;
      if (update.joinedAt) existing.joinedAt = update.joinedAt;
      if (update.leftAt) existing.leftAt = update.leftAt;
      if (update.durationSeconds !== undefined) existing.durationSeconds = update.durationSeconds;
      return;
    }
    this.participants.push({
      webinarId,
      tenantId,
      learnerId: update.participantRef,
      roleCode: 'attendee',
      attendanceStatus: update.attendanceStatus,
      ...(update.joinedAt ? { joinedAt: update.joinedAt } : {}),
      ...(update.leftAt ? { leftAt: update.leftAt } : {}),
      ...(update.durationSeconds !== undefined ? { durationSeconds: update.durationSeconds } : {})
    });
  }
```

- [ ] **Step 3c: Implement in the postgres repository**

In `apps/backend/src/modules/communication/postgres-webinars.repository.ts`, import the type
(extend the existing `import type { ... } from './webinars.repository.js'` to include `AttendanceUpdate`)
and add these methods to the class:

```typescript
  async findByProviderSessionId(providerSessionId: string) {
    const rows = await this.db.query<any>(
      'select * from communication.webinars where provider_session_id = $1 limit 1',
      [providerSessionId]
    );
    return rows[0] ? this.map(rows[0]) : null;
  }

  async upsertParticipantAttendance(
    tenantId: string,
    webinarId: string,
    update: AttendanceUpdate
  ) {
    const existing = await this.db.query<{ id: string }>(
      `select id from communication.webinar_participants
       where tenant_id = $1 and webinar_id = $2 and (learner_id = $3 or user_id = $3) limit 1`,
      [tenantId, webinarId, update.participantRef]
    );
    if (existing[0]) {
      await this.db.query(
        `update communication.webinar_participants set
           attendance_status = $1,
           joined_at = coalesce($2::timestamptz, joined_at),
           left_at = coalesce($3::timestamptz, left_at),
           duration_seconds = coalesce($4, duration_seconds)
         where id = $5`,
        [
          update.attendanceStatus,
          update.joinedAt ?? null,
          update.leftAt ?? null,
          update.durationSeconds ?? null,
          existing[0].id
        ]
      );
      return;
    }
    await this.db.query(
      `insert into communication.webinar_participants
       (id, tenant_id, webinar_id, user_id, learner_id, role_code, attendance_status, joined_at, left_at, duration_seconds)
       values ($1,$2,$3,null,$4,'attendee',$5,$6::timestamptz,$7::timestamptz,$8)`,
      [
        `wp_${Math.random().toString(36).slice(2, 10)}`,
        tenantId,
        webinarId,
        update.participantRef,
        update.attendanceStatus,
        update.joinedAt ?? null,
        update.leftAt ?? null,
        update.durationSeconds ?? null
      ]
    );
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/communication/in-memory-webinars.state.test.ts --no-file-parallelism`
Expected: PASS (2 tests). Also run `pnpm --filter @cdoprof/backend exec tsc --noEmit` — expect no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/communication/webinars.repository.ts apps/backend/src/modules/communication/in-memory-webinars.state.ts apps/backend/src/modules/communication/postgres-webinars.repository.ts apps/backend/src/modules/communication/in-memory-webinars.state.test.ts
git commit -m "feat(backend): webinar repo — provider-session lookup + attendance upsert"
```

---

### Task 11: Request DTOs + validation

**Files:**

- Create: `apps/backend/src/modules/communication/webinars.dto.ts`
- Test: `apps/backend/src/modules/communication/webinars.dto-validation.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/modules/communication/webinars.dto-validation.test.ts
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { CreateWebinarRequest, ProviderSettingsRequest } from './webinars.dto.js';

const errs = (cls: any, raw: unknown) => validateSync(plainToInstance(cls, raw));

describe('webinars DTOs', () => {
  it('accepts a valid CreateWebinarRequest', () => {
    expect(
      errs(CreateWebinarRequest, {
        title: 'Intro to OT',
        plannedStartAt: '2026-07-01T10:00:00.000Z',
        plannedEndAt: '2026-07-01T11:00:00.000Z'
      })
    ).toHaveLength(0);
  });

  it('rejects a CreateWebinarRequest with an empty title', () => {
    expect(
      errs(CreateWebinarRequest, { title: '', plannedStartAt: 'x', plannedEndAt: 'y' }).length
    ).toBeGreaterThan(0);
  });

  it('accepts a valid ProviderSettingsRequest', () => {
    expect(
      errs(ProviderSettingsRequest, {
        providerCode: 'jitsi',
        baseUrl: 'https://meet.example.org',
        enabled: true
      })
    ).toHaveLength(0);
  });

  it('rejects an unknown provider code', () => {
    expect(
      errs(ProviderSettingsRequest, { providerCode: 'skype', enabled: true }).length
    ).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/communication/webinars.dto-validation.test.ts --no-file-parallelism`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// apps/backend/src/modules/communication/webinars.dto.ts
import {
  IsBoolean,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength
} from 'class-validator';

const PROVIDER_CODES = ['noop', 'fake', 'jitsi', 'pruffme', 'zoom', 'bbb'] as const;

export class CreateWebinarRequest {
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  groupId?: string;

  @IsOptional()
  @IsString()
  courseId?: string;

  @IsISO8601()
  plannedStartAt!: string;

  @IsISO8601()
  plannedEndAt!: string;
}

export class AddParticipantRequest {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  learnerId?: string;

  @IsString()
  @MinLength(1)
  roleCode!: string;
}

export class ProviderSettingsRequest {
  @IsIn(PROVIDER_CODES as unknown as string[])
  providerCode!: (typeof PROVIDER_CODES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  baseUrl?: string;

  @IsBoolean()
  enabled!: boolean;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/communication/webinars.dto-validation.test.ts --no-file-parallelism`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/communication/webinars.dto.ts apps/backend/src/modules/communication/webinars.dto-validation.test.ts
git commit -m "feat(backend): webinar request DTOs + validation"
```

---

### Task 12: Service — create wiring (fail-soft) + my-webinars + attendance

**Files:**

- Modify: `apps/backend/src/modules/communication/webinars.service.ts`
- Test: `apps/backend/src/modules/communication/webinars.service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/backend/src/modules/communication/webinars.service.test.ts
import { describe, expect, it, vi } from 'vitest';

import { InMemoryWebinarsState } from './in-memory-webinars.state.js';
import { WebinarsService } from './webinars.service.js';
import type { WebinarProviderResolver } from './webinar-provider-resolver.service.js';
import type { WebinarProvider } from '../../infrastructure/webinar-provider/webinar.provider.js';

const realtime = { publish: vi.fn() } as any;

const resolverWith = (provider: Partial<WebinarProvider>): WebinarProviderResolver =>
  ({
    forTenant: async () => ({
      code: 'fake',
      createSession: async () => null,
      parseWebhook: async () => null,
      ...provider
    })
  }) as unknown as WebinarProviderResolver;

const body = {
  title: 'Intro',
  plannedStartAt: '2026-07-01T10:00:00.000Z',
  plannedEndAt: '2026-07-01T11:00:00.000Z'
};

describe('WebinarsService.create — provider wiring (fail-soft)', () => {
  it('stores provider session fields when createSession succeeds', async () => {
    const state = new InMemoryWebinarsState();
    const service = new WebinarsService(
      state,
      realtime,
      resolverWith({
        createSession: async () => ({
          providerSessionId: 'ps_1',
          joinUrl: 'https://join',
          hostUrl: 'https://host'
        })
      })
    );
    const w = await service.create('t1', 'u1', body);
    expect(w.providerSessionId).toBe('ps_1');
    expect(w.joinUrl).toBe('https://join');
    expect(w.providerCode).toBe('fake');
  });

  it('still creates the webinar when the provider returns null', async () => {
    const state = new InMemoryWebinarsState();
    const service = new WebinarsService(
      state,
      realtime,
      resolverWith({ createSession: async () => null })
    );
    const w = await service.create('t1', 'u1', body);
    expect(w.status).toBe('planned');
    expect(w.joinUrl).toBeUndefined();
  });

  it('still creates the webinar when the provider throws (fail-soft)', async () => {
    const state = new InMemoryWebinarsState();
    const service = new WebinarsService(
      state,
      realtime,
      resolverWith({
        createSession: async () => {
          throw new Error('provider down');
        }
      })
    );
    const w = await service.create('t1', 'u1', body);
    expect(w.status).toBe('planned');
    expect(w.providerSessionId).toBeUndefined();
  });

  it('listMine returns only webinars the learner participates in', async () => {
    const state = new InMemoryWebinarsState();
    const service = new WebinarsService(state, realtime, resolverWith({}));
    const w = await service.create('t1', 'u1', body);
    await service.addParticipant('t1', w.id, {
      learnerId: 'l1',
      roleCode: 'attendee',
      attendanceStatus: 'invited'
    });
    const mine = await service.listMine('t1', 'l1');
    expect(mine.map((x) => x.id)).toContain(w.id);
    expect(await service.listMine('t1', 'l2')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/communication/webinars.service.test.ts --no-file-parallelism`
Expected: FAIL — `WebinarsService` constructor has 2 args / `listMine` undefined.

- [ ] **Step 3: Modify the service**

Rewrite `apps/backend/src/modules/communication/webinars.service.ts` to inject the resolver, wire
`createSession` fail-soft, and add `listMine` + `recordAttendance`:

```typescript
import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import { type WebinarParticipantRow, type WebinarRow } from './in-memory-webinars.state.js';
import { WebinarProviderResolver } from './webinar-provider-resolver.service.js';
import {
  WEBINARS_REPOSITORY,
  type AttendanceUpdate,
  type WebinarParticipantsQuery,
  type WebinarsQuery,
  type WebinarsRepository
} from './webinars.repository.js';
import { RealtimeEventsService } from '../core/realtime-events.service.js';

const WEBINAR_UPDATED_EVENT = 'webinar.updated';

@Injectable()
export class WebinarsService {
  constructor(
    @Inject(WEBINARS_REPOSITORY) private readonly repository: WebinarsRepository,
    @Inject(RealtimeEventsService) private readonly realtime: RealtimeEventsService,
    @Inject(WebinarProviderResolver) private readonly resolver: WebinarProviderResolver
  ) {}

  async list(tenantId: string, query: WebinarsQuery) {
    return this.repository.list(tenantId, query);
  }

  async create(
    tenantId: string,
    createdBy: string,
    body: Omit<
      WebinarRow,
      | 'id'
      | 'tenantId'
      | 'createdAt'
      | 'updatedAt'
      | 'createdBy'
      | 'status'
      | 'providerCode'
      | 'providerSessionId'
      | 'joinUrl'
      | 'hostUrl'
    >
  ) {
    const now = new Date().toISOString();
    const id = this.id('web');
    const webinar: WebinarRow = {
      ...body,
      id,
      tenantId,
      createdBy,
      status: 'planned',
      createdAt: now,
      updatedAt: now
    };
    // Fail-soft provider wiring: a sleeping/erroring provider never blocks webinar creation.
    try {
      const provider = await this.resolver.forTenant(tenantId);
      const session = await provider.createSession({
        tenantId,
        webinarId: id,
        title: webinar.title,
        plannedStartAt: webinar.plannedStartAt,
        plannedEndAt: webinar.plannedEndAt
      });
      if (session) {
        webinar.providerCode = provider.code;
        webinar.providerSessionId = session.providerSessionId;
        webinar.joinUrl = session.joinUrl;
        webinar.hostUrl = session.hostUrl;
      }
    } catch (err) {
      console.error(`[webinars] createSession failed for ${id} (kept providerless):`, err);
    }
    await this.repository.create(webinar);
    return webinar;
  }

  async get(tenantId: string, id: string) {
    const row = await this.repository.get(tenantId, id);
    if (!row) throw new NotFoundException('Webinar not found');
    return row;
  }

  async patch(tenantId: string, id: string, body: Partial<WebinarRow>) {
    const current = await this.get(tenantId, id);
    const row = await this.repository.patch(tenantId, id, {
      ...current,
      ...body,
      updatedAt: new Date().toISOString()
    });
    if (!row) throw new NotFoundException('Webinar not found');
    this.realtime.publish({
      event_name: WEBINAR_UPDATED_EVENT,
      version: 'v1',
      tenant_id: tenantId,
      occurred_at: new Date().toISOString(),
      payload: { webinar_id: id, status: row.status }
    });
    return row;
  }

  async listParticipants(tenantId: string, webinarId: string, query: WebinarParticipantsQuery) {
    await this.get(tenantId, webinarId);
    return this.repository.listParticipants(tenantId, webinarId, query);
  }

  async addParticipant(
    tenantId: string,
    webinarId: string,
    body: Omit<WebinarParticipantRow, 'tenantId' | 'webinarId'>
  ) {
    await this.get(tenantId, webinarId);
    const row: WebinarParticipantRow = { ...body, tenantId, webinarId };
    await this.repository.addParticipant(row);
    return row;
  }

  /** Learner self-view: webinars where the user is a participant (by learnerId). */
  async listMine(tenantId: string, learnerId: string) {
    const { items } = await this.repository.list(tenantId, { page: 1, pageSize: 200 });
    const mine: WebinarRow[] = [];
    for (const w of items) {
      const { items: parts } = await this.repository.listParticipants(tenantId, w.id, {
        page: 1,
        pageSize: 500
      });
      if (parts.some((p) => p.learnerId === learnerId || p.userId === learnerId)) mine.push(w);
    }
    return mine;
  }

  async recordAttendance(tenantId: string, webinarId: string, update: AttendanceUpdate) {
    await this.repository.upsertParticipantAttendance(tenantId, webinarId, update);
  }

  private id(prefix: string) {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/communication/webinars.service.test.ts --no-file-parallelism`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/communication/webinars.service.ts apps/backend/src/modules/communication/webinars.service.test.ts
git commit -m "feat(backend): webinars service — fail-soft provider wiring + my-webinars + attendance"
```

---

### Task 13: Harden WebinarsController + settings endpoints + /me/webinars

**Files:**

- Modify: `apps/backend/src/modules/communication/webinars.controller.ts`
- (HTTP permission boundaries tested in Task 14.)

- [ ] **Step 1: Rewrite the controller**

```typescript
// apps/backend/src/modules/communication/webinars.controller.ts
import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards
} from '@nestjs/common';

import { WebinarProviderSettingsService } from './webinar-provider-settings.service.js';
import {
  AddParticipantRequest,
  CreateWebinarRequest,
  ProviderSettingsRequest
} from './webinars.dto.js';
import { WebinarsService } from './webinars.service.js';
import { assertValidDto } from '../../common/app-validation.pipe.js';
import { CurrentContext } from '../../common/decorators/current-context.decorator.js';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator.js';
import { PermissionGuard } from '../../common/guards/permission.guard.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';

import type { RequestContext } from '../../common/context/request-context.js';

@Controller('webinars')
@UseGuards(TenantGuard)
export class WebinarsController {
  constructor(
    @Inject(WebinarsService) private readonly service: WebinarsService,
    @Inject(WebinarProviderSettingsService)
    private readonly settings: WebinarProviderSettingsService
  ) {}

  @Get()
  @UseGuards(PermissionGuard)
  @RequirePermissions('webinars.read')
  list(@CurrentContext() ctx: RequestContext, @Query() query: Record<string, string | undefined>) {
    return this.service.list(ctx.tenantId!, {
      page: Number(query.page ?? '1'),
      pageSize: Math.min(100, Math.max(1, Number(query.page_size ?? '20'))),
      status: query.status as never,
      sort: query.sort === 'updatedAt:asc' ? 'updatedAt:asc' : 'updatedAt:desc'
    });
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermissions('webinars.write')
  create(@CurrentContext() ctx: RequestContext, @Body() body: unknown) {
    const dto = assertValidDto(CreateWebinarRequest, body);
    return this.service.create(ctx.tenantId!, ctx.userId!, dto);
  }

  // Learner self-view — MUST be declared before ':id' so it isn't captured as an id.
  @Get('mine')
  @UseGuards(PermissionGuard)
  @RequirePermissions('webinars.attend')
  mine(@CurrentContext() ctx: RequestContext) {
    return this.service.listMine(ctx.tenantId!, ctx.userId!);
  }

  @Get('provider-settings')
  @UseGuards(PermissionGuard)
  @RequirePermissions('webinars.configure')
  getSettings(@CurrentContext() ctx: RequestContext) {
    return this.settings.get(ctx.tenantId!);
  }

  @Put('provider-settings')
  @UseGuards(PermissionGuard)
  @RequirePermissions('webinars.configure')
  saveSettings(@CurrentContext() ctx: RequestContext, @Body() body: unknown) {
    const dto = assertValidDto(ProviderSettingsRequest, body);
    return this.settings.save(ctx.tenantId!, dto);
  }

  @Get(':id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('webinars.read')
  details(@CurrentContext() ctx: RequestContext, @Param('id') id: string) {
    return this.service.get(ctx.tenantId!, id);
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('webinars.write')
  patch(@CurrentContext() ctx: RequestContext, @Param('id') id: string, @Body() body: unknown) {
    const dto = assertValidDto(CreateWebinarRequest, body);
    return this.service.patch(ctx.tenantId!, id, dto);
  }

  @Get(':id/participants')
  @UseGuards(PermissionGuard)
  @RequirePermissions('webinars.read')
  participants(
    @CurrentContext() ctx: RequestContext,
    @Param('id') id: string,
    @Query() query: Record<string, string | undefined>
  ) {
    return this.service.listParticipants(ctx.tenantId!, id, {
      page: Number(query.page ?? '1'),
      pageSize: Math.min(100, Math.max(1, Number(query.page_size ?? '20')))
    });
  }

  @Post(':id/participants')
  @UseGuards(PermissionGuard)
  @RequirePermissions('webinars.write')
  addParticipant(
    @CurrentContext() ctx: RequestContext,
    @Param('id') id: string,
    @Body() body: unknown
  ) {
    const dto = assertValidDto(AddParticipantRequest, body);
    return this.service.addParticipant(ctx.tenantId!, id, {
      ...dto,
      attendanceStatus: 'invited'
    });
  }
}
```

> NOTE: add `Put` to the `@nestjs/common` import list. Verify the exact paths of
> `assertValidDto` (`common/app-validation.pipe.ts`), `RequirePermissions`
> (`common/decorators/require-permissions.decorator.ts`), and `PermissionGuard`
> (`common/guards/permission.guard.ts`) against another controller (e.g. `documents.controller.ts`)
> and adjust imports if they differ.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @cdoprof/backend exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/modules/communication/webinars.controller.ts
git commit -m "feat(backend): harden webinars controller — permissions + DTO + settings + /mine"
```

---

### Task 14: Webhook controller + module wiring + HTTP integration

**Files:**

- Create: `apps/backend/src/modules/communication/webinars-webhook.controller.ts`
- Modify: `apps/backend/src/modules/communication/communication.module.ts`
- Test: `apps/backend/src/modules/communication/webinars.http.integration.test.ts`

- [ ] **Step 1: Write the webhook controller**

```typescript
// apps/backend/src/modules/communication/webinars-webhook.controller.ts
import { Controller, Headers, Inject, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { WebinarProviderResolver } from './webinar-provider-resolver.service.js';
import { WebinarsService } from './webinars.service.js';

import type { Request } from 'express';

/**
 * Unguarded webinar webhook (mirrors PaymentsWebhookController). The provider POSTs to a public URL
 * with no JWT / x-tenant-id. Tenant is resolved from the stored webinar row
 * (provider_session_id → tenant_id); authenticity is the provider's signature check inside
 * parseWebhook. Noop returns null → 200 no-op. Cross-tenant isolation holds: a webhook can only
 * touch the single webinar whose provider_session_id it carries.
 */
@Controller('webinars')
export class WebinarsWebhookController {
  constructor(
    @Inject(WebinarProviderResolver) private readonly resolver: WebinarProviderResolver,
    @Inject(WebinarsService) private readonly service: WebinarsService
  ) {}

  @Post('webhook')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async handle(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers() headers: Record<string, string>
  ) {
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    // Peek the session id WITHOUT trusting the body: find the webinar, get its tenant, then let
    // THAT tenant's provider verify+parse. We must locate the webinar first to know the tenant.
    let parsed: Awaited<ReturnType<WebinarProviderResolver['forTenant']>> | null = null;
    let body: { providerSessionId?: unknown } = {};
    try {
      body = JSON.parse(raw.toString('utf8'));
    } catch {
      return { ok: true };
    }
    if (typeof body.providerSessionId !== 'string') return { ok: true };
    const webinar = await this.service.findByProviderSessionId(body.providerSessionId);
    if (!webinar) return { ok: true };
    parsed = await this.resolver.forTenant(webinar.tenantId);
    const events = await parsed.parseWebhook(raw, headers);
    if (!events) return { ok: true };
    for (const e of events) {
      await this.service.recordAttendance(webinar.tenantId, webinar.id, {
        participantRef: e.participantRef,
        attendanceStatus: e.type === 'joined' ? 'joined' : 'left',
        ...(e.type === 'joined' ? { joinedAt: e.occurredAt } : { leftAt: e.occurredAt }),
        ...(e.durationSeconds !== undefined ? { durationSeconds: e.durationSeconds } : {})
      });
    }
    return { ok: true };
  }
}
```

> NOTE: this requires a `findByProviderSessionId` passthrough on `WebinarsService`. Add it:
>
> ```typescript
>   async findByProviderSessionId(providerSessionId: string) {
>     return this.repository.findByProviderSessionId(providerSessionId);
>   }
> ```
>
> Add this method to `webinars.service.ts` (Task 12 file) in this task and re-run the Task 12 test to confirm still green.

- [ ] **Step 2: Wire the module**

In `apps/backend/src/modules/communication/communication.module.ts`:

Add imports:

```typescript
import { InMemoryWebinarProviderSettingsRepository } from './in-memory-webinar-provider-settings.repository.js';
import { PostgresWebinarProviderSettingsRepository } from './postgres-webinar-provider-settings.repository.js';
import { WebinarProviderResolver } from './webinar-provider-resolver.service.js';
import { WEBINAR_PROVIDER_SETTINGS_REPOSITORY } from './webinar-provider-settings.repository.js';
import { WebinarProviderSettingsService } from './webinar-provider-settings.service.js';
import { WebinarsWebhookController } from './webinars-webhook.controller.js';
import { DatabaseService } from '../../infrastructure/database/database.service.js';
import { FakeWebinarProvider } from '../../infrastructure/webinar-provider/fake-webinar.provider.js';
import { JitsiWebinarProvider } from '../../infrastructure/webinar-provider/jitsi-webinar.provider.js';
import {
  NoopWebinarProvider,
  WEBINAR_PROVIDER_REGISTRY,
  type WebinarProviderRegistry
} from '../../infrastructure/webinar-provider/webinar.provider.js';
```

Add `WebinarsWebhookController` to the `controllers` array.

Add to the `providers` array:

```typescript
(PostgresWebinarProviderSettingsRepository,
  {
    provide: WEBINAR_PROVIDER_SETTINGS_REPOSITORY,
    useFactory: (db: DatabaseService) =>
      backendEnv.ALLOW_IN_MEMORY_STATE
        ? new InMemoryWebinarProviderSettingsRepository()
        : new PostgresWebinarProviderSettingsRepository(db),
    inject: [DatabaseService]
  },
  WebinarProviderSettingsService,
  // Phase 8 webinar seam. Multi-provider registry; the ACTIVE provider is chosen per-tenant by
  // WebinarProviderResolver. Ships dormant (WEBINARS_ENABLED=false → resolver always returns Noop).
  {
    provide: WEBINAR_PROVIDER_REGISTRY,
    useFactory: (): WebinarProviderRegistry =>
      new Map([
        ['noop', new NoopWebinarProvider()],
        ['fake', new FakeWebinarProvider()],
        // Self-hosted Jitsi skeleton — baseUrl is read per-tenant at activation; for now a
        // placeholder keeps the registry entry present. Swap for the real adapter to activate.
        ['jitsi', new JitsiWebinarProvider('')]
      ])
  },
  WebinarProviderResolver);
```

Add `WebinarProviderSettingsService` to the `exports` array (so other modules could read it later).

- [ ] **Step 3: Write the HTTP integration test**

```typescript
// apps/backend/src/modules/communication/webinars.http.integration.test.ts
import { Body, Controller, Get, Module, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { InMemoryWebinarsState } from './in-memory-webinars.state.js';
import { WebinarProviderResolver } from './webinar-provider-resolver.service.js';
import { WebinarProviderSettingsService } from './webinar-provider-settings.service.js';
import { InMemoryWebinarProviderSettingsRepository } from './in-memory-webinar-provider-settings.repository.js';
import { WebinarsService } from './webinars.service.js';
import { WebinarsWebhookController } from './webinars-webhook.controller.js';
import { FakeWebinarProvider } from '../../infrastructure/webinar-provider/fake-webinar.provider.js';
import {
  NoopWebinarProvider,
  type WebinarProviderRegistry
} from '../../infrastructure/webinar-provider/webinar.provider.js';

// Minimal stub app: only the unguarded webhook + a seam to seed a webinar with a provider session.
@Controller('webinars-test')
class SeedController {
  constructor(private readonly service: WebinarsService) {}
  @Post('seed')
  async seed(@Body() body: { tenantId: string }) {
    const w = await this.service.create(body.tenantId, 'u1', {
      title: 'Intro',
      plannedStartAt: '2026-07-01T10:00:00.000Z',
      plannedEndAt: '2026-07-01T11:00:00.000Z'
    });
    await this.service.addParticipant(body.tenantId, w.id, {
      learnerId: 'l1',
      roleCode: 'attendee',
      attendanceStatus: 'invited'
    });
    return w;
  }
  @Get('parts')
  async parts() {
    return this.service.listParticipants(
      't1',
      (await this.service.list('t1', {})).items[0]!.id,
      {}
    );
  }
}

@Module({
  controllers: [WebinarsWebhookController, SeedController],
  providers: [{ provide: 'WEBINARS_REPOSITORY', useClass: InMemoryWebinarsState }]
})
class StubModule {}

describe('Webinars webhook HTTP integration', () => {
  let app: import('@nestjs/common').INestApplication;

  beforeAll(async () => {
    const state = new InMemoryWebinarsState();
    const settings = new WebinarProviderSettingsService(
      new InMemoryWebinarProviderSettingsRepository()
    );
    await settings.save('t1', { providerCode: 'fake', enabled: true });
    const registry: WebinarProviderRegistry = new Map([
      ['noop', new NoopWebinarProvider()],
      ['fake', new FakeWebinarProvider()]
    ]);
    const resolver = new WebinarProviderResolver(registry, settings, true, 'staging');
    const service = new WebinarsService(state, { publish() {} } as never, resolver);

    const moduleRef = await Test.createTestingModule({
      controllers: [WebinarsWebhookController, SeedController]
    })
      .useMocker((token) => {
        if (token === WebinarsService) return service;
        if (token === WebinarProviderResolver) return resolver;
        return undefined;
      })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('records attendance from a fake webhook resolved by provider_session_id', async () => {
    const seeded = await request(app.getHttpServer())
      .post('/webinars-test/seed')
      .send({ tenantId: 't1' });
    const providerSessionId = seeded.body.providerSessionId as string;
    expect(providerSessionId).toContain('fake-webinar:');

    await request(app.getHttpServer())
      .post('/webinars/webhook')
      .send({
        providerSessionId,
        events: [
          { participantRef: 'l1', type: 'joined', occurredAt: '2026-07-01T10:00:00.000Z' },
          {
            participantRef: 'l1',
            type: 'left',
            occurredAt: '2026-07-01T10:30:00.000Z',
            durationSeconds: 1800
          }
        ]
      })
      .expect(201);

    const parts = await request(app.getHttpServer()).get('/webinars-test/parts');
    expect(parts.body.items[0].attendanceStatus).toBe('left');
    expect(parts.body.items[0].durationSeconds).toBe(1800);
  });

  it('no-ops for an unknown provider_session_id', async () => {
    await request(app.getHttpServer())
      .post('/webinars/webhook')
      .send({ providerSessionId: 'fake-webinar:missing', events: [] })
      .expect(201);
  });
});
```

> NOTE: this stub wires `WebinarsService`/`WebinarProviderResolver` via `useMocker` returning the
> hand-built singletons (the `StubModule` above documents intent but the `useMocker` form is what
> runs). If your local `@nestjs/testing` version makes `useMocker` returning `undefined` throw,
> replace it with explicit `providers: [{ provide: WebinarsService, useValue: service }, { provide: WebinarProviderResolver, useValue: resolver }]`.
> Mirror the exact boot style of `payments.http.integration.test.ts`.

- [ ] **Step 4: Run the HTTP integration test alone**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/communication/webinars.http.integration.test.ts --no-file-parallelism`
Expected: PASS (2 tests). (If it times out in a batch, run it alone — Cyrillic-path NestJS boot is flaky in parallel; see CLAUDE.md Gotchas.)

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/communication/webinars-webhook.controller.ts apps/backend/src/modules/communication/communication.module.ts apps/backend/src/modules/communication/webinars.service.ts apps/backend/src/modules/communication/webinars.http.integration.test.ts
git commit -m "feat(backend): webinar webhook (tenant-from-session) + module wiring + http integration"
```

---

### Task 15: Frontend feature — types + api + contract test

**Files:**

- Create: `apps/frontend/src/features/webinars/types.ts`
- Create: `apps/frontend/src/features/webinars/api.ts`
- Test: `apps/frontend/src/features/webinars/api.contract.test.ts`

- [ ] **Step 1: Write the failing contract test**

```typescript
// apps/frontend/src/features/webinars/api.contract.test.ts
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type {
  createWebinar as CreateWebinar,
  listWebinars as ListWebinars,
  saveProviderSettings as SaveProviderSettings
} from './api';

const fetchMock = vi.fn();
const envelope = <T>(data: T) =>
  JSON.stringify({ data, meta: { requestId: 'r', correlationId: 'c', timestamp: 't' } });

describe('webinars api', () => {
  let listWebinars: typeof ListWebinars;
  let createWebinar: typeof CreateWebinar;
  let saveProviderSettings: typeof SaveProviderSettings;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    const mod = await import('./api');
    listWebinars = mod.listWebinars;
    createWebinar = mod.createWebinar;
    saveProviderSettings = mod.saveProviderSettings;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('listWebinars unwraps the envelope { items }', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        envelope({ items: [{ id: 'w1', title: 'Intro', status: 'planned' }], total: 1 }),
        {
          status: 200
        }
      )
    );
    vi.stubGlobal('fetch', fetchMock);
    const res = await listWebinars();
    expect(res.items[0]?.id).toBe('w1');
  });

  it('createWebinar posts to /webinars', async () => {
    const spy = vi.fn(
      async () =>
        new Response(envelope({ id: 'w2', title: 'X', status: 'planned' }), { status: 200 })
    );
    vi.stubGlobal('fetch', spy);
    await createWebinar({ title: 'X', plannedStartAt: 'a', plannedEndAt: 'b' });
    expect((spy.mock.calls[0] as unknown as [string])[0]).toContain('/webinars');
  });

  it('saveProviderSettings PUTs to /webinars/provider-settings', async () => {
    const spy = vi.fn(
      async () => new Response(envelope({ providerCode: 'jitsi', enabled: true }), { status: 200 })
    );
    vi.stubGlobal('fetch', spy);
    await saveProviderSettings({ providerCode: 'jitsi', enabled: true });
    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/webinars/provider-settings');
    expect(init.method).toBe('PUT');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/features/webinars/api.contract.test.ts --no-file-parallelism`
Expected: FAIL — module not found.

- [ ] **Step 3: Write types + api**

```typescript
// apps/frontend/src/features/webinars/types.ts
export type WebinarStatus = 'draft' | 'planned' | 'live' | 'completed' | 'cancelled';
export type WebinarProviderCode = 'noop' | 'fake' | 'jitsi' | 'pruffme' | 'zoom' | 'bbb';

export interface Webinar {
  id: string;
  title: string;
  description?: string;
  status: WebinarStatus;
  plannedStartAt: string;
  plannedEndAt: string;
  providerCode?: string;
  joinUrl?: string;
  hostUrl?: string;
}

export interface WebinarParticipant {
  learnerId?: string;
  userId?: string;
  roleCode: string;
  attendanceStatus: 'invited' | 'joined' | 'left';
  durationSeconds?: number;
}

export interface CreateWebinarInput {
  title: string;
  description?: string;
  groupId?: string;
  courseId?: string;
  plannedStartAt: string;
  plannedEndAt: string;
}

export interface ProviderSettings {
  providerCode: WebinarProviderCode;
  baseUrl?: string;
  enabled: boolean;
}

export const WEBINAR_STATUS_LABELS: Record<WebinarStatus, string> = {
  draft: 'Черновик',
  planned: 'Запланирован',
  live: 'Идёт',
  completed: 'Завершён',
  cancelled: 'Отменён'
};
```

```typescript
// apps/frontend/src/features/webinars/api.ts
import { apiRequest } from '../../lib/api/client';

import type { CreateWebinarInput, ProviderSettings, Webinar, WebinarParticipant } from './types';

export const listWebinars = (): Promise<{ items: Webinar[]; total: number }> =>
  apiRequest<{ items: Webinar[]; total: number }>('/webinars');

export const createWebinar = (input: CreateWebinarInput): Promise<Webinar> =>
  apiRequest<Webinar>('/webinars', { method: 'POST', body: input });

export const listParticipants = (
  id: string
): Promise<{ items: WebinarParticipant[]; total: number }> =>
  apiRequest<{ items: WebinarParticipant[]; total: number }>(`/webinars/${id}/participants`);

export const listMyWebinars = (): Promise<Webinar[]> => apiRequest<Webinar[]>('/webinars/mine');

export const getProviderSettings = (): Promise<ProviderSettings> =>
  apiRequest<ProviderSettings>('/webinars/provider-settings');

export const saveProviderSettings = (input: ProviderSettings): Promise<ProviderSettings> =>
  apiRequest<ProviderSettings>('/webinars/provider-settings', { method: 'PUT', body: input });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/features/webinars/api.contract.test.ts --no-file-parallelism`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/webinars/types.ts apps/frontend/src/features/webinars/api.ts apps/frontend/src/features/webinars/api.contract.test.ts
git commit -m "feat(frontend): webinars feature — types + api + contract test"
```

---

### Task 16: Frontend hooks + screens

**Files:**

- Create: `apps/frontend/src/features/webinars/hooks.ts`
- Create: `apps/frontend/src/features/webinars/screens.tsx`

Screens are dynamic-import smoke-tested in Task 17 (no React mount — RTL is not a dependency).
Mirror the structure of `features/payments/screens.tsx` (PageContainer/SectionCard wrappers,
`useState` + async/await mutations per `features/mvp/hooks.ts`).

- [ ] **Step 1: Write the hooks**

```typescript
// apps/frontend/src/features/webinars/hooks.ts
import { useCallback, useEffect, useState } from 'react';

import {
  createWebinar,
  getProviderSettings,
  listMyWebinars,
  listWebinars,
  saveProviderSettings
} from './api';
import type { CreateWebinarInput, ProviderSettings, Webinar } from './types';

export function useWebinars() {
  const [items, setItems] = useState<Webinar[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listWebinars();
      setItems(res.items);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const create = useCallback(
    async (input: CreateWebinarInput) => {
      await createWebinar(input);
      await reload();
    },
    [reload]
  );

  return { items, error, loading, reload, create };
}

export function useMyWebinars() {
  const [items, setItems] = useState<Webinar[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await listMyWebinars();
        if (!cancelled) setItems(res);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { items, error };
}

export function useProviderSettings() {
  const [settings, setSettings] = useState<ProviderSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await getProviderSettings();
        if (!cancelled) setSettings(s);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback(async (input: ProviderSettings) => {
    setSaving(true);
    try {
      const s = await saveProviderSettings(input);
      setSettings(s);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }, []);

  return { settings, error, saving, save };
}
```

- [ ] **Step 2: Write the screens**

```tsx
// apps/frontend/src/features/webinars/screens.tsx
'use client';

import { useState } from 'react';

import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../components/state-wrappers';
import { useMyWebinars, useProviderSettings, useWebinars } from './hooks';
import { WEBINAR_STATUS_LABELS, type WebinarProviderCode } from './types';

const PROVIDERS: WebinarProviderCode[] = ['noop', 'fake', 'jitsi', 'pruffme', 'zoom', 'bbb'];

export function WebinarsAdminScreen() {
  const { items, error, create } = useWebinars();
  const [title, setTitle] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  return (
    <PageContainer>
      <PageHeader title="Вебинары" subtitle="Создание, участники, посещаемость" />
      <SectionCard title="Создать вебинар">
        <div className="ui-form-row">
          <input placeholder="Название" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
          <button
            type="button"
            disabled={!title || !start || !end}
            onClick={() =>
              create({
                title,
                plannedStartAt: new Date(start).toISOString(),
                plannedEndAt: new Date(end).toISOString()
              })
            }
          >
            Создать
          </button>
        </div>
      </SectionCard>
      <SectionCard title="Список">
        {error ? <SectionError message={error} /> : null}
        {items.length === 0 && !error ? <SectionEmpty message="Вебинаров пока нет." /> : null}
        {items.map((w) => (
          <div key={w.id} className="ui-list-row">
            <strong>{w.title}</strong>
            <div className="ui-list-row-meta">
              {WEBINAR_STATUS_LABELS[w.status]} ·{' '}
              {new Date(w.plannedStartAt).toLocaleString('ru-RU')}
              {w.providerCode ? ` · ${w.providerCode}` : ' · без провайдера'}
            </div>
          </div>
        ))}
      </SectionCard>
    </PageContainer>
  );
}

export function WebinarProviderSettingsScreen() {
  const { settings, error, saving, save } = useProviderSettings();
  const [code, setCode] = useState<WebinarProviderCode>('noop');
  const [baseUrl, setBaseUrl] = useState('');
  const [enabled, setEnabled] = useState(false);

  return (
    <PageContainer>
      <PageHeader title="Провайдер вебинаров" subtitle="Выбор площадки для этого учебного центра" />
      <SectionCard title="Настройки">
        {error ? <SectionError message={error} /> : null}
        {settings ? (
          <div className="ui-list-row-meta">
            Текущий: {settings.providerCode} · {settings.enabled ? 'включён' : 'выключен'}
          </div>
        ) : null}
        <div className="ui-form-row">
          <select value={code} onChange={(e) => setCode(e.target.value as WebinarProviderCode)}>
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <input
            placeholder="Base URL"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
          <label>
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />{' '}
            Включён
          </label>
          <button
            type="button"
            disabled={saving}
            onClick={() => save({ providerCode: code, enabled, ...(baseUrl ? { baseUrl } : {}) })}
          >
            Сохранить
          </button>
        </div>
      </SectionCard>
    </PageContainer>
  );
}

export function MyWebinarsScreen() {
  const { items, error } = useMyWebinars();
  return (
    <PageContainer>
      <PageHeader title="Мои вебинары" subtitle="Подключение к занятиям" />
      <SectionCard title="Список">
        {error ? <SectionError message={error} /> : null}
        {items.length === 0 && !error ? <SectionEmpty message="Вебинаров пока нет." /> : null}
        {items.map((w) => (
          <div key={w.id} className="ui-list-row">
            <strong>{w.title}</strong>
            <div className="ui-list-row-meta">
              {WEBINAR_STATUS_LABELS[w.status]} ·{' '}
              {new Date(w.plannedStartAt).toLocaleString('ru-RU')}
            </div>
            {w.joinUrl ? (
              <a className="ui-button" href={w.joinUrl} target="_blank" rel="noreferrer">
                Подключиться
              </a>
            ) : (
              <span className="ui-list-row-meta">Ссылка появится позже</span>
            )}
          </div>
        ))}
      </SectionCard>
    </PageContainer>
  );
}
```

> NOTE: verify the exact exported names in `../../components/state-wrappers` (e.g.
> `PageContainer`, `PageHeader`, `SectionCard`, `SectionEmpty`, `SectionError`) against
> `features/payments/screens.tsx`; if class names like `ui-form-row` / `ui-button` don't exist, use
> the same primitives/classes the payments screens use. Match conventions; don't invent styling.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @cdoprof/frontend exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/features/webinars/hooks.ts apps/frontend/src/features/webinars/screens.tsx
git commit -m "feat(frontend): webinars hooks + admin/settings/learner screens"
```

---

### Task 17: Pages + navigation + remove old route + e2e

**Files:**

- Create: `apps/frontend/app/admin/webinars/page.tsx`
- Create: `apps/frontend/app/admin/webinars/settings/page.tsx`
- Create: `apps/frontend/app/learner/webinars/page.tsx`
- Delete: `apps/frontend/app/webinars/page.tsx`
- Delete: `apps/frontend/src/lib/communication/webinars-api.ts`
- Modify: `apps/frontend/src/features/navigation/model.ts`
- Test: `apps/frontend/src/e2e/webinars.e2e.test.ts`

- [ ] **Step 1: Write the failing e2e test**

```typescript
// apps/frontend/src/e2e/webinars.e2e.test.ts
import { describe, expect, it } from 'vitest';

import { evaluateRouteAccess } from '../features/navigation/helpers';

import type { UserSession } from '../entities/session/model';

const admin: UserSession = {
  user: {
    id: 'u_a',
    tenantId: 'tenant_demo',
    login: 'a',
    email: null,
    status: 'active',
    displayName: 'A'
  },
  tokens: { accessToken: 'a', sessionId: 's1', expiresIn: 1000 },
  roles: ['tenant_admin'],
  permissions: ['webinars.read', 'webinars.configure']
};
const learner: UserSession = {
  ...admin,
  user: { ...admin.user, id: 'u_l', login: 'l' },
  roles: ['learner'],
  permissions: ['webinars.attend']
};
const nobody: UserSession = { ...admin, permissions: [] };

describe('webinars routing', () => {
  it('admin with webinars.read can open /admin/webinars', () => {
    expect(evaluateRouteAccess('/admin/webinars', admin).allowed).toBe(true);
  });
  it('settings needs webinars.configure', () => {
    expect(evaluateRouteAccess('/admin/webinars/settings', admin).allowed).toBe(true);
    expect(evaluateRouteAccess('/admin/webinars/settings', learner).allowed).toBe(false);
  });
  it('learner with webinars.attend can open /learner/webinars', () => {
    expect(evaluateRouteAccess('/learner/webinars', learner).allowed).toBe(true);
  });
  it('no permissions → denied', () => {
    expect(evaluateRouteAccess('/admin/webinars', nobody).allowed).toBe(false);
  });

  it('screens module exports the three screens', async () => {
    const mod = await import('../features/webinars/screens');
    expect(typeof mod.WebinarsAdminScreen).toBe('function');
    expect(typeof mod.WebinarProviderSettingsScreen).toBe('function');
    expect(typeof mod.MyWebinarsScreen).toBe('function');
  });
});
```

> NOTE: confirm `evaluateRouteAccess`'s return shape (`.allowed`) against `payments.e2e.test.ts`;
> if it differs, mirror that file's assertions exactly.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/e2e/webinars.e2e.test.ts --no-file-parallelism`
Expected: FAIL — routes not registered / screens module missing.

- [ ] **Step 3: Create pages**

```tsx
// apps/frontend/app/admin/webinars/page.tsx
import { WebinarsAdminScreen } from '../../../src/features/webinars/screens';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default function AdminWebinarsPage() {
  return (
    <ProtectedPage>
      <WebinarsAdminScreen />
    </ProtectedPage>
  );
}
```

```tsx
// apps/frontend/app/admin/webinars/settings/page.tsx
import { WebinarProviderSettingsScreen } from '../../../../src/features/webinars/screens';
import { ProtectedPage } from '../../../../src/widgets/shell/protected-page';

export default function AdminWebinarSettingsPage() {
  return (
    <ProtectedPage>
      <WebinarProviderSettingsScreen />
    </ProtectedPage>
  );
}
```

```tsx
// apps/frontend/app/learner/webinars/page.tsx
import { MyWebinarsScreen } from '../../../src/features/webinars/screens';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default function LearnerWebinarsPage() {
  return (
    <ProtectedPage>
      <MyWebinarsScreen />
    </ProtectedPage>
  );
}
```

- [ ] **Step 4: Update navigation + delete the old route**

In `apps/frontend/src/features/navigation/model.ts`:

Replace the routeMeta line `{ pattern: '/webinars', meta: { public: false, requiredPermissions: ['tenant.read'] } },` with:

```typescript
  { pattern: '/admin/webinars', meta: { public: false, requiredPermissions: ['webinars.read'] } },
  {
    pattern: '/admin/webinars/settings',
    meta: { public: false, requiredPermissions: ['webinars.configure'] }
  },
  { pattern: '/learner/webinars', meta: { public: false, requiredPermissions: ['webinars.attend'] } },
```

Replace the nav entry `{ href: '/webinars', label: 'Вебинары', requiredPermissions: ['tenant.read'], navSlot: 'more' },` with:

```typescript
  {
    href: '/admin/webinars',
    label: 'Вебинары',
    requiredPermissions: ['webinars.read'],
    navSlot: 'more'
  },
  {
    href: '/learner/webinars',
    label: 'Мои вебинары',
    requiredPermissions: ['webinars.attend'],
    navSlot: 'more'
  },
```

Delete the superseded files:

```bash
git rm apps/frontend/app/webinars/page.tsx apps/frontend/src/lib/communication/webinars-api.ts
```

> NOTE: after `git rm`, grep for any remaining imports of `webinars-api` (`grep -rn "communication/webinars-api" apps/frontend/src apps/frontend/app`) and remove/repoint them. There should be none besides the deleted page.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/e2e/webinars.e2e.test.ts --no-file-parallelism`
Expected: PASS (5 tests). Then `pnpm --filter @cdoprof/frontend exec tsc --noEmit` — expect no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/app/admin/webinars apps/frontend/app/learner/webinars apps/frontend/src/features/navigation/model.ts apps/frontend/src/e2e/webinars.e2e.test.ts
git commit -m "feat(frontend): webinar pages + navigation + drop legacy /webinars route + e2e"
```

---

### Task 18: Env example + docs + final verification

**Files:**

- Modify: `infra/.env.production.example`
- Test: full targeted re-run (no new test file)

- [ ] **Step 1: Document the env flag**

Append to `infra/.env.production.example` (near the `PAYMENTS_*` block):

```bash
# Phase 8 webinars seam (dormant). Leave false until a real provider adapter (e.g. self-hosted
# Jitsi) is implemented and a tenant is configured via /admin/webinars/settings. When false, every
# tenant resolves to NoopWebinarProvider regardless of saved provider_code.
WEBINARS_ENABLED=false
```

- [ ] **Step 2: Run the full targeted backend cluster (isolated files)**

Run each alone (Cyrillic-path safe):

```bash
pnpm --filter @cdoprof/backend exec vitest run src/infrastructure/webinar-provider --no-file-parallelism
pnpm --filter @cdoprof/backend exec vitest run src/modules/communication/webinar-provider-resolver.service.test.ts src/modules/communication/webinar-provider-settings.service.test.ts src/modules/communication/in-memory-webinar-provider-settings.repository.test.ts src/modules/communication/in-memory-webinars.state.test.ts src/modules/communication/webinars.service.test.ts src/modules/communication/webinars.dto-validation.test.ts src/modules/communication/migrations.0055.test.ts src/env.webinars.test.ts --no-file-parallelism
pnpm --filter @cdoprof/backend exec vitest run src/modules/communication/webinars.http.integration.test.ts --no-file-parallelism
```

Expected: all PASS.

- [ ] **Step 3: Run the frontend targeted tests + monorepo typecheck**

```bash
pnpm --filter @cdoprof/frontend exec vitest run src/features/webinars src/e2e/webinars.e2e.test.ts --no-file-parallelism
pnpm typecheck
```

Expected: frontend PASS; typecheck 8/8.

- [ ] **Step 4: Lint the changed files**

```bash
npx eslint apps/backend/src/modules/communication apps/backend/src/infrastructure/webinar-provider apps/frontend/src/features/webinars --max-warnings=0
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add infra/.env.production.example
git commit -m "docs(infra): document WEBINARS_ENABLED dormant flag"
```

---

## Self-Review

**Spec coverage:**

- Provider seam (interface + Noop/Fake/Jitsi) → Tasks 1–3. ✓
- Registry + per-tenant resolver + prod-guard → Task 9. ✓
- Env master switch → Task 4. ✓
- Migration 0055 (permissions + settings table + index) → Task 5. ✓
- Per-tenant settings (repo + service) → Tasks 6–8. ✓
- Create wiring fail-soft + my-webinars + attendance → Task 12. ✓
- Webhook (tenant-from-session) → Task 14. ✓
- Controller hardening (permissions + DTO + /mine + settings) → Tasks 11, 13. ✓
- Frontend feature + pages + nav + remove legacy → Tasks 15–17. ✓
- Testing trio (provider/env/dto/resolver/settings/service/webhook/contract/e2e) → spread across all tasks. ✓
- Out-of-scope items (real adapters, attendance→hours, secrets, recordings/.ics/reminders) → left undone by design, documented in spec §Out of scope. ✓

**Type consistency:**

- `WebinarProviderCode` union identical in `webinar.provider.ts` (Task 1), DTO `PROVIDER_CODES` (Task 11), frontend `types.ts` (Task 15).
- `AttendanceUpdate` defined in `webinars.repository.ts` (Task 10), consumed by in-memory/postgres repos (Task 10), service (Task 12), webhook (Task 14).
- `ProviderSession` / `CreateSessionInput` / `WebinarAttendanceEvent` defined Task 1, used Tasks 2, 3, 12, 14.
- `WebinarProviderRegistry` token + type defined Task 1, provided Task 14, consumed Task 9.
- `WebinarsService` constructor arity changes to 3 in Task 12; all instantiation sites (tests in Task 12, HTTP stub in Task 14, module DI in Task 14) updated.

**Placeholder scan:** No TBD/TODO; every code step contains full code. NOTE blocks flag exact-path/version verifications against existing reference files — these are verification reminders, not missing code.

**Known cross-task ordering:** Task 14 adds `findByProviderSessionId` passthrough to the service file last touched in Task 12 — called out explicitly in Task 14 Step 1 NOTE.
