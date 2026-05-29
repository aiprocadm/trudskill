# Phase 3 Plan C — Manual review + practical submissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a learner submit practical work (text + uploaded file) for an assignment, let a reviewer score/return it and manually grade essay questions in submitted test attempts, and surface all of this through an active reviewer queue and learner submission UI.

**Architecture:** The assignment submission + review lifecycle already exists and is hardened (Pillar A) — Plan C reuses it and adds only four backend capabilities: (1) presigned file upload/download on `S3StorageClient` + `FilesService` (the `@aws-sdk/s3-request-presigner` dep is already present; MvpService's 6-arg constructor is untouched — `FilesService` is already injected), (2) `completeAttemptReview` to manually grade essays in a submitted attempt and recompute its `ExamResult` (`submitted → finished`), (3) `returnAssignmentSubmission` for the return-for-revision cycle, (4) a reviewer-queue refinement so only attempts that actually need manual grading appear. The bulk of Plan C is frontend: a learner `practical-submissions` feature and a reviewer `reviewer-actions` upgrade of Plan A's read-only queue screen.

**Tech Stack:** NestJS + TypeScript (backend, in-memory MVP state with request-boundary persistence; ESM `.js` import suffixes), `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (presigned MinIO URLs), Next.js 15 App Router + React Query + `@cdoprof/ui` (frontend), Vitest (all tests).

**Spec:** [docs/superpowers/specs/2026-05-31-phase-3-plan-c-design.md](../specs/2026-05-31-phase-3-plan-c-design.md) (umbrella: [2026-05-30-phase-3-assessment-design.md](../specs/2026-05-30-phase-3-assessment-design.md) §5).

---

## Context the executor must know (read before starting)

- **CLAUDE.md Cyrillic gotcha:** full backend suite crashes (`ERR_IPC_CHANNEL_CLOSED`). Always run isolated files with `--no-file-parallelism`. Do **not** add cases to the 2400-line `mvp.domains.http.integration.test.ts` — mirror the compact stub-controller pattern in `apps/backend/src/modules/mvp/test-player.http.integration.test.ts` / `assessment-admin.http.integration.test.ts`.
- **Service unit-test instantiation:** `new MvpService(state, tenantRepo, audit, documents, files, eventEmitter)` — 6 positional args. Tests pass `noopFilesService` as arg 5 (`apps/backend/src/modules/mvp/mvp.service.test.ts:24`). Plan C adds two methods to `FilesService`, so extend `noopFilesService` accordingly (Task 2/5 steps say where).
- **Frontend mutations** use `useState` + async/await (the `wrap`/`MutationState`/`initial()`/`describe()` helpers in `apps/frontend/src/features/assessment-admin/hooks.ts`), **not** React Query mutations. Queries use React Query.
- **`exactOptionalPropertyTypes: true`** — never pass `{ x: undefined }`; use conditional spread `{ ...(v !== undefined ? { x: v } : {}) }`.
- **No React Testing Library.** Frontend "e2e" = `evaluateRouteAccess` + `getVisibleNavigation` + format-pipeline + dynamic-import smoke. Mirror `apps/frontend/src/e2e/learner-test-player.e2e.test.ts`. Each `it('loads X', async () => …)` uses the default timeout (cold Vite transform can flake under full-suite load on Windows — run the file in isolation to confirm green; this is a known pre-existing characteristic, not a Plan C defect).
- **API envelope:** backend wraps `{ data, meta }`; `apiRequest` from `apps/frontend/src/lib/api/client.ts` unwraps to `data`.
- **Migrations:** latest is `0041`. Plan C's migration is `0042` (additive/nullable parity — MVP runs in-memory by default, so service tests are the acceptance gate).

## Key decisions (locked during planning)

1. **Reuse the existing lifecycle.** `createAssignmentSubmission` / `updateAssignmentSubmission` / `submitAssignmentSubmission` / `createAssignmentReview` / `updateAssignmentReview` / `completeAssignmentReview` stay. Plan C adds `returnAssignmentSubmission` and `completeAttemptReview`, plus file-upload plumbing.
2. **File upload = presigned direct-to-MinIO.** `S3StorageClient` gains `createPresignedUploadUrl` / `createPresignedDownloadUrl` (via `getSignedUrl`). `FilesService` gains `createUploadIntent` (validate MIME allowlist + size cap → register `storage.files` (AV `pending`) → presigned PUT) and `createDownloadUrl` (lookup → presigned GET). `MvpService` calls these through its already-injected `filesService`. **No new MvpService constructor arg.**
3. **Essay grading transitions `submitted → finished`.** `AttemptStatus` has no `reviewed` value; reusing `finished` removes the attempt from the queue (which filters `status === 'submitted'`) with no enum/CHECK migration.
4. **Only `autoGraded === false` answers are manually scorable.** `completeAttemptReview` refuses to overwrite auto-graded answers (V1) and clamps each manual score to `[0, question.score]`.
5. **Queue shows only attempts that need manual grading.** `aggregateReviewerQueue` is refined to take `attemptAnswers` and include a submitted attempt only if it has ≥1 answer with `autoGraded === false`. This stops fully-auto-graded attempts from cluttering the queue.
6. **Return-for-revision deletes the active in_review review** so the resubmitted work gets a fresh review pass (the one-review-per-submission lock in `createAssignmentReview` otherwise blocks re-review). Reviewer feedback is preserved on the submission via a new nullable `returnComment` field.
7. **Antivirus is deferred (V1.1).** Uploaded files stay `antivirus_status='pending'`; mitigation is the MIME allowlist + size cap. Documented limitation.
8. **Cadence:** 4 stacked PRs — (1) this doc + spec (done), (2) backend Tasks 1–7, (3) frontend Tasks 8–12, (4) closeout Task 13. Branch root: `feat/2026-05-31-phase-3-plan-c-manual-review`.
9. **Learner discovery mirrors `/me/tests`.** `GET /me/assignments` resolves the linked learner(s) server-side from the actor (no `learnerId` query; `[]` not 403 when unlinked), exactly like `listMyTests` (`mvp.controller.ts:546-551`). The summary carries `enrollmentId` + `learnerId` so the learner UI can create a submission.

## File Structure

**Backend (create):**

- `apps/backend/src/modules/files/files.service.upload.test.ts` — FilesService presigned upload/download unit tests (mock DB + S3).
- `apps/backend/src/modules/mvp/reviewer-queue.plan-c.test.ts` — queue refinement (essay-pending filter) pure-function tests.
- `apps/backend/src/modules/mvp/plan-c.http.integration.test.ts` — stub-controller permission/envelope tests for the 4 new endpoints.
- `apps/backend/migrations/0042_assessment_submission_return_attempt_review.sql` — additive nullable columns.
- `apps/backend/src/modules/mvp/migrations.0042.test.ts` — regex assertions (mirror `migrations.0041.test.ts`).

**Backend (modify):**

- `apps/backend/src/infrastructure/storage/storage.client.ts` — extend `StorageClient` interface.
- `apps/backend/src/infrastructure/storage/s3-storage.client.ts` — presigned URL methods.
- `apps/backend/src/modules/files/files.service.ts` — `createUploadIntent` + `createDownloadUrl` (+ inject `S3StorageClient`).
- `apps/backend/src/modules/mvp/mvp.types.ts` — add `reviewComment?`/`reviewedBy?` to `TestAttempt`, `returnComment?` to `AssignmentSubmission`; add `AttemptAnswerScoreInput`, `CompleteAttemptReviewInput`, `ReturnSubmissionInput`, `LearnerAssignmentSummary`.
- `apps/backend/src/modules/mvp/mvp.dto.ts` — `CreateUploadUrlRequest`, `ReturnSubmissionRequest`, `CompleteAttemptReviewRequest` (+ nested `AttemptAnswerScore`).
- `apps/backend/src/modules/mvp/mvp.service.ts` — `createSubmissionUploadIntent`, `getSubmissionFileUrl`, `completeAttemptReview`, `returnAssignmentSubmission`, `listMyAssignments`; refine `getReviewerQueue` to pass `attemptAnswers`.
- `apps/backend/src/modules/mvp/reviewer-queue.service.ts` — essay-pending filter.
- `apps/backend/src/modules/mvp/mvp.controller.ts` — 5 new endpoints (upload-url, file-url, return, complete-review, `GET /me/assignments`).
- `apps/backend/src/modules/mvp/mvp.service.test.ts` — extend `noopFilesService` with the two new methods; append `completeAttemptReview` / `returnAssignmentSubmission` / upload-wrapper service tests (reuses the existing attempt-setup pattern at `mvp.service.test.ts:383-442`).

**Frontend (create):**

- `apps/frontend/src/features/practical-submissions/{types.ts,api.ts,hooks.ts,format.ts,format.test.ts,api.contract.test.ts,assignments-list-screen.tsx,submission-screen.tsx}`
- `apps/frontend/src/features/reviewer-actions/{types.ts,api.ts,hooks.ts,format.ts,format.test.ts,api.contract.test.ts,reviewer-actions-screen.tsx}`
- `apps/frontend/app/learner/assignments/page.tsx`
- `apps/frontend/app/learner/assignments/[id]/submit/page.tsx`
- `apps/frontend/src/e2e/phase-3-plan-c-review.e2e.test.ts`

**Frontend (modify):**

- `apps/frontend/src/features/navigation/model.ts` — `routeMeta` + `navigationModel` for `/learner/assignments`.
- `apps/frontend/app/teacher/review/page.tsx` — render the active `ReviewerActionsScreen`.

---

## Task 1: Presigned file upload/download (storage + FilesService)

**Why first:** the learner submission UI (Task 9) and the upload endpoint (Task 5) need a working presigned-URL primitive, and it's the only genuinely new infrastructure.

**Files:**

- Modify: `apps/backend/src/infrastructure/storage/storage.client.ts`
- Modify: `apps/backend/src/infrastructure/storage/s3-storage.client.ts`
- Modify: `apps/backend/src/modules/files/files.service.ts`
- Test: `apps/backend/src/modules/files/files.service.upload.test.ts`

- [x] **Step 1: Extend the `StorageClient` interface** — replace the body of `storage.client.ts`:

```ts
export interface StorageReadiness {
  provider: 's3-compatible';
  healthy: boolean;
}

export interface PresignedUploadParams {
  key: string;
  contentType: string;
  expiresInSeconds?: number;
}

export interface PresignedDownloadParams {
  key: string;
  expiresInSeconds?: number;
}

export interface StorageClient {
  ping(): Promise<StorageReadiness>;
  createPresignedUploadUrl(params: PresignedUploadParams): Promise<string>;
  createPresignedDownloadUrl(params: PresignedDownloadParams): Promise<string>;
}
```

- [x] **Step 2: Implement the presigned methods on `S3StorageClient`** — in `s3-storage.client.ts`, update the import line and add the two methods:

```ts
import {
  GetObjectCommand,
  ListBucketsCommand,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable } from '@nestjs/common';

import { backendEnv } from '../../env.js';

import type {
  PresignedDownloadParams,
  PresignedUploadParams,
  StorageClient,
  StorageReadiness
} from './storage.client.js';
```

Add inside the class (after `ping()`):

```ts
async createPresignedUploadUrl(params: PresignedUploadParams): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: backendEnv.S3_BUCKET,
    Key: params.key,
    ContentType: params.contentType
  });
  return getSignedUrl(this.getClient(), command, {
    expiresIn: params.expiresInSeconds ?? 900
  });
}

