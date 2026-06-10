# Phase 4 · Plan A — Identity Verification (selfie + passport, manual review)

> **Design spec.** Scope, decisions, and architecture for the first slice of roadmap Phase 4
> (идентификация и прокторинг). This plan delivers **identity verification only**; live-operator
> video-ID, ЕСИА/MAX OAuth, and proctoring video recording are explicitly deferred (see §9).
>
> **Roadmap:** [docs/superpowers/plans/2026-05-21-cdoprof-v1-roadmap.md](../plans/2026-05-21-cdoprof-v1-roadmap.md) §Phase 4.
> **Direct precedent:** Wave 1 Plan 2 pre-exam auth ([2026-05-31-wave1-pre-exam-auth.md](../plans/2026-05-31-wave1-pre-exam-auth.md), PR #219).

## 1. Goal

A learner proves their identity once by submitting a **selfie + a photo of their passport**. An
admin/curator **manually verifies** these against the learner's already-stored passport data
(`learning.learners.passport_*` / `snils`, migration 0036). Once a verification is **approved**,
the learner may start identity-gated **final exams**.

Enforcement converges on `MvpService.startAttempt` through one new gate
`assertIdentityVerificationGate`, placed immediately after Wave 1's `assertPreExamAuthGate`. The two
gates are **orthogonal and independent** — Приказ №816's e-mailed-link confirmation versus
documentary identity proof — so Plan A touches none of Wave 1's working code. The learner cabinet
surfaces a "Подтвердите личность" call-to-action early, but the authoritative server-side
enforcement is at exam start (the existing, proven hook point).

## 2. Locked decisions

These were resolved during brainstorming. Do not re-litigate during execution; if one proves wrong,
stop and raise it.

1. **Scope = identity verification only.** Proctoring (WebRTC recording, consent, auto-delete,
   admin playback) is a separate later **Plan B**. Live-operator video-ID and ЕСИА are deferred
   (require operator staffing / ИС status respectively).
2. **Method = `selfie_passport`, asynchronous manual review.** Reuses the existing file-upload →
   presigned MinIO PUT → antivirus → reviewer-queue plumbing (from practical-work submissions). No
   live video, no automated face match.
3. **Verification is keyed per-learner (the person), not per-enrollment.** One approved verification
   covers all of that learner's courses. This matches the regulated-training reality (identity is a
   property of the person) and minimizes copies of passport scans at rest.
4. **Validity = indefinite for the pilot.** `validUntil` exists in the model (nullable) but is left
   unpopulated. An approved verification stays valid until an admin revokes/re-requests it. A
   validity window can be switched on later **without a migration**.
5. **Image retention = 90-day auto-purge via a dormant cron.** The decision record
   (approved/rejected, who, when) persists indefinitely; the selfie/passport **image objects** are
   deleted 90 days after the decision (152-ФЗ data minimization), stamping `imagesPurgedAt`. The
   cron is dormant behind `IDENTITY_IMAGE_RETENTION_ENABLED=false`, mirroring the recertification
   scanner (advisory lock, cross-tenant via `MvpTenantRunner`).
6. **Gating granularity = per-group-course toggle** (`requiresIdentityVerification`), consistent
   with Wave 1's `requiresPreExamAuth`. A per-_student_ override is out of scope for Plan A.
7. **Rejection notice = logged stub**, exactly like Wave 1's link delivery. A real e-mail rides
   Phase 5's `MailerService` as a documented follow-up.

## 3. Data model

New per-group-course toggle plus one new MVP collection (`apps/backend/src/modules/mvp/mvp.types.ts`):

```ts
export interface IdentityVerification extends BaseEntity {
  learnerId: string;
  method: 'selfie_passport';
  selfieFileId?: string; // storage.files id
  passportFileId?: string;
  consentAt?: string; // 152-ФЗ consent captured at submit
  status: 'draft' | 'pending' | 'approved' | 'rejected';
  submittedAt?: string;
  reviewedByActorId?: string;
  reviewedAt?: string;
  rejectionReason?: string;
  validUntil?: string; // nullable; unused in pilot (indefinite validity)
  imagesPurgedAt?: string; // set by the retention cron after 90 days
}
```

`GroupCourse.requiresIdentityVerification?: boolean`.

The gate finds the learner's **latest `approved`** record (purged images do not invalidate the
decision). Resubmission after a rejection creates a fresh record; history is preserved.

### Persistence

Runtime state persists as the existing JSONB snapshot (`InMemoryMvpState` + `MVP_COLLECTIONS`). Per
the 0016 JSONB-contract rule, migration `0050` adds the **typed schema contract**:

- `learning.group_courses.requires_identity_verification boolean NOT NULL DEFAULT false`
- `learning.identity_verifications` table mirroring the interface (hash-free; references
  `storage.files` for the two images; `valid_until`, `images_purged_at` nullable).
- Permissions `identity.submit`, `identity.read`, `identity.review` seeded + assigned:
  - learner → `identity.submit`
  - tenant_admin / platform_admin → all three (admins also submit, for act-as)
  - curator/teacher → `identity.read` + `identity.review`

## 4. Lifecycle & data flow

1. Admin enables `requiresIdentityVerification` on a group-course.
2. Learner: `startIdentityVerification` (creates a `draft`) → requests presigned upload URLs for
   selfie + passport (reuses `filesService.createUploadIntent`, storage prefix
   `identity/{tenantId}/…`) → PUTs the files directly to MinIO →
   `submitIdentityVerification({ selfieFileId, passportFileId, consent: true })` → status `pending`.
3. Admin queue: views the two images (presigned download, **gated by the existing antivirus
   clean-check**) side-by-side with the learner's stored passport fields → `approve` or
   `reject(reason)`.
