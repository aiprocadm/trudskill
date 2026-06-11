# Phase 4 Plan B — Proctoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A final exam can be video-recorded from the learner's webcam: the learner consents (152-ФЗ), the browser `MediaRecorder` produces 30-second chunks that upload sequentially to MinIO via the files layer, a 5th gate in `MvpService.startAttempt` (412 `proctoring_required`) blocks the exam until a recording session is active, and an admin reviews recordings at `/admin/proctoring-recordings` (chunk-concatenating player). Requirement is per-group-course (`requiresProctoring`) with a per-student override (`Enrollment.proctoringOverride`). Videos age out via a dormant 365-day retention cron.

**Architecture:** Mirrors Phase 4 Plan A (identity verification, PR #240) in shape: one new MVP collection `proctoringRecordings` (registered in `mvp-collections.ts`; JSONB-snapshot persistence is generic — no per-collection adapter code), typed contract table `learning.proctoring_recordings` in migration 0051, lifecycle methods in `MvpService`, a gate after `assertIdentityVerificationGate`, a `proctoring/` directory mirroring `identity/` (pure selection fn + scanner + dormant scheduler, advisory lock **528_493**, **write-mode** `MvpTenantRunner.runWithTenantStateAndSave` — the CRITICAL Plan A lesson), and a frontend feature module `src/features/proctoring/` whose core is a browser-API-free recorder state machine (`recorder.ts`).

**Tech Stack:** NestJS (request-scoped in-memory MVP state, JSONB snapshot persistence), TypeScript, Vitest, PostgreSQL numbered SQL migrations, Next.js 15 App Router + React Query (reads) + `useState` wrap (mutations), browser `MediaRecorder` (injected, never touched in tests).

**Spec:** [docs/superpowers/specs/2026-06-11-phase-4-plan-b-proctoring-design.md](../specs/2026-06-11-phase-4-plan-b-proctoring-design.md)

---

## Locked design decisions (read before starting)

1. **Field name `recordingStatus`, NOT `status`.** `BaseEntity.status` is the entity-lifecycle `EntityStatus` (kept `'active'`); the domain state machine `recording → completed` lives in its own field. (Same deviation from the spec's `status` as Plan A's `verificationStatus` — collision with `BaseEntity`. The HTTP query param stays `?status=`.)
2. **Start/active API takes `enrollmentId`, not `groupId`.** The spec's `{ groupId, courseId }` is unimplementable from the frontend: `LearnerTestSummary` (the only data the test-player has) carries `enrollmentId` + `courseId` but **no `groupId`**. The service resolves `groupId` from the enrollment and `assertActorMatchesLearnerIamLink` validates ownership via `enrollment.learnerId`. `ProctoringRecording` still stores `groupId` + `courseId` (gate lookup needs them).
3. **Idempotent start.** A `POST /proctoring-recordings` while an active session exists for the same (learner, group, course) returns that session (200/201, no error) — mirrors the identity draft-reuse. The returned record's `chunks` give the frontend `nextSequence` for resume, so a refresh needs only one call.
4. **Gate error message must NOT collide with existing interstitial regexes.** `useStartAttempt` exposes only `err.message` (the backend English message, not the code — see `ApiClientError`), so detection regexes match messages. New message: `Video recording must be active before starting this exam`. It must not match `/pre_exam_auth_required|identity verification is required/i` nor `/identity_verification_required|identity confirmation by document/i` — asserted by test. Frontend detection regex: `/proctoring_required|video recording must be active/i` (code kept in the regex for future-proofing, message is what actually matches today).
5. **Gate is the 5th assert in `startAttempt`**, after `assertIdentityVerificationGate`; final/course exams only (`test.moduleId` ⇒ skip). On successful start, the active recording gets `attemptId = attempt.id` linked **once** (first attempt of the session; a retake inside the same session keeps the first link — deterministic, the video covers the whole session anyway).
6. **No per-chunk audit** (spec §8): only `learning.proctoring_started` / `learning.proctoring_completed` / `learning.proctoring_override_set` / `learning.proctoring_video_purged`.
7. **Chunk upload failures never invalidate the exam** (partial-success): frontend retries a chunk once, then skips it and continues; the admin detail reports sequence gaps as `chunkIssues` with code `missing_chunk`.
8. **Retention selects by age only, NOT by status** — unlike identity (which required a review decision). Abandoned `'recording'` sessions (browser crash) age out from `completedAt ?? startedAt`; there is no separate reaper (YAGNI, spec §2.7). 365 days, constant `PROCTORING_VIDEO_RETENTION_DAYS` (owner-confirmable, spec §10). Metadata (consent, attemptId) persists forever — only chunk files are deleted and `purgedAt` stamped.
9. **Retention cron ships dormant** behind `PROCTORING_VIDEO_RETENTION_ENABLED=false` (custom boolean parse — NOT `z.coerce.boolean`), cron `PROCTORING_RETENTION_CRON_SCHEDULE='0 5 * * *'` UTC, advisory lock **528_493**, cross-tenant via **`runWithTenantStateAndSave`** (write mode). A scheduler unit test asserts the write-mode call — regression guard for the Plan A CRITICAL finding.
10. **All new Nest providers use explicit `@Inject(...)` on every constructor param** (tsx DI rule, README §2 Known Risks).
11. **Recorder is a pure state machine** (`idle → acquiring → recording → uploading-tail → completed | error`) over injected `getUserMedia` / `createRecorder` / `uploadChunk` — tested with a fake MediaRecorder, zero browser APIs in tests (no-RTL convention).
12. **MediaRecorder survives client-side navigation** via a module-level singleton (`active-recording.ts`): the consent panel lives on the tests list, the attempt page renders the `● REC` indicator and stops + completes the session after submit. Next App Router navigation does not reload the page, so the recorder object persists.
13. **MIME**: chunks allow `{video/webm, video/mp4}` (`video/mp4` = Safari fallback). Frontend strips codec suffixes (`video/webm;codecs=vp8,opus` → `video/webm`) before the upload intent. Per-chunk size is bounded by the existing `SUBMISSION_MAX_BYTES` (10 MB) inside `FilesService.createUploadIntent` — no new size logic.
14. **Permissions** `proctoring.submit` (learner — own session) / `proctoring.read` (admin/methodist — queue, detail, playback); the override endpoint reuses `learners.write`. Migration 0051 role grants mirror 0050: learner → submit; platform_admin/tenant_admin → both; methodist → read.
15. **Existing `/proctoring` page (integrations stub) is untouched.** New routes live under `/admin/proctoring-recordings`; the nav label is «Записи прокторинга» (distinct from the stub's «Прокторинг»).
16. **Testing on this machine (Windows + Cyrillic path):** single files with `--no-file-parallelism`; never the full backend suite locally (CLAUDE.md Gotchas).

---

## File Structure

**Backend:**

- `apps/backend/migrations/0051_learning_proctoring_recordings.sql` — _Create._ Table + 2 column adds + permissions.
- `apps/backend/src/infrastructure/database/mvp-domain-migrations.test.ts` — _Modify._ 0051 describe-block.
- `apps/backend/src/modules/mvp/mvp.types.ts` — _Modify._ `ProctoringRecording` & friends, `GroupCourse.requiresProctoring?`, `Enrollment.proctoringOverride?`.
- `apps/backend/src/modules/mvp/infrastructure/in-memory-mvp.state.ts` — _Modify._ `proctoringRecordings` array.
- `apps/backend/src/modules/mvp/infrastructure/mvp-collections.ts` — _Modify._ `'proctoringRecordings'` key.
- `apps/backend/src/modules/mvp/proctoring/proctoring-requirement.ts` — _Create._ Pure effective-requirement fn.
- `apps/backend/src/modules/mvp/proctoring/proctoring-requirement.test.ts` — _Create._ Override matrix.
- `apps/backend/src/modules/mvp/mvp.service.ts` — _Modify._ Lifecycle + gate + admin views + override.
- `apps/backend/src/modules/mvp/proctoring.service.test.ts` — _Create._ Service unit tests.
- `apps/backend/src/modules/mvp/mvp.dto.ts` — _Modify._ 3 new DTO classes + `requiresProctoring` on group-course DTOs.
- `apps/backend/src/modules/mvp/mvp.dto-validation.test.ts` — _Modify._
- `apps/backend/src/modules/mvp/mvp.controller.ts` — _Modify._ 7 endpoints.
- `apps/backend/src/modules/mvp/mvp.http.integration.test.ts` — _Modify._ Permission boundary.
- `apps/backend/src/modules/mvp/proctoring/proctoring-video-retention.ts` — _Create._ Pure purge-selection fn.
- `apps/backend/src/modules/mvp/proctoring/proctoring-video-retention.test.ts` — _Create._
- `apps/backend/src/modules/mvp/proctoring/proctoring-retention-scanner.service.ts` — _Create._ Per-tenant purge.
- `apps/backend/src/modules/mvp/proctoring/proctoring-retention-scanner.service.test.ts` — _Create._
- `apps/backend/src/modules/mvp/proctoring/proctoring-retention-scheduler.service.ts` — _Create._ Dormant cron.
- `apps/backend/src/modules/mvp/proctoring/proctoring-retention-scheduler.service.test.ts` — _Create._ Write-mode runner guard.
- `apps/backend/src/env.schema.ts` — _Modify._ Two env vars.
- `apps/backend/src/modules/mvp/mvp.module.ts` — _Modify._ Register scanner + scheduler providers.

**Frontend:**

- `apps/frontend/src/features/proctoring/types.ts` — _Create._
- `apps/frontend/src/features/proctoring/api.ts` — _Create._
- `apps/frontend/src/features/proctoring/api.contract.test.ts` — _Create._
- `apps/frontend/src/features/proctoring/format.ts` + `format.test.ts` — _Create._
- `apps/frontend/src/features/proctoring/recorder.ts` + `recorder.test.ts` — _Create._ Pure state machine.
- `apps/frontend/src/features/proctoring/active-recording.ts` — _Create._ Module-level singleton.
- `apps/frontend/src/features/proctoring/hooks.ts` — _Create._
- `apps/frontend/src/features/proctoring/screens.tsx` — _Create._ Consent panel + REC indicator + 2 admin screens.
- `apps/frontend/src/features/test-player/format.ts` + `format.test.ts` — _Modify._ `detectStartGate`.
- `apps/frontend/src/features/test-player/tests-list-screen.tsx` — _Modify._ Proctoring interstitial.
- `apps/frontend/src/features/test-player/test-attempt-screen.tsx` — _Modify._ REC indicator + stop-on-submit.
- `apps/frontend/app/admin/proctoring-recordings/page.tsx` — _Create._
- `apps/frontend/app/admin/proctoring-recordings/[id]/page.tsx` — _Create._
- `apps/frontend/src/features/navigation/model.ts` — _Modify._ routeMeta + navigationModel.
- `apps/frontend/src/e2e/proctoring.e2e.test.ts` — _Create._ Routing smoke.

**Docs/ops:**

- `infra/.env.production.example` — _Modify._ Two dormant env vars.

---

## Verification (final quality gate)

Run after the last task (Cyrillic-path machine: isolated backend files, never the full backend suite):

```bash
pnpm typecheck   # 8/8

pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/proctoring.service.test.ts src/modules/mvp/proctoring/proctoring-requirement.test.ts src/modules/mvp/proctoring/proctoring-video-retention.test.ts src/modules/mvp/proctoring/proctoring-retention-scanner.service.test.ts src/modules/mvp/proctoring/proctoring-retention-scheduler.service.test.ts src/modules/mvp/identity-verification.service.test.ts src/modules/mvp/pre-exam-auth.service.test.ts src/modules/mvp/mvp.dto-validation.test.ts src/modules/mvp/mvp.http.integration.test.ts src/modules/mvp/business-flows.e2e.test.ts --no-file-parallelism

pnpm test:migrations

pnpm test:frontend   # full frontend suite works on this machine

npx eslint apps/backend/src/modules/mvp/proctoring apps/backend/src/modules/mvp/mvp.service.ts apps/backend/src/modules/mvp/mvp.controller.ts apps/backend/src/modules/mvp/mvp.dto.ts apps/frontend/src/features/proctoring apps/frontend/src/features/test-player --max-warnings=0
```

---

## Task 1: Migration 0051 — typed contract + permissions (+ migration test)

**Files:**

- Create: `apps/backend/migrations/0051_learning_proctoring_recordings.sql`
- Modify: `apps/backend/src/infrastructure/database/mvp-domain-migrations.test.ts`

- [ ] **Step 1: Write the failing migration test.** Append to `mvp-domain-migrations.test.ts` (it already defines `migrationFiles`, `migrationSqlByFile`; mirror the `migration 0045` describe-block):

```typescript
describe('Phase 4 Plan B — proctoring recordings (migration 0051)', () => {
  const sql0051 = migrationSqlByFile.get('0051_learning_proctoring_recordings.sql') ?? '';

  it('migration file exists in the chain', () => {
    expect(migrationFiles).toContain('0051_learning_proctoring_recordings.sql');
    expect(sql0051.length).toBeGreaterThan(0);
  });

  it('creates learning.proctoring_recordings with the typed contract columns', () => {
    expect(sql0051).toMatch(
      /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+learning\.proctoring_recordings/i
    );
    for (const column of [
      'tenant_id',
      'learner_id',
      'group_id',
      'course_id',
      'attempt_id',
      'recording_status',
      'consent_at',
      'started_at',
      'completed_at',
      'chunks',
      'purged_at'
    ]) {
      expect(sql0051, `0051 must declare column ${column}`).toMatch(new RegExp(`\\b${column}\\b`));
    }
    expect(sql0051).toMatch(/chunks\s+jsonb\s+NOT\s+NULL\s+DEFAULT\s+'\[\]'::jsonb/i);
  });

  it('adds requires_proctoring to group_courses and proctoring_override to enrollments', () => {
    expect(sql0051).toMatch(
      /ALTER\s+TABLE\s+learning\.group_courses\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+requires_proctoring\s+boolean\s+NOT\s+NULL\s+DEFAULT\s+false/i
    );
    expect(sql0051).toMatch(
      /ALTER\s+TABLE\s+learning\.enrollments\s+ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+proctoring_override\s+text/i
    );
    expect(sql0051).toMatch(/enrollments_proctoring_override_chk/i);
  });

  it('inserts proctoring.submit and proctoring.read permissions with role grants', () => {
    expect(sql0051).toContain("'proctoring.submit'");
    expect(sql0051).toContain("'proctoring.read'");
    expect(sql0051).toMatch(/r\.code\s+IN\s*\('platform_admin',\s*'tenant_admin'\)/i);
    expect(sql0051).toMatch(/r\.code\s*=\s*'learner'\s+AND\s+p\.code\s*=\s*'proctoring\.submit'/i);
    expect(sql0051).toMatch(/r\.code\s*=\s*'methodist'\s+AND\s+p\.code\s*=\s*'proctoring\.read'/i);
  });

  it('seed inserts are idempotent (ON CONFLICT DO NOTHING)', () => {
    expect(sql0051).toMatch(/ON\s+CONFLICT\s*\(id\)\s+DO\s+NOTHING/i);
    expect(sql0051).toMatch(
      /ON\s+CONFLICT\s*\(tenant_id,\s*role_id,\s*permission_id\)\s+DO\s+NOTHING/i
    );
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm test:migrations`
Expected: FAIL — `0051_learning_proctoring_recordings.sql` does not exist.

- [ ] **Step 3: Write the migration**

```sql
-- 0051_learning_proctoring_recordings.sql
-- Phase 4 Plan B — proctoring: webcam video recording of final exams.
--   * learning.group_courses.requires_proctoring — per-group-course toggle.
--   * learning.enrollments.proctoring_override — per-student override ('require'|'exempt'|NULL=inherit).
--   * learning.proctoring_recordings — per-(learner,group,course) recording session; chunk files
--     live in storage.files (jsonb chunks = [{sequence,fileId,uploadedIntentAt}]); metadata
--     (consent, attempt link) persists after the video retention cron purges the files.
--   * iam permissions proctoring.submit / proctoring.read + role grants.
-- Additive + idempotent. Runtime MVP state persists as a JSONB snapshot; these typed
-- columns are the schema contract (0016 rule — domain FKs/flags stay typed). Mirror of 0050.

BEGIN;

ALTER TABLE learning.group_courses
  ADD COLUMN IF NOT EXISTS requires_proctoring boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN learning.group_courses.requires_proctoring IS
  'Phase 4 Plan B: record the final exam on webcam video; MVP JSON store mirrors this field.';

ALTER TABLE learning.enrollments
  ADD COLUMN IF NOT EXISTS proctoring_override text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'enrollments_proctoring_override_chk'
  ) THEN
    ALTER TABLE learning.enrollments
      ADD CONSTRAINT enrollments_proctoring_override_chk
      CHECK (proctoring_override IS NULL OR proctoring_override IN ('require', 'exempt'));
  END IF;
END $$;

COMMENT ON COLUMN learning.enrollments.proctoring_override IS
  'Phase 4 Plan B: per-student proctoring override; NULL inherits group_courses.requires_proctoring.';

CREATE TABLE IF NOT EXISTS learning.proctoring_recordings (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  learner_id text NOT NULL,
  group_id text NOT NULL,
  course_id text NOT NULL,
  attempt_id text,
  recording_status text NOT NULL DEFAULT 'recording',
  consent_at timestamptz NOT NULL,
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  chunks jsonb NOT NULL DEFAULT '[]'::jsonb,
  purged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proctoring_recordings_tenant_learner
  ON learning.proctoring_recordings (tenant_id, learner_id, recording_status);

COMMENT ON TABLE learning.proctoring_recordings IS
  'Phase 4 Plan B: webcam recording session of a final exam (152-ФЗ consent stamped). Chunk files are purged by the video retention cron; the session record persists. MVP JSON store mirrors this collection.';

INSERT INTO iam.permissions (id, code, description)
VALUES
  ('p_proctoring_submit', 'proctoring.submit', 'Start/upload/complete own proctoring recording session'),
  ('p_proctoring_read', 'proctoring.read', 'Read proctoring recordings queue, detail and playback')
ON CONFLICT (id) DO NOTHING;

INSERT INTO iam.role_permissions (id, tenant_id, role_id, permission_id)
SELECT
  concat('rp_', r.id, '_', p.id),
  r.tenant_id,
  r.id,
  p.id
FROM iam.roles r
JOIN iam.permissions p ON TRUE
WHERE r.tenant_id = 'tenant_demo'
  AND (
    r.code IN ('platform_admin', 'tenant_admin')
    OR (r.code = 'learner' AND p.code = 'proctoring.submit')
    OR (r.code = 'methodist' AND p.code = 'proctoring.read')
  )
  AND p.code IN ('proctoring.submit', 'proctoring.read')
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;

COMMIT;
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm test:migrations`
Expected: PASS — new describe green, ordering/duplicate-number checks still green.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/migrations/0051_learning_proctoring_recordings.sql apps/backend/src/infrastructure/database/mvp-domain-migrations.test.ts
git commit -m "feat(migrations): proctoring typed contract — table, toggles, permissions (Phase 4 Plan B)"
```

---

## Task 2: Model + state collection + persistence note

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.types.ts`
- Modify: `apps/backend/src/modules/mvp/infrastructure/in-memory-mvp.state.ts`
- Modify: `apps/backend/src/modules/mvp/infrastructure/mvp-collections.ts`

- [ ] **Step 1: Add the flag + override to existing types** in `mvp.types.ts`. In `GroupCourse` (after `requiresIdentityVerification?`, line ~100):

```typescript
  /** Phase 4 Plan B: record the final exam on webcam video (proctoring). */
  requiresProctoring?: boolean;
```

In `Enrollment` (after `plannedEndAt?`, line ~112):

```typescript
  /** Phase 4 Plan B: per-student proctoring override; undefined inherits GroupCourse.requiresProctoring. */
  proctoringOverride?: ProctoringOverride;
```

- [ ] **Step 2: Add the proctoring types** in `mvp.types.ts` after the `IdentityVerificationView` block (line ~382):

```typescript
export type ProctoringOverride = 'require' | 'exempt';

export type ProctoringRecordingStatus = 'recording' | 'completed';

/** One uploaded (or at least intent-issued) MediaRecorder chunk; the file lives in storage.files. */
export interface ProctoringChunk {
  /** 0-based, monotonically assigned by the client. Gaps = skipped uploads (admin sees them). */
  sequence: number;
  fileId: string;
  uploadedIntentAt: string;
}

/**
 * Phase 4 Plan B: webcam recording session of a final exam, keyed per (learner, group, course).
 * `recordingStatus` is the domain state machine (BaseEntity.status stays the lifecycle 'active').
 * Abandoned sessions (browser crash) remain 'recording' — the retention cron ages them out
 * from `completedAt ?? startedAt`. Metadata persists after the cron purges chunk files.
 */
export interface ProctoringRecording extends BaseEntity {
  learnerId: string;
  groupId: string;
  courseId: string;
  /** Linked by startAttempt when the gated attempt actually starts. */
  attemptId?: string;
  /** 152-ФЗ consent timestamp (consent: true is required to create the session). */
  consentAt: string;
  startedAt: string;
  completedAt?: string;
  chunks: ProctoringChunk[];
  /** Set by the video retention cron when all chunk files were deleted. */
  purgedAt?: string;
}

/** Admin queue view: session + display enrichment. */
export interface ProctoringRecordingView extends ProctoringRecording {
  learnerName: string;
  courseTitle: string;
  attemptStatus?: AttemptStatus;
}

/** A chunk excluded from playback (or missing): code ∈ file_infected | file_scan_failed | file_error | missing_chunk. */
export interface ProctoringChunkIssue {
  sequence: number;
  code: string;
}

export interface ProctoringPlaybackChunk {
  sequence: number;
  fileId: string;
  url: string;
}

/** Admin detail: ordered presigned GET urls of clean chunks + issues (infected / gaps). */
export interface ProctoringRecordingDetail extends ProctoringRecordingView {
  playbackChunks: ProctoringPlaybackChunk[];
  chunkIssues: ProctoringChunkIssue[];
}
```

- [ ] **Step 3: Register the collection in `InMemoryMvpState`** (`in-memory-mvp.state.ts`): add `ProctoringRecording` to the type import block, and the array field after `identityVerifications`:

```typescript
  // Phase 4 Plan B — proctoring recording sessions (webcam video of final exams).
  proctoringRecordings: ProctoringRecording[] = [];
```

- [ ] **Step 4: Register the key in `mvp-collections.ts`** — add `'proctoringRecordings'` right after `'identityVerifications'` in `MVP_COLLECTIONS`.

> ⚠️ Steps 3 and 4 MUST land together — a collection missing from either list is silently lost between HTTP requests (CLAUDE.md).
>
> **Persistence note (verified against code):** `PostgresMvpPersistenceBackend` iterates `MVP_COLLECTIONS` generically (JSONB rows in `learning.mvp_runtime_documents` / `..._stage1_...`) — there is **no per-collection adapter code** to write. `identityVerifications` works exactly this way; the typed table from Task 1 is the schema contract only (0016 rule). Adding the key above IS the whole persistence wiring.

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (8/8).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/mvp/mvp.types.ts apps/backend/src/modules/mvp/infrastructure/in-memory-mvp.state.ts apps/backend/src/modules/mvp/infrastructure/mvp-collections.ts
git commit -m "feat(backend): proctoring recording model + MVP collection registration (Phase 4 Plan B)"
```

---

## Task 3: Effective requirement — pure helper, flag/override wiring

**Files:**

- Create: `apps/backend/src/modules/mvp/proctoring/proctoring-requirement.ts`
- Create: `apps/backend/src/modules/mvp/proctoring/proctoring-requirement.test.ts`
- Modify: `apps/backend/src/modules/mvp/mvp.dto.ts` (`CreateGroupCourseRequest`, `UpdateGroupCourseRequest`)
- Modify: `apps/backend/src/modules/mvp/mvp.service.ts` (`createGroupCourse` / `updateGroupCourse` / `setProctoringOverride`)
- Create: `apps/backend/src/modules/mvp/proctoring.service.test.ts` (harness + override test)

- [ ] **Step 1: Write the failing pure-function matrix test** (`proctoring-requirement.test.ts`):

```typescript
import { describe, expect, it } from 'vitest';

import { resolveProctoringRequirement } from './proctoring-requirement.js';

describe('resolveProctoringRequirement (override × group-course flag matrix)', () => {
  it.each([
    // [override, groupCourseFlag, expected]
    [undefined, false, false],
    [undefined, true, true],
    ['require', false, true],
    ['require', true, true],
    ['exempt', false, false],
    ['exempt', true, false]
  ] as const)('override=%s flag=%s → %s', (override, flag, expected) => {
    expect(resolveProctoringRequirement(override, flag)).toBe(expected);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/proctoring/proctoring-requirement.test.ts --no-file-parallelism`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement** `proctoring-requirement.ts` (dependency-free; the `ProctoringOverride` union is declared structurally to avoid importing `mvp.types`):

```typescript
/**
 * Phase 4 Plan B: effective proctoring requirement for a learner on a course.
 * `enrollment.proctoringOverride ?? group-course flag` (spec §2.6):
 *   'require' forces it on, 'exempt' forces it off, undefined inherits.
 */
export function resolveProctoringRequirement(
  override: 'require' | 'exempt' | undefined,
  groupCourseRequiresProctoring: boolean
): boolean {
  if (override === 'require') return true;
  if (override === 'exempt') return false;
  return groupCourseRequiresProctoring;
}
```

Run the matrix test again → PASS (6 cases).

- [ ] **Step 4: Add `requiresProctoring` to the two group-course DTOs** in `mvp.dto.ts`, directly after `requiresIdentityVerification` in BOTH `CreateGroupCourseRequest` and `UpdateGroupCourseRequest`:

```typescript
  @IsOptional()
  @IsBoolean()
  requiresProctoring?: boolean;
```

- [ ] **Step 5: Persist the flag in `MvpService`.** In `createGroupCourse` (line ~1311), extend the entity literal — directly after the `requiresIdentityVerification` conditional spread:

```typescript
      ...(request.requiresProctoring !== undefined
        ? { requiresProctoring: request.requiresProctoring }
        : {})
```

In `updateGroupCourse` (line ~1349), after the `requiresIdentityVerification` block:

```typescript
if (request.requiresProctoring !== undefined) {
  current.requiresProctoring = request.requiresProctoring;
}
```

- [ ] **Step 6: Write the failing service test for the override.** Create `proctoring.service.test.ts` with the harness copied from `identity-verification.service.test.ts` (same imports, `T`/`ADMIN`/`ctx`, `makeFilesMock`, 6-arg `MvpService`) plus a seed helper used by ALL later tasks:

```typescript
import { EventEmitter2 } from '@nestjs/event-emitter';
import { describe, expect, it, vi } from 'vitest';

import { InMemoryMvpState } from './infrastructure/in-memory-mvp.state.js';
import { MvpService } from './mvp.service.js';
import { TenantScopedRepository } from '../../infrastructure/database/tenant-repository.js';
import { AuditService } from '../audit/audit.service.js';

import type { RequestContext } from '../../common/context/request-context.js';
import type { DocumentsService } from '../documents/documents.service.js';
import type { FilesService } from '../files/files.service.js';

const noopDocumentsService = {
  listDocuments: () => ({ items: [], page: 1, pageSize: 50, total: 0 })
} as unknown as DocumentsService;

const T = 'tenant_demo';
const ADMIN = 'u_tenant_admin';
const ctx: RequestContext = {
  requestId: 'req_1',
  correlationId: 'corr_1',
  tenantId: T,
  userId: ADMIN,
  ip: '127.0.0.1',
  userAgent: 'vitest'
};
/** ctx variant for learner 'u_l1' (IAM-linked seeds). */
const ctxL1: RequestContext = { ...ctx, userId: 'u_l1' };

let fileSeq = 0;
function makeFilesMock() {
  return {
    createUploadIntent: vi.fn(async () => ({
      fileId: `file_${(fileSeq += 1)}`,
      uploadUrl: 'https://minio.local/PUT-signed',
      storageKey: 'proctoring/tenant_demo/x_chunk.webm',
      expiresInSeconds: 900
    })),
    getAntivirusStatuses: vi.fn(
      async (_t: string, ids: string[]) => new Map(ids.map((id) => [id, 'clean']))
    ),
    createDownloadUrl: vi.fn(async () => 'https://minio.local/GET-signed'),
    ensureMaterialLink: async () => undefined
  } as unknown as FilesService & {
    createUploadIntent: ReturnType<typeof vi.fn>;
    getAntivirusStatuses: ReturnType<typeof vi.fn>;
    createDownloadUrl: ReturnType<typeof vi.fn>;
  };
}

function makeService(files = makeFilesMock()) {
  return {
    files,
    service: new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      new AuditService(),
      noopDocumentsService,
      files,
      new EventEmitter2()
    )
  };
}

/**
 * course → group → groupCourse(requiresProctoring) → learner(linked u_l1) → enrollment → bank → final test.
 * Mirrors identity-verification.service.test.ts seedFinalExam.
 */
function seedProctoredExam(service: MvpService, requiresProctoring: boolean) {
  const course = service.createCourse(T, ADMIN, { code: 'C1', title: 'Course' }, ctx);
  const group = service.createGroup(T, ADMIN, { code: 'G1', name: 'Group' }, ctx);
  const groupCourse = service.createGroupCourse(T, {
    groupId: group.id,
    courseId: course.id,
    requiresProctoring
  });
  const learner = service.createLearner(
    T,
    ADMIN,
    { code: 'L1', name: 'Jane Doe', linkedIamUserId: 'u_l1' },
    ctx
  );
  const enrollment = service.createEnrollment(
    T,
    ADMIN,
    { groupId: group.id, learnerId: learner.id },
    ctx
  );
  const bank = service.createQuestionBank(T, ADMIN, { title: 'Bank', courseId: course.id }, ctx);
  const q = service.createQuestion(
    T,
    ADMIN,
    {
      questionBankId: bank.id,
      type: 'single_choice',
      title: 'Q',
      score: 1,
      options: [
        { text: 'A', isCorrect: true },
        { text: 'B', isCorrect: false }
      ]
    } as never,
    ctx
  );
  const test = service.createTest(
    T,
    ADMIN,
    { courseId: course.id, questionBankId: bank.id, title: 'Final', rules: { attemptLimit: 5 } },
    ctx
  );
  service.addTestQuestions(T, test.id, [q.id]);
  return { course, group, groupCourse, learner, enrollment, test };
}

const startArgs = (test: { id: string }, enrollment: { id: string; learnerId: string }) => ({
  testId: test.id,
  enrollmentId: enrollment.id,
  learnerId: enrollment.learnerId
});

function getResponseOf(err: unknown): { code?: string; message?: string } {
  return (err as { getResponse: () => { code?: string; message?: string } }).getResponse();
}

describe('proctoring override (per-student switch)', () => {
  it('setProctoringOverride stores require/exempt and null clears back to inherit', () => {
    const { service } = makeService();
    const { enrollment } = seedProctoredExam(service, false);

    const required = service.setProctoringOverride(
      T,
      ADMIN,
      enrollment.id,
      { override: 'require' },
      ctx
    );
    expect(required.proctoringOverride).toBe('require');

    const exempt = service.setProctoringOverride(
      T,
      ADMIN,
      enrollment.id,
      { override: 'exempt' },
      ctx
    );
    expect(exempt.proctoringOverride).toBe('exempt');

    const inherited = service.setProctoringOverride(
      T,
      ADMIN,
      enrollment.id,
      { override: null },
      ctx
    );
    expect(inherited.proctoringOverride).toBeUndefined();
  });

  it('setProctoringOverride on an unknown enrollment throws', () => {
    const { service } = makeService();
    expect(() =>
      service.setProctoringOverride(T, ADMIN, 'enr_ghost', { override: 'require' }, ctx)
    ).toThrow();
  });

  it('createGroupCourse / updateGroupCourse persist requiresProctoring', () => {
    const { service } = makeService();
    const { groupCourse } = seedProctoredExam(service, true);
    expect(groupCourse.requiresProctoring).toBe(true);
    const updated = service.updateGroupCourse(
      T,
      ADMIN,
      groupCourse.id,
      { requiresProctoring: false },
      ctx
    );
    expect(updated.requiresProctoring).toBe(false);
  });
});

void startArgs; // used by gate tests added in Task 6
void ctxL1; // used by lifecycle tests added in Task 4
void getResponseOf; // used by lifecycle tests added in Task 4
```

- [ ] **Step 7: Run to verify failure**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/proctoring.service.test.ts --no-file-parallelism`
Expected: FAIL — `setProctoringOverride` does not exist (the DTO/flag wiring compiles already).

- [ ] **Step 8: Implement `setProctoringOverride`** in `mvp.service.ts`. Open a new section after `getMyIdentityVerification` (line ~3608):

```typescript
  // ─── Phase 4 Plan B: proctoring (webcam video recording of final exams) ───

  /** Per-student proctoring switch (learners.write): 'require' | 'exempt' | null = inherit group-course. */
  setProctoringOverride(
    tenantId: string,
    actorId: string | undefined,
    enrollmentId: string,
    request: { override: ProctoringOverride | null },
    context: RequestContext
  ): Enrollment {
    const enrollment = this.getById(this.state.enrollments, tenantId, enrollmentId);
    const old = { proctoringOverride: enrollment.proctoringOverride ?? null };
    if (request.override === null) {
      delete enrollment.proctoringOverride;
    } else {
      enrollment.proctoringOverride = request.override;
    }
    enrollment.updatedAt = this.now();
    this.audit(
      tenantId,
      actorId,
      'learning.proctoring_override_set',
      'learning.enrollment',
      enrollment.id,
      old,
      { proctoringOverride: enrollment.proctoringOverride ?? null },
      context
    );
    return enrollment;
  }
```

Add `ProctoringOverride` (plus, for later tasks, `ProctoringRecording`, `ProctoringChunk`, `ProctoringRecordingView`, `ProctoringRecordingDetail`, `ProctoringChunkIssue`, `ProctoringPlaybackChunk`, `ProctoringRecordingStatus`) to the `mvp.types.js` type import in `mvp.service.ts`.

- [ ] **Step 9: Run to verify pass + lint**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/proctoring.service.test.ts src/modules/mvp/proctoring/proctoring-requirement.test.ts --no-file-parallelism` → PASS.
Run: `npx eslint apps/backend/src/modules/mvp/proctoring apps/backend/src/modules/mvp/proctoring.service.test.ts apps/backend/src/modules/mvp/mvp.service.ts apps/backend/src/modules/mvp/mvp.dto.ts --max-warnings=0` → clean.

- [ ] **Step 10: Commit**

```bash
git add apps/backend/src/modules/mvp/proctoring apps/backend/src/modules/mvp/proctoring.service.test.ts apps/backend/src/modules/mvp/mvp.service.ts apps/backend/src/modules/mvp/mvp.dto.ts
git commit -m "feat(backend): proctoring requirement resolution + group-course flag + per-student override (Phase 4 Plan B)"
```

---

## Task 4: Lifecycle — start session (consent, requirement check, idempotent reuse)

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.service.ts`
- Modify: `apps/backend/src/modules/mvp/proctoring.service.test.ts`

- [ ] **Step 1: Write the failing tests.** Append to `proctoring.service.test.ts` (remove the `void ctxL1;` / `void getResponseOf;` suppressions once used):

```typescript
describe('proctoring lifecycle — start session', () => {
  it('consent !== true → 400 consent_required', () => {
    const { service } = makeService();
    const { course, enrollment } = seedProctoredExam(service, true);
    let err: unknown;
    try {
      service.startProctoringRecording(
        T,
        'u_l1',
        { enrollmentId: enrollment.id, courseId: course.id, consent: false },
        ctxL1
      );
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(getResponseOf(err).code).toBe('consent_required');
  });

  it('proctoring not required (flag off, no override) → 400 proctoring_not_required', () => {
    const { service } = makeService();
    const { course, enrollment } = seedProctoredExam(service, false);
    let err: unknown;
    try {
      service.startProctoringRecording(
        T,
        'u_l1',
        { enrollmentId: enrollment.id, courseId: course.id, consent: true },
        ctxL1
      );
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(getResponseOf(err).code).toBe('proctoring_not_required');
  });

  it("override 'exempt' beats the group-course flag → proctoring_not_required", () => {
    const { service } = makeService();
    const { course, enrollment } = seedProctoredExam(service, true);
    service.setProctoringOverride(T, ADMIN, enrollment.id, { override: 'exempt' }, ctx);
    let err: unknown;
    try {
      service.startProctoringRecording(
        T,
        'u_l1',
        { enrollmentId: enrollment.id, courseId: course.id, consent: true },
        ctxL1
      );
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(getResponseOf(err).code).toBe('proctoring_not_required');
  });

  it("override 'require' starts a session even when the group-course flag is off", () => {
    const { service } = makeService();
    const { course, enrollment } = seedProctoredExam(service, false);
    service.setProctoringOverride(T, ADMIN, enrollment.id, { override: 'require' }, ctx);
    const recording = service.startProctoringRecording(
      T,
      'u_l1',
      { enrollmentId: enrollment.id, courseId: course.id, consent: true },
      ctxL1
    );
    expect(recording.recordingStatus).toBe('recording');
  });

  it('starts a recording session: status, consentAt/startedAt stamps, empty chunks, group derived from enrollment', () => {
    const { service } = makeService();
    const { course, group, enrollment, learner } = seedProctoredExam(service, true);
    const recording = service.startProctoringRecording(
      T,
      'u_l1',
      { enrollmentId: enrollment.id, courseId: course.id, consent: true },
      ctxL1
    );
    expect(recording.recordingStatus).toBe('recording');
    expect(recording.consentAt).toBeTruthy();
    expect(recording.startedAt).toBeTruthy();
    expect(recording.chunks).toEqual([]);
    expect(recording.learnerId).toBe(learner.id);
    expect(recording.groupId).toBe(group.id);
    expect(recording.courseId).toBe(course.id);
  });

  it('is idempotent: a second start while a session is active returns the same record', () => {
    const { service } = makeService();
    const { course, enrollment } = seedProctoredExam(service, true);
    const first = service.startProctoringRecording(
      T,
      'u_l1',
      { enrollmentId: enrollment.id, courseId: course.id, consent: true },
      ctxL1
    );
    const second = service.startProctoringRecording(
      T,
      'u_l1',
      { enrollmentId: enrollment.id, courseId: course.id, consent: true },
      ctxL1
    );
    expect(second.id).toBe(first.id);
  });

  it('a foreign actor without delegation cannot start on someone else’s enrollment', () => {
    const { service } = makeService();
    const { course, enrollment } = seedProctoredExam(service, true);
    expect(() =>
      service.startProctoringRecording(
        T,
        'u_stranger',
        { enrollmentId: enrollment.id, courseId: course.id, consent: true },
        { ...ctx, userId: 'u_stranger' }
      )
    ).toThrow();
  });

  it('course not linked to the enrollment group → domain_rule_violation', () => {
    const { service } = makeService();
    const { enrollment } = seedProctoredExam(service, true);
    const other = service.createCourse(T, ADMIN, { code: 'C2', title: 'Other' }, ctx);
    let err: unknown;
    try {
      service.startProctoringRecording(
        T,
        'u_l1',
        { enrollmentId: enrollment.id, courseId: other.id, consent: true },
        ctxL1
      );
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(getResponseOf(err).code).toBe('domain_rule_violation');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/proctoring.service.test.ts --no-file-parallelism`
Expected: FAIL — `startProctoringRecording` does not exist.

- [ ] **Step 3: Implement.** In `mvp.service.ts`, add a module-level constant next to `IDENTITY_MIME_ALLOWLIST` (line ~222):

```typescript
/** Phase 4 Plan B: proctoring chunks are browser MediaRecorder output only (mp4 = Safari fallback). */
const PROCTORING_MIME_ALLOWLIST: ReadonlySet<string> = new Set(['video/webm', 'video/mp4']);
```

Add `resolveProctoringRequirement` to the imports:

```typescript
import { resolveProctoringRequirement } from './proctoring/proctoring-requirement.js';
```

Then add inside the proctoring section (after `setProctoringOverride` from Task 3):

```typescript
  /** Effective requirement: enrollment override ?? group-course flag (final exams of this course). */
  private isProctoringRequired(tenantId: string, enrollment: Enrollment, courseId: string): boolean {
    const gc = this.state.groupCourses.find(
      (item) =>
        item.tenantId === tenantId && item.groupId === enrollment.groupId && item.courseId === courseId
    );
    return resolveProctoringRequirement(enrollment.proctoringOverride, gc?.requiresProctoring === true);
  }

  /** The learner's open session for this group+course (purged sessions never count). */
  private findActiveProctoringRecording(
    tenantId: string,
    learnerId: string,
    groupId: string,
    courseId: string
  ): ProctoringRecording | undefined {
    return this.state.proctoringRecordings.find(
      (r) =>
        r.tenantId === tenantId &&
        r.learnerId === learnerId &&
        r.groupId === groupId &&
        r.courseId === courseId &&
        r.recordingStatus === 'recording' &&
        !r.purgedAt
    );
  }

  /**
   * Start (or idempotently resume) a recording session BEFORE the exam attempt (spec §2.5).
   * Takes enrollmentId (not groupId) — the only id the test-player has; group derives from it.
   */
  startProctoringRecording(
    tenantId: string,
    actorId: string | undefined,
    request: { enrollmentId: string; courseId: string; consent: boolean },
    context: RequestContext
  ): ProctoringRecording {
    if (request.consent !== true) {
      throw new BadRequestException({
        code: 'consent_required',
        message: 'Consent to video recording is required (152-ФЗ)'
      });
    }
    const enrollment = this.getById(this.state.enrollments, tenantId, request.enrollmentId);
    this.assertActorMatchesLearnerIamLink(
      tenantId,
      actorId,
      enrollment.learnerId,
      context.permissions
    );
    const linked = this.state.groupCourses.some(
      (item) =>
        item.tenantId === tenantId &&
        item.groupId === enrollment.groupId &&
        item.courseId === request.courseId
    );
    if (!linked) {
      throw new PreconditionFailedException({
        code: 'domain_rule_violation',
        message: 'Enrollment group is not linked to the course'
      });
    }
    if (!this.isProctoringRequired(tenantId, enrollment, request.courseId)) {
      throw new BadRequestException({
        code: 'proctoring_not_required',
        message: 'Proctoring is not required for this learner and course'
      });
    }
    const active = this.findActiveProctoringRecording(
      tenantId,
      enrollment.learnerId,
      enrollment.groupId,
      request.courseId
    );
    if (active) return active; // idempotent resume — chunks carry nextSequence for the client
    const now = this.now();
    const entity: ProctoringRecording = {
      id: this.id('prec'),
      tenantId,
      learnerId: enrollment.learnerId,
      groupId: enrollment.groupId,
      courseId: request.courseId,
      recordingStatus: 'recording',
      consentAt: now,
      startedAt: now,
      chunks: [],
      status: 'active',
      createdAt: now,
      updatedAt: now
    };
    this.state.proctoringRecordings.push(entity);
    this.audit(
      tenantId,
      actorId,
      'learning.proctoring_started',
      'learning.proctoring_recording',
      entity.id,
      undefined,
      { id: entity.id, learnerId: entity.learnerId, courseId: entity.courseId, consentAt: now },
      context
    );
    return entity;
  }
```

> Reuse existing imports: `BadRequestException`, `ConflictException`, `PreconditionFailedException` are already imported in `mvp.service.ts`.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/proctoring.service.test.ts --no-file-parallelism`
Expected: PASS (Task 3 + Task 4 cases).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/mvp/mvp.service.ts apps/backend/src/modules/mvp/proctoring.service.test.ts
git commit -m "feat(backend): proctoring session start — consent, requirement check, idempotent reuse (Phase 4 Plan B)"
```

---

## Task 5: Lifecycle — chunk upload intent, complete, getActive

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.service.ts`
- Modify: `apps/backend/src/modules/mvp/proctoring.service.test.ts`

- [ ] **Step 1: Write the failing tests.** Append:

```typescript
describe('proctoring lifecycle — chunks, complete, active', () => {
  function startSession(service: MvpService) {
    const seed = seedProctoredExam(service, true);
    const recording = service.startProctoringRecording(
      T,
      'u_l1',
      { enrollmentId: seed.enrollment.id, courseId: seed.course.id, consent: true },
      ctxL1
    );
    return { ...seed, recording };
  }

  it('issues an upload intent with the proctoring prefix and webm/mp4 allowlist, registers the chunk', async () => {
    const { service, files } = makeService();
    const { recording } = startSession(service);
    const intent = await service.createProctoringChunkUploadIntent(
      T,
      'u_l1',
      recording.id,
      { sequence: 0, originalName: 'chunk-0.webm', contentType: 'video/webm', sizeBytes: 2048 },
      ctxL1
    );
    expect(files.createUploadIntent).toHaveBeenCalledWith(
      T,
      expect.objectContaining({ contentType: 'video/webm' }),
      expect.objectContaining({ keyPrefix: 'proctoring' })
    );
    const opts = files.createUploadIntent.mock.calls[0]![2] as {
      mimeAllowlist: ReadonlySet<string>;
    };
    expect(opts.mimeAllowlist.has('video/webm')).toBe(true);
    expect(opts.mimeAllowlist.has('video/mp4')).toBe(true);
    expect(opts.mimeAllowlist.has('image/jpeg')).toBe(false);
    expect(recording.chunks).toHaveLength(1);
    expect(recording.chunks[0]).toMatchObject({ sequence: 0, fileId: intent.fileId });
    expect(recording.chunks[0]!.uploadedIntentAt).toBeTruthy();
  });

  it('duplicate sequence → 409 proctoring_chunk_duplicate', async () => {
    const { service } = makeService();
    const { recording } = startSession(service);
    await service.createProctoringChunkUploadIntent(
      T,
      'u_l1',
      recording.id,
      { sequence: 0, originalName: 'chunk-0.webm', contentType: 'video/webm', sizeBytes: 2048 },
      ctxL1
    );
    let err: unknown;
    try {
      await service.createProctoringChunkUploadIntent(
        T,
        'u_l1',
        recording.id,
        { sequence: 0, originalName: 'chunk-0r.webm', contentType: 'video/webm', sizeBytes: 1024 },
        ctxL1
      );
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(getResponseOf(err).code).toBe('proctoring_chunk_duplicate');
  });

  it('chunk intent on a completed session → 412 proctoring_recording_not_active', async () => {
    const { service } = makeService();
    const { recording } = startSession(service);
    service.completeProctoringRecording(T, 'u_l1', recording.id, ctxL1);
    let err: unknown;
    try {
      await service.createProctoringChunkUploadIntent(
        T,
        'u_l1',
        recording.id,
        { sequence: 1, originalName: 'chunk-1.webm', contentType: 'video/webm', sizeBytes: 1024 },
        ctxL1
      );
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(getResponseOf(err).code).toBe('proctoring_recording_not_active');
  });

  it('complete stamps completedAt and is idempotent', () => {
    const { service } = makeService();
    const { recording } = startSession(service);
    const done = service.completeProctoringRecording(T, 'u_l1', recording.id, ctxL1);
    expect(done.recordingStatus).toBe('completed');
    expect(done.completedAt).toBeTruthy();
    const again = service.completeProctoringRecording(T, 'u_l1', recording.id, ctxL1);
    expect(again.id).toBe(done.id);
    expect(again.completedAt).toBe(done.completedAt);
  });

  it('getActive returns the session + nextSequence = maxSeq + 1; null when no active session', async () => {
    const { service } = makeService();
    const { recording, enrollment, course } = startSession(service);
    await service.createProctoringChunkUploadIntent(
      T,
      'u_l1',
      recording.id,
      { sequence: 0, originalName: 'c0.webm', contentType: 'video/webm', sizeBytes: 10 },
      ctxL1
    );
    await service.createProctoringChunkUploadIntent(
      T,
      'u_l1',
      recording.id,
      { sequence: 4, originalName: 'c4.webm', contentType: 'video/webm', sizeBytes: 10 },
      ctxL1
    );
    const active = service.getMyActiveProctoringRecording(
      T,
      'u_l1',
      { enrollmentId: enrollment.id, courseId: course.id },
      ctxL1
    );
    expect(active?.recording.id).toBe(recording.id);
    expect(active?.nextSequence).toBe(5);

    service.completeProctoringRecording(T, 'u_l1', recording.id, ctxL1);
    expect(
      service.getMyActiveProctoringRecording(
        T,
        'u_l1',
        { enrollmentId: enrollment.id, courseId: course.id },
        ctxL1
      )
    ).toBeNull();
  });

  it('a fresh session has nextSequence 0', () => {
    const { service } = makeService();
    const { enrollment, course } = startSession(service);
    const active = service.getMyActiveProctoringRecording(
      T,
      'u_l1',
      { enrollmentId: enrollment.id, courseId: course.id },
      ctxL1
    );
    expect(active?.nextSequence).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure** (same vitest command as Task 4). Expected: FAIL — methods missing.

- [ ] **Step 3: Implement** in `mvp.service.ts` (proctoring section):

```typescript
  /**
   * Presigned PUT for one MediaRecorder chunk + registration (own active session only).
   * No per-chunk audit (spec §8 — a 30-second timeslice would flood the log).
   */
  async createProctoringChunkUploadIntent(
    tenantId: string,
    actorId: string | undefined,
    recordingId: string,
    request: { sequence: number; originalName: string; contentType: string; sizeBytes: number },
    context: RequestContext
  ): Promise<UploadIntent> {
    const record = this.getById(this.state.proctoringRecordings, tenantId, recordingId);
    this.assertActorMatchesLearnerIamLink(tenantId, actorId, record.learnerId, context.permissions);
    if (record.recordingStatus !== 'recording') {
      throw new PreconditionFailedException({
        code: 'proctoring_recording_not_active',
        message: 'Chunks can only be uploaded to an active recording session'
      });
    }
    if (record.chunks.some((c) => c.sequence === request.sequence)) {
      throw new ConflictException({
        code: 'proctoring_chunk_duplicate',
        message: 'A chunk with this sequence is already registered'
      });
    }
    const intent = await this.filesService.createUploadIntent(
      tenantId,
      {
        originalName: request.originalName,
        contentType: request.contentType,
        sizeBytes: request.sizeBytes
      },
      { keyPrefix: 'proctoring', mimeAllowlist: PROCTORING_MIME_ALLOWLIST }
    );
    const now = this.now();
    record.chunks.push({ sequence: request.sequence, fileId: intent.fileId, uploadedIntentAt: now });
    record.updatedAt = now;
    return intent;
  }

  /** Stop the session (idempotent): recording → completed, completedAt stamped once. */
  completeProctoringRecording(
    tenantId: string,
    actorId: string | undefined,
    recordingId: string,
    context: RequestContext
  ): ProctoringRecording {
    const record = this.getById(this.state.proctoringRecordings, tenantId, recordingId);
    this.assertActorMatchesLearnerIamLink(tenantId, actorId, record.learnerId, context.permissions);
    if (record.recordingStatus === 'completed') return record;
    const now = this.now();
    record.recordingStatus = 'completed';
    record.completedAt = now;
    record.updatedAt = now;
    this.audit(
      tenantId,
      actorId,
      'learning.proctoring_completed',
      'learning.proctoring_recording',
      record.id,
      { recordingStatus: 'recording' },
      { recordingStatus: 'completed', completedAt: now, chunkCount: record.chunks.length },
      context
    );
    return record;
  }

  /** Resume support: the actor's active session for the enrollment+course + next chunk sequence. */
  getMyActiveProctoringRecording(
    tenantId: string,
    actorId: string | undefined,
    query: { enrollmentId: string; courseId: string },
    context: RequestContext
  ): { recording: ProctoringRecording; nextSequence: number } | null {
    const enrollment = this.getById(this.state.enrollments, tenantId, query.enrollmentId);
    this.assertActorMatchesLearnerIamLink(
      tenantId,
      actorId,
      enrollment.learnerId,
      context.permissions
    );
    const active = this.findActiveProctoringRecording(
      tenantId,
      enrollment.learnerId,
      enrollment.groupId,
      query.courseId
    );
    if (!active) return null;
    const maxSequence = active.chunks.reduce((max, c) => Math.max(max, c.sequence), -1);
    return { recording: active, nextSequence: maxSequence + 1 };
  }
```

- [ ] **Step 4: Run to verify pass** (same command) → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/mvp/mvp.service.ts apps/backend/src/modules/mvp/proctoring.service.test.ts
git commit -m "feat(backend): proctoring chunk upload intents + complete + resume lookup (Phase 4 Plan B)"
```

---

## Task 6: The exam gate — `assertProctoringGate` + attemptId linking

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.service.ts`
- Modify: `apps/backend/src/modules/mvp/proctoring.service.test.ts`

- [ ] **Step 1: Write the failing gate tests.** Append (and remove the now-used `void startArgs;` suppression left by Task 3):

```typescript
describe('proctoring gate (5th assert in startAttempt)', () => {
  it('does NOT gate when proctoring is not required', () => {
    const { service } = makeService();
    const { test, enrollment } = seedProctoredExam(service, false);
    expect(() => service.startAttempt(T, 'u_l1', startArgs(test, enrollment), ctxL1)).not.toThrow();
  });

  it('blocks the final exam with 412 proctoring_required until a session is active', () => {
    const { service } = makeService();
    const { test, enrollment } = seedProctoredExam(service, true);
    let err: unknown;
    try {
      service.startAttempt(T, 'u_l1', startArgs(test, enrollment), ctxL1);
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect((err as { getStatus: () => number }).getStatus()).toBe(412);
    expect(getResponseOf(err).code).toBe('proctoring_required');
  });

  it('gate message collides with NEITHER the Wave 1 nor the Plan A frontend regex', () => {
    const { service } = makeService();
    const { test, enrollment } = seedProctoredExam(service, true);
    let err: unknown;
    try {
      service.startAttempt(T, 'u_l1', startArgs(test, enrollment), ctxL1);
    } catch (e) {
      err = e;
    }
    const message = getResponseOf(err).message ?? '';
    expect(message.length).toBeGreaterThan(0);
    // Wave 1 pre-exam-auth interstitial regex (tests-list-screen.tsx)
    expect(/pre_exam_auth_required|identity verification is required/i.test(message)).toBe(false);
    // Plan A identity interstitial regex
    expect(/identity_verification_required|identity confirmation by document/i.test(message)).toBe(
      false
    );
    // …and it DOES match its own interstitial regex
    expect(/proctoring_required|video recording must be active/i.test(message)).toBe(true);
  });

  it('an active recording session opens the gate and gets attemptId linked', () => {
    const { service } = makeService();
    const { test, course, enrollment } = seedProctoredExam(service, true);
    const recording = service.startProctoringRecording(
      T,
      'u_l1',
      { enrollmentId: enrollment.id, courseId: course.id, consent: true },
      ctxL1
    );
    const attempt = service.startAttempt(T, 'u_l1', startArgs(test, enrollment), ctxL1);
    expect(recording.attemptId).toBe(attempt.id);
  });

  it('a completed (not active) session does not open the gate', () => {
    const { service } = makeService();
    const { test, course, enrollment } = seedProctoredExam(service, true);
    const recording = service.startProctoringRecording(
      T,
      'u_l1',
      { enrollmentId: enrollment.id, courseId: course.id, consent: true },
      ctxL1
    );
    service.completeProctoringRecording(T, 'u_l1', recording.id, ctxL1);
    let err: unknown;
    try {
      service.startAttempt(T, 'u_l1', startArgs(test, enrollment), ctxL1);
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(getResponseOf(err).code).toBe('proctoring_required');
  });

  it("override 'exempt' disables the gate even when the group-course flag is on", () => {
    const { service } = makeService();
    const { test, enrollment } = seedProctoredExam(service, true);
    service.setProctoringOverride(T, ADMIN, enrollment.id, { override: 'exempt' }, ctx);
    expect(() => service.startAttempt(T, 'u_l1', startArgs(test, enrollment), ctxL1)).not.toThrow();
  });

  it("override 'require' gates an exam whose group-course flag is off", () => {
    const { service } = makeService();
    const { test, enrollment } = seedProctoredExam(service, false);
    service.setProctoringOverride(T, ADMIN, enrollment.id, { override: 'require' }, ctx);
    let err: unknown;
    try {
      service.startAttempt(T, 'u_l1', startArgs(test, enrollment), ctxL1);
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(getResponseOf(err).code).toBe('proctoring_required');
  });

  it('module (intermediate) tests are never gated', () => {
    const { service } = makeService();
    const seed = seedProctoredExam(service, true);
    // A second test bound to a module of the course — moduleId set ⇒ not a final exam.
    // Canonical module seeding (module-gating.service.test.ts seedCourseWithModules/makeTest).
    const version = service.createCourseVersion(T, seed.course.id);
    const mod = service.createModule(
      T,
      ADMIN,
      { courseVersionId: version.id, title: 'Module 1', minViewSeconds: 0, isRequired: true },
      ctx
    );
    const bank2 = service.createQuestionBank(T, ADMIN, { title: 'B2' }, ctx);
    const q2 = service.createQuestion(
      T,
      ADMIN,
      {
        questionBankId: bank2.id,
        type: 'single_choice',
        title: 'Q2',
        score: 1,
        options: [
          { text: 'A', isCorrect: true },
          { text: 'B', isCorrect: false }
        ]
      } as never,
      ctx
    );
    const moduleTest = service.createTest(
      T,
      ADMIN,
      {
        courseId: seed.course.id,
        questionBankId: bank2.id,
        title: 'Module test',
        moduleId: mod.id,
        rules: { attemptLimit: 5, passingScore: 0 }
      },
      ctx
    );
    service.addTestQuestions(T, moduleTest.id, [q2.id]);
    expect(() =>
      service.startAttempt(T, 'u_l1', startArgs(moduleTest, seed.enrollment), ctxL1)
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Run to verify failure** (same vitest command). Expected: gate tests FAIL — attempts start unguarded / no linking.

- [ ] **Step 3: Implement.** In `mvp.service.ts`, add after `findActiveProctoringRecording`:

```typescript
  /**
   * Phase 4 Plan B gate (5th assert). Final/course-level exams only (no moduleId), only when
   * the effective requirement (override ?? group-course flag) is on. Passes when an active
   * recording session exists for (learner, group, course).
   * NB: the message deliberately avoids "identity verification is required" (Wave 1 regex)
   * and "identity confirmation by document" (Plan A regex) — the frontend matches err.message.
   */
  private assertProctoringGate(tenantId: string, enrollment: Enrollment, test: TestEntity): void {
    if (test.moduleId) return;
    if (!this.isProctoringRequired(tenantId, enrollment, test.courseId)) return;
    if (
      this.findActiveProctoringRecording(
        tenantId,
        enrollment.learnerId,
        enrollment.groupId,
        test.courseId
      )
    )
      return;
    throw new PreconditionFailedException({
      code: 'proctoring_required',
      message: 'Video recording must be active before starting this exam'
    });
  }
```

Wire into `startAttempt` (line ~2923), directly after the identity gate:

```typescript
// Phase 4 Plan A: documentary identity (selfie+passport) — per-learner.
this.assertIdentityVerificationGate(tenantId, enrollment, test);
// Phase 4 Plan B: webcam recording must be running for proctored finals.
this.assertProctoringGate(tenantId, enrollment, test);
```

And link the recording after the attempt entity is pushed (after `this.state.attempts.push(entity);`, before the audit call):

```typescript
// Phase 4 Plan B: link the running recording session to its (first) attempt.
const activeProctoringRecording = this.findActiveProctoringRecording(
  tenantId,
  learnerId,
  enrollment.groupId,
  test.courseId
);
if (activeProctoringRecording && !activeProctoringRecording.attemptId) {
  activeProctoringRecording.attemptId = entity.id;
  activeProctoringRecording.updatedAt = startedAt;
}
```

- [ ] **Step 4: Run target + regression**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/proctoring.service.test.ts --no-file-parallelism` → PASS.
Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/identity-verification.service.test.ts src/modules/mvp/pre-exam-auth.service.test.ts src/modules/mvp/module-gating.service.test.ts src/modules/mvp/test-player.service.test.ts src/modules/mvp/business-flows.e2e.test.ts --no-file-parallelism`
Expected: PASS (no regression — existing seeds have `requiresProctoring` undefined ⇒ gate inert).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/mvp/mvp.service.ts apps/backend/src/modules/mvp/proctoring.service.test.ts
git commit -m "feat(backend): proctoring gate in startAttempt + attempt linking (Phase 4 Plan B)"
```

---

## Task 7: Admin list + detail/playback service methods

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.service.ts`
- Modify: `apps/backend/src/modules/mvp/proctoring.service.test.ts`

- [ ] **Step 1: Write the failing tests.** Append:

```typescript
describe('proctoring admin views', () => {
  async function seedWithChunks(service: MvpService, sequences: number[]) {
    const seed = seedProctoredExam(service, true);
    const recording = service.startProctoringRecording(
      T,
      'u_l1',
      { enrollmentId: seed.enrollment.id, courseId: seed.course.id, consent: true },
      ctxL1
    );
    for (const sequence of sequences) {
      await service.createProctoringChunkUploadIntent(
        T,
        'u_l1',
        recording.id,
        {
          sequence,
          originalName: `c${sequence}.webm`,
          contentType: 'video/webm',
          sizeBytes: 10
        },
        ctxL1
      );
    }
    return { ...seed, recording };
  }

  it('list enriches learnerName + courseTitle and filters by status', async () => {
    const { service } = makeService();
    const { recording, course } = await seedWithChunks(service, [0]);
    const all = service.listProctoringRecordings(T, {});
    expect(all).toHaveLength(1);
    expect(all[0]!.learnerName).toContain('Doe');
    expect(all[0]!.courseTitle).toBe(course.title);
    expect(service.listProctoringRecordings(T, { status: 'recording' })).toHaveLength(1);
    expect(service.listProctoringRecordings(T, { status: 'completed' })).toHaveLength(0);
    service.completeProctoringRecording(T, 'u_l1', recording.id, ctxL1);
    expect(service.listProctoringRecordings(T, { status: 'completed' })).toHaveLength(1);
  });

  it('list enriches attemptStatus once the attempt is linked', async () => {
    const { service } = makeService();
    const { test, enrollment } = await seedWithChunks(service, [0]);
    service.startAttempt(T, 'u_l1', startArgs(test, enrollment), ctxL1);
    const rows = service.listProctoringRecordings(T, {});
    expect(rows[0]!.attemptId).toBeTruthy();
    expect(rows[0]!.attemptStatus).toBe('in_progress');
  });

  it('detail returns presigned GET urls of clean chunks ordered by sequence', async () => {
    const { service, files } = makeService();
    const { recording } = await seedWithChunks(service, [1, 0, 2]);
    const detail = await service.getProctoringRecordingView(T, recording.id);
    expect(detail.playbackChunks.map((c) => c.sequence)).toEqual([0, 1, 2]);
    expect(detail.playbackChunks.every((c) => c.url === 'https://minio.local/GET-signed')).toBe(
      true
    );
    expect(detail.chunkIssues).toEqual([]);
    expect(files.createDownloadUrl).toHaveBeenCalledTimes(3);
  });

  it('infected chunk is excluded with a file_infected issue; the rest still play', async () => {
    const { service, files } = makeService();
    const { recording } = await seedWithChunks(service, [0, 1]);
    const infectedFileId = recording.chunks.find((c) => c.sequence === 1)!.fileId;
    files.getAntivirusStatuses.mockImplementation(
      async (_t: string, ids: string[]) =>
        new Map(ids.map((id) => [id, id === infectedFileId ? 'infected' : 'clean']))
    );
    const detail = await service.getProctoringRecordingView(T, recording.id);
    expect(detail.playbackChunks.map((c) => c.sequence)).toEqual([0]);
    expect(detail.chunkIssues).toContainEqual({ sequence: 1, code: 'file_infected' });
    expect(files.createDownloadUrl).toHaveBeenCalledTimes(1); // infected never hits the URL signer
  });

  it('sequence gaps are reported as missing_chunk issues', async () => {
    const { service } = makeService();
    const { recording } = await seedWithChunks(service, [0, 2, 3]);
    const detail = await service.getProctoringRecordingView(T, recording.id);
    expect(detail.chunkIssues).toContainEqual({ sequence: 1, code: 'missing_chunk' });
    expect(detail.playbackChunks.map((c) => c.sequence)).toEqual([0, 2, 3]);
  });

  it('a download-url failure degrades to an issue instead of failing the whole detail', async () => {
    const { service, files } = makeService();
    const { recording } = await seedWithChunks(service, [0, 1]);
    const failingFileId = recording.chunks.find((c) => c.sequence === 0)!.fileId;
    const { ConflictException: NestConflict } = await import('@nestjs/common');
    files.createDownloadUrl.mockImplementation(async (_t: string, fileId: string) => {
      if (fileId === failingFileId) {
        throw new NestConflict({ code: 'file_scan_failed', message: 'scan did not complete' });
      }
      return 'https://minio.local/GET-signed';
    });
    const detail = await service.getProctoringRecordingView(T, recording.id);
    expect(detail.chunkIssues).toContainEqual({ sequence: 0, code: 'file_scan_failed' });
    expect(detail.playbackChunks.map((c) => c.sequence)).toEqual([1]);
  });

  it('a purged recording returns metadata with no playback chunks and no issues', async () => {
    const { service, files } = makeService();
    const { recording } = await seedWithChunks(service, [0]);
    recording.purgedAt = '2027-06-12T00:00:00.000Z';
    const detail = await service.getProctoringRecordingView(T, recording.id);
    expect(detail.playbackChunks).toEqual([]);
    expect(detail.chunkIssues).toEqual([]);
    expect(files.createDownloadUrl).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure** (same vitest command). Expected: FAIL — methods missing.

- [ ] **Step 3: Implement** in `mvp.service.ts` (proctoring section). `HttpException` is already imported (used by `getIdentityVerificationView`):

```typescript
  /** Admin queue (proctoring.read): sessions (optionally by recordingStatus), newest first, enriched. */
  listProctoringRecordings(
    tenantId: string,
    query: { status?: string }
  ): ProctoringRecordingView[] {
    return this.state.proctoringRecordings
      .filter(
        (r) => r.tenantId === tenantId && (!query.status || r.recordingStatus === query.status)
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((r) => this.toProctoringRecordingView(tenantId, r));
  }

  private toProctoringRecordingView(
    tenantId: string,
    record: ProctoringRecording
  ): ProctoringRecordingView {
    const learner = this.state.learners.find(
      (l) => l.tenantId === tenantId && l.id === record.learnerId
    );
    const learnerName = [learner?.lastName, learner?.firstName, learner?.middleName]
      .filter(Boolean)
      .join(' ');
    const course = this.state.courses.find(
      (c) => c.tenantId === tenantId && c.id === record.courseId
    );
    const attempt = record.attemptId
      ? this.state.attempts.find((a) => a.tenantId === tenantId && a.id === record.attemptId)
      : undefined;
    return {
      ...record,
      learnerName,
      courseTitle: course?.title ?? '',
      ...(attempt ? { attemptStatus: attempt.status } : {})
    };
  }

  /**
   * Admin detail + playback (proctoring.read): ordered presigned GET urls of CLEAN chunks.
   * Infected chunks → excluded with a file_infected issue (no URL request — batch AV check first);
   * URL-signing failures degrade per-chunk (mirror of Plan A selfieFileError); sequence gaps
   * 0..max are reported as missing_chunk. A purged recording returns metadata only.
   */
  async getProctoringRecordingView(
    tenantId: string,
    recordingId: string
  ): Promise<ProctoringRecordingDetail> {
    const record = this.getById(this.state.proctoringRecordings, tenantId, recordingId);
    const view = this.toProctoringRecordingView(tenantId, record);
    const playbackChunks: ProctoringPlaybackChunk[] = [];
    const chunkIssues: ProctoringChunkIssue[] = [];
    const chunks = [...record.chunks].sort((a, b) => a.sequence - b.sequence);
    if (!record.purgedAt && chunks.length > 0) {
      const statuses = await this.filesService.getAntivirusStatuses(
        tenantId,
        chunks.map((c) => c.fileId)
      );
      for (const chunk of chunks) {
        if (statuses.get(chunk.fileId) === 'infected') {
          chunkIssues.push({ sequence: chunk.sequence, code: 'file_infected' });
          continue;
        }
        try {
          const url = await this.filesService.createDownloadUrl(tenantId, chunk.fileId);
          playbackChunks.push({ sequence: chunk.sequence, fileId: chunk.fileId, url });
        } catch (err) {
          const code =
            err instanceof HttpException
              ? ((err.getResponse() as { code?: string }).code ?? 'file_error')
              : 'file_error';
          chunkIssues.push({ sequence: chunk.sequence, code });
        }
      }
      const present = new Set(chunks.map((c) => c.sequence));
      const maxSequence = chunks[chunks.length - 1]!.sequence;
      for (let sequence = 0; sequence <= maxSequence; sequence += 1) {
        if (!present.has(sequence)) chunkIssues.push({ sequence, code: 'missing_chunk' });
      }
    }
    return { ...view, playbackChunks, chunkIssues };
  }
```

> **Executor note:** `Learner` has `firstName`/`lastName`/`middleName` (NO `name` field) — the enrichment is byte-for-byte the identity `toIdentityVerificationView` pattern. The seed's `createLearner({ name: 'Jane Doe' })` populates first/last via the legacy split, so the test's `toContain('Doe')` assertion holds regardless of name order.

- [ ] **Step 4: Run to verify pass** (same command) → PASS.

- [ ] **Step 5: Lint + commit**

```bash
npx eslint apps/backend/src/modules/mvp/mvp.service.ts apps/backend/src/modules/mvp/proctoring.service.test.ts --max-warnings=0
git add apps/backend/src/modules/mvp/mvp.service.ts apps/backend/src/modules/mvp/proctoring.service.test.ts
git commit -m "feat(backend): proctoring admin queue + playback detail with chunk issues (Phase 4 Plan B)"
```

---

## Task 8: DTOs + validation tests

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.dto.ts`
- Modify: `apps/backend/src/modules/mvp/mvp.dto-validation.test.ts`

- [ ] **Step 1: Write the failing DTO tests** (mirror the file's existing `plainToInstance` + `validateSync` style; extend the import from `./mvp.dto.js`):

```typescript
import {
  CreateProctoringChunkUploadUrlRequest,
  SetProctoringOverrideRequest,
  StartProctoringRecordingRequest
} from './mvp.dto.js';

describe('Proctoring DTOs (Phase 4 Plan B)', () => {
  it('StartProctoringRecordingRequest requires enrollmentId, courseId and consent === true', () => {
    const ok = plainToInstance(StartProctoringRecordingRequest, {
      enrollmentId: 'enr_1',
      courseId: 'c_1',
      consent: true
    });
    expect(validateSync(ok)).toHaveLength(0);

    const noConsent = plainToInstance(StartProctoringRecordingRequest, {
      enrollmentId: 'enr_1',
      courseId: 'c_1',
      consent: false
    });
    expect(validateSync(noConsent).length).toBeGreaterThan(0);

    const missingEnrollment = plainToInstance(StartProctoringRecordingRequest, {
      courseId: 'c_1',
      consent: true
    });
    expect(validateSync(missingEnrollment).length).toBeGreaterThan(0);
  });

  it('CreateProctoringChunkUploadUrlRequest validates sequence ≥ 0 and the upload triple', () => {
    const ok = plainToInstance(CreateProctoringChunkUploadUrlRequest, {
      sequence: 0,
      originalName: 'chunk-0.webm',
      contentType: 'video/webm',
      sizeBytes: 1024
    });
    expect(validateSync(ok)).toHaveLength(0);

    const negative = plainToInstance(CreateProctoringChunkUploadUrlRequest, {
      sequence: -1,
      originalName: 'chunk.webm',
      contentType: 'video/webm',
      sizeBytes: 1024
    });
    expect(validateSync(negative).length).toBeGreaterThan(0);

    const fractional = plainToInstance(CreateProctoringChunkUploadUrlRequest, {
      sequence: 1.5,
      originalName: 'chunk.webm',
      contentType: 'video/webm',
      sizeBytes: 1024
    });
    expect(validateSync(fractional).length).toBeGreaterThan(0);

    const noMime = plainToInstance(CreateProctoringChunkUploadUrlRequest, {
      sequence: 0,
      originalName: 'chunk.webm',
      sizeBytes: 1024
    });
    expect(validateSync(noMime).length).toBeGreaterThan(0);
  });

  it("SetProctoringOverrideRequest accepts 'require' | 'exempt' | null and rejects others", () => {
    for (const override of ['require', 'exempt', null]) {
      const dto = plainToInstance(SetProctoringOverrideRequest, { override });
      expect(validateSync(dto), `override=${String(override)} must be valid`).toHaveLength(0);
    }
    const bad = plainToInstance(SetProctoringOverrideRequest, { override: 'maybe' });
    expect(validateSync(bad).length).toBeGreaterThan(0);
    const missing = plainToInstance(SetProctoringOverrideRequest, {});
    expect(validateSync(missing).length).toBeGreaterThan(0);
  });

  it('CreateGroupCourseRequest accepts requiresProctoring', () => {
    const dto = plainToInstance(CreateGroupCourseRequest, {
      groupId: 'g1',
      courseId: 'c1',
      requiresProctoring: true
    });
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.requiresProctoring).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/mvp.dto-validation.test.ts --no-file-parallelism` → FAIL (classes missing).

- [ ] **Step 3: Add the DTOs** to `mvp.dto.ts` after the identity-verification DTO block (line ~1134). All decorators (`Equals`, `IsIn`, `IsInt`, `Min`, `IsNumber`, `IsBoolean`, `ValidateIf`, `Type`) are already imported in this file:

```typescript
// === Phase 4 Plan B — proctoring DTOs ===

/** `POST /proctoring-recordings` — start (or idempotently resume) a recording session. */
export class StartProctoringRecordingRequest {
  @IsString()
  @MinLength(1)
  enrollmentId!: string;

  @IsString()
  @MinLength(1)
  courseId!: string;

  /** 152-ФЗ: explicit consent to video recording. */
  @IsBoolean()
  @Equals(true)
  consent!: boolean;
}

/** `POST /proctoring-recordings/:id/chunk-upload-intent` — presigned PUT for one MediaRecorder chunk. */
export class CreateProctoringChunkUploadUrlRequest {
  /** 0-based monotonic chunk number assigned by the client. */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sequence!: number;

  @IsString()
  @MinLength(1)
  originalName!: string;

  @IsString()
  @MinLength(1)
  contentType!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  sizeBytes!: number;
}

/** `PATCH /enrollments/:id/proctoring-override` — per-student switch; null = inherit group-course. */
export class SetProctoringOverrideRequest {
  @ValidateIf((_, value) => value !== null)
  @IsIn(['require', 'exempt'])
  override!: 'require' | 'exempt' | null;
}
```

- [ ] **Step 4: Run to verify pass** (same command) → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/mvp/mvp.dto.ts apps/backend/src/modules/mvp/mvp.dto-validation.test.ts
git commit -m "feat(backend): proctoring DTOs (Phase 4 Plan B)"
```

---

## Task 9: Controller endpoints (7) + HTTP permission boundary

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.controller.ts`
- Modify: `apps/backend/src/modules/mvp/mvp.http.integration.test.ts`

- [ ] **Step 1: Add the endpoints** in `mvp.controller.ts` (import the 3 new DTO classes; place the block after the identity-verification endpoints, line ~966). **Route order matters: `proctoring-recordings/active` MUST be declared before `proctoring-recordings/:id`.**

```typescript
  // ─── Phase 4 Plan B: proctoring (webcam video recording of final exams) ───

  @Post('proctoring-recordings')
  @UseGuards(PermissionGuard)
  @RequirePermissions('proctoring.submit')
  startProctoringRecording(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const b = assertValidDto(StartProctoringRecordingRequest, raw);
    return this.mvpService.startProctoringRecording(c.tenantId!, c.userId, b, c);
  }

  @Post('proctoring-recordings/:id/chunk-upload-intent')
  @UseGuards(PermissionGuard)
  @RequirePermissions('proctoring.submit')
  createProctoringChunkUploadUrl(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() raw: unknown
  ) {
    const b = assertValidDto(CreateProctoringChunkUploadUrlRequest, raw);
    return this.mvpService.createProctoringChunkUploadIntent(c.tenantId!, c.userId, id, b, c);
  }

  @Post('proctoring-recordings/:id/complete')
  @UseGuards(PermissionGuard)
  @RequirePermissions('proctoring.submit')
  completeProctoringRecording(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.mvpService.completeProctoringRecording(c.tenantId!, c.userId, id, c);
  }

  @Get('proctoring-recordings/active')
  @UseGuards(PermissionGuard)
  @RequirePermissions('proctoring.submit')
  getMyActiveProctoringRecording(
    @CurrentContext() c: RequestContext,
    @Query('enrollmentId') enrollmentId?: string,
    @Query('courseId') courseId?: string
  ) {
    if (!enrollmentId || !courseId) {
      throw new BadRequestException({
        code: 'validation_error',
        message: 'enrollmentId and courseId query params are required'
      });
    }
    return this.mvpService.getMyActiveProctoringRecording(
      c.tenantId!,
      c.userId,
      { enrollmentId, courseId },
      c
    );
  }

  @Get('proctoring-recordings')
  @UseGuards(PermissionGuard)
  @RequirePermissions('proctoring.read')
  listProctoringRecordings(@CurrentContext() c: RequestContext, @Query('status') status?: string) {
    return this.mvpService.listProctoringRecordings(c.tenantId!, status ? { status } : {});
  }

  @Get('proctoring-recordings/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('proctoring.read')
  getProctoringRecording(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.mvpService.getProctoringRecordingView(c.tenantId!, id);
  }

  @Patch('enrollments/:id/proctoring-override')
  @UseGuards(PermissionGuard)
  @RequirePermissions('learners.write')
  setProctoringOverride(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() raw: unknown
  ) {
    const b = assertValidDto(SetProctoringOverrideRequest, raw);
    return this.mvpService.setProctoringOverride(c.tenantId!, c.userId, id, b, c);
  }
```

> `BadRequestException`, `Patch`, `Query`, `Param` are already imported in `mvp.controller.ts` (verify the `@nestjs/common` import line; add any that are missing).

- [ ] **Step 2: Extend the stub controller + boundary describe-block** in `mvp.http.integration.test.ts`. In `TestMvpController` (after the identity stubs, line ~409), add:

```typescript
      // Phase 4 Plan B — proctoring permission boundary
      @Get('proctoring-recordings')
      @RequirePermissions('proctoring.read')
      listProctoringRecordings(@CurrentContext() context: { tenantId?: string }) {
        return { items: [], tenantId: context.tenantId };
      }

      @Post('proctoring-recordings')
      @RequirePermissions('proctoring.submit')
      startProctoringRecording(@CurrentContext() context: { tenantId?: string }) {
        return { id: 'prec_1', recordingStatus: 'recording', tenantId: context.tenantId };
      }

      @Patch('enrollments/:id/proctoring-override')
      @RequirePermissions('learners.write')
      setProctoringOverride(
        @CurrentContext() context: { tenantId?: string },
        @Body() body: { override: string | null }
      ) {
        return { id: 'enr_1', proctoringOverride: body.override, tenantId: context.tenantId };
      }
```

(Add `Patch` to the test file's `@nestjs/common` import if absent.)

Then append a describe-block after the identity boundary block (line ~1616), mirroring its harness exactly (`issueSignedAccessToken` payload `{ sub: 'u_admin', tenant_id: 'tenant_demo', session_id: 's_active', roles: ['tenant_admin'] }`, `iamServiceMock.resolvePermissions` reset in `beforeEach` to `['courses.read']`):

```typescript
// === Phase 4 Plan B — proctoring RBAC boundary ===

describe('proctoring permission boundary', () => {
  beforeEach(() => {
    iamServiceMock.resolvePermissions.mockReset();
    iamServiceMock.resolvePermissions.mockResolvedValue(['courses.read']);
  });

  it('GET /proctoring-recordings — 403 permission_denied without proctoring.read', async () => {
    const token = issueSignedAccessToken(
      { sub: 'u_admin', tenant_id: 'tenant_demo', session_id: 's_active', roles: ['tenant_admin'] },
      process.env.AUTH_JWT_SECRET!,
      60
    );
    const response = await fetch(`${apiBaseUrl}/proctoring-recordings`, {
      headers: { 'x-tenant-id': 'tenant_demo', authorization: `Bearer ${token}` }
    });
    expect(response.status).toBe(403);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe('permission_denied');
  });

  it('GET /proctoring-recordings — 200 success with proctoring.read', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(['proctoring.read']);
    const token = issueSignedAccessToken(
      { sub: 'u_admin', tenant_id: 'tenant_demo', session_id: 's_active', roles: ['tenant_admin'] },
      process.env.AUTH_JWT_SECRET!,
      60
    );
    const response = await fetch(`${apiBaseUrl}/proctoring-recordings`, {
      headers: { 'x-tenant-id': 'tenant_demo', authorization: `Bearer ${token}` }
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { data: { tenantId: string } };
    expect(payload.data.tenantId).toBe('tenant_demo');
  });

  it('POST /proctoring-recordings — 403 permission_denied with only proctoring.read', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(['proctoring.read']);
    const token = issueSignedAccessToken(
      { sub: 'u_admin', tenant_id: 'tenant_demo', session_id: 's_active', roles: ['tenant_admin'] },
      process.env.AUTH_JWT_SECRET!,
      60
    );
    const response = await fetch(`${apiBaseUrl}/proctoring-recordings`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({})
    });
    expect(response.status).toBe(403);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe('permission_denied');
  });

  it('POST /proctoring-recordings — 201 success with proctoring.submit', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(['proctoring.submit']);
    const token = issueSignedAccessToken(
      { sub: 'u_admin', tenant_id: 'tenant_demo', session_id: 's_active', roles: ['tenant_admin'] },
      process.env.AUTH_JWT_SECRET!,
      60
    );
    const response = await fetch(`${apiBaseUrl}/proctoring-recordings`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({})
    });
    expect(response.status).toBe(201);
    const payload = (await response.json()) as { data: { recordingStatus: string } };
    expect(payload.data.recordingStatus).toBe('recording');
  });

  it('PATCH /enrollments/x/proctoring-override — 403 permission_denied without learners.write', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(['proctoring.read']);
    const token = issueSignedAccessToken(
      { sub: 'u_admin', tenant_id: 'tenant_demo', session_id: 's_active', roles: ['tenant_admin'] },
      process.env.AUTH_JWT_SECRET!,
      60
    );
    const response = await fetch(`${apiBaseUrl}/enrollments/x/proctoring-override`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ override: 'exempt' })
    });
    expect(response.status).toBe(403);
    const payload = (await response.json()) as { error: { code: string } };
    expect(payload.error.code).toBe('permission_denied');
  });

  it('PATCH /enrollments/x/proctoring-override — 200 success with learners.write', async () => {
    iamServiceMock.resolvePermissions.mockResolvedValueOnce(['learners.write']);
    const token = issueSignedAccessToken(
      { sub: 'u_admin', tenant_id: 'tenant_demo', session_id: 's_active', roles: ['tenant_admin'] },
      process.env.AUTH_JWT_SECRET!,
      60
    );
    const response = await fetch(`${apiBaseUrl}/enrollments/x/proctoring-override`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-tenant-id': 'tenant_demo',
        authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ override: 'exempt' })
    });
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { data: { proctoringOverride: string } };
    expect(payload.data.proctoringOverride).toBe('exempt');
  });
});
```

- [ ] **Step 3: Run the boundary test (isolated)**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/mvp.http.integration.test.ts --no-file-parallelism`
Expected: PASS. (If this file crashes on the Cyrillic path, note it and rely on CI.)

- [ ] **Step 4: Typecheck + lint + commit**

Run: `pnpm typecheck` → 8/8. `npx eslint apps/backend/src/modules/mvp/mvp.controller.ts --max-warnings=0` → clean.

```bash
git add apps/backend/src/modules/mvp/mvp.controller.ts apps/backend/src/modules/mvp/mvp.http.integration.test.ts
git commit -m "feat(backend): proctoring endpoints + RBAC boundary (Phase 4 Plan B)"
```

---

## Task 10: Video retention — env, pure selection, scanner, dormant cron

**Files:**

- Modify: `apps/backend/src/env.schema.ts`
- Create: `apps/backend/src/modules/mvp/proctoring/proctoring-video-retention.ts`
- Create: `apps/backend/src/modules/mvp/proctoring/proctoring-video-retention.test.ts`
- Create: `apps/backend/src/modules/mvp/proctoring/proctoring-retention-scanner.service.ts`
- Create: `apps/backend/src/modules/mvp/proctoring/proctoring-retention-scanner.service.test.ts`
- Create: `apps/backend/src/modules/mvp/proctoring/proctoring-retention-scheduler.service.ts`
- Create: `apps/backend/src/modules/mvp/proctoring/proctoring-retention-scheduler.service.test.ts`
- Modify: `apps/backend/src/modules/mvp/mvp.module.ts`

- [ ] **Step 1: Env vars.** In `env.schema.ts`, directly after `IDENTITY_RETENTION_CRON_SCHEDULE` (line ~66), with the same custom boolean parse (NOT `z.coerce.boolean` — it maps `"false"` → `true`):

```typescript
    // Proctoring video retention purge (Phase 4 Plan B). Ships dormant; ops enables after the
    // owner confirms the 365-day policy (roadmap open question №6). Custom boolean parse.
    PROCTORING_VIDEO_RETENTION_ENABLED: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((v) => v === true || v === 'true')
      .default(false),
    /** Cron for the nightly proctoring-video purge (UTC; offset from identity's 04:00). */
    PROCTORING_RETENTION_CRON_SCHEDULE: z.string().default('0 5 * * *'),
```

- [ ] **Step 2: Write the failing pure-function test** (`proctoring-video-retention.test.ts`):

```typescript
import { describe, expect, it } from 'vitest';

import { selectProctoringRecordingsToPurge } from './proctoring-video-retention.js';

const chunk = (sequence: number) => ({
  sequence,
  fileId: `f_${sequence}`,
  uploadedIntentAt: '2026-01-01T10:00:30.000Z'
});

const base = {
  startedAt: '2026-01-01T10:00:00.000Z',
  completedAt: '2026-01-01T11:00:00.000Z',
  chunks: [chunk(0), chunk(1)]
};

describe('selectProctoringRecordingsToPurge', () => {
  it('selects recordings whose completedAt is older than the 365-day window', () => {
    const due = selectProctoringRecordingsToPurge('2027-01-02', [{ id: 'a', ...base }]);
    expect(due.map((r) => r.id)).toEqual(['a']);
  });

  it('keeps recordings inside the window', () => {
    expect(selectProctoringRecordingsToPurge('2026-12-31', [{ id: 'a', ...base }])).toEqual([]);
  });

  it("ages out abandoned 'recording' sessions from startedAt (no status filter — unlike identity)", () => {
    const abandoned = { id: 'b', startedAt: '2026-01-01T10:00:00.000Z', chunks: [chunk(0)] };
    expect(selectProctoringRecordingsToPurge('2027-01-02', [abandoned])).toHaveLength(1);
    expect(selectProctoringRecordingsToPurge('2026-06-01', [abandoned])).toEqual([]);
  });

  it('skips already-purged and chunkless recordings', () => {
    const records = [
      { id: 'purged', ...base, purgedAt: '2027-01-05T00:00:00.000Z' },
      { id: 'nochunks', ...base, chunks: [] }
    ];
    expect(selectProctoringRecordingsToPurge('2028-01-01', records)).toEqual([]);
  });

  it('honours a custom retentionDays', () => {
    expect(
      selectProctoringRecordingsToPurge('2026-02-01', [{ id: 'a', ...base }], 30)
    ).toHaveLength(1);
  });
});
```

- [ ] **Step 3: Run → FAIL, then implement** `proctoring-video-retention.ts`:

```typescript
import { addDays } from '../../../common/utils/date-math.util.js';

/**
 * Spec §10 (single owner-confirmable item): videos are deleted 365 days after the session
 * ended. Change THIS constant if the owner picks a different term — no env var needed,
 * the cron is dormant behind PROCTORING_VIDEO_RETENTION_ENABLED anyway.
 */
export const PROCTORING_VIDEO_RETENTION_DAYS = 365;

export interface ProctoringRetentionCandidate {
  id: string;
  startedAt: string;
  completedAt?: string | undefined;
  purgedAt?: string | undefined;
  chunks: Array<{ fileId: string }>;
}

/**
 * Pure selection: not yet purged, has chunk files, and `(completedAt ?? startedAt)` is older
 * than the retention window. NOTE deliberately NO status filter (unlike identity's
 * approved|rejected requirement): abandoned 'recording' sessions age out too — there is no
 * separate reaper (spec §2.7). `asOf` is an ISO date (YYYY-MM-DD).
 */
export function selectProctoringRecordingsToPurge<T extends ProctoringRetentionCandidate>(
  asOf: string,
  records: T[],
  retentionDays: number = PROCTORING_VIDEO_RETENTION_DAYS
): T[] {
  return records.filter((r) => {
    if (r.purgedAt) return false;
    if (r.chunks.length === 0) return false;
    const anchor = r.completedAt ?? r.startedAt;
    return addDays(anchor.slice(0, 10), retentionDays) <= asOf;
  });
}
```

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/proctoring/proctoring-video-retention.test.ts --no-file-parallelism` → PASS.

- [ ] **Step 4: Write the failing scanner test** (`proctoring-retention-scanner.service.test.ts`):

```typescript
import { describe, expect, it, vi } from 'vitest';

import { ProctoringRetentionScanner } from './proctoring-retention-scanner.service.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';

import type { AuditService } from '../../audit/audit.service.js';
import type { FilesService } from '../../files/files.service.js';

function makeScanner() {
  const deleteFile = vi.fn(async () => undefined);
  const auditWrite = vi.fn();
  const scanner = new ProctoringRetentionScanner(
    { deleteFile } as unknown as FilesService,
    { write: auditWrite } as unknown as AuditService
  );
  return { scanner, deleteFile, auditWrite };
}

function seedState(startedAt: string, id = 'prec_1') {
  const state = new InMemoryMvpState();
  state.proctoringRecordings.push({
    id,
    tenantId: 't1',
    learnerId: 'l1',
    groupId: 'g1',
    courseId: 'c1',
    recordingStatus: 'completed',
    consentAt: startedAt,
    startedAt,
    completedAt: startedAt,
    chunks: [
      { sequence: 0, fileId: `${id}_f0`, uploadedIntentAt: startedAt },
      { sequence: 1, fileId: `${id}_f1`, uploadedIntentAt: startedAt }
    ],
    status: 'active',
    createdAt: startedAt,
    updatedAt: startedAt
  });
  return state;
}

describe('ProctoringRetentionScanner', () => {
  it('deletes every chunk file, stamps purgedAt, audits learning.proctoring_video_purged', async () => {
    const { scanner, deleteFile, auditWrite } = makeScanner();
    const state = seedState('2026-01-01T00:00:00.000Z');
    const purged = await scanner.scanTenant('t1', '2027-06-01', state);
    expect(purged).toBe(1);
    expect(deleteFile).toHaveBeenCalledWith('t1', 'prec_1_f0');
    expect(deleteFile).toHaveBeenCalledWith('t1', 'prec_1_f1');
    expect(state.proctoringRecordings[0]!.purgedAt).toBeTruthy();
    expect(auditWrite).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'learning.proctoring_video_purged', entityId: 'prec_1' })
    );
  });

  it('does nothing inside the retention window', async () => {
    const { scanner, deleteFile } = makeScanner();
    const state = seedState(new Date().toISOString());
    expect(await scanner.scanTenant('t1', new Date().toISOString().slice(0, 10), state)).toBe(0);
    expect(deleteFile).not.toHaveBeenCalled();
  });

  it('a failing record gets NO purgedAt stamp (retry next run) and does not abort the batch', async () => {
    const { scanner, deleteFile } = makeScanner();
    deleteFile.mockRejectedValueOnce(new Error('s3 down'));
    const state = seedState('2026-01-01T00:00:00.000Z');
    const second = seedState('2026-01-01T00:00:00.000Z', 'prec_2');
    state.proctoringRecordings.push(second.proctoringRecordings[0]!);
    const purged = await scanner.scanTenant('t1', '2027-06-01', state);
    expect(purged).toBe(1); // first failed mid-chunks, second succeeded
    expect(state.proctoringRecordings[0]!.purgedAt).toBeUndefined();
    expect(state.proctoringRecordings[1]!.purgedAt).toBeTruthy();
  });
});
```

- [ ] **Step 5: Run → FAIL, then implement** `proctoring-retention-scanner.service.ts` (explicit `@Inject` — tsx DI rule):

```typescript
import { Inject, Injectable, Logger } from '@nestjs/common';

import { selectProctoringRecordingsToPurge } from './proctoring-video-retention.js';
import { AuditService } from '../../audit/audit.service.js';
import { FilesService } from '../../files/files.service.js';

import type { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';

/**
 * Phase 4 Plan B: per-tenant purge of proctoring chunk files 365 days after the session
 * ended. The session record (consent, attempt link) persists — only files are removed.
 * Invoked by ProctoringRetentionSchedulerService via MvpTenantRunner WRITE mode (the
 * runner loads and ALWAYS saves state around this call — Plan A CRITICAL lesson).
 */
@Injectable()
export class ProctoringRetentionScanner {
  private readonly logger = new Logger(ProctoringRetentionScanner.name);

  constructor(
    @Inject(FilesService) private readonly filesService: FilesService,
    @Inject(AuditService) private readonly auditService: AuditService
  ) {}

  /** Returns the number of recordings whose videos were purged. */
  async scanTenant(tenantId: string, asOf: string, state: InMemoryMvpState): Promise<number> {
    const due = selectProctoringRecordingsToPurge(asOf, state.proctoringRecordings);
    let purged = 0;
    for (const record of due) {
      try {
        for (const chunk of record.chunks) {
          await this.filesService.deleteFile(tenantId, chunk.fileId);
        }
        const now = new Date().toISOString();
        record.purgedAt = now;
        record.updatedAt = now;
        purged += 1;
        this.auditService.write({
          tenantId,
          actorId: 'system',
          action: 'learning.proctoring_video_purged',
          entityType: 'learning.proctoring_recording',
          entityId: record.id,
          oldValues: { chunkCount: record.chunks.length },
          newValues: { purgedAt: now }
        });
      } catch (err) {
        // purgedAt is intentionally not stamped on error; idempotent deleteFile means the
        // next run re-attempts only surviving file ids.
        this.logger.error(
          `Proctoring video purge failed tenant=${tenantId} recording=${record.id}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
    return purged;
  }
}
```

> Type note: `selectProctoringRecordingsToPurge` is generic (`<T extends ProctoringRetentionCandidate>`), so `due` items are the actual `ProctoringRecording` objects from state — mutating them is intentional; the write-mode runner persists the stamps.

Run the scanner test → PASS.

- [ ] **Step 6: Write the failing scheduler test** (`proctoring-retention-scheduler.service.test.ts`) — the write-mode-runner regression guard:

```typescript
import { describe, expect, it, vi } from 'vitest';

import { ProctoringRetentionSchedulerService } from './proctoring-retention-scheduler.service.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';

import type { DatabaseService } from '../../../infrastructure/database/database.service.js';
import type { TenantService } from '../../tenant/tenant.service.js';
import type { MvpTenantRunner } from '../infrastructure/mvp-tenant-runner.service.js';
import type { ProctoringRetentionScanner } from './proctoring-retention-scanner.service.js';

function makeScheduler(locked = true, tenantIds = ['t1', 't2']) {
  const db = {
    withTransaction: vi.fn(async (fn: (client: unknown) => Promise<void>) => fn({})),
    query: vi.fn(async () => [{ locked }])
  };
  const tenants = { listActiveTenantIds: vi.fn(async () => tenantIds) };
  const runner = {
    runWithTenantState: vi.fn(),
    runWithTenantStateAndSave: vi.fn(
      async (_tenantId: string, fn: (state: InMemoryMvpState) => Promise<number>) =>
        fn(new InMemoryMvpState())
    )
  };
  const scanner = { scanTenant: vi.fn(async () => 0) };
  const scheduler = new ProctoringRetentionSchedulerService(
    tenants as unknown as TenantService,
    runner as unknown as MvpTenantRunner,
    scanner as unknown as ProctoringRetentionScanner,
    db as unknown as DatabaseService
  );
  return { scheduler, db, tenants, runner, scanner };
}

describe('ProctoringRetentionSchedulerService', () => {
  it('uses the WRITE-mode tenant runner (runWithTenantStateAndSave) — never read-only', async () => {
    const { scheduler, runner, scanner } = makeScheduler();
    await scheduler.runPurgeAllTenants('2027-06-11');
    expect(runner.runWithTenantStateAndSave).toHaveBeenCalledTimes(2);
    expect(runner.runWithTenantState).not.toHaveBeenCalled(); // CRITICAL Plan A lesson
    expect(scanner.scanTenant).toHaveBeenCalledWith('t1', '2027-06-11', expect.anything());
    expect(scanner.scanTenant).toHaveBeenCalledWith('t2', '2027-06-11', expect.anything());
  });

  it('skips entirely when another instance holds the advisory lock', async () => {
    const { scheduler, runner, tenants } = makeScheduler(false);
    await scheduler.runPurgeAllTenants('2027-06-11');
    expect(tenants.listActiveTenantIds).not.toHaveBeenCalled();
    expect(runner.runWithTenantStateAndSave).not.toHaveBeenCalled();
  });

  it("one tenant's failure does not abort the batch", async () => {
    const { scheduler, runner } = makeScheduler();
    runner.runWithTenantStateAndSave.mockRejectedValueOnce(new Error('tenant t1 exploded'));
    await expect(scheduler.runPurgeAllTenants('2027-06-11')).resolves.toBeUndefined();
    expect(runner.runWithTenantStateAndSave).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 7: Run → FAIL, then implement** `proctoring-retention-scheduler.service.ts` — mirrors `IdentityRetentionSchedulerService` with its own lock key and the WRITE-mode runner:

```typescript
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { ProctoringRetentionScanner } from './proctoring-retention-scanner.service.js';
import { backendEnv } from '../../../env.js';
import { DatabaseService } from '../../../infrastructure/database/database.service.js';
import { TenantService } from '../../tenant/tenant.service.js';
import { MvpTenantRunner } from '../infrastructure/mvp-tenant-runner.service.js';

/** Stable advisory-lock key (reminders 528_491, identity 528_492 → proctoring 528_493). */
const PROCTORING_RETENTION_LOCK_KEY = 528_493;

@Injectable()
export class ProctoringRetentionSchedulerService {
  private readonly logger = new Logger(ProctoringRetentionSchedulerService.name);

  constructor(
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(MvpTenantRunner) private readonly mvpRunner: MvpTenantRunner,
    @Inject(ProctoringRetentionScanner) private readonly scanner: ProctoringRetentionScanner,
    @Inject(DatabaseService) private readonly db: DatabaseService
  ) {}

  @Cron(backendEnv.PROCTORING_RETENTION_CRON_SCHEDULE, {
    name: 'proctoring-video-retention',
    timeZone: 'UTC'
  })
  async handleDailyPurge(): Promise<void> {
    if (!backendEnv.PROCTORING_VIDEO_RETENTION_ENABLED) {
      return;
    }
    const asOf = new Date().toISOString().slice(0, 10);
    this.logger.log(`Starting proctoring video retention purge asOf=${asOf}`);
    try {
      await this.runPurgeAllTenants(asOf);
    } catch (err) {
      this.logger.error(
        `Proctoring retention purge failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /** Advisory lock (one instance wins) → per-tenant WRITE-mode purge; one tenant's failure never aborts the batch. */
  async runPurgeAllTenants(asOf: string): Promise<void> {
    await this.db.withTransaction(async (client) => {
      const lockRows = await this.db.query<{ locked: boolean }>(
        'select pg_try_advisory_xact_lock($1) as locked',
        [PROCTORING_RETENTION_LOCK_KEY],
        client
      );
      if (!lockRows[0]?.locked) {
        this.logger.log('Another instance holds the proctoring retention lock; skipping.');
        return;
      }
      const tenantIds = await this.tenants.listActiveTenantIds();
      let totalPurged = 0;
      for (const tenantId of tenantIds) {
        try {
          // WRITE mode is mandatory: read-only runWithTenantState silently drops purgedAt
          // stamps → infinite re-delete loop (Plan A holistic-review CRITICAL).
          const purged = await this.mvpRunner.runWithTenantStateAndSave(tenantId, async (state) =>
            this.scanner.scanTenant(tenantId, asOf, state)
          );
          if (purged > 0) this.logger.log(`tenant=${tenantId} purged=${purged}`);
          totalPurged += purged;
        } catch (err) {
          this.logger.error(
            `Proctoring retention failed for tenant ${tenantId}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
      this.logger.log(
        `Completed proctoring video retention purge tenants=${tenantIds.length} purged=${totalPurged}`
      );
    });
  }
}
```

- [ ] **Step 8: Register providers.** In `mvp.module.ts`, import both classes and add `ProctoringRetentionScanner` + `ProctoringRetentionSchedulerService` to the `providers` array, directly after `IdentityRetentionScanner` / `IdentityRetentionSchedulerService` (line ~78).

- [ ] **Step 9: Verify**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/proctoring/proctoring-video-retention.test.ts src/modules/mvp/proctoring/proctoring-retention-scanner.service.test.ts src/modules/mvp/proctoring/proctoring-retention-scheduler.service.test.ts src/env.test.ts --no-file-parallelism` → PASS.
Run: `pnpm typecheck` → 8/8.

- [ ] **Step 10: Commit**

```bash
git add apps/backend/src/env.schema.ts apps/backend/src/modules/mvp/proctoring apps/backend/src/modules/mvp/mvp.module.ts
git commit -m "feat(backend): dormant 365-day proctoring video retention cron, write-mode runner (Phase 4 Plan B)"
```

---

## Task 11: Frontend feature core — types, api, format (+ contract tests)

**Files:**

- Create: `apps/frontend/src/features/proctoring/types.ts`
- Create: `apps/frontend/src/features/proctoring/api.ts`
- Create: `apps/frontend/src/features/proctoring/api.contract.test.ts`
- Create: `apps/frontend/src/features/proctoring/format.ts`
- Create: `apps/frontend/src/features/proctoring/format.test.ts`

- [ ] **Step 1: types.ts**

```typescript
export type ProctoringRecordingStatus = 'recording' | 'completed';

export interface ProctoringChunkDto {
  sequence: number;
  fileId: string;
  uploadedIntentAt: string;
}

export interface ProctoringRecordingDto {
  id: string;
  learnerId: string;
  groupId: string;
  courseId: string;
  recordingStatus: ProctoringRecordingStatus;
  attemptId?: string;
  consentAt: string;
  startedAt: string;
  completedAt?: string;
  chunks: ProctoringChunkDto[];
  purgedAt?: string;
  createdAt: string;
}

/** Admin queue row: session + display enrichment. */
export interface ProctoringRecordingView extends ProctoringRecordingDto {
  learnerName: string;
  courseTitle: string;
  attemptStatus?: string;
}

export interface ProctoringChunkIssue {
  sequence: number;
  /** file_infected | file_scan_failed | file_error | missing_chunk */
  code: string;
}

export interface ProctoringPlaybackChunk {
  sequence: number;
  fileId: string;
  url: string;
}

/** Admin detail: ordered presigned GET urls of clean chunks + issues. */
export interface ProctoringRecordingDetail extends ProctoringRecordingView {
  playbackChunks: ProctoringPlaybackChunk[];
  chunkIssues: ProctoringChunkIssue[];
}

export interface StartProctoringPayload {
  enrollmentId: string;
  courseId: string;
  consent: true;
}

export interface ProctoringChunkUploadPayload {
  sequence: number;
  originalName: string;
  contentType: string;
  sizeBytes: number;
}

export interface ActiveProctoringDto {
  recording: ProctoringRecordingDto;
  nextSequence: number;
}

export interface UploadIntent {
  fileId: string;
  uploadUrl: string;
  storageKey: string;
  expiresInSeconds: number;
}

export interface SetProctoringOverridePayload {
  override: 'require' | 'exempt' | null;
}
```

- [ ] **Step 2: Write the failing contract test** (`api.contract.test.ts`) — mirror `features/identity-verification/api.contract.test.ts` exactly (same `session` fixture shape, `beforeAll` env defaults + dynamic import, `vi.stubGlobal('fetch', fetchMock)`, `envelope` helper, `afterEach` unstub). Cover all seven calls:

```typescript
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { proctoringApi as ProctoringApi } from './api';
import type { UserSession } from '../../entities/session/model';

const fetchMock = vi.fn();

const session: UserSession = {
  user: {
    id: 'u1',
    tenantId: 'tenant_demo',
    login: 'admin',
    email: 'admin@example.com',
    displayName: 'Admin',
    status: 'active'
  },
  tokens: { accessToken: 'token', sessionId: 's1', expiresIn: 300 },
  roles: ['tenant_admin'],
  permissions: ['proctoring.read', 'proctoring.submit']
};

const envelope = <T>(data: T) =>
  JSON.stringify({
    data,
    meta: { requestId: 'req-1', correlationId: 'corr-1', timestamp: '2026-01-01T00:00:00.000Z' }
  });

const recordingDto = {
  id: 'prec_1',
  learnerId: 'l1',
  groupId: 'g1',
  courseId: 'c1',
  recordingStatus: 'recording',
  consentAt: '2026-06-11T10:00:00.000Z',
  startedAt: '2026-06-11T10:00:00.000Z',
  chunks: [],
  createdAt: '2026-06-11T10:00:00.000Z'
};

describe('proctoringApi envelope compatibility (Phase 4 Plan B)', () => {
  let proctoringApi: typeof ProctoringApi;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    proctoringApi = (await import('./api')).proctoringApi;
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('start: POST /proctoring-recordings unwraps the session', async () => {
    fetchMock.mockResolvedValueOnce(new Response(envelope(recordingDto), { status: 201 }));
    const result = await proctoringApi.start(session, {
      enrollmentId: 'enr_1',
      courseId: 'c1',
      consent: true
    });
    expect(result.recordingStatus).toBe('recording');
    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(calledUrl).pathname).toMatch(/\/proctoring-recordings$/);
    expect(init.method).toBe('POST');
  });

  it('chunkUploadUrl: POST /proctoring-recordings/:id/chunk-upload-intent unwraps the intent', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        envelope({
          fileId: 'file_1',
          uploadUrl: 'https://minio.example.com/upload',
          storageKey: 'proctoring/t/x.webm',
          expiresInSeconds: 900
        }),
        { status: 201 }
      )
    );
    const result = await proctoringApi.chunkUploadUrl(session, 'prec_1', {
      sequence: 0,
      originalName: 'chunk-0.webm',
      contentType: 'video/webm',
      sizeBytes: 2048
    });
    expect(result.fileId).toBe('file_1');
    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('/proctoring-recordings/prec_1/chunk-upload-intent');
    expect(init.method).toBe('POST');
  });

  it('complete: POST /proctoring-recordings/:id/complete unwraps the completed session', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ ...recordingDto, recordingStatus: 'completed' }), { status: 201 })
    );
    const result = await proctoringApi.complete(session, 'prec_1');
    expect(result.recordingStatus).toBe('completed');
    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('/proctoring-recordings/prec_1/complete');
    expect(init.method).toBe('POST');
  });

  it('active: GET /proctoring-recordings/active?enrollmentId&courseId unwraps data (null case)', async () => {
    fetchMock.mockResolvedValueOnce(new Response(envelope(null), { status: 200 }));
    const result = await proctoringApi.active(session, 'enr_1', 'c1');
    expect(result).toBeNull();
    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('/proctoring-recordings/active?enrollmentId=enr_1&courseId=c1');
    expect(init.method).toBe('GET');
  });

  it('list: GET /proctoring-recordings?status= unwraps rows', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope([{ ...recordingDto, learnerName: 'Иванов Иван', courseTitle: 'ОТ' }]), {
        status: 200
      })
    );
    const result = await proctoringApi.list(session, 'recording');
    expect(result[0]!.learnerName).toBe('Иванов Иван');
    const [calledUrl] = fetchMock.mock.calls[0] as [string];
    expect(calledUrl).toContain('/proctoring-recordings?status=recording');
  });

  it('get: GET /proctoring-recordings/:id unwraps detail with playback chunks', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        envelope({
          ...recordingDto,
          learnerName: 'Иванов Иван',
          courseTitle: 'ОТ',
          playbackChunks: [{ sequence: 0, fileId: 'f0', url: 'https://minio/0' }],
          chunkIssues: [{ sequence: 1, code: 'missing_chunk' }]
        }),
        { status: 200 }
      )
    );
    const result = await proctoringApi.get(session, 'prec_1');
    expect(result.playbackChunks).toHaveLength(1);
    expect(result.chunkIssues[0]!.code).toBe('missing_chunk');
    const [calledUrl] = fetchMock.mock.calls[0] as [string];
    expect(calledUrl).toContain('/proctoring-recordings/prec_1');
  });

  it('setOverride: PATCH /enrollments/:id/proctoring-override sends the override body', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(envelope({ id: 'enr_1', proctoringOverride: 'exempt' }), { status: 200 })
    );
    await proctoringApi.setOverride(session, 'enr_1', { override: 'exempt' });
    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toContain('/enrollments/enr_1/proctoring-override');
    expect(init.method).toBe('PATCH');
    expect(init.body).toBe(JSON.stringify({ override: 'exempt' }));
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/features/proctoring/api.contract.test.ts --no-file-parallelism` → FAIL (module missing).

- [ ] **Step 4: api.ts** (`withAuth` shape copied from `identity-verification/api.ts`):

```typescript
import { apiRequest } from '../../lib/api/client';

import type {
  ActiveProctoringDto,
  ProctoringChunkUploadPayload,
  ProctoringRecordingDetail,
  ProctoringRecordingDto,
  ProctoringRecordingStatus,
  ProctoringRecordingView,
  SetProctoringOverridePayload,
  StartProctoringPayload,
  UploadIntent
} from './types';
import type { UserSession } from '../../entities/session/model';

const withAuth = (session: UserSession) => ({
  auth: {
    userId: session.user.id,
    tenantId: session.user.tenantId,
    accessToken: session.tokens.accessToken
  }
});

export const proctoringApi = {
  start: (session: UserSession, payload: StartProctoringPayload): Promise<ProctoringRecordingDto> =>
    apiRequest<ProctoringRecordingDto>('/proctoring-recordings', {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    }),
  chunkUploadUrl: (
    session: UserSession,
    id: string,
    payload: ProctoringChunkUploadPayload
  ): Promise<UploadIntent> =>
    apiRequest<UploadIntent>(`/proctoring-recordings/${id}/chunk-upload-intent`, {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    }),
  complete: (session: UserSession, id: string): Promise<ProctoringRecordingDto> =>
    apiRequest<ProctoringRecordingDto>(`/proctoring-recordings/${id}/complete`, {
      method: 'POST',
      body: {},
      ...withAuth(session)
    }),
  active: (
    session: UserSession,
    enrollmentId: string,
    courseId: string
  ): Promise<ActiveProctoringDto | null> =>
    apiRequest<ActiveProctoringDto | null>(
      `/proctoring-recordings/active?enrollmentId=${encodeURIComponent(enrollmentId)}&courseId=${encodeURIComponent(courseId)}`,
      { method: 'GET', ...withAuth(session) }
    ),
  list: (
    session: UserSession,
    status?: ProctoringRecordingStatus
  ): Promise<ProctoringRecordingView[]> =>
    apiRequest<ProctoringRecordingView[]>(
      `/proctoring-recordings${status ? `?status=${status}` : ''}`,
      { method: 'GET', ...withAuth(session) }
    ),
  get: (session: UserSession, id: string): Promise<ProctoringRecordingDetail> =>
    apiRequest<ProctoringRecordingDetail>(`/proctoring-recordings/${id}`, {
      method: 'GET',
      ...withAuth(session)
    }),
  setOverride: (
    session: UserSession,
    enrollmentId: string,
    payload: SetProctoringOverridePayload
  ): Promise<{ id: string; proctoringOverride: string | null }> =>
    apiRequest<{ id: string; proctoringOverride: string | null }>(
      `/enrollments/${enrollmentId}/proctoring-override`,
      { method: 'PATCH', body: payload, ...withAuth(session) }
    )
};

/** Direct PUT of chunk bytes to the presigned MinIO URL (bypasses the API envelope).
 *  Deliberate local copy of identity-verification's helper (documented duplication precedent). */
export async function putBlobToPresignedUrl(
  uploadUrl: string,
  blob: Blob,
  contentType: string
): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: blob
  });
  if (!res.ok) {
    throw new Error(`Не удалось загрузить фрагмент записи (HTTP ${res.status})`);
  }
}

/** MediaRecorder reports e.g. 'video/webm;codecs=vp8,opus' — the backend allowlist wants the base type. */
export function baseMimeType(blobType: string): string {
  return (blobType || 'video/webm').split(';')[0]!;
}
```

Run the contract test again → PASS.

- [ ] **Step 5: format.ts + format.test.ts** (local `formatDateShort` copy — same precedent as identity):

```typescript
import type { ProctoringRecordingStatus } from './types';

export const PROCTORING_STATUS_LABELS: Record<ProctoringRecordingStatus, string> = {
  recording: 'Идёт запись',
  completed: 'Завершена'
};

export function formatProctoringStatus(status: string): string {
  return PROCTORING_STATUS_LABELS[status as ProctoringRecordingStatus] ?? status;
}

/** ДД.ММ.ГГГГ from an ISO timestamp; '—' for absent values. */
export function formatDateShort(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ru-RU');
}

/** Human label for a chunk issue in the admin player warnings list. */
export function chunkIssueLabel(issue: { sequence: number; code: string }): string {
  const n = issue.sequence + 1;
  if (issue.code === 'missing_chunk') {
    return `Фрагмент ${n}: не был загружен (разрыв записи)`;
  }
  if (issue.code === 'file_infected' || issue.code === 'file_scan_failed') {
    return `Фрагмент ${n}: недоступен (антивирус)`;
  }
  return `Фрагмент ${n}: недоступен`;
}
```

`format.test.ts`: assert both status labels, unknown-status passthrough, `formatDateShort(undefined) === '—'`, `formatDateShort('not-a-date') === '—'`, a valid ISO renders non-'—', and the three `chunkIssueLabel` branches (`missing_chunk` mentions «разрыв», `file_infected` mentions «антивирус», unknown code falls back).

- [ ] **Step 6: Verify + commit**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/features/proctoring --no-file-parallelism` → PASS.
Run: `pnpm typecheck` → 8/8.

```bash
git add apps/frontend/src/features/proctoring
git commit -m "feat(frontend): proctoring feature core — types/api/format (Phase 4 Plan B)"
```

---

## Task 12: Frontend recorder state machine (no browser APIs)

**Files:**

- Create: `apps/frontend/src/features/proctoring/recorder.ts`
- Create: `apps/frontend/src/features/proctoring/recorder.test.ts`

- [ ] **Step 1: Write the failing tests** (`recorder.test.ts`) with a fake MediaRecorder — NO real browser APIs:

```typescript
import { describe, expect, it, vi } from 'vitest';

import { ProctoringRecorder } from './recorder';

import type { MediaRecorderLike, MediaStreamLike, RecorderPhase } from './recorder';

class FakeMediaRecorder implements MediaRecorderLike {
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  started = false;
  timeslice: number | null = null;

  start(timesliceMs: number): void {
    this.started = true;
    this.timeslice = timesliceMs;
  }

  stop(): void {
    // Mirrors the real MediaRecorder: a final dataavailable fires before onstop.
    this.emit('tail');
    this.onstop?.();
  }

  emit(content: string): void {
    this.ondataavailable?.({ data: new Blob([content], { type: 'video/webm' }) });
  }
}

function makeRecorder(opts?: {
  startSequence?: number;
  failSequences?: Map<number, number>; // sequence → how many times to fail
  getUserMedia?: () => Promise<MediaStreamLike>;
}) {
  const stream: MediaStreamLike = { getTracks: () => [{ stop: vi.fn() }] };
  const fake = new FakeMediaRecorder();
  const uploads: number[] = [];
  const failures = opts?.failSequences ?? new Map<number, number>();
  const phases: RecorderPhase[] = [];
  const uploadChunk = vi.fn(async (sequence: number, _blob: Blob) => {
    const remaining = failures.get(sequence) ?? 0;
    if (remaining > 0) {
      failures.set(sequence, remaining - 1);
      throw new Error('upload failed');
    }
    uploads.push(sequence);
  });
  const recorder = new ProctoringRecorder(
    {
      getUserMedia: opts?.getUserMedia ?? (async () => stream),
      createRecorder: () => fake,
      uploadChunk,
      timesliceMs: 30_000,
      onPhaseChange: (phase) => phases.push(phase)
    },
    opts?.startSequence ?? 0
  );
  return { recorder, fake, uploads, uploadChunk, phases, stream };
}

describe('ProctoringRecorder state machine', () => {
  it('idle → acquiring → recording; passes the timeslice to MediaRecorder', async () => {
    const { recorder, fake, phases } = makeRecorder();
    expect(recorder.phase).toBe('idle');
    await recorder.start();
    expect(recorder.phase).toBe('recording');
    expect(fake.started).toBe(true);
    expect(fake.timeslice).toBe(30_000);
    expect(phases).toEqual(['acquiring', 'recording']);
  });

  it('camera denial → phase error and a camera_unavailable throw', async () => {
    const { recorder } = makeRecorder({
      getUserMedia: async () => {
        throw new Error('NotAllowedError');
      }
    });
    await expect(recorder.start()).rejects.toThrow('camera_unavailable');
    expect(recorder.phase).toBe('error');
  });

  it('uploads chunks sequentially with monotonic sequences', async () => {
    const { recorder, fake, uploads } = makeRecorder();
    await recorder.start();
    fake.emit('a');
    fake.emit('b');
    await recorder.stop(); // flushes the queue (+tail chunk)
    expect(uploads).toEqual([0, 1, 2]);
  });

  it('retries a failed chunk once, then skips it and continues (exam never interrupted)', async () => {
    const { recorder, fake, uploads, uploadChunk } = makeRecorder({
      failSequences: new Map([[1, 2]]) // sequence 1 fails twice → first try + retry → skipped
    });
    await recorder.start();
    fake.emit('a');
    fake.emit('b');
    fake.emit('c');
    await recorder.stop();
    expect(uploads).toEqual([0, 2, 3]); // 1 skipped; tail = 3
    expect(recorder.skippedSequences).toEqual([1]);
    // sequence 1 attempted exactly twice (1 try + 1 retry)
    expect(uploadChunk.mock.calls.filter(([seq]) => seq === 1)).toHaveLength(2);
  });

  it('a single transient failure recovers on the retry (nothing skipped)', async () => {
    const { recorder, fake, uploads } = makeRecorder({
      failSequences: new Map([[0, 1]])
    });
    await recorder.start();
    fake.emit('a');
    await recorder.stop();
    expect(uploads).toEqual([0, 1]);
    expect(recorder.skippedSequences).toEqual([]);
  });

  it('stop: recording → uploading-tail → completed, releases camera tracks', async () => {
    const trackStop = vi.fn();
    const stream: MediaStreamLike = { getTracks: () => [{ stop: trackStop }] };
    const { recorder, fake, phases } = makeRecorder({ getUserMedia: async () => stream });
    await recorder.start();
    fake.emit('a');
    await recorder.stop();
    expect(recorder.phase).toBe('completed');
    expect(phases).toEqual(['acquiring', 'recording', 'uploading-tail', 'completed']);
    expect(trackStop).toHaveBeenCalled();
  });

  it('resume: a recorder constructed with startSequence continues numbering from there', async () => {
    const { recorder, fake, uploads } = makeRecorder({ startSequence: 5 });
    await recorder.start();
    fake.emit('a');
    await recorder.stop();
    expect(uploads).toEqual([5, 6]); // 5 = first new chunk, 6 = tail
  });

  it('start is a no-op when not idle; stop is a no-op when not recording', async () => {
    const { recorder, fake } = makeRecorder();
    await recorder.start();
    await recorder.start(); // ignored
    expect(recorder.phase).toBe('recording');
    fake.emit('a');
    await recorder.stop();
    await recorder.stop(); // ignored
    expect(recorder.phase).toBe('completed');
  });

  it('empty dataavailable blobs are ignored (no zero-byte uploads)', async () => {
    const { recorder, fake, uploadChunk } = makeRecorder();
    await recorder.start();
    fake.ondataavailable?.({ data: new Blob([], { type: 'video/webm' }) });
    await recorder.stop();
    // only the tail chunk (non-empty) was uploaded
    expect(uploadChunk.mock.calls.map(([seq]) => seq)).toEqual([0]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/features/proctoring/recorder.test.ts --no-file-parallelism` → FAIL (module missing).

- [ ] **Step 3: Implement** `recorder.ts`:

```typescript
/**
 * Phase 4 Plan B: pure recording state machine over injected browser deps.
 * idle → acquiring → recording → uploading-tail → completed | error.
 * No direct MediaRecorder/getUserMedia usage — screens.tsx wires the real APIs,
 * tests inject fakes (project convention: no React render / no browser in tests).
 */

export type RecorderPhase =
  | 'idle'
  | 'acquiring'
  | 'recording'
  | 'uploading-tail'
  | 'completed'
  | 'error';

export interface MediaStreamLike {
  getTracks(): Array<{ stop(): void }>;
}

export interface MediaRecorderLike {
  start(timesliceMs: number): void;
  stop(): void;
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
}

export interface ProctoringRecorderDeps {
  getUserMedia: () => Promise<MediaStreamLike>;
  createRecorder: (stream: MediaStreamLike) => MediaRecorderLike;
  /** Uploads one chunk (presigned intent + PUT); throws on failure. */
  uploadChunk: (sequence: number, blob: Blob) => Promise<void>;
  /** MediaRecorder timeslice; spec §2.2 = 30 seconds. */
  timesliceMs?: number;
  onPhaseChange?: (phase: RecorderPhase) => void;
}

export const DEFAULT_TIMESLICE_MS = 30_000;

export class ProctoringRecorder {
  private phaseValue: RecorderPhase = 'idle';
  private nextSequence: number;
  /** Sequential queue: at most one chunk in flight, order preserved. */
  private uploadQueue: Promise<void> = Promise.resolve();
  private stream: MediaStreamLike | null = null;
  private recorder: MediaRecorderLike | null = null;
  /** Sequences dropped after 1 failed retry — the admin sees them as gaps. */
  readonly skippedSequences: number[] = [];

  constructor(
    private readonly deps: ProctoringRecorderDeps,
    startSequence = 0
  ) {
    this.nextSequence = startSequence;
  }

  get phase(): RecorderPhase {
    return this.phaseValue;
  }

  private setPhase(phase: RecorderPhase): void {
    this.phaseValue = phase;
    this.deps.onPhaseChange?.(phase);
  }

  /** idle → acquiring → recording. Throws camera_unavailable (phase 'error') on denial. */
  async start(): Promise<void> {
    if (this.phaseValue !== 'idle') return;
    this.setPhase('acquiring');
    try {
      this.stream = await this.deps.getUserMedia();
    } catch {
      this.setPhase('error');
      throw new Error('camera_unavailable');
    }
    this.recorder = this.deps.createRecorder(this.stream);
    this.recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) this.enqueueChunk(event.data);
    };
    this.recorder.start(this.deps.timesliceMs ?? DEFAULT_TIMESLICE_MS);
    this.setPhase('recording');
  }

  /** 1 retry then skip — an upload problem must never interrupt the exam (spec §2.3). */
  private enqueueChunk(blob: Blob): void {
    const sequence = this.nextSequence;
    this.nextSequence += 1;
    this.uploadQueue = this.uploadQueue.then(async () => {
      try {
        await this.deps.uploadChunk(sequence, blob);
      } catch {
        try {
          await this.deps.uploadChunk(sequence, blob);
        } catch {
          this.skippedSequences.push(sequence);
        }
      }
    });
  }

  /** recording → uploading-tail (final dataavailable flushes) → completed. Releases the camera. */
  async stop(): Promise<void> {
    if (this.phaseValue !== 'recording') return;
    this.setPhase('uploading-tail');
    await new Promise<void>((resolve) => {
      if (!this.recorder) {
        resolve();
        return;
      }
      this.recorder.onstop = () => resolve();
      this.recorder.stop();
    });
    await this.uploadQueue;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.setPhase('completed');
  }
}
```

- [ ] **Step 4: Run to verify pass** (same command) → PASS (9 cases).

- [ ] **Step 5: Lint + commit**

```bash
npx eslint apps/frontend/src/features/proctoring --max-warnings=0
git add apps/frontend/src/features/proctoring/recorder.ts apps/frontend/src/features/proctoring/recorder.test.ts
git commit -m "feat(frontend): proctoring recorder state machine — sequential queue, retry-then-skip, resume (Phase 4 Plan B)"
```

---

## Task 13: Frontend learner flow — gate detection, consent panel, REC indicator, stop-on-submit

**Files:**

- Modify: `apps/frontend/src/features/test-player/format.ts` + `format.test.ts` (gate detection extracted to a pure fn)
- Create: `apps/frontend/src/features/proctoring/hooks.ts`
- Create: `apps/frontend/src/features/proctoring/active-recording.ts`
- Create: `apps/frontend/src/features/proctoring/screens.tsx` (learner part)
- Modify: `apps/frontend/src/features/test-player/tests-list-screen.tsx`
- Modify: `apps/frontend/src/features/test-player/test-attempt-screen.tsx`

- [x] **Step 1: Write the failing gate-detection tests.** Append to `apps/frontend/src/features/test-player/format.test.ts`:

```typescript
import { detectStartGate } from './format';

describe('detectStartGate (start-attempt interstitial routing)', () => {
  it('detects the Wave 1 pre-exam-auth gate by message', () => {
    expect(detectStartGate('Identity verification is required before starting this exam')).toBe(
      'pre_exam_auth'
    );
    expect(detectStartGate('pre_exam_auth_required')).toBe('pre_exam_auth');
  });

  it('detects the Plan A identity gate by its non-colliding message', () => {
    expect(
      detectStartGate('Identity confirmation by document is required before starting this exam')
    ).toBe('identity_verification');
    expect(detectStartGate('identity_verification_required')).toBe('identity_verification');
  });

  it('detects the Plan B proctoring gate by its non-colliding message', () => {
    expect(detectStartGate('Video recording must be active before starting this exam')).toBe(
      'proctoring'
    );
    expect(detectStartGate('proctoring_required')).toBe('proctoring');
  });

  it('returns null for other errors and empty input', () => {
    expect(detectStartGate('Attempt limit reached')).toBeNull();
    expect(detectStartGate(null)).toBeNull();
    expect(detectStartGate(undefined)).toBeNull();
  });
});
```

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/features/test-player/format.test.ts --no-file-parallelism` → FAIL (`detectStartGate` missing).

- [x] **Step 2: Implement `detectStartGate`** in `apps/frontend/src/features/test-player/format.ts` (append):

```typescript
export type StartGateKind = 'pre_exam_auth' | 'identity_verification' | 'proctoring' | null;

/**
 * Routes a failed startAttempt error to the right interstitial. useStartAttempt exposes
 * err.message (the backend English message), so the regexes match messages; the codes are
 * kept in the alternation as future-proofing. The three backend gate messages are designed
 * to be mutually non-colliding (asserted by backend tests), so order is mostly cosmetic —
 * most specific first.
 */
export function detectStartGate(error: string | null | undefined): StartGateKind {
  const text = error ?? '';
  if (/identity_verification_required|identity confirmation by document/i.test(text)) {
    return 'identity_verification';
  }
  if (/proctoring_required|video recording must be active/i.test(text)) {
    return 'proctoring';
  }
  if (/pre_exam_auth_required|identity verification is required/i.test(text)) {
    return 'pre_exam_auth';
  }
  return null;
}
```

Run the format test again → PASS.

- [x] **Step 3: hooks.ts** (reads = React Query; the start flow is plain async — it is consumed by the panel's own pending state, mirroring the project's `useState` wrap convention):

```typescript
'use client';

import { useQuery } from '@tanstack/react-query';

import { baseMimeType, proctoringApi, putBlobToPresignedUrl } from './api';
import { useAuth } from '../auth/context';

import type {
  ProctoringRecordingDetail,
  ProctoringRecordingStatus,
  ProctoringRecordingView
} from './types';
import type { UserSession } from '../../entities/session/model';

export function useProctoringQueue(status?: ProctoringRecordingStatus) {
  const { session } = useAuth();
  return useQuery<ProctoringRecordingView[]>({
    queryKey: ['proctoring-recordings', status ?? 'all'],
    enabled: Boolean(session),
    queryFn: () => proctoringApi.list(session!, status)
  });
}

export function useProctoringDetail(id: string) {
  const { session } = useAuth();
  return useQuery<ProctoringRecordingDetail>({
    queryKey: ['proctoring-recordings', 'detail', id],
    enabled: Boolean(session) && Boolean(id),
    queryFn: () => proctoringApi.get(session!, id)
  });
}

/** uploadChunk dep for ProctoringRecorder: presigned intent → PUT (1 chunk at a time). */
export function makeChunkUploader(session: UserSession, recordingId: string) {
  return async (sequence: number, blob: Blob): Promise<void> => {
    const contentType = baseMimeType(blob.type);
    const intent = await proctoringApi.chunkUploadUrl(session, recordingId, {
      sequence,
      originalName: `chunk-${sequence}.${contentType === 'video/mp4' ? 'mp4' : 'webm'}`,
      contentType,
      sizeBytes: blob.size
    });
    await putBlobToPresignedUrl(intent.uploadUrl, blob, contentType);
  };
}
```

- [x] **Step 4: active-recording.ts** — the module-level singleton that survives App Router navigation:

```typescript
import { proctoringApi } from './api';

import type { ProctoringRecorder } from './recorder';
import type { UserSession } from '../../entities/session/model';

/**
 * Phase 4 Plan B: the running recorder must survive the client-side navigation
 * tests list → attempt page (Next App Router does not reload the page). A module-level
 * holder is the deliberate, minimal mechanism: the consent panel sets it, the attempt
 * screen reads it (● REC) and stops + completes it after submit.
 */
interface ActiveProctoringEntry {
  recordingId: string;
  recorder: ProctoringRecorder;
}

let active: ActiveProctoringEntry | null = null;

export function setActiveProctoring(entry: ActiveProctoringEntry): void {
  active = entry;
}

export function getActiveProctoring(): ActiveProctoringEntry | null {
  return active;
}

/**
 * Stops the MediaRecorder (flushes the tail chunk) and completes the backend session.
 * Idempotent and swallow-all: a completion problem must never block the result screen —
 * `POST :id/complete` is idempotent and gets retried by the admin-side semantics anyway.
 */
export async function stopAndCompleteActiveProctoring(session: UserSession): Promise<void> {
  if (!active) return;
  const entry = active;
  active = null;
  try {
    await entry.recorder.stop();
  } finally {
    await proctoringApi.complete(session, entry.recordingId).catch(() => undefined);
  }
}
```

- [x] **Step 5: Learner screens** — create `screens.tsx` with the consent panel + REC indicator (admin screens are added in Task 14; keep one file):

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';

import { proctoringApi } from './api';
import { getActiveProctoring, setActiveProctoring } from './active-recording';
import { makeChunkUploader } from './hooks';
import { ProctoringRecorder } from './recorder';
import { SectionError } from '../../components/state-wrappers';
import { useAuth } from '../auth/context';

import type { MediaStreamLike } from './recorder';
import type { ReactElement } from 'react';

/** Prefer vp8/opus webm (valid chunk concatenation); Safari falls back to the browser default (mp4). */
function supportedRecorderOptions(): MediaRecorderOptions {
  const preferred = 'video/webm;codecs=vp8,opus';
  if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(preferred)) {
    return { mimeType: preferred };
  }
  return {};
}

/**
 * Consent + camera preview + start, rendered inside the tests-list proctoring interstitial.
 * Flow (spec §2.5): start session (idempotent resume) → MediaRecorder → onRecordingStarted()
 * (the caller re-fires startAttempt — the gate now passes).
 */
export function ProctoringStartPanel({
  enrollmentId,
  courseId,
  onRecordingStarted
}: {
  enrollmentId: string;
  courseId: string;
  onRecordingStarted: () => void;
}): ReactElement {
  const { session } = useAuth();
  const [consent, setConsent] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Camera preview — the learner sees what will be recorded BEFORE consenting (152-ФЗ).
  useEffect(() => {
    let cancelled = false;
    void navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() =>
        setError(
          'Камера недоступна. Разрешите доступ к камере и микрофону в браузере. Если камеры нет, обратитесь в учебный центр — администратор может освободить вас от видеозаписи.'
        )
      );
    return () => {
      cancelled = true;
      // Once recording started, the recorder owns the stream — do not stop the tracks here.
      if (!getActiveProctoring()) streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const onStart = async () => {
    if (!session || !consent || !streamRef.current) return;
    setIsStarting(true);
    setError(null);
    try {
      // Idempotent: returns the existing active session after a refresh; its chunks give resume point.
      const recording = await proctoringApi.start(session, {
        enrollmentId,
        courseId,
        consent: true
      });
      const startSequence = recording.chunks.reduce((max, c) => Math.max(max, c.sequence), -1) + 1;
      const stream = streamRef.current;
      const recorder = new ProctoringRecorder(
        {
          getUserMedia: async () => stream as unknown as MediaStreamLike,
          createRecorder: (s) =>
            new MediaRecorder(s as unknown as MediaStream, supportedRecorderOptions()),
          uploadChunk: makeChunkUploader(session, recording.id)
        },
        startSequence
      );
      await recorder.start();
      setActiveProctoring({ recordingId: recording.id, recorder });
      onRecordingStarted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось начать запись');
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className="ui-stack">
      {/* Preview is muted: the learner must not hear their own microphone. */}
      <video ref={videoRef} autoPlay muted playsInline style={{ maxWidth: 320 }} />
      <label className="ui-inline" style={{ gap: 8 }}>
        <input
          type="checkbox"
          checked={consent}
          disabled={isStarting}
          onChange={(e) => setConsent(e.target.checked)}
        />
        <span>Даю согласие на видеозапись экзамена и обработку персональных данных (152-ФЗ)</span>
      </label>
      {error ? <SectionError message={error} /> : null}
      <button
        type="button"
        className="ui-button"
        disabled={!consent || isStarting}
        onClick={() => void onStart()}
      >
        {isStarting ? 'Включаем запись…' : 'Начать запись и экзамен'}
      </button>
    </div>
  );
}

/**
 * ● REC badge for the attempt screen. Reads the module-level holder at render time —
 * it mounts AFTER the recording started (navigation to the attempt page), so a static
 * read is sufficient; no subscription machinery for v1.
 */
export function ProctoringRecIndicator(): ReactElement | null {
  const active = getActiveProctoring();
  if (!active || active.recorder.phase !== 'recording') return null;
  return (
    <span
      style={{ color: '#c00', fontWeight: 700 }}
      aria-label="Идёт видеозапись экзамена"
      data-testid="proctoring-rec-indicator"
    >
      ● REC
    </span>
  );
}
```

> **Executor note:** the `MediaStream → MediaStreamLike` casts are deliberate — the recorder's structural types are narrower than the DOM ones. If `next lint` flags the `<video>` without a track, keep it (live preview has no captions) and add a targeted eslint suppression with a comment, mirroring the `no-img-element` suppressions in identity screens.

- [x] **Step 6: Wire the tests list.** In `tests-list-screen.tsx`, replace the two inline regex consts (lines ~25–35) with the pure helper, and add the proctoring branch to the interstitial chain (after the identity branch, before the generic `start.error` fallback):

```typescript
import {
  detectStartGate,
  formatAttemptsLeft,
  formatLearnerTestStatus,
  formatScoreLine
} from './format';
import { ProctoringStartPanel } from '../proctoring/screens';
```

```typescript
// Gate detection extracted to detectStartGate (format.ts) — messages are designed non-colliding.
const gate = detectStartGate(start.error);
const needsPreExamAuth = gate === 'pre_exam_auth';
const needsIdentityVerification = gate === 'identity_verification';
const needsProctoring = gate === 'proctoring';
```

```tsx
      ) : needsProctoring ? (
        <div className="ui-stack" data-testid="proctoring-interstitial">
          <p className="ui-text-muted">
            Этот экзамен записывается на видео (прокторинг). Включите камеру, дайте согласие и
            нажмите «Начать запись и экзамен».
          </p>
          <ProctoringStartPanel
            enrollmentId={test.enrollmentId}
            courseId={test.courseId}
            onRecordingStarted={() => void onStart()}
          />
        </div>
      ) : start.error ? (
```

(The existing `needsPreExamAuth ? (...) : needsIdentityVerification ? (...)` chain keeps its JSX bodies unchanged — only the flag definitions move to `detectStartGate`.)

- [x] **Step 7: Wire the attempt screen.** In `test-attempt-screen.tsx`:

```typescript
import { stopAndCompleteActiveProctoring } from '../proctoring/active-recording';
import { ProctoringRecIndicator } from '../proctoring/screens';
import { useAuth } from '../auth/context';
```

Inside the component add `const { session } = useAuth();`, render `<ProctoringRecIndicator />` directly after the `<PageHeader …/>` element, and extend `handleSubmit` (line ~75):

```typescript
const handleSubmit = async () => {
  const result = await submitAttempt.mutate(attemptId);
  if (result) {
    // Phase 4 Plan B: stop the webcam recording and complete the session (fire-and-forget —
    // complete is idempotent; a failure must never block the result screen).
    if (session) void stopAndCompleteActiveProctoring(session);
    goToResult();
  }
};
```

- [x] **Step 8: Verify**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/features/test-player src/features/proctoring --no-file-parallelism` → PASS.
Run: `pnpm typecheck` → 8/8. `npx eslint apps/frontend/src/features/proctoring apps/frontend/src/features/test-player --max-warnings=0` → clean.

- [x] **Step 9: Commit**

```bash
git add apps/frontend/src/features/proctoring apps/frontend/src/features/test-player
git commit -m "feat(frontend): proctoring learner flow — gate interstitial, consent panel, REC, stop-on-submit (Phase 4 Plan B)"
```

---

## Task 14: Frontend admin pages + navigation + e2e smoke

**Files:**

- Modify: `apps/frontend/src/features/proctoring/screens.tsx` (admin screens)
- Create: `apps/frontend/app/admin/proctoring-recordings/page.tsx`
- Create: `apps/frontend/app/admin/proctoring-recordings/[id]/page.tsx`
- Modify: `apps/frontend/src/features/navigation/model.ts`
- Create: `apps/frontend/src/e2e/proctoring.e2e.test.ts`

- [x] **Step 1: Write the failing e2e smoke** (`src/e2e/proctoring.e2e.test.ts`), mirroring `identity-verification.e2e.test.ts` (same imports/fixtures):

```typescript
/**
 * Phase 4 Plan B — E2E smoke для прокторинга (admin queue + detail + learner-flow модули).
 * Конвенции проекта: routing/permission через evaluateRouteAccess + getVisibleNavigation,
 * dynamic-import smoke; реального React mount нет (RTL не в зависимостях).
 */

import { describe, expect, it } from 'vitest';

import { evaluateRouteAccess, getVisibleNavigation } from '../features/navigation/helpers';

import type { UserSession } from '../entities/session/model';

const adminWithProctoringRead: UserSession = {
  user: {
    id: 'u_admin',
    tenantId: 'tenant_demo',
    login: 'admin',
    email: null,
    status: 'active',
    displayName: 'Admin'
  },
  tokens: { accessToken: 'a', sessionId: 's1', expiresIn: 1000 },
  roles: ['tenant_admin'],
  permissions: ['proctoring.read']
};

const adminUnrelated: UserSession = { ...adminWithProctoringRead, permissions: ['courses.read'] };

describe('proctoring — routing', () => {
  it('/admin/proctoring-recordings: allowed with proctoring.read', () => {
    expect(evaluateRouteAccess('/admin/proctoring-recordings', adminWithProctoringRead)).toEqual({
      kind: 'ok'
    });
  });

  it('/admin/proctoring-recordings: forbidden without proctoring.read', () => {
    expect(evaluateRouteAccess('/admin/proctoring-recordings', adminUnrelated)).toEqual({
      kind: 'forbidden'
    });
  });

  it('/admin/proctoring-recordings/[id] detail: allowed with proctoring.read, forbidden without', () => {
    expect(
      evaluateRouteAccess('/admin/proctoring-recordings/prec-abc-1', adminWithProctoringRead)
    ).toEqual({ kind: 'ok' });
    expect(evaluateRouteAccess('/admin/proctoring-recordings/prec-abc-1', adminUnrelated)).toEqual({
      kind: 'forbidden'
    });
  });

  it('/admin/proctoring-recordings: redirect-login when no session', () => {
    expect(evaluateRouteAccess('/admin/proctoring-recordings', null)).toEqual({
      kind: 'redirect-login'
    });
  });

  it('the legacy /proctoring stub route is untouched (tenant.read, not proctoring.read)', () => {
    expect(evaluateRouteAccess('/proctoring', adminWithProctoringRead)).toEqual({
      kind: 'forbidden'
    });
  });
});

describe('proctoring — navigation visibility', () => {
  it('«Записи прокторинга» visible only with proctoring.read', () => {
    expect(getVisibleNavigation(adminWithProctoringRead).map((i) => i.href)).toContain(
      '/admin/proctoring-recordings'
    );
    expect(getVisibleNavigation(adminUnrelated).map((i) => i.href)).not.toContain(
      '/admin/proctoring-recordings'
    );
  });
});

describe('proctoring — module smoke', () => {
  it('screens module loads and exports the four components', async () => {
    const mod = await import('../features/proctoring/screens');
    expect(typeof mod.ProctoringStartPanel).toBe('function');
    expect(typeof mod.ProctoringRecIndicator).toBe('function');
    expect(typeof mod.AdminProctoringQueueScreen).toBe('function');
    expect(typeof mod.AdminProctoringDetailScreen).toBe('function');
  });

  it('recorder + active-recording + hooks + format modules load', async () => {
    const recorder = await import('../features/proctoring/recorder');
    expect(typeof recorder.ProctoringRecorder).toBe('function');
    const holder = await import('../features/proctoring/active-recording');
    expect(typeof holder.stopAndCompleteActiveProctoring).toBe('function');
    const hooks = await import('../features/proctoring/hooks');
    expect(typeof hooks.useProctoringQueue).toBe('function');
    expect(typeof hooks.useProctoringDetail).toBe('function');
    const format = await import('../features/proctoring/format');
    expect(typeof format.formatProctoringStatus).toBe('function');
    expect(typeof format.chunkIssueLabel).toBe('function');
  });
});
```

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/e2e/proctoring.e2e.test.ts --no-file-parallelism` → FAIL (routes/nav/screens missing).

- [x] **Step 2: Admin screens** — append to `features/proctoring/screens.tsx` (imports merge with the learner part: add `DataTable`, `LoadingState` from `@cdoprof/ui`, `Link` from `next/link`, `PageContainer`/`PageHeader`/`SectionCard`/`SectionEmpty` from `../../components/state-wrappers`, hooks and format helpers):

```tsx
const STATUS_FILTER_OPTIONS: Array<{
  value: ProctoringRecordingStatus | undefined;
  label: string;
}> = [
  { value: undefined, label: 'Все' },
  { value: 'recording', label: 'Идёт запись' },
  { value: 'completed', label: 'Завершённые' }
];

interface QueueRow {
  id: string;
  learnerNameView: string;
  courseTitleView: string;
  statusView: string;
  startedAtView: string;
  chunksView: string;
  actionView: ReactElement;
}

export function AdminProctoringQueueScreen(): ReactElement {
  const [statusFilter, setStatusFilter] = useState<ProctoringRecordingStatus | undefined>(
    undefined
  );
  const { data, isLoading, error } = useProctoringQueue(statusFilter);

  const rows: QueueRow[] = (data ?? []).map((item) => ({
    id: item.id,
    learnerNameView: item.learnerName || '—',
    courseTitleView: item.courseTitle || '—',
    statusView: formatProctoringStatus(item.recordingStatus),
    startedAtView: formatDateShort(item.startedAt),
    chunksView: item.purgedAt ? 'удалена по сроку' : String(item.chunks.length),
    actionView: (
      <Link href={`/admin/proctoring-recordings/${item.id}`} className="ui-button">
        Открыть
      </Link>
    )
  }));

  return (
    <PageContainer>
      <PageHeader
        title="Записи прокторинга"
        subtitle="Видеозаписи итоговых экзаменов (веб-камера слушателя)"
      />
      <SectionCard title="Сеансы записи">
        <div className="ui-inline" style={{ marginBottom: 12, gap: 8 }}>
          <span>Статус:</span>
          {STATUS_FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value ?? 'all'}
              type="button"
              className="ui-button"
              style={statusFilter === opt.value ? { fontWeight: 700 } : undefined}
              onClick={() => setStatusFilter(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {isLoading ? <LoadingState message="Загрузка…" /> : null}
        {error ? <SectionError message="Не удалось загрузить записи прокторинга" /> : null}
        {!isLoading && !error && rows.length === 0 ? (
          <SectionEmpty message="Записей нет" hint="Нет сеансов с выбранным статусом" />
        ) : null}
        {!isLoading && !error && rows.length > 0 ? (
          <DataTable<QueueRow>
            columns={[
              { key: 'learnerNameView', title: 'Слушатель' },
              { key: 'courseTitleView', title: 'Курс' },
              { key: 'statusView', title: 'Статус' },
              { key: 'startedAtView', title: 'Начата' },
              { key: 'chunksView', title: 'Фрагменты' },
              { key: 'actionView', title: '', render: (row) => row.actionView }
            ]}
            rows={rows}
          />
        ) : null}
      </SectionCard>
    </PageContainer>
  );
}

export function AdminProctoringDetailScreen({ id }: { id: string }): ReactElement {
  const { data: detail, isLoading, error } = useProctoringDetail(id);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isAssembling, setIsAssembling] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);

  // Revoke the blob URL on unmount/replace (memory hygiene for multi-hundred-MB videos).
  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  if (isLoading) return <LoadingState message="Загрузка…" />;
  if (error || !detail) return <SectionError message="Не удалось загрузить запись" />;

  // Chunks of ONE MediaRecorder session concatenate validly (container header in chunk 0);
  // after a resume the new segment starts with a fresh header — players tolerate it, and the
  // gap is reported below anyway (spec §2.8).
  const onAssemble = async () => {
    setIsAssembling(true);
    setPlayerError(null);
    try {
      const parts: Blob[] = [];
      for (const chunk of detail.playbackChunks) {
        const res = await fetch(chunk.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        parts.push(await res.blob());
      }
      const assembled = new Blob(parts, { type: 'video/webm' });
      setVideoUrl(URL.createObjectURL(assembled));
    } catch {
      setPlayerError('Не удалось собрать запись — попробуйте ещё раз');
    } finally {
      setIsAssembling(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title={`Запись: ${detail.learnerName || detail.id}`}
        subtitle={`${detail.courseTitle} · ${formatProctoringStatus(detail.recordingStatus)}`}
      />
      <SectionCard title="Сеанс">
        <p>
          <strong>Согласие на видеозапись (152-ФЗ):</strong> {formatDateShort(detail.consentAt)}
        </p>
        <p>
          <strong>Начата:</strong> {formatDateShort(detail.startedAt)} · <strong>Завершена:</strong>{' '}
          {formatDateShort(detail.completedAt)}
        </p>
        <p>
          <strong>Попытка:</strong> {detail.attemptId ?? '—'}
          {detail.attemptStatus ? ` (${detail.attemptStatus})` : ''}
        </p>
      </SectionCard>
      <SectionCard title="Видео">
        {detail.purgedAt ? (
          <p className="ui-text-muted">
            Видео удалено по сроку хранения ({formatDateShort(detail.purgedAt)}). Метаданные сеанса
            сохранены.
          </p>
        ) : (
          <div className="ui-stack">
            {detail.chunkIssues.length > 0 ? (
              <ul className="ui-list">
                {detail.chunkIssues.map((issue) => (
                  <li key={`${issue.sequence}:${issue.code}`} className="ui-text-muted">
                    ⚠ {chunkIssueLabel(issue)}
                  </li>
                ))}
              </ul>
            ) : null}
            {detail.playbackChunks.length === 0 ? (
              <p className="ui-text-muted">Нет доступных фрагментов</p>
            ) : videoUrl ? (
              <video controls src={videoUrl} style={{ maxWidth: 640, width: '100%' }} />
            ) : (
              <button
                type="button"
                className="ui-button"
                disabled={isAssembling}
                onClick={() => void onAssemble()}
              >
                {isAssembling
                  ? 'Скачиваем фрагменты…'
                  : `Собрать и воспроизвести (${detail.playbackChunks.length} фрагм.)`}
              </button>
            )}
            {playerError ? <SectionError message={playerError} /> : null}
          </div>
        )}
      </SectionCard>
    </PageContainer>
  );
}
```

(Extend the file's import block accordingly: `useEffect` is already imported for the learner panel; add `ProctoringRecordingStatus` to the type imports, `chunkIssueLabel`, `formatDateShort`, `formatProctoringStatus` from `./format`, `useProctoringDetail`, `useProctoringQueue` from `./hooks`.)

- [x] **Step 3: Pages.** `app/admin/proctoring-recordings/page.tsx`:

```tsx
'use client';

import { AdminProctoringQueueScreen } from '../../../src/features/proctoring/screens';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default function AdminProctoringRecordingsPage() {
  return (
    <ProtectedPage>
      <AdminProctoringQueueScreen />
    </ProtectedPage>
  );
}
```

`app/admin/proctoring-recordings/[id]/page.tsx` — copy the `params: Promise` idiom from `app/admin/identity-verifications/[id]/page.tsx` verbatim:

```tsx
import { AdminProctoringDetailScreen } from '../../../../src/features/proctoring/screens';
import { ProtectedPage } from '../../../../src/widgets/shell/protected-page';

interface AdminProctoringDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminProctoringDetailPage({
  params
}: AdminProctoringDetailPageProps) {
  const { id } = await params;
  return (
    <ProtectedPage>
      <AdminProctoringDetailScreen id={id} />
    </ProtectedPage>
  );
}
```

(Check whether `app/admin/identity-verifications/page.tsx` uses `'use client'` and mirror it exactly for the list page.)

- [x] **Step 4: Navigation.** In `features/navigation/model.ts` — `routeMeta`, directly after the `/admin/identity-verifications` entries (line ~92; `[id]` pattern BEFORE the bare pattern, matching the identity ordering):

```typescript
  {
    pattern: '/admin/proctoring-recordings/[id]',
    meta: { public: false, requiredPermissions: ['proctoring.read'] }
  },
  {
    pattern: '/admin/proctoring-recordings',
    meta: { public: false, requiredPermissions: ['proctoring.read'] }
  },
```

`navigationModel`, after the «Идентификация» entry (line ~419):

```typescript
  {
    href: '/admin/proctoring-recordings',
    label: 'Записи прокторинга',
    requiredPermissions: ['proctoring.read'],
    navSlot: 'more'
  }
```

> The pre-existing `/proctoring` routeMeta + «Прокторинг» nav item (integrations stub, `tenant.read`) stay untouched.

- [x] **Step 5: Verify**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/e2e/proctoring.e2e.test.ts src/e2e/lms-role-flows.e2e.test.ts src/features/proctoring --no-file-parallelism` → PASS (if a role-flow snapshot enumerates nav items, update it deliberately).
Run: `pnpm test:frontend` → PASS (full frontend suite works on this machine).
Run: `pnpm typecheck` → 8/8; `npx eslint apps/frontend/src/features/proctoring apps/frontend/app/admin/proctoring-recordings apps/frontend/src/features/navigation/model.ts apps/frontend/src/e2e/proctoring.e2e.test.ts --max-warnings=0` → clean.

- [x] **Step 6: Commit**

```bash
git add apps/frontend/src/features/proctoring apps/frontend/app/admin/proctoring-recordings apps/frontend/src/features/navigation/model.ts apps/frontend/src/e2e/proctoring.e2e.test.ts
git commit -m "feat(frontend): proctoring admin queue + chunk-stitching player + navigation + e2e smoke (Phase 4 Plan B)"
```

---

## Task 15: Quality gate + docs/ops sync

**Files:**

- Modify: `infra/.env.production.example`
- Modify: `README.md` (§2 AI Agent State)
- Modify: `LMS_AGENT_HANDOFF.md` (append the next §5.XX)
- Modify: `docs/superpowers/plans/2026-06-11-phase-4-plan-b-proctoring.md` (tick checkboxes)

- [ ] **Step 1: Run the full Verification block** from the top of this plan. Fix anything found; commit fixes as separate commits.

- [ ] **Step 2: env example.** In `infra/.env.production.example`, directly after the identity retention block (line ~92), mirroring its comment style:

```bash
# --- Proctoring video retention (Phase 4 Plan B): stays OFF until the 365-day policy is confirmed ---
# When enabled, a nightly cron (UTC) deletes exam video chunks 365 days after the session ended;
# the session record (consent, attempt link) itself persists.
PROCTORING_VIDEO_RETENTION_ENABLED=false
PROCTORING_RETENTION_CRON_SCHEDULE=0 5 * * *
```

- [ ] **Step 3: Handoff protocol** (docs/DOCUMENTATION_MAP.md §agent-handoff-protocol): update README §2 (Current Stage / Last Completed / Current / Next / Last Updated At / By), append the next sequential `### 5.XX` entry to LMS_AGENT_HANDOFF.md §5 (summary, files changed, test status, deviations; cross-link this plan + the spec), and tick the completed checkboxes in THIS plan file. Mention any follow-ups spawned during the session.

- [ ] **Step 4: Commit**

```bash
git add infra/.env.production.example README.md LMS_AGENT_HANDOFF.md docs/superpowers/plans/2026-06-11-phase-4-plan-b-proctoring.md
git commit -m "docs(handoff): Phase 4 Plan B session record + proctoring env example"
```

---

## Spec coverage map (self-check)

| Spec requirement (§1 table)               | Tasks      |
| ----------------------------------------- | ---------- |
| 1. Запись видео во время итогового теста  | 12, 13     |
| 2. UI согласия (152-ФЗ), consentAt, аудит | 1, 4, 13   |
| 3. Чанк-аплоад на сервер (presigned PUT)  | 5, 12, 13  |
| 4. S3 + метаданные в БД                   | 1, 2, 5    |
| 5. Cron автоудаления по сроку             | 10, 15     |
| 6. UI просмотра записи в админке          | 7, 14      |
| 7. Per-student переключатель              | 1, 3, 8, 9 |

Locked decisions §2.1–2.12 → tasks: MediaRecorder/timeslice (12, 13), partial-success retry-skip (12), 412 gate + non-collision (6, 13), session-before-attempt + attemptId link (4, 6), effective requirement (3), complete + abandoned sessions (5, 10), resume (5, 12, 13), retention 365/dormant/lock/write-runner (10), admin playback + infected exclusion (7, 14), permissions (1, 9), migration 0051 (1).
