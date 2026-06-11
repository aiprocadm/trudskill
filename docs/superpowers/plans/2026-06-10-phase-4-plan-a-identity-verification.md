# Phase 4 · Plan A — Identity Verification (selfie + passport, manual review) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** A learner submits a selfie + passport photo once; an admin manually approves/rejects against stored ФИО/СНИЛС/дата-рождения; an approved verification unlocks identity-gated final exams via a new `assertIdentityVerificationGate` in `MvpService.startAttempt`.

**Architecture:** Mirrors Wave 1 Plan 2 (pre-exam auth, PR #219) in shape: one new MVP collection `identityVerifications` (per-**learner**, not per-enrollment), one new gate in `startAttempt`, per-group-course toggle `requiresIdentityVerification`. File uploads reuse the practical-submissions plumbing (`FilesService.createUploadIntent` → presigned MinIO PUT → antivirus download-gate). New infra: `S3StorageClient.deleteObject` + `FilesService.deleteFile` + a dormant 90-day image-retention cron mirroring `RemindersSchedulerService`.

**Tech Stack:** NestJS (request-scoped in-memory MVP state, JSONB snapshot persistence), TypeScript, Vitest, PostgreSQL numbered SQL migrations, Next.js 15 App Router + React Query frontend.

**Spec:** [docs/superpowers/specs/2026-06-10-phase-4-plan-a-identity-verification-design.md](../specs/2026-06-10-phase-4-plan-a-identity-verification-design.md)

---

## Locked design decisions (read before starting)

1. **Keyed per-learner.** One approved verification covers all the learner's courses. The gate checks `(tenantId, learnerId, verificationStatus === 'approved')`.
2. **Field name `verificationStatus`, NOT `status`.** `BaseEntity.status` is the entity-lifecycle `EntityStatus` (kept `'active'`); the domain state machine `draft → pending → approved|rejected` lives in its own field. (Deviation from the spec's `status` — collision with `BaseEntity`.)
3. **Gate error message must NOT contain the substring "identity verification is required"** — the Wave 1 frontend regex `/pre_exam_auth_required|identity verification is required/i` would otherwise show the wrong interstitial. Use code `identity_verification_required`, message `Identity confirmation by document is required before starting this exam`.
4. **Upload-url DTO = the existing `CreateUploadUrlRequest`** (no new class, no `kind` field). File roles (selfie vs passport) are assigned at submit time via `selfieFileId`/`passportFileId`.
5. **Indefinite validity for pilot.** `validUntil` is in the model but never populated; the gate ignores it.
6. **Retention cron ships dormant** behind `IDENTITY_IMAGE_RETENTION_ENABLED=false` (custom boolean parse like `RECERTIFICATION_SCAN_ENABLED` — NOT `z.coerce.boolean`). Separate scheduler class + separate advisory-lock key (528_492); does not touch the reminders scheduler.
7. **All new Nest providers use explicit `@Inject(...)` on every constructor param** — type-based DI hangs under tsx (README §2 Known Risks, fixed in #236). Never rely on `emitDecoratorMetadata`.
8. **Rejection notice = logged stub** (private `Logger`, mirrors Wave 1). No `MvpService` constructor change (fixed 6 positional args).
9. **No admin UI for the group-course toggle** — set via API DTO, exactly like Wave 1's `requiresPreExamAuth` (parity).
10. **Roles in migration:** learner → `identity.submit`; platform_admin/tenant_admin → all three; methodist → `identity.read` + `identity.review` (actual seeded role codes; the spec's "curator/teacher" maps to methodist).
11. **Testing on this machine (Windows + Cyrillic path):** single files with `--no-file-parallelism`; never the full backend suite locally (CLAUDE.md Gotchas).

---

## File Structure

**Backend:**

- `apps/backend/migrations/0050_learning_identity_verification.sql` — _Create._ Toggle + typed table + permissions.
- `apps/backend/src/modules/mvp/mvp.types.ts` — _Modify._ `IdentityVerification`, `IdentityVerificationView`, `GroupCourse.requiresIdentityVerification?`.
- `apps/backend/src/modules/mvp/infrastructure/in-memory-mvp.state.ts` — _Modify._ `identityVerifications` array.
- `apps/backend/src/modules/mvp/infrastructure/mvp-collections.ts` — _Modify._ `'identityVerifications'` key.
- `apps/backend/src/infrastructure/storage/storage.client.ts` — _Modify._ `deleteObject` on the interface.
- `apps/backend/src/infrastructure/storage/s3-storage.client.ts` — _Modify._ `DeleteObjectCommand` impl.
- `apps/backend/src/modules/files/files.service.ts` — _Modify._ `UploadIntentOptions` (keyPrefix + mimeAllowlist), `deleteFile`.
- `apps/backend/src/modules/files/files.service.upload.test.ts` — _Modify._ Tests for options + delete.
- `apps/backend/src/modules/mvp/mvp.service.ts` — _Modify._ Lifecycle methods + gate + logger.
- `apps/backend/src/modules/mvp/identity-verification.service.test.ts` — _Create._ Service unit tests.
- `apps/backend/src/modules/mvp/identity/identity-image-retention.ts` — _Create._ Pure purge-selection fn.
- `apps/backend/src/modules/mvp/identity/identity-image-retention.test.ts` — _Create._
- `apps/backend/src/modules/mvp/identity/identity-retention-scanner.service.ts` — _Create._ Per-tenant purge.
- `apps/backend/src/modules/mvp/identity/identity-retention-scanner.service.test.ts` — _Create._
- `apps/backend/src/modules/mvp/identity/identity-retention-scheduler.service.ts` — _Create._ Dormant cron.
- `apps/backend/src/env.schema.ts` — _Modify._ Two env vars.
- `apps/backend/src/modules/mvp/mvp.dto.ts` — _Modify._ 3 new DTO classes + group-course flags.
- `apps/backend/src/modules/mvp/mvp.dto-validation.test.ts` — _Modify._
- `apps/backend/src/modules/mvp/mvp.controller.ts` — _Modify._ 7 endpoints.
- `apps/backend/src/modules/mvp/mvp.http.integration.test.ts` — _Modify._ Permission boundary.
- `apps/backend/src/modules/mvp/mvp.module.ts` — _Modify._ Register scanner + scheduler providers.

**Frontend:**

- `apps/frontend/src/features/identity-verification/types.ts` — _Create._
- `apps/frontend/src/features/identity-verification/api.ts` — _Create._
- `apps/frontend/src/features/identity-verification/api.contract.test.ts` — _Create._
- `apps/frontend/src/features/identity-verification/hooks.ts` — _Create._
- `apps/frontend/src/features/identity-verification/format.ts` + `format.test.ts` — _Create._
- `apps/frontend/src/features/identity-verification/screens.tsx` — _Create._ 3 screens.
- `apps/frontend/app/learner/identity/page.tsx` — _Create._
- `apps/frontend/app/admin/identity-verifications/page.tsx` — _Create._
- `apps/frontend/app/admin/identity-verifications/[id]/page.tsx` — _Create._
- `apps/frontend/src/features/navigation/model.ts` — _Modify._ routeMeta + navigationModel.
- `apps/frontend/src/features/test-player/tests-list-screen.tsx` — _Modify._ Identity interstitial.
- `apps/frontend/src/e2e/identity-verification.e2e.test.ts` — _Create._ Routing smoke.

---

## Task 1: Migration 0050 — typed contract + permissions

**Files:**

- Create: `apps/backend/migrations/0050_learning_identity_verification.sql`

- [x] **Step 1: Write the migration**

```sql
-- 0050_learning_identity_verification.sql
-- Phase 4 Plan A — identity verification (selfie + passport, manual review).
--   * learning.group_courses.requires_identity_verification — per-group-course toggle.
--   * learning.identity_verifications — per-LEARNER verification record; the images live in
--     storage.files (selfie_file_id / passport_file_id); decision persists after image purge.
--   * iam permissions identity.submit / identity.read / identity.review + role grants.
-- Additive + idempotent. Runtime MVP state persists as a JSONB snapshot; these typed
-- columns are the schema contract (0016 rule — domain FKs/flags stay typed).

BEGIN;

ALTER TABLE learning.group_courses
  ADD COLUMN IF NOT EXISTS requires_identity_verification boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN learning.group_courses.requires_identity_verification IS
  'Phase 4 Plan A: require documentary identity verification (selfie+passport) before the final exam; MVP JSON store mirrors this field.';

CREATE TABLE IF NOT EXISTS learning.identity_verifications (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  learner_id text NOT NULL,
  method text NOT NULL DEFAULT 'selfie_passport',
  verification_status text NOT NULL DEFAULT 'draft',
  selfie_file_id text,
  passport_file_id text,
  consent_at timestamptz,
  submitted_at timestamptz,
  reviewed_by_actor_id text,
  reviewed_at timestamptz,
  rejection_reason text,
  valid_until timestamptz,
  images_purged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_identity_verifications_tenant_learner
  ON learning.identity_verifications (tenant_id, learner_id, verification_status);

COMMENT ON TABLE learning.identity_verifications IS
  'Phase 4 Plan A: documentary identity verification (selfie+passport, manual review). Decision record persists; image files are purged by the retention cron. MVP JSON store mirrors this collection.';

INSERT INTO iam.permissions (id, code, description)
VALUES
  ('p_identity_submit', 'identity.submit', 'Submit own identity verification (selfie + passport)'),
  ('p_identity_read', 'identity.read', 'Read identity verification queue and records'),
  ('p_identity_review', 'identity.review', 'Approve or reject identity verifications')
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
    OR (r.code = 'learner' AND p.code = 'identity.submit')
    OR (r.code = 'methodist' AND p.code IN ('identity.read', 'identity.review'))
  )
  AND p.code IN ('identity.submit', 'identity.read', 'identity.review')
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;

COMMIT;
```

- [x] **Step 2: Run the migration test suite**

Run: `pnpm test:migrations`
Expected: PASS — `0050` applies after `0049`. If a test enumerates the latest migration number, update it.

- [x] **Step 3: Commit**

```bash
git add apps/backend/migrations/0050_learning_identity_verification.sql
git commit -m "feat(backend): identity verification typed contract — toggle, table, permissions (Phase 4 Plan A)"
```

---

## Task 2: Model + state collection + group-course flag

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.types.ts`
- Modify: `apps/backend/src/modules/mvp/infrastructure/in-memory-mvp.state.ts`
- Modify: `apps/backend/src/modules/mvp/infrastructure/mvp-collections.ts`
- Modify: `apps/backend/src/modules/mvp/mvp.dto.ts` (`CreateGroupCourseRequest`, `UpdateGroupCourseRequest`)
- Modify: `apps/backend/src/modules/mvp/mvp.service.ts` (`createGroupCourse` / `updateGroupCourse`)

- [x] **Step 1: Add `requiresIdentityVerification` to `GroupCourse`** in `mvp.types.ts` (after `requiresPreExamAuth?`, line ~98):

```typescript
  /** Phase 4 Plan A: require documentary identity verification (selfie+passport) before the final exam. */
  requiresIdentityVerification?: boolean;
```

- [x] **Step 2: Add the `IdentityVerification` types** in `mvp.types.ts` after the `PreExamToken` block (line ~348):

```typescript
export type IdentityVerificationStatus = 'draft' | 'pending' | 'approved' | 'rejected';

/**
 * Phase 4 Plan A: documentary identity verification (selfie + passport, manual review).
 * Keyed per-LEARNER — one approved record unlocks all of that learner's identity-gated
 * final exams. `verificationStatus` is the domain state machine (BaseEntity.status stays
 * the lifecycle 'active'). The decision persists after the retention cron purges images.
 */
export interface IdentityVerification extends BaseEntity {
  learnerId: string;
  method: 'selfie_passport';
  verificationStatus: IdentityVerificationStatus;
  selfieFileId?: string;
  passportFileId?: string;
  consentAt?: string;
  submittedAt?: string;
  reviewedByActorId?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  /** Unused in pilot (indefinite validity); kept for a later validity window. */
  validUntil?: string;
  /** Set by the retention cron when selfie/passport objects were deleted. */
  imagesPurgedAt?: string;
}

/** Admin queue view: record + learner display data for manual comparison. */
export interface IdentityVerificationView extends IdentityVerification {
  learnerName: string;
  snils?: string;
  dateOfBirth?: string;
}
```

- [x] **Step 3: Register the collection in `InMemoryMvpState`** (`in-memory-mvp.state.ts`): add `IdentityVerification` to the type import block, and the array field after `preExamTokens`:

```typescript
  // Phase 4 Plan A — documentary identity verification (selfie+passport); per-learner records.
  identityVerifications: IdentityVerification[] = [];
```

- [x] **Step 4: Register the key in `mvp-collections.ts`** — add `'identityVerifications'` right after `'preExamTokens'` in `MVP_COLLECTIONS`.

> ⚠️ Steps 3 and 4 MUST land together — a collection missing from either list is silently lost between HTTP requests (CLAUDE.md).

- [x] **Step 5: Add `requiresIdentityVerification` to the two group-course DTOs** in `mvp.dto.ts`, mirroring `requiresPreExamAuth` exactly (both `CreateGroupCourseRequest` and `UpdateGroupCourseRequest`):

```typescript
  @IsOptional()
  @IsBoolean()
  requiresIdentityVerification?: boolean;
```

- [x] **Step 6: Persist the flag in `MvpService.createGroupCourse` / `updateGroupCourse`** — mirror the existing `requiresPreExamAuth` handling in both methods (conditional spread in the create literal; `if (request.requiresIdentityVerification !== undefined) { ... }` in update — match the file's existing style for `requiresPreExamAuth`, it is directly adjacent).

- [x] **Step 7: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (8/8).

- [x] **Step 8: Commit**

```bash
git add apps/backend/src/modules/mvp/mvp.types.ts apps/backend/src/modules/mvp/infrastructure/in-memory-mvp.state.ts apps/backend/src/modules/mvp/infrastructure/mvp-collections.ts apps/backend/src/modules/mvp/mvp.dto.ts apps/backend/src/modules/mvp/mvp.service.ts
git commit -m "feat(backend): identity verification model + collection + group-course flag (Phase 4 Plan A)"
```

---

## Task 3: Files layer — upload options + object delete

**Files:**

- Modify: `apps/backend/src/infrastructure/storage/storage.client.ts`
- Modify: `apps/backend/src/infrastructure/storage/s3-storage.client.ts`
- Modify: `apps/backend/src/modules/files/files.service.ts`
- Modify: `apps/backend/src/modules/files/files.service.upload.test.ts`

- [x] **Step 1: Write the failing tests** — append to `files.service.upload.test.ts` (reuse its `makeFilesService` helper; extend the `storage` stub with `deleteObject: vi.fn(async () => undefined)`):

```typescript
describe('FilesService.createUploadIntent — options', () => {
  it('uses a custom keyPrefix for the storage key', async () => {
    const { service, queries } = makeFilesService();
    const out = await service.createUploadIntent(
      't1',
      { originalName: 'selfie.jpg', contentType: 'image/jpeg', sizeBytes: 1024 },
      { keyPrefix: 'identity' }
    );
    expect(out.storageKey).toMatch(/^identity\/t1\//);
    const insert = queries.find((q) => q.sql.includes('insert into storage.files'));
    expect(insert?.params[2]).toMatch(/^identity\/t1\//);
  });

  it('enforces a custom mime allowlist', async () => {
    const { service } = makeFilesService();
    await expect(
      service.createUploadIntent(
        't1',
        { originalName: 'doc.docx', contentType: 'application/msword', sizeBytes: 10 },
        { mimeAllowlist: new Set(['image/png', 'image/jpeg', 'application/pdf']) }
      )
    ).rejects.toMatchObject({ response: { code: 'unsupported_media_type' } });
  });
});

describe('FilesService.deleteFile', () => {
  it('deletes the object and soft-deletes the row', async () => {
    const { service, storage, queries, audit } = makeFilesService();
    await service.deleteFile('t1', 'file_x');
    expect(
      (storage as unknown as { deleteObject: ReturnType<typeof vi.fn> }).deleteObject
    ).toHaveBeenCalledWith({ key: 'submissions/t1/existing.pdf' });
    expect(queries.some((q) => q.sql.includes('set deleted_at = now()'))).toBe(true);
    expect((audit as unknown as { write: ReturnType<typeof vi.fn> }).write).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'storage.file_deleted', entityId: 'file_x' })
    );
  });

  it('is idempotent when the row is already gone', async () => {
    const { service, storage } = makeFilesService();
    // makeFilesService returns rows only for selects on storage.files; simulate not-found:
    (service as unknown as { db: { query: ReturnType<typeof vi.fn> } }).db.query = vi.fn(
      async () => []
    );
    await expect(service.deleteFile('t1', 'file_missing')).resolves.toBeUndefined();
    expect(
      (storage as unknown as { deleteObject: ReturnType<typeof vi.fn> }).deleteObject
    ).not.toHaveBeenCalled();
  });
});
```

> Note: if direct reassignment of `db.query` is awkward, instead extend `makeFilesService` with an `emptyDb?: boolean` option that returns `[]` from every select. Keep the assertion intent identical.

- [x] **Step 2: Run to verify failure**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/files/files.service.upload.test.ts --no-file-parallelism`
Expected: FAIL — options param and `deleteFile` do not exist.

- [x] **Step 3: Implement.** In `storage.client.ts`, add to the `StorageClient` interface:

```typescript
  deleteObject(params: { key: string }): Promise<void>;
```

(If other classes `implements StorageClient` exist — `grep -r "implements StorageClient" apps/backend/src` — add a no-op/in-memory `deleteObject` there too.)

In `s3-storage.client.ts`: add `DeleteObjectCommand` to the `@aws-sdk/client-s3` import and the method:

```typescript
  async deleteObject(params: { key: string }): Promise<void> {
    await this.getClient().send(
      new DeleteObjectCommand({
        Bucket: backendEnv.S3_BUCKET,
        Key: params.key
      })
    );
  }
```

In `files.service.ts`: add the options type + thread it through `createUploadIntent`:

```typescript
export interface UploadIntentOptions {
  /** Storage key prefix segment; defaults to 'submissions'. */
  keyPrefix?: string;
  /** MIME allowlist override; defaults to the practical-submissions allowlist. */
  mimeAllowlist?: ReadonlySet<string>;
}
```

```typescript
  async createUploadIntent(
    tenantId: string,
    input: UploadIntentInput,
    options?: UploadIntentOptions
  ): Promise<UploadIntent> {
    const allowlist = options?.mimeAllowlist ?? SUBMISSION_MIME_ALLOWLIST;
    if (!allowlist.has(input.contentType)) {
      // ... existing unsupported_media_type throw unchanged
    }
    // ... existing size check unchanged
    const safeName = input.originalName.replace(/[^\w.\-]+/g, '_').slice(-80);
    const prefix = options?.keyPrefix ?? 'submissions';
    const storageKey = `${prefix}/${tenantId}/${this.uploadId()}_${safeName}`;
    // ... rest unchanged
  }
```

And `deleteFile`:

```typescript
  /**
   * Deletes the stored object and soft-deletes the metadata row. Idempotent —
   * a missing/already-deleted row is a no-op. Used by the identity image retention cron.
   */
  async deleteFile(tenantId: string, fileId: string, actorId?: string): Promise<void> {
    const rows = await this.db.query<{ storage_key: string }>(
      `select storage_key from storage.files
       where tenant_id = $1 and id = $2 and deleted_at is null`,
      [tenantId, fileId]
    );
    if (!rows.length) return;
    await this.storage.deleteObject({ key: rows[0]!.storage_key });
    await this.db.query(
      `update storage.files set deleted_at = now(), updated_at = now()
       where tenant_id = $1 and id = $2`,
      [tenantId, fileId]
    );
    this.audit.write({
      tenantId,
      actorId: actorId ?? 'system',
      action: 'storage.file_deleted',
      entityType: 'storage.file',
      entityId: fileId,
      oldValues: { storageKey: rows[0]!.storage_key },
      newValues: undefined
    });
  }
```

- [x] **Step 4: Run to verify pass**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/files/files.service.upload.test.ts --no-file-parallelism`
Expected: PASS (existing + new tests).

- [x] **Step 5: Typecheck + commit**

Run: `pnpm typecheck` → PASS (8/8).

```bash
git add apps/backend/src/infrastructure/storage apps/backend/src/modules/files
git commit -m "feat(backend): upload-intent options (prefix/allowlist) + object delete (Phase 4 Plan A)"
```

---

## Task 4: Service lifecycle — start / upload-intent / submit / review / list / get / me

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.service.ts`
- Create: `apps/backend/src/modules/mvp/identity-verification.service.test.ts`

- [x] **Step 1: Write the failing service tests.** Create `identity-verification.service.test.ts`. Mirror the harness of `pre-exam-auth.service.test.ts` (same imports, `T`/`ADMIN`/`ctx` constants, 6-arg `MvpService` construction), but with a capturing files mock:

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

function makeFilesMock() {
  return {
    createUploadIntent: vi.fn(async (_t: string, _i: unknown, _o: unknown) => ({
      fileId: `file_${Math.random().toString(36).slice(2, 8)}`,
      uploadUrl: 'https://minio.local/PUT-signed',
      storageKey: 'identity/tenant_demo/x_selfie.jpg',
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

describe('identity verification lifecycle', () => {
  it('starts a draft for the actor-linked learner (no explicit learnerId)', () => {
    const { service } = makeService();
    service.createLearner(
      T,
      ADMIN,
      { code: 'L1', name: 'Ivanov Ivan', linkedIamUserId: 'u_l1' },
      ctx
    );
    const draft = service.startIdentityVerification(T, 'u_l1', {}, { ...ctx, userId: 'u_l1' });
    expect(draft.verificationStatus).toBe('draft');
    expect(draft.method).toBe('selfie_passport');
  });

  it('throws learner_not_linked when the actor has no linked learner', () => {
    const { service } = makeService();
    expect(() => service.startIdentityVerification(T, 'u_nobody', {}, ctx)).toThrowError(
      /learner_not_linked/
    );
  });

  it('is idempotent: a second start returns the existing draft', () => {
    const { service } = makeService();
    service.createLearner(
      T,
      ADMIN,
      { code: 'L1', name: 'Ivanov Ivan', linkedIamUserId: 'u_l1' },
      ctx
    );
    const a = service.startIdentityVerification(T, 'u_l1', {}, ctx);
    const b = service.startIdentityVerification(T, 'u_l1', {}, ctx);
    expect(b.id).toBe(a.id);
  });

  it('issues an upload intent with the identity prefix and image/pdf allowlist for a draft', async () => {
    const { service, files } = makeService();
    service.createLearner(
      T,
      ADMIN,
      { code: 'L1', name: 'Ivanov Ivan', linkedIamUserId: 'u_l1' },
      ctx
    );
    const draft = service.startIdentityVerification(T, 'u_l1', {}, ctx);
    await service.createIdentityVerificationUploadIntent(
      T,
      'u_l1',
      draft.id,
      { originalName: 'selfie.jpg', contentType: 'image/jpeg', sizeBytes: 1000 },
      ctx
    );
    expect(files.createUploadIntent).toHaveBeenCalledWith(
      T,
      expect.objectContaining({ contentType: 'image/jpeg' }),
      expect.objectContaining({ keyPrefix: 'identity' })
    );
    const allowlist = files.createUploadIntent.mock.calls[0]![2].mimeAllowlist as Set<string>;
    expect(allowlist.has('image/jpeg')).toBe(true);
    expect(allowlist.has('application/msword')).toBe(false);
  });

  it('submit moves draft → pending with consent timestamp and both file ids', async () => {
    const { service } = makeService();
    service.createLearner(
      T,
      ADMIN,
      { code: 'L1', name: 'Ivanov Ivan', linkedIamUserId: 'u_l1' },
      ctx
    );
    const draft = service.startIdentityVerification(T, 'u_l1', {}, ctx);
    const out = await service.submitIdentityVerification(
      T,
      'u_l1',
      draft.id,
      { selfieFileId: 'f_selfie', passportFileId: 'f_passport', consent: true },
      ctx
    );
    expect(out.verificationStatus).toBe('pending');
    expect(out.consentAt).toBeTruthy();
    expect(out.submittedAt).toBeTruthy();
    expect(out.selfieFileId).toBe('f_selfie');
  });

  it('submit rejects unknown file ids (tenant scope)', async () => {
    const files = makeFilesMock();
    files.getAntivirusStatuses.mockResolvedValueOnce(new Map([['f_selfie', 'clean']]));
    const { service } = makeService(files);
    service.createLearner(
      T,
      ADMIN,
      { code: 'L1', name: 'Ivanov Ivan', linkedIamUserId: 'u_l1' },
      ctx
    );
    const draft = service.startIdentityVerification(T, 'u_l1', {}, ctx);
    await expect(
      service.submitIdentityVerification(
        T,
        'u_l1',
        draft.id,
        { selfieFileId: 'f_selfie', passportFileId: 'f_ghost', consent: true },
        ctx
      )
    ).rejects.toThrowError(/file_not_found/);
  });

  it('approve moves pending → approved and stamps the reviewer', async () => {
    const { service } = makeService();
    service.createLearner(
      T,
      ADMIN,
      { code: 'L1', name: 'Ivanov Ivan', linkedIamUserId: 'u_l1' },
      ctx
    );
    const draft = service.startIdentityVerification(T, 'u_l1', {}, ctx);
    await service.submitIdentityVerification(
      T,
      'u_l1',
      draft.id,
      { selfieFileId: 'f_s', passportFileId: 'f_p', consent: true },
      ctx
    );
    const out = service.reviewIdentityVerification(
      T,
      ADMIN,
      draft.id,
      { decision: 'approve' },
      ctx
    );
    expect(out.verificationStatus).toBe('approved');
    expect(out.reviewedByActorId).toBe(ADMIN);
    expect(out.reviewedAt).toBeTruthy();
  });

  it('reject stores the reason; a new start after rejection creates a fresh record', async () => {
    const { service } = makeService();
    service.createLearner(
      T,
      ADMIN,
      { code: 'L1', name: 'Ivanov Ivan', linkedIamUserId: 'u_l1' },
      ctx
    );
    const draft = service.startIdentityVerification(T, 'u_l1', {}, ctx);
    await service.submitIdentityVerification(
      T,
      'u_l1',
      draft.id,
      { selfieFileId: 'f_s', passportFileId: 'f_p', consent: true },
      ctx
    );
    const rejected = service.reviewIdentityVerification(
      T,
      ADMIN,
      draft.id,
      { decision: 'reject', rejectionReason: 'Фото нечитаемо' },
      ctx
    );
    expect(rejected.verificationStatus).toBe('rejected');
    expect(rejected.rejectionReason).toBe('Фото нечитаемо');
    const fresh = service.startIdentityVerification(T, 'u_l1', {}, ctx);
    expect(fresh.id).not.toBe(draft.id);
    expect(fresh.verificationStatus).toBe('draft');
  });

  it('review of a non-pending record throws identity_verification_not_pending', () => {
    const { service } = makeService();
    service.createLearner(
      T,
      ADMIN,
      { code: 'L1', name: 'Ivanov Ivan', linkedIamUserId: 'u_l1' },
      ctx
    );
    const draft = service.startIdentityVerification(T, 'u_l1', {}, ctx);
    expect(() =>
      service.reviewIdentityVerification(T, ADMIN, draft.id, { decision: 'approve' }, ctx)
    ).toThrowError(/identity_verification_not_pending/);
  });

  it('start throws identity_already_verified when an approved record exists', async () => {
    const { service } = makeService();
    service.createLearner(
      T,
      ADMIN,
      { code: 'L1', name: 'Ivanov Ivan', linkedIamUserId: 'u_l1' },
      ctx
    );
    const draft = service.startIdentityVerification(T, 'u_l1', {}, ctx);
    await service.submitIdentityVerification(
      T,
      'u_l1',
      draft.id,
      { selfieFileId: 'f_s', passportFileId: 'f_p', consent: true },
      ctx
    );
    service.reviewIdentityVerification(T, ADMIN, draft.id, { decision: 'approve' }, ctx);
    expect(() => service.startIdentityVerification(T, 'u_l1', {}, ctx)).toThrowError(
      /identity_already_verified/
    );
  });

  it('list view enriches learner name + snils; me returns the latest own record', async () => {
    const { service } = makeService();
    const learner = service.createLearnerExtended(
      T,
      ADMIN,
      {
        lastName: 'Иванов',
        firstName: 'Иван',
        middleName: 'Иванович',
        snils: '112-233-445 95',
        linkedIamUserId: 'u_l1'
      } as never,
      ctx
    );
    void learner;
    const draft = service.startIdentityVerification(T, 'u_l1', {}, ctx);
    const list = service.listIdentityVerifications(T, {});
    expect(list[0]!.learnerName).toContain('Иванов');
    expect(list[0]!.snils).toBe('112-233-445 95');
    const mine = service.getMyIdentityVerification(T, 'u_l1');
    expect(mine?.id).toBe(draft.id);
    expect(service.getMyIdentityVerification(T, 'u_unlinked')).toBeNull();
  });
});
```

> **Executor note:** check the actual `createLearnerExtended` request shape in `mvp.service.ts` / `mvp.dto.ts` before running — adjust the seed call (or fall back to `createLearner` + direct state mutation of `snils`) so the test compiles against the real signature. The assertion intent (enriched `learnerName` + `snils`) must stay.

- [x] **Step 2: Run to verify failure**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/identity-verification.service.test.ts --no-file-parallelism`
Expected: FAIL — methods do not exist.

- [x] **Step 3: Implement in `mvp.service.ts`.** Add near `preExamLogger`:

```typescript
  private readonly identityVerificationLogger = new Logger('IdentityVerification');
```

Add a module-level constant near the top of the file (after imports):

```typescript
/** Phase 4 Plan A: identity uploads accept photos/scans only. */
const IDENTITY_MIME_ALLOWLIST: ReadonlySet<string> = new Set([
  'image/png',
  'image/jpeg',
  'application/pdf'
]);
```

Add `IdentityVerification`, `IdentityVerificationView`, `IdentityVerificationStatus` to the `mvp.types.js` type import. Then add a new section after the pre-exam-auth block (after `verifyPreExamToken`, ~line 3260):

```typescript
  // ─── Phase 4 Plan A: documentary identity verification (selfie + passport) ───

  /** Resolve the learner this identity action targets: explicit id (with anti-IDOR check) or the actor's linked learner. */
  private resolveIdentityLearner(
    tenantId: string,
    actorId: string | undefined,
    explicitLearnerId: string | undefined,
    permissions?: string[]
  ): Learner {
    if (explicitLearnerId) {
      const learner = this.getById(this.state.learners, tenantId, explicitLearnerId);
      this.assertActorMatchesLearnerIamLink(tenantId, actorId, learner.id, permissions);
      return learner;
    }
    const linked = this.state.learners.find(
      (l) => l.tenantId === tenantId && l.linkedIamUserId === actorId
    );
    if (!linked) {
      throw new BadRequestException({
        code: 'learner_not_linked',
        message: 'No learner profile is linked to the current user'
      });
    }
    return linked;
  }

  /** Latest approved verification for the learner (indefinite validity in pilot — validUntil ignored). */
  private findApprovedIdentityVerification(
    tenantId: string,
    learnerId: string
  ): IdentityVerification | undefined {
    return this.state.identityVerifications.find(
      (v) =>
        v.tenantId === tenantId &&
        v.learnerId === learnerId &&
        v.verificationStatus === 'approved'
    );
  }

  startIdentityVerification(
    tenantId: string,
    actorId: string | undefined,
    request: { learnerId?: string },
    context: RequestContext
  ): IdentityVerification {
    const learner = this.resolveIdentityLearner(
      tenantId,
      actorId,
      request.learnerId,
      context.permissions
    );
    if (this.findApprovedIdentityVerification(tenantId, learner.id)) {
      throw new ConflictException({
        code: 'identity_already_verified',
        message: 'Identity is already verified for this learner'
      });
    }
    const pending = this.state.identityVerifications.find(
      (v) =>
        v.tenantId === tenantId &&
        v.learnerId === learner.id &&
        v.verificationStatus === 'pending'
    );
    if (pending) {
      throw new ConflictException({
        code: 'identity_verification_pending',
        message: 'A submitted verification is already awaiting review'
      });
    }
    const draft = this.state.identityVerifications.find(
      (v) =>
        v.tenantId === tenantId && v.learnerId === learner.id && v.verificationStatus === 'draft'
    );
    if (draft) return draft;
    const now = this.now();
    const entity: IdentityVerification = {
      id: this.id('idv'),
      tenantId,
      learnerId: learner.id,
      method: 'selfie_passport',
      verificationStatus: 'draft',
      status: 'active',
      createdAt: now,
      updatedAt: now
    };
    this.state.identityVerifications.push(entity);
    this.audit(
      tenantId,
      actorId,
      'learning.identity_verification_started',
      'learning.identity_verification',
      entity.id,
      undefined,
      { id: entity.id, learnerId: entity.learnerId },
      context
    );
    return entity;
  }

  async createIdentityVerificationUploadIntent(
    tenantId: string,
    actorId: string | undefined,
    verificationId: string,
    request: { originalName: string; contentType: string; sizeBytes: number },
    context: RequestContext
  ): Promise<UploadIntent> {
    const record = this.getById(this.state.identityVerifications, tenantId, verificationId);
    this.assertActorMatchesLearnerIamLink(tenantId, actorId, record.learnerId, context.permissions);
    if (record.verificationStatus !== 'draft') {
      throw new PreconditionFailedException({
        code: 'identity_verification_not_editable',
        message: 'Files can only be attached to a draft verification'
      });
    }
    return this.filesService.createUploadIntent(tenantId, request, {
      keyPrefix: 'identity',
      mimeAllowlist: IDENTITY_MIME_ALLOWLIST
    });
  }

  async submitIdentityVerification(
    tenantId: string,
    actorId: string | undefined,
    verificationId: string,
    request: { selfieFileId: string; passportFileId: string; consent: boolean },
    context: RequestContext
  ): Promise<IdentityVerification> {
    const record = this.getById(this.state.identityVerifications, tenantId, verificationId);
    this.assertActorMatchesLearnerIamLink(tenantId, actorId, record.learnerId, context.permissions);
    if (record.verificationStatus !== 'draft') {
      throw new PreconditionFailedException({
        code: 'identity_verification_not_editable',
        message: 'Only a draft verification can be submitted'
      });
    }
    if (request.consent !== true) {
      throw new BadRequestException({
        code: 'consent_required',
        message: 'Consent to personal data processing is required (152-ФЗ)'
      });
    }
    const known = await this.filesService.getAntivirusStatuses(tenantId, [
      request.selfieFileId,
      request.passportFileId
    ]);
    if (!known.has(request.selfieFileId) || !known.has(request.passportFileId)) {
      throw new BadRequestException({
        code: 'file_not_found',
        message: 'Uploaded file not found for tenant'
      });
    }
    const now = this.now();
    record.selfieFileId = request.selfieFileId;
    record.passportFileId = request.passportFileId;
    record.consentAt = now;
    record.submittedAt = now;
    record.verificationStatus = 'pending';
    record.updatedAt = now;
    this.audit(
      tenantId,
      actorId,
      'learning.identity_verification_submitted',
      'learning.identity_verification',
      record.id,
      undefined,
      { id: record.id, learnerId: record.learnerId },
      context
    );
    return record;
  }

  reviewIdentityVerification(
    tenantId: string,
    actorId: string | undefined,
    verificationId: string,
    request: { decision: 'approve' | 'reject'; rejectionReason?: string },
    context: RequestContext
  ): IdentityVerification {
    const record = this.getById(this.state.identityVerifications, tenantId, verificationId);
    if (record.verificationStatus !== 'pending') {
      throw new BadRequestException({
        code: 'identity_verification_not_pending',
        message: 'Only a submitted verification can be reviewed'
      });
    }
    const now = this.now();
    const old = { verificationStatus: record.verificationStatus };
    record.verificationStatus = request.decision === 'approve' ? 'approved' : 'rejected';
    record.reviewedByActorId = actorId;
    record.reviewedAt = now;
    record.updatedAt = now;
    if (request.decision === 'reject' && request.rejectionReason) {
      record.rejectionReason = request.rejectionReason;
    }
    if (request.decision === 'reject') {
      // Logged stub — a real e-mail rides Phase 5 MailerService as a follow-up.
      this.identityVerificationLogger.log(
        `identity_verification.rejected learner=${record.learnerId} verification=${record.id} reason=${request.rejectionReason ?? '-'} (log-only notice)`
      );
    }
    this.audit(
      tenantId,
      actorId,
      request.decision === 'approve'
        ? 'learning.identity_verification_approved'
        : 'learning.identity_verification_rejected',
      'learning.identity_verification',
      record.id,
      old,
      { verificationStatus: record.verificationStatus, rejectionReason: record.rejectionReason },
      context
    );
    return record;
  }

  /** Admin queue: records (optionally by status) enriched with learner display data, newest first. */
  listIdentityVerifications(
    tenantId: string,
    query: { status?: string }
  ): IdentityVerificationView[] {
    const items = this.state.identityVerifications
      .filter(
        (v) =>
          v.tenantId === tenantId && (!query.status || v.verificationStatus === query.status)
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return items.map((v) => this.toIdentityVerificationView(tenantId, v));
  }

  private toIdentityVerificationView(
    tenantId: string,
    record: IdentityVerification
  ): IdentityVerificationView {
    const learner = this.state.learners.find(
      (l) => l.tenantId === tenantId && l.id === record.learnerId
    );
    const learnerName = [learner?.lastName, learner?.firstName, learner?.middleName]
      .filter(Boolean)
      .join(' ');
    return {
      ...record,
      learnerName,
      ...(learner?.snils ? { snils: learner.snils } : {}),
      ...(learner?.dateOfBirth ? { dateOfBirth: learner.dateOfBirth } : {})
    };
  }

  /** Admin detail: view + presigned image URLs (antivirus-gated by FilesService; absent after purge). */
  async getIdentityVerificationView(
    tenantId: string,
    verificationId: string
  ): Promise<IdentityVerificationView & { selfieUrl?: string; passportUrl?: string }> {
    const record = this.getById(this.state.identityVerifications, tenantId, verificationId);
    const view = this.toIdentityVerificationView(tenantId, record);
    const purged = Boolean(record.imagesPurgedAt);
    const selfieUrl =
      !purged && record.selfieFileId
        ? await this.filesService.createDownloadUrl(tenantId, record.selfieFileId)
        : undefined;
    const passportUrl =
      !purged && record.passportFileId
        ? await this.filesService.createDownloadUrl(tenantId, record.passportFileId)
        : undefined;
    return {
      ...view,
      ...(selfieUrl ? { selfieUrl } : {}),
      ...(passportUrl ? { passportUrl } : {})
    };
  }

  /** Learner self-service: own latest record or null (no link → null, not 403 — mirrors listMyAssignments). */
  getMyIdentityVerification(
    tenantId: string,
    actorId: string | undefined
  ): IdentityVerification | null {
    if (!actorId) return null;
    const learnerIds = new Set(
      this.state.learners
        .filter((l) => l.tenantId === tenantId && l.linkedIamUserId === actorId)
        .map((l) => l.id)
    );
    if (learnerIds.size === 0) return null;
    const mine = this.state.identityVerifications
      .filter((v) => v.tenantId === tenantId && learnerIds.has(v.learnerId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return mine[0] ?? null;
  }
```

> Reuse existing imports: `ConflictException`, `BadRequestException`, `PreconditionFailedException`, `Logger` are already imported in `mvp.service.ts`; `UploadIntent` type is already imported for `createSubmissionUploadIntent`. Add `Learner` to the type import only if it is not already there.

- [x] **Step 4: Run to verify pass**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/identity-verification.service.test.ts --no-file-parallelism`
Expected: PASS (11 cases).

- [x] **Step 5: Lint + commit**

Run: `npx eslint apps/backend/src/modules/mvp/mvp.service.ts apps/backend/src/modules/mvp/identity-verification.service.test.ts --max-warnings=0`

```bash
git add apps/backend/src/modules/mvp/mvp.service.ts apps/backend/src/modules/mvp/identity-verification.service.test.ts
git commit -m "feat(backend): identity verification lifecycle — start/upload/submit/review/list (Phase 4 Plan A)"
```

---

## Task 5: The exam gate — `assertIdentityVerificationGate`

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.service.ts`
- Modify: `apps/backend/src/modules/mvp/identity-verification.service.test.ts`

- [x] **Step 1: Write the failing gate tests.** Append to `identity-verification.service.test.ts` a copy of the `seedFinalExam` helper from `pre-exam-auth.service.test.ts`, parameterized with `requiresIdentityVerification`:

```typescript
/** course → group → groupCourse(requiresIdentityVerification) → learner → enrollment → bank → final test. */
function seedFinalExam(service: MvpService, requiresIdentityVerification: boolean) {
  const course = service.createCourse(T, ADMIN, { code: 'C1', title: 'Course' }, ctx);
  const group = service.createGroup(T, ADMIN, { code: 'G1', name: 'Group' }, ctx);
  service.createGroupCourse(T, {
    groupId: group.id,
    courseId: course.id,
    requiresIdentityVerification
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
  return { course, group, learner, enrollment, test };
}

const startArgs = (test: { id: string }, enrollment: { id: string; learnerId: string }) => ({
  testId: test.id,
  enrollmentId: enrollment.id,
  learnerId: enrollment.learnerId
});

describe('identity verification gate', () => {
  it('does NOT gate when the group-course does not require identity verification', () => {
    const { service } = makeService();
    const { test, enrollment } = seedFinalExam(service, false);
    expect(() => service.startAttempt(T, ADMIN, startArgs(test, enrollment), ctx)).not.toThrow();
  });

  it('blocks the final exam with identity_verification_required until approved', () => {
    const { service } = makeService();
    const { test, enrollment } = seedFinalExam(service, true);
    expect(() => service.startAttempt(T, ADMIN, startArgs(test, enrollment), ctx)).toThrowError(
      /identity_verification_required/
    );
  });

  it('gate message must not collide with the Wave 1 frontend regex', () => {
    const { service } = makeService();
    const { test, enrollment } = seedFinalExam(service, true);
    try {
      service.startAttempt(T, ADMIN, startArgs(test, enrollment), ctx);
      expect.unreachable('gate must throw');
    } catch (err) {
      const message = (err as { response?: { message?: string } }).response?.message ?? '';
      expect(/identity verification is required/i.test(message)).toBe(false);
    }
  });

  it('allows the exam after an approved verification (per-learner, any enrollment)', async () => {
    const { service } = makeService();
    const { test, enrollment } = seedFinalExam(service, true);
    const draft = service.startIdentityVerification(T, 'u_l1', {}, ctx);
    await service.submitIdentityVerification(
      T,
      'u_l1',
      draft.id,
      { selfieFileId: 'f_s', passportFileId: 'f_p', consent: true },
      ctx
    );
    service.reviewIdentityVerification(T, ADMIN, draft.id, { decision: 'approve' }, ctx);
    expect(() => service.startAttempt(T, ADMIN, startArgs(test, enrollment), ctx)).not.toThrow();
  });

  it('a rejected verification does not unlock the gate', async () => {
    const { service } = makeService();
    const { test, enrollment } = seedFinalExam(service, true);
    const draft = service.startIdentityVerification(T, 'u_l1', {}, ctx);
    await service.submitIdentityVerification(
      T,
      'u_l1',
      draft.id,
      { selfieFileId: 'f_s', passportFileId: 'f_p', consent: true },
      ctx
    );
    service.reviewIdentityVerification(T, ADMIN, draft.id, { decision: 'reject' }, ctx);
    expect(() => service.startAttempt(T, ADMIN, startArgs(test, enrollment), ctx)).toThrowError(
      /identity_verification_required/
    );
  });
});
```

- [x] **Step 2: Run to verify failure** (same vitest command as Task 4). Expected: new gate tests FAIL (no gate yet → attempts start).

- [x] **Step 3: Implement.** In `mvp.service.ts`, add after `findApprovedIdentityVerification`:

```typescript
  /** Phase 4 Plan A: the group-course toggle for documentary identity verification. */
  private groupCourseRequiresIdentityVerification(
    tenantId: string,
    groupId: string,
    courseId: string
  ): boolean {
    const gc = this.state.groupCourses.find(
      (item) => item.tenantId === tenantId && item.groupId === groupId && item.courseId === courseId
    );
    return gc?.requiresIdentityVerification === true;
  }

  /**
   * Phase 4 Plan A gate. Final/course-level exams only (no moduleId), only when the
   * group-course requires it. Orthogonal to assertPreExamAuthGate (№816 e-mail link):
   * this gate proves identity by document, per-LEARNER, valid indefinitely in pilot.
   * NB: the message deliberately avoids the substring "identity verification is required"
   * (the Wave 1 frontend regex matches it for its own interstitial).
   */
  private assertIdentityVerificationGate(
    tenantId: string,
    enrollment: Enrollment,
    test: TestEntity
  ): void {
    if (test.moduleId) return;
    if (!this.groupCourseRequiresIdentityVerification(tenantId, enrollment.groupId, test.courseId))
      return;
    if (this.findApprovedIdentityVerification(tenantId, enrollment.learnerId)) return;
    throw new PreconditionFailedException({
      code: 'identity_verification_required',
      message: 'Identity confirmation by document is required before starting this exam'
    });
  }
```

Wire into `startAttempt` (line ~2914), directly after the Wave 1 gates:

```typescript
this.assertModuleSequenceGate(tenantId, enrollment.id, test);
this.assertMinViewGate(tenantId, enrollment.id, test);
this.assertPreExamAuthGate(tenantId, enrollment, test);
// Phase 4 Plan A: documentary identity (selfie+passport) — per-learner.
this.assertIdentityVerificationGate(tenantId, enrollment, test);
```

- [x] **Step 4: Run target + regression**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/identity-verification.service.test.ts --no-file-parallelism` → PASS (16 total).
Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/pre-exam-auth.service.test.ts src/modules/mvp/module-gating.service.test.ts src/modules/mvp/test-player.service.test.ts src/modules/mvp/business-flows.e2e.test.ts --no-file-parallelism` → PASS (no regression).

- [x] **Step 5: Commit**

```bash
git add apps/backend/src/modules/mvp/mvp.service.ts apps/backend/src/modules/mvp/identity-verification.service.test.ts
git commit -m "feat(backend): identity verification gate in startAttempt (Phase 4 Plan A)"
```

---

## Task 6: DTOs + validation tests

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.dto.ts`
- Modify: `apps/backend/src/modules/mvp/mvp.dto-validation.test.ts`

- [x] **Step 1: Write the failing DTO tests** (mirror the file's existing `plainToInstance` + `validateSync` style):

```typescript
import {
  CreateIdentityVerificationRequest,
  ReviewIdentityVerificationRequest,
  SubmitIdentityVerificationRequest
} from './mvp.dto.js';

describe('Identity verification DTOs (Phase 4 Plan A)', () => {
  it('CreateIdentityVerificationRequest accepts an empty body (actor-linked learner)', () => {
    const dto = plainToInstance(CreateIdentityVerificationRequest, {});
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('CreateIdentityVerificationRequest rejects an empty learnerId string', () => {
    const dto = plainToInstance(CreateIdentityVerificationRequest, { learnerId: '' });
    expect(validateSync(dto).length).toBeGreaterThan(0);
  });

  it('SubmitIdentityVerificationRequest requires both file ids and consent === true', () => {
    const ok = plainToInstance(SubmitIdentityVerificationRequest, {
      selfieFileId: 'f1',
      passportFileId: 'f2',
      consent: true
    });
    expect(validateSync(ok)).toHaveLength(0);
    const noConsent = plainToInstance(SubmitIdentityVerificationRequest, {
      selfieFileId: 'f1',
      passportFileId: 'f2',
      consent: false
    });
    expect(validateSync(noConsent).length).toBeGreaterThan(0);
    const missingFile = plainToInstance(SubmitIdentityVerificationRequest, {
      selfieFileId: 'f1',
      consent: true
    });
    expect(validateSync(missingFile).length).toBeGreaterThan(0);
  });

  it('ReviewIdentityVerificationRequest accepts approve/reject and rejects other decisions', () => {
    const ok = plainToInstance(ReviewIdentityVerificationRequest, {
      decision: 'reject',
      rejectionReason: 'blurry'
    });
    expect(validateSync(ok)).toHaveLength(0);
    const bad = plainToInstance(ReviewIdentityVerificationRequest, { decision: 'maybe' });
    expect(validateSync(bad).length).toBeGreaterThan(0);
  });

  it('CreateGroupCourseRequest accepts requiresIdentityVerification', () => {
    const dto = plainToInstance(CreateGroupCourseRequest, {
      groupId: 'g1',
      courseId: 'c1',
      requiresIdentityVerification: true
    });
    expect(validateSync(dto)).toHaveLength(0);
    expect(dto.requiresIdentityVerification).toBe(true);
  });
});
```

- [x] **Step 2: Run to verify failure**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/mvp.dto-validation.test.ts --no-file-parallelism` → FAIL (classes missing).

- [x] **Step 3: Add the DTOs** to `mvp.dto.ts` (near `CreateUploadUrlRequest`); ensure `Equals` and `IsIn` are in the `class-validator` import:

```typescript
/** Phase 4 Plan A: start (or resume the draft of) a documentary identity verification. */
export class CreateIdentityVerificationRequest {
  /** Optional explicit learner (admin/act-as); defaults to the actor-linked learner. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  learnerId?: string;
}

/** Phase 4 Plan A: attach the uploaded files + 152-ФЗ consent; moves draft → pending. */
export class SubmitIdentityVerificationRequest {
  @IsString()
  @MinLength(1)
  selfieFileId!: string;

  @IsString()
  @MinLength(1)
  passportFileId!: string;

  @Equals(true)
  consent!: boolean;
}

/** Phase 4 Plan A: manual review decision. */
export class ReviewIdentityVerificationRequest {
  @IsIn(['approve', 'reject'])
  decision!: 'approve' | 'reject';

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}
```

- [x] **Step 4: Run to verify pass** (same command) → PASS.

- [x] **Step 5: Commit**

```bash
git add apps/backend/src/modules/mvp/mvp.dto.ts apps/backend/src/modules/mvp/mvp.dto-validation.test.ts
git commit -m "feat(backend): identity verification DTOs (Phase 4 Plan A)"
```

---

## Task 7: Controller endpoints + HTTP permission boundary

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.controller.ts`
- Modify: `apps/backend/src/modules/mvp/mvp.http.integration.test.ts`

- [x] **Step 1: Add the endpoints** in `mvp.controller.ts` (import the 3 new DTOs; place the block after the pre-exam-token endpoints, ~line 900). **Route order matters: `identity-verifications/me` MUST be declared before `identity-verifications/:id`.**

```typescript
  // ─── Phase 4 Plan A: documentary identity verification ───

  @Post('identity-verifications')
  @UseGuards(PermissionGuard)
  @RequirePermissions('identity.submit')
  startIdentityVerification(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const b = assertValidDto(CreateIdentityVerificationRequest, raw);
    return this.mvpService.startIdentityVerification(c.tenantId!, c.userId, b, c);
  }

  @Post('identity-verifications/:id/upload-url')
  @UseGuards(PermissionGuard)
  @RequirePermissions('identity.submit')
  createIdentityUploadUrl(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() raw: unknown
  ) {
    const b = assertValidDto(CreateUploadUrlRequest, raw);
    return this.mvpService.createIdentityVerificationUploadIntent(c.tenantId!, c.userId, id, b, c);
  }

  @Post('identity-verifications/:id/submit')
  @UseGuards(PermissionGuard)
  @RequirePermissions('identity.submit')
  submitIdentityVerification(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() raw: unknown
  ) {
    const b = assertValidDto(SubmitIdentityVerificationRequest, raw);
    return this.mvpService.submitIdentityVerification(c.tenantId!, c.userId, id, b, c);
  }

  @Get('identity-verifications/me')
  @UseGuards(PermissionGuard)
  @RequirePermissions('identity.submit')
  getMyIdentityVerification(@CurrentContext() c: RequestContext) {
    return this.mvpService.getMyIdentityVerification(c.tenantId!, c.userId);
  }

  @Get('identity-verifications')
  @UseGuards(PermissionGuard)
  @RequirePermissions('identity.read')
  listIdentityVerifications(@CurrentContext() c: RequestContext, @Query('status') status?: string) {
    return this.mvpService.listIdentityVerifications(c.tenantId!, status ? { status } : {});
  }

  @Get('identity-verifications/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('identity.read')
  getIdentityVerification(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.mvpService.getIdentityVerificationView(c.tenantId!, id);
  }

  @Post('identity-verifications/:id/review')
  @UseGuards(PermissionGuard)
  @RequirePermissions('identity.review')
  reviewIdentityVerification(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() raw: unknown
  ) {
    const b = assertValidDto(ReviewIdentityVerificationRequest, raw);
    return this.mvpService.reviewIdentityVerification(c.tenantId!, c.userId, id, b, c);
  }
```

- [x] **Step 2: Extend the stub controller + add the boundary describe-block** in `mvp.http.integration.test.ts`. In the `TestMvpController` (after the recertification stubs, ~line 385), add:

```typescript
      // Phase 4 Plan A — identity verification permission boundary
      @Get('identity-verifications')
      @RequirePermissions('identity.read')
      listIdentityVerifications(@CurrentContext() context: { tenantId?: string }) {
        return { items: [], tenantId: context.tenantId };
      }

      @Post('identity-verifications')
      @RequirePermissions('identity.submit')
      startIdentityVerification(@CurrentContext() context: { tenantId?: string }) {
        return { id: 'idv_1', verificationStatus: 'draft', tenantId: context.tenantId };
      }

      @Post('identity-verifications/:id/review')
      @RequirePermissions('identity.review')
      reviewIdentityVerification(
        @CurrentContext() context: { tenantId?: string },
        @Body() body: { decision: string }
      ) {
        return { id: 'idv_1', verificationStatus: body.decision === 'approve' ? 'approved' : 'rejected' };
      }
```

Then append a describe-block mirroring the recertification boundary block exactly (same `issueSignedAccessToken` + `iamServiceMock.resolvePermissions` harness):

- `GET /identity-verifications` → 403 `permission_denied` without `identity.read`; 200 with it (assert envelope `data.tenantId === 'tenant_demo'`).
- `POST /identity-verifications` → 403 without `identity.submit`; 201 with it.
- `POST /identity-verifications/x/review` → 403 with only `identity.read`; 201 with `identity.review`.

- [x] **Step 3: Run the boundary test (isolated)**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/mvp.http.integration.test.ts --no-file-parallelism`
Expected: PASS. (If this file crashes on the Cyrillic path, note it and rely on CI.)

- [x] **Step 4: Typecheck + lint + commit**

Run: `pnpm typecheck` → 8/8. `npx eslint apps/backend/src/modules/mvp/mvp.controller.ts --max-warnings=0` → clean.

```bash
git add apps/backend/src/modules/mvp/mvp.controller.ts apps/backend/src/modules/mvp/mvp.http.integration.test.ts
git commit -m "feat(backend): identity verification endpoints + RBAC boundary (Phase 4 Plan A)"
```

---

## Task 8: Image retention — env, pure selection, scanner, dormant cron

**Files:**

- Modify: `apps/backend/src/env.schema.ts`
- Create: `apps/backend/src/modules/mvp/identity/identity-image-retention.ts`
- Create: `apps/backend/src/modules/mvp/identity/identity-image-retention.test.ts`
- Create: `apps/backend/src/modules/mvp/identity/identity-retention-scanner.service.ts`
- Create: `apps/backend/src/modules/mvp/identity/identity-retention-scanner.service.test.ts`
- Create: `apps/backend/src/modules/mvp/identity/identity-retention-scheduler.service.ts`
- Modify: `apps/backend/src/modules/mvp/mvp.module.ts`

- [x] **Step 1: Env vars.** In `env.schema.ts`, next to `RECERTIFICATION_SCAN_ENABLED` (line ~53), add with the same custom boolean parse (NOT `z.coerce.boolean` — it maps `"false"` → `true`):

```typescript
    // Identity image retention purge (Phase 4 Plan A). Ships dormant; ops enables after
    // confirming the 90-day policy. Custom boolean parse — NOT z.coerce.boolean.
    IDENTITY_IMAGE_RETENTION_ENABLED: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((v) => v === true || v === 'true')
      .default(false),
    /** Cron for the nightly identity-image purge (UTC). */
    IDENTITY_RETENTION_CRON_SCHEDULE: z.string().default('0 4 * * *'),
```

- [x] **Step 2: Write the failing pure-function test** (`identity-image-retention.test.ts`):

```typescript
import { describe, expect, it } from 'vitest';

import { selectIdentityImagesToPurge } from './identity-image-retention.js';

const base = {
  verificationStatus: 'approved' as const,
  reviewedAt: '2026-01-01T10:00:00.000Z',
  selfieFileId: 'f_s',
  passportFileId: 'f_p'
};

describe('selectIdentityImagesToPurge', () => {
  it('selects decided records older than the retention window', () => {
    const due = selectIdentityImagesToPurge('2026-04-02', [{ id: 'a', ...base }], 90);
    expect(due.map((r) => r.id)).toEqual(['a']);
  });

  it('keeps records inside the window', () => {
    expect(selectIdentityImagesToPurge('2026-03-01', [{ id: 'a', ...base }], 90)).toEqual([]);
  });

  it('skips drafts/pending, already-purged, and image-less records', () => {
    const records = [
      { id: 'draft', ...base, verificationStatus: 'draft' as const },
      { id: 'pending', ...base, verificationStatus: 'pending' as const },
      { id: 'purged', ...base, imagesPurgedAt: '2026-02-01T00:00:00.000Z' },
      { id: 'noimages', ...base, selfieFileId: undefined, passportFileId: undefined },
      { id: 'norewiew', ...base, reviewedAt: undefined }
    ];
    expect(selectIdentityImagesToPurge('2027-01-01', records, 90)).toEqual([]);
  });

  it('selects rejected records too (purge regardless of decision)', () => {
    const due = selectIdentityImagesToPurge('2027-01-01', [
      { id: 'r', ...base, verificationStatus: 'rejected' as const }
    ]);
    expect(due).toHaveLength(1);
  });
});
```

- [x] **Step 3: Run → FAIL, then implement** `identity-image-retention.ts`:

```typescript
import { addDays } from '../../../common/utils/date-math.util.js';

/** 152-ФЗ data minimization: images are deleted N days after the review decision. */
export const IDENTITY_IMAGE_RETENTION_DAYS = 90;

export interface IdentityRetentionCandidate {
  id: string;
  verificationStatus: 'draft' | 'pending' | 'approved' | 'rejected';
  reviewedAt?: string | undefined;
  imagesPurgedAt?: string | undefined;
  selfieFileId?: string | undefined;
  passportFileId?: string | undefined;
}

/**
 * Pure selection: decided (approved|rejected) records whose review is older than the
 * retention window, still holding image file ids. Mirrors scanForRecertification's shape.
 * `asOf` is an ISO date (YYYY-MM-DD).
 */
export function selectIdentityImagesToPurge<T extends IdentityRetentionCandidate>(
  asOf: string,
  records: T[],
  retentionDays: number = IDENTITY_IMAGE_RETENTION_DAYS
): T[] {
  return records.filter((r) => {
    if (r.verificationStatus !== 'approved' && r.verificationStatus !== 'rejected') return false;
    if (!r.reviewedAt || r.imagesPurgedAt) return false;
    if (!r.selfieFileId && !r.passportFileId) return false;
    return addDays(r.reviewedAt.slice(0, 10), retentionDays) <= asOf;
  });
}
```

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/identity/identity-image-retention.test.ts --no-file-parallelism` → PASS.

- [x] **Step 4: Write the failing scanner test** (`identity-retention-scanner.service.test.ts`):

```typescript
import { describe, expect, it, vi } from 'vitest';

import { IdentityRetentionScanner } from './identity-retention-scanner.service.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';

import type { FilesService } from '../../files/files.service.js';
import type { AuditService } from '../../audit/audit.service.js';

function makeScanner() {
  const deleteFile = vi.fn(async () => undefined);
  const auditWrite = vi.fn();
  const scanner = new IdentityRetentionScanner(
    { deleteFile } as unknown as FilesService,
    { write: auditWrite } as unknown as AuditService
  );
  return { scanner, deleteFile, auditWrite };
}

function seedState(reviewedAt: string) {
  const state = new InMemoryMvpState();
  state.identityVerifications.push({
    id: 'idv_1',
    tenantId: 't1',
    learnerId: 'l1',
    method: 'selfie_passport',
    verificationStatus: 'approved',
    selfieFileId: 'f_s',
    passportFileId: 'f_p',
    reviewedAt,
    status: 'active',
    createdAt: reviewedAt,
    updatedAt: reviewedAt
  });
  return state;
}

describe('IdentityRetentionScanner', () => {
  it('purges both images, stamps imagesPurgedAt, audits', async () => {
    const { scanner, deleteFile, auditWrite } = makeScanner();
    const state = seedState('2026-01-01T00:00:00.000Z');
    const purged = await scanner.scanTenant('t1', '2026-06-01', state);
    expect(purged).toBe(1);
    expect(deleteFile).toHaveBeenCalledWith('t1', 'f_s');
    expect(deleteFile).toHaveBeenCalledWith('t1', 'f_p');
    expect(state.identityVerifications[0]!.imagesPurgedAt).toBeTruthy();
    expect(auditWrite).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'learning.identity_verification_images_purged' })
    );
  });

  it('does nothing inside the retention window and never double-purges', async () => {
    const { scanner, deleteFile } = makeScanner();
    const state = seedState(new Date().toISOString());
    expect(await scanner.scanTenant('t1', new Date().toISOString().slice(0, 10), state)).toBe(0);
    expect(deleteFile).not.toHaveBeenCalled();
  });

  it('one failing record does not abort the batch', async () => {
    const { scanner, deleteFile } = makeScanner();
    deleteFile.mockRejectedValueOnce(new Error('s3 down'));
    const state = seedState('2026-01-01T00:00:00.000Z');
    state.identityVerifications.push({
      ...state.identityVerifications[0]!,
      id: 'idv_2',
      selfieFileId: 'f_s2',
      passportFileId: 'f_p2'
    });
    const purged = await scanner.scanTenant('t1', '2026-06-01', state);
    expect(purged).toBe(1); // first failed, second succeeded
    expect(state.identityVerifications[0]!.imagesPurgedAt).toBeUndefined();
    expect(state.identityVerifications[1]!.imagesPurgedAt).toBeTruthy();
  });
});
```

- [x] **Step 5: Run → FAIL, then implement** `identity-retention-scanner.service.ts` (explicit `@Inject` — tsx DI rule):

```typescript
import { Inject, Injectable, Logger } from '@nestjs/common';

import { selectIdentityImagesToPurge } from './identity-image-retention.js';
import { AuditService } from '../../audit/audit.service.js';
import { FilesService } from '../../files/files.service.js';

import type { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';

/**
 * Phase 4 Plan A: per-tenant purge of selfie/passport images 90 days after the review
 * decision (152-ФЗ minimization). The decision record persists — only files are removed.
 * Invoked by IdentityRetentionSchedulerService via MvpTenantRunner (state is loaded and
 * persisted by the runner around this call).
 */
@Injectable()
export class IdentityRetentionScanner {
  private readonly logger = new Logger(IdentityRetentionScanner.name);

  constructor(
    @Inject(FilesService) private readonly filesService: FilesService,
    @Inject(AuditService) private readonly auditService: AuditService
  ) {}

  /** Returns the number of records whose images were purged. */
  async scanTenant(tenantId: string, asOf: string, state: InMemoryMvpState): Promise<number> {
    const due = selectIdentityImagesToPurge(asOf, state.identityVerifications);
    let purged = 0;
    for (const record of due) {
      try {
        if (record.selfieFileId) await this.filesService.deleteFile(tenantId, record.selfieFileId);
        if (record.passportFileId)
          await this.filesService.deleteFile(tenantId, record.passportFileId);
        const now = new Date().toISOString();
        record.imagesPurgedAt = now;
        record.updatedAt = now;
        purged += 1;
        this.auditService.write({
          tenantId,
          actorId: 'system',
          action: 'learning.identity_verification_images_purged',
          entityType: 'learning.identity_verification',
          entityId: record.id,
          oldValues: { selfieFileId: record.selfieFileId, passportFileId: record.passportFileId },
          newValues: { imagesPurgedAt: now }
        });
      } catch (err) {
        this.logger.error(
          `Identity image purge failed tenant=${tenantId} verification=${record.id}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
    return purged;
  }
}
```

> Type note: `selectIdentityImagesToPurge` is generic (`<T extends IdentityRetentionCandidate>`), so `due` items are the actual `IdentityVerification` objects from state — mutating them is intentional.

Run the scanner test → PASS.

- [x] **Step 6: The dormant scheduler** (`identity-retention-scheduler.service.ts`) — mirrors `RemindersSchedulerService` with its own lock key:

```typescript
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { IdentityRetentionScanner } from './identity-retention-scanner.service.js';
import { backendEnv } from '../../../env.js';
import { DatabaseService } from '../../../infrastructure/database/database.service.js';
import { TenantService } from '../../tenant/tenant.service.js';
import { MvpTenantRunner } from '../infrastructure/mvp-tenant-runner.service.js';

/** Stable advisory-lock key for the identity image purge (distinct from reminders 528_491). */
const IDENTITY_RETENTION_LOCK_KEY = 528_492;

@Injectable()
export class IdentityRetentionSchedulerService {
  private readonly logger = new Logger(IdentityRetentionSchedulerService.name);

  constructor(
    @Inject(TenantService) private readonly tenants: TenantService,
    @Inject(MvpTenantRunner) private readonly mvpRunner: MvpTenantRunner,
    @Inject(IdentityRetentionScanner) private readonly scanner: IdentityRetentionScanner,
    @Inject(DatabaseService) private readonly db: DatabaseService
  ) {}

  @Cron(backendEnv.IDENTITY_RETENTION_CRON_SCHEDULE, {
    name: 'identity-image-retention',
    timeZone: 'UTC'
  })
  async handleDailyPurge(): Promise<void> {
    if (!backendEnv.IDENTITY_IMAGE_RETENTION_ENABLED) {
      return;
    }
    const asOf = new Date().toISOString().slice(0, 10);
    this.logger.log(`Starting identity image retention purge asOf=${asOf}`);
    try {
      await this.runPurgeAllTenants(asOf);
    } catch (err) {
      this.logger.error(
        `Identity retention purge failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /** Advisory lock (one instance wins) → per-tenant purge; one tenant's failure never aborts the batch. */
  async runPurgeAllTenants(asOf: string): Promise<void> {
    await this.db.withTransaction(async (client) => {
      const lockRows = await this.db.query<{ locked: boolean }>(
        'select pg_try_advisory_xact_lock($1) as locked',
        [IDENTITY_RETENTION_LOCK_KEY],
        client
      );
      if (!lockRows[0]?.locked) {
        this.logger.log('Another instance holds the identity retention lock; skipping.');
        return;
      }
      const tenantIds = await this.tenants.listActiveTenantIds();
      for (const tenantId of tenantIds) {
        try {
          await this.mvpRunner.runWithTenantState(tenantId, async (state) => {
            const purged = await this.scanner.scanTenant(tenantId, asOf, state);
            if (purged > 0) this.logger.log(`tenant=${tenantId} purged=${purged}`);
          });
        } catch (err) {
          this.logger.error(
            `Identity retention failed for tenant ${tenantId}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    });
  }
}
```

- [x] **Step 7: Register providers.** In `mvp.module.ts`, add `IdentityRetentionScanner` and `IdentityRetentionSchedulerService` to the `providers` array, next to where `RemindersSchedulerService` / `RecertificationScanner` are registered (match their import style).

- [x] **Step 8: Verify**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/identity/identity-image-retention.test.ts src/modules/mvp/identity/identity-retention-scanner.service.test.ts src/env.test.ts --no-file-parallelism` → PASS.
Run: `pnpm typecheck` → 8/8.

- [x] **Step 9: Commit**

```bash
git add apps/backend/src/env.schema.ts apps/backend/src/modules/mvp/identity apps/backend/src/modules/mvp/mvp.module.ts
git commit -m "feat(backend): dormant 90-day identity image retention cron (Phase 4 Plan A)"
```

---

## Task 9: Frontend — types, api, contract tests, hooks, format

**Files:**

- Create: `apps/frontend/src/features/identity-verification/types.ts`
- Create: `apps/frontend/src/features/identity-verification/api.ts`
- Create: `apps/frontend/src/features/identity-verification/api.contract.test.ts`
- Create: `apps/frontend/src/features/identity-verification/hooks.ts`
- Create: `apps/frontend/src/features/identity-verification/format.ts`
- Create: `apps/frontend/src/features/identity-verification/format.test.ts`

- [x] **Step 1: types.ts**

```typescript
export type IdentityVerificationStatus = 'draft' | 'pending' | 'approved' | 'rejected';

export interface IdentityVerificationDto {
  id: string;
  learnerId: string;
  method: 'selfie_passport';
  verificationStatus: IdentityVerificationStatus;
  selfieFileId?: string;
  passportFileId?: string;
  consentAt?: string;
  submittedAt?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  imagesPurgedAt?: string;
  createdAt: string;
}

/** Admin queue row: record + learner display data for manual comparison. */
export interface IdentityVerificationView extends IdentityVerificationDto {
  learnerName: string;
  snils?: string;
  dateOfBirth?: string;
}

/** Admin detail: + presigned image URLs (absent after purge / before upload). */
export interface IdentityVerificationDetail extends IdentityVerificationView {
  selfieUrl?: string;
  passportUrl?: string;
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

export interface SubmitIdentityVerificationPayload {
  selfieFileId: string;
  passportFileId: string;
  consent: true;
}

export interface ReviewIdentityVerificationPayload {
  decision: 'approve' | 'reject';
  rejectionReason?: string;
}
```

- [x] **Step 2: Write the failing contract test** (`api.contract.test.ts`) — mirror the structure of `apps/frontend/src/features/recertification/api.contract.test.ts` (same `session` fixture shape, `vi.stubGlobal('fetch', ...)`, `afterEach(() => vi.unstubAllGlobals())`). Cover:

- `identityVerificationApi.me(session)` → GET `/identity-verifications/me`, unwraps `data` (may be `null`).
- `identityVerificationApi.start(session, {})` → POST `/identity-verifications`, unwraps `{ verificationStatus: 'draft' }`.
- `identityVerificationApi.createUploadUrl(session, 'idv_1', payload)` → POST `/identity-verifications/idv_1/upload-url`, unwraps `{ fileId, uploadUrl }`.
- `identityVerificationApi.submit(session, 'idv_1', payload)` → POST `/identity-verifications/idv_1/submit`.
- `identityVerificationApi.list(session, 'pending')` → GET containing `/identity-verifications?status=pending`.
- `identityVerificationApi.get(session, 'idv_1')` → GET `/identity-verifications/idv_1`.
- `identityVerificationApi.review(session, 'idv_1', { decision: 'approve' })` → POST `/identity-verifications/idv_1/review`.

Each test: stub fetch with `new Response(JSON.stringify({ data: ..., meta: {} }), { status: 200 })`, assert the unwrapped value and `expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(<path>), expect.objectContaining({ method: <verb> }))`.

- [x] **Step 3: Run to verify failure**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/features/identity-verification/api.contract.test.ts --no-file-parallelism` → FAIL (module missing).

- [x] **Step 4: api.ts**

```typescript
import { apiRequest } from '../../lib/api/client';

import type {
  CreateUploadUrlPayload,
  IdentityVerificationDetail,
  IdentityVerificationDto,
  IdentityVerificationStatus,
  IdentityVerificationView,
  ReviewIdentityVerificationPayload,
  SubmitIdentityVerificationPayload,
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

export const identityVerificationApi = {
  me: (session: UserSession): Promise<IdentityVerificationDto | null> =>
    apiRequest<IdentityVerificationDto | null>('/identity-verifications/me', {
      method: 'GET',
      ...withAuth(session)
    }),
  start: (
    session: UserSession,
    payload: { learnerId?: string } = {}
  ): Promise<IdentityVerificationDto> =>
    apiRequest<IdentityVerificationDto>('/identity-verifications', {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    }),
  createUploadUrl: (
    session: UserSession,
    id: string,
    payload: CreateUploadUrlPayload
  ): Promise<UploadIntent> =>
    apiRequest<UploadIntent>(`/identity-verifications/${id}/upload-url`, {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    }),
  submit: (
    session: UserSession,
    id: string,
    payload: SubmitIdentityVerificationPayload
  ): Promise<IdentityVerificationDto> =>
    apiRequest<IdentityVerificationDto>(`/identity-verifications/${id}/submit`, {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    }),
  list: (
    session: UserSession,
    status?: IdentityVerificationStatus
  ): Promise<IdentityVerificationView[]> =>
    apiRequest<IdentityVerificationView[]>(
      `/identity-verifications${status ? `?status=${status}` : ''}`,
      { method: 'GET', ...withAuth(session) }
    ),
  get: (session: UserSession, id: string): Promise<IdentityVerificationDetail> =>
    apiRequest<IdentityVerificationDetail>(`/identity-verifications/${id}`, {
      method: 'GET',
      ...withAuth(session)
    }),
  review: (
    session: UserSession,
    id: string,
    payload: ReviewIdentityVerificationPayload
  ): Promise<IdentityVerificationDto> =>
    apiRequest<IdentityVerificationDto>(`/identity-verifications/${id}/review`, {
      method: 'POST',
      body: payload,
      ...withAuth(session)
    })
};

/** Direct PUT of the file bytes to the presigned MinIO URL (bypasses the API envelope).
 *  Deliberate local copy of practical-submissions' helper (same precedent as the СНИЛС validator). */
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

Run the contract test again → PASS.

- [x] **Step 5: format.ts + format.test.ts**

```typescript
import type { IdentityVerificationStatus } from './types';

export const IDENTITY_STATUS_LABELS: Record<IdentityVerificationStatus, string> = {
  draft: 'Черновик',
  pending: 'На проверке',
  approved: 'Подтверждена',
  rejected: 'Отклонена'
};

export function formatIdentityStatus(status: string): string {
  return IDENTITY_STATUS_LABELS[status as IdentityVerificationStatus] ?? status;
}

/** ДД.ММ.ГГГГ from an ISO timestamp; '—' for absent values. */
export function formatDateShort(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('ru-RU');
}
```

`format.test.ts`: assert the four labels, the unknown-status passthrough, `formatDateShort(undefined) === '—'`, `formatDateShort('not-a-date') === '—'`, and that a valid ISO date renders non-'—'.

- [x] **Step 6: hooks.ts** (React Query for reads, `useState` + async/await for mutations — project convention):

```typescript
'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { identityVerificationApi, putFileToPresignedUrl } from './api';
import { useAuth } from '../auth/use-auth';

import type {
  IdentityVerificationDetail,
  IdentityVerificationDto,
  IdentityVerificationStatus,
  IdentityVerificationView,
  ReviewIdentityVerificationPayload
} from './types';

export function useMyIdentityVerification() {
  const { session } = useAuth();
  return useQuery<IdentityVerificationDto | null>({
    queryKey: ['identity-verification', 'me'],
    enabled: Boolean(session),
    queryFn: () => identityVerificationApi.me(session!)
  });
}

export function useIdentityQueue(status?: IdentityVerificationStatus) {
  const { session } = useAuth();
  return useQuery<IdentityVerificationView[]>({
    queryKey: ['identity-verifications', status ?? 'all'],
    enabled: Boolean(session),
    queryFn: () => identityVerificationApi.list(session!, status)
  });
}

export function useIdentityDetail(id: string) {
  const { session } = useAuth();
  return useQuery<IdentityVerificationDetail>({
    queryKey: ['identity-verifications', 'detail', id],
    enabled: Boolean(session) && Boolean(id),
    queryFn: () => identityVerificationApi.get(session!, id)
  });
}

/** Learner flow: start draft → upload both files → submit with consent. */
export function useIdentitySubmission() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitAll = async (selfie: File, passport: File): Promise<boolean> => {
    if (!session) return false;
    setIsPending(true);
    setError(null);
    try {
      const draft = await identityVerificationApi.start(session, {});
      const uploadOne = async (file: File) => {
        const intent = await identityVerificationApi.createUploadUrl(session, draft.id, {
          originalName: file.name,
          contentType: file.type,
          sizeBytes: file.size
        });
        await putFileToPresignedUrl(intent.uploadUrl, file);
        return intent.fileId;
      };
      const selfieFileId = await uploadOne(selfie);
      const passportFileId = await uploadOne(passport);
      await identityVerificationApi.submit(session, draft.id, {
        selfieFileId,
        passportFileId,
        consent: true
      });
      await queryClient.invalidateQueries({ queryKey: ['identity-verification', 'me'] });
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось отправить документы');
      return false;
    } finally {
      setIsPending(false);
    }
  };

  return { submitAll, isPending, error };
}

export function useIdentityReview() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const review = async (id: string, payload: ReviewIdentityVerificationPayload) => {
    if (!session) return false;
    setIsPending(true);
    setError(null);
    try {
      await identityVerificationApi.review(session, id, payload);
      await queryClient.invalidateQueries({ queryKey: ['identity-verifications'] });
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить решение');
      return false;
    } finally {
      setIsPending(false);
    }
  };

  return { review, isPending, error };
}
```

> **Executor note:** verify the `useAuth` import path against `features/recertification/hooks.ts` (it is the canonical sibling) and match it exactly.

- [x] **Step 7: Verify + commit**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/features/identity-verification --no-file-parallelism` → PASS.
Run: `pnpm typecheck` → 8/8.

```bash
git add apps/frontend/src/features/identity-verification
git commit -m "feat(frontend): identity verification feature module — api/hooks/format (Phase 4 Plan A)"
```

---

## Task 10: Learner screen + page + navigation + exam interstitial

**Files:**

- Create: `apps/frontend/src/features/identity-verification/screens.tsx` (learner screen part)
- Create: `apps/frontend/app/learner/identity/page.tsx`
- Modify: `apps/frontend/src/features/navigation/model.ts`
- Modify: `apps/frontend/src/features/test-player/tests-list-screen.tsx`

- [x] **Step 1: Learner screen** — add to `screens.tsx`. Use the project's state wrappers (`PageContainer`, `PageHeader`, `SectionCard`, `LoadingState`, `SectionError` from `src/components/` — check exact import paths in `features/recertification/screens.tsx` and mirror them):

```tsx
'use client';

import { useState } from 'react';

import { formatDateShort, formatIdentityStatus } from './format';
import { useIdentitySubmission, useMyIdentityVerification } from './hooks';

export function LearnerIdentityScreen() {
  const my = useMyIdentityVerification();
  const submission = useIdentitySubmission();
  const [selfie, setSelfie] = useState<File | null>(null);
  const [passport, setPassport] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);

  if (my.isLoading) return <LoadingState />;

  const record = my.data;
  const canSubmit =
    !record || record.verificationStatus === 'rejected' || record.verificationStatus === 'draft';

  const onSubmit = async () => {
    if (!selfie || !passport || !consent) return;
    const ok = await submission.submitAll(selfie, passport);
    if (ok) await my.refetch();
  };

  return (
    <PageContainer>
      <PageHeader
        title="Подтверждение личности"
        subtitle="Селфи и фото паспорта для допуска к итоговому экзамену"
      />
      {record ? (
        <SectionCard title="Текущий статус">
          <p>
            Статус: <strong>{formatIdentityStatus(record.verificationStatus)}</strong>
            {record.submittedAt ? ` · отправлено ${formatDateShort(record.submittedAt)}` : null}
          </p>
          {record.verificationStatus === 'rejected' && record.rejectionReason ? (
            <p>Причина отклонения: {record.rejectionReason}</p>
          ) : null}
        </SectionCard>
      ) : null}
      {canSubmit ? (
        <SectionCard
          title={
            record?.verificationStatus === 'rejected' ? 'Отправить повторно' : 'Отправить документы'
          }
        >
          <label>
            Селфи (фото лица)
            <input
              type="file"
              accept="image/png,image/jpeg"
              onChange={(e) => setSelfie(e.target.files?.[0] ?? null)}
            />
          </label>
          <label>
            Фото разворота паспорта
            <input
              type="file"
              accept="image/png,image/jpeg,application/pdf"
              onChange={(e) => setPassport(e.target.files?.[0] ?? null)}
            />
          </label>
          <label>
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            Даю согласие на обработку персональных данных (152-ФЗ)
          </label>
          {submission.error ? <FieldError message={submission.error} /> : null}
          <button
            type="button"
            disabled={!selfie || !passport || !consent || submission.isPending}
            onClick={onSubmit}
          >
            {submission.isPending ? 'Отправка…' : 'Отправить на проверку'}
          </button>
        </SectionCard>
      ) : null}
    </PageContainer>
  );
}
```

> **Executor note:** this JSX is the semantic skeleton. Match the _actual_ component APIs (`PageHeader` props, `FieldError`, button classes) used in `features/recertification/screens.tsx` and the practical-submissions submit screen — copy their idioms (including any `ui-*` classNames), not raw HTML, where the project has primitives.

- [x] **Step 2: Page** `apps/frontend/app/learner/identity/page.tsx` — mirror `app/admin/recertification/page.tsx` exactly (open it first), swapping the screen import:

```tsx
'use client';

import { LearnerIdentityScreen } from '../../../src/features/identity-verification/screens';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default function LearnerIdentityPage() {
  return (
    <ProtectedPage>
      <LearnerIdentityScreen />
    </ProtectedPage>
  );
}
```

(Adjust relative import depths/props to the real recertification page file.)

- [x] **Step 3: Navigation.** In `features/navigation/model.ts`:

`routeMeta` (near the other `/learner/*` entries):

```typescript
  {
    pattern: '/learner/identity',
    meta: { public: false, requiredPermissions: ['identity.submit'] }
  },
```

`navigationModel` (after «Мои задания»):

```typescript
  {
    href: '/learner/identity',
    label: 'Подтверждение личности',
    requiredPermissions: ['identity.submit']
  },
```

- [x] **Step 4: Exam interstitial.** In `tests-list-screen.tsx`, after the `needsPreExamAuth` detection (line ~29), add:

```typescript
// Phase 4 Plan A gate: distinct message — does NOT contain "identity verification is required".
const needsIdentityVerification =
  /identity_verification_required|identity confirmation by document/i.test(start.error ?? '');
```

Render an interstitial mirroring the existing pre-exam one (same block structure/classNames in this file) when `needsIdentityVerification`: text «Перед экзаменом нужно подтвердить личность (селфи + паспорт)» + a `next/link` `<Link href="/learner/identity">Подтвердить личность</Link>`. Make sure the pre-exam interstitial renders only for `needsPreExamAuth && !needsIdentityVerification` is NOT needed — the two regexes are mutually exclusive by message design; render each on its own flag.

- [x] **Step 5: Verify**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/e2e/lms-role-flows.e2e.test.ts --no-file-parallelism` → PASS (navigation change must not break role flows; if a snapshot of nav items exists, update it deliberately).
Run: `pnpm typecheck` → 8/8. `npx eslint <touched files> --max-warnings=0` → clean.

- [x] **Step 6: Commit**

```bash
git add apps/frontend/src/features/identity-verification/screens.tsx apps/frontend/app/learner/identity apps/frontend/src/features/navigation/model.ts apps/frontend/src/features/test-player/tests-list-screen.tsx
git commit -m "feat(frontend): learner identity screen + exam interstitial + navigation (Phase 4 Plan A)"
```

---

## Task 11: Admin queue + detail screens + pages + e2e smoke

**Files:**

- Modify: `apps/frontend/src/features/identity-verification/screens.tsx` (admin screens)
- Create: `apps/frontend/app/admin/identity-verifications/page.tsx`
- Create: `apps/frontend/app/admin/identity-verifications/[id]/page.tsx`
- Modify: `apps/frontend/src/features/navigation/model.ts`
- Create: `apps/frontend/src/e2e/identity-verification.e2e.test.ts`

- [x] **Step 1: Admin queue screen** — add `AdminIdentityQueueScreen` to `screens.tsx`: `useIdentityQueue('pending')` (with a status filter toggle for all/pending), `DataTable` from `@cdoprof/ui` with columns: Слушатель (`learnerName`), СНИЛС (`snils ?? '—'`), Статус (`formatIdentityStatus`), Отправлено (`formatDateShort(submittedAt)`), and a row link to `/admin/identity-verifications/${id}`. Mirror the recertification queue screen's `DataTable`/`Column`/`StatusChip` usage exactly.

- [x] **Step 2: Admin detail screen** — add `AdminIdentityDetailScreen({ id }: { id: string })`:

```tsx
export function AdminIdentityDetailScreen({ id }: { id: string }) {
  const detail = useIdentityDetail(id);
  const reviewer = useIdentityReview();
  const [reason, setReason] = useState('');

  if (detail.isLoading) return <LoadingState />;
  if (detail.isError || !detail.data) return <SectionError message="Запись не найдена" />;
  const v = detail.data;

  const decide = async (decision: 'approve' | 'reject') => {
    const ok = await reviewer.review(v.id, {
      decision,
      ...(decision === 'reject' && reason ? { rejectionReason: reason } : {})
    });
    if (ok) await detail.refetch();
  };

  return (
    <PageContainer>
      <PageHeader
        title={`Идентификация: ${v.learnerName}`}
        subtitle={formatIdentityStatus(v.verificationStatus)}
      />
      <SectionCard title="Данные слушателя (для сверки с паспортом)">
        <p>ФИО: {v.learnerName}</p>
        <p>СНИЛС: {v.snils ?? '—'}</p>
        <p>Дата рождения: {v.dateOfBirth ?? '—'}</p>
        <p>Согласие на обработку ПДн: {formatDateShort(v.consentAt)}</p>
      </SectionCard>
      <SectionCard title="Документы">
        {v.imagesPurgedAt ? (
          <p>Изображения удалены по сроку хранения ({formatDateShort(v.imagesPurgedAt)}).</p>
        ) : (
          <>
            {v.selfieUrl ? (
              <img src={v.selfieUrl} alt="Селфи" style={{ maxWidth: 360 }} />
            ) : (
              <p>Селфи: нет файла</p>
            )}
            {v.passportUrl ? (
              <img src={v.passportUrl} alt="Паспорт" style={{ maxWidth: 360 }} />
            ) : (
              <p>Паспорт: нет файла</p>
            )}
          </>
        )}
      </SectionCard>
      {v.verificationStatus === 'pending' ? (
        <SectionCard title="Решение">
          <label>
            Причина отклонения (для «Отклонить»)
            <input value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          {reviewer.error ? <FieldError message={reviewer.error} /> : null}
          <button type="button" disabled={reviewer.isPending} onClick={() => decide('approve')}>
            Подтвердить личность
          </button>
          <button type="button" disabled={reviewer.isPending} onClick={() => decide('reject')}>
            Отклонить
          </button>
        </SectionCard>
      ) : null}
    </PageContainer>
  );
}
```

(Same executor note as Task 10 Step 1: match real component APIs. A passport PDF won't render in `<img>` — when `passportUrl` is set but the record's file was a PDF, render an `<a href>` «Открыть документ» link instead; detect by URL extension or just always offer the link alongside.)

- [x] **Step 3: Pages.** `app/admin/identity-verifications/page.tsx` → `AdminIdentityQueueScreen` in `ProtectedPage` (mirror the recertification page). `app/admin/identity-verifications/[id]/page.tsx` → mirror an existing `[id]` page (e.g. `app/admin/clients/[id]/page.tsx`) for the params pattern — **Next 15: `params` may be a Promise; copy the existing file's idiom exactly** — and render `AdminIdentityDetailScreen id={...}`.

- [x] **Step 4: Navigation.** `routeMeta`:

```typescript
  {
    pattern: '/admin/identity-verifications',
    meta: { public: false, requiredPermissions: ['identity.read'] }
  },
  {
    pattern: '/admin/identity-verifications/[id]',
    meta: { public: false, requiredPermissions: ['identity.read'] }
  },
```

`navigationModel` (after «Переаттестация»):

```typescript
  {
    href: '/admin/identity-verifications',
    label: 'Идентификация',
    requiredPermissions: ['identity.read'],
    navSlot: 'more'
  }
```

- [x] **Step 5: e2e routing smoke** — create `src/e2e/identity-verification.e2e.test.ts` mirroring `admin-bulk-enrollment.e2e.test.ts` / the recertification e2e (same imports: `evaluateRouteAccess`, `getVisibleNavigation`). Assert:

- `/admin/identity-verifications` allowed with `['identity.read']`, denied with `[]` and with unrelated perms.
- `/learner/identity` allowed with `['identity.submit']`, denied without.
- Nav item «Идентификация» visible only with `identity.read`; «Подтверждение личности» only with `identity.submit`.
- Dynamic-import smoke: `await import('../features/identity-verification/screens')` resolves and exports the three screens.

- [x] **Step 6: Verify**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/e2e/identity-verification.e2e.test.ts src/features/identity-verification --no-file-parallelism` → PASS.
Run: `pnpm test:frontend` → PASS (full frontend suite works on this machine).
Run: `pnpm typecheck` → 8/8; eslint touched files clean.

- [x] **Step 7: Commit**

```bash
git add apps/frontend/src/features/identity-verification apps/frontend/app/admin/identity-verifications apps/frontend/src/features/navigation/model.ts apps/frontend/src/e2e/identity-verification.e2e.test.ts
git commit -m "feat(frontend): admin identity queue + detail + e2e smoke (Phase 4 Plan A)"
```

---

## Task 12: Quality gate

- [x] **Step 1:** `pnpm -s ci:check` — lint + typecheck + contracts + unit + build. On the Cyrillic-path machine the backend test step may crash in the worker pool; in that case run the isolated cluster instead and note it:

```
pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/identity-verification.service.test.ts src/modules/mvp/pre-exam-auth.service.test.ts src/modules/mvp/mvp.dto-validation.test.ts src/modules/mvp/mvp.http.integration.test.ts src/modules/files/files.service.upload.test.ts src/modules/mvp/identity/identity-image-retention.test.ts src/modules/mvp/identity/identity-retention-scanner.service.test.ts src/modules/mvp/business-flows.e2e.test.ts --no-file-parallelism
```

- [x] **Step 2:** Fix anything found; commit fixes as separate commits.

---

## Task 13: Docs sync (handoff protocol)

**Files:**

- Modify: `README.md` (§2 AI Agent State: Current Stage / Last Completed / Current / Next / Last Updated)
- Modify: `LMS_AGENT_HANDOFF.md` (append §5.116: summary, files, test status, deviations; cross-link this plan + spec)
- Modify: `docs/superpowers/plans/2026-06-10-phase-4-plan-a-identity-verification.md` (tick completed checkboxes)
- Modify: `infra/.env.production.example` — add `IDENTITY_IMAGE_RETENTION_ENABLED=false` + `IDENTITY_RETENTION_CRON_SCHEDULE=0 4 * * *` with a one-line comment (ops parity with the recert flag).

- [x] **Step 1:** Update all four files per the after-session protocol (CLAUDE.md).
- [x] **Step 2:** Commit:

```bash
git add README.md LMS_AGENT_HANDOFF.md docs/superpowers/plans/2026-06-10-phase-4-plan-a-identity-verification.md infra/.env.production.example
git commit -m "docs(handoff): Phase 4 Plan A session record + env example (§5.116)"
```