async createPresignedDownloadUrl(params: PresignedDownloadParams): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: backendEnv.S3_BUCKET,
    Key: params.key
  });
  return getSignedUrl(this.getClient(), command, {
    expiresIn: params.expiresInSeconds ?? 900
  });
}
```

(Confirm `backendEnv.S3_BUCKET` exists in `apps/backend/src/env.ts`; `.env.example` has `S3_BUCKET=cdoprof-dev`. If the env schema lacks `S3_BUCKET`, add it there as a required string.)

- [x] **Step 3: Write the failing FilesService test** — create `files.service.upload.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import { FilesService } from './files.service.js';

import type { DatabaseService } from '../../infrastructure/database/database.service.js';
import type { S3StorageClient } from '../../infrastructure/storage/s3-storage.client.js';

function makeFilesService() {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const db = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      queries.push({ sql, params });
      if (sql.includes('select') && sql.includes('storage.files')) {
        return [{ storage_key: 'submissions/t1/existing.pdf' }];
      }
      return [];
    }),
    withTransaction: vi.fn()
  } as unknown as DatabaseService;
  const storage = {
    createPresignedUploadUrl: vi.fn(async () => 'https://minio.local/PUT-signed'),
    createPresignedDownloadUrl: vi.fn(async () => 'https://minio.local/GET-signed')
  } as unknown as S3StorageClient;
  return { service: new FilesService(db, storage), db, storage, queries };
}

describe('FilesService.createUploadIntent', () => {
  it('rejects a disallowed MIME type', async () => {
    const { service } = makeFilesService();
    await expect(
      service.createUploadIntent('t1', {
        originalName: 'x.exe',
        contentType: 'application/x-msdownload',
        sizeBytes: 10
      })
    ).rejects.toMatchObject({ response: { code: 'unsupported_media_type' } });
  });

  it('rejects an oversize file', async () => {
    const { service } = makeFilesService();
    await expect(
      service.createUploadIntent('t1', {
        originalName: 'big.pdf',
        contentType: 'application/pdf',
        sizeBytes: 50 * 1024 * 1024
      })
    ).rejects.toMatchObject({ response: { code: 'file_too_large' } });
  });

  it('registers metadata and returns a presigned PUT url for an allowed file', async () => {
    const { service, storage } = makeFilesService();
    const out = await service.createUploadIntent('t1', {
      originalName: 'work.pdf',
      contentType: 'application/pdf',
      sizeBytes: 1024
    });
    expect(out.fileId).toMatch(/^file_/);
    expect(out.uploadUrl).toBe('https://minio.local/PUT-signed');
    expect(out.expiresInSeconds).toBeGreaterThan(0);
    expect(storage.createPresignedUploadUrl).toHaveBeenCalledTimes(1);
  });
});

