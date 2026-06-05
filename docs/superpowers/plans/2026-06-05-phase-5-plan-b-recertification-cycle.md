# Phase 5 · Plan 5B — Recertification Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stamp a `validUntil` expiry date on every issued document (= completion date + the program's recertification period), persist a `recertification_drafts` queue, and give admins endpoints to scan-for-expiring-certificates → review drafts → approve (re-enroll the learner) or reject — all backed by the 5A email engine, so a learner whose удостоверение is about to expire gets one e-mail and lands in the admin's «Нужна переаттестация» queue.

**Architecture:** Backend-centric, housed in the **MVP module** (which already imports `DocumentsModule` + `OrgModule`, so MVP state, `DocumentsService`, and `LicensesService` are all reachable in one request scope; we add `CommunicationModule` for the singleton `NotificationDispatcher`). `validUntil` is **producer-resolved**: `MvpService` computes the period at enrollment-completion emit time, the issuance listener computes the date, and it threads `GenerateDocumentRequest → DocumentGenerationTaskEntity → completeTask → GeneratedDocumentEntity`. Recertification drafts are a **real relational table** with a singleton repository (interface token + in-memory + postgres), mirroring 5A's `email_deliveries` repo — NOT the request-scoped MVP state and NOT the documents snapshot backend, because the (future) cron in Plan 5B-2 needs a store reachable outside any request. The scan is **HTTP-triggered per-tenant** in 5B (the request interceptor has already loaded the tenant's state); the daily cross-tenant cron + advisory lock is deferred to Plan 5B-2.

**Tech Stack:** TypeScript (NodeNext ESM — every relative import ends in `.js`), NestJS, `@nestjs/event-emitter`, `class-validator`, PostgreSQL, Vitest. `exactOptionalPropertyTypes: true` is ON — add optional fields by conditional spread, never `= undefined`.

**Source spec:** [docs/superpowers/specs/2026-06-04-phase-5-notifications-recertifications-design.md](../specs/2026-06-04-phase-5-notifications-recertifications-design.md)
**Predecessor:** Plan 5A (notification foundation) — merged in PR #228; latest migration on `main` is `0047`.

---

## Scope of Plan 5B (and what is deliberately deferred)

**In 5B:**

- Migration `0048`: `learning.course_versions.recertification_period_months`, `documents.generated_documents.valid_until`, `learning.recertification_drafts` table, `recertification.read/write` permissions.
- A writable `recertificationPeriodMonths` on the course-version program-meta (so an admin can set «срок действия, мес»).
- `validUntil` stamping at issuance (= `enrollment.completedAt` + program period), threaded through the documents task pipeline.
- `RecertificationDraftsRepository` (singleton: interface + in-memory + postgres) + module wiring.
- `RecertificationService`: pure `scanForRecertification(asOf, documents)` + draft creation (idempotent) + `listDrafts` + `approveDraft` (→ reuse `createBulkEnrollments`) + `rejectDraft`.
- New e-mail template `recertification_due` (code default + the existing DB-override path) dispatched to **learner** (+ **employer** when the group is linked to a counterparty with `contactEmail`).
- **Closes 5A's empty-`courseTitle` carry-forward**: resolve the group/course title at the `enrollment_invited` / `enrollment_completed` emit so those e-mails stop interpolating `{{courseTitle}}` to `''`.
- Admin endpoints: `GET /recertification-drafts`, `POST /recertification-drafts/:id/approve`, `POST /recertification-drafts/:id/reject`, `POST /recertification/scan` (per-tenant trigger) + permission-boundary test (extends `mvp.http.integration.test.ts` per CLAUDE.md).

**Deferred — to Plan 5B-2 (daily scheduler):** the `@nestjs/schedule` cron + `pg_try_advisory_lock` + cross-tenant enumeration that calls 5B's scan daily; the graduated 90/30/7 reminder cadence with per-milestone dedup via `email_deliveries`; `course_deadline` reminders (need the same milestone-dedup); the `document_revoked` e-mail (the event is already emitted in 5A, but resolving the learner from a documents-module async event needs the cross-tenant load harness 5B-2 builds).

**Deferred — other follow-ons:** `license_expiring` reminders (the `org` module has **no postgres persistence** — only request-scoped in-memory state — so there is nothing to scan across tenants yet; needs an org persistence backend first); curator recipient (the `Group` entity has **no** curator/responsible field — adding one is a separate schema change); admin-email recipient (no clean «tenant admin email» resolver exists in IAM); the frontend «Нужна переаттестация» queue UI → **Plan 5C**; PWA push, личное дело PDF, template-editor UI → per spec §7.

> **Why a single 90-day horizon in 5B (not 90/30/7):** A draft is created **once** per `(learner, source document)` (DB unique constraint), and the `recertification_due` e-mail fires **only when the draft is first created**. That gives correct, dedup-free behaviour for the manual/HTTP-triggered scan without a milestone ledger. The graduated 90/30/7 _repeat_ reminders are inseparable from the daily cron (you only re-notify because time passed), so they live with the scheduler in 5B-2.

---

## File Structure

**Migration:**

- Create `apps/backend/migrations/0048_learning_recertification_foundation.sql` — two `ALTER`s + one `CREATE TABLE` + permissions.

**Date util (shared):**

- Create `apps/backend/src/common/utils/date-math.util.ts` — pure `addMonths` / `addDays` (ISO date in, `YYYY-MM-DD` out, month-end clamped).
- Create `apps/backend/src/common/utils/date-math.util.test.ts`.

**Documents module (valid_until threading):**

- Modify `apps/backend/src/modules/documents/documents.types.ts` — add `validUntil?: string` to `GeneratedDocumentEntity` and `DocumentGenerationTaskEntity`.
- Modify `apps/backend/src/modules/documents/documents.dto.ts` — add `validUntil?: string` to `GenerateDocumentRequest`.
- Modify `apps/backend/src/modules/documents/documents.service.ts` — set `validUntil` on the task in `generateDocument`; copy it onto the entity in `completeTask`.
- Modify `apps/backend/src/modules/documents/documents.service.test.ts` — assert the stamp survives task → document.
- Modify `apps/backend/src/modules/documents/enrollment-document-issuance.listener.ts` — compute `validUntil` and pass it into the `generateDocument` request.

**MVP module (period field, emit resolution, recert feature):**

- Modify `apps/backend/src/modules/mvp/mvp.types.ts` — add `recertificationPeriodMonths?: number` to `ProgramMeta`.
- Modify `apps/backend/src/modules/mvp/mvp.dto.ts` — add `recertificationPeriodMonths` to the program-meta write DTO (mirror `academicHours`).
- Modify `apps/backend/src/modules/mvp/enrollment-completed.event.ts` — add `completedAt?` to the payload and `recertificationPeriodMonths?` to `EnrollmentCompletedDocumentSetEntry`; add `courseTitle?` to the payload.
- Modify `apps/backend/src/modules/mvp/enrollment-invited.event.ts` — add `courseTitle?` to the payload.
- Modify `apps/backend/src/modules/mvp/mvp.service.ts` — resolve `completedAt` + per-entry period + group/course title at the invited/completed emits.
- Create `apps/backend/src/modules/mvp/recertification/recertification-drafts.repository.ts` — interface + `RECERTIFICATION_DRAFTS_REPOSITORY` token + row/seed types.
- Create `apps/backend/src/modules/mvp/recertification/in-memory-recertification-drafts.state.ts`.
- Create `apps/backend/src/modules/mvp/recertification/postgres-recertification-drafts.repository.ts`.
- Create `apps/backend/src/modules/mvp/recertification/recertification.service.ts` — scan + create + list + approve + reject.
- Create `apps/backend/src/modules/mvp/recertification/recertification.dto.ts` — approve/reject request DTOs.
- Create `apps/backend/src/modules/mvp/recertification/recertification.controller.ts` — admin endpoints.
- Create `apps/backend/src/modules/mvp/recertification/recertification.service.test.ts` — scan/approve/reject/idempotency units.
- Create `apps/backend/src/modules/mvp/recertification/recertification-drafts.repository.test.ts` — in-memory repo units.
- Modify `apps/backend/src/modules/mvp/mvp.module.ts` — import `CommunicationModule`; register repo + service + controller.

**Communication module (template):**

- Modify `apps/backend/src/modules/communication/email-templates.ts` — add `recertification_due` to `EmailTemplateKey` + `EMAIL_TEMPLATE_DEFAULTS`.
- Modify `apps/backend/src/modules/communication/enrollment-email.listener.ts` — use `payload.courseTitle` instead of `''`.

**Permission-boundary test:**

