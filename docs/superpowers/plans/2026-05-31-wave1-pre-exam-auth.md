# Wave 1 · Plan 2 — Pre-Exam Identity Authentication (Приказ Минобрнауки №816) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Before a learner starts a **final/course-level exam** in a group that requires it, force identity confirmation via a single-use e-mailed link; record the verified fact on the attempt and surface it in the result — enforced server-side in `MvpService.startAttempt`.

**Architecture:** This is feature **(C)** of the Wave 1 design (`docs/superpowers/specs/2026-05-30-wave1-module-gating-pre-exam-auth-design.md` §3.C). It mirrors Plan 1's shape: all enforcement converges on `MvpService.startAttempt` via one new private guard `assertPreExamAuthGate`. A new MVP state collection `preExamTokens` stores single-use tokens (SHA-256 hash, TTL) — **a consumed token IS the verification record** (no second collection). The token crypto is a small pure module (`pre-exam-token.ts`) mirroring `MagicLinkService`. Two endpoints (`request` / `verify`) bracket the link flow; the frontend test-player shows an interstitial when the gate blocks and a verify page redeems the link. The server remains the single source of truth.

**Tech Stack:** NestJS (request-scoped in-memory MVP state, JSONB snapshot persistence), TypeScript, Vitest, PostgreSQL numbered SQL migrations, Next.js 15 App Router + React Query frontend.

**Source of truth for rules:** legacy FAQ §9 (аутентификация перед экзаменом, Приказ Минобрнауки №816): identity confirmed by an e-mailed link before the certifying exam; once verified, repeat attempts of the **same** exam run normally; a **different** final exam requires new verification.

---

## Locked design decisions (read before starting)

These resolve the design's open choices. Do not re-litigate during execution; if a decision proves wrong, stop and raise it.