describe('FilesService.createDownloadUrl', () => {
  it('returns a presigned GET url for a tenant-owned file', async () => {
    const { service, storage } = makeFilesService();
    const url = await service.createDownloadUrl('t1', 'file_abc');
    expect(url).toBe('https://minio.local/GET-signed');
    expect(storage.createPresignedDownloadUrl).toHaveBeenCalledWith({
      key: 'submissions/t1/existing.pdf'
    });
  });

  it('throws when the file is not found for the tenant', async () => {
    const { service, db } = makeFilesService();
    (db.query as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    await expect(service.createDownloadUrl('t1', 'missing')).rejects.toMatchObject({
      response: { code: 'file_not_found' }
    });
  });
});
```

- [x] **Step 4: Run it and confirm it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/files/files.service.upload.test.ts --no-file-parallelism`
Expected: FAIL — `service.createUploadIntent is not a function` (and the constructor takes 1 arg, not 2).

- [x] **Step 5: Implement on `FilesService`** — in `files.service.ts`, inject the storage client and add the methods. Update the constructor + imports:

```ts
import { BadRequestException, Inject, Injectable } from '@nestjs/common';

import { DatabaseService } from '../../infrastructure/database/database.service.js';
import { S3StorageClient } from '../../infrastructure/storage/s3-storage.client.js';

import type { PoolClient } from 'pg';
```

```ts
const SUBMISSION_MIME_ALLOWLIST = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]);
const SUBMISSION_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const UPLOAD_URL_TTL_SECONDS = 900;

export interface UploadIntentInput {
  originalName: string;
  contentType: string;
  sizeBytes: number;
}

export interface UploadIntent {
  fileId: string;
  uploadUrl: string;
  storageKey: string;
  expiresInSeconds: number;
}
```

Constructor:

```ts
constructor(
  private readonly db: DatabaseService,
  @Inject(S3StorageClient) private readonly storage: S3StorageClient
) {}
```

Methods (after `ensureMaterialLink`):

```ts
async createUploadIntent(tenantId: string, input: UploadIntentInput): Promise<UploadIntent> {
  if (!SUBMISSION_MIME_ALLOWLIST.has(input.contentType)) {
    throw new BadRequestException({
      code: 'unsupported_media_type',
      message: 'File type is not allowed'
    });
  }
  if (input.sizeBytes <= 0 || input.sizeBytes > SUBMISSION_MAX_BYTES) {
    throw new BadRequestException({
      code: 'file_too_large',
      message: 'File exceeds the allowed size'
    });
  }
  const safeName = input.originalName.replace(/[^\w.\-]+/g, '_').slice(-80);
  const storageKey = `submissions/${tenantId}/${this.uploadId()}_${safeName}`;
  const file = await this.register({
    tenantId,
    storageKey,
    originalName: input.originalName,
    mimeType: input.contentType,
    sizeBytes: input.sizeBytes
  });
  const uploadUrl = await this.storage.createPresignedUploadUrl({
    key: storageKey,
    contentType: input.contentType,
    expiresInSeconds: UPLOAD_URL_TTL_SECONDS
  });
  return { fileId: file.id, uploadUrl, storageKey, expiresInSeconds: UPLOAD_URL_TTL_SECONDS };
}

async createDownloadUrl(tenantId: string, fileId: string): Promise<string> {
  const rows = await this.db.query<{ storage_key: string }>(
    `select storage_key from storage.files where tenant_id = $1 and id = $2 and deleted_at is null`,
    [tenantId, fileId]
  );
  if (!rows.length) {
    throw new BadRequestException({ code: 'file_not_found', message: 'File not found for tenant' });
  }
  return this.storage.createPresignedDownloadUrl({ key: rows[0]!.storage_key });
}

private uploadId(): string {
  return Math.random().toString(36).slice(2, 12);
}
```

- [x] **Step 6: Run the tests and confirm they pass**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/files/files.service.upload.test.ts --no-file-parallelism`
Expected: PASS (6 cases).

- [x] **Step 7: Typecheck + lint**

Run: `pnpm --filter @cdoprof/backend exec tsc --noEmit` then `npx eslint apps/backend/src/infrastructure/storage/storage.client.ts apps/backend/src/infrastructure/storage/s3-storage.client.ts apps/backend/src/modules/files/files.service.ts apps/backend/src/modules/files/files.service.upload.test.ts --max-warnings=0`
Expected: clean. (If `health.test.ts` / `health.http.integration.test.ts` construct `new S3StorageClient()` and now fail typecheck because the interface grew — they instantiate the class directly, which still satisfies the interface since the methods exist; no change needed. If they mock `StorageClient` shape, add the two methods to those mocks.)

- [x] **Step 8: Commit**

```bash
git add apps/backend/src/infrastructure/storage/ apps/backend/src/modules/files/
git commit -m "feat(backend): Phase 3 Plan C — presigned file upload/download (Task 1)"
```

---

## Task 2: `completeAttemptReview` — manual essay grading

**Why:** Plan B's autograder abstains on `essay` (`{ score: 0, autoGraded: false }`). A reviewer must score those answers, recompute the attempt, and move it out of the queue (`submitted → finished`).

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.types.ts` (add `reviewComment?`/`reviewedBy?` to `TestAttempt`; add `AttemptAnswerScoreInput` + `CompleteAttemptReviewInput`)
- Modify: `apps/backend/src/modules/mvp/mvp.service.ts` (add `completeAttemptReview` after `finishAttempt:2967`)
- Test: `apps/backend/src/modules/mvp/mvp.service.test.ts`

- [x] **Step 1: Add the types** — in `mvp.types.ts`, extend `TestAttempt` (it ends at `questionOrder: string[];`):

```ts
export interface TestAttempt extends BaseEntity {
  testId: string;
  enrollmentId: string;
  learnerId: string;
  attemptNo: number;
  status: AttemptStatus;
  startedAt: string;
  submittedAt?: string;
  finishedAt?: string;
  expiresAt?: string;
  score?: number;
  maxScore: number;
  passed?: boolean;
  questionOrder: string[];
  reviewComment?: string; // Plan C: reviewer note from manual essay grading
  reviewedBy?: string; // Plan C: actorId who completed the manual review
}
```

And add after `ExamResult`:

```ts
export interface AttemptAnswerScoreInput {
  questionId: string;
  score: number;
}

export interface CompleteAttemptReviewInput {
  answerScores: AttemptAnswerScoreInput[];
  reviewComment?: string;
}
```

- [x] **Step 2: Write the failing test** — append to `mvp.service.test.ts` (reuses the create signatures shown at `mvp.service.test.ts:383-442`; `noopDocumentsService`/`noopFilesService`/`testEmitter`/`ctx` are file-level consts):

```ts
describe('Plan C — completeAttemptReview', () => {
  function makeEssayAttempt(passingScore: number) {
    const service = new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      new AuditService(),
      noopDocumentsService,
      noopFilesService,
      testEmitter
    );
    const course = service.createCourse(
      'tenant_demo',
      ctx.userId,
      { code: 'CC', title: 'PlanC' },
      ctx
    );
    const group = service.createGroup(
      'tenant_demo',
      ctx.userId,
      { code: 'GC', name: 'GroupC' },
      ctx
    );
    service.createGroupCourse('tenant_demo', { groupId: group.id, courseId: course.id });
    const learner = service.createLearner(
      'tenant_demo',
      ctx.userId,
      { code: 'LC', name: 'Essay Learner' },
      ctx
    );
    const enrollment = service.createEnrollment(
      'tenant_demo',
      ctx.userId,
      { groupId: group.id, learnerId: learner.id },
      ctx
    );
    const bank = service.createQuestionBank(
      'tenant_demo',
      ctx.userId,
      { title: 'BankC', courseId: course.id },
      ctx
    );
    const essayQ = service.createQuestion(
      'tenant_demo',
      ctx.userId,
      { questionBankId: bank.id, text: 'Discuss safety', type: 'essay', score: 5 },
      ctx
    );
    const test = service.createTest(
      'tenant_demo',
      ctx.userId,
      {
        title: 'EssayTest',
        courseId: course.id,
        questionBankId: bank.id,
        rules: { attemptLimit: 1, passingScore }
      },
      ctx
    );
    service.addTestQuestions('tenant_demo', test.id, [essayQ.id]);
    const attempt = service.startAttempt(
      'tenant_demo',
      ctx.userId,
      { testId: test.id, enrollmentId: enrollment.id, learnerId: learner.id },
      ctx
    );
    service.saveAttemptAnswer(
      'tenant_demo',
      ctx.userId,
      attempt.id,
      { questionId: essayQ.id, textAnswer: 'a thoughtful essay' },
      ctx
    );
    return { service, essayQ, attempt };
  }

  it('scores the essay, recomputes score/passed, finishes, updates ExamResult', () => {
    const { service, essayQ, attempt } = makeEssayAttempt(3);
    const submitted = service.submitAttempt('tenant_demo', ctx.userId, attempt.id, ctx);
    expect(submitted.score).toBe(0); // essay abstains at submit
    expect(submitted.status).toBe('submitted');

    const reviewed = service.completeAttemptReview(
      'tenant_demo',
      ctx.userId,
      attempt.id,
      { answerScores: [{ questionId: essayQ.id, score: 4 }], reviewComment: 'good' },
      ctx
    );
    expect(reviewed.score).toBe(4);
    expect(reviewed.passed).toBe(true);
    expect(reviewed.status).toBe('finished');
    expect(reviewed.reviewComment).toBe('good');

    const result = service.getAttemptResult('tenant_demo', attempt.id);
    expect(result.finalScore).toBe(4);
    expect(result.passed).toBe(true);
  });

  it('rejects an out-of-range score', () => {
    const { service, essayQ, attempt } = makeEssayAttempt(3);
    service.submitAttempt('tenant_demo', ctx.userId, attempt.id, ctx);
    expect(() =>
      service.completeAttemptReview(
        'tenant_demo',
        ctx.userId,
        attempt.id,
        { answerScores: [{ questionId: essayQ.id, score: 99 }] },
        ctx
      )
    ).toThrow(BadRequestException);
  });

  it('refuses to review an attempt that is not submitted', () => {
    const { service, essayQ, attempt } = makeEssayAttempt(3);
    expect(() =>
      service.completeAttemptReview(
        'tenant_demo',
        ctx.userId,
        attempt.id,
        { answerScores: [{ questionId: essayQ.id, score: 1 }] },
        ctx
      )
    ).toThrow(PreconditionFailedException); // still in_progress
  });
});
```

(`BadRequestException`/`PreconditionFailedException` are already imported at the top of `mvp.service.test.ts`; if not, add them from `@nestjs/common`.)

- [x] **Step 3: Run it and confirm it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/mvp.service.test.ts --no-file-parallelism -t "completeAttemptReview"`
Expected: FAIL — `service.completeAttemptReview is not a function`.

- [x] **Step 4: Implement `completeAttemptReview`** — add `CompleteAttemptReviewInput` to the `mvp.types.js` type-import block in `mvp.service.ts`, then add the method after `finishAttempt` (`:2967`):

```ts
completeAttemptReview(
  tenantId: string,
  actorId: string | undefined,
  attemptId: string,
  input: CompleteAttemptReviewInput,
  context: RequestContext
): TestAttempt {
  const attempt = this.getById(this.state.attempts, tenantId, attemptId);
  if (attempt.status !== 'submitted') {
    throw new PreconditionFailedException({
      code: 'domain_rule_violation',
      message: 'Only submitted attempts can be reviewed'
    });
  }
  const answers = this.state.attemptAnswers.filter(
    (a) => a.tenantId === tenantId && a.attemptId === attempt.id
  );
  for (const item of input.answerScores) {
    const answer = answers.find((a) => a.questionId === item.questionId);
    if (!answer) {
      throw new BadRequestException({
        code: 'validation_error',
        message: `No answer recorded for question ${item.questionId}`
      });
    }
    if (answer.autoGraded !== false) {
      throw new PreconditionFailedException({
        code: 'domain_rule_violation',
        message: 'Only manually-gradable (non-auto-graded) answers can be scored'
      });
    }
    const question = this.getById(this.state.questions, tenantId, item.questionId);
    if (item.score < 0 || item.score > question.score) {
      throw new BadRequestException({
        code: 'validation_error',
        message: 'Score must be within [0, question.score]'
      });
    }
    answer.score = item.score;
    answer.updatedAt = this.now();
  }
  const total = answers.reduce((sum, a) => sum + (a.score ?? 0), 0);
  const test = this.getById(this.state.tests, tenantId, attempt.testId);
  attempt.score = total;
  attempt.passed = total >= test.rules.passingScore;
  attempt.status = 'finished';
  attempt.finishedAt = this.now();
  attempt.reviewedBy = actorId;
  if (input.reviewComment !== undefined) attempt.reviewComment = input.reviewComment;
  attempt.updatedAt = this.now();
  this.finalizeExamResult(tenantId, actorId, attempt, context);
  this.audit(
    tenantId,
    actorId,
    'assessment.attempt_review_completed',
    'assessment.test_attempt',
    attempt.id,
    undefined,
    attempt,
    context
  );
  return attempt;
}
```

- [x] **Step 5: Run the test (PASS) + attempt-lifecycle regressions**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/mvp.service.test.ts src/modules/mvp/business-flows.e2e.test.ts --no-file-parallelism`
Expected: PASS (no regression in existing attempt tests).

- [x] **Step 6: Lint + commit**

```bash
npx eslint apps/backend/src/modules/mvp/mvp.service.ts apps/backend/src/modules/mvp/mvp.types.ts apps/backend/src/modules/mvp/mvp.service.test.ts --max-warnings=0
git add apps/backend/src/modules/mvp/
git commit -m "feat(backend): Phase 3 Plan C — completeAttemptReview manual essay grading (Task 2)"
```

---

## Task 3: `returnAssignmentSubmission` — return-for-revision cycle

**Why:** a reviewer must be able to send a submission back for rework (`under_review → returned`), so the learner edits and resubmits for a fresh review.

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.types.ts` (add `returnComment?` to `AssignmentSubmission`; add `ReturnSubmissionInput`)
- Modify: `apps/backend/src/modules/mvp/mvp.service.ts` (add `returnAssignmentSubmission` after `completeAssignmentReview:3461`)
- Test: `apps/backend/src/modules/mvp/mvp.service.test.ts`

- [x] **Step 1: Add the types** — in `mvp.types.ts`, extend `AssignmentSubmission` (add the field after `submittedAt?`):

```ts
export interface AssignmentSubmission extends BaseEntity {
  assignmentId: string;
  enrollmentId: string;
  learnerId: string;
  textAnswer?: string;
  answerText?: string;
  fileId?: string;
  status: AssignmentSubmissionStatus;
  submittedAt?: string;
  returnComment?: string; // Plan C: reviewer feedback when returned for revision
}
```

And add:

```ts
export interface ReturnSubmissionInput {
  comment?: string;
}
```

- [x] **Step 2: Write the failing test** — append to `mvp.service.test.ts`:

```ts
describe('Plan C — returnAssignmentSubmission', () => {
  function makeSubmittedUnderReview() {
    const service = new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      new AuditService(),
      noopDocumentsService,
      noopFilesService,
      testEmitter
    );
    const course = service.createCourse(
      'tenant_demo',
      ctx.userId,
      { code: 'CR', title: 'Return' },
      ctx
    );
    const group = service.createGroup(
      'tenant_demo',
      ctx.userId,
      { code: 'GR', name: 'GroupR' },
      ctx
    );
    service.createGroupCourse('tenant_demo', { groupId: group.id, courseId: course.id });
    const learner = service.createLearner(
      'tenant_demo',
      ctx.userId,
      { code: 'LR', name: 'Return Learner' },
      ctx
    );
    const enrollment = service.createEnrollment(
      'tenant_demo',
      ctx.userId,
      { groupId: group.id, learnerId: learner.id },
      ctx
    );
    const assignment = service.createAssignment(
      'tenant_demo',
      ctx.userId,
      { courseId: course.id, title: 'Practical', maxScore: 10 },
      ctx
    );
    const submission = service.createAssignmentSubmission(
      'tenant_demo',
      ctx.userId,
      {
        assignmentId: assignment.id,
        enrollmentId: enrollment.id,
        learnerId: learner.id,
        answerText: 'first draft'
      },
      ctx
    );
    service.submitAssignmentSubmission('tenant_demo', ctx.userId, submission.id, ctx);
    service.createAssignmentReview(
      'tenant_demo',
      ctx.userId,
      { submissionId: submission.id, comment: 'needs work' },
      ctx
    );
    return { service, submission, enrollment, assignment, learner };
  }

  it('returns an under_review submission and clears the active review so it can be re-reviewed', () => {
    const { service, submission } = makeSubmittedUnderReview();
    const returned = service.returnAssignmentSubmission(
      'tenant_demo',
      ctx.userId,
      submission.id,
      { comment: 'add section 3' },
      ctx
    );
    expect(returned.status).toBe('returned');
    expect(returned.returnComment).toBe('add section 3');
    expect(
      service
        .listAssignmentReviews('tenant_demo', {})
        .items.filter((r) => r.submissionId === submission.id)
    ).toHaveLength(0);

    // learner edits the returned submission and resubmits → submitted again
    service.updateAssignmentSubmission(
      'tenant_demo',
      ctx.userId,
      submission.id,
      { answerText: 'revised draft' },
      ctx
    );
    const resubmitted = service.submitAssignmentSubmission(
      'tenant_demo',
      ctx.userId,
      submission.id,
      ctx
    );
    expect(resubmitted.status).toBe('submitted');

    // a fresh review can now be created without the one-review conflict
    const review = service.createAssignmentReview(
      'tenant_demo',
      ctx.userId,
      { submissionId: submission.id },
      ctx
    );
    expect(review.status).toBe('in_review');
  });

  it('refuses to return a submission that is not under_review', () => {
    const { service, assignment, enrollment, learner } = makeSubmittedUnderReview();
    const draft = service.createAssignmentSubmission(
      'tenant_demo',
      ctx.userId,
      {
        assignmentId: assignment.id,
        enrollmentId: enrollment.id,
        learnerId: learner.id,
        answerText: 'x'
      },
      ctx
    );
    expect(() =>
      service.returnAssignmentSubmission(
        'tenant_demo',
        ctx.userId,
        draft.id,
        { comment: 'no' },
        ctx
      )
    ).toThrow(PreconditionFailedException);
  });
});
```

(Verify `createAssignment` signature against `mvp.service.ts` — it is `createAssignment(tenantId, actorId, { courseId, title, maxScore, ... }, ctx)`; adapt field names if the real DTO differs.)

- [x] **Step 2b: Run it and confirm it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/mvp.service.test.ts --no-file-parallelism -t "returnAssignmentSubmission"`
Expected: FAIL — not a function.

- [x] **Step 3: Implement `returnAssignmentSubmission`** — add `ReturnSubmissionInput` to the type-import block, then add the method after `completeAssignmentReview` (`:3461`):

```ts
returnAssignmentSubmission(
  tenantId: string,
  actorId: string | undefined,
  id: string,
  request: ReturnSubmissionInput,
  context: RequestContext
): AssignmentSubmission {
  const submission = this.getById(this.state.assignmentSubmissions, tenantId, id);
  if (submission.status !== 'under_review') {
    throw new PreconditionFailedException({
      code: 'domain_rule_violation',
      message: 'Only submissions under review can be returned for revision'
    });
  }
  const reviewIndex = this.state.assignmentReviews.findIndex(
    (r) => r.tenantId === tenantId && r.submissionId === submission.id && r.status !== 'completed'
  );
  if (reviewIndex >= 0) this.state.assignmentReviews.splice(reviewIndex, 1);
  submission.status = 'returned';
  if (request.comment !== undefined) submission.returnComment = request.comment;
  submission.updatedAt = this.now();
  this.audit(
    tenantId,
    actorId,
    'assessment.assignment_submission_returned',
    'assessment.assignment_submission',
    submission.id,
    undefined,
    submission,
    context
  );
  return submission;
}
```

