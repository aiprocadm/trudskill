# Fresh-DB Migration Bootstrap Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the entire SQL migration chain (`apps/backend/migrations/0001…latest`) apply cleanly to a fresh PostgreSQL database, guarded permanently by a full-chain bootstrap test.

**Architecture:** Add a testcontainers-backed test that applies every migration in order to a brand-new database (the iteration harness AND the durable regression guard), then fix each broken migration file in place until the test is green. No deployed DB exists, so editing historical files is safe; the runner and checksum mechanism are untouched.

**Tech Stack:** PostgreSQL 16, `@testcontainers/postgresql`, Vitest, `pg`, NestJS (`DatabaseService.runMigrations` is the production reference).

**Spec:** [docs/superpowers/specs/2026-06-20-migration-chain-fresh-bootstrap-design.md](../specs/2026-06-20-migration-chain-fresh-bootstrap-design.md)

**Execution note:** This plan is **iterative and stateful** — Task 4 is a discover-and-fix loop that requires a live local Postgres (Docker Desktop). Inline execution is recommended over subagent-driven, because each fix depends on the previous run's failure. Two breakages are already diagnosed empirically (0003, 0004); the rest follow the same `(tenant_id, id)`-composite-FK-without-matching-UNIQUE pattern and are surfaced one at a time by the test.

---

## File Structure

- **Create** `apps/backend/src/infrastructure/database/migration-bootstrap.full-chain.test.ts` — the full-chain bootstrap test. Owns: spinning a dedicated fresh Postgres container, applying all migrations in order mirroring `runMigrations`, and asserting clean apply + sanity schemas + idempotent re-run.
- **Modify** `apps/backend/migrations/0003_mvp_domain_integrity_hardening.sql` — remove the redundant second drop/add of `files_tenant_id_id_uniq`.
- **Modify** `apps/backend/migrations/0004_mvp_esign_domain.sql` — add `UNIQUE (tenant_id, id)` to the esign tables referenced by composite FKs.
- **Modify** any further migration files surfaced by the test (Task 4), each minimally.
- **Modify** `LMS_AGENT_HANDOFF.md` — mark §13 Issue 4 parts 1–2 resolved; add §5.NNN entry; note dev-DB recreation.
- **Modify** `README.md` — §2 state sync.

---

## Task 1: Full-chain bootstrap test (RED harness)

**Files:**

- Create: `apps/backend/src/infrastructure/database/migration-bootstrap.full-chain.test.ts`

This test is the iteration harness for Tasks 2–4 and the permanent regression guard. It boots its **own** fresh container (not the shared `with-test-db` singleton) so the slate is guaranteed clean.

- [ ] **Step 1: Write the test**

```ts
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';

import { computeMigrationSqlChecksum } from './migration-integrity.js';
import { isDockerAvailable } from '../../testing/with-test-db.js';

function resolveMigrationsDir(): string {
  const candidates = [
    join(process.cwd(), 'migrations'),
    join(process.cwd(), 'apps/backend/migrations')
  ];
  const resolved = candidates.find((p) => existsSync(p));
  if (!resolved)
    throw new Error(`Migrations directory not found. Checked: ${candidates.join(', ')}`);
  return resolved;
}

function listMigrationFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

/** Mirrors DatabaseService.runMigrations: create core.schema_migrations, skip
 *  already-applied ids, run each pending file in its own transaction, record it.
 *  Returns the list of ids actually applied during this call. */
async function runPendingMigrations(pool: Pool, dir: string, files: string[]): Promise<string[]> {
  await pool.query('create schema if not exists core');
  await pool.query(
    `create table if not exists core.schema_migrations (
       id text primary key, checksum text not null, applied_at timestamptz not null default now())`
  );
  const appliedRows = await pool.query<{ id: string }>('select id from core.schema_migrations');
  const applied = new Set(appliedRows.rows.map((r) => r.id));
  const justApplied: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(dir, file), 'utf8');
    const checksum = computeMigrationSqlChecksum(sql);
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into core.schema_migrations (id, checksum) values ($1, $2)', [
        file,
        checksum
      ]);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
    } finally {
      client.release();
    }
    justApplied.push(file);
  }
  return justApplied;
}

const EXPECTED_SCHEMAS = [
  'core',
  'iam',
  'learning',
  'assessment',
  'documents',
  'storage',
  'audit',
  'org',
  'lookup',
  'communication',
  'integrations',
  'payments'
];

describe.skipIf(!isDockerAvailable())('migration chain applies to a fresh database', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  const dir = resolveMigrationsDir();
  const files = listMigrationFiles(dir);

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16').start();
    pool = new Pool({ connectionString: container.getConnectionUri(), max: 4 });
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it('applies every migration in order with no error', async () => {
    const appliedNow = await runPendingMigrations(pool, dir, files);
    expect(appliedNow).toEqual(files);
    const count = await pool.query<{ n: string }>(
      'select count(*)::text as n from core.schema_migrations'
    );
    expect(Number(count.rows[0]!.n)).toBe(files.length);
  });

  it('creates all expected schemas', async () => {
    const rows = await pool.query<{ schema_name: string }>(
      'select schema_name from information_schema.schemata'
    );
    const present = new Set(rows.rows.map((r) => r.schema_name));
    for (const s of EXPECTED_SCHEMAS) expect(present.has(s), `schema ${s} missing`).toBe(true);
  });

  it('is idempotent: a second run applies nothing', async () => {
    const appliedAgain = await runPendingMigrations(pool, dir, files);
    expect(appliedAgain).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test — expect RED on 0003**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/infrastructure/database/migration-bootstrap.full-chain.test.ts --no-file-parallelism`