- Modify `apps/backend/src/modules/mvp/mvp.http.integration.test.ts` — add a `recertification permission boundary` describe block (stub controller, per CLAUDE.md).

**Docs:**

- Modify `README.md`, `LMS_AGENT_HANDOFF.md`, and this plan (tick boxes).

---

## Task 1: Migration 0048 — recert columns + drafts table + permissions

**Files:**

- Create: `apps/backend/migrations/0048_learning_recertification_foundation.sql`

> Latest migration on `main` is `0047_communication_email_foundation.sql` → next is **0048**. (The design spec §3.2 wrote `0047`, but 5A took that number first.) The two `ALTER`s mirror existing precedent — `0030_learning_course_program_meta.sql` ALTERs `learning.course_versions` for new program-meta columns, and `0033`/`0034` ALTER `documents.generated_documents` for new fields (`qr_token`, `revoked_at`). The runtime reads these values from the JSON snapshot, but keeping the normalized columns in sync follows established precedent. The permissions block is copied from `0047` (and `0037`) verbatim in shape.

- [ ] **Step 1: Write the migration SQL**

Create `apps/backend/migrations/0048_learning_recertification_foundation.sql`:

```sql
-- 0048_learning_recertification_foundation.sql
-- Phase 5 Plan 5B — recertification foundation.
-- 1) learning.course_versions.recertification_period_months — per-program validity (spec §3.2); NULL = бессрочно.
-- 2) documents.generated_documents.valid_until — stamped at issuance = completed_at + period; NULL = бессрочный документ.
-- 3) learning.recertification_drafts — hybrid-model draft queue (spec §3.4); one active draft per (learner, source document).
-- 4) iam permissions recertification.read / recertification.write + role assignments.

alter table learning.course_versions
  add column if not exists recertification_period_months integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'course_versions_recert_period_chk'
  ) then
    alter table learning.course_versions
      add constraint course_versions_recert_period_chk
      check (recertification_period_months is null or recertification_period_months > 0);
  end if;
end $$;

alter table documents.generated_documents
  add column if not exists valid_until date;

create table if not exists learning.recertification_drafts (
  id text primary key,
  tenant_id text not null,
  learner_id text not null,
  source_document_id text not null,
  course_version_id text not null,
  valid_until date not null,
  status text not null default 'pending',
  resulting_enrollment_id text null,
  reason text null,
  decided_at timestamptz null,
  decided_by text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_recert_drafts_tenant_learner_source
  on learning.recertification_drafts (tenant_id, learner_id, source_document_id);

create index if not exists idx_recert_drafts_tenant_status
  on learning.recertification_drafts (tenant_id, status);

insert into iam.permissions (id, code, description)
values
  ('p_recertification_read', 'recertification.read', 'Read recertification drafts and queue'),
  ('p_recertification_write', 'recertification.write', 'Trigger scans and approve/reject recertification drafts')
on conflict (id) do nothing;

insert into iam.role_permissions (id, tenant_id, role_id, permission_id)
select
  concat('rp_', r.id, '_', p.id),
  r.tenant_id,
  r.id,
  p.id
from iam.roles r
join iam.permissions p on true
where r.tenant_id = 'tenant_demo'
  and (
    r.code in ('platform_admin', 'tenant_admin')
    or (r.code = 'methodist' and p.code = 'recertification.read')
  )
on conflict (tenant_id, role_id, permission_id) do nothing;
```

- [ ] **Step 2: Verify the migration applies cleanly**

Run: `pnpm test:migrations`
Expected: PASS (the runner applies `0048` with no SQL errors). If the DB must be up, run `pnpm docker:infra` first.

> If `documents.generated_documents` does not exist in the test DB (some environments only run the JSON-snapshot path), the `alter table documents.generated_documents ...` will fail. Verify the table exists by grepping prior migrations (`0033_documents_qr_token.sql` ALTERs it). If the migration test fails ONLY on that line, wrap it the same way `0033` does and match that file's exact table reference. Do not invent a new table.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/migrations/0048_learning_recertification_foundation.sql
git commit -m "feat(backend): migration 0048 — recertification columns + drafts table + perms"
```

---

## Task 2: Pure date math util (addMonths / addDays)

**Files:**

- Create: `apps/backend/src/common/utils/date-math.util.ts`
- Create: `apps/backend/src/common/utils/date-math.util.test.ts`

> There is **no** existing date helper in the backend (verified: no `date-fns`/`moment`, no `addMonths`). We add a tiny pure one. Month-end must clamp: `addMonths('2026-01-31', 1)` → `'2026-02-28'`, not March 3rd (JS `setUTCMonth` overflows).

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/common/utils/date-math.util.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { addDays, addMonths } from './date-math.util.js';

describe('addMonths', () => {
  it('adds whole months and returns a YYYY-MM-DD date', () => {
    expect(addMonths('2026-06-04', 12)).toBe('2027-06-04');
    expect(addMonths('2026-06-04', 36)).toBe('2029-06-04');
  });

  it('clamps to the last day of the target month on overflow', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29'); // leap year
  });

  it('accepts an ISO timestamp and ignores the time part', () => {
    expect(addMonths('2026-06-04T15:30:00.000Z', 1)).toBe('2026-07-04');
  });
});

describe('addDays', () => {
  it('adds days across a month boundary', () => {
    expect(addDays('2026-06-04', 90)).toBe('2026-09-02');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/common/utils/date-math.util.test.ts --no-file-parallelism`
Expected: FAIL — cannot find module `./date-math.util.js`.

- [ ] **Step 3: Implement the util**

Create `apps/backend/src/common/utils/date-math.util.ts`:

```ts
/** Parse an ISO date or timestamp to UTC y/m/d parts (time ignored). */
function parts(iso: string): { y: number; m: number; d: number } {
  const date = new Date(iso);
  return { y: date.getUTCFullYear(), m: date.getUTCMonth(), d: date.getUTCDate() };
}

function toIsoDate(y: number, m: number, d: number): string {
  const date = new Date(Date.UTC(y, m, d));
  return date.toISOString().slice(0, 10);
}

/** Last calendar day of a (year, monthIndex). */
function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}

/**
 * Add `months` to an ISO date, clamping the day to the target month's last day
 * (so 2026-01-31 + 1 month = 2026-02-28). Returns `YYYY-MM-DD`.
 */
export function addMonths(iso: string, months: number): string {
  const { y, m, d } = parts(iso);
  const targetMonthAbs = m + months;
  const targetY = y + Math.floor(targetMonthAbs / 12);
  const targetM = ((targetMonthAbs % 12) + 12) % 12;
  const day = Math.min(d, lastDayOfMonth(targetY, targetM));
  return toIsoDate(targetY, targetM, day);
}

/** Add `days` to an ISO date. Returns `YYYY-MM-DD`. */
export function addDays(iso: string, days: number): string {
  const { y, m, d } = parts(iso);
  return toIsoDate(y, m, d + days);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/common/utils/date-math.util.test.ts --no-file-parallelism`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/common/utils/date-math.util.ts apps/backend/src/common/utils/date-math.util.test.ts
git commit -m "feat(backend): pure addMonths/addDays date util (month-end clamped)"
```

---

## Task 3: Course-version recertification period — type + writable DTO

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.types.ts` (`ProgramMeta`)
- Modify: `apps/backend/src/modules/mvp/mvp.dto.ts` (program-meta write DTO — mirror `academicHours`)
- Modify: `apps/backend/src/modules/mvp/mvp.service.ts` (apply the field when writing program-meta — mirror `academicHours`)
- Test: `apps/backend/src/modules/mvp/mvp.dto-validation.test.ts` (append)

- [ ] **Step 1: Add the type field**

In `apps/backend/src/modules/mvp/mvp.types.ts`, in the `ProgramMeta` interface (≈ lines 529-540), add (it auto-propagates to `CourseVersion`, which `extends ProgramMeta`):

```ts
  /** Phase 5B — срок действия удостоверения, мес. NULL/undefined = бессрочно. */
  recertificationPeriodMonths?: number;
```

- [ ] **Step 2: Find the program-meta write DTO + service write path**

Run: `npx eslint --no-eslintrc --rulesdir /dev/null 2>/dev/null; grep -rn "academicHours" apps/backend/src/modules/mvp/mvp.dto.ts apps/backend/src/modules/mvp/mvp.service.ts`
(Or use the Grep tool for `academicHours` in those two files.) `academicHours` is the canonical optional integer program-meta field — `recertificationPeriodMonths` mirrors it **everywhere `academicHours` appears** in these two files: the DTO class (validation decorators) and the service method that copies program-meta onto the course version.

