# Phase 5 · Plan 5B-2 — Recertification Scheduler & Reminder Cadence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make recertification scanning run automatically every night across all tenants (instead of a manual HTTP trigger), add graduated 90/30/7-day recertification reminders, course-deadline reminders (14/7/1 days before `plannedEndAt`), and a revoked-document email — all send-once via a `dedup_key` ledger.

**Architecture:** A new singleton **`MvpTenantRunner`** (mirrors the existing `DocumentsTenantRunner`) loads a tenant's MVP state **outside any HTTP request** so a cron can read enrollments/learners/groups. The scan body is **extracted** from the request-scoped `RecertificationService` into a singleton **`RecertificationScanner`** (state passed as a parameter), so the manual endpoint and the cron share one code path. A **`RemindersSchedulerService`** (`@nestjs/schedule` `@Cron`, dormant behind `RECERTIFICATION_SCAN_ENABLED=false`) acquires a Postgres `pg_try_advisory_xact_lock` (single-instance), enumerates active tenants, and runs the recert + course-deadline scanners per tenant under the shared `TenantSerialGateway`. A **`DocumentRevokedEmailListener`** reuses `MvpTenantRunner` to resolve the learner from the already-emitted `documents.revoked` event. Per-milestone send-once is enforced by an optional `dedupKey` on `NotificationDispatcher.dispatch` backed by a new `communication.email_deliveries.dedup_key` column.

**Tech Stack:** TypeScript (NodeNext ESM — every relative import ends in `.js`), NestJS 11, `@nestjs/schedule`, `@nestjs/event-emitter`, PostgreSQL (`pg_try_advisory_xact_lock`), Vitest. `exactOptionalPropertyTypes: true` is ON — add optional fields by conditional spread, never `= undefined`.

**Source spec:** [docs/superpowers/specs/2026-06-04-phase-5-notifications-recertifications-design.md](../specs/2026-06-04-phase-5-notifications-recertifications-design.md) §4.3 (scheduler + advisory-lock).
**Predecessor:** Plan 5B (recertification foundation) — merged in PR #229; latest migration on `main` is **0048**. This plan adds **0049**.

---

## Scope of Plan 5B-2 (and what is deliberately deferred)

**In 5B-2:**