- [x] **Step 4: Run the test (PASS)**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/mvp.service.test.ts --no-file-parallelism -t "returnAssignmentSubmission"`
Expected: PASS.

- [x] **Step 5: Lint + commit**

```bash
npx eslint apps/backend/src/modules/mvp/mvp.service.ts apps/backend/src/modules/mvp/mvp.types.ts apps/backend/src/modules/mvp/mvp.service.test.ts --max-warnings=0
git add apps/backend/src/modules/mvp/
git commit -m "feat(backend): Phase 3 Plan C — returnAssignmentSubmission revision cycle (Task 3)"
```

---

## Task 4: Reviewer-queue refinement (only attempts needing manual grading)

**Why:** Plan A's aggregator lists every `submitted` attempt — even fully auto-graded ones with no essays. Refine it so an attempt appears only if it has ≥1 answer with `autoGraded === false`.

**Files:**

- Modify: `apps/backend/src/modules/mvp/reviewer-queue.service.ts`
- Modify: `apps/backend/src/modules/mvp/mvp.service.ts` (`getReviewerQueue:2535` passes `attemptAnswers`)
- Test: `apps/backend/src/modules/mvp/reviewer-queue.plan-c.test.ts`

- [x] **Step 1: Write the failing test** — create `reviewer-queue.plan-c.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { aggregateReviewerQueue } from './reviewer-queue.service.js';

import type { AttemptAnswer, TestAttempt } from './mvp.types.js';

function attempt(id: string, status: TestAttempt['status']): TestAttempt {
  return {
    id,
    tenantId: 't',
    testId: 'test1',
    enrollmentId: 'e1',
    learnerId: 'l1',
    attemptNo: 1,
    status,
    startedAt: 'now',
    maxScore: 5,
    questionOrder: ['q1'],
    createdAt: 'now',
    updatedAt: 'now'
  };
}
function answer(attemptId: string, autoGraded: boolean): AttemptAnswer {
  return {
    id: `a_${attemptId}`,
    tenantId: 't',
    attemptId,
    questionId: 'q1',
    autoGraded,
    status: 'active',
    createdAt: 'now',
    updatedAt: 'now'
  };
}

describe('aggregateReviewerQueue — Plan C essay-pending filter', () => {
  it('includes a submitted attempt only when it has a non-auto-graded answer', () => {
    const out = aggregateReviewerQueue(
      {
        testAttempts: [attempt('manual', 'submitted'), attempt('auto', 'submitted')],
        attemptAnswers: [answer('manual', false), answer('auto', true)],
        assignmentSubmissions: []
      },
      { tenantId: 't' }
    );
    expect(out.pendingAttempts.map((p) => p.id)).toEqual(['manual']);
  });

  it('excludes non-submitted attempts regardless of answers', () => {
    const out = aggregateReviewerQueue(
      {
        testAttempts: [attempt('finished', 'finished')],
        attemptAnswers: [answer('finished', false)],
        assignmentSubmissions: []
      },
      { tenantId: 't' }
    );
    expect(out.pendingAttempts).toHaveLength(0);
  });
});
```

- [x] **Step 2: Run it → FAIL** (the snapshot type has no `attemptAnswers`, and the auto attempt is still included).

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/reviewer-queue.plan-c.test.ts --no-file-parallelism`

- [x] **Step 3: Refine the aggregator** — in `reviewer-queue.service.ts`, update the import, the snapshot interface, and the `pendingAttempts` filter:

```ts
import type {
  AssignmentSubmission,
  AttemptAnswer,
  ReviewerQueueItem,
  ReviewerQueueSnapshot,
  TestAttempt
} from './mvp.types.js';
```

```ts
export interface ReviewerQueueInputSnapshot {
  testAttempts: TestAttempt[];
  attemptAnswers: AttemptAnswer[];
  assignmentSubmissions: AssignmentSubmission[];
}
```

Replace the `pendingAttempts` block:

```ts
const needsManualGrading = (attemptId: string): boolean =>
  snapshot.attemptAnswers.some(
    (a) => a.tenantId === filter.tenantId && a.attemptId === attemptId && a.autoGraded === false
  );

const pendingAttempts: ReviewerQueueItem[] = snapshot.testAttempts
  .filter(
    (a) => a.tenantId === filter.tenantId && a.status === 'submitted' && needsManualGrading(a.id)
  )
  .map((a) => ({
    kind: 'attempt' as const,
    id: a.id,
    tenantId: a.tenantId,
    learnerId: a.learnerId,
    testId: a.testId,
    submittedAt: a.submittedAt ?? a.createdAt
  }));
```

- [x] **Step 4: Wire `attemptAnswers` in `getReviewerQueue`** — in `mvp.service.ts:2535-2543`:

```ts
getReviewerQueue(tenantId: string, _context: RequestContext): ReviewerQueueSnapshot {
  return aggregateReviewerQueue(
    {
      testAttempts: this.state.attempts as TestAttempt[],
      attemptAnswers: this.state.attemptAnswers,
      assignmentSubmissions: this.state.assignmentSubmissions
    },
    { tenantId }
  );
}
```

- [x] **Step 5: Run the new test + the existing reviewer-queue test**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/reviewer-queue.plan-c.test.ts src/modules/mvp/reviewer-queue.service.test.ts --no-file-parallelism`
Expected: PASS. (If `reviewer-queue.service.test.ts` constructs the old snapshot without `attemptAnswers`, add `attemptAnswers: []` to those fixtures.)

- [x] **Step 6: Lint + commit**

```bash
npx eslint apps/backend/src/modules/mvp/reviewer-queue.service.ts apps/backend/src/modules/mvp/mvp.service.ts apps/backend/src/modules/mvp/reviewer-queue.plan-c.test.ts --max-warnings=0
git add apps/backend/src/modules/mvp/
git commit -m "feat(backend): Phase 3 Plan C — reviewer queue shows only essay-pending attempts (Task 4)"
```

---

## Task 5: DTOs + controller endpoints (upload-url, file-url, complete-review, return)

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.dto.ts` (3 request classes + nested)
- Modify: `apps/backend/src/modules/mvp/mvp.service.ts` (`createSubmissionUploadIntent`, `getSubmissionFileUrl`)
- Modify: `apps/backend/src/modules/mvp/mvp.controller.ts` (4 endpoints)
- Modify: `apps/backend/src/modules/mvp/mvp.service.test.ts` (extend `noopFilesService`)
- Test: `apps/backend/src/modules/mvp/plan-c.http.integration.test.ts`

- [x] **Step 1: Add the DTO classes** — in `mvp.dto.ts` (follow the existing class-validator style; `IsArray`/`ValidateNested`/`Type`/`Min` are already imported there or add them from `class-validator`/`class-transformer`):

```ts
export class CreateUploadUrlRequest {
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

export class ReturnSubmissionRequest {
  @IsOptional()
  @IsString()
  comment?: string;
}

export class AttemptAnswerScore {
  @IsString()
  @MinLength(1)
  questionId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  score!: number;
}

export class CompleteAttemptReviewRequest {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttemptAnswerScore)
  answerScores!: AttemptAnswerScore[];

  @IsOptional()
  @IsString()
  reviewComment?: string;
}
```

- [x] **Step 2: Add the MvpService upload wrappers** — in `mvp.service.ts`, add `UploadIntent` to the `FilesService` import usage and add after `submitAssignmentSubmission` (`:3335`):

```ts
async createSubmissionUploadIntent(
  tenantId: string,
  actorId: string | undefined,
  submissionId: string,
  request: { originalName: string; contentType: string; sizeBytes: number },
  context: RequestContext
): Promise<UploadIntent> {
  const submission = this.getById(this.state.assignmentSubmissions, tenantId, submissionId);
  const enrollment = this.getById(this.state.enrollments, tenantId, submission.enrollmentId);
  this.assertActorMatchesLearnerIamLink(tenantId, actorId, enrollment.learnerId, context.permissions);
  if (!['draft', 'returned'].includes(submission.status)) {
    throw new PreconditionFailedException({
      code: 'submission_not_editable',
      message: 'Files can only be attached to a draft or returned submission'
    });
  }
  return this.filesService.createUploadIntent(tenantId, request);
}

async getSubmissionFileUrl(
  tenantId: string,
  submissionId: string,
  access?: MvpAssessmentReadAccess
): Promise<{ url: string }> {
  const submission = this.getById(this.state.assignmentSubmissions, tenantId, submissionId);
  this.assertAssessmentReadAllowedForLearner(tenantId, submission.learnerId, access);
  if (!submission.fileId) {
    throw new BadRequestException({ code: 'no_file', message: 'Submission has no attached file' });
  }
  const url = await this.filesService.createDownloadUrl(tenantId, submission.fileId);
  return { url };
}
```

Import the `UploadIntent` type: add `import type { UploadIntent } from '../files/files.service.js';` near the `FilesService` import in `mvp.service.ts`.

- [x] **Step 3: Extend `noopFilesService`** — in `mvp.service.test.ts:24`, so MvpService tests that hit the upload path get a deterministic stub:

```ts
const noopFilesService = {
  ensureMaterialLink: async () => undefined,
  createUploadIntent: async () => ({
    fileId: 'file_stub',
    uploadUrl: 'https://minio.local/PUT',
    storageKey: 'submissions/tenant_demo/stub',
    expiresInSeconds: 900
  }),
  createDownloadUrl: async () => 'https://minio.local/GET'
} as unknown as FilesService;
```

- [x] **Step 4: Add a service test for the upload wrappers** — append to `mvp.service.test.ts`:

```ts
describe('Plan C — submission file upload wrappers', () => {
  it('issues an upload intent for a draft submission owned by the actor', async () => {
    const service = new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      new AuditService(),
      noopDocumentsService,
      noopFilesService,
      testEmitter
    );
    const course = service.createCourse(
      'tenant_demo',
      ctx.userId,
      { code: 'CF', title: 'Files' },
      ctx
    );
    const group = service.createGroup('tenant_demo', ctx.userId, { code: 'GF', name: 'GF' }, ctx);
    service.createGroupCourse('tenant_demo', { groupId: group.id, courseId: course.id });
    const learner = service.createLearner(
      'tenant_demo',
      ctx.userId,
      { code: 'LF', name: 'File Learner' },
      ctx
    );
    const enrollment = service.createEnrollment(
      'tenant_demo',
      ctx.userId,
      { groupId: group.id, learnerId: learner.id },
      ctx
    );
    const assignment = service.createAssignment(
      'tenant_demo',
      ctx.userId,
      { courseId: course.id, title: 'P', maxScore: 10 },
      ctx
    );
    const submission = service.createAssignmentSubmission(
      'tenant_demo',
      ctx.userId,
      {
        assignmentId: assignment.id,
        enrollmentId: enrollment.id,
        learnerId: learner.id,
        answerText: 'd'
      },
      ctx
    );

    const intent = await service.createSubmissionUploadIntent(
      'tenant_demo',
      ctx.userId,
      submission.id,
      { originalName: 'w.pdf', contentType: 'application/pdf', sizeBytes: 100 },
      ctx
    );
    expect(intent.uploadUrl).toContain('https://minio.local');
    expect(intent.fileId).toBe('file_stub');
  });
});
```

- [x] **Step 5: Add the controller endpoints** — in `mvp.controller.ts`, after the assignment-submission endpoints (`submitAssignmentSubmission:1051-1056`) and after the attempt endpoints, add:

```ts
@Post('assignment-submissions/:id/upload-url')
@UseGuards(PermissionGuard)
@RequirePermissions('assessment.submissions.submit')
createSubmissionUploadUrl(@CurrentContext() c: RequestContext, @Param('id') id: string, @Body() raw: unknown) {
  const b = assertValidDto(CreateUploadUrlRequest, raw);
  return this.mvpService.createSubmissionUploadIntent(c.tenantId!, c.userId, id, b, c);
}

@Get('assignment-submissions/:id/file-url')
@UseGuards(PermissionGuard)
@RequirePermissions('assessment.assignments.read')
getSubmissionFileUrl(@CurrentContext() c: RequestContext, @Param('id') id: string) {
  return this.mvpService.getSubmissionFileUrl(c.tenantId!, id, {
    actorId: c.userId,
    permissions: c.permissions
  });
}

@Post('assignment-submissions/:id/return')
@UseGuards(PermissionGuard)
@RequirePermissions('assessment.reviews.review')
returnAssignmentSubmission(@CurrentContext() c: RequestContext, @Param('id') id: string, @Body() raw: unknown) {
  const b = assertValidDto(ReturnSubmissionRequest, raw);
  return this.mvpService.returnAssignmentSubmission(c.tenantId!, c.userId, id, b, c);
}

@Post('attempts/:id/complete-review')
@UseGuards(PermissionGuard)
@RequirePermissions('assessment.reviews.review')
completeAttemptReview(@CurrentContext() c: RequestContext, @Param('id') id: string, @Body() raw: unknown) {
  const b = assertValidDto(CompleteAttemptReviewRequest, raw);
  return this.mvpService.completeAttemptReview(c.tenantId!, c.userId, id, b, c);
}
```

Add `CreateUploadUrlRequest`, `ReturnSubmissionRequest`, `CompleteAttemptReviewRequest` to the `mvp.dto.js` import block in `mvp.controller.ts`.

- [x] **Step 6: Write the HTTP integration test** — create `plan-c.http.integration.test.ts` by copying the structure of `test-player.http.integration.test.ts` (same minimal-Nest stub-controller harness, same envelope + `auth_required` / `permission_denied` assertions). Cover the 4 routes:
  - `POST /assignment-submissions/:id/upload-url` → 401 no auth; 403 without `assessment.submissions.submit`; 200 `{ data }`.
  - `GET /assignment-submissions/:id/file-url` → 401; 403 without `assessment.assignments.read`; 200.
  - `POST /assignment-submissions/:id/return` → 401; 403 without `assessment.reviews.review`; 200.
  - `POST /attempts/:id/complete-review` → 401; 403 without `assessment.reviews.review`; 200.

Keep it to ~12 cases. The stub controller returns canned `{ data }` payloads (do **not** boot the real `MvpController`/`MvpService`).

- [x] **Step 7: Run the touched suites**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/mvp.service.test.ts src/modules/mvp/plan-c.http.integration.test.ts --no-file-parallelism`
Expected: PASS.

- [x] **Step 8: Typecheck + lint + commit**

```bash
pnpm --filter @cdoprof/backend exec tsc --noEmit
npx eslint apps/backend/src/modules/mvp/mvp.dto.ts apps/backend/src/modules/mvp/mvp.service.ts apps/backend/src/modules/mvp/mvp.controller.ts apps/backend/src/modules/mvp/mvp.service.test.ts apps/backend/src/modules/mvp/plan-c.http.integration.test.ts --max-warnings=0
git add apps/backend/src/modules/mvp/
git commit -m "feat(backend): Phase 3 Plan C — DTOs + endpoints (upload-url/file-url/return/complete-review) (Task 5)"
```

---

## Task 6: Learner assignment discovery (`GET /me/assignments`)

**Why:** the learner submission UI (Task 9) needs a scoped list of the learner's available assignments + submission status — the direct analog of Plan B's `/me/tests`. Resolves the learner server-side from the actor (mirrors `listMyTests`).

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.types.ts` (`LearnerAssignmentSummary`)
- Modify: `apps/backend/src/modules/mvp/mvp.service.ts` (`listMyAssignments`, mirroring `listMyTests`)
- Modify: `apps/backend/src/modules/mvp/mvp.controller.ts` (`GET /me/assignments`)
- Test: `apps/backend/src/modules/mvp/mvp.service.test.ts` + extend `plan-c.http.integration.test.ts`

- [x] **Step 1: Read `listMyTests` first** — open `mvp.service.ts` and find `listMyTests(tenantId, actorId)`. Note how it resolves linked learner(s) (by `linkedIamUserId === actorId`) and returns `[]` when unlinked. `listMyAssignments` must reuse that exact resolution (the same private helper `listMyTests` uses — grep for it, e.g. `resolveLinkedLearnerIds` or inline filter on `state.learners`).

- [x] **Step 2: Add the type** — in `mvp.types.ts`:

```ts
export interface LearnerAssignmentSummary {
  assignmentId: string;
  title: string;
  courseId: string;
  enrollmentId: string;
  learnerId: string;
  maxScore: number;
  submissionId?: string;
  status: 'not_started' | AssignmentSubmissionStatus;
  returnComment?: string;
}
```

- [x] **Step 3: Write the failing test** — append to `mvp.service.test.ts`:

```ts
describe('Plan C — listMyAssignments', () => {
  it('returns published assignments for the actor-linked learner with submission status', () => {
    const service = new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      new AuditService(),
      noopDocumentsService,
      noopFilesService,
      testEmitter
    );
    const course = service.createCourse('tenant_demo', ctx.userId, { code: 'CA', title: 'A' }, ctx);
    const group = service.createGroup('tenant_demo', ctx.userId, { code: 'GA', name: 'GA' }, ctx);
    service.createGroupCourse('tenant_demo', { groupId: group.id, courseId: course.id });
    // Link a learner to the acting IAM user so the actor-resolution finds it.
    const learner = service.createLearner(
      'tenant_demo',
      ctx.userId,
      { code: 'LA', name: 'Linked', linkedIamUserId: ctx.userId },
      ctx
    );
    service.createEnrollment(
      'tenant_demo',
      ctx.userId,
      { groupId: group.id, learnerId: learner.id },
      ctx
    );
    const assignment = service.createAssignment(
      'tenant_demo',
      ctx.userId,
      { courseId: course.id, title: 'Practical', maxScore: 10 },
      ctx
    );
    service.publishAssignment?.('tenant_demo', ctx.userId, assignment.id, ctx); // if publish is required; otherwise assignment is listable by default

    const list = service.listMyAssignments('tenant_demo', ctx.userId);
    expect(list.map((a) => a.assignmentId)).toContain(assignment.id);
    expect(list.find((a) => a.assignmentId === assignment.id)?.status).toBe('not_started');
  });

  it('returns [] when the actor has no linked learner (not 403)', () => {
    const service = new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      new AuditService(),
      noopDocumentsService,
      noopFilesService,
      testEmitter
    );
    expect(service.listMyAssignments('tenant_demo', 'u_no_link')).toEqual([]);
  });
});
```

(Confirm the exact `createLearner` link field — Pillar A used `linkedIamUserId`; adapt if the DTO names it differently. Confirm whether assignments need `publishedAt` to be listable; mirror the `listLearnerTests` published-filter decision — if assignments have no publish step, drop the published filter.)

- [x] **Step 4: Run it → FAIL** (`listMyAssignments` not a function).

- [x] **Step 5: Implement `listMyAssignments`** — add `LearnerAssignmentSummary` to the type-import block, then add the method near `listMyTests`:

```ts
listMyAssignments(tenantId: string, actorId: string | undefined): LearnerAssignmentSummary[] {
  const learnerIds = this.resolveActorLinkedLearnerIds(tenantId, actorId); // same helper listMyTests uses
  if (learnerIds.length === 0) return [];
  const summaries: LearnerAssignmentSummary[] = [];
  for (const learnerId of learnerIds) {
    const enrollments = this.state.enrollments.filter(
      (e) => e.tenantId === tenantId && e.learnerId === learnerId
    );
    for (const enrollment of enrollments) {
      const courseIds = this.state.groupCourses
        .filter((gc) => gc.tenantId === tenantId && gc.groupId === enrollment.groupId)
        .map((gc) => gc.courseId);
      const assignments = this.state.assignments.filter(
        (a) => a.tenantId === tenantId && !a.isArchived && courseIds.includes(a.courseId)
      );
      for (const assignment of assignments) {
        const submission = this.state.assignmentSubmissions.find(
          (s) =>
            s.tenantId === tenantId &&
            s.assignmentId === assignment.id &&
            s.enrollmentId === enrollment.id
        );
        summaries.push({
          assignmentId: assignment.id,
          title: assignment.title,
          courseId: assignment.courseId,
          enrollmentId: enrollment.id,
          learnerId,
          maxScore: assignment.maxScore,
          status: submission?.status ?? 'not_started',
          ...(submission?.id !== undefined ? { submissionId: submission.id } : {}),
          ...(submission?.returnComment !== undefined ? { returnComment: submission.returnComment } : {})
        });
      }
    }
  }
  return summaries;
}
```

(If `listMyTests` resolves learners inline rather than via a named helper, copy that exact inline resolution here instead of `resolveActorLinkedLearnerIds`. If `listLearnerTests` filtered on `publishedAt`, add the same `Boolean(a.publishedAt)` filter to the assignments filter for parity.)

- [x] **Step 6: Add the endpoint** — in `mvp.controller.ts`, right after `listMyTests` (`:551`):

```ts
@Get('me/assignments')
@UseGuards(PermissionGuard)
@RequirePermissions('assessment.assignments.read')
listMyAssignments(@CurrentContext() c: RequestContext) {
  return this.mvpService.listMyAssignments(c.tenantId!, c.userId);
}
```

- [x] **Step 7: Extend the HTTP test** — add `GET /me/assignments` cases to `plan-c.http.integration.test.ts` (401 / 403 without `assessment.assignments.read` / 200 `{ data: [...] }`).

- [x] **Step 8: Run tests + lint + commit**

```bash
pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/mvp.service.test.ts src/modules/mvp/plan-c.http.integration.test.ts --no-file-parallelism
npx eslint apps/backend/src/modules/mvp/mvp.service.ts apps/backend/src/modules/mvp/mvp.types.ts apps/backend/src/modules/mvp/mvp.controller.ts --max-warnings=0
git add apps/backend/src/modules/mvp/
git commit -m "feat(backend): Phase 3 Plan C — GET /me/assignments learner discovery (Task 6)"
```

---

## Task 7: Migration 0042 (schema parity)

**Why:** keep Postgres in step with the new `returnComment` (submissions) + `reviewComment`/`reviewedBy` (attempts) fields. Additive + nullable. MVP runs in-memory by default, so the service tests are the acceptance gate; this is parity.

**Files:**

- Create: `apps/backend/migrations/0042_assessment_submission_return_attempt_review.sql`
- Test: `apps/backend/src/modules/mvp/migrations.0042.test.ts` (mirror `migrations.0041.test.ts`)

- [x] **Step 1: Write the migration test** (regex assertions, mirroring `migrations.0041.test.ts`): assert the file adds `return_comment text` to `assessment.assignment_submissions`, `review_comment text` + `reviewed_by text` to `assessment.test_attempts`, and uses `IF NOT EXISTS`.

- [x] **Step 2: Run it → FAIL** (file missing).

- [x] **Step 3: Write the migration:**

```sql
-- 0042_assessment_submission_return_attempt_review.sql
-- Phase 3 Plan C: store reviewer feedback on returned submissions and manual
-- attempt-review metadata. Additive + nullable — safe on existing rows.
ALTER TABLE assessment.assignment_submissions
  ADD COLUMN IF NOT EXISTS return_comment text;

ALTER TABLE assessment.test_attempts
  ADD COLUMN IF NOT EXISTS review_comment text;

ALTER TABLE assessment.test_attempts
  ADD COLUMN IF NOT EXISTS reviewed_by text;
```