1. **Storage = MVP collection, not a repo abstraction.** Unlike IAM's `MagicLinkTokenRepo` (interface + in-memory + postgres + DI tokens), pre-exam tokens are exam-domain state owned by `MvpService`. Add a `preExamTokens` collection to `InMemoryMvpState` and register it in `mvp-collections.ts`. Runtime persistence is the existing JSONB snapshot (`writeSnapshotToTable` iterates `MVP_COLLECTIONS`) — **no per-row table is needed for runtime.** The `assessment.pre_exam_tokens` SQL table (Task 1) is the **typed schema contract** (mirrors how Plan 1's `0043` added `tests.module_id`, per the `0016` JSONB-contract rule "domain FKs stay typed").
2. **A consumed token IS the verification record.** A `PreExamToken` with `consumedAt` set, bound to `(enrollmentId, testId)`, is the proof of verification. The gate checks for such a token; no separate `preExamVerifications` collection. This satisfies "repeat attempts of the same exam are not re-prompted" (the consumed token persists) and "a different final exam needs new verification" (tokens are per-`testId`).
3. **Gate scope = final/course-level exams only.** `assertPreExamAuthGate` returns early when `test.moduleId` is set (intermediate module tests are never identity-gated). This matches №816's intent (identity before the **certifying** exam) and the design phrase "другой **итоговый** экзамен — новая верификация", and avoids re-prompting on every module quiz. A course with no modules has a single `moduleId === undefined` test → gated correctly.
4. **E-mail = logging stub, no constructor change.** `MvpService` has a fixed 6-arg constructor (`state, tenantRepo, audit, documents, files, eventEmitter`) used by every `makeServices()` helper — do **not** add a 7th DI arg. Instead `MvpService` gets a private `Logger` field and logs the verification URL (exactly mirroring `LoggingMagicLinkEmailSender`). `requestPreExamToken` returns `{ delivered: true }` and **never returns the raw token** (no self-verify bypass). A real e-mail adapter is a documented follow-up (roadmap Tier 4 #22 / SendPulse); in dev/pilot the operator reads the link from logs, identical to how magic-link works today.
5. **Token crypto mirrors magic-link exactly:** `randomBytes(32).toString('base64url')` raw token, `createHash('sha256').update(raw).digest('hex')` stored hash, 15-minute TTL.

---

## File Structure

**Backend (enforcement — the must-have core):**

- `apps/backend/migrations/0044_assessment_pre_exam_auth.sql` — _Create._ Typed contract: `group_courses.requires_pre_exam_auth`, `test_attempts.identity_*`, new `assessment.pre_exam_tokens` table.
- `apps/backend/src/modules/mvp/mvp.types.ts` — _Modify._ `GroupCourse.requiresPreExamAuth?`, `TestAttempt.identityVerifiedAt?` + `identityVerificationTokenId?`, new `PreExamToken` interface.
- `apps/backend/src/modules/mvp/infrastructure/in-memory-mvp.state.ts` — _Modify._ Add `preExamTokens: PreExamToken[] = []`.
- `apps/backend/src/modules/mvp/infrastructure/mvp-collections.ts` — _Modify._ Add `'preExamTokens'` to `MVP_COLLECTIONS`.
- `apps/backend/src/modules/mvp/pre-exam-token.ts` — _Create._ Pure crypto: `generatePreExamToken`, `hashPreExamToken`, `buildPreExamAuthUrl`, `PRE_EXAM_TOKEN_TTL_MS`.
- `apps/backend/src/modules/mvp/pre-exam-token.test.ts` — _Create._ Unit tests for the pure helpers.
- `apps/backend/src/modules/mvp/mvp.dto.ts` — _Modify._ `requiresPreExamAuth?` on the two group-course DTOs; new `RequestPreExamTokenRequest` + `VerifyPreExamTokenRequest`.
- `apps/backend/src/modules/mvp/mvp.service.ts` — _Modify._ Private `Logger`; `requestPreExamToken`, `verifyPreExamToken`, `assertPreExamAuthGate` + wire into `startAttempt`; persist flag in `createGroupCourse`/`updateGroupCourse`; stamp identity fields on the attempt.
- `apps/backend/src/modules/mvp/pre-exam-auth.service.test.ts` — _Create._ Service unit tests for the request/verify/gate flow.
- `apps/backend/src/modules/mvp/mvp.dto-validation.test.ts` — _Modify._ Validation for the new DTOs.
- `apps/backend/src/modules/mvp/mvp.controller.ts` — _Modify._ Two endpoints under `assessment.attempts.take`.
- `apps/backend/src/modules/mvp/assessment-admin.http.integration.test.ts` — _Modify._ Permission-boundary tests for the two endpoints.

**Frontend (reflect the gate):**

- `apps/frontend/src/features/test-player/types.ts` — _Modify._ `AttemptDto.identityVerifiedAt?`; payload/response types for request/verify.
- `apps/frontend/src/features/test-player/api.ts` — _Modify._ `requestPreExamToken`, `verifyPreExamToken`.
- `apps/frontend/src/features/test-player/api.contract.test.ts` — _Modify._ Contract tests for the two new calls.
- `apps/frontend/src/features/test-player/hooks.ts` — _Modify._ `useRequestPreExamToken`.
- `apps/frontend/src/features/test-player/tests-list-screen.tsx` — _Modify._ Interstitial on `pre_exam_auth_required`.
- `apps/frontend/src/features/test-player/test-result-screen.tsx` — _Modify._ "Идентификация пройдена" marker.
- `apps/frontend/app/exam-auth/[token]/page.tsx` — _Create._ Verify page (mirrors `app/login/magic-link/[token]/page.tsx`).

**Testing note (Windows + Cyrillic path):** run single files with `--no-file-parallelism` (CLAUDE.md Gotchas). Never run the full backend suite locally — rely on isolated runs + CI.

---

## Task 1: DB migration — pre-exam auth typed contract

**Files:**

- Create: `apps/backend/migrations/0044_assessment_pre_exam_auth.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 0044_assessment_pre_exam_auth.sql
-- Wave 1 Plan 2 (Приказ Минобрнауки №816): identity authentication before a
-- final/course-level exam.
--   * group_courses.requires_pre_exam_auth — per-group-course toggle.
--   * test_attempts.identity_verified_at / identity_verification_token_id — fact
--     recorded on the attempt (mirrors TestAttempt.identityVerifiedAt / *TokenId).
--   * assessment.pre_exam_tokens — single-use, hash-only, TTL tokens (mirrors
--     iam.magic_link_tokens) + exam context (enrollment_id, test_id, learner_id).
-- Additive + nullable/defaulted — safe on existing rows. Idempotent.
-- NOTE: runtime MVP state persists as a JSONB snapshot; these typed columns are
-- the schema contract (0016) — domain FKs/flags stay typed.

BEGIN;

-- (C) per-group-course toggle: does this course's final exam require identity auth?
ALTER TABLE learning.group_courses
  ADD COLUMN IF NOT EXISTS requires_pre_exam_auth boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN learning.group_courses.requires_pre_exam_auth IS
  'Приказ №816: require identity verification before the final exam; MVP JSON store mirrors this field.';

-- fact recorded on the attempt when identity was verified before start.
ALTER TABLE assessment.test_attempts
  ADD COLUMN IF NOT EXISTS identity_verified_at timestamptz;

ALTER TABLE assessment.test_attempts
  ADD COLUMN IF NOT EXISTS identity_verification_token_id text;

COMMENT ON COLUMN assessment.test_attempts.identity_verified_at IS
  'When the learner confirmed identity (Приказ №816) before this attempt; MVP JSON store mirrors this field.';

-- single-use identity tokens; hash-only storage; raw token only in the e-mail link.
CREATE TABLE IF NOT EXISTS assessment.pre_exam_tokens (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id text NOT NULL,
  enrollment_id text NOT NULL,
  test_id text NOT NULL,
  learner_id text NOT NULL,
  token_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  verified_by_actor_id text
);

CREATE UNIQUE INDEX IF NOT EXISTS pre_exam_tokens_token_hash_uidx
  ON assessment.pre_exam_tokens (tenant_id, token_hash);

CREATE INDEX IF NOT EXISTS pre_exam_tokens_context_idx
  ON assessment.pre_exam_tokens (tenant_id, enrollment_id, test_id, consumed_at);

COMMENT ON TABLE assessment.pre_exam_tokens IS
  'Pre-exam identity tokens (Приказ №816). Hash-only storage; a consumed token is the verification record. MVP JSON store mirrors this collection.';

COMMIT;
```

- [ ] **Step 2: Run the migration test suite to verify it applies**

Run: `pnpm test:migrations`
Expected: PASS — `0044` applies cleanly after `0043` (no SQL/ordering errors). If a test enumerates the latest migration number, update it.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/migrations/0044_assessment_pre_exam_auth.sql
git commit -m "feat(backend): pre-exam auth typed contract — group flag, attempt fields, tokens (Wave 1 Plan 2)"
```

---

## Task 2: Model + state collection + group-course DTO flag

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.types.ts`
- Modify: `apps/backend/src/modules/mvp/infrastructure/in-memory-mvp.state.ts`
- Modify: `apps/backend/src/modules/mvp/infrastructure/mvp-collections.ts`
- Modify: `apps/backend/src/modules/mvp/mvp.dto.ts` (`CreateGroupCourseRequest`, `UpdateGroupCourseRequest`)

- [ ] **Step 1: Add `requiresPreExamAuth` to `GroupCourse`**

In `apps/backend/src/modules/mvp/mvp.types.ts`, inside `export interface GroupCourse extends BaseEntity {` (after `durationDays?: number;`, line ~94):

```typescript
  /** Wave 1 Plan 2 (Приказ №816): require identity verification before the final exam. */
  requiresPreExamAuth?: boolean;
```

- [ ] **Step 2: Add identity fields to `TestAttempt`**

In `apps/backend/src/modules/mvp/mvp.types.ts`, inside `export interface TestAttempt extends BaseEntity {` (after `reviewedBy?: string;`, line ~318):

```typescript
  /** Wave 1 Plan 2: when identity was verified (Приказ №816) before this attempt. */
  identityVerifiedAt?: string;
  /** The consumed PreExamToken.id that proved identity for this attempt. */
  identityVerificationTokenId?: string;
```

- [ ] **Step 3: Add the `PreExamToken` interface**

In `apps/backend/src/modules/mvp/mvp.types.ts`, add after the `TestAttempt` / `Attempt` block (after line ~321):

```typescript
/**
 * Wave 1 Plan 2 (Приказ №816): single-use identity token e-mailed to the learner
 * before a final exam. Hash-only storage; a token with `consumedAt` set is the
 * verification record for its `(enrollmentId, testId)`.
 */
export interface PreExamToken extends BaseEntity {
  enrollmentId: string;
  testId: string;
  learnerId: string;
  tokenHash: string;
  expiresAt: string;
  consumedAt?: string;
  verifiedByActorId?: string;
}
```

- [ ] **Step 4: Register the collection in `InMemoryMvpState`**

In `apps/backend/src/modules/mvp/infrastructure/in-memory-mvp.state.ts`:

(a) Add `PreExamToken` to the type import (alphabetical-ish, near `ModuleProgress`):

```typescript
  ModuleProgress,
  PreExamToken,
  Question,
```

(b) Add the array field after `courseDocumentSets` (line ~70):

```typescript
  // Wave 1 Plan 2 — pre-exam identity tokens (Приказ №816); a consumed token is the verification record.
  preExamTokens: PreExamToken[] = [];
```

- [ ] **Step 5: Register the collection key in `mvp-collections.ts`**

In `apps/backend/src/modules/mvp/infrastructure/mvp-collections.ts`, add `'preExamTokens'` to the `MVP_COLLECTIONS` array after `'courseDocumentSets'`:

```typescript
('courseDocumentSets', 'preExamTokens');
```

> ⚠️ Steps 4 and 5 MUST land together — a collection missing from either list is silently lost between HTTP requests (CLAUDE.md).

- [ ] **Step 6: Add `requiresPreExamAuth` to the group-course DTOs**

In `apps/backend/src/modules/mvp/mvp.dto.ts`, inside `CreateGroupCourseRequest` (after `durationDays?`, line ~256):

```typescript
  @IsOptional()
  @IsBoolean()
  requiresPreExamAuth?: boolean;
```

And inside `UpdateGroupCourseRequest` (after its `durationDays?`, line ~265):

```typescript
  @IsOptional()
  @IsBoolean()
  requiresPreExamAuth?: boolean;
```

Ensure `IsBoolean` is in the `class-validator` import at the top of the file (add it if missing).

- [ ] **Step 7: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (8/8). The new collection type flows through `MVP_COLLECTIONS` (which is `as const`), the state class, and the snapshot backend with no further change.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/modules/mvp/mvp.types.ts apps/backend/src/modules/mvp/infrastructure/in-memory-mvp.state.ts apps/backend/src/modules/mvp/infrastructure/mvp-collections.ts apps/backend/src/modules/mvp/mvp.dto.ts
git commit -m "feat(backend): pre-exam token model + collection + group-course flag (Wave 1 Plan 2)"
```

---

## Task 3: Pure token crypto helper

**Files:**

- Create: `apps/backend/src/modules/mvp/pre-exam-token.ts`
- Create: `apps/backend/src/modules/mvp/pre-exam-token.test.ts`

- [ ] **Step 1: Write the failing unit test**

Create `apps/backend/src/modules/mvp/pre-exam-token.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import {
  PRE_EXAM_TOKEN_TTL_MS,
  buildPreExamAuthUrl,
  generatePreExamToken,
  hashPreExamToken
} from './pre-exam-token.js';

describe('pre-exam-token crypto', () => {
  it('generates a high-entropy url-safe raw token', () => {
    const token = generatePreExamToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/); // base64url
    expect(token.length).toBeGreaterThanOrEqual(40);
  });

  it('generates a different token each call', () => {
    expect(generatePreExamToken()).not.toBe(generatePreExamToken());
  });

  it('hashes deterministically to a 64-char sha-256 hex', () => {
    const hash = hashPreExamToken('abc');
    expect(hash).toBe(hashPreExamToken('abc'));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('does not store the raw token in its hash', () => {
    const raw = generatePreExamToken();
    expect(hashPreExamToken(raw)).not.toContain(raw);
  });

  it('builds a verify URL that embeds the (encoded) raw token', () => {
    const url = buildPreExamAuthUrl('a b/c');
    expect(url).toContain('/exam-auth/');
    expect(url).toContain(encodeURIComponent('a b/c'));
  });

  it('uses a 15-minute TTL', () => {
    expect(PRE_EXAM_TOKEN_TTL_MS).toBe(15 * 60 * 1000);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/pre-exam-token.test.ts --no-file-parallelism`
Expected: FAIL — `./pre-exam-token` does not exist.

- [ ] **Step 3: Implement the helper**

Create `apps/backend/src/modules/mvp/pre-exam-token.ts`:

```typescript
import { createHash, randomBytes } from 'node:crypto';

import { backendEnv } from '../../env.js';

/** Token lifetime — mirrors the magic-link 15-minute default. */
export const PRE_EXAM_TOKEN_TTL_MS = 15 * 60 * 1000;

/** High-entropy, URL-safe raw token. Only ever exists in the e-mailed link. */
export function generatePreExamToken(): string {
  return randomBytes(32).toString('base64url');
}

/** SHA-256 hex of the raw token; only the hash is persisted. */
export function hashPreExamToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

/** Public verify-link the learner clicks (mirrors buildMagicLinkUrl). */
export function buildPreExamAuthUrl(rawToken: string): string {
  const base = backendEnv.PUBLIC_BASE_URL.replace(/\/+$/, '');
  return `${base}/exam-auth/${encodeURIComponent(rawToken)}`;
}
```

> Verify the import path: `mvp/pre-exam-token.ts` → `../../env.js` resolves to `apps/backend/src/env.ts`. Confirm `backendEnv.PUBLIC_BASE_URL` exists (it is used by `magic-link-email-sender.ts`).

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/pre-exam-token.test.ts --no-file-parallelism`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/mvp/pre-exam-token.ts apps/backend/src/modules/mvp/pre-exam-token.test.ts
git commit -m "feat(backend): pure pre-exam token crypto helper (Wave 1 Plan 2)"
```

---

## Task 4: Service core — request / verify / gate

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.service.ts`
- Create: `apps/backend/src/modules/mvp/pre-exam-auth.service.test.ts`

- [ ] **Step 1: Write the failing service test**

Create `apps/backend/src/modules/mvp/pre-exam-auth.service.test.ts`:

```typescript
import { EventEmitter2 } from '@nestjs/event-emitter';
import { describe, expect, it } from 'vitest';

import { InMemoryMvpState } from './infrastructure/in-memory-mvp.state.js';
import { hashPreExamToken } from './pre-exam-token.js';
import { MvpService } from './mvp.service.js';
import { TenantScopedRepository } from '../../infrastructure/database/tenant-repository.js';
import { AuditService } from '../audit/audit.service.js';

import type { RequestContext } from '../../common/context/request-context.js';
import type { DocumentsService } from '../documents/documents.service.js';
import type { FilesService } from '../files/files.service.js';

const noopDocumentsService = {
  listDocuments: () => ({ items: [], page: 1, pageSize: 50, total: 0 })
} as unknown as DocumentsService;
const noopFilesService = {
  ensureMaterialLink: async () => undefined
} as unknown as FilesService;

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

function makeService(): MvpService {
  return new MvpService(
    new InMemoryMvpState(),
    new TenantScopedRepository(),
    new AuditService(),
    noopDocumentsService,
    noopFilesService,
    new EventEmitter2()
  );
}

/** course → group → groupCourse(requiresPreExamAuth) → learner → enrollment → bank → final test (no moduleId). */
function seedFinalExam(service: MvpService, requiresPreExamAuth: boolean) {
  const course = service.createCourse(T, ADMIN, { code: 'C1', title: 'Course' }, ctx);
  const group = service.createGroup(T, ADMIN, { code: 'G1', name: 'Group' }, ctx);
  service.createGroupCourse(T, { groupId: group.id, courseId: course.id, requiresPreExamAuth });
  const learner = service.createLearner(T, ADMIN, { code: 'L1', name: 'Jane Doe' }, ctx);
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
  return { course, group, learner, enrollment, test };
}

const startArgs = (test: { id: string }, enrollment: { id: string; learnerId: string }) => ({
  testId: test.id,
  enrollmentId: enrollment.id,
  learnerId: enrollment.learnerId
});

describe('pre-exam auth (C) — gate, request, verify', () => {
  it('does NOT gate when the group-course does not require pre-exam auth', () => {
    const service = makeService();
    const { test, enrollment } = seedFinalExam(service, false);
    expect(() => service.startAttempt(T, ADMIN, startArgs(test, enrollment), ctx)).not.toThrow();
  });

  it('blocks the final exam with pre_exam_auth_required until verified', () => {
    const service = makeService();
    const { test, enrollment } = seedFinalExam(service, true);
    expect(() => service.startAttempt(T, ADMIN, startArgs(test, enrollment), ctx)).toThrowError(
      /pre_exam_auth_required/
    );
  });

  it('issues a token without leaking the raw token in the response', () => {
    const service = makeService();
    const { test, enrollment } = seedFinalExam(service, true);
    const out = service.requestPreExamToken(T, ADMIN, startArgs(test, enrollment), ctx) as Record<
      string,
      unknown
    >;
    expect(out.delivered).toBe(true);
    expect(JSON.stringify(out)).not.toMatch(/token["']?\s*[:=]\s*["'][A-Za-z0-9_-]{20,}/);
    // exactly one pending token stored, hash-only
    const stored = new InMemoryMvpStatePeek(service).preExamTokens();
    expect(stored).toHaveLength(1);
    expect(stored[0]!.consumedAt).toBeUndefined();
    expect(stored[0]!.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('verifies a token and then allows the attempt (records identity on it)', () => {
    const service = makeService();
    const { test, enrollment } = seedFinalExam(service, true);
    const raw = service.requestPreExamTokenRaw(T, ADMIN, startArgs(test, enrollment), ctx); // test-only raw accessor
    service.verifyPreExamToken(T, ADMIN, { token: raw }, ctx);
    const attempt = service.startAttempt(T, ADMIN, startArgs(test, enrollment), ctx);
    expect(attempt.identityVerifiedAt).toBeTruthy();
    expect(attempt.identityVerificationTokenId).toBeTruthy();
  });

  it('does not re-prompt repeat attempts of the same exam after verification', () => {
    const service = makeService();
    const { test, enrollment } = seedFinalExam(service, true);
    const raw = service.requestPreExamTokenRaw(T, ADMIN, startArgs(test, enrollment), ctx);
    service.verifyPreExamToken(T, ADMIN, { token: raw }, ctx);
    const a1 = service.startAttempt(T, ADMIN, startArgs(test, enrollment), ctx);
    service.finishAttempt(T, ADMIN, a1.id, ctx);
    expect(() => service.startAttempt(T, ADMIN, startArgs(test, enrollment), ctx)).not.toThrow();
  });

  it('rejects an unknown token', () => {
    const service = makeService();
    seedFinalExam(service, true);
    expect(() => service.verifyPreExamToken(T, ADMIN, { token: 'nope' }, ctx)).toThrowError(
      /pre_exam_token_invalid/
    );
  });
});

/** Minimal reflection helper to read the private state collection in assertions. */
class InMemoryMvpStatePeek {
  constructor(private readonly service: MvpService) {}
  preExamTokens() {
    return (this.service as unknown as { state: InMemoryMvpState }).state.preExamTokens;
  }
}
```

> **Deviation note for the executor:** the test uses a `requestPreExamTokenRaw` test-only accessor and a `requestPreExamToken` public method. Implement BOTH in Step 3: `requestPreExamToken` returns `{ delivered: true }` (no raw token); `requestPreExamTokenRaw` returns the raw token and is documented as test/dev-only (it is NOT exposed on the controller). If you prefer not to add a test-only method, instead have the test read the stored token via a verify-by-hash path — but the dual-method approach keeps the no-leak guarantee explicit and is the chosen design.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/pre-exam-auth.service.test.ts --no-file-parallelism`
Expected: FAIL — `requestPreExamToken` / `verifyPreExamToken` / `requestPreExamTokenRaw` do not exist; gate does not throw.

- [ ] **Step 3: Add a private `Logger` field to `MvpService`**

In `apps/backend/src/modules/mvp/mvp.service.ts`, ensure `Logger` is imported from `@nestjs/common` (add to the existing import if missing) and add a field near the top of the class body (next to other private fields):

```typescript
  private readonly preExamLogger = new Logger('PreExamAuth');
```

- [ ] **Step 4: Persist the flag in `createGroupCourse` / `updateGroupCourse`**

In `createGroupCourse` (line ~1209), add to the `entity` object literal (use conditional spread for `exactOptionalPropertyTypes`):

```typescript
const entity: GroupCourse = {
  id: this.id('gc'),
  tenantId,
  groupId: request.groupId,
  courseId: request.courseId,
  sortOrder: this.state.groupCourses.length,
  status: 'active',
  createdAt: this.now(),
  updatedAt: this.now(),
  durationDays: this.normalizeDurationDays(request.durationDays),
  ...(request.requiresPreExamAuth !== undefined
    ? { requiresPreExamAuth: request.requiresPreExamAuth }
    : {})
};
```

In `updateGroupCourse` (after the existing `durationDays` handling, before the `updatedAt` assignment / return), add:

```typescript
if (request.requiresPreExamAuth !== undefined) {
  current.requiresPreExamAuth = request.requiresPreExamAuth;
}
```

(Match the file's existing mutation style in `updateGroupCourse`; if it builds a new object instead of mutating `current`, mirror that.)

- [ ] **Step 5: Add the service methods + gate**

In `apps/backend/src/modules/mvp/mvp.service.ts`, add imports at the top from the helper:

```typescript
import {
  PRE_EXAM_TOKEN_TTL_MS,
  buildPreExamAuthUrl,
  generatePreExamToken,
  hashPreExamToken
} from './pre-exam-token.js';
```

Also ensure `PreExamToken` and `Enrollment` are in the `mvp.types.js` type import block (Enrollment already is; add `PreExamToken`).

Add these methods immediately AFTER `assertMinViewGate` (ends ~line 2895, before `getModuleGatingTest`/`saveAnswer` region — place near the other gates):

```typescript
  /** Feature C: the group-course toggle that turns on pre-exam identity auth. */
  private groupCourseRequiresPreExamAuth(
    tenantId: string,
    groupId: string,
    courseId: string
  ): boolean {
    const gc = this.state.groupCourses.find(
      (item) =>
        item.tenantId === tenantId && item.groupId === groupId && item.courseId === courseId
    );
    return gc?.requiresPreExamAuth === true;
  }

  /** A consumed (and thus verifying) token for this learner's enrollment + test, if any. */
  private findPreExamVerification(
    tenantId: string,
    enrollmentId: string,
    testId: string
  ): PreExamToken | undefined {
    return this.state.preExamTokens.find(
      (t) =>
        t.tenantId === tenantId &&
        t.enrollmentId === enrollmentId &&
        t.testId === testId &&
        Boolean(t.consumedAt)
    );
  }

  /**
   * Feature C gate. Only final/course-level exams (no moduleId) are identity-gated,
   * and only when the group-course requires it. After verification the consumed
   * token persists, so repeat attempts of the same exam are not re-prompted.
   */
  private assertPreExamAuthGate(tenantId: string, enrollment: Enrollment, test: TestEntity): void {
    if (test.moduleId) return; // intermediate module tests are never identity-gated
    if (!this.groupCourseRequiresPreExamAuth(tenantId, enrollment.groupId, test.courseId)) return;
    if (this.findPreExamVerification(tenantId, enrollment.id, test.id)) return;
    throw new PreconditionFailedException({
      code: 'pre_exam_auth_required',
      message: 'Identity verification is required before starting this exam'
    });
  }

  /**
   * Issue a single-use identity token and "send" the verify link (logged in dev/pilot;
   * a real e-mail adapter is a follow-up). Never returns the raw token.
   */
  requestPreExamToken(
    tenantId: string,
    actorId: string | undefined,
    request: StartAttemptRequest,
    context: RequestContext
  ): { delivered: true; alreadyVerified: boolean } {
    const { test, enrollment } = this.resolveAttemptContext(tenantId, request);
    if (this.findPreExamVerification(tenantId, enrollment.id, test.id)) {
      return { delivered: true, alreadyVerified: true };
    }
    const rawToken = generatePreExamToken();
    const now = this.now();
    const entity: PreExamToken = {
      id: this.id('preexam'),
      tenantId,
      enrollmentId: enrollment.id,
      testId: test.id,
      learnerId: enrollment.learnerId,
      tokenHash: hashPreExamToken(rawToken),
      expiresAt: new Date(new Date(now).getTime() + PRE_EXAM_TOKEN_TTL_MS).toISOString(),
      status: 'active',
      createdAt: now,
      updatedAt: now
    };
    this.state.preExamTokens.push(entity);
    this.preExamLogger.log(
      `pre_exam_auth.delivery enrollment=${enrollment.id} test=${test.id} url=${buildPreExamAuthUrl(rawToken)} (log-only)`
    );
    this.audit(
      tenantId,
      actorId,
      'assessment.pre_exam_token_requested',
      'assessment.pre_exam_token',
      entity.id,
      undefined,
      { id: entity.id, enrollmentId: entity.enrollmentId, testId: entity.testId },
      context
    );
    return { delivered: true, alreadyVerified: false };
  }

  /** Test/dev-only: like requestPreExamToken but returns the raw token. NOT exposed on the controller. */
  requestPreExamTokenRaw(
    tenantId: string,
    actorId: string | undefined,
    request: StartAttemptRequest,
    context: RequestContext
  ): string {
    const { test, enrollment } = this.resolveAttemptContext(tenantId, request);
    const rawToken = generatePreExamToken();
    const now = this.now();
    const entity: PreExamToken = {
      id: this.id('preexam'),
      tenantId,
      enrollmentId: enrollment.id,
      testId: test.id,
      learnerId: enrollment.learnerId,
      tokenHash: hashPreExamToken(rawToken),
      expiresAt: new Date(new Date(now).getTime() + PRE_EXAM_TOKEN_TTL_MS).toISOString(),
      status: 'active',
      createdAt: now,
      updatedAt: now
    };
    this.state.preExamTokens.push(entity);
    return rawToken;
  }

  /** Redeem the link: mark the matching token consumed (= verification record). */
  verifyPreExamToken(
    tenantId: string,
    actorId: string | undefined,
    request: { token: string },
    context: RequestContext
  ): { verified: true; enrollmentId: string; testId: string } {
    const tokenHash = hashPreExamToken(request.token ?? '');
    const record = this.state.preExamTokens.find(
      (t) => t.tenantId === tenantId && t.tokenHash === tokenHash
    );
    if (!record) {
      throw new BadRequestException({
        code: 'pre_exam_token_invalid',
        message: 'Verification link is invalid'
      });
    }
    if (!record.consumedAt) {
      if (new Date(record.expiresAt).getTime() < new Date(this.now()).getTime()) {
        throw new PreconditionFailedException({
          code: 'pre_exam_token_expired',
          message: 'Verification link has expired'
        });
      }
      record.consumedAt = this.now();
      record.verifiedByActorId = actorId;
      record.updatedAt = this.now();
      this.audit(
        tenantId,
        actorId,
        'assessment.pre_exam_token_verified',
        'assessment.pre_exam_token',
        record.id,
        undefined,
        { id: record.id, enrollmentId: record.enrollmentId, testId: record.testId },
        context
      );
    }
    return { verified: true, enrollmentId: record.enrollmentId, testId: record.testId };
  }
```

- [ ] **Step 6: Extract a small `resolveAttemptContext` helper (DRY with startAttempt) OR inline**

`requestPreExamToken` / `requestPreExamTokenRaw` need the same `test` + `enrollment` + group-course-access checks as `startAttempt`'s preamble. Add a private helper that mirrors `startAttempt` lines 2735-2748 and reuse it. Place it just above `requestPreExamToken`:

```typescript
  /** Shared resolution + course-link guard used by startAttempt and pre-exam endpoints. */
  private resolveAttemptContext(
    tenantId: string,
    request: StartAttemptRequest
  ): { test: TestEntity; enrollment: Enrollment } {
    const test = this.getById(this.state.tests, tenantId, request.testId);
    const enrollment = this.getById(this.state.enrollments, tenantId, request.enrollmentId);
    const hasGroupCourseAccess = this.state.groupCourses.some(
      (item) =>
        item.tenantId === tenantId &&
        item.groupId === enrollment.groupId &&
        item.courseId === test.courseId
    );
    if (!hasGroupCourseAccess) {
      throw new PreconditionFailedException({
        code: 'domain_rule_violation',
        message: 'Enrollment is not linked to the test course'
      });
    }
    return { test, enrollment };
  }
```

(Optional refactor: replace `startAttempt` lines 2735-2748 with `const { test, enrollment } = this.resolveAttemptContext(tenantId, request);`. Only do this if the regression suites stay green — otherwise leave `startAttempt` as-is and let `resolveAttemptContext` duplicate the few lines.)

- [ ] **Step 7: Wire the gate + stamp identity in `startAttempt`**

In `startAttempt`, add the gate call right after the two Wave 1 gates (after line 2762 `this.assertMinViewGate(...)`):

```typescript
this.assertModuleSequenceGate(tenantId, enrollment.id, test);
this.assertMinViewGate(tenantId, enrollment.id, test);
this.assertPreExamAuthGate(tenantId, enrollment, test);
```

Then stamp the verification onto the attempt. Replace the `const entity: TestAttempt = { ... }` literal (lines 2801-2816) so the identity fields are added via conditional spread before `this.state.attempts.push(entity)`:

```typescript
const verification = this.findPreExamVerification(tenantId, enrollment.id, test.id);
const entity: TestAttempt = {
  id: this.id('attempt'),
  tenantId,
  testId: request.testId,
  enrollmentId: request.enrollmentId,
  learnerId,
  attemptNo: attempts.length + 1,
  status: 'in_progress',
  startedAt,
  expiresAt,
  score: 0,
  maxScore,
  questionOrder: snapshot,
  createdAt: startedAt,
  updatedAt: startedAt,
  ...(verification
    ? { identityVerifiedAt: verification.consumedAt, identityVerificationTokenId: verification.id }
    : {})
};
```

- [ ] **Step 8: Run the service test + regression**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/pre-exam-auth.service.test.ts --no-file-parallelism`
Expected: PASS (6 cases).
Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/module-gating.service.test.ts src/modules/mvp/test-player.service.test.ts src/modules/mvp/business-flows.e2e.test.ts --no-file-parallelism`
Expected: PASS (no regression — final exams in groups without the flag are unaffected; module tests are never gated).

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/modules/mvp/mvp.service.ts apps/backend/src/modules/mvp/pre-exam-auth.service.test.ts
git commit -m "feat(backend): pre-exam auth request/verify + startAttempt gate (Wave 1 Plan 2)"
```

---

## Task 5: Endpoint DTOs + validation tests

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.dto.ts`
- Modify: `apps/backend/src/modules/mvp/mvp.dto-validation.test.ts`

- [ ] **Step 1: Write the failing DTO validation test**

Add to `apps/backend/src/modules/mvp/mvp.dto-validation.test.ts`:

```typescript
import { RequestPreExamTokenRequest, VerifyPreExamTokenRequest } from './mvp.dto.js';

describe('Pre-exam auth DTOs', () => {
  it('RequestPreExamTokenRequest accepts a full attempt context', () => {
    const dto = plainToInstance(RequestPreExamTokenRequest, {
      testId: 't1',
      enrollmentId: 'e1',
      learnerId: 'l1'
    });
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('RequestPreExamTokenRequest rejects a missing testId', () => {
    const dto = plainToInstance(RequestPreExamTokenRequest, {
      enrollmentId: 'e1',
      learnerId: 'l1'
    });
    expect(validateSync(dto).length).toBeGreaterThan(0);
  });

  it('VerifyPreExamTokenRequest accepts a non-empty token', () => {
    const dto = plainToInstance(VerifyPreExamTokenRequest, { token: 'abc' });
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('VerifyPreExamTokenRequest rejects an empty token', () => {
    const dto = plainToInstance(VerifyPreExamTokenRequest, { token: '' });
    expect(validateSync(dto).length).toBeGreaterThan(0);
  });

  it('CreateGroupCourseRequest accepts requiresPreExamAuth', () => {
    const dto = plainToInstance(CreateGroupCourseRequest, {
      groupId: 'g1',
      courseId: 'c1',
      requiresPreExamAuth: true
    });
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.requiresPreExamAuth).toBe(true);
  });
});
```

(Add `CreateGroupCourseRequest` to the existing imports in this test file if not already imported.)

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/mvp.dto-validation.test.ts --no-file-parallelism`
Expected: FAIL — the two new request classes do not exist.

- [ ] **Step 3: Add the DTOs**

In `apps/backend/src/modules/mvp/mvp.dto.ts`, add immediately after `StartAttemptRequest` (line ~631):

```typescript
/** Request a pre-exam identity verification link (Приказ №816). Same context as starting the attempt. */
export class RequestPreExamTokenRequest {
  @IsString()
  @MinLength(1)
  testId!: string;

  @IsString()
  @MinLength(1)
  enrollmentId!: string;

  @IsString()
  @MinLength(1)
  learnerId!: string;
}

/** Redeem a pre-exam identity link. */
export class VerifyPreExamTokenRequest {
  @IsString()
  @MinLength(1)
  token!: string;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/mvp.dto-validation.test.ts --no-file-parallelism`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/mvp/mvp.dto.ts apps/backend/src/modules/mvp/mvp.dto-validation.test.ts
git commit -m "feat(backend): pre-exam auth request/verify DTOs (Wave 1 Plan 2)"
```

---

## Task 6: Controller endpoints + HTTP permission boundary

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.controller.ts`
- Modify: `apps/backend/src/modules/mvp/assessment-admin.http.integration.test.ts`

- [ ] **Step 1: Add the two endpoints**

In `apps/backend/src/modules/mvp/mvp.controller.ts`, add the imports of the new DTOs to the existing `mvp.dto.js` import block (`RequestPreExamTokenRequest`, `VerifyPreExamTokenRequest`).

Add the endpoints right after the `startAttempt` handler (after line 878):

```typescript
  @Post('attempts/request-pre-exam-token')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.attempts.take')
  requestPreExamToken(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const b = assertValidDto(RequestPreExamTokenRequest, raw);
    return this.mvpService.requestPreExamToken(c.tenantId!, c.userId, b, c);
  }

  @Post('attempts/verify-pre-exam-token')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.attempts.take')
  verifyPreExamToken(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const b = assertValidDto(VerifyPreExamTokenRequest, raw);
    return this.mvpService.verifyPreExamToken(c.tenantId!, c.userId, b, c);
  }
```

> Note: `requestPreExamToken` here maps to the no-leak `MvpService.requestPreExamToken` (returns `{ delivered }`), NOT `requestPreExamTokenRaw`.

- [ ] **Step 2: Add HTTP permission-boundary tests (stub-controller pattern)**

Open `apps/backend/src/modules/mvp/assessment-admin.http.integration.test.ts` and follow its existing stub-controller + permission-assertion pattern (see how `attempts/start` or similar `assessment.attempts.take` endpoints are asserted). Add a describe block asserting:

- `POST /attempts/request-pre-exam-token` and `POST /attempts/verify-pre-exam-token` are reachable WITH `assessment.attempts.take` and rejected (403) WITHOUT it.
- The envelope shape (`{ data, meta }`) is returned on success.

Mirror the exact harness already used in this file for an `assessment.attempts.take` route — copy that test's structure and swap the path/permission. (Do not invent a new bootstrap; extend the file's existing app.)

- [ ] **Step 3: Run the HTTP integration test (isolated)**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/assessment-admin.http.integration.test.ts --no-file-parallelism`
Expected: PASS. (If this file crashes on the Cyrillic path, note it and rely on CI; prefer this lighter file over the 2400-line `mvp.domains.http.integration.test.ts`.)

- [ ] **Step 4: Typecheck + lint touched files**

Run: `pnpm typecheck`
Expected: PASS (8/8).
Run: `npx eslint apps/backend/src/modules/mvp/mvp.controller.ts apps/backend/src/modules/mvp/mvp.service.ts --max-warnings=0`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/mvp/mvp.controller.ts apps/backend/src/modules/mvp/assessment-admin.http.integration.test.ts
git commit -m "feat(backend): POST request/verify-pre-exam-token endpoints (Wave 1 Plan 2)"
```

---

## Task 7: Frontend — API + hook + types + contract test

**Files:**

- Modify: `apps/frontend/src/features/test-player/types.ts`
- Modify: `apps/frontend/src/features/test-player/api.ts`
- Modify: `apps/frontend/src/features/test-player/api.contract.test.ts`
- Modify: `apps/frontend/src/features/test-player/hooks.ts`

- [ ] **Step 1: Extend the types**

In `apps/frontend/src/features/test-player/types.ts`:

(a) Add to `AttemptDto` (the interface returned by `getAttempt`/`startAttempt`), after its existing fields:

```typescript
  /** Wave 1 Plan 2: set when identity was verified (Приказ №816) before this attempt. */
  identityVerifiedAt?: string;
```

(b) Add the request/response shapes (near `StartAttemptPayload`):

```typescript
export interface RequestPreExamTokenPayload {
  testId: string;
  enrollmentId: string;
  learnerId: string;
}

export interface PreExamTokenDelivery {
  delivered: boolean;
  alreadyVerified?: boolean;
}

export interface VerifyPreExamTokenResult {
  verified: boolean;
  enrollmentId: string;
  testId: string;
}
```

- [ ] **Step 2: Write the failing contract test**

In `apps/frontend/src/features/test-player/api.contract.test.ts`, follow the existing `vi.stubGlobal('fetch', ...)` + envelope-unwrap pattern and add:

```typescript
describe('testPlayerApi.requestPreExamToken', () => {
  it('POSTs the attempt context to /attempts/request-pre-exam-token and unwraps { delivered }', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ data: { delivered: true }, meta: {} }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const res = await testPlayerApi.requestPreExamToken(session, {
      testId: 't1',
      enrollmentId: 'e1',
      learnerId: 'l1'
    });
    expect(res.delivered).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/attempts/request-pre-exam-token'),
      expect.objectContaining({ method: 'POST' })
    );
  });
});

describe('testPlayerApi.verifyPreExamToken', () => {
  it('POSTs the token to /attempts/verify-pre-exam-token and unwraps { verified }', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ data: { verified: true, enrollmentId: 'e1', testId: 't1' }, meta: {} }),
          { status: 200 }
        )
    );
    vi.stubGlobal('fetch', fetchMock);
    const res = await testPlayerApi.verifyPreExamToken(session, 'raw-token');
    expect(res.verified).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/attempts/verify-pre-exam-token'),
      expect.objectContaining({ method: 'POST' })
    );
  });
});
```

(Reuse the `session` fixture already defined in this contract test file; match its existing structure exactly — variable names, imports, `beforeEach`/`afterEach` for `vi.unstubAllGlobals()`.)

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/features/test-player/api.contract.test.ts --no-file-parallelism`
Expected: FAIL — `requestPreExamToken` / `verifyPreExamToken` are not on `testPlayerApi`.

- [ ] **Step 4: Implement the API calls**

In `apps/frontend/src/features/test-player/api.ts`, add the imports of the new types and add to the `testPlayerApi` object:

```typescript
  requestPreExamToken: (
    session: UserSession,
    payload: RequestPreExamTokenPayload
  ): Promise<PreExamTokenDelivery> =>
    apiRequest<PreExamTokenDelivery>('/attempts/request-pre-exam-token', {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    }),
  verifyPreExamToken: (session: UserSession, token: string): Promise<VerifyPreExamTokenResult> =>
    apiRequest<VerifyPreExamTokenResult>('/attempts/verify-pre-exam-token', {
      method: 'POST',
      body: { token },
      ...withAuth(session)
    }),
```

- [ ] **Step 5: Add the hook**

In `apps/frontend/src/features/test-player/hooks.ts`, add a `useRequestPreExamToken` mirroring `useStartAttempt`'s `MutationState` shape:

```typescript
export function useRequestPreExamToken() {
  const { session } = useAuth();
  const [state, setState] = useState<MutationState<PreExamTokenDelivery>>(initial());
  const mutate = async (payload: RequestPreExamTokenPayload) => {
    if (!session) return null;
    setState({ isPending: true, error: null, data: null });
    try {
      const data = await testPlayerApi.requestPreExamToken(session, payload);
      setState({ isPending: false, error: null, data });
      return data;
    } catch (err) {
      setState({
        isPending: false,
        error: describe(err, 'Не удалось отправить ссылку для подтверждения личности'),
        data: null
      });
      return null;
    }
  };
  return { ...state, mutate, reset: () => setState(initial()) };
}
```

(Add `PreExamTokenDelivery`, `RequestPreExamTokenPayload` to the `./types` import.)

- [ ] **Step 6: Run the contract test + typecheck**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/features/test-player/api.contract.test.ts --no-file-parallelism`
Expected: PASS.
Run: `pnpm typecheck`
Expected: PASS (8/8).

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/test-player/types.ts apps/frontend/src/features/test-player/api.ts apps/frontend/src/features/test-player/api.contract.test.ts apps/frontend/src/features/test-player/hooks.ts
git commit -m "feat(frontend): pre-exam token API + hook + contract tests (Wave 1 Plan 2)"
```

---

## Task 8: Frontend — interstitial + verify page + result marker

**Files:**

- Modify: `apps/frontend/src/features/test-player/tests-list-screen.tsx`
- Modify: `apps/frontend/src/features/test-player/test-result-screen.tsx`
- Create: `apps/frontend/app/exam-auth/[token]/page.tsx`

- [ ] **Step 1: Show the interstitial when the gate blocks**

In `apps/frontend/src/features/test-player/tests-list-screen.tsx`, extend `TestRow` so that when `start.error` indicates the pre-exam gate, it offers to send the verification link. The server error message for code `pre_exam_auth_required` flows through `ApiClientError.message`; detect it and render the interstitial. Replace the `TestRow` body's start handling with:

```typescript
function TestRow({ test }: { test: LearnerTestSummary }) {
  const router = useRouter();
  const start = useStartAttempt();
  const requestLink = useRequestPreExamToken();
  const attemptsLeft = test.attemptLimit - test.attemptsUsed;
  const needsPreExamAuth = /идентифик|identity verification is required|pre_exam_auth_required/i.test(
    start.error ?? ''
  );

  const onStart = async () => {
    const attempt = await start.mutate({
      testId: test.testId,
      enrollmentId: test.enrollmentId,
      learnerId: test.learnerId
    });
    if (attempt) {
      router.push(`/learner/tests/${test.testId}/attempt/${attempt.id}`);
    }
  };

  const onSendLink = async () => {
    await requestLink.mutate({
      testId: test.testId,
      enrollmentId: test.enrollmentId,
      learnerId: test.learnerId
    });
  };

  return (
    <li className="ui-stack">
      <span className="ui-list-title">{test.title}</span>
      <span>{formatLearnerTestStatus(test.status)}</span>
      <span>{formatAttemptsLeft(test.attemptsUsed, test.attemptLimit)}</span>
      {test.bestScore !== undefined ? (
        <span>Лучший результат: {formatScoreLine(test.bestScore, test.maxScore)}</span>
      ) : null}
      {test.activeAttemptId ? (
        <Link
          className="ui-button"
          href={`/learner/tests/${test.testId}/attempt/${test.activeAttemptId}`}
        >
          Продолжить
        </Link>
      ) : attemptsLeft > 0 ? (
        <button
          type="button"
          className="ui-button"
          disabled={start.isPending}
          onClick={() => void onStart()}
        >
          {test.attemptsUsed === 0 ? 'Начать' : 'Пересдать'}
        </button>
      ) : null}
      {needsPreExamAuth ? (
        <div className="ui-stack" data-testid="pre-exam-auth-interstitial">
          <p className="ui-text-muted">
            Перед экзаменом нужно подтвердить личность (Приказ №816). Отправим ссылку на ваш e-mail —
            перейдите по ней, затем нажмите «{test.attemptsUsed === 0 ? 'Начать' : 'Пересдать'}» снова.
          </p>
          <button
            type="button"
            className="ui-button"
            disabled={requestLink.isPending}
            onClick={() => void onSendLink()}
          >
            Отправить ссылку для подтверждения
          </button>
          {requestLink.data?.delivered ? (
            <p className="ui-text-muted">Ссылка отправлена. Проверьте e-mail.</p>
          ) : null}
          {requestLink.error ? <SectionError message={requestLink.error} /> : null}
        </div>
      ) : start.error ? (
        <SectionError message={start.error} />
      ) : null}
    </li>
  );
}
```

(Add `useRequestPreExamToken` to the `./hooks` import.)

- [ ] **Step 2: Create the verify page (mirrors magic-link page)**

Read `apps/frontend/app/login/magic-link/[token]/page.tsx` first to copy its exact client-component + param + auth-session shape. Then create `apps/frontend/app/exam-auth/[token]/page.tsx` that, on mount, calls `testPlayerApi.verifyPreExamToken(session, token)` and shows success ("Личность подтверждена. Вернитесь к списку тестов и начните экзамен.") or the error. Keep it a thin client component consistent with the magic-link page; link back to `/learner/tests`.

```tsx
'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionError
} from '../../../src/components/state-wrappers';
import { useAuth } from '../../../src/features/auth/context';
import { testPlayerApi } from '../../../src/features/test-player/api';

export default function ExamAuthPage() {
  const params = useParams<{ token: string }>();
  const { session } = useAuth();
  const [status, setStatus] = useState<'pending' | 'ok' | 'error'>('pending');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = Array.isArray(params.token) ? params.token[0] : params.token;
    if (!session || !token) return;
    let active = true;
    void testPlayerApi
      .verifyPreExamToken(session, token)
      .then(() => active && setStatus('ok'))
      .catch((err: unknown) => {
        if (!active) return;
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Не удалось подтвердить личность');
      });
    return () => {
      active = false;
    };
  }, [params.token, session]);

  return (
    <PageContainer>
      <PageHeader title="Подтверждение личности" />
      <SectionCard title="Аутентификация перед экзаменом">
        {status === 'pending' ? <p>Проверяем ссылку…</p> : null}
        {status === 'ok' ? (
          <p data-testid="exam-auth-ok">
            Личность подтверждена. Вернитесь к списку тестов и начните экзамен.{' '}
            <Link href="/learner/tests">Мои тесты</Link>
          </p>
        ) : null}
        {status === 'error' ? <SectionError message={error ?? 'Ссылка недействительна'} /> : null}
      </SectionCard>
    </PageContainer>
  );
}
```

> Verify the relative import depth (`app/exam-auth/[token]/page.tsx` → `../../../src/...`) against the magic-link page's actual imports and adjust to match that file exactly.

- [ ] **Step 3: Result marker**

In `apps/frontend/src/features/test-player/test-result-screen.tsx`, if the attempt/result carries `identityVerifiedAt`, render a small marker: `Личность подтверждена ✓`. Place it near the score line, guarded by a presence check. (Match the screen's existing layout primitives.)

- [ ] **Step 4: Typecheck + lint + smoke**

Run: `pnpm typecheck`
Expected: PASS (8/8).
Run: `npx eslint apps/frontend/src/features/test-player/tests-list-screen.tsx apps/frontend/app/exam-auth/[token]/page.tsx apps/frontend/src/features/test-player/test-result-screen.tsx --max-warnings=0`
Expected: clean.
Run: `pnpm --filter @cdoprof/frontend exec vitest run src/features/test-player --no-file-parallelism`
Expected: PASS (existing test-player tests + the contract test from Task 7).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/test-player/tests-list-screen.tsx apps/frontend/src/features/test-player/test-result-screen.tsx "apps/frontend/app/exam-auth/[token]/page.tsx"
git commit -m "feat(frontend): pre-exam interstitial + verify page + result marker (Wave 1 Plan 2)"
```

---

## Task 9: Full regression gate + docs sync

**Files:**

- Modify: `README.md` §2 (AI Agent State)
- Modify: `LMS_AGENT_HANDOFF.md` §5 (append `### 5.98`)
- Modify: `docs/superpowers/specs/2026-05-30-wave1-module-gating-pre-exam-auth-design.md` (tick Plan 2 / §3.C)

- [ ] **Step 1: Run the quality gate**

Run: `pnpm -s ci:check`
Expected: PASS (lint + typecheck + contracts + unit + build). If the full backend suite crashes on the Cyrillic path (CLAUDE.md Gotchas), rely on the isolated runs from Tasks 1-8 + CI; note this in the handoff. Re-run the canonical regression explicitly:
Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/business-flows.e2e.test.ts --no-file-parallelism`
Expected: PASS (4/4).

- [ ] **Step 2: Update README §2** — set Last Completed Task to "Wave 1 Plan 2 — pre-exam auth (Приказ №816)", Current Task to merge Plan 2, Next Task to "Wave 2 — регуляторные выгрузки (ФИС ФРДО → Минтруд/ЛКОТ → ЕИСОТ)", Last Updated At/By. Keep it consistent with the handoff entry.

- [ ] **Step 3: Append `### 5.98` to LMS_AGENT_HANDOFF.md** — summary, files changed, test status (which isolated suites are green + the email-stub precondition), deviations (gate scope = final exams only; logging-stub e-mail; `requestPreExamTokenRaw` is test/dev-only). Cross-link this plan + the design spec §3.C.

- [ ] **Step 4: Tick Plan 2 in the design spec** — mark §3.C / §5 «План 2» done with a one-line status referencing this plan.

- [ ] **Step 5: Commit**

```bash
git add README.md LMS_AGENT_HANDOFF.md docs/superpowers/specs/2026-05-30-wave1-module-gating-pre-exam-auth-design.md
git commit -m "docs(handoff): Wave 1 Plan 2 — pre-exam auth (№816) (§5.98 + README §2)"
```

---

## Self-Review

**Spec coverage** (against `2026-05-30-wave1-module-gating-pre-exam-auth-design.md` §3.C + §4 + §6):

- §3.C model `GroupCourse.requiresPreExamAuth` → Task 1 (column) + Task 2 (type + DTO) + Task 4 (persist). ✅
- §3.C model `pre_exam_tokens` table + in-memory collection registered in BOTH `mvp-collections.ts` and `in-memory-mvp.state.ts` → Task 1 + Task 2 (steps 4-5, called out as "must land together"). ✅
- §3.C model `TestAttempt.identityVerifiedAt` + `identityVerificationTokenId` → Task 1 (columns) + Task 2 (type) + Task 4 step 7 (stamp). ✅
- §3.C `PreExamAuthService` (mirror MagicLinkService: randomBytes+SHA-256, single-use, TTL) → Task 3 (pure crypto) + Task 4 (request/verify with consume-once). ✅ (Stored as MVP collection per locked decision 1, not a repo abstraction — documented deviation.)
- §3.C `POST /attempts/request-pre-exam-token` + `POST /attempts/verify-pre-exam-token` (`assessment.attempts.take`) → Task 6. ✅
- §3.C `startAttempt` gate `pre_exam_auth_required`; repeat attempts not re-prompted; different final exam → new verification → Task 4 (`assertPreExamAuthGate`, per-`testId` consumed token) + service tests. ✅
- §3.C email dependency = stub/log in dev, real adapter a precondition → locked decision 4 + Task 4 (logger) + Task 9 handoff note. ✅
- §3.C frontend interstitial + verify flow + identity marker → Tasks 7-8. ✅
- §4 reuse `assessment.attempts.take` / no new permission → Task 6 (reuses existing perm). ✅
- §4 DTO `StartAttemptRequest` unchanged; verification via server state (no token in start payload) → satisfied (locked decision 2; start payload untouched). ✅
- §6 acceptance C (blocked until verified; fact recorded + visible; repeat not re-prompted; default-on toggle settable) → Tasks 4, 8 + flag on create/update group-course. ✅ (Tenant-wide "enable by default for new groups" is left to the flag default `false`; per-group-course opt-in covers the acceptance — note if owner wants a tenant default, that is a tiny follow-up.)
- §6 regression `ci:check` + `business-flows.e2e` green → Task 9. ✅

**Placeholder scan:** Every code step shows complete code; the only "match the existing file" prose is in Task 6 step 2 (HTTP stub harness) and Task 8 steps 2-3 (verify page import depth + result marker), where copying the in-repo precedent verbatim is safer than guessing line numbers — each names the exact precedent file to copy. No TBD/TODO. ✅

**Type/name consistency:** `requiresPreExamAuth` (type + 2 DTOs + create/update + gate), `PreExamToken` (type + collection + service), `preExamTokens` (state field + `MVP_COLLECTIONS` key), `identityVerifiedAt` / `identityVerificationTokenId` (type + migration columns + attempt stamp + frontend `AttemptDto`), `generatePreExamToken` / `hashPreExamToken` / `buildPreExamAuthUrl` / `PRE_EXAM_TOKEN_TTL_MS` (helper + service + tests), `assertPreExamAuthGate` / `requestPreExamToken` / `requestPreExamTokenRaw` / `verifyPreExamToken` / `findPreExamVerification` / `resolveAttemptContext` (service, used consistently), endpoint paths `/attempts/request-pre-exam-token` + `/attempts/verify-pre-exam-token` (controller + frontend api + contract test), error codes `pre_exam_auth_required` / `pre_exam_token_invalid` / `pre_exam_token_expired` (service + frontend detect). ✅

**Known assumptions to verify during execution (TDD will surface):**

- `createGroupCourse` test seed accepts `requiresPreExamAuth` in its request object (Task 4 test relies on it; Task 2 step 6 adds the DTO field — the in-memory `createGroupCourse` reads `request.requiresPreExamAuth`).
- `MvpService` already imports `Logger`, `BadRequestException`, `PreconditionFailedException` (PreconditionFailedException + BadRequestException are used in `startAttempt`; add `Logger` to the `@nestjs/common` import).
- `assessment-admin.http.integration.test.ts` has an extensible app harness for an `assessment.attempts.take` route (Task 6). If it does not, fall back to extending the existing harness in that file rather than `mvp.domains.http.integration.test.ts` (the crash-prone 2400-line file).
- The magic-link verify page path/structure (`app/login/magic-link/[token]/page.tsx`) — copy its import depth + `useParams`/session usage exactly for the `exam-auth` page.
- `backendEnv.PUBLIC_BASE_URL` exists (used by `magic-link-email-sender.ts`).

**Out of scope (future):** real e-mail adapter (roadmap Tier 4 #22), tenant-level "default-on for new groups" setting, identity marker in the admin learner card (the design mentions the карточка слушателя; this plan surfaces the marker in the attempt result — the learner-card marker can be a small follow-up once an admin attempts view exists).
