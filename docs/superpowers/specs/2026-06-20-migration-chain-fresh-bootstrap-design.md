# Design: Fresh-DB migration bootstrap fix (Issue 4)

**Date:** 2026-06-20
**Branch:** `fix/2026-06-20-migration-chain-fresh-bootstrap`
**Status:** approved (brainstorming → spec)
**Closes:** LMS_AGENT_HANDOFF §13 Issue 4 (remaining parts 1–2)

## Problem

The migration chain in `apps/backend/migrations/` (0001–0055, 56 files) does **not**
apply cleanly to a fresh PostgreSQL database. `DatabaseService.runMigrations` reads
every `*.sql` file in sorted order and runs each in a transaction, recording
`id` + `checksum` (base64url of the file content) in `core.schema_migrations`.
On a fresh DB nothing is recorded, so all files run in sequence and the chain
breaks part-way:

1. **`0003_mvp_domain_integrity_hardening.sql`** — creates
   `storage.files.files_tenant_id_id_uniq` in its first block; FKs then reference
   `storage.files(tenant_id, id)`; a later block **drops the same constraint again**
   → Postgres: `cannot drop constraint files_tenant_id_id_uniq … because other
objects depend on it`. The second drop is redundant (the constraint already
   exists from the first block). This file contains ~92 `drop constraint`
   statements total — a large hardening migration.
2. **`0004_mvp_esign_domain.sql`** — an FK references `esign_applications` with no
   matching unique constraint → `there is no unique constraint matching given keys
for referenced table "esign_applications"`.

The handoff notes the "FK on `(tenant_id, id)` before the matching UNIQUE" pattern
may recur in other hardening migrations (the "0003/0004/…" in §13). The true,
complete list of breakages can only be determined by running the full chain
against a real Postgres.

This is **high severity**: it blocks bootstrapping a relational DB from scratch
out of the box. It is currently masked because (a) the domain runs on in-memory
drivers in dev/test, and (b) the local dev DB was hand-built via a workaround
(only FK-safe IAM/audit migrations applied, all checksums recorded so the runner
skips the rest). Tests apply hand-picked migration subsets via `with-test-db`,
so the full `0001→latest` path is exercised nowhere.

### Already fixed (do not re-touch)

Part 3 of Issue 4 — `DB_MIGRATIONS_ENABLED: z.coerce.boolean()` (where
`Boolean("false") === true`) — was fixed in §5.108 via a `union+transform` schema.
Out of scope here.

## Key facts that shape the solution

- **No database is deployed anywhere** (prod / staging / pilot). Confirmed with the
  owner 2026-06-20. The only existing DB is the local hand-patched dev one, which is
  disposable. This **lifts the "never edit historical migrations" constraint** — that
  rule exists to protect deployed databases whose `schema_migrations` records the
  original checksums; with no such DB, editing the broken files in place is safe.
- The migration **runner** (`apps/backend/src/infrastructure/database/database.service.ts`)
  and the **checksum mechanism** (`migration-integrity.ts`, base64url of file content)
  are correct and stay untouched.
- Many migrations **seed RBAC data** (permissions, roles, role_permissions) and lookup
  data. Editing in place preserves these seed migrations verbatim, so no seed-data
  reconstruction is needed.
- **Verification requires a live Postgres.** Local Docker Desktop will be started by
  the owner so `with-test-db` testcontainers run locally for fast iteration. (GitHub
  Actions has not been running since 2026-05-27 and is not relied upon here; re-enabling
  CI is a separate concern.)

## Chosen approach: edit-in-place fix + permanent full-chain test

Fix the broken migrations directly in their files, and add a permanent test that
applies the **entire** migration set to a fresh testcontainer. The test is both the
iteration tool (run → see next failure → fix → rerun until green) and the durable
regression guard.

### Approaches considered

- **A — Edit-in-place + full-chain test (CHOSEN).** Minimal change, directly fixes
  the root cause, preserves granular reviewable history, seed migrations untouched.
  The full-chain test is the durable deliverable and is shared by every approach.