- [x] **Step 4: Run the migration test → PASS.**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/migrations.0042.test.ts --no-file-parallelism`

- [x] **Step 5: Commit**

```bash
git add apps/backend/migrations/0042_assessment_submission_return_attempt_review.sql apps/backend/src/modules/mvp/migrations.0042.test.ts
git commit -m "feat(backend): Phase 3 Plan C — migration 0042 return_comment + attempt review fields (Task 7)"
```

---

## Task 8: Frontend navigation + permission map

**Files:**

- Modify: `apps/frontend/src/features/navigation/model.ts` (`routeMeta` + `navigationModel`)
- Verify: `apps/frontend/src/lib/auth/permission-map.ts` (no change expected)

- [x] **Step 1: Verify the learner permission map** — confirm `learner` (`permission-map.ts:81-89`) already contains `assessment.submissions.submit` and `assessment.assignments.read`. It does (Plan B sync). **No edit needed** — note this in the closeout deviations.

- [x] **Step 2: Add `routeMeta` entries** — in `navigation/model.ts`, add the two learner-assignment routes (place the `[id]/submit` pattern **before** the bare `/learner/assignments`, matching the `/learner/tests` ordering at `:127-138`):

```ts
{
  pattern: '/learner/assignments/[id]/submit',
  meta: { public: false, requiredPermissions: ['assessment.submissions.submit'] }
},
{
  pattern: '/learner/assignments',
  meta: { public: false, requiredPermissions: ['assessment.assignments.read'] }
},
```

- [x] **Step 3: Add the `navigationModel` entry** — next to the «Мои тесты» entry (`:175`):

```ts
{ href: '/learner/assignments', label: 'Мои задания', requiredPermissions: ['assessment.assignments.read'] },
```

- [x] **Step 4: Lint + commit**

```bash
npx eslint apps/frontend/src/features/navigation/model.ts --max-warnings=0
git add apps/frontend/src/features/navigation/model.ts
git commit -m "feat(frontend): Phase 3 Plan C — learner assignments nav + routes (Task 8)"
```

---

## Task 9: `practical-submissions` feature folder (types/api/hooks/format)

**Files:**

- Create: `apps/frontend/src/features/practical-submissions/{types.ts,api.ts,format.ts,format.test.ts,hooks.ts,api.contract.test.ts}`

- [x] **Step 1: Write `types.ts`:**

```ts
export type SubmissionStatus =
  | 'not_started'
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'reviewed'
  | 'returned'
  | 'rejected';

export interface LearnerAssignmentSummary {
  assignmentId: string;
  title: string;
  courseId: string;
  enrollmentId: string;
  learnerId: string;
  maxScore: number;
  submissionId?: string;
  status: SubmissionStatus;
  returnComment?: string;
}

export interface AssignmentSubmissionDto {
  id: string;
  assignmentId: string;
  enrollmentId: string;
  learnerId: string;
  answerText?: string;
  fileId?: string;
  status: SubmissionStatus;
  submittedAt?: string;
  returnComment?: string;
}

export interface CreateSubmissionPayload {
  assignmentId: string;
  enrollmentId: string;
  learnerId: string;
  answerText?: string;
}

export interface UpdateSubmissionPayload {
  answerText?: string;
  fileId?: string;
}

export interface CreateUploadUrlPayload {
  originalName: string;
  contentType: string;
  sizeBytes: number;
}

export interface UploadIntent {
  fileId: string;
  uploadUrl: string;
  storageKey: string;
  expiresInSeconds: number;
}
```

- [x] **Step 2: Write `api.ts`** (mirror `test-player/api.ts` `withAuth` exactly; the presigned PUT goes direct to MinIO, **not** through `apiRequest`):

```ts
import { apiRequest } from '../../lib/api/client';

import type {
  AssignmentSubmissionDto,
  CreateSubmissionPayload,
  CreateUploadUrlPayload,
  LearnerAssignmentSummary,
  UpdateSubmissionPayload,
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

export const practicalSubmissionsApi = {
  myAssignments: (session: UserSession): Promise<LearnerAssignmentSummary[]> =>
    apiRequest<LearnerAssignmentSummary[]>('/me/assignments', {
      method: 'GET',
      ...withAuth(session)
    }),
  getSubmission: (session: UserSession, id: string): Promise<AssignmentSubmissionDto> =>
    apiRequest<AssignmentSubmissionDto>(`/assignment-submissions/${id}`, {
      method: 'GET',
      ...withAuth(session)
    }),
  createSubmission: (
    session: UserSession,
    payload: CreateSubmissionPayload
  ): Promise<AssignmentSubmissionDto> =>
    apiRequest<AssignmentSubmissionDto>('/assignment-submissions', {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    }),
  updateSubmission: (
    session: UserSession,
    id: string,
    payload: UpdateSubmissionPayload
  ): Promise<AssignmentSubmissionDto> =>
    apiRequest<AssignmentSubmissionDto>(`/assignment-submissions/${id}`, {
      method: 'PATCH',
      body: payload,
      ...withAuth(session)
    }),
  submitSubmission: (session: UserSession, id: string): Promise<AssignmentSubmissionDto> =>
    apiRequest<AssignmentSubmissionDto>(`/assignment-submissions/${id}/submit`, {
      method: 'POST',
      ...withAuth(session)
    }),
  createUploadUrl: (
    session: UserSession,
    id: string,
    payload: CreateUploadUrlPayload
  ): Promise<UploadIntent> =>
    apiRequest<UploadIntent>(`/assignment-submissions/${id}/upload-url`, {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    })
};

/** Direct PUT of the file bytes to the presigned MinIO URL (bypasses the API envelope). */
export async function putFileToPresignedUrl(uploadUrl: string, file: File): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file
  });
  if (!res.ok) {
    throw new Error(`Не удалось загрузить файл (HTTP ${res.status})`);
  }
}
```

- [x] **Step 3: Write `format.ts`:**

```ts
import type { SubmissionStatus } from './types';

export const SUBMISSION_STATUS_LABEL: Record<SubmissionStatus, string> = {
  not_started: 'Не начато',
  draft: 'Черновик',
  submitted: 'Отправлено',
  under_review: 'На проверке',
  reviewed: 'Проверено',
  returned: 'Возвращено на доработку',
  rejected: 'Отклонено'
};

export function formatSubmissionStatus(status: SubmissionStatus): string {
  return SUBMISSION_STATUS_LABEL[status] ?? status;
}

/** A returned submission is editable again; a draft/not_started is editable. */
export function isSubmissionEditable(status: SubmissionStatus): boolean {
  return status === 'not_started' || status === 'draft' || status === 'returned';
}

export function formatMaxScore(maxScore: number): string {
  return `Макс. балл: ${maxScore}`;
}
```

- [x] **Step 4: Write `format.test.ts`:**

```ts
import { describe, expect, it } from 'vitest';

import { formatMaxScore, formatSubmissionStatus, isSubmissionEditable } from './format';

describe('practical-submissions format', () => {
  it('maps RU status labels', () => {
    expect(formatSubmissionStatus('returned')).toBe('Возвращено на доработку');
    expect(formatSubmissionStatus('reviewed')).toBe('Проверено');
  });
  it('treats not_started/draft/returned as editable, others not', () => {
    expect(isSubmissionEditable('returned')).toBe(true);
    expect(isSubmissionEditable('draft')).toBe(true);
    expect(isSubmissionEditable('under_review')).toBe(false);
    expect(isSubmissionEditable('reviewed')).toBe(false);
  });
  it('formats max score', () => {
    expect(formatMaxScore(10)).toBe('Макс. балл: 10');
  });
});
```

- [x] **Step 5: Write `hooks.ts`** (queries via React Query; mutations via the `MutationState`/`initial`/`describe` pattern from `assessment-admin/hooks.ts:120-152`; the file-upload hook orchestrates intent → PUT → attach):

```ts
'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { practicalSubmissionsApi, putFileToPresignedUrl } from './api';
import { ApiClientError } from '../../lib/api/client';
import { useAuth } from '../auth/context';

import type {
  AssignmentSubmissionDto,
  CreateSubmissionPayload,
  UpdateSubmissionPayload
} from './types';

export function useMyAssignments() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['practical-submissions', 'my-assignments'],
    enabled: Boolean(session),
    queryFn: () => practicalSubmissionsApi.myAssignments(session!)
  });
}

export function useSubmission(id: string | null) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['practical-submissions', 'submission', id],
    enabled: Boolean(session) && Boolean(id),
    queryFn: () => practicalSubmissionsApi.getSubmission(session!, id!)
  });
}

interface MutationState<T> {
  isPending: boolean;
  error: string | null;
  data: T | null;
}
function initial<T>(): MutationState<T> {
  return { isPending: false, error: null, data: null };
}
function describe(err: unknown, fallback: string): string {
  return err instanceof ApiClientError
    ? err.message
    : err instanceof Error
      ? err.message
      : fallback;
}

export function useCreateSubmission() {
  const { session } = useAuth();
  const [state, setState] = useState<MutationState<AssignmentSubmissionDto>>(initial());
  const mutate = async (payload: CreateSubmissionPayload) => {
    if (!session) return null;
    setState({ isPending: true, error: null, data: null });
    try {
      const data = await practicalSubmissionsApi.createSubmission(session, payload);
      setState({ isPending: false, error: null, data });
      return data;
    } catch (err) {
      setState({ isPending: false, error: describe(err, 'Не удалось создать сдачу'), data: null });
      return null;
    }
  };
  return { ...state, mutate, reset: () => setState(initial()) };
}

export function useUpdateSubmission() {
  const { session } = useAuth();
  const [state, setState] = useState<MutationState<AssignmentSubmissionDto>>(initial());
  const mutate = async (id: string, payload: UpdateSubmissionPayload) => {
    if (!session) return null;
    setState({ isPending: true, error: null, data: null });
    try {
      const data = await practicalSubmissionsApi.updateSubmission(session, id, payload);
      setState({ isPending: false, error: null, data });
      return data;
    } catch (err) {
      setState({ isPending: false, error: describe(err, 'Не удалось сохранить'), data: null });
      return null;
    }
  };
  return { ...state, mutate, reset: () => setState(initial()) };
}

export function useSubmitSubmission() {
  const { session } = useAuth();
  const [state, setState] = useState<MutationState<AssignmentSubmissionDto>>(initial());
  const mutate = async (id: string) => {
    if (!session) return null;
    setState({ isPending: true, error: null, data: null });
    try {
      const data = await practicalSubmissionsApi.submitSubmission(session, id);
      setState({ isPending: false, error: null, data });
      return data;
    } catch (err) {
      setState({ isPending: false, error: describe(err, 'Не удалось отправить'), data: null });
      return null;
    }
  };
  return { ...state, mutate, reset: () => setState(initial()) };
}