Expected: FAIL — `Migration 0003_mvp_domain_integrity_hardening.sql failed: cannot drop constraint files_tenant_id_id_uniq on table storage.files because other objects depend on it`. (If Docker is down the whole describe is skipped — Docker must be running.)

- [ ] **Step 3: Commit the test**

```bash
git add apps/backend/src/infrastructure/database/migration-bootstrap.full-chain.test.ts
git commit -m "test(db): full-chain fresh-DB migration bootstrap test (RED)"
```

---

## Task 2: Fix 0003 — redundant constraint re-drop

**Files:**

- Modify: `apps/backend/migrations/0003_mvp_domain_integrity_hardening.sql`

**Root cause (diagnosed empirically):** lines 9–11 create `files_tenant_id_id_uniq`; a later `ALTER TABLE storage.files` block (lines 312–313) drops and re-adds the same constraint, but by then FKs (`file_links_file_tenant_fk`, etc.) depend on it → the drop fails. The re-drop is pure redundancy.

- [ ] **Step 1: Remove the redundant drop/add**

In the second `ALTER TABLE storage.files` block (the one that also handles `files_size_bytes_chk` and `files_uploaded_by_tenant_fk`), delete exactly these two lines:

```sql
  DROP CONSTRAINT IF EXISTS files_tenant_id_id_uniq,
  ADD CONSTRAINT files_tenant_id_id_uniq UNIQUE (tenant_id, id),
```

so the block starts directly with `DROP CONSTRAINT IF EXISTS files_size_bytes_chk,`. The constraint remains created by the first block (lines 9–11). Leave the rest of the file untouched.

- [ ] **Step 2: Add a self-documenting header comment** at the very top of the file:

```sql
-- Corrected 2026-06-20 (Issue 4, fresh-DB bootstrap): removed a redundant second
-- DROP/ADD of files_tenant_id_id_uniq that failed once FKs depended on it. Safe to
-- edit history: no DB is deployed. See docs/superpowers/specs/2026-06-20-migration-chain-fresh-bootstrap-design.md
```

- [ ] **Step 3: Re-run the full-chain test — expect RED on 0004**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/infrastructure/database/migration-bootstrap.full-chain.test.ts --no-file-parallelism`
Expected: FAIL — now advances past 0003 and fails: `Migration 0004_mvp_esign_domain.sql failed: there is no unique constraint matching given keys for referenced table "esign_applications"`.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/migrations/0003_mvp_domain_integrity_hardening.sql
git commit -m "fix(db): 0003 — drop redundant files_tenant_id_id_uniq re-drop (fresh-DB bootstrap)"
```

---

## Task 3: Fix 0004 — composite uniques on esign tables

**Files:**

- Modify: `apps/backend/migrations/0004_mvp_esign_domain.sql`

**Root cause (diagnosed empirically):** `esign.esign_applications`, `esign.signing_processes`, and `esign.signing_participants` are each declared with `id text PRIMARY KEY` only, but later FKs reference them by the composite `(tenant_id, id)` (e.g. `esign_application_files_tenant_application_fk` references `esign.esign_applications (tenant_id, id)`). A composite FK needs a matching UNIQUE/PK on the referenced columns.

- [ ] **Step 1: Add `UNIQUE (tenant_id, id)` to each referenced esign table**

In the `CREATE TABLE` for `esign.esign_applications`, add a table constraint (alongside the existing constraints, before the closing `)`):

```sql
  CONSTRAINT esign_applications_tenant_id_id_uniq UNIQUE (tenant_id, id),
```

Do the same in `esign.signing_processes`:

```sql
  CONSTRAINT signing_processes_tenant_id_id_uniq UNIQUE (tenant_id, id),
```

and in `esign.signing_participants`:

```sql
  CONSTRAINT signing_participants_tenant_id_id_uniq UNIQUE (tenant_id, id),
```

(Place each as the first constraint after the column list so it is created before the FKs that reference it. A trailing comma is required since other constraints follow.)

- [ ] **Step 2: Add the self-documenting header comment** at the top of the file:

```sql
-- Corrected 2026-06-20 (Issue 4, fresh-DB bootstrap): added UNIQUE (tenant_id, id)
-- to esign_applications / signing_processes / signing_participants so the composite
-- (tenant_id, id) FKs in this file have a matching unique. Safe to edit history: no DB deployed.
```