4. Learner starts the final exam → `assertIdentityVerificationGate` allows (approved) or throws
   `identity_verification_required` (HTTP 412) → frontend interstitial → learner verifies/resubmits.
5. (Dormant) retention cron purges the selfie/passport image objects 90 days after `reviewedAt`,
   stamping `imagesPurgedAt`; the decision record persists.

## 5. Backend components

- **Migration `apps/backend/migrations/0050_learning_identity_verification.sql`** — typed contract
  (toggle + table + permissions/role grants). Additive, idempotent.
- **MVP wiring** — `IdentityVerification` type; `identityVerifications: IdentityVerification[] = []`
  in `in-memory-mvp.state.ts`; `'identityVerifications'` in `mvp-collections.ts` (both lists land
  together — a collection missing from either is silently lost between requests, per CLAUDE.md).
- **`MvpService` methods** (6-arg constructor unchanged; `filesService` already injected):
  - `startIdentityVerification`, `createIdentityVerificationUploadIntent`,
    `submitIdentityVerification`, `reviewIdentityVerification`
  - `listIdentityVerifications` (enriched view: `learnerName` + stored passport summary for
    comparison), `getIdentityVerification` (with presigned image download URLs)
  - `groupCourseRequiresIdentityVerification` + `assertIdentityVerificationGate`, wired into
    `startAttempt` after `assertPreExamAuthGate`
  - pure `selectIdentityImagesToPurge(asOf, records, retentionDays = 90)` for the cron
  - every mutation audited: `learning.identity_verification_submitted` / `_approved` / `_rejected`
    / `_images_purged`
- **Retention cron** — extends `reminders-scheduler` (or a sibling `identity-retention-scanner`):
  dormant flag `IDENTITY_IMAGE_RETENTION_ENABLED`, advisory lock, cross-tenant via
  `MvpTenantRunner`, calls a `filesService` object-delete.
  **Dependency to confirm in the plan:** `FilesService` needs a delete/soft-delete method; if
  absent, add one using the S3 client's `deleteObject` + a `storage.files.deleted_at` stamp.
- **DTOs + controller** — `StartIdentityVerificationRequest`,
  `IdentityVerificationUploadIntentRequest { kind: 'selfie' | 'passport', originalName,
contentType, sizeBytes }`, `SubmitIdentityVerificationRequest { selfieFileId, passportFileId,
consent }`, `ReviewIdentityVerificationRequest { decision: 'approve' | 'reject', rejectionReason?
}`; `requiresIdentityVerification?` on the two group-course DTOs. Endpoints:
  - `POST /identity-verifications` → `identity.submit`
  - `POST /identity-verifications/:id/upload-url` → `identity.submit`
  - `POST /identity-verifications/:id/submit` → `identity.submit`
  - `GET /identity-verifications/me` → `identity.submit` (learner's own status)
  - `GET /identity-verifications` → `identity.read`
  - `GET /identity-verifications/:id` → `identity.read` (with image download URLs)
  - `POST /identity-verifications/:id/review` → `identity.review`

  Permission boundaries asserted via the stub-controller HTTP-integration pattern.

## 6. Frontend components

Feature module `apps/frontend/src/features/identity-verification/` (`types.ts`, `api.ts`,
`api.contract.test.ts`, `hooks.ts`, `screens.tsx`, `format.ts`):

- **Learner screen** `/learner/identity` — 152-ФЗ consent checkbox + two uploaders reusing the
  practical-submissions `createUploadUrl → putFileToPresignedUrl → submit` flow; shows status,
  rejection reason, resubmit.
- **Admin queue** `/admin/identity-verifications` — `@cdoprof/ui` `DataTable` of pending; detail
  view with the two images + the learner's stored passport data side-by-side; Approve /
  Reject(reason). Mutations follow the `useState` + async/await `wrap` pattern (not React Query
  mutations).
- **Navigation** — `routeMeta` + `navigationModel` entries
  (`/admin/identity-verifications` → `identity.read`; learner entry → `identity.submit`).
- **Test-player interstitial** — on `identity_verification_required`, show "Подтвердите личность"
  linking to `/learner/identity` (mirrors Wave 1's `pre_exam_auth_required` interstitial).
- **e2e** — permission-routing smoke (no React mount — matches the project's e2e convention).

## 7. Error handling

Upload reuses the existing mime allowlist (images / pdf), 10 MB cap, and antivirus download-gate
(423 infected / 409 scan-failed). `submit` without both files or without consent → 400. `review` of
a non-`pending` record → 400. The gate throws 412 `identity_verification_required`. Tenant isolation

- permission guards as standard.

## 8. Testing

- **Backend:** `identity-verification.service.test.ts` (full lifecycle + gate + no-regression on
  ungated exams), retention pure-function test, DTO-validation, HTTP-integration permission
  boundary.
- **Frontend:** `api.contract.test.ts`, `format.test.ts`, e2e routing smoke.
- **Quality gate:** `pnpm -s ci:check` (isolated backend file runs on the Cyrillic path — CLAUDE.md
  Gotchas).

## 9. Out of scope (explicit)

Live-operator video-ID; ЕСИА/MAX OAuth; proctoring video recording + consent + auto-delete + admin
playback (→ Plan B); per-_student_ override toggle; automated face match; real e-mail of the
rejection notice (logged stub for now, rides Phase 5 `MailerService` later).

## 10. Migration & naming

- Latest migration is `0049`; this plan adds `0050_learning_identity_verification.sql`.
- Permission codes: `identity.submit`, `identity.read`, `identity.review`.
- Error codes: `identity_verification_required`, plus standard `validation_error` /
  `domain_rule_violation`.