/** Orchestrates: request a presigned URL → PUT the bytes to MinIO → attach fileId to the submission. */
export function useUploadSubmissionFile() {
  const { session } = useAuth();
  const [state, setState] = useState<MutationState<{ fileId: string }>>(initial());
  const mutate = async (submissionId: string, file: File) => {
    if (!session) return null;
    setState({ isPending: true, error: null, data: null });
    try {
      const intent = await practicalSubmissionsApi.createUploadUrl(session, submissionId, {
        originalName: file.name,
        contentType: file.type,
        sizeBytes: file.size
      });
      await putFileToPresignedUrl(intent.uploadUrl, file);
      await practicalSubmissionsApi.updateSubmission(session, submissionId, {
        fileId: intent.fileId
      });
      const data = { fileId: intent.fileId };
      setState({ isPending: false, error: null, data });
      return data;
    } catch (err) {
      setState({ isPending: false, error: describe(err, 'Не удалось загрузить файл'), data: null });
      return null;
    }
  };
  return { ...state, mutate, reset: () => setState(initial()) };
}
```

- [x] **Step 6: Write `api.contract.test.ts`** (stub `fetch` with `vi.stubGlobal`, assert envelope unwrap + URL/method/body — mirror `test-player/api.contract.test.ts`). Cover at least: `myAssignments` → GET `/me/assignments`; `createSubmission` → POST `/assignment-submissions` with body; `createUploadUrl` → POST `/assignment-submissions/:id/upload-url`; and `putFileToPresignedUrl` issues a raw `PUT` to the given URL with the file's `Content-Type` (this one stubs `fetch` directly, not `apiRequest`).

- [x] **Step 7: Run the frontend feature tests**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/features/practical-submissions/format.test.ts src/features/practical-submissions/api.contract.test.ts --no-file-parallelism`
Expected: PASS.

- [x] **Step 8: Lint + commit**

```bash
npx eslint "apps/frontend/src/features/practical-submissions/**/*.ts" --max-warnings=0
git add apps/frontend/src/features/practical-submissions/
git commit -m "feat(frontend): Phase 3 Plan C — practical-submissions feature (types/api/hooks/format) (Task 9)"
```

---

## Task 10: Learner submission screens + routes

**Files:**

- Create: `apps/frontend/src/features/practical-submissions/assignments-list-screen.tsx`
- Create: `apps/frontend/src/features/practical-submissions/submission-screen.tsx`
- Create: `apps/frontend/app/learner/assignments/page.tsx`
- Create: `apps/frontend/app/learner/assignments/[id]/submit/page.tsx`

- [x] **Step 1: Write `assignments-list-screen.tsx`** (mirror `test-player/tests-list-screen.tsx`; uses `@cdoprof/ui` `DataTable` + state-wrappers + `next/link`):

```tsx
'use client';

import { DataTable, LoadingState, StatusChip } from '@cdoprof/ui';
import Link from 'next/link';

import { formatSubmissionStatus } from './format';
import { useMyAssignments } from './hooks';
import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../components/state-wrappers';

import type { LearnerAssignmentSummary } from './types';
import type { Column } from '@cdoprof/ui';

export function AssignmentsListScreen() {
  const assignments = useMyAssignments();

  const columns: Column<LearnerAssignmentSummary>[] = [
    { key: 'title', title: 'Задание', render: (a) => a.title },
    { key: 'status', title: 'Статус', render: (a) => formatSubmissionStatus(a.status) },
    {
      key: 'action',
      title: '',
      render: (a) => (
        <Link href={`/learner/assignments/${a.assignmentId}/submit`}>
          {a.status === 'not_started' ? 'Сдать' : 'Открыть'}
        </Link>
      )
    }
  ];

  return (
    <PageContainer>
      <PageHeader title="Мои задания" subtitle="Практические работы по вашим курсам" />
      {assignments.isLoading ? (
        <LoadingState message="Загрузка заданий…" />
      ) : assignments.error ? (
        <SectionError
          message={
            assignments.error instanceof Error ? assignments.error.message : 'Ошибка загрузки'
          }
          onRetry={() => void assignments.refetch()}
        />
      ) : assignments.data && assignments.data.length > 0 ? (
        <SectionCard title="Доступные задания">
          <DataTable<LearnerAssignmentSummary> columns={columns} rows={assignments.data} />
        </SectionCard>
      ) : (
        <SectionEmpty
          message="Нет доступных заданий"
          hint="Задания появятся после зачисления на курс."
        />
      )}
    </PageContainer>
  );
}
```

(Use `StatusChip` instead of the plain status string if `test-player` uses it — match the sibling. Remove the unused `StatusChip` import if you keep the plain string.)

- [x] **Step 2: Write `submission-screen.tsx`** — the core learner flow. It loads the assignment summary from `useMyAssignments` (find by `assignmentId` from the route), creates a draft submission if none exists, lets the learner edit `answerText`, upload a file, and submit. When `status === 'returned'` it shows `returnComment` and re-enables editing.

```tsx
'use client';

import { useState } from 'react';

import { putFileToPresignedUrl } from './api';
import { formatSubmissionStatus, isSubmissionEditable } from './format';
import {
  useCreateSubmission,
  useMyAssignments,
  useSubmitSubmission,
  useUpdateSubmission,
  useUploadSubmissionFile
} from './hooks';
import {
  FieldError,
  LoadingState,
  PageContainer,
  PageHeader,
  SectionCard,
  SectionError
} from '../../components/state-wrappers';

export function SubmissionScreen({ assignmentId }: { assignmentId: string }) {
  const assignments = useMyAssignments();
  const summary = assignments.data?.find((a) => a.assignmentId === assignmentId);

  const createSubmission = useCreateSubmission();
  const updateSubmission = useUpdateSubmission();
  const submitSubmission = useSubmitSubmission();
  const uploadFile = useUploadSubmissionFile();

  const [answerText, setAnswerText] = useState('');
  const [submissionId, setSubmissionId] = useState<string | null>(null);

  if (assignments.isLoading) return <LoadingState message="Загрузка…" />;
  if (!summary) {
    return (
      <PageContainer>
        <SectionError message="Задание недоступно" onRetry={() => void assignments.refetch()} />
      </PageContainer>
    );
  }

  const activeSubmissionId = submissionId ?? summary.submissionId ?? null;
  const editable = isSubmissionEditable(summary.status);

  const ensureSubmission = async (): Promise<string | null> => {
    if (activeSubmissionId) return activeSubmissionId;
    const created = await createSubmission.mutate({
      assignmentId: summary.assignmentId,
      enrollmentId: summary.enrollmentId,
      learnerId: summary.learnerId,
      answerText
    });
    if (created) setSubmissionId(created.id);
    return created?.id ?? null;
  };

  const onSaveText = async () => {
    const id = await ensureSubmission();
    if (id && activeSubmissionId) await updateSubmission.mutate(id, { answerText });
  };

  const onUpload = async (file: File) => {
    const id = await ensureSubmission();
    if (id) await uploadFile.mutate(id, file);
  };

  const onSubmit = async () => {
    const id = await ensureSubmission();
    if (id) {
      await submitSubmission.mutate(id);
      void assignments.refetch();
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title={summary.title}
        subtitle={`Статус: ${formatSubmissionStatus(summary.status)}`}
      />

      {summary.status === 'returned' && summary.returnComment ? (
        <SectionCard title="Комментарий проверяющего">
          <p>{summary.returnComment}</p>
        </SectionCard>
      ) : null}

      <SectionCard title="Ваш ответ">
        <textarea
          value={answerText}
          disabled={!editable}
          onChange={(e) => setAnswerText(e.target.value)}
          rows={8}
          placeholder="Опишите выполненную работу"
        />
        <button
          type="button"
          disabled={!editable || updateSubmission.isPending}
          onClick={() => void onSaveText()}
        >
          Сохранить черновик
        </button>
        {updateSubmission.error ? <FieldError message={updateSubmission.error} /> : null}
      </SectionCard>

      <SectionCard title="Файл">
        <input
          type="file"
          disabled={!editable || uploadFile.isPending}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onUpload(file);
          }}
        />
        {uploadFile.isPending ? <LoadingState message="Загрузка файла…" /> : null}
        {uploadFile.data ? <p>Файл загружен.</p> : null}
        {uploadFile.error ? <FieldError message={uploadFile.error} /> : null}
      </SectionCard>

      <button
        type="button"
        disabled={!editable || submitSubmission.isPending}
        onClick={() => void onSubmit()}
      >
        Отправить на проверку
      </button>
      {submitSubmission.error ? <FieldError message={submitSubmission.error} /> : null}
    </PageContainer>
  );
}
```

(`putFileToPresignedUrl` is imported only if you inline the upload; here `useUploadSubmissionFile` already calls it, so drop the unused import. Confirm the exact `state-wrappers` exports — `FieldError`, `LoadingState`, etc. — against `apps/frontend/src/components/`; adjust import paths if `LoadingState` comes from `@cdoprof/ui` as in the list screen.)

- [x] **Step 3: Write the route pages** — `app/learner/assignments/page.tsx`:

```tsx
import { AssignmentsListScreen } from '../../../src/features/practical-submissions/assignments-list-screen';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default function LearnerAssignmentsPage() {
  return (
    <ProtectedPage>
      <AssignmentsListScreen />
    </ProtectedPage>
  );
}
```

`app/learner/assignments/[id]/submit/page.tsx`:

```tsx
import { SubmissionScreen } from '../../../../../src/features/practical-submissions/submission-screen';
import { ProtectedPage } from '../../../../../src/widgets/shell/protected-page';

export default function LearnerAssignmentSubmitPage({ params }: { params: { id: string } }) {
  return (
    <ProtectedPage>
      <SubmissionScreen assignmentId={params.id} />
    </ProtectedPage>
  );
}
```

(Confirm the relative depth of the `src/` import against a sibling like `app/learner/tests/[testId]/attempt/[attemptId]/page.tsx`, and whether Next 15 in this repo types `params` as a plain object or a `Promise` — match the existing learner attempt page exactly.)

- [x] **Step 4: Typecheck + lint + commit**

```bash
pnpm --filter @cdoprof/frontend exec tsc --noEmit
npx eslint "apps/frontend/src/features/practical-submissions/**/*.tsx" "apps/frontend/app/learner/assignments/**/*.tsx" --max-warnings=0
git add apps/frontend/src/features/practical-submissions/ apps/frontend/app/learner/assignments/
git commit -m "feat(frontend): Phase 3 Plan C — learner submission screens + routes (Task 10)"
```

---

## Task 11: `reviewer-actions` feature + active queue screen

**Why:** turn Plan A's read-only `/teacher/review` into an active queue — take submissions into review, score/comment/complete/return, and grade essay attempts.

**Files:**

- Create: `apps/frontend/src/features/reviewer-actions/{types.ts,api.ts,format.ts,format.test.ts,hooks.ts,api.contract.test.ts,reviewer-actions-screen.tsx}`
- Modify: `apps/frontend/app/teacher/review/page.tsx`

- [x] **Step 1: Write `types.ts`** (reuse the queue snapshot shape; add review + action payloads):

```ts
export interface ReviewerQueueItem {
  kind: 'attempt' | 'submission';
  id: string;
  tenantId: string;
  learnerId: string;
  testId?: string;
  assignmentId?: string;
  submittedAt: string;
}

export interface ReviewerQueueSnapshot {
  pendingAttempts: ReviewerQueueItem[];
  pendingSubmissions: ReviewerQueueItem[];
}

export interface CreateReviewPayload {
  submissionId: string;
  score?: number;
  comment?: string;
}

export interface CompleteReviewPayload {
  score?: number;
  comment?: string;
}

export interface ReturnSubmissionPayload {
  comment?: string;
}

export interface AttemptAnswerScore {
  questionId: string;
  score: number;
}

export interface CompleteAttemptReviewPayload {
  answerScores: AttemptAnswerScore[];
  reviewComment?: string;
}

export interface AssignmentReviewDto {
  id: string;
  submissionId: string;
  assignmentId: string;
  status: 'pending' | 'in_review' | 'completed';
  score?: number;
  comment?: string;
}
```

- [x] **Step 2: Write `api.ts`** (same `withAuth`; reuses existing review endpoints + the new Plan C endpoints):