- **B — Squash to a single generated `0001_baseline.sql`** (schema + RBAC seed dump),
  future migrations from 0056. Cleaner end-state, but baseline generation itself needs
  a working Postgres + the corrected chain (so it does not avoid the fix work), loses
  granular history, larger blast radius. **Fallback** only if breakages prove pervasive
  and surgical fixes become grotesque.
- **C — Baseline coexisting with history (stamp historical ids as applied on a fresh
  DB).** Adds runner complexity that buys nothing when no deployed DB exists. Rejected.

## Components

### 1. Migration fixes (in-place)

- **`0003`** — remove the redundant second `drop constraint … files_tenant_id_id_uniq`
  (the constraint is already created earlier in the same file and is depended on by
  FKs). Make the minimal edit that lets the file apply; do not restructure the
  92-statement file beyond what is needed.
- **`0004`** — ensure a unique/PK constraint matching the FK target on
  `esign_applications` exists before the FK is declared.
- **Any further breakages** surfaced by the full-chain test — fixed the same way,
  each as a minimal, well-commented edit.
- Each edited file gets a short header comment noting it was corrected on 2026-06-20
  for fresh-DB bootstrap (Issue 4), with a one-line why, so the deviation from the
  "don't edit history" convention is self-documenting.

### 2. Full-chain bootstrap test (primary deliverable)

A new test (e.g. `apps/backend/src/infrastructure/database/migration-bootstrap.full-chain.test.ts`)
that:

- Uses the existing testcontainers infra; gated by `describe.skipIf(!isDockerAvailable())`
  so it runs where Docker exists and skips visibly elsewhere (matching the established
  pattern in `with-test-db.ts`).
- Reads **all** `*.sql` files from `apps/backend/migrations/`, sorted (the same listing
  the production runner uses), and applies them in order to a **fresh** database, each in
  its own transaction — mirroring `runMigrations`.
- Asserts the whole sequence applies with no error.
- Asserts a few sanity post-conditions: key schemas exist (`core`, `iam`, `learning`,
  `assessment`, `documents`, `storage`, `audit`, `org`, `lookup`, `communication`,
  `integrations`, `payments`), and the applied count equals the file count.
- Asserts **idempotent re-run**: applying the recorded set again is a no-op (the
  production runner skips ids already in `schema_migrations`).

Because the existing `with-test-db` helper deliberately applies only hand-picked
subsets (and shares one long-lived container across suites), this full-chain test
uses its **own dedicated fresh container** (start → apply all → assert → stop) rather
than the shared singleton, to guarantee a clean slate and avoid cross-suite coupling.

### 3. Local dev DB note

Editing historical files changes their checksums, so the existing hand-patched dev DB
would fail `assertAppliedMigrationUnchanged` on the next `pnpm dev:web` boot. The
mitigation is to **drop and recreate the dev DB from the now-correct chain** — which is
itself the end-to-end proof the fix works. Documented in the handoff; no code change.

## Out of scope

- Squashing / consolidating migrations (fallback only).
- Runner or checksum changes.
- Re-enabling GitHub Actions / fixing CI.
- The already-fixed `DB_MIGRATIONS_ENABLED` coercion.
- Reworking `with-test-db.ts` subset behaviour (the full-chain test is additive).

## Testing strategy

- Iteration loop: run the full-chain test against local Docker → fix the first failing
  migration → rerun → repeat until green.
- Final acceptance: full-chain test green (all 56 files apply on a fresh container,
  idempotent re-run is a no-op, sanity schemas present); backend typecheck 8/8;
  ESLint clean on changed files.
- Manual confirmation: recreate the local dev DB from the corrected chain and boot
  `pnpm dev:web` → `Nest application successfully started`.

## Risks

- **Unknown breakage count** until the first full run — bounded; iterate to green.
- **Editing history** departs from the team convention — justified by "no deployed DB",
  documented in file headers + handoff.
- **Dev DB checksum mismatch** after edits — mitigated by recreating the dev DB.
- **Docker dependency** for verification — owner starts Docker Desktop; without it the
  test skips (visible) and the fix cannot be proven, so it must not be merged unproven.