- [ ] **Step 3: Re-run the full-chain test**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/infrastructure/database/migration-bootstrap.full-chain.test.ts --no-file-parallelism`
Expected: either GREEN (all 56 applied) or RED on a later file. **If RED on a later file, proceed to Task 4. If GREEN, skip Task 4.**

- [ ] **Step 4: Commit**

```bash
git add apps/backend/migrations/0004_mvp_esign_domain.sql
git commit -m "fix(db): 0004 — add composite (tenant_id,id) uniques on esign tables (fresh-DB bootstrap)"
```

---

## Task 4: Iterate remaining breakages to green (discover-and-fix loop)

**Files:**

- Modify: whichever `apps/backend/migrations/*.sql` the test reports, one at a time.

The test fails on **one** file at a time. Repeat this micro-loop until the test is fully green. Every breakage seen so far is the same family; expect one of these diagnoses and apply the matching minimal fix:

| Postgres error                                                               | Diagnosis                                                     | Minimal fix                                                              |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `cannot drop constraint X … because other objects depend on it`              | a constraint is dropped/recreated after dependents exist      | remove the redundant re-drop/re-add (as in 0003)                         |
| `there is no unique constraint matching given keys for referenced table "T"` | composite `(tenant_id, id)` FK with no matching UNIQUE on `T` | add `UNIQUE (tenant_id, id)` to `T` before the FK (as in 0004)           |
| `relation / column / type … does not exist`                                  | statement ordered before the object it needs                  | reorder within the file, or add the missing `IF EXISTS`/guard, minimally |

- [ ] **Step 1: Run the test, read the single failing file + error**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/infrastructure/database/migration-bootstrap.full-chain.test.ts --no-file-parallelism`
Note the `Migration <file> failed: <postgres error>` message.

- [ ] **Step 2: Read the failing file, locate the offending statement** (`grep -n` the constraint/table name from the error).

- [ ] **Step 3: Apply the minimal fix** from the table above + a one-line header comment if the file does not already carry one.

- [ ] **Step 4: Re-run the test.** If a new file fails, repeat Steps 1–4. If green, continue to Step 5.

- [ ] **Step 5: Commit each fix** (one commit per migration file):

```bash
git add apps/backend/migrations/<file>.sql
git commit -m "fix(db): <file> — <one-line cause> (fresh-DB bootstrap)"
```

- [ ] **Step 6: Final green run — confirm all three assertions pass**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/infrastructure/database/migration-bootstrap.full-chain.test.ts --no-file-parallelism`
Expected: PASS — "applies every migration in order with no error" (applied count == file count), "creates all expected schemas", "is idempotent: a second run applies nothing".

---

## Task 5: Verify no regressions + dev-DB recreation proof

**Files:** none (verification only).

- [ ] **Step 1: Typecheck the backend**

Run: `pnpm typecheck`
Expected: 8/8 successful.

- [ ] **Step 2: Lint the new test file**

Run: `npx eslint apps/backend/src/infrastructure/database/migration-bootstrap.full-chain.test.ts --max-warnings=0`
Expected: clean.

- [ ] **Step 3: Run the existing migration-touching suites** (ensure the edits did not break subset-based tests):

Run: `pnpm --filter @cdoprof/backend exec vitest run src/infrastructure/database/migration-integrity.test.ts src/modules/documents/migrations.0033.test.ts src/modules/documents/migrations.0034.test.ts --no-file-parallelism`
Expected: PASS.

- [ ] **Step 4 (manual, optional but recommended): recreate the local dev DB from the corrected chain** as end-to-end proof. Drop the dev `cdoprof` DB, run the app with migrations enabled, confirm `Nest application successfully started`. Record the outcome in the handoff entry. (No code change.)

---

## Task 6: Documentation

**Files:**

- Modify: `LMS_AGENT_HANDOFF.md`
- Modify: `README.md`

- [ ] **Step 1: Mark §13 Issue 4 parts 1–2 resolved** in `LMS_AGENT_HANDOFF.md` — change the Issue 4 status line to RESOLVED, summarising the edit-in-place fixes + full-chain test, and note that the local dev DB must be recreated (old checksums no longer match the edited files).

- [ ] **Step 2: Append a `### 5.NNN` handoff entry** (next free number) with: the empirically-found breakage list, the files changed, the full-chain test, and test status.

- [ ] **Step 3: Sync README §2** — Current Task / Last Completed Task / Last Updated At / By.

- [ ] **Step 4: Commit**

```bash
git add LMS_AGENT_HANDOFF.md README.md
git commit -m "docs: fresh-DB migration bootstrap fix — §13 Issue 4 resolved + handoff §5.NNN"
```

---

## Self-Review notes

- **Spec coverage:** migration fixes (Tasks 2–4), full-chain test with sanity + idempotency (Task 1), dev-DB recreation note (Task 5 Step 4 + Task 6 Step 1), docs (Task 6). All spec components covered.
- **Out-of-scope respected:** no runner/checksum changes, no squash, no `with-test-db` subset rework, no CI changes.
- **Idempotency assertion** uses the same `runPendingMigrations` helper (skip-applied loop) so the second call returning `[]` genuinely proves the production runner's skip behaviour.