```ts
import { apiRequest } from '../../lib/api/client';

import type {
  AssignmentReviewDto,
  CompleteAttemptReviewPayload,
  CompleteReviewPayload,
  CreateReviewPayload,
  ReturnSubmissionPayload,
  ReviewerQueueSnapshot
} from './types';
import type { UserSession } from '../../entities/session/model';

const withAuth = (session: UserSession) => ({
  auth: {
    userId: session.user.id,
    tenantId: session.user.tenantId,
    accessToken: session.tokens.accessToken
  }
});

export const reviewerActionsApi = {
  queue: (session: UserSession): Promise<ReviewerQueueSnapshot> =>
    apiRequest<ReviewerQueueSnapshot>('/reviewer/queue', { method: 'GET', ...withAuth(session) }),
  takeIntoReview: (
    session: UserSession,
    payload: CreateReviewPayload
  ): Promise<AssignmentReviewDto> =>
    apiRequest<AssignmentReviewDto>('/assignment-reviews', {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    }),
  completeReview: (
    session: UserSession,
    reviewId: string,
    payload: CompleteReviewPayload
  ): Promise<AssignmentReviewDto> =>
    apiRequest<AssignmentReviewDto>(`/assignment-reviews/${reviewId}/complete`, {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    }),
  returnSubmission: (
    session: UserSession,
    submissionId: string,
    payload: ReturnSubmissionPayload
  ) =>
    apiRequest(`/assignment-submissions/${submissionId}/return`, {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    }),
  completeAttemptReview: (
    session: UserSession,
    attemptId: string,
    payload: CompleteAttemptReviewPayload
  ) =>
    apiRequest(`/attempts/${attemptId}/complete-review`, {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    }),
  submissionFileUrl: (session: UserSession, submissionId: string): Promise<{ url: string }> =>
    apiRequest<{ url: string }>(`/assignment-submissions/${submissionId}/file-url`, {
      method: 'GET',
      ...withAuth(session)
    })
};
```

- [x] **Step 3: Write `format.ts` + `format.test.ts`** — a `formatReviewStatus` (RU labels for `pending`/`in_review`/`completed`) and a `formatQueueKind` (`attempt` → «Тест (эссе)», `submission` → «Практическая работа»). Test both like Task 9 Step 4.

- [x] **Step 4: Write `hooks.ts`** — `useReviewerQueue` (React Query) + `useTakeIntoReview` / `useCompleteReview` / `useReturnSubmission` / `useCompleteAttemptReview` mutations using the same `MutationState`/`initial`/`describe` pattern as Task 9 Step 5 (each wraps the matching `reviewerActionsApi` call and refetches the queue on success).

- [x] **Step 5: Write `reviewer-actions-screen.tsx`** — model on `assessment-admin/reviewer-queue-screen.tsx` (Task context shows its structure) but add an action column. For **submissions**: a «Взять в проверку» button (→ `takeIntoReview`), then a small score+comment form with «Завершить» (→ `completeReview`) and «Вернуть на доработку» (→ `returnSubmission`), plus a «Скачать файл» link that resolves `submissionFileUrl` on click and `window.open`s it. For **attempts**: a «Оценить эссе» control that collects per-question scores and calls `completeAttemptReview`. Keep the two `SectionCard`s («Попытки тестов» / «Практические работы») from the Plan A screen; render the queue from `useReviewerQueue`. Use `PageContainer`/`PageHeader`/`SectionCard`/`SectionEmpty`/`SectionError`/`LoadingState` + `DataTable` exactly as the Plan A screen does.

- [x] **Step 6: Write `api.contract.test.ts`** — stub `fetch`, assert: `queue` → GET `/reviewer/queue`; `takeIntoReview` → POST `/assignment-reviews` with body; `completeReview` → POST `/assignment-reviews/:id/complete`; `returnSubmission` → POST `/assignment-submissions/:id/return`; `completeAttemptReview` → POST `/attempts/:id/complete-review` with `answerScores`. Mirror `assessment-admin/api.contract.test.ts`.

- [x] **Step 7: Point the route at the active screen** — replace `app/teacher/review/page.tsx`:

```tsx
import { ReviewerActionsScreen } from '../../../src/features/reviewer-actions/reviewer-actions-screen';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default function TeacherReviewQueuePage() {
  return (
    <ProtectedPage>
      <ReviewerActionsScreen />
    </ProtectedPage>
  );
}
```

(Leave Plan A's `assessment-admin/reviewer-queue-screen.tsx` in place — it's no longer routed but its e2e smoke test may still import it; do not delete in this task.)

- [x] **Step 8: Typecheck + lint + run feature tests**

```bash
pnpm --filter @cdoprof/frontend exec tsc --noEmit
pnpm --filter @cdoprof/frontend exec vitest run src/features/reviewer-actions/format.test.ts src/features/reviewer-actions/api.contract.test.ts --no-file-parallelism
npx eslint "apps/frontend/src/features/reviewer-actions/**/*.ts" "apps/frontend/src/features/reviewer-actions/**/*.tsx" apps/frontend/app/teacher/review/page.tsx --max-warnings=0
```

- [x] **Step 9: Commit**

```bash
git add apps/frontend/src/features/reviewer-actions/ apps/frontend/app/teacher/review/page.tsx
git commit -m "feat(frontend): Phase 3 Plan C — reviewer-actions active queue (Task 11)"
```

---

## Task 12: Frontend e2e (routing + nav + module smoke)

**Files:**

- Create: `apps/frontend/src/e2e/phase-3-plan-c-review.e2e.test.ts`

- [x] **Step 1: Write the e2e** — mirror `apps/frontend/src/e2e/learner-test-player.e2e.test.ts` exactly (no React mount; `evaluateRouteAccess` + `getVisibleNavigation` + format-pipeline + dynamic-import smoke):

```ts
import { describe, expect, it } from 'vitest';

import { evaluateRouteAccess } from '../features/navigation/access';
import { getVisibleNavigation } from '../features/navigation/model';
import {
  formatSubmissionStatus,
  isSubmissionEditable
} from '../features/practical-submissions/format';

const learnerPerms = [
  'enrollments.read',
  'assessment.assignments.read',
  'assessment.submissions.submit',
  'assessment.results.read'
];
const reviewerPerms = ['assessment.reviews.review', 'assessment.assignments.read'];

describe('Plan C — learner assignment routing', () => {
  it('grants the learner the assignments routes', () => {
    expect(evaluateRouteAccess('/learner/assignments', learnerPerms).allowed).toBe(true);
    expect(evaluateRouteAccess('/learner/assignments/a1/submit', learnerPerms).allowed).toBe(true);
  });
  it('blocks a user without submissions.submit from the submit route', () => {
    expect(
      evaluateRouteAccess('/learner/assignments/a1/submit', ['enrollments.read']).allowed
    ).toBe(false);
  });
  it('shows «Мои задания» in learner navigation', () => {
    const nav = getVisibleNavigation(learnerPerms);
    expect(nav.some((n) => n.href === '/learner/assignments')).toBe(true);
  });
});

describe('Plan C — reviewer routing', () => {
  it('grants the reviewer the review queue', () => {
    expect(evaluateRouteAccess('/teacher/review', reviewerPerms).allowed).toBe(true);
  });
});

describe('Plan C — format pipeline', () => {
  it('formats submission status + editability', () => {
    expect(formatSubmissionStatus('under_review')).toBe('На проверке');
    expect(isSubmissionEditable('returned')).toBe(true);
  });
});

describe('Plan C — module smoke', () => {
  it('loads AssignmentsListScreen', async () => {
    const mod = await import('../features/practical-submissions/assignments-list-screen');
    expect(typeof mod.AssignmentsListScreen).toBe('function');
  });
  it('loads SubmissionScreen', async () => {
    const mod = await import('../features/practical-submissions/submission-screen');
    expect(typeof mod.SubmissionScreen).toBe('function');
  });
  it('loads ReviewerActionsScreen', async () => {
    const mod = await import('../features/reviewer-actions/reviewer-actions-screen');
    expect(typeof mod.ReviewerActionsScreen).toBe('function');
  });
});
```

(Confirm the exact import paths for `evaluateRouteAccess` / `getVisibleNavigation` against `learner-test-player.e2e.test.ts` — match them precisely; the function names there are authoritative.)

- [x] **Step 2: Run it in isolation**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/e2e/phase-3-plan-c-review.e2e.test.ts --no-file-parallelism`
Expected: PASS (dynamic-import smokes resolve well under timeout when run alone).

- [x] **Step 3: Lint + commit**

```bash
npx eslint apps/frontend/src/e2e/phase-3-plan-c-review.e2e.test.ts --max-warnings=0
git add apps/frontend/src/e2e/phase-3-plan-c-review.e2e.test.ts
git commit -m "test(frontend): Phase 3 Plan C — e2e routing + nav + module smoke (Task 12)"
```

---

## Task 13: Closeout

**Files:**

- Modify: `LMS_AGENT_HANDOFF.md` (append §5.95)
- Modify: `README.md` (§2 AI Agent State sync)
- Modify: this plan (tick all checkboxes)

- [x] **Step 1: Full local quality gate** (Cyrillic fallback per CLAUDE.md):

```bash
pnpm typecheck
pnpm lint
pnpm test:frontend   # run twice if dynamic-import smokes flake under load; confirm Plan C files green in isolation
pnpm --filter @cdoprof/backend exec vitest run src/modules/files/files.service.upload.test.ts src/modules/mvp/mvp.service.test.ts src/modules/mvp/reviewer-queue.plan-c.test.ts src/modules/mvp/plan-c.http.integration.test.ts src/modules/mvp/migrations.0042.test.ts src/modules/mvp/business-flows.e2e.test.ts --no-file-parallelism
```

Expected: typecheck/lint clean; backend Plan C files green; `business-flows.e2e` (§39 canonical) no regression.

- [x] **Step 2: Append `LMS_AGENT_HANDOFF.md` §5.95** — summary (manual review + practical submissions), files changed, test status, deviations (note: learner permission map already had the perms; `/me/assignments` mirrors `/me/tests`; AV scanning deferred to V1.1; presigned-direct upload requires MinIO CORS).

- [x] **Step 3: Sync `README.md` §2** — Current Stage (Phase 3 Plan C done), Last Completed Task, Current/Next Task (next: V1.1 polish or Phase 4), Last Updated At/By. **Also correct the stale lines** that still read "Смерджить Phase 3 Plan B" — Plan B is merged (PR #211); update Current Goal/Task accordingly.

- [x] **Step 4: Tick this plan's checkboxes** (all `- [ ]` → `- [x]`) and cross-link the spec.

- [x] **Step 5: Commit**

```bash
git add LMS_AGENT_HANDOFF.md README.md docs/superpowers/plans/2026-05-31-phase-3-plan-c-manual-review.md
git commit -m "docs(handoff): Phase 3 Plan C complete — §5.95 + README §2 sync + plan checkboxes (Task 13)"
```

---

## Self-review notes (planning)

- **Spec coverage:** §2 file upload → Tasks 1, 5, 9, 10; §3 essay grading → Tasks 2, 11; §4 return cycle → Tasks 3, 11; §5 frontend → Tasks 8–12; queue activation → Tasks 4, 11; discovery (implied by §5 learner list) → Task 6. All spec sections map to a task.
- **Deferred (V1.1, per spec §7):** antivirus scan gate, partial credit, essay-attempt file uploads, extended reject workflow — intentionally out of scope; do not implement.
- **Verify-before-coding flags** embedded in tasks: exact `createAssignment`/`createLearner` link-field names; `listMyTests` learner-resolution helper; whether assignments have a publish step; Next 15 `params` typing; `state-wrappers` exact exports. Each task step says where to confirm.