- [ ] **Step 3: Add the DTO field (mirror `academicHours`'s decorators)**

In `apps/backend/src/modules/mvp/mvp.dto.ts`, next to `academicHours`, add the same validator shape (it is an optional positive integer):

```ts
  @IsOptional()
  @IsInt()
  @IsPositive()
  recertificationPeriodMonths?: number;
```

> Match the import list already present in the file (`IsOptional`, `IsInt`, `IsPositive` are used by `academicHours`; if `academicHours` uses `@Min(1)` instead of `@IsPositive`, copy that exact decorator set instead — mirror the sibling, don't introduce a new style).

- [ ] **Step 4: Apply the field in the service write path (mirror `academicHours`)**

In `apps/backend/src/modules/mvp/mvp.service.ts`, wherever program-meta is copied onto a `CourseVersion` (the same place `academicHours` is assigned, in both create and update of the version program-meta), add the conditional assignment mirroring `academicHours` exactly (remember `exactOptionalPropertyTypes`): use the same spread/assignment idiom the file already uses for `academicHours`.

- [ ] **Step 5: Write + run the DTO validation test**

Append to `apps/backend/src/modules/mvp/mvp.dto-validation.test.ts` a case mirroring the existing `academicHours` validation test (find it first): a valid positive integer passes; `0` or negative fails. Use `plainToInstance` + `validateSync` exactly as the sibling cases do.

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/mvp.dto-validation.test.ts --no-file-parallelism`
Expected: PASS.

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm --filter @cdoprof/backend exec tsc --noEmit`
Expected: PASS.

```bash
git add apps/backend/src/modules/mvp/mvp.types.ts apps/backend/src/modules/mvp/mvp.dto.ts apps/backend/src/modules/mvp/mvp.service.ts apps/backend/src/modules/mvp/mvp.dto-validation.test.ts
git commit -m "feat(backend): writable recertificationPeriodMonths on course-version program-meta"
```

---

## Task 4: Stamp valid_until at issuance (thread request → task → document)

**Files:**

- Modify: `apps/backend/src/modules/documents/documents.types.ts` (`GeneratedDocumentEntity`, `DocumentGenerationTaskEntity`)
- Modify: `apps/backend/src/modules/documents/documents.dto.ts` (`GenerateDocumentRequest`)
- Modify: `apps/backend/src/modules/documents/documents.service.ts` (`generateDocument` task creation; `completeTask` copy)
- Modify: `apps/backend/src/modules/documents/documents.service.test.ts` (append)
- Modify: `apps/backend/src/modules/mvp/enrollment-completed.event.ts` (payload + document-set entry)
- Modify: `apps/backend/src/modules/mvp/mvp.service.ts` (resolve `completedAt` + per-entry period at emit)
- Modify: `apps/backend/src/modules/documents/enrollment-document-issuance.listener.ts` (compute + pass `validUntil`)

- [ ] **Step 1: Add `validUntil` to the document + task + request types**

In `apps/backend/src/modules/documents/documents.types.ts`:

- In `GeneratedDocumentEntity` (≈ line 119-151), after `generatedAt`, add:
  ```ts
    /** Phase 5B — срок действия удостоверения (YYYY-MM-DD); undefined = бессрочно. */
    validUntil?: string;
  ```
- In `DocumentGenerationTaskEntity` (≈ line 90-117), after `numberReservationId`, add:
  ```ts
    /** Phase 5B — carried from the generate request to stamp the document at completion. */
    validUntil?: string;
  ```

In `apps/backend/src/modules/documents/documents.dto.ts`, in `GenerateDocumentRequest` (line 69-76), after `documentType`, add:

```ts
  /** Phase 5B — pre-computed expiry (YYYY-MM-DD) to stamp on the generated document. */
  validUntil?: string;
```

- [ ] **Step 2: Write the failing test for the stamp**

In `apps/backend/src/modules/documents/documents.service.test.ts`, add a focused test that drives a task through to completion and asserts the stamp. Mirror the existing `generateDocument` → `completeTask` flow already used in this file (find an existing test that calls `service.generateDocument(...)` then `service.completeTask(...)` and copy its setup). The new assertion:

```ts
it('stamps validUntil from the generate request onto the completed document', async () => {
  // ...existing seed of a template + version (copy from a sibling completeTask test in this file)...
  const task = service.generateDocument(
    't1',
    'actor_1',
    {
      idempotencyKey: 'recert-stamp-1',
      templateId: /* seeded template id */ 'tpl_1',
      sourceEntityType: 'enrollment',
      sourceEntityId: 'enr_1',
      documentType: 'certificate',
      validUntil: '2027-06-04'
    },
    ctx
  );
  const doc = service.completeTask('t1', task.id, 'file_1', 'actor_1');
  expect(doc.validUntil).toBe('2027-06-04');
});
```

> Use the exact template/version seeding idiom already present in this test file. If the file has a `seed()`/helper that prepares a generatable template, reuse it rather than hand-rolling.

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/documents/documents.service.test.ts --no-file-parallelism`
Expected: FAIL — `doc.validUntil` is `undefined` (not threaded yet).

- [ ] **Step 4: Thread the value through the service**

In `apps/backend/src/modules/documents/documents.service.ts`:

- In `generateDocument` (task creation, ≈ lines 612-633), add to the `task` object literal (conditional spread for `exactOptionalPropertyTypes`):
  ```ts
      ...(req.validUntil ? { validUntil: req.validUntil } : {}),
  ```
- In `completeTask` (≈ lines 677-694), add to the `generated` object literal:

  ```ts
      ...(task.validUntil ? { validUntil: task.validUntil } : {}),
  ```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/documents/documents.service.test.ts --no-file-parallelism`
Expected: PASS — the new stamp test plus all pre-existing document tests (the field is optional, so untouched paths still produce documents without `validUntil`).

- [ ] **Step 6: Add `completedAt` + per-entry period to the completed event**

In `apps/backend/src/modules/mvp/enrollment-completed.event.ts`:

- Add to `EnrollmentCompletedPayload`:
  ```ts
    /** Phase 5B — enrollment completion timestamp, for valid_until stamping. */
    completedAt?: string;
    /** Phase 5B — resolved group/course title, closes 5A's empty {{courseTitle}}. */
    courseTitle?: string;
  ```
- Add to `EnrollmentCompletedDocumentSetEntry` (same file):

  ```ts
    /** Phase 5B — program validity (months) for this course version; undefined = бессрочно. */
    recertificationPeriodMonths?: number;
  ```

- [ ] **Step 7: Resolve `completedAt` + per-entry period at the MVP emit**

In `apps/backend/src/modules/mvp/mvp.service.ts`, where the `documentSet` entries are built for the completion emit (≈ lines 1818-1828), add the per-entry period from the course version. The block currently maps each `gc` to `{ courseVersionId, templateId, position, isRequired, autoIssueOnCompletion }`. Resolve the version once and spread the period conditionally:

```ts
const documentSet = groupCourses
  .filter((gc) => gc.courseVersionId)
  .flatMap((gc) => {
    const version = this.getCourseVersion(tenantId, gc.courseVersionId as string);
    return this.getCourseDocumentSet(tenantId, gc.courseVersionId as string).map((entry) => ({
      courseVersionId: gc.courseVersionId as string,
      templateId: entry.templateId,
      position: entry.position,
      isRequired: entry.isRequired,
      autoIssueOnCompletion: entry.autoIssueOnCompletion,
      ...(version.recertificationPeriodMonths
        ? { recertificationPeriodMonths: version.recertificationPeriodMonths }
        : {})
    }));
  });
```

Then in the `this.events.emit(ENROLLMENT_COMPLETED_EVENT, { ... })` object (≈ lines 1832-1843), add:

```ts
      ...(enrollment.completedAt ? { completedAt: enrollment.completedAt } : {}),
```

(`courseTitle` resolution is added in Task 7 — leave it for now; the field is optional.)

- [ ] **Step 8: Compute `validUntil` in the issuance listener**

In `apps/backend/src/modules/documents/enrollment-document-issuance.listener.ts`, import the util at the top:

```ts
import { addMonths } from '../../common/utils/date-math.util.js';
```

In `issueDocumentSet`, inside the `for (const entry of autoIssueEntries)` loop (≈ lines 64-76), compute the stamp from the payload's `completedAt` + the entry's period, and pass it into the request:

```ts
const validUntil =
  payload.completedAt && entry.recertificationPeriodMonths
    ? addMonths(payload.completedAt, entry.recertificationPeriodMonths)
    : undefined;
documents.generateDocument(
  tenantId,
  actorId,
  {
    idempotencyKey: `enrollment:${enrollmentId}:${entry.templateId}:v1`,
    templateId: entry.templateId,
    sourceEntityType: 'enrollment',
    sourceEntityId: enrollmentId,
    documentType: CERTIFICATE_DOCUMENT_TYPE,
    ...(validUntil ? { validUntil } : {})
  },
  traceCtx
);
```

> Keep the existing idempotency key `:v1` unchanged — re-running completion must not re-issue. The `validUntil` only fills in when BOTH `completedAt` and a program period exist; otherwise the document is бессрочный (no stamp), exactly as before.

- [ ] **Step 9: Typecheck + run the affected suites**

Run each, expect PASS:

```bash
pnpm --filter @cdoprof/backend exec tsc --noEmit
pnpm --filter @cdoprof/backend exec vitest run src/modules/documents/documents.service.test.ts --no-file-parallelism
pnpm --filter @cdoprof/backend exec vitest run src/modules/documents/enrollment-document-issuance.listener.test.ts --no-file-parallelism
```

> If `enrollment-document-issuance.listener.test.ts` does not exist, the listener is covered by `business-flows.e2e.test.ts`; run that instead. Either way add/extend one assertion that a completed enrollment with a program period produces a document whose `validUntil` equals `addMonths(completedAt, period)`.

- [ ] **Step 10: Commit**

```bash
git add apps/backend/src/modules/documents/documents.types.ts apps/backend/src/modules/documents/documents.dto.ts apps/backend/src/modules/documents/documents.service.ts apps/backend/src/modules/documents/documents.service.test.ts apps/backend/src/modules/mvp/enrollment-completed.event.ts apps/backend/src/modules/mvp/mvp.service.ts apps/backend/src/modules/documents/enrollment-document-issuance.listener.ts
git commit -m "feat(backend): stamp document valid_until at issuance (completed_at + program period)"
```

---

## Task 5: RecertificationDraftsRepository (interface + in-memory + postgres + wiring)

**Files:**

- Create: `apps/backend/src/modules/mvp/recertification/recertification-drafts.repository.ts`
- Create: `apps/backend/src/modules/mvp/recertification/in-memory-recertification-drafts.state.ts`
- Create: `apps/backend/src/modules/mvp/recertification/postgres-recertification-drafts.repository.ts`
- Create: `apps/backend/src/modules/mvp/recertification/recertification-drafts.repository.test.ts`
- Modify: `apps/backend/src/modules/mvp/mvp.module.ts`

> This mirrors 5A's `email-deliveries` repository (singleton: interface + token + in-memory + postgres), **not** the request-scoped MVP state. Reason: the Plan 5B-2 cron writes drafts outside any HTTP request, so the store must be a plain singleton. Do **not** add `recertificationDrafts` to `mvp-collections.ts`.

- [ ] **Step 1: Write the failing repo test**

Create `apps/backend/src/modules/mvp/recertification/recertification-drafts.repository.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { InMemoryRecertificationDraftsState } from './in-memory-recertification-drafts.state.js';

function makeSeed(over: Partial<Parameters<InMemoryRecertificationDraftsState['create']>[0]> = {}) {
  return {
    tenantId: 't1',
    learnerId: 'l1',
    sourceDocumentId: 'gdoc1',
    courseVersionId: 'cv1',
    validUntil: '2026-09-01',
    ...over
  };
}

describe('InMemoryRecertificationDraftsState', () => {
  it('creates a pending draft and lists it back, scoped by tenant', async () => {
    const repo = new InMemoryRecertificationDraftsState();
    const { row, created } = await repo.create(makeSeed());
    expect(created).toBe(true);
    expect(row.status).toBe('pending');
    expect((await repo.list('t1', {})).length).toBe(1);
    expect((await repo.list('t2', {})).length).toBe(0);
  });

  it('is idempotent on (tenant, learner, sourceDocument)', async () => {
    const repo = new InMemoryRecertificationDraftsState();
    const first = await repo.create(makeSeed());
    const second = await repo.create(makeSeed());
    expect(second.created).toBe(false);
    expect(second.row.id).toBe(first.row.id);
    expect((await repo.list('t1', {})).length).toBe(1);
  });

  it('filters list by status', async () => {
    const repo = new InMemoryRecertificationDraftsState();
    await repo.create(makeSeed({ learnerId: 'l1', sourceDocumentId: 'd1' }));
    await repo.create(makeSeed({ learnerId: 'l2', sourceDocumentId: 'd2' }));
    expect((await repo.list('t1', { status: 'pending' })).length).toBe(2);
    expect((await repo.list('t1', { status: 'approved' })).length).toBe(0);
  });

  it('markApproved sets status + resultingEnrollmentId + decidedBy', async () => {
    const repo = new InMemoryRecertificationDraftsState();
    const { row } = await repo.create(makeSeed());
    const updated = await repo.markApproved('t1', row.id, 'enr_new', 'admin1');
    expect(updated?.status).toBe('approved');
    expect(updated?.resultingEnrollmentId).toBe('enr_new');
    expect(updated?.decidedBy).toBe('admin1');
  });

  it('markRejected sets status + reason', async () => {
    const repo = new InMemoryRecertificationDraftsState();
    const { row } = await repo.create(makeSeed());
    const updated = await repo.markRejected('t1', row.id, 'не актуально', 'admin1');
    expect(updated?.status).toBe('rejected');
    expect(updated?.reason).toBe('не актуально');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/recertification/recertification-drafts.repository.test.ts --no-file-parallelism`
Expected: FAIL — cannot find module `./in-memory-recertification-drafts.state.js`.

- [ ] **Step 3: Implement the interface + token + row/seed types**

Create `apps/backend/src/modules/mvp/recertification/recertification-drafts.repository.ts`:

```ts
export const RECERTIFICATION_DRAFTS_REPOSITORY = Symbol('RECERTIFICATION_DRAFTS_REPOSITORY');

export type RecertificationDraftStatus = 'pending' | 'approved' | 'rejected';

export interface RecertificationDraftRow {
  id: string;
  tenantId: string;
  learnerId: string;
  sourceDocumentId: string;
  courseVersionId: string;
  validUntil: string;
  status: RecertificationDraftStatus;
  resultingEnrollmentId?: string;
  reason?: string;
  decidedAt?: string;
  decidedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RecertificationDraftSeed {
  tenantId: string;
  learnerId: string;
  sourceDocumentId: string;
  courseVersionId: string;
  validUntil: string;
}

export interface RecertificationDraftsQuery {
  status?: RecertificationDraftStatus;
}

export interface RecertificationDraftsRepository {
  create(
    seed: RecertificationDraftSeed
  ): Promise<{ row: RecertificationDraftRow; created: boolean }>;
  list(tenantId: string, query: RecertificationDraftsQuery): Promise<RecertificationDraftRow[]>;
  getById(tenantId: string, id: string): Promise<RecertificationDraftRow | null>;
  markApproved(
    tenantId: string,
    id: string,
    resultingEnrollmentId: string,
    decidedBy?: string
  ): Promise<RecertificationDraftRow | null>;
  markRejected(
    tenantId: string,
    id: string,
    reason: string | undefined,
    decidedBy?: string
  ): Promise<RecertificationDraftRow | null>;
}
```

- [ ] **Step 4: Implement the in-memory backend**

Create `apps/backend/src/modules/mvp/recertification/in-memory-recertification-drafts.state.ts`:

```ts
import { Injectable } from '@nestjs/common';

import type {
  RecertificationDraftRow,
  RecertificationDraftSeed,
  RecertificationDraftsQuery,
  RecertificationDraftsRepository
} from './recertification-drafts.repository.js';

@Injectable()
export class InMemoryRecertificationDraftsState implements RecertificationDraftsRepository {
  drafts: RecertificationDraftRow[] = [];

  async create(
    seed: RecertificationDraftSeed
  ): Promise<{ row: RecertificationDraftRow; created: boolean }> {
    const existing = this.drafts.find(
      (d) =>
        d.tenantId === seed.tenantId &&
        d.learnerId === seed.learnerId &&
        d.sourceDocumentId === seed.sourceDocumentId
    );
    if (existing) {
      return { row: existing, created: false };
    }
    const now = new Date().toISOString();
    const row: RecertificationDraftRow = {
      id: `recert_${Math.random().toString(36).slice(2, 10)}`,
      tenantId: seed.tenantId,
      learnerId: seed.learnerId,
      sourceDocumentId: seed.sourceDocumentId,
      courseVersionId: seed.courseVersionId,
      validUntil: seed.validUntil,
      status: 'pending',
      createdAt: now,
      updatedAt: now
    };
    this.drafts.push(row);
    return { row, created: true };
  }

  async list(
    tenantId: string,
    query: RecertificationDraftsQuery
  ): Promise<RecertificationDraftRow[]> {
    return this.drafts.filter(
      (d) => d.tenantId === tenantId && (!query.status || d.status === query.status)
    );
  }

  async getById(tenantId: string, id: string): Promise<RecertificationDraftRow | null> {
    return this.drafts.find((d) => d.tenantId === tenantId && d.id === id) ?? null;
  }

  async markApproved(
    tenantId: string,
    id: string,
    resultingEnrollmentId: string,
    decidedBy?: string
  ): Promise<RecertificationDraftRow | null> {
    const row = await this.getById(tenantId, id);
    if (!row) return null;
    row.status = 'approved';
    row.resultingEnrollmentId = resultingEnrollmentId;
    row.decidedAt = new Date().toISOString();
    if (decidedBy) row.decidedBy = decidedBy;
    row.updatedAt = row.decidedAt;
    return row;
  }

  async markRejected(
    tenantId: string,
    id: string,
    reason: string | undefined,
    decidedBy?: string
  ): Promise<RecertificationDraftRow | null> {
    const row = await this.getById(tenantId, id);
    if (!row) return null;
    row.status = 'rejected';
    if (reason) row.reason = reason;
    row.decidedAt = new Date().toISOString();
    if (decidedBy) row.decidedBy = decidedBy;
    row.updatedAt = row.decidedAt;
    return row;
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/recertification/recertification-drafts.repository.test.ts --no-file-parallelism`
Expected: PASS (all 5 cases).

- [ ] **Step 6: Implement the postgres backend**

Create `apps/backend/src/modules/mvp/recertification/postgres-recertification-drafts.repository.ts` (mirrors `postgres-email-deliveries.repository.ts`: bare `DatabaseService` ctor, `$N` params, snake→camel map; the `create` uses the unique index for idempotency via `on conflict do nothing` + a follow-up select):

```ts
import { Injectable } from '@nestjs/common';

import { type DatabaseService } from '../../../infrastructure/database/database.service.js';

import type {
  RecertificationDraftRow,
  RecertificationDraftSeed,
  RecertificationDraftStatus,
  RecertificationDraftsQuery,
  RecertificationDraftsRepository
} from './recertification-drafts.repository.js';

interface DraftDbRow {
  id: string;
  tenant_id: string;
  learner_id: string;
  source_document_id: string;
  course_version_id: string;
  valid_until: string;
  status: string;
  resulting_enrollment_id: string | null;
  reason: string | null;
  decided_at: string | null;
  decided_by: string | null;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class PostgresRecertificationDraftsRepository implements RecertificationDraftsRepository {
  constructor(private readonly db: DatabaseService) {}

  async create(
    seed: RecertificationDraftSeed
  ): Promise<{ row: RecertificationDraftRow; created: boolean }> {
    const id = `recert_${Math.random().toString(36).slice(2, 10)}`;
    const inserted = await this.db.query<DraftDbRow>(
      `insert into learning.recertification_drafts
         (id, tenant_id, learner_id, source_document_id, course_version_id, valid_until, status, created_at, updated_at)
       values ($1, $2, $3, $4, $5, $6, 'pending', now(), now())
       on conflict (tenant_id, learner_id, source_document_id) do nothing
       returning *`,
      [
        id,
        seed.tenantId,
        seed.learnerId,
        seed.sourceDocumentId,
        seed.courseVersionId,
        seed.validUntil
      ]
    );
    if (inserted[0]) {
      return { row: this.map(inserted[0]), created: true };
    }
    const existing = await this.db.query<DraftDbRow>(
      `select * from learning.recertification_drafts
       where tenant_id = $1 and learner_id = $2 and source_document_id = $3`,
      [seed.tenantId, seed.learnerId, seed.sourceDocumentId]
    );
    return { row: this.map(existing[0]!), created: false };
  }

  async list(
    tenantId: string,
    query: RecertificationDraftsQuery
  ): Promise<RecertificationDraftRow[]> {
    const rows = query.status
      ? await this.db.query<DraftDbRow>(
          `select * from learning.recertification_drafts
           where tenant_id = $1 and status = $2 order by valid_until asc`,
          [tenantId, query.status]
        )
      : await this.db.query<DraftDbRow>(
          `select * from learning.recertification_drafts
           where tenant_id = $1 order by valid_until asc`,
          [tenantId]
        );
    return rows.map((r) => this.map(r));
  }

  async getById(tenantId: string, id: string): Promise<RecertificationDraftRow | null> {
    const rows = await this.db.query<DraftDbRow>(
      `select * from learning.recertification_drafts where tenant_id = $1 and id = $2`,
      [tenantId, id]
    );
    return rows[0] ? this.map(rows[0]) : null;
  }

  async markApproved(
    tenantId: string,
    id: string,
    resultingEnrollmentId: string,
    decidedBy?: string
  ): Promise<RecertificationDraftRow | null> {
    const rows = await this.db.query<DraftDbRow>(
      `update learning.recertification_drafts
         set status = 'approved', resulting_enrollment_id = $3, decided_by = $4, decided_at = now(), updated_at = now()
       where tenant_id = $1 and id = $2
       returning *`,
      [tenantId, id, resultingEnrollmentId, decidedBy ?? null]
    );
    return rows[0] ? this.map(rows[0]) : null;
  }

  async markRejected(
    tenantId: string,
    id: string,
    reason: string | undefined,
    decidedBy?: string
  ): Promise<RecertificationDraftRow | null> {
    const rows = await this.db.query<DraftDbRow>(
      `update learning.recertification_drafts
         set status = 'rejected', reason = $3, decided_by = $4, decided_at = now(), updated_at = now()
       where tenant_id = $1 and id = $2
       returning *`,
      [tenantId, id, reason ?? null, decidedBy ?? null]
    );
    return rows[0] ? this.map(rows[0]) : null;
  }

  private map(row: DraftDbRow): RecertificationDraftRow {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      learnerId: row.learner_id,
      sourceDocumentId: row.source_document_id,
      courseVersionId: row.course_version_id,
      validUntil: row.valid_until,
      status: row.status as RecertificationDraftStatus,
      ...(row.resulting_enrollment_id
        ? { resultingEnrollmentId: row.resulting_enrollment_id }
        : {}),
      ...(row.reason ? { reason: row.reason } : {}),
      ...(row.decided_at ? { decidedAt: row.decided_at } : {}),
      ...(row.decided_by ? { decidedBy: row.decided_by } : {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
```

- [ ] **Step 7: Wire the repo into MvpModule**

In `apps/backend/src/modules/mvp/mvp.module.ts`, add imports and register the repo as a **singleton** (bind the token to postgres, mirroring how 5A binds `EMAIL_DELIVERIES_REPOSITORY`):

```ts
import { RECERTIFICATION_DRAFTS_REPOSITORY } from './recertification/recertification-drafts.repository.js';
import { InMemoryRecertificationDraftsState } from './recertification/in-memory-recertification-drafts.state.js';
import { PostgresRecertificationDraftsRepository } from './recertification/postgres-recertification-drafts.repository.js';
// ...in providers: [...]
    PostgresRecertificationDraftsRepository,
    { provide: RECERTIFICATION_DRAFTS_REPOSITORY, useClass: PostgresRecertificationDraftsRepository },
    InMemoryRecertificationDraftsState,
```

- [ ] **Step 8: Typecheck + commit**

Run: `pnpm --filter @cdoprof/backend exec tsc --noEmit`
Expected: PASS.

```bash
git add apps/backend/src/modules/mvp/recertification/recertification-drafts.repository.ts apps/backend/src/modules/mvp/recertification/in-memory-recertification-drafts.state.ts apps/backend/src/modules/mvp/recertification/postgres-recertification-drafts.repository.ts apps/backend/src/modules/mvp/recertification/recertification-drafts.repository.test.ts apps/backend/src/modules/mvp/mvp.module.ts
git commit -m "feat(backend): recertification drafts repository (in-memory + postgres)"
```

---

## Task 6: RecertificationService — scan + create drafts + list/approve/reject + template

**Files:**

- Modify: `apps/backend/src/modules/communication/email-templates.ts` (add `recertification_due`)
- Create: `apps/backend/src/modules/mvp/recertification/recertification.service.ts`
- Create: `apps/backend/src/modules/mvp/recertification/recertification.service.test.ts`
- Modify: `apps/backend/src/modules/mvp/mvp.module.ts` (import `CommunicationModule`; register service)

- [ ] **Step 1: Add the `recertification_due` template (code default)**

In `apps/backend/src/modules/communication/email-templates.ts`:

- Extend the union:
  ```ts
  export type EmailTemplateKey = 'enrollment_invite' | 'course_completed' | 'recertification_due';
  ```
- Add to `EMAIL_TEMPLATE_DEFAULTS`:

  ```ts
    recertification_due: {
      subject: 'Истекает срок действия удостоверения по программе «{{courseTitle}}»',
      body:
        'Здравствуйте, {{learnerName}}!\n\n' +
        'Срок действия вашего удостоверения по программе «{{courseTitle}}» истекает {{validUntil}}. ' +
        'Для продления необходимо пройти переаттестацию. ' +
        'Учебный центр свяжется с вами для записи на ближайший поток.\n\n' +
        'С уважением, учебный центр.'
    }
  ```

- [ ] **Step 2: Write the failing service test**

Create `apps/backend/src/modules/mvp/recertification/recertification.service.test.ts`. It tests the **pure scan** + the orchestration with fakes (a fake drafts repo = `InMemoryRecertificationDraftsState`, a fake dispatcher capturing calls, and hand-built document/learner arrays). The service takes its collaborators as constructor params so it is unit-testable without Nest DI (mirror `makeServices()` in `learners-bulk-import.service.test.ts`).

```ts
import { describe, expect, it, vi } from 'vitest';

import { InMemoryRecertificationDraftsState } from './in-memory-recertification-drafts.state.js';
import { RecertificationService, scanForRecertification } from './recertification.service.js';

const ASOF = '2026-06-05';

function doc(over: Record<string, unknown> = {}) {
  return {
    id: 'gdoc1',
    tenantId: 't1',
    sourceEntityType: 'enrollment',
    sourceEntityId: 'enr1',
    status: 'generated',
    validUntil: '2026-08-01', // within 90 days of ASOF
    ...over
  };
}

describe('scanForRecertification (pure)', () => {
  it('selects documents whose validUntil is within the horizon', () => {
    const out = scanForRecertification(ASOF, [doc()] as never, 90);
    expect(out.map((c) => c.documentId)).toEqual(['gdoc1']);
  });

  it('selects already-expired documents', () => {
    const out = scanForRecertification(ASOF, [doc({ validUntil: '2026-01-01' })] as never, 90);
    expect(out).toHaveLength(1);
  });

  it('ignores documents beyond the horizon, without validUntil, or revoked', () => {
    const docs = [
      doc({ id: 'far', validUntil: '2027-01-01' }),
      doc({ id: 'none', validUntil: undefined }),
      doc({ id: 'rev', status: 'revoked', revokedAt: '2026-05-01' })
    ];
    expect(scanForRecertification(ASOF, docs as never, 90)).toHaveLength(0);
  });
});

describe('RecertificationService.runScan', () => {
  function make() {
    const drafts = new InMemoryRecertificationDraftsState();
    const dispatch = vi.fn().mockResolvedValue(undefined);
    // Minimal fakes for the data the service reads:
    const deps = {
      listDocuments: () => [doc()],
      getEnrollment: () => ({
        id: 'enr1',
        tenantId: 't1',
        learnerId: 'l1',
        groupId: 'g1',
        courseVersionIdForRecert: 'cv1'
      }),
      getLearner: () => ({
        id: 'l1',
        tenantId: 't1',
        firstName: 'Иван',
        lastName: 'Иванов',
        email: 'ivan@example.com'
      }),
      getGroupCounterpartyEmail: () => undefined,
      resolveCourseVersionId: () => 'cv1',
      resolveCourseTitle: () => 'Охрана труда'
    };
    const service = new RecertificationService(drafts, { dispatch } as never, deps as never);
    return { service, drafts, dispatch };
  }

  it('creates a draft and dispatches one recertification_due email to the learner', async () => {
    const { service, drafts, dispatch } = make();
    const summary = await service.runScan('t1', ASOF, { userId: 'admin1' } as never);
    expect(summary.draftsCreated).toBe(1);
    expect((await drafts.list('t1', {})).length).toBe(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0]![0].templateKey).toBe('recertification_due');
    expect(dispatch.mock.calls[0]![0].recipients[0].email).toBe('ivan@example.com');
  });

  it('is idempotent — a second scan creates no new draft and sends no new email', async () => {
    const { service, drafts, dispatch } = make();
    await service.runScan('t1', ASOF, { userId: 'admin1' } as never);
    const summary = await service.runScan('t1', ASOF, { userId: 'admin1' } as never);
    expect(summary.draftsCreated).toBe(0);
    expect((await drafts.list('t1', {})).length).toBe(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
});
```

> The exact `deps` interface is yours to finalize in Step 3 — the test pins the **behaviour** (draft created, one email, idempotent). Keep the dep surface minimal: the service must not reach into Nest DI in tests.

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/recertification/recertification.service.test.ts --no-file-parallelism`
Expected: FAIL — cannot find module `./recertification.service.js`.

- [ ] **Step 4: Implement the service**

Create `apps/backend/src/modules/mvp/recertification/recertification.service.ts`. Design notes:

- `scanForRecertification(asOf, documents, horizonDays)` is an **exported pure function**: keep a doc if it has `validUntil`, is not revoked (`status !== 'revoked' && !revokedAt`), and `validUntil <= addDays(asOf, horizonDays)` (string compare on `YYYY-MM-DD` is correct). Return `{ documentId, sourceEntityId, validUntil }[]`.
- The service is `@Injectable()` and **request-scoped** (it reads request-scoped MVP + documents state). Inject the drafts repo (`@Inject(RECERTIFICATION_DRAFTS_REPOSITORY)`), the `NotificationDispatcher`, and `MvpService` + `DocumentsService` (both already in the MVP module's scope). For the unit test, the third ctor arg is a small `deps` object — in production, build that `deps` object from the injected `MvpService`/`DocumentsService`. Concretely: make the ctor `(draftsRepo, dispatcher, mvp: MvpService, documents: DocumentsService)` for the Nest path, and have the test pass a 3-arg shape via a thin internal `Deps` indirection. **Simplest path that satisfies both:** give the service a ctor `(draftsRepo, dispatcher, mvp, documents)` and in the test pass lightweight fakes for `mvp`/`documents` exposing only the methods used (`mvp.getLearner`, `mvp.getEnrollment`/state access, `documents.listDocuments`). Adjust the test's `make()` accordingly if you choose this shape — the behavioural assertions stay identical.
- `runScan(tenantId, asOf, ctx)`:
  1. `const candidates = scanForRecertification(asOf, documents.listDocuments(tenantId, {}).items, RECERT_HORIZON_DAYS)`.
  2. For each candidate: resolve the enrollment from `sourceEntityId`, then the learner (`mvp.getLearner`), then the course version to recertify (the enrollment's course version — reuse the same `courseVersionId` the document was issued under; if unavailable, skip with a logged warning).
  3. `const { created } = await draftsRepo.create({ tenantId, learnerId, sourceDocumentId, courseVersionId, validUntil })`.
  4. **Only when `created`**, dispatch `recertification_due` to the learner (via `learnerRecipient`) and, if the group has a counterparty `contactEmail`, also to that employer; `relatedEntityType: 'recertification_draft'`, `relatedEntityId: draft.id`; variables `{ learnerName, courseTitle, validUntil }`.
  5. Return `{ draftsCreated, emailsDispatched }`.
- `listDrafts(tenantId, query)` → `draftsRepo.list`.
- `approveDraft(tenantId, draftId, targetGroupId, ctx)`: load the draft (404 if missing / not `pending`), call `mvp.createBulkEnrollments(tenantId, ctx.userId, { groupId: targetGroupId, learnerIds: [draft.learnerId], idempotencyKey: `recert\_${draftId}::approve` }, ctx)`, take `outcome.created[0]?.id ?? outcome.skippedExisting[0]?.enrollmentId` as the resulting enrollment id, then `draftsRepo.markApproved(tenantId, draftId, enrollmentId, ctx.userId)`.
- `rejectDraft(tenantId, draftId, reason, ctx)`: `draftsRepo.markRejected(...)` (404 if missing).
- Throw `NotFoundException({ code, message })` / `BadRequestException({ code, message })` per the repo conventions in CLAUDE.md.

Export the constant `export const RECERT_HORIZON_DAYS = 90;`.

> Use `learnerRecipient` from `../enrollment-recipient.js` for the learner recipient (returns `undefined` when no email — skip that recipient silently). Resolve the employer email via `group.counterpartyId → counterparty.contactEmail` (both already on the MVP state; see `mvp.types.ts` `GroupEntity.counterpartyId` + `Counterparty.contactEmail`). If either is absent, send to the learner only.

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/recertification/recertification.service.test.ts --no-file-parallelism`
Expected: PASS.

- [ ] **Step 6: Wire the service + CommunicationModule into MvpModule**

In `apps/backend/src/modules/mvp/mvp.module.ts`:

- Add `CommunicationModule` to `imports` (it exports `NotificationDispatcher`; it does NOT import MvpModule, so no cycle):
  ```ts
  import { CommunicationModule } from '../communication/communication.module.js';
  // imports: [InfrastructureModule, FilesModule, IamModule, DocumentsModule, OrgModule, CommunicationModule],
  ```
- Register the service as **request-scoped** (it reads request-scoped state):

  ```ts
  import { RecertificationService } from './recertification/recertification.service.js';
  // providers: [...]
      { provide: RecertificationService, scope: Scope.REQUEST, useClass: RecertificationService },
  ```

- [ ] **Step 7: Typecheck + commit**

Run: `pnpm --filter @cdoprof/backend exec tsc --noEmit`
Expected: PASS.

```bash
git add apps/backend/src/modules/communication/email-templates.ts apps/backend/src/modules/mvp/recertification/recertification.service.ts apps/backend/src/modules/mvp/recertification/recertification.service.test.ts apps/backend/src/modules/mvp/mvp.module.ts
git commit -m "feat(backend): RecertificationService — scan + drafts + approve/reject + recertification_due email"
```

---

## Task 7: Close 5A's empty {{courseTitle}} (resolve group/course title at emit)

**Files:**

- Modify: `apps/backend/src/modules/mvp/enrollment-invited.event.ts` (add `courseTitle?`)
- Modify: `apps/backend/src/modules/mvp/mvp.service.ts` (resolve title at both emits)
- Modify: `apps/backend/src/modules/communication/enrollment-email.listener.ts` (use `payload.courseTitle`)
- Modify: `apps/backend/src/modules/communication/email-notifications.service.test.ts` (assert non-empty courseTitle)

> 5A deliberately left `courseTitle: ''` because the enrollment links to a _group_, not one course. We now resolve a human title at the producer (the MVP service has groups + courses). A group can have several courses — use the first course's name (or the group name as a fallback), enough for a meaningful subject line.

- [ ] **Step 1: Add `courseTitle` to the invited payload**

In `apps/backend/src/modules/mvp/enrollment-invited.event.ts`, add to `EnrollmentInvitedPayload`:

```ts
  /** Phase 5B — resolved group/course title for the email subject. */
  courseTitle?: string;
```

(`EnrollmentCompletedPayload.courseTitle` was already added in Task 4 Step 6.)

- [ ] **Step 2: Write the failing listener assertion**

In `apps/backend/src/modules/communication/email-notifications.service.test.ts`, extend the existing `EnrollmentEmailListener` invited test to pass a `courseTitle` and assert the rendered subject contains it:

```ts
await listener.handleInvited({
  tenantId: 't1',
  enrollmentId: 'enr1',
  learnerId: 'l1',
  groupId: 'g1',
  courseTitle: 'Охрана труда',
  recipient: { email: 'a@example.com', name: 'Иванов' }
});
const list = await deliveries.list('t1', {});
expect(list.items[0]!.subject).toContain('Охрана труда');
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/communication/email-notifications.service.test.ts --no-file-parallelism`
Expected: FAIL — subject is `Вас записали на курс «»` (empty title).

- [ ] **Step 4: Use `courseTitle` in the listener**

In `apps/backend/src/modules/communication/enrollment-email.listener.ts`, change the `dispatch` helper to accept the payload's `courseTitle` and pass it through. Update the helper's param type to include `courseTitle?: string` and set:

```ts
      variables: {
        learnerName: payload.recipient.name ?? '',
        courseTitle: payload.courseTitle ?? ''
      },
```

- [ ] **Step 5: Resolve the title at both emits in MvpService**

In `apps/backend/src/modules/mvp/mvp.service.ts`, add a small private helper and use it at the invited emit (`createEnrollment`) and the completed emit (`updateEnrollmentStatus`). The helper resolves the first course name of the group, falling back to the group name:

```ts
private resolveGroupCourseTitle(tenantId: string, groupId: string): string | undefined {
  const groupCourse = this.state.groupCourses.find(
    (gc) => gc.tenantId === tenantId && gc.groupId === groupId
  );
  if (groupCourse) {
    const course = this.state.courses.find(
      (c) => c.tenantId === tenantId && c.id === groupCourse.courseId
    );
    if (course?.name) return course.name;
  }
  const group = this.state.groups.find((g) => g.tenantId === tenantId && g.id === groupId);
  return group?.name;
}
```

At the invited emit object literal add:

```ts
      ...(() => {
        const courseTitle = this.resolveGroupCourseTitle(tenantId, entity.groupId);
        return courseTitle ? { courseTitle } : {};
      })(),
```

…and the equivalent at the completed emit (use `enrollment.groupId`). (Prefer computing `const courseTitle = this.resolveGroupCourseTitle(...)` on a line above each emit and then `...(courseTitle ? { courseTitle } : {})` if that reads cleaner in context — match the surrounding style.)

> Confirm the collection names against `mvp-collections.ts` / `in-memory-mvp.state.ts`: `groupCourses`, `courses`, `groups` are the relevant arrays. Adjust if a name differs.

- [ ] **Step 6: Run the test + typecheck**

Run, expect PASS:

```bash
pnpm --filter @cdoprof/backend exec vitest run src/modules/communication/email-notifications.service.test.ts --no-file-parallelism
pnpm --filter @cdoprof/backend exec tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/mvp/enrollment-invited.event.ts apps/backend/src/modules/mvp/mvp.service.ts apps/backend/src/modules/communication/enrollment-email.listener.ts apps/backend/src/modules/communication/email-notifications.service.test.ts
git commit -m "fix(backend): resolve group/course title for enrollment emails (closes 5A {{courseTitle}} gap)"
```

---

## Task 8: Admin endpoints + DTOs + permission-boundary test

**Files:**

- Create: `apps/backend/src/modules/mvp/recertification/recertification.dto.ts`
- Create: `apps/backend/src/modules/mvp/recertification/recertification.controller.ts`
- Modify: `apps/backend/src/modules/mvp/mvp.module.ts` (register controller)
- Modify: `apps/backend/src/modules/mvp/mvp.http.integration.test.ts` (recertification permission boundary block)

- [ ] **Step 1: Create the DTOs**

Create `apps/backend/src/modules/mvp/recertification/recertification.dto.ts`:

```ts
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ApproveRecertificationDraftRequest {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  targetGroupId!: string;
}

export class RejectRecertificationDraftRequest {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
```

- [ ] **Step 2: Create the controller**

Create `apps/backend/src/modules/mvp/recertification/recertification.controller.ts` (class-level `@Controller()` + `@UseInterceptors(MvpRequestPersistenceInterceptor)` + `@UseGuards(TenantGuard)`; per-method `@UseGuards(PermissionGuard)` + `@RequirePermissions(...)`; `@Body() raw: unknown` + `assertValidDto` — exactly as `mvp.controller.ts`/`email-notifications.controller.ts` do). The persistence interceptor is required because `approve`/`scan` mutate request-scoped MVP state (new enrollment):

```ts
import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';

import { assertValidDto } from '../../../common/app-validation.pipe.js';
import { CurrentContext } from '../../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../../common/guards/tenant.guard.js';
import { MvpRequestPersistenceInterceptor } from '../infrastructure/mvp-request-persistence.interceptor.js';
import { RequirePermissions } from '../../iam/permission.decorator.js';
import { PermissionGuard } from '../../iam/permission.guard.js';
import {
  ApproveRecertificationDraftRequest,
  RejectRecertificationDraftRequest
} from './recertification.dto.js';
import { RecertificationService } from './recertification.service.js';

import type { RequestContext } from '../../../common/context/request-context.js';
import type { RecertificationDraftStatus } from './recertification-drafts.repository.js';

@Controller()
@UseInterceptors(MvpRequestPersistenceInterceptor)
@UseGuards(TenantGuard)
export class RecertificationController {
  constructor(private readonly service: RecertificationService) {}

  @Get('recertification-drafts')
  @UseGuards(PermissionGuard)
  @RequirePermissions('recertification.read')
  async list(@CurrentContext() c: RequestContext, @Query('status') status?: string) {
    return this.service.listDrafts(c.tenantId!, {
      ...(status ? { status: status as RecertificationDraftStatus } : {})
    });
  }

  @Post('recertification/scan')
  @UseGuards(PermissionGuard)
  @RequirePermissions('recertification.write')
  async scan(@CurrentContext() c: RequestContext) {
    return this.service.runScan(c.tenantId!, new Date().toISOString().slice(0, 10), c);
  }

  @Post('recertification-drafts/:id/approve')
  @UseGuards(PermissionGuard)
  @RequirePermissions('recertification.write')
  async approve(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() raw: unknown
  ) {
    const body = assertValidDto(ApproveRecertificationDraftRequest, raw);
    return this.service.approveDraft(c.tenantId!, id, body.targetGroupId, c);
  }

  @Post('recertification-drafts/:id/reject')
  @UseGuards(PermissionGuard)
  @RequirePermissions('recertification.write')
  async reject(@CurrentContext() c: RequestContext, @Param('id') id: string, @Body() raw: unknown) {
    const body = assertValidDto(RejectRecertificationDraftRequest, raw);
    return this.service.rejectDraft(c.tenantId!, id, body.reason, c);
  }
}
```

> Verify the relative import depth (`../../../common/...`) — the controller is one level deeper than `mvp.controller.ts` (it sits in `recertification/`). Confirm `MvpRequestPersistenceInterceptor`'s exact path/name under `mvp/infrastructure/`. The `runScan` here passes "today" — Plan 5B-2's cron will pass its own `asOf`.

- [ ] **Step 3: Register the controller**

In `apps/backend/src/modules/mvp/mvp.module.ts`, add `RecertificationController` to the `controllers` array.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @cdoprof/backend exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Add the permission-boundary test (extend the mvp http file)**

In `apps/backend/src/modules/mvp/mvp.http.integration.test.ts`, add stub handlers to `TestMvpController` (mirror the 5A `email-deliveries`/`email-templates` stubs):

```ts
      @Get('recertification-drafts')
      @RequirePermissions('recertification.read')
      listRecertDrafts(@CurrentContext() context: { tenantId?: string }) {
        return { items: [], tenantId: context.tenantId };
      }

      @Post('recertification-drafts/:id/approve')
      @RequirePermissions('recertification.write')
      approveRecertDraft(
        @CurrentContext() context: { tenantId?: string; userId?: string },
        @Body() body: { targetGroupId: string }
      ) {
        return { id: 'recert_1', status: 'approved', targetGroupId: body.targetGroupId };
      }
```

Then add a `describe('recertification permission boundary', ...)` block mirroring the 5A `notifications permission boundary` block exactly: a 403 for `GET /recertification-drafts` without `recertification.read`; a 200 with it; a 403 for `POST /recertification-drafts/x/approve` without `recertification.write`; a 200 with it. Copy the token-minting + `iamServiceMock.resolvePermissions.mockResolvedValueOnce([...])` idiom verbatim from the notifications block, swapping the paths/permissions/method (`approve` is `POST` with a JSON body `{ targetGroupId: 'g1' }`).

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/mvp.http.integration.test.ts --no-file-parallelism`
Expected: PASS (existing blocks + the 4 new recertification cases).

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/mvp/recertification/recertification.dto.ts apps/backend/src/modules/mvp/recertification/recertification.controller.ts apps/backend/src/modules/mvp/mvp.module.ts apps/backend/src/modules/mvp/mvp.http.integration.test.ts
git commit -m "feat(backend): recertification admin endpoints + permission-boundary test"
```

---

## Task 9: Full verification + docs handoff

**Files:**

- Modify: `README.md` (§2 «AI Agent State»)
- Modify: `LMS_AGENT_HANDOFF.md` (append §5.XX)
- Modify: `docs/superpowers/plans/2026-06-05-phase-5-plan-b-recertification-cycle.md` (tick boxes)

- [ ] **Step 1: Lint the new files**

Run: `npx eslint apps/backend/src/modules/mvp/recertification apps/backend/src/common/utils/date-math.util.ts --max-warnings=0`
Expected: PASS. Fix any issues.

- [ ] **Step 2: Typecheck the whole monorepo**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Run the targeted backend suites (Cyrillic-path safe — isolated files)**

Run each and expect PASS:

```bash
pnpm --filter @cdoprof/backend exec vitest run src/common/utils/date-math.util.test.ts --no-file-parallelism
pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/recertification/recertification-drafts.repository.test.ts --no-file-parallelism
pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/recertification/recertification.service.test.ts --no-file-parallelism
pnpm --filter @cdoprof/backend exec vitest run src/modules/documents/documents.service.test.ts --no-file-parallelism
pnpm --filter @cdoprof/backend exec vitest run src/modules/communication/email-notifications.service.test.ts --no-file-parallelism
pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/mvp.http.integration.test.ts --no-file-parallelism
pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/mvp.dto-validation.test.ts --no-file-parallelism
```

> Per CLAUDE.md Gotchas, do NOT run the full `pnpm test:backend` locally (Cyrillic-path `tinypool` crash). CI (Ubuntu) runs the full suite.

- [ ] **Step 4: Update docs**

- `README.md` §2 «AI Agent State»: Last Completed Task = «Phase 5 Plan 5B — recertification foundation», Current/Next = «Plan 5B-2 (daily scheduler) + Plan 5C (queue UI)», Last Updated At/By.
- Append `### 5.XX` to `LMS_AGENT_HANDOFF.md` §5: summary, files changed, test status, and the **deferrals** (scheduler→5B-2, course_deadline/document_revoked/90-30-7 cadence→5B-2, license_expiring→needs org persistence, curator/admin recipients→gaps, frontend→5C). Cross-link this plan.
- Tick the checkboxes in this plan file.

- [ ] **Step 5: Commit**

```bash
git add README.md LMS_AGENT_HANDOFF.md docs/superpowers/plans/2026-06-05-phase-5-plan-b-recertification-cycle.md
git commit -m "docs(plan): close out Phase 5 Plan 5B — recertification foundation"
```

---

## Deviations from the spec (record any new ones in the handoff)

1. **Migration number `0048`, not `0047`** — 5A claimed `0047` first. Same DDL/permissions shape.
2. **Recert drafts use a singleton relational repo (mirrors 5A `email_deliveries`), not the documents snapshot backend** — the spec said «зеркало documents-персистентности», but the documents backend is request-scoped snapshots; a singleton repo is what the Plan 5B-2 cron needs (it writes drafts outside any request). The drafts table is a real relational table with columns.
3. **Scan is HTTP-triggered per-tenant in 5B; the daily cross-tenant cron + advisory lock is Plan 5B-2** — splits the genuinely-hard cross-tenant-load problem out while delivering a testable, demoable scan now.
4. **Single 90-day horizon + one email at draft creation, not graduated 90/30/7 repeats** — repeats are inseparable from the daily cron (5B-2). Draft creation is idempotent on `(tenant, learner, source document)`, so the email fires exactly once.
5. **`license_expiring` deferred** — the `org` module has no postgres persistence (request-scoped in-memory only), so there is nothing to scan across tenants; revisit when org gets a persistence backend.
6. **`course_deadline` + `document_revoked` emails deferred to 5B-2** — both need either milestone-dedup (course deadline) or the cross-module recipient resolution harness (revocation) that pairs naturally with the scheduler.
7. **Recipients = learner (+ employer when resolvable); curator + admin-email deferred** — `Group` has no curator/responsible field and IAM has no clean «tenant admin email» resolver; the draft is always visible in the admin queue (Plan 5C UI) as the fallback the spec's §6 anticipated.
8. **Frontend «Нужна переаттестация» queue → Plan 5C** — keeps 5B a backend slice the size of 5A.

## Self-Review checklist (run before execution)

- **Spec coverage:** §3.2 columns ✔ (T1), validity stamping §3.3 ✔ (T4), draft model §3.2/§3.4 ✔ (T5/T6), approve→enroll §3.4 ✔ (T6/T8), email §3.1 ✔ (T6), permissions §5 ✔ (T1/T8). Date-scan §3.1.B is **partially** covered (recert scan present; course-deadline/license deferred with reasons). Scheduler §4.3 → 5B-2 (documented).
- **Type consistency:** `validUntil` is `string` (YYYY-MM-DD) everywhere; `recertificationPeriodMonths` is `number` on `ProgramMeta`/`CourseVersion`/the doc-set entry; `RecertificationDraftStatus = 'pending'|'approved'|'rejected'` used in repo + controller query.
- **Placeholder scan:** the few "find the sibling and mirror it" steps (program-meta DTO in T3; the completeTask seed in T4 Step 2; the notifications block to copy in T8 Step 5) are anchored to a **named existing symbol** to copy — not vague TODOs.