- `@nestjs/schedule` dependency + `ScheduleModule.forRoot()` in `AppModule`.
- Env flags `RECERTIFICATION_SCAN_ENABLED` (default `false`, ships dormant) and `RECERTIFICATION_CRON_SCHEDULE` (default `0 3 * * *`).
- Pure `pickMilestone` util (smallest satisfied threshold) for graduated reminders.
- Migration **0049**: `communication.email_deliveries.dedup_key` + non-unique lookup index.
- `EmailDeliveriesRepository.findByDedupKey` + `dedupKey` on the row/seed (in-memory + postgres).
- `NotificationDispatcher` optional `dedupKey` → **skip send+record** when a delivery with that key already exists.
- Two new templates: `course_deadline`, `document_revoked`.
- `TenantService.listActiveTenantIds()` (cross-tenant enumeration + in-memory fallback).
- `MvpTenantRunner` (read-only out-of-request MVP state harness).
- **Extract** `RecertificationScanner` (singleton) from the request-scoped `RecertificationService`; add the 90/30/7 cadence (replaces 5B's once-on-creation email).
- `CourseDeadlineScanner` (singleton) — scans incomplete enrollments by `plannedEndAt`, 14/7/1-day reminders.
- `RemindersSchedulerService` — `@Cron` + advisory lock + cross-tenant loop, partial-success per tenant.
- `DocumentRevokedEmailListener` — `@OnEvent('documents.revoked')` → resolve learner via `MvpTenantRunner` → `document_revoked` email.
- Module wiring (`MvpModule` providers + import `TenantModule`).

**Deferred — other follow-ons:** `license_expiring` reminders (the `org` module has **no postgres persistence** yet — nothing to scan cross-tenant); curator recipient (the `Group` entity has no curator field); admin-email recipient (no clean tenant-admin email resolver in IAM); the frontend «Нужна переаттестация» queue UI → **Plan 5C**; an HTTP "scan all tenants now" ops endpoint (the existing per-tenant `POST /recertification/scan` plus the cron are enough).

> **Why a non-unique `dedup_key` index (not a unique constraint):** A unique `(tenant_id, dedup_key)` index would reject the second recipient row of a two-recipient dispatch (learner + employer share one `dedupKey`). Instead, the dispatcher does a `findByDedupKey` check **before** sending, and the cron's `pg_try_advisory_xact_lock` (one instance) + per-tenant `TenantSerialGateway.runExclusive` (serial) make the check-then-send race-free. The index is purely for the lookup. The recertification **draft** unique constraint (5B) independently prevents duplicate drafts across instances.

---

## File Structure

**Dependency + scheduling:**

- Modify `apps/backend/package.json` — add `@nestjs/schedule`.
- Modify `apps/backend/src/app.module.ts` — `ScheduleModule.forRoot()`.
- Modify `apps/backend/src/env.schema.ts` — `RECERTIFICATION_SCAN_ENABLED` + `RECERTIFICATION_CRON_SCHEDULE`.
- Modify `apps/backend/src/env.test.ts` — assert the new flags' defaults + `'false'`-string parse.

**Pure util:**

- Create `apps/backend/src/modules/mvp/reminders/milestone.util.ts` — `pickMilestone` + milestone constants.
- Create `apps/backend/src/modules/mvp/reminders/milestone.util.test.ts`.

**Migration + dedup ledger:**

- Create `apps/backend/migrations/0049_communication_email_dedup_key.sql`.
- Modify `apps/backend/src/modules/communication/email-deliveries.repository.ts` — `dedupKey?` on row; `findByDedupKey` on interface.
- Modify `apps/backend/src/modules/communication/in-memory-email-deliveries.state.ts` — `findByDedupKey`.
- Modify `apps/backend/src/modules/communication/postgres-email-deliveries.repository.ts` — insert/map `dedup_key`; `findByDedupKey`.
- Modify `apps/backend/src/modules/communication/in-memory-email-deliveries.state.test.ts` (create if absent) — `findByDedupKey` units.

**Dispatcher dedup:**

- Modify `apps/backend/src/modules/communication/notification-dispatcher.service.ts` — `dedupKey?` on `DispatchInput` + skip logic.
- Modify `apps/backend/src/modules/communication/notification-dispatcher.service.test.ts` (create if absent) — dedup skip + record.

**Templates:**

- Modify `apps/backend/src/modules/communication/email-templates.ts` — `course_deadline`, `document_revoked`.

**Tenant enumeration:**

- Modify `apps/backend/src/modules/tenant/tenant.service.ts` — `listActiveTenantIds()`.
- Modify `apps/backend/src/modules/tenant/tenant.service.test.ts` (create if absent) — in-memory fallback unit.

**Out-of-request MVP harness:**

- Create `apps/backend/src/modules/mvp/infrastructure/mvp-tenant-runner.service.ts`.
- Create `apps/backend/src/modules/mvp/infrastructure/mvp-tenant-runner.service.test.ts`.

**Shared resolvers + scanners + scheduler + listener:**

- Create `apps/backend/src/modules/mvp/reminders/reminder-recipients.ts` — pure resolvers (employer email, course title, course-version-for-group, learner+employer recipients).
- Create `apps/backend/src/modules/mvp/recertification/recertification-scanner.service.ts` — extracted scan + cadence (also re-homes `scanForRecertification`, `RECERT_HORIZON_DAYS`, `RecertCandidate`, `RecertScanSummary`).
- Create `apps/backend/src/modules/mvp/recertification/recertification-scanner.service.test.ts`.
- Modify `apps/backend/src/modules/mvp/recertification/recertification.service.ts` — delegate `runScan` to the scanner; drop dispatcher/documentsRunner deps.
- Modify `apps/backend/src/modules/mvp/recertification/recertification.service.test.ts` — update constructor + scan assertions.
- Create `apps/backend/src/modules/mvp/reminders/course-deadline-scanner.service.ts`.
- Create `apps/backend/src/modules/mvp/reminders/course-deadline-scanner.service.test.ts`.
- Create `apps/backend/src/modules/mvp/reminders/reminders-scheduler.service.ts`.
- Create `apps/backend/src/modules/mvp/reminders/reminders-scheduler.service.test.ts`.
- Create `apps/backend/src/modules/mvp/reminders/document-revoked-email.listener.ts`.
- Create `apps/backend/src/modules/mvp/reminders/document-revoked-email.listener.test.ts`.
- Modify `apps/backend/src/modules/mvp/mvp.module.ts` — register providers; import `TenantModule`.

**Docs:**

- Modify `README.md`, `LMS_AGENT_HANDOFF.md`, and this plan (tick boxes).

---

## Task 1: Add `@nestjs/schedule` + `ScheduleModule.forRoot()`

**Files:**

- Modify: `apps/backend/package.json`
- Modify: `apps/backend/src/app.module.ts`

- [x] **Step 1: Install the dependency**

Run (from repo root):

```bash
pnpm --filter @cdoprof/backend add @nestjs/schedule
```

> The backend is on NestJS 11 (`@nestjs/core ^11.0.11`). `@nestjs/schedule` must resolve to a major whose `peerDependencies` allow `@nestjs/common@^11` / `@nestjs/core@^11` (v4+ does; pnpm picks the latest compatible). If pnpm reports an unmet peer for `@nestjs/common@^11`, pin explicitly: `pnpm --filter @cdoprof/backend add @nestjs/schedule@^4.1.2`. Verify the version landed in `apps/backend/package.json` dependencies.

- [x] **Step 2: Register `ScheduleModule.forRoot()` in AppModule**

In `apps/backend/src/app.module.ts`, add the import near the other Nest imports (line 1-3 area):

```ts
import { ScheduleModule } from '@nestjs/schedule';
```

Then add `ScheduleModule.forRoot()` to `baseModules` immediately after `EventEmitterModule.forRoot()` (line 23):

```ts
const baseModules = [
  EventEmitterModule.forRoot(),
  ScheduleModule.forRoot(),
  ThrottlerModule.forRoot({
    throttlers: [{ ttl: 60_000, limit: 300 }]
  }),
  CoreModule
  // ...unchanged...
];
```

- [x] **Step 3: Typecheck**

Run: `pnpm --filter @cdoprof/backend exec tsc --noEmit`
Expected: PASS (no type errors from the new import).

- [x] **Step 4: Commit**

```bash
git add apps/backend/package.json pnpm-lock.yaml apps/backend/src/app.module.ts
git commit -m "feat(backend): add @nestjs/schedule + ScheduleModule.forRoot()"
```

---

## Task 2: Env flags — `RECERTIFICATION_SCAN_ENABLED` + `RECERTIFICATION_CRON_SCHEDULE`

**Files:**

- Modify: `apps/backend/src/env.schema.ts`
- Modify: `apps/backend/src/env.test.ts`

- [x] **Step 1: Add the schema fields**

In `apps/backend/src/env.schema.ts`, inside the `z.object({ ... })`, immediately after the `NOTIFICATIONS_EMAIL_ENABLED` block (≈ line 49), add:

```ts
    // Recertification/reminders daily scan (Phase 5B-2). Custom boolean parse — NOT
    // z.coerce.boolean (which maps the string "false" → true). Ships dormant (false);
    // ops enables it once SMTP + persistence are ready.
    RECERTIFICATION_SCAN_ENABLED: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((v) => v === true || v === 'true')
      .default(false),
    /** Cron expression for the nightly recertification + course-deadline scan (server TZ). */
    RECERTIFICATION_CRON_SCHEDULE: z.string().min(1).default('0 3 * * *'),
```

- [x] **Step 2: Write the failing test**

In `apps/backend/src/env.test.ts`, find an existing case that parses the schema with a minimal valid env (mirror it — it already supplies the required `DATABASE_URL`, `REDIS_URL`, `AUTH_JWT_SECRET`, etc.). Append a `describe` mirroring the existing `ANTIVIRUS_ENABLED` / `NOTIFICATIONS_EMAIL_ENABLED` cases:

```ts
describe('RECERTIFICATION_SCAN_ENABLED / RECERTIFICATION_CRON_SCHEDULE', () => {
  it('defaults to disabled with the 03:00 daily schedule', () => {
    const env = backendEnvSchema.parse(baseEnv());
    expect(env.RECERTIFICATION_SCAN_ENABLED).toBe(false);
    expect(env.RECERTIFICATION_CRON_SCHEDULE).toBe('0 3 * * *');
  });

  it('never coerces the string "false" to true', () => {
    const env = backendEnvSchema.parse({ ...baseEnv(), RECERTIFICATION_SCAN_ENABLED: 'false' });
    expect(env.RECERTIFICATION_SCAN_ENABLED).toBe(false);
  });

  it('enables on "true" and accepts a custom cron', () => {
    const env = backendEnvSchema.parse({
      ...baseEnv(),
      RECERTIFICATION_SCAN_ENABLED: 'true',
      RECERTIFICATION_CRON_SCHEDULE: '0 2 * * *'
    });
    expect(env.RECERTIFICATION_SCAN_ENABLED).toBe(true);
    expect(env.RECERTIFICATION_CRON_SCHEDULE).toBe('0 2 * * *');
  });
});
```

> Use the file's existing minimal-env helper (it may be named `baseEnv()`, `validEnv()`, or an inline object). Match the import of `backendEnvSchema` already present in the file. If `env.test.ts` uses `describe`/`it` from `vitest` already, do not re-import.

- [x] **Step 3: Run the test**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/env.test.ts --no-file-parallelism`
Expected: PASS.

- [x] **Step 4: Commit**

```bash
git add apps/backend/src/env.schema.ts apps/backend/src/env.test.ts
git commit -m "feat(backend): RECERTIFICATION_SCAN_ENABLED + RECERTIFICATION_CRON_SCHEDULE env flags"
```

---

## Task 3: Pure `pickMilestone` util + milestone constants

**Files:**

- Create: `apps/backend/src/modules/mvp/reminders/milestone.util.ts`
- Create: `apps/backend/src/modules/mvp/reminders/milestone.util.test.ts`

> Reuses `addDays` from `apps/backend/src/common/utils/date-math.util.ts` (added in 5B). `pickMilestone` returns the **smallest satisfied** threshold so a doc seen first inside the 30-day window gets the 30-day notice (not the 90-day one), and an expired doc gets the most-urgent (smallest) milestone. Both inputs are normalized to `YYYY-MM-DD` so a timestamp `plannedEndAt` compares correctly against a date.

- [x] **Step 1: Write the failing test**

Create `apps/backend/src/modules/mvp/reminders/milestone.util.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { COURSE_DEADLINE_MILESTONES, RECERT_MILESTONES, pickMilestone } from './milestone.util.js';

const ASOF = '2026-06-05';

describe('pickMilestone', () => {
  it('returns the smallest satisfied threshold', () => {
    // 57 days out → only the 90-day threshold is satisfied
    expect(pickMilestone(ASOF, '2026-08-01', RECERT_MILESTONES)).toBe(90);
    // 25 days out → 30 is the smallest satisfied
    expect(pickMilestone(ASOF, '2026-06-30', RECERT_MILESTONES)).toBe(30);
    // 3 days out → 7 is the smallest satisfied
    expect(pickMilestone(ASOF, '2026-06-08', RECERT_MILESTONES)).toBe(7);
  });

  it('returns the most-urgent milestone for an already-expired date', () => {
    expect(pickMilestone(ASOF, '2026-01-01', RECERT_MILESTONES)).toBe(7);
  });

  it('returns null when the date is beyond the largest threshold', () => {
    expect(pickMilestone(ASOF, '2027-01-01', RECERT_MILESTONES)).toBeNull();
  });

  it('normalizes an ISO timestamp target to its date part', () => {
    // plannedEndAt is a timestamp; 10 days out → 14 is the smallest course-deadline milestone
    expect(pickMilestone(ASOF, '2026-06-15T09:00:00.000Z', COURSE_DEADLINE_MILESTONES)).toBe(14);
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/reminders/milestone.util.test.ts --no-file-parallelism`
Expected: FAIL — cannot find module `./milestone.util.js`.

- [x] **Step 3: Implement the util**

Create `apps/backend/src/modules/mvp/reminders/milestone.util.ts`:

```ts
import { addDays } from '../../../common/utils/date-math.util.js';

/** Recertification reminder thresholds (days before expiry), ascending. */
export const RECERT_MILESTONES = [7, 30, 90] as const;

/** Course-deadline reminder thresholds (days before planned completion), ascending. */
export const COURSE_DEADLINE_MILESTONES = [1, 7, 14] as const;

/**
 * Return the smallest threshold `t` (from `thresholdsAsc`) such that `target` falls on or
 * before `asOf + t` days; `null` when `target` is beyond the largest threshold. Both dates
 * are normalized to their `YYYY-MM-DD` part, so an ISO timestamp `target` compares correctly.
 */
export function pickMilestone(
  asOf: string,
  target: string,
  thresholdsAsc: readonly number[]
): number | null {
  const asOfDate = asOf.slice(0, 10);
  const targetDate = target.slice(0, 10);
  for (const t of thresholdsAsc) {
    if (targetDate <= addDays(asOfDate, t)) {
      return t;
    }
  }
  return null;
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/reminders/milestone.util.test.ts --no-file-parallelism`
Expected: PASS (all cases).

- [x] **Step 5: Commit**

```bash
git add apps/backend/src/modules/mvp/reminders/milestone.util.ts apps/backend/src/modules/mvp/reminders/milestone.util.test.ts
git commit -m "feat(backend): pickMilestone util for graduated reminder cadence"
```

---

## Task 4: Migration 0049 — `email_deliveries.dedup_key`

**Files:**

- Create: `apps/backend/migrations/0049_communication_email_dedup_key.sql`

> Latest migration on `main` is `0048_learning_recertification_foundation.sql` → next is **0049**. The `email_deliveries` table is created in `0047_communication_email_foundation.sql`; mirror its `add column if not exists` precedent (see `0033`/`0034`/`0048` ALTERs).

- [x] **Step 1: Write the migration SQL**

Create `apps/backend/migrations/0049_communication_email_dedup_key.sql`:

```sql
-- 0049_communication_email_dedup_key.sql
-- Phase 5 Plan 5B-2 — per-milestone send-once dedup for graduated reminders.
-- dedup_key encodes feature:entity:milestone, e.g. 'recert:recert_ab12:30', 'deadline:enr_x:7',
-- 'revoked:gdoc_y'. NULL for pre-existing rows and any non-deduped send. The index is a plain
-- lookup index (NOT unique): a two-recipient dispatch shares one dedup_key, and the cron's
-- pg_try_advisory_xact_lock + per-tenant TenantSerialGateway serialization make check-then-send
-- race-free. The recertification_drafts unique constraint (0048) independently dedupes drafts.

alter table communication.email_deliveries
  add column if not exists dedup_key text;

create index if not exists idx_email_deliveries_tenant_dedup
  on communication.email_deliveries (tenant_id, dedup_key);
```

- [x] **Step 2: Verify the migration applies cleanly**

Run: `pnpm test:migrations`
Expected: PASS (the runner applies `0049` with no SQL errors). If the DB must be up, run `pnpm docker:infra` first.

- [x] **Step 3: Commit**

```bash
git add apps/backend/migrations/0049_communication_email_dedup_key.sql
git commit -m "feat(backend): migration 0049 — email_deliveries.dedup_key + lookup index"
```

---

## Task 5: `EmailDeliveriesRepository.findByDedupKey` + `dedupKey` field

**Files:**

- Modify: `apps/backend/src/modules/communication/email-deliveries.repository.ts`
- Modify: `apps/backend/src/modules/communication/in-memory-email-deliveries.state.ts`
- Modify: `apps/backend/src/modules/communication/postgres-email-deliveries.repository.ts`
- Create: `apps/backend/src/modules/communication/in-memory-email-deliveries.state.test.ts`

- [x] **Step 1: Extend the interface + row type**

In `apps/backend/src/modules/communication/email-deliveries.repository.ts`:

- In `EmailDeliveryRow` (after `relatedEntityId?` on line 19), add:
  ```ts
    /** Phase 5B-2 — send-once key (feature:entity:milestone); undefined when not deduped. */
    dedupKey?: string;
  ```
  (`EmailDeliverySeed = Omit<EmailDeliveryRow, 'id' | 'createdAt'>` picks this up automatically.)
- In `EmailDeliveriesRepository` (line 30-36), add the lookup method:

  ```ts
    findByDedupKey(tenantId: string, dedupKey: string): Promise<EmailDeliveryRow | null>;
  ```

- [x] **Step 2: Write the failing in-memory test**

Create `apps/backend/src/modules/communication/in-memory-email-deliveries.state.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { InMemoryEmailDeliveriesState } from './in-memory-email-deliveries.state.js';

import type { EmailDeliverySeed } from './email-deliveries.repository.js';

function seed(over: Partial<EmailDeliverySeed> = {}): EmailDeliverySeed {
  return {
    tenantId: 't1',
    templateKey: 'recertification_due',
    recipientEmail: 'ivan@example.com',
    recipientKind: 'learner',
    subject: 'тест',
    status: 'sent',
    ...over
  };
}

describe('InMemoryEmailDeliveriesState.findByDedupKey', () => {
  it('returns null when no delivery has the key', async () => {
    const repo = new InMemoryEmailDeliveriesState();
    expect(await repo.findByDedupKey('t1', 'recert:d1:30')).toBeNull();
  });

  it('returns a recorded delivery by (tenant, dedupKey)', async () => {
    const repo = new InMemoryEmailDeliveriesState();
    await repo.record(seed({ dedupKey: 'recert:d1:30' }));
    const found = await repo.findByDedupKey('t1', 'recert:d1:30');
    expect(found?.dedupKey).toBe('recert:d1:30');
  });

  it('is tenant-scoped', async () => {
    const repo = new InMemoryEmailDeliveriesState();
    await repo.record(seed({ tenantId: 't1', dedupKey: 'recert:d1:30' }));
    expect(await repo.findByDedupKey('t2', 'recert:d1:30')).toBeNull();
  });
});
```

- [x] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/communication/in-memory-email-deliveries.state.test.ts --no-file-parallelism`
Expected: FAIL — `repo.findByDedupKey is not a function`.

- [x] **Step 4: Implement `findByDedupKey` in the in-memory repo**

In `apps/backend/src/modules/communication/in-memory-email-deliveries.state.ts`, add a method after `list` (the existing `record` already spreads `...seed`, so `dedupKey` persists automatically):

```ts
  async findByDedupKey(tenantId: string, dedupKey: string): Promise<EmailDeliveryRow | null> {
    return (
      this.deliveries.find((d) => d.tenantId === tenantId && d.dedupKey === dedupKey) ?? null
    );
  }
```

- [x] **Step 5: Run the in-memory test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/communication/in-memory-email-deliveries.state.test.ts --no-file-parallelism`
Expected: PASS.

- [x] **Step 6: Implement `dedup_key` in the postgres repo**

In `apps/backend/src/modules/communication/postgres-email-deliveries.repository.ts`:

- Add `dedup_key: string | null;` to `EmailDeliveryDbRow` (after `related_entity_id`).
- In `record`, add `dedup_key` to the insert columns + a `$12` param:
  ```ts
  const rows = await this.db.query<EmailDeliveryDbRow>(
    `insert into communication.email_deliveries
         (id, tenant_id, template_key, recipient_email, recipient_kind, subject, status,
          provider_message_id, error, related_entity_type, related_entity_id, dedup_key, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())
       returning *`,
    [
      id,
      seed.tenantId,
      seed.templateKey,
      seed.recipientEmail,
      seed.recipientKind,
      seed.subject,
      seed.status,
      seed.providerMessageId ?? null,
      seed.error ?? null,
      seed.relatedEntityType ?? null,
      seed.relatedEntityId ?? null,
      seed.dedupKey ?? null
    ]
  );
  ```
- Add the lookup method after `list`:
  ```ts
  async findByDedupKey(tenantId: string, dedupKey: string): Promise<EmailDeliveryRow | null> {
    const rows = await this.db.query<EmailDeliveryDbRow>(
      `select * from communication.email_deliveries
       where tenant_id = $1 and dedup_key = $2
       order by created_at desc
       limit 1`,
      [tenantId, dedupKey]
    );
    return rows[0] ? this.map(rows[0]) : null;
  }
  ```
- In `map`, add the conditional spread (after `relatedEntityId`):
  ```ts
      ...(row.dedup_key ? { dedupKey: row.dedup_key } : {}),
  ```

> The `list` query uses `select *`, so `total_count` is still computed via the window function and `dedup_key` is simply ignored by `map` unless present — no change to `list` needed.

- [x] **Step 7: Typecheck**

Run: `pnpm --filter @cdoprof/backend exec tsc --noEmit`
Expected: PASS.

- [x] **Step 8: Commit**

```bash
git add apps/backend/src/modules/communication/email-deliveries.repository.ts apps/backend/src/modules/communication/in-memory-email-deliveries.state.ts apps/backend/src/modules/communication/postgres-email-deliveries.repository.ts apps/backend/src/modules/communication/in-memory-email-deliveries.state.test.ts
git commit -m "feat(backend): email_deliveries dedupKey + findByDedupKey (in-memory + postgres)"
```

---

## Task 6: `NotificationDispatcher` dedup skip

**Files:**

- Modify: `apps/backend/src/modules/communication/notification-dispatcher.service.ts`
- Create: `apps/backend/src/modules/communication/notification-dispatcher.service.test.ts`

- [x] **Step 1: Write the failing test**

Create `apps/backend/src/modules/communication/notification-dispatcher.service.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import { InMemoryEmailDeliveriesState } from './in-memory-email-deliveries.state.js';
import { NotificationDispatcher } from './notification-dispatcher.service.js';

function make() {
  const mailer = { send: vi.fn().mockResolvedValue({ status: 'sent' }) };
  const templates = { getOverride: vi.fn().mockResolvedValue(null) };
  const deliveries = new InMemoryEmailDeliveriesState();
  const dispatcher = new NotificationDispatcher(
    mailer as never,
    templates as never,
    deliveries as never
  );
  return { dispatcher, mailer, deliveries };
}

const baseInput = {
  tenantId: 't1',
  templateKey: 'recertification_due' as const,
  recipients: [{ email: 'ivan@example.com', name: 'Иван', kind: 'learner' as const }],
  variables: { learnerName: 'Иван', courseTitle: 'ОТ', validUntil: '2026-08-01' }
};

describe('NotificationDispatcher dedup', () => {
  it('sends and records when no dedupKey is provided (unchanged behaviour)', async () => {
    const { dispatcher, mailer, deliveries } = make();
    await dispatcher.dispatch(baseInput);
    expect(mailer.send).toHaveBeenCalledTimes(1);
    expect((await deliveries.list('t1', {})).total).toBe(1);
  });

  it('skips the send entirely when a delivery with the dedupKey already exists', async () => {
    const { dispatcher, mailer, deliveries } = make();
    await dispatcher.dispatch({ ...baseInput, dedupKey: 'recert:d1:30' });
    expect(mailer.send).toHaveBeenCalledTimes(1);
    await dispatcher.dispatch({ ...baseInput, dedupKey: 'recert:d1:30' });
    expect(mailer.send).toHaveBeenCalledTimes(1); // not re-sent
    expect((await deliveries.list('t1', {})).total).toBe(1);
  });

  it('records the dedupKey so subsequent sends are deduped', async () => {
    const { dispatcher, deliveries } = make();
    await dispatcher.dispatch({ ...baseInput, dedupKey: 'recert:d1:7' });
    expect(await deliveries.findByDedupKey('t1', 'recert:d1:7')).not.toBeNull();
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/communication/notification-dispatcher.service.test.ts --no-file-parallelism`
Expected: FAIL — the second `dispatch` re-sends (no dedup logic yet) / `dedupKey` not on `DispatchInput`.

- [x] **Step 3: Add `dedupKey` to `DispatchInput` + skip logic**

In `apps/backend/src/modules/communication/notification-dispatcher.service.ts`:

- Add to `DispatchInput` (after `relatedEntityId?` on line 28):
  ```ts
    /** Phase 5B-2 — send-once key; when a delivery with this key exists, the dispatch is skipped. */
    dedupKey?: string;
  ```
- At the start of `dispatch` (before the template lookup on line 40), add the guard:
  ```ts
  if (input.dedupKey) {
    const existing = await this.deliveries.findByDedupKey(input.tenantId, input.dedupKey);
    if (existing) {
      return;
    }
  }
  ```
- In the `this.deliveries.record({ ... })` seed (line 51-62), add the conditional spread (alongside the other conditional spreads):

  ```ts
        ...(input.dedupKey ? { dedupKey: input.dedupKey } : {}),
  ```

- [x] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/communication/notification-dispatcher.service.test.ts --no-file-parallelism`
Expected: PASS.

- [x] **Step 5: Typecheck + commit**

Run: `pnpm --filter @cdoprof/backend exec tsc --noEmit`
Expected: PASS.

```bash
git add apps/backend/src/modules/communication/notification-dispatcher.service.ts apps/backend/src/modules/communication/notification-dispatcher.service.test.ts
git commit -m "feat(backend): NotificationDispatcher dedupKey skip (send-once)"
```

---

## Task 7: Email templates — `course_deadline` + `document_revoked`

**Files:**

- Modify: `apps/backend/src/modules/communication/email-templates.ts`

- [x] **Step 1: Extend the union + defaults**

In `apps/backend/src/modules/communication/email-templates.ts`:

- Extend `EmailTemplateKey` (line 1):
  ```ts
  export type EmailTemplateKey =
    | 'enrollment_invite'
    | 'course_completed'
    | 'recertification_due'
    | 'course_deadline'
    | 'document_revoked';
  ```
- Add to `EMAIL_TEMPLATE_DEFAULTS` (after the `recertification_due` entry, before the closing `}` on line 35):
  ```ts
    ,
    course_deadline: {
      subject: 'Приближается срок завершения обучения по программе «{{courseTitle}}»',
      body:
        'Здравствуйте, {{learnerName}}!\n\n' +
        'Срок завершения обучения по программе «{{courseTitle}}» — {{deadline}}. ' +
        'Пожалуйста, завершите оставшиеся материалы и итоговое тестирование в личном кабинете до этой даты.\n\n' +
        'С уважением, учебный центр.'
    },
    document_revoked: {
      subject: 'Документ по программе «{{courseTitle}}» аннулирован',
      body:
        'Здравствуйте, {{learnerName}}!\n\n' +
        'Выданный вам документ по программе «{{courseTitle}}» был аннулирован. ' +
        'Причина: {{reason}}. ' +
        'По вопросам перевыпуска обратитесь в учебный центр.\n\n' +
        'С уважением, учебный центр.'
    }
  ```

> `EMAIL_TEMPLATE_DEFAULTS` is typed `Record<EmailTemplateKey, EmailTemplateBody>`, so omitting either new key is a compile error — this guarantees coverage. Check the exact comma placement: the existing `recertification_due` entry currently ends the object, so add a leading comma as shown.

- [x] **Step 2: Typecheck**

Run: `pnpm --filter @cdoprof/backend exec tsc --noEmit`
Expected: PASS (the `Record` is now exhaustive for the widened union).

- [x] **Step 3: Commit**

```bash
git add apps/backend/src/modules/communication/email-templates.ts
git commit -m "feat(backend): course_deadline + document_revoked email templates"
```

---

## Task 8: `TenantService.listActiveTenantIds()`

**Files:**

- Modify: `apps/backend/src/modules/tenant/tenant.service.ts`
- Create: `apps/backend/src/modules/tenant/tenant.service.test.ts`

- [x] **Step 1: Write the failing test**

Create `apps/backend/src/modules/tenant/tenant.service.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { TenantService } from './tenant.service.js';

describe('TenantService.listActiveTenantIds (in-memory fallback)', () => {
  it('returns the demo tenant id when no database is configured', async () => {
    const service = new TenantService({ enforceTenantScope: () => undefined } as never);
    expect(await service.listActiveTenantIds()).toEqual(['tenant_demo']);
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/tenant/tenant.service.test.ts --no-file-parallelism`
Expected: FAIL — `service.listActiveTenantIds is not a function`.

- [x] **Step 3: Implement the method**

In `apps/backend/src/modules/tenant/tenant.service.ts`, add a method (e.g. after `getTenantById`, ≈ line 66), mirroring the `if (this.databaseService) { ... } else { ... }` shape used throughout the class:

```ts
  /** All active tenant ids — used by the nightly cross-tenant reminders scan (Plan 5B-2). */
  async listActiveTenantIds(): Promise<string[]> {
    if (this.databaseService) {
      const rows = await this.databaseService.query<{ id: string }>(
        "select id from core.tenants where status = 'active' order by id"
      );
      return rows.map((r) => r.id);
    }
    return this.tenants.filter((t) => t.status === 'active').map((t) => t.id);
  }
```

- [x] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/tenant/tenant.service.test.ts --no-file-parallelism`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/backend/src/modules/tenant/tenant.service.ts apps/backend/src/modules/tenant/tenant.service.test.ts
git commit -m "feat(backend): TenantService.listActiveTenantIds for cross-tenant scan"
```

---

## Task 9: `MvpTenantRunner` — read-only out-of-request MVP state harness

**Files:**

- Create: `apps/backend/src/modules/mvp/infrastructure/mvp-tenant-runner.service.ts`
- Create: `apps/backend/src/modules/mvp/infrastructure/mvp-tenant-runner.service.test.ts`

> Mirrors `DocumentsTenantRunner` (`apps/backend/src/modules/documents/documents-tenant-runner.service.ts`) but **read-only**: the reminder scanners never mutate MVP state (drafts live in their own table; emails in `email_deliveries`), so there is no `saveFromState` in `finally`. It runs under the shared `TenantSerialGateway`, so it serializes with the HTTP `MvpRequestPersistenceInterceptor` for the same tenant.

- [x] **Step 1: Write the failing test**

Create `apps/backend/src/modules/mvp/infrastructure/mvp-tenant-runner.service.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import { InMemoryMvpState } from './in-memory-mvp.state.js';
import { MvpTenantRunner } from './mvp-tenant-runner.service.js';
import { TenantSerialGateway } from '../../../infrastructure/request/tenant-serial.gateway.js';

describe('MvpTenantRunner', () => {
  it('loads the tenant state, runs the callback with it, and does not save', async () => {
    const loadIntoState = vi.fn(async (_tenantId: string, state: InMemoryMvpState) => {
      state.enrollments.push({
        id: 'enr1',
        tenantId: 't1',
        groupId: 'g1',
        learnerId: 'l1',
        status: 'active',
        enrolledAt: '2026-01-01T00:00:00.000Z'
      } as never);
    });
    const saveFromState = vi.fn();
    const persistence = { loadIntoState, saveFromState };
    const runner = new MvpTenantRunner(persistence as never, new TenantSerialGateway());

    const ids = await runner.runWithTenantState('t1', async (state) =>
      state.enrollments.map((e) => e.id)
    );

    expect(loadIntoState).toHaveBeenCalledWith('t1', expect.any(InMemoryMvpState));
    expect(ids).toEqual(['enr1']);
    expect(saveFromState).not.toHaveBeenCalled();
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/infrastructure/mvp-tenant-runner.service.test.ts --no-file-parallelism`
Expected: FAIL — cannot find module `./mvp-tenant-runner.service.js`.

- [x] **Step 3: Implement the runner**

Create `apps/backend/src/modules/mvp/infrastructure/mvp-tenant-runner.service.ts`:

```ts
import { Inject, Injectable } from '@nestjs/common';

import { InMemoryMvpState } from './in-memory-mvp.state.js';
import { MVP_PERSISTENCE_BACKEND } from './mvp-persistence.token.js';
import { TenantSerialGateway } from '../../../infrastructure/request/tenant-serial.gateway.js';

import type { MvpPersistenceBackend } from './mvp-persistence.backend.js';

/**
 * Runs read-only MVP-state work outside an HTTP request (e.g. the nightly reminders cron):
 * load tenant state → fn(state), under the shared per-tenant lock. Intentionally does NOT
 * save — callers must not mutate the state (drafts/emails persist in their own stores).
 */
@Injectable()
export class MvpTenantRunner {
  constructor(
    @Inject(MVP_PERSISTENCE_BACKEND)
    private readonly persistence: MvpPersistenceBackend,
    private readonly tenantGateway: TenantSerialGateway
  ) {}

  async runWithTenantState<R>(
    tenantId: string,
    fn: (state: InMemoryMvpState) => Promise<R>
  ): Promise<R> {
    return this.tenantGateway.runExclusive(tenantId, async () => {
      const state = new InMemoryMvpState();
      await this.persistence.loadIntoState(tenantId, state);
      return fn(state);
    });
  }
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/infrastructure/mvp-tenant-runner.service.test.ts --no-file-parallelism`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/backend/src/modules/mvp/infrastructure/mvp-tenant-runner.service.ts apps/backend/src/modules/mvp/infrastructure/mvp-tenant-runner.service.test.ts
git commit -m "feat(backend): MvpTenantRunner — read-only out-of-request MVP state harness"
```

---

## Task 10: Extract `RecertificationScanner` + 90/30/7 cadence

**Files:**

- Create: `apps/backend/src/modules/mvp/reminders/reminder-recipients.ts`
- Create: `apps/backend/src/modules/mvp/recertification/recertification-scanner.service.ts`
- Create: `apps/backend/src/modules/mvp/recertification/recertification-scanner.service.test.ts`
- Modify: `apps/backend/src/modules/mvp/recertification/recertification.service.ts`
- Modify: `apps/backend/src/modules/mvp/recertification/recertification.service.test.ts`

> **Behaviour change (intended):** 5B dispatched `recertification_due` **once when the draft was created**. 5B-2 dispatches **once per milestone** (90/30/7) using `dedupKey = recert:<draftId>:<milestone>`, so a learner gets up to three notices as expiry approaches. The draft is still created once (idempotent). Do **not** preserve the old once-on-creation gate.

- [x] **Step 1: Create the shared pure resolvers**

Create `apps/backend/src/modules/mvp/reminders/reminder-recipients.ts`:

```ts
import { learnerRecipient } from '../enrollment-recipient.js';

import type { DispatchRecipient } from '../../communication/notification-dispatcher.service.js';
import type { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import type { Enrollment } from '../mvp.types.js';

/** First course-version id linked to the enrollment's group (mirrors 5B's scan). */
export function resolveCourseVersionIdForGroup(
  state: InMemoryMvpState,
  tenantId: string,
  groupId: string
): string | undefined {
  return state.groupCourses.find(
    (gc) => gc.tenantId === tenantId && gc.groupId === groupId && gc.courseVersionId
  )?.courseVersionId;
}

/** Course title for a course-version id (version → course → title). */
export function resolveCourseTitleByVersion(
  state: InMemoryMvpState,
  tenantId: string,
  courseVersionId: string
): string | undefined {
  const cv = state.courseVersions.find((v) => v.tenantId === tenantId && v.id === courseVersionId);
  const course = cv && state.courses.find((c) => c.tenantId === tenantId && c.id === cv.courseId);
  return course ? course.title : undefined;
}

/** Employer contact e-mail via the group's linked counterparty. */
export function resolveEmployerEmail(
  state: InMemoryMvpState,
  tenantId: string,
  groupId: string
): string | undefined {
  const group = state.groups.find((g) => g.tenantId === tenantId && g.id === groupId);
  if (!group?.counterpartyId) return undefined;
  return state.counterparties.find((c) => c.tenantId === tenantId && c.id === group.counterpartyId)
    ?.contactEmail;
}

/** Learner (+ employer when present) recipients for an enrollment. */
export function buildLearnerEmployerRecipients(
  state: InMemoryMvpState,
  tenantId: string,
  enrollment: Enrollment
): DispatchRecipient[] {
  const recipients: DispatchRecipient[] = [];
  const learner = state.learners.find(
    (l) => l.tenantId === tenantId && l.id === enrollment.learnerId
  );
  const rcpt = learnerRecipient(learner);
  if (rcpt) {
    recipients.push({ email: rcpt.email, name: rcpt.name, kind: 'learner' });
  }
  const employerEmail = resolveEmployerEmail(state, tenantId, enrollment.groupId);
  if (employerEmail) {
    recipients.push({ email: employerEmail, kind: 'employer' });
  }
  return recipients;
}
```

- [x] **Step 2: Write the failing scanner test**

Create `apps/backend/src/modules/mvp/recertification/recertification-scanner.service.test.ts`:

```ts
import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { InMemoryRecertificationDraftsState } from './in-memory-recertification-drafts.state.js';
import {
  RecertificationScanner,
  scanForRecertification
} from './recertification-scanner.service.js';

const ASOF = '2026-06-05';

function doc(over: Record<string, unknown> = {}) {
  return {
    id: 'gdoc1',
    tenantId: 't1',
    sourceEntityType: 'enrollment',
    sourceEntityId: 'enr1',
    status: 'generated',
    validUntil: '2026-08-01', // 57 days out → 90-day milestone
    ...over
  };
}

function state() {
  return {
    enrollments: [
      { id: 'enr1', tenantId: 't1', learnerId: 'l1', groupId: 'g1', status: 'completed' }
    ],
    learners: [
      { id: 'l1', tenantId: 't1', firstName: 'Иван', lastName: 'Иванов', email: 'ivan@example.com' }
    ],
    groupCourses: [
      { id: 'gc1', tenantId: 't1', groupId: 'g1', courseId: 'c1', courseVersionId: 'cv1' }
    ],
    groups: [{ id: 'g1', tenantId: 't1', name: 'Группа 1' }],
    counterparties: [],
    courseVersions: [{ id: 'cv1', tenantId: 't1', courseId: 'c1' }],
    courses: [{ id: 'c1', tenantId: 't1', title: 'Охрана труда' }]
  };
}

function make(over: { dispatch?: ReturnType<typeof vi.fn>; docs?: unknown[] } = {}) {
  const drafts = new InMemoryRecertificationDraftsState();
  const dispatch = over.dispatch ?? vi.fn().mockResolvedValue(undefined);
  const documentsRunner = {
    runWithTenantDocuments: async (
      _tenantId: string,
      fn: (d: { listDocuments: () => { items: unknown[]; total: number } }) => unknown
    ) => fn({ listDocuments: () => ({ items: over.docs ?? [doc()], total: 1 }) })
  };
  const scanner = new RecertificationScanner(
    drafts,
    { dispatch } as never,
    documentsRunner as never
  );
  return { scanner, drafts, dispatch };
}

describe('scanForRecertification (pure)', () => {
  it('selects documents within the horizon (including expired), ignores far/none/revoked', () => {
    expect(scanForRecertification(ASOF, [doc()] as never, 90).map((c) => c.documentId)).toEqual([
      'gdoc1'
    ]);
    expect(
      scanForRecertification(ASOF, [doc({ validUntil: '2026-01-01' })] as never, 90)
    ).toHaveLength(1);
    const skip = [
      doc({ id: 'far', validUntil: '2027-01-01' }),
      doc({ id: 'none', validUntil: undefined }),
      doc({ id: 'rev', status: 'revoked', revokedAt: '2026-05-01' })
    ];
    expect(scanForRecertification(ASOF, skip as never, 90)).toHaveLength(0);
  });
});

describe('RecertificationScanner.scanTenant', () => {
  it('creates a draft and dispatches a recertification_due email with the 90-day dedupKey', async () => {
    const { scanner, drafts, dispatch } = make();
    const summary = await scanner.scanTenant('t1', ASOF, state() as never);
    expect(summary.draftsCreated).toBe(1);
    expect((await drafts.list('t1', {})).length).toBe(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
    const arg = dispatch.mock.calls[0]![0];
    expect(arg.templateKey).toBe('recertification_due');
    expect(arg.recipients[0].email).toBe('ivan@example.com');
    expect(arg.variables.courseTitle).toBe('Охрана труда');
    expect(arg.dedupKey).toMatch(/^recert:.+:90$/);
  });

  it('re-uses the existing draft on a second scan (no new draft) and still dispatches (dispatcher dedups)', async () => {
    const { scanner, drafts, dispatch } = make();
    await scanner.scanTenant('t1', ASOF, state() as never);
    const summary = await scanner.scanTenant('t1', ASOF, state() as never);
    expect(summary.draftsCreated).toBe(0);
    expect((await drafts.list('t1', {})).length).toBe(1);
    // The fake dispatcher does not dedup; both scans pass the same stable dedupKey.
    expect(dispatch.mock.calls.every((c) => /^recert:.+:90$/.test(c[0].dedupKey))).toBe(true);
  });

  it('uses the 7-day dedupKey for an already-expired document', async () => {
    const { scanner, dispatch } = make({ docs: [doc({ validUntil: '2026-01-01' })] });
    await scanner.scanTenant('t1', ASOF, state() as never);
    expect(dispatch.mock.calls[0]![0].dedupKey).toMatch(/^recert:.+:7$/);
  });

  it('tolerates a dispatch failure — draft still created, scan does not throw', async () => {
    const dispatch = vi.fn().mockRejectedValue(new Error('smtp down'));
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { scanner, drafts } = make({ dispatch });
    const summary = await scanner.scanTenant('t1', ASOF, state() as never);
    expect(summary.draftsCreated).toBe(1);
    expect(summary.emailsDispatched).toBe(0);
    expect((await drafts.list('t1', {})).length).toBe(1);
    errorSpy.mockRestore();
  });
});
```

- [x] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/recertification/recertification-scanner.service.test.ts --no-file-parallelism`
Expected: FAIL — cannot find module `./recertification-scanner.service.js`.

- [x] **Step 4: Implement the scanner (move scan logic out of the service)**

Create `apps/backend/src/modules/mvp/recertification/recertification-scanner.service.ts`:

```ts
import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  RECERTIFICATION_DRAFTS_REPOSITORY,
  type RecertificationDraftsRepository
} from './recertification-drafts.repository.js';
import { addDays } from '../../../common/utils/date-math.util.js';
import { NotificationDispatcher } from '../../communication/notification-dispatcher.service.js';
import { DocumentsTenantRunner } from '../../documents/documents-tenant-runner.service.js';
import { RECERT_MILESTONES, pickMilestone } from '../reminders/milestone.util.js';
import {
  buildLearnerEmployerRecipients,
  resolveCourseTitleByVersion,
  resolveCourseVersionIdForGroup
} from '../reminders/reminder-recipients.js';

import type { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';

/** Phase 5B — окно опережения: документы с validUntil ≤ today+90d попадают в скан. */
export const RECERT_HORIZON_DAYS = 90;

export interface RecertCandidate {
  documentId: string;
  sourceEntityId: string;
  validUntil: string;
}

export interface RecertScanSummary {
  draftsCreated: number;
  emailsDispatched: number;
}

/**
 * Pure selection: keep generated (non-revoked) documents whose validUntil falls at or before
 * today+horizon (includes already-expired). String date comparison is safe because validUntil
 * is canonical YYYY-MM-DD.
 */
export function scanForRecertification(
  asOf: string,
  documents: Array<{
    id: string;
    sourceEntityType?: string;
    sourceEntityId?: string;
    status?: string;
    revokedAt?: string;
    validUntil?: string;
  }>,
  horizonDays: number
): RecertCandidate[] {
  const horizon = addDays(asOf, horizonDays);
  return documents
    .filter(
      (d) => !!d.validUntil && d.status !== 'revoked' && !d.revokedAt && d.validUntil <= horizon
    )
    .map((d) => ({
      documentId: d.id,
      sourceEntityId: d.sourceEntityId ?? '',
      validUntil: d.validUntil as string
    }));
}

/**
 * Singleton scan body shared by the request-scoped RecertificationService (manual endpoint) and
 * the nightly RemindersSchedulerService. Reads MVP data from the passed-in state (so it works
 * both inside an HTTP request and inside the cron via MvpTenantRunner). Dispatches a
 * `recertification_due` notice once per 90/30/7 milestone (deduped by the dispatcher).
 */
@Injectable()
export class RecertificationScanner {
  private readonly logger = new Logger(RecertificationScanner.name);

  constructor(
    @Inject(RECERTIFICATION_DRAFTS_REPOSITORY)
    private readonly drafts: RecertificationDraftsRepository,
    private readonly dispatcher: NotificationDispatcher,
    private readonly documentsRunner: DocumentsTenantRunner
  ) {}

  async scanTenant(
    tenantId: string,
    asOf: string,
    state: InMemoryMvpState
  ): Promise<RecertScanSummary> {
    const candidates = await this.documentsRunner.runWithTenantDocuments(
      tenantId,
      async (documents) =>
        scanForRecertification(
          asOf,
          documents.listDocuments(tenantId, { pageSize: Number.MAX_SAFE_INTEGER }).items,
          RECERT_HORIZON_DAYS
        )
    );

    let draftsCreated = 0;
    let emailsDispatched = 0;

    for (const candidate of candidates) {
      const enrollment = state.enrollments.find(
        (e) => e.tenantId === tenantId && e.id === candidate.sourceEntityId
      );
      if (!enrollment) continue;

      const courseVersionId = resolveCourseVersionIdForGroup(state, tenantId, enrollment.groupId);
      if (!courseVersionId) continue;

      const { row, created } = await this.drafts.create({
        tenantId,
        learnerId: enrollment.learnerId,
        sourceDocumentId: candidate.documentId,
        courseVersionId,
        validUntil: candidate.validUntil
      });
      if (created) draftsCreated++;

      const milestone = pickMilestone(asOf, candidate.validUntil, RECERT_MILESTONES);
      if (milestone === null) continue;

      const recipients = buildLearnerEmployerRecipients(state, tenantId, enrollment);
      if (recipients.length === 0) continue;

      try {
        await this.dispatcher.dispatch({
          tenantId,
          templateKey: 'recertification_due',
          recipients,
          variables: {
            learnerName: recipients.find((r) => r.kind === 'learner')?.name ?? '',
            courseTitle: resolveCourseTitleByVersion(state, tenantId, courseVersionId) ?? '',
            validUntil: candidate.validUntil
          },
          relatedEntityType: 'recertification_draft',
          relatedEntityId: row.id,
          dedupKey: `recert:${row.id}:${milestone}`
        });
        emailsDispatched += recipients.length;
      } catch (err) {
        this.logger.error(
          `Failed to dispatch recertification_due for draft ${row.id}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    return { draftsCreated, emailsDispatched };
  }
}
```

- [x] **Step 5: Run the scanner test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/recertification/recertification-scanner.service.test.ts --no-file-parallelism`
Expected: PASS.

- [x] **Step 6: Slim down `RecertificationService` to delegate**

Rewrite `apps/backend/src/modules/mvp/recertification/recertification.service.ts` so it keeps only `runScan` (delegating to the scanner), `listDrafts`, `approveDraft`, `rejectDraft`. Replace the top of the file and the scan method:

- Replace the imports block (lines 1-18) with:

  ```ts
  import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';

  import {
    RECERTIFICATION_DRAFTS_REPOSITORY,
    type RecertificationDraftRow,
    type RecertificationDraftsQuery,
    type RecertificationDraftsRepository
  } from './recertification-drafts.repository.js';
  import {
    RecertificationScanner,
    type RecertScanSummary
  } from './recertification-scanner.service.js';
  import { MVP_STATE } from '../infrastructure/mvp-state.token.js';
  import { MvpService } from '../mvp.service.js';

  import type { RequestContext } from '../../../common/context/request-context.js';
  import type { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';

  // Re-export so existing importers of these symbols keep working.
  export {
    RECERT_HORIZON_DAYS,
    scanForRecertification,
    type RecertCandidate,
    type RecertScanSummary
  } from './recertification-scanner.service.js';
  ```

- Delete the standalone `RECERT_HORIZON_DAYS`, `RecertCandidate`, `RecertScanSummary`, and `scanForRecertification` definitions (lines 20-61) — they now live in the scanner and are re-exported above.
- Replace the class constructor + `runScan` (lines 63-154) with:

  ```ts
  @Injectable()
  export class RecertificationService {
    constructor(
      @Inject(RECERTIFICATION_DRAFTS_REPOSITORY)
      private readonly drafts: RecertificationDraftsRepository,
      @Inject(MVP_STATE) private readonly state: InMemoryMvpState,
      private readonly mvp: MvpService,
      private readonly scanner: RecertificationScanner
    ) {}

    /** Manual per-tenant scan (HTTP-triggered). The interceptor has already loaded `this.state`. */
    runScan(tenantId: string, asOf: string, _ctx: RequestContext): Promise<RecertScanSummary> {
      return this.scanner.scanTenant(tenantId, asOf, this.state);
    }
  ```

- Keep `listDrafts`, `approveDraft`, `rejectDraft`, exactly as they are (lines 156-226). Delete the now-unused private `resolveEmployerEmail` and `resolveCourseTitle` methods (lines 228-243) — they moved to `reminder-recipients.ts`.

> After this, `RecertificationService` no longer imports `NotificationDispatcher`, `DocumentsTenantRunner`, `learnerRecipient`, `DispatchRecipient`, `addDays`, or `Logger` — remove any that are now unused so ESLint/`tsc` stay clean.

- [x] **Step 7: Update the 5B service test (constructor + delegation)**

In `apps/backend/src/modules/mvp/recertification/recertification.service.test.ts`:

- Remove the `scanForRecertification (pure)` describe and the `import { ..., scanForRecertification }` (those cases moved to the scanner test in Step 2).
- Change the `make()` helper to build a scanner and inject it. Replace the service construction (lines 76-82) with a scanner-backed build:
  ```ts
  import { RecertificationScanner } from './recertification-scanner.service.js';
  // ...
  const documents = {
    runWithTenantDocuments: async (
      _tenantId: string,
      fn: (d: { listDocuments: () => { items: unknown[]; total: number } }) => unknown
    ) => fn({ listDocuments: () => ({ items: [doc()], total: 1 }) })
  };
  const scanner = new RecertificationScanner(drafts, { dispatch } as never, documents as never);
  const service = new RecertificationService(drafts, state as never, mvp as never, scanner);
  ```
- The three `RecertificationService.runScan` cases stay, but the **idempotency** case asserts only the draft (the email dedup is the dispatcher's job, tested in Task 6). Replace the "sends no new email" assertion with a draft-only assertion:
  ```ts
  it('is idempotent on drafts — a second scan creates no new draft', async () => {
    const { service, drafts } = make();
    await service.runScan('t1', ASOF, { tenantId: 't1', userId: 'admin1' } as never);
    const summary = await service.runScan('t1', ASOF, {
      tenantId: 't1',
      userId: 'admin1'
    } as never);
    expect(summary.draftsCreated).toBe(0);
    expect((await drafts.list('t1', {})).length).toBe(1);
  });
  ```
- The `approveDraft` / `rejectDraft` cases are unchanged (the service still owns them).

- [x] **Step 8: Run both recert tests + typecheck**

Run each, expect PASS:

```bash
pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/recertification/recertification-scanner.service.test.ts --no-file-parallelism
pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/recertification/recertification.service.test.ts --no-file-parallelism
pnpm --filter @cdoprof/backend exec tsc --noEmit
```

> `tsc` will fail until Task 14 wires `RecertificationScanner` into `MvpModule` (DI can't resolve it yet at runtime, but the type-level compile of these files should already pass). If `tsc` reports an unresolved provider it is a runtime concern, not a type error — proceed; Task 14 closes it. If `tsc` reports a **type** error (e.g. a leftover unused import), fix it now.

- [x] **Step 9: Commit**

```bash
git add apps/backend/src/modules/mvp/reminders/reminder-recipients.ts apps/backend/src/modules/mvp/recertification/recertification-scanner.service.ts apps/backend/src/modules/mvp/recertification/recertification-scanner.service.test.ts apps/backend/src/modules/mvp/recertification/recertification.service.ts apps/backend/src/modules/mvp/recertification/recertification.service.test.ts
git commit -m "refactor(backend): extract RecertificationScanner + 90/30/7 cadence"
```

---

## Task 11: `CourseDeadlineScanner` — 14/7/1-day completion reminders

**Files:**

- Create: `apps/backend/src/modules/mvp/reminders/course-deadline-scanner.service.ts`
- Create: `apps/backend/src/modules/mvp/reminders/course-deadline-scanner.service.test.ts`

> Scans **incomplete** enrollments (`status` is `pending` or `active`) whose `plannedEndAt` falls within the largest milestone window, and dispatches `course_deadline` once per 14/7/1 milestone (`dedupKey = deadline:<enrollmentId>:<milestone>`). No new schema — `Enrollment.plannedEndAt` already exists (5B / migration 0023).

- [x] **Step 1: Write the failing test**

Create `apps/backend/src/modules/mvp/reminders/course-deadline-scanner.service.test.ts`:

```ts
import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { CourseDeadlineScanner } from './course-deadline-scanner.service.js';

const ASOF = '2026-06-05';

function state(over: Record<string, unknown> = {}) {
  return {
    enrollments: [
      {
        id: 'enr1',
        tenantId: 't1',
        learnerId: 'l1',
        groupId: 'g1',
        status: 'active',
        plannedEndAt: '2026-06-15T00:00:00.000Z' // 10 days out → 14-day milestone
      }
    ],
    learners: [
      { id: 'l1', tenantId: 't1', firstName: 'Иван', lastName: 'Иванов', email: 'ivan@example.com' }
    ],
    groupCourses: [
      { id: 'gc1', tenantId: 't1', groupId: 'g1', courseId: 'c1', courseVersionId: 'cv1' }
    ],
    groups: [{ id: 'g1', tenantId: 't1', name: 'Группа 1' }],
    counterparties: [],
    courseVersions: [{ id: 'cv1', tenantId: 't1', courseId: 'c1' }],
    courses: [{ id: 'c1', tenantId: 't1', title: 'Охрана труда' }],
    ...over
  };
}

function make(dispatch = vi.fn().mockResolvedValue(undefined)) {
  const scanner = new CourseDeadlineScanner({ dispatch } as never);
  return { scanner, dispatch };
}

describe('CourseDeadlineScanner.scanTenant', () => {
  it('dispatches a course_deadline reminder with the 14-day dedupKey', async () => {
    const { scanner, dispatch } = make();
    const summary = await scanner.scanTenant('t1', ASOF, state() as never);
    expect(summary.remindersDispatched).toBe(1);
    const arg = dispatch.mock.calls[0]![0];
    expect(arg.templateKey).toBe('course_deadline');
    expect(arg.recipients[0].email).toBe('ivan@example.com');
    expect(arg.variables.deadline).toBe('2026-06-15');
    expect(arg.dedupKey).toBe('deadline:enr1:14');
  });

  it('ignores completed enrollments and enrollments beyond the window', async () => {
    const { scanner } = make();
    const completed = state({
      enrollments: [
        {
          id: 'e1',
          tenantId: 't1',
          learnerId: 'l1',
          groupId: 'g1',
          status: 'completed',
          plannedEndAt: '2026-06-07T00:00:00.000Z'
        },
        {
          id: 'e2',
          tenantId: 't1',
          learnerId: 'l1',
          groupId: 'g1',
          status: 'active',
          plannedEndAt: '2026-09-01T00:00:00.000Z'
        }
      ]
    });
    const summary = await scanner.scanTenant('t1', ASOF, completed as never);
    expect(summary.remindersDispatched).toBe(0);
  });

  it('skips enrollments without a plannedEndAt', async () => {
    const { scanner } = make();
    const noDate = state({
      enrollments: [{ id: 'e3', tenantId: 't1', learnerId: 'l1', groupId: 'g1', status: 'active' }]
    });
    const summary = await scanner.scanTenant('t1', ASOF, noDate as never);
    expect(summary.remindersDispatched).toBe(0);
  });

  it('tolerates a dispatch failure without throwing', async () => {
    const dispatch = vi.fn().mockRejectedValue(new Error('smtp down'));
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { scanner } = make(dispatch);
    const summary = await scanner.scanTenant('t1', ASOF, state() as never);
    expect(summary.remindersDispatched).toBe(0);
    errorSpy.mockRestore();
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/reminders/course-deadline-scanner.service.test.ts --no-file-parallelism`
Expected: FAIL — cannot find module `./course-deadline-scanner.service.js`.

- [x] **Step 3: Implement the scanner**

Create `apps/backend/src/modules/mvp/reminders/course-deadline-scanner.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';

import { COURSE_DEADLINE_MILESTONES, pickMilestone } from './milestone.util.js';
import {
  buildLearnerEmployerRecipients,
  resolveCourseTitleByVersion,
  resolveCourseVersionIdForGroup
} from './reminder-recipients.js';
import { NotificationDispatcher } from '../../communication/notification-dispatcher.service.js';

import type { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';

export interface CourseDeadlineScanSummary {
  remindersDispatched: number;
}

/** Enrollment statuses still expected to finish (so a deadline nudge is meaningful). */
const ACTIVE_STATUSES = new Set(['pending', 'active']);

@Injectable()
export class CourseDeadlineScanner {
  private readonly logger = new Logger(CourseDeadlineScanner.name);

  constructor(private readonly dispatcher: NotificationDispatcher) {}

  async scanTenant(
    tenantId: string,
    asOf: string,
    state: InMemoryMvpState
  ): Promise<CourseDeadlineScanSummary> {
    let remindersDispatched = 0;

    for (const enrollment of state.enrollments) {
      if (enrollment.tenantId !== tenantId) continue;
      if (!ACTIVE_STATUSES.has(enrollment.status)) continue;
      if (!enrollment.plannedEndAt) continue;

      const milestone = pickMilestone(asOf, enrollment.plannedEndAt, COURSE_DEADLINE_MILESTONES);
      if (milestone === null) continue;

      const recipients = buildLearnerEmployerRecipients(state, tenantId, enrollment);
      if (recipients.length === 0) continue;

      const courseVersionId = resolveCourseVersionIdForGroup(state, tenantId, enrollment.groupId);
      const courseTitle = courseVersionId
        ? resolveCourseTitleByVersion(state, tenantId, courseVersionId)
        : undefined;

      try {
        await this.dispatcher.dispatch({
          tenantId,
          templateKey: 'course_deadline',
          recipients,
          variables: {
            learnerName: recipients.find((r) => r.kind === 'learner')?.name ?? '',
            courseTitle: courseTitle ?? '',
            deadline: enrollment.plannedEndAt.slice(0, 10)
          },
          relatedEntityType: 'learning.enrollment',
          relatedEntityId: enrollment.id,
          dedupKey: `deadline:${enrollment.id}:${milestone}`
        });
        remindersDispatched += recipients.length;
      } catch (err) {
        this.logger.error(
          `Failed to dispatch course_deadline for enrollment ${enrollment.id}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    return { remindersDispatched };
  }
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/reminders/course-deadline-scanner.service.test.ts --no-file-parallelism`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/backend/src/modules/mvp/reminders/course-deadline-scanner.service.ts apps/backend/src/modules/mvp/reminders/course-deadline-scanner.service.test.ts
git commit -m "feat(backend): CourseDeadlineScanner — 14/7/1-day completion reminders"
```

---

## Task 12: `RemindersSchedulerService` — cron + advisory lock + cross-tenant loop

**Files:**

- Create: `apps/backend/src/modules/mvp/reminders/reminders-scheduler.service.ts`
- Create: `apps/backend/src/modules/mvp/reminders/reminders-scheduler.service.test.ts`

> `@Cron(backendEnv.RECERTIFICATION_CRON_SCHEDULE)` fires nightly; the handler returns immediately when `RECERTIFICATION_SCAN_ENABLED` is false. `runScanAllTenants(asOf)` is split out so tests call it directly. The advisory lock uses `pg_try_advisory_xact_lock` inside `withTransaction` (auto-released at commit, even on error); per-tenant work runs on its own pooled connections, so the lock connection just holds the lock. Each tenant is wrapped in try/catch (partial-success).

- [x] **Step 1: Write the failing test**

Create `apps/backend/src/modules/mvp/reminders/reminders-scheduler.service.test.ts`:

```ts
import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { RemindersSchedulerService } from './reminders-scheduler.service.js';

function makeDb(locked = true) {
  return {
    withTransaction: async (cb: (client: unknown) => Promise<void>) => cb({}),
    query: vi.fn().mockResolvedValue([{ locked }])
  };
}

function make(opts: { locked?: boolean; tenantIds?: string[] } = {}) {
  const recertScanner = {
    scanTenant: vi.fn().mockResolvedValue({ draftsCreated: 0, emailsDispatched: 0 })
  };
  const deadlineScanner = { scanTenant: vi.fn().mockResolvedValue({ remindersDispatched: 0 }) };
  const mvpRunner = {
    runWithTenantState: async (_t: string, fn: (state: unknown) => Promise<unknown>) => fn({})
  };
  const tenants = {
    listActiveTenantIds: vi.fn().mockResolvedValue(opts.tenantIds ?? ['t1', 't2'])
  };
  const db = makeDb(opts.locked ?? true);
  const service = new RemindersSchedulerService(
    tenants as never,
    mvpRunner as never,
    recertScanner as never,
    deadlineScanner as never,
    db as never
  );
  return { service, recertScanner, deadlineScanner, tenants, db };
}

describe('RemindersSchedulerService.runScanAllTenants', () => {
  it('runs both scanners once per active tenant when the lock is acquired', async () => {
    const { service, recertScanner, deadlineScanner, tenants } = make();
    await service.runScanAllTenants('2026-06-05');
    expect(tenants.listActiveTenantIds).toHaveBeenCalledTimes(1);
    expect(recertScanner.scanTenant).toHaveBeenCalledTimes(2);
    expect(deadlineScanner.scanTenant).toHaveBeenCalledTimes(2);
  });

  it('skips scanning entirely when the advisory lock is held by another instance', async () => {
    const { service, recertScanner, tenants } = make({ locked: false });
    await service.runScanAllTenants('2026-06-05');
    expect(tenants.listActiveTenantIds).not.toHaveBeenCalled();
    expect(recertScanner.scanTenant).not.toHaveBeenCalled();
  });

  it('continues to the next tenant when one tenant throws (partial success)', async () => {
    const { service, recertScanner, deadlineScanner } = make({ tenantIds: ['bad', 'good'] });
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    recertScanner.scanTenant.mockImplementation(async (tenantId: string) => {
      if (tenantId === 'bad') throw new Error('boom');
      return { draftsCreated: 0, emailsDispatched: 0 };
    });
    await service.runScanAllTenants('2026-06-05');
    expect(recertScanner.scanTenant).toHaveBeenCalledTimes(2);
    // 'good' still ran its deadline scan even though 'bad' threw in the recert scan
    expect(deadlineScanner.scanTenant).toHaveBeenCalledWith(
      'good',
      '2026-06-05',
      expect.anything()
    );
    errorSpy.mockRestore();
  });
});

describe('RemindersSchedulerService.handleDailyScan', () => {
  it('does nothing when RECERTIFICATION_SCAN_ENABLED is false (default)', async () => {
    const { service, tenants } = make();
    await service.handleDailyScan();
    expect(tenants.listActiveTenantIds).not.toHaveBeenCalled();
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/reminders/reminders-scheduler.service.test.ts --no-file-parallelism`
Expected: FAIL — cannot find module `./reminders-scheduler.service.js`.

- [x] **Step 3: Implement the scheduler**

Create `apps/backend/src/modules/mvp/reminders/reminders-scheduler.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { CourseDeadlineScanner } from './course-deadline-scanner.service.js';
import { backendEnv } from '../../../env.js';
import { DatabaseService } from '../../../infrastructure/database/database.service.js';
import { TenantService } from '../../tenant/tenant.service.js';
import { MvpTenantRunner } from '../infrastructure/mvp-tenant-runner.service.js';
import { RecertificationScanner } from '../recertification/recertification-scanner.service.js';

/** Stable advisory-lock key for the nightly reminders scan (single key, app-wide). */
const REMINDERS_SCAN_LOCK_KEY = 528_491;

@Injectable()
export class RemindersSchedulerService {
  private readonly logger = new Logger(RemindersSchedulerService.name);

  constructor(
    private readonly tenants: TenantService,
    private readonly mvpRunner: MvpTenantRunner,
    private readonly recertScanner: RecertificationScanner,
    private readonly deadlineScanner: CourseDeadlineScanner,
    private readonly db: DatabaseService
  ) {}

  @Cron(backendEnv.RECERTIFICATION_CRON_SCHEDULE, { name: 'reminders-daily-scan' })
  async handleDailyScan(): Promise<void> {
    if (!backendEnv.RECERTIFICATION_SCAN_ENABLED) {
      return;
    }
    const asOf = new Date().toISOString().slice(0, 10);
    this.logger.log(`Starting nightly reminders scan asOf=${asOf}`);
    await this.runScanAllTenants(asOf);
  }

  /**
   * Acquire a transaction-scoped advisory lock (one instance wins), enumerate active tenants,
   * and run the recert + course-deadline scans per tenant under the shared per-tenant lock.
   * Each tenant is isolated by try/catch so one failure never aborts the batch.
   */
  async runScanAllTenants(asOf: string): Promise<void> {
    await this.db.withTransaction(async (client) => {
      const lockRows = await this.db.query<{ locked: boolean }>(
        'select pg_try_advisory_xact_lock($1) as locked',
        [REMINDERS_SCAN_LOCK_KEY],
        client
      );
      if (!lockRows[0]?.locked) {
        this.logger.log('Another instance holds the reminders scan lock; skipping.');
        return;
      }

      const tenantIds = await this.tenants.listActiveTenantIds();
      for (const tenantId of tenantIds) {
        try {
          await this.mvpRunner.runWithTenantState(tenantId, async (state) => {
            await this.recertScanner.scanTenant(tenantId, asOf, state);
            await this.deadlineScanner.scanTenant(tenantId, asOf, state);
          });
        } catch (err) {
          this.logger.error(
            `Reminders scan failed for tenant ${tenantId}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    });
  }
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/reminders/reminders-scheduler.service.test.ts --no-file-parallelism`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/backend/src/modules/mvp/reminders/reminders-scheduler.service.ts apps/backend/src/modules/mvp/reminders/reminders-scheduler.service.test.ts
git commit -m "feat(backend): RemindersSchedulerService — nightly cron + advisory lock + cross-tenant scan"
```

---

## Task 13: `DocumentRevokedEmailListener`

**Files:**

- Create: `apps/backend/src/modules/mvp/reminders/document-revoked-email.listener.ts`
- Create: `apps/backend/src/modules/mvp/reminders/document-revoked-email.listener.test.ts`

> Listens to the already-emitted `documents.revoked` event (5A). It resolves the learner from the revoked document's `sourceEntityId` (an enrollment) via `MvpTenantRunner` — the event fires under the documents tenant lock, and the `{ async: true }` listener simply queues after it on the shared `TenantSerialGateway` (no deadlock, because the revoke does not await the listener). Deduped by `revoked:<documentId>`.

- [x] **Step 1: Write the failing test**

Create `apps/backend/src/modules/mvp/reminders/document-revoked-email.listener.test.ts`:

```ts
import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { DocumentRevokedEmailListener } from './document-revoked-email.listener.js';

function fakeState() {
  return {
    enrollments: [
      { id: 'enr1', tenantId: 't1', learnerId: 'l1', groupId: 'g1', status: 'completed' }
    ],
    learners: [
      { id: 'l1', tenantId: 't1', firstName: 'Иван', lastName: 'Иванов', email: 'ivan@example.com' }
    ],
    groupCourses: [
      { id: 'gc1', tenantId: 't1', groupId: 'g1', courseId: 'c1', courseVersionId: 'cv1' }
    ],
    groups: [{ id: 'g1', tenantId: 't1', name: 'Группа 1' }],
    counterparties: [],
    courseVersions: [{ id: 'cv1', tenantId: 't1', courseId: 'c1' }],
    courses: [{ id: 'c1', tenantId: 't1', title: 'Охрана труда' }]
  };
}

function make(dispatch = vi.fn().mockResolvedValue(undefined)) {
  const mvpRunner = {
    runWithTenantState: async (_t: string, fn: (state: unknown) => Promise<unknown>) =>
      fn(fakeState())
  };
  const listener = new DocumentRevokedEmailListener(mvpRunner as never, { dispatch } as never);
  return { listener, dispatch };
}

const payload = {
  tenantId: 't1',
  documentId: 'gdoc1',
  sourceEntityType: 'enrollment',
  sourceEntityId: 'enr1',
  reason: 'Ошибка в данных'
};

describe('DocumentRevokedEmailListener', () => {
  it('dispatches a document_revoked email to the learner with the revoked dedupKey', async () => {
    const { listener, dispatch } = make();
    await listener.handle(payload as never);
    const arg = dispatch.mock.calls[0]![0];
    expect(arg.templateKey).toBe('document_revoked');
    expect(arg.recipients[0].email).toBe('ivan@example.com');
    expect(arg.variables.reason).toBe('Ошибка в данных');
    expect(arg.variables.courseTitle).toBe('Охрана труда');
    expect(arg.dedupKey).toBe('revoked:gdoc1');
  });

  it('does nothing when the payload has no sourceEntityId', async () => {
    const { listener, dispatch } = make();
    await listener.handle({ tenantId: 't1', documentId: 'gdoc1', reason: 'x' } as never);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('does nothing when the enrollment cannot be resolved (no recipients)', async () => {
    const { listener, dispatch } = make();
    await listener.handle({ ...payload, sourceEntityId: 'missing' } as never);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('tolerates a dispatch failure without throwing', async () => {
    const dispatch = vi.fn().mockRejectedValue(new Error('smtp down'));
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { listener } = make(dispatch);
    await expect(listener.handle(payload as never)).resolves.toBeUndefined();
    errorSpy.mockRestore();
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/reminders/document-revoked-email.listener.test.ts --no-file-parallelism`
Expected: FAIL — cannot find module `./document-revoked-email.listener.js`.

- [x] **Step 3: Implement the listener**

Create `apps/backend/src/modules/mvp/reminders/document-revoked-email.listener.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import {
  buildLearnerEmployerRecipients,
  resolveCourseTitleByVersion,
  resolveCourseVersionIdForGroup
} from './reminder-recipients.js';
import { DOCUMENT_REVOKED_EVENT } from '../../documents/document-revoked.event.js';
import { learnerRecipient } from '../enrollment-recipient.js';
import { MvpTenantRunner } from '../infrastructure/mvp-tenant-runner.service.js';
import { NotificationDispatcher } from '../../communication/notification-dispatcher.service.js';

import type { DocumentRevokedPayload } from '../../documents/document-revoked.event.js';
import type { DispatchRecipient } from '../../communication/notification-dispatcher.service.js';

@Injectable()
export class DocumentRevokedEmailListener {
  private readonly logger = new Logger(DocumentRevokedEmailListener.name);

  constructor(
    private readonly mvpRunner: MvpTenantRunner,
    private readonly dispatcher: NotificationDispatcher
  ) {}

  @OnEvent(DOCUMENT_REVOKED_EVENT, { async: true })
  async handle(payload: DocumentRevokedPayload): Promise<void> {
    if (!payload.sourceEntityId) {
      return;
    }
    try {
      const resolved = await this.mvpRunner.runWithTenantState(payload.tenantId, async (state) => {
        const enrollment = state.enrollments.find(
          (e) => e.tenantId === payload.tenantId && e.id === payload.sourceEntityId
        );
        if (!enrollment) {
          return null;
        }
        const learner = state.learners.find(
          (l) => l.tenantId === payload.tenantId && l.id === enrollment.learnerId
        );
        const recipients = buildLearnerEmployerRecipients(state, payload.tenantId, enrollment);
        const courseVersionId = resolveCourseVersionIdForGroup(
          state,
          payload.tenantId,
          enrollment.groupId
        );
        const courseTitle = courseVersionId
          ? resolveCourseTitleByVersion(state, payload.tenantId, courseVersionId)
          : undefined;
        return {
          recipients,
          learnerName: learnerRecipient(learner)?.name ?? '',
          courseTitle: courseTitle ?? ''
        } as { recipients: DispatchRecipient[]; learnerName: string; courseTitle: string };
      });

      if (!resolved || resolved.recipients.length === 0) {
        return;
      }

      await this.dispatcher.dispatch({
        tenantId: payload.tenantId,
        templateKey: 'document_revoked',
        recipients: resolved.recipients,
        variables: {
          learnerName: resolved.learnerName,
          courseTitle: resolved.courseTitle,
          reason: payload.reason
        },
        relatedEntityType: 'documents.generated_document',
        relatedEntityId: payload.documentId,
        dedupKey: `revoked:${payload.documentId}`
      });
    } catch (err) {
      this.logger.error(
        `Failed to dispatch document_revoked for document ${payload.documentId}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/reminders/document-revoked-email.listener.test.ts --no-file-parallelism`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add apps/backend/src/modules/mvp/reminders/document-revoked-email.listener.ts apps/backend/src/modules/mvp/reminders/document-revoked-email.listener.test.ts
git commit -m "feat(backend): DocumentRevokedEmailListener — notify learner on document revoke"
```

---

## Task 14: Wire providers into `MvpModule` + import `TenantModule`

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.module.ts`

> All new singletons live in `MvpModule`. `TenantService` comes from `TenantModule` (already exported there). `DocumentsTenantRunner`, `NotificationDispatcher`, `TenantSerialGateway`, `DatabaseService`, and `MVP_PERSISTENCE_BACKEND` are already reachable via the modules `MvpModule` imports (`DocumentsModule`, `CommunicationModule`, `InfrastructureModule`) and its own providers.

- [x] **Step 1: Add imports**

In `apps/backend/src/modules/mvp/mvp.module.ts`, add near the other imports:

```ts
import { MvpTenantRunner } from './infrastructure/mvp-tenant-runner.service.js';
import { CourseDeadlineScanner } from './reminders/course-deadline-scanner.service.js';
import { DocumentRevokedEmailListener } from './reminders/document-revoked-email.listener.js';
import { RemindersSchedulerService } from './reminders/reminders-scheduler.service.js';
import { RecertificationScanner } from './recertification/recertification-scanner.service.js';
import { TenantModule } from '../tenant/tenant.module.js';
```

- [x] **Step 2: Import `TenantModule`**

In the `imports: [...]` array (lines 38-45), add `TenantModule`:

```ts
  imports: [
    InfrastructureModule,
    FilesModule,
    IamModule,
    DocumentsModule,
    OrgModule,
    CommunicationModule,
    TenantModule
  ],
```

- [x] **Step 3: Register the new singleton providers**

In the `providers: [...]` array, add the five new singletons (anywhere; place them after the `RecertificationService` provider on line 63 for locality). They are **plain singletons** (no `Scope.REQUEST`):

```ts
    MvpTenantRunner,
    RecertificationScanner,
    CourseDeadlineScanner,
    RemindersSchedulerService,
    DocumentRevokedEmailListener,
```

> `RecertificationService` (request-scoped, line 63) injects `RecertificationScanner` (singleton) — a request-scoped provider may depend on a singleton, so this resolves cleanly. `DocumentRevokedEmailListener` and `RemindersSchedulerService` must be singletons for `@OnEvent` / `@Cron` discovery to work.

- [x] **Step 4: Full typecheck**

Run: `pnpm --filter @cdoprof/backend exec tsc --noEmit`
Expected: PASS (DI graph now complete at the type level).

- [x] **Step 5: Run the full affected test set**

Run each, expect PASS:

```bash
pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/reminders/milestone.util.test.ts src/modules/mvp/infrastructure/mvp-tenant-runner.service.test.ts src/modules/mvp/reminders/course-deadline-scanner.service.test.ts src/modules/mvp/reminders/reminders-scheduler.service.test.ts src/modules/mvp/reminders/document-revoked-email.listener.test.ts --no-file-parallelism
pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/recertification/recertification-scanner.service.test.ts src/modules/mvp/recertification/recertification.service.test.ts --no-file-parallelism
pnpm --filter @cdoprof/backend exec vitest run src/modules/communication/notification-dispatcher.service.test.ts src/modules/communication/in-memory-email-deliveries.state.test.ts --no-file-parallelism
pnpm --filter @cdoprof/backend exec vitest run src/modules/tenant/tenant.service.test.ts src/env.test.ts --no-file-parallelism
```

- [x] **Step 6: Regression — run the 5B HTTP permission boundary + issuance suites**

Run (these exercise the unchanged recert endpoints + issuance, confirming the refactor didn't regress them):

```bash
pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/mvp.http.integration.test.ts --no-file-parallelism
pnpm --filter @cdoprof/backend exec vitest run src/modules/documents/enrollment-document-issuance.listener.test.ts --no-file-parallelism
```

Expected: PASS. If `mvp.http.integration.test.ts` references the recert controller through the real service, confirm it still imports correctly (the controller's public API is unchanged).

- [x] **Step 7: Commit**

```bash
git add apps/backend/src/modules/mvp/mvp.module.ts
git commit -m "feat(backend): wire reminders scheduler + scanners + revoke listener into MvpModule"
```

---

## Task 15: Documentation

**Files:**

- Modify: `README.md` (§2 AI Agent State)
- Modify: `LMS_AGENT_HANDOFF.md` (append §5.111)
- Modify: this plan (tick all boxes)

- [x] **Step 1: Update README §2**

In `README.md` §2 «AI Agent State», update `Current Goal`, `Last Completed Task`, `Current Task`, `Next Task`, `Last Updated By/At` to record Plan 5B-2 (nightly scheduler + 90/30/7 cadence + course-deadline + document_revoked email; migration 0049; `@nestjs/schedule`; flags `RECERTIFICATION_SCAN_ENABLED`/`RECERTIFICATION_CRON_SCHEDULE`). Set Next Task to **Plan 5C — frontend «Нужна переаттестация» queue** (and note ops must set `RECERTIFICATION_SCAN_ENABLED=true` + `NOTIFICATIONS_EMAIL_ENABLED=true` to activate).

- [x] **Step 2: Append handoff §5.111**

Append a `### 5.111` entry to `LMS_AGENT_HANDOFF.md` §5 with: summary, files changed, test status (list the green target suites), deviations, and a cross-link to this plan. Note the behaviour change (recert email is now per-milestone, not once-on-creation) and the deferred items (license_expiring, curator/admin recipients, Plan 5C frontend).

- [x] **Step 3: Tick the plan boxes**

Mark every `- [ ]` in this file `- [x]`. Record any deviations in a short `## Deviations` section at the bottom.

- [x] **Step 4: Final quality gate**

Run (the isolated backend runs per CLAUDE.md Gotchas — the full `pnpm test:backend` crashes on the Cyrillic path):

```bash
pnpm --filter @cdoprof/backend exec tsc --noEmit
npx eslint apps/backend/src/modules/mvp/reminders apps/backend/src/modules/mvp/infrastructure/mvp-tenant-runner.service.ts apps/backend/src/modules/mvp/recertification --max-warnings=0
```

Expected: PASS / no lint errors in the new + modified files.

- [x] **Step 5: Commit**

```bash
git add README.md LMS_AGENT_HANDOFF.md docs/superpowers/plans/2026-06-06-phase-5-plan-b2-recertification-scheduler.md
git commit -m "docs: record Phase 5 Plan 5B-2 — recertification scheduler + reminder cadence"
```

---

## Self-Review

**Spec coverage** (spec §4.3 + the 5B "Deferred to 5B-2" list):

- Daily `@nestjs/schedule` cron → Task 1 + Task 12. ✓
- `pg_try_advisory_lock` single-instance → Task 12 (`pg_try_advisory_xact_lock`). ✓
- Cross-tenant enumeration → Task 8 + Task 12. ✓
- Reuse 5B's scan → Task 10 (`RecertificationScanner.scanTenant`, called by both the manual endpoint and the cron). ✓
- 90/30/7 graduated cadence with per-milestone dedup via `email_deliveries` → Task 3 (`pickMilestone`) + Task 4/5/6 (`dedup_key` + dispatcher skip) + Task 10. ✓
- `course_deadline` reminders → Task 7 (template) + Task 11 (scanner). ✓
- `document_revoked` email (event already emitted in 5A) → Task 7 (template) + Task 13 (listener) + Task 9 (`MvpTenantRunner` to resolve the learner). ✓
- Out-of-request MVP load harness → Task 9. ✓

**Placeholder scan:** No "TBD"/"add error handling"/"similar to" — every code step contains complete code; existing-file edits name the exact sibling pattern + line anchors.

**Type consistency:** `scanTenant(tenantId, asOf, state)` signature is identical across `RecertificationScanner` and `CourseDeadlineScanner` and matches the scheduler's calls. `RecertScanSummary` / `CourseDeadlineScanSummary` are distinct and used consistently. `dedupKey` is added to `EmailDeliveryRow` (Task 5) before it's referenced by `DispatchInput`/`record` (Task 6) and the scanners (Tasks 10/11/13). `findByDedupKey` is declared on the interface (Task 5) before the dispatcher calls it (Task 6). `RecertificationService`'s new constructor `(drafts, state, mvp, scanner)` matches its test update (Task 10 Step 7) and the module registration (Task 14). `pickMilestone(asOf, target, thresholds)` arg order is identical in the util, both scanners, and all tests.

**Scope check:** One cohesive subsystem (nightly reminders). 15 tasks, each independently committable and testable. Sequential dependencies are honored by task order (util/migration/repo before the scanners that use them; scanners before the scheduler that orchestrates them; everything before the wiring task).

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-06-phase-5-plan-b2-recertification-scheduler.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints for review.

**Which approach?**
