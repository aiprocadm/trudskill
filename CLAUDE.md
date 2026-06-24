# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository

CDOProf — LMS/СДО platform for regulated professional education (ОТ, ПБ, медицина, МЧС, обязательные аттестации). `pnpm` 9.12.3 + Turborepo monorepo. Local path is `D:\Кодинг\cdoprof--main\cdoprof--main` (Windows, **Cyrillic — see Gotchas**).

## Documentation hierarchy (SSOT)

When docs disagree, follow the order in [docs/DOCUMENTATION_MAP.md](docs/DOCUMENTATION_MAP.md):

1. Customer-signed protocol (e.g. ТЗ §47 Appendix Б).
2. [SDOPROF_TZ_FINAL.md](SDOPROF_TZ_FINAL.md) — product spec / §39 acceptance criteria / §41 backlog.
3. Code + tests; described in [LMS_AGENT_HANDOFF.md](LMS_AGENT_HANDOFF.md) §5.\* (sequentially numbered, currently up to §5.90) and [docs/TZ_MVP_TRACEABILITY.md](docs/TZ_MVP_TRACEABILITY.md) (BL → file paths).
4. [README.md](README.md) §2 «AI Agent State» — operational snapshot.

For «продолжай по ТЗ» tasks, read in this order:
README §2 → LMS_AGENT_HANDOFF §1 (date/branch) + §5 (recent work) + §13 (Known Issues) → SDOPROF_TZ_FINAL §41 ↔ TZ_MVP_TRACEABILITY.

## Plan-driven workflow

Non-trivial work goes through a written plan before code:

- **Specs** live in [`docs/superpowers/specs/`](docs/superpowers/specs/) — design decisions, scope, open questions.
- **Plans** live in [`docs/superpowers/plans/`](docs/superpowers/plans/) — TDD task breakdowns with file lists, acceptance criteria, deviations.
- Each plan is dated (`YYYY-MM-DD-<topic>.md`) and structured with `## Task N` sections containing `**Files:**`, `**Tasks:**` (checkbox list), `**Acceptance:**`.

Use the `superpowers:writing-plans` skill to author, `superpowers:executing-plans` (sequential) or `superpowers:subagent-driven-development` (parallel) to implement, `superpowers:finishing-a-development-branch` to close.

Recent reference plans: `2026-05-21-magic-link-auth.md` (Phase 1 magic-link), `2026-05-22-regulated-training-foundation-a.md` (Pillar A Plan A), `2026-05-28-phase-2-admin-bulk-enrollment-a.md` (Phase 2 Plan A). Phase 1 + Pillar A merged; Phase 2 Plan A is in PRs #191-#196 as of 2026-05-29.

## Commands

Everything runs from repo root.

```bash
pnpm ci:check            # lint + typecheck + contracts:lint + contracts:typecheck + test:unit + build
pnpm typecheck           # turbo typecheck (8 tasks, cached)
pnpm lint                # turbo lint (next lint for frontend; ESLint for rest)
pnpm test                # turbo test (all projects in parallel)
pnpm test:backend        # vitest --project @trudskill/backend (HEAVY — see Gotchas)
pnpm test:frontend       # vitest --project @trudskill/frontend (~190 tests in ~15s)
pnpm test:contracts      # vitest --project @trudskill/api-contracts
pnpm test:integration    # backend integration suite only
pnpm test:migrations     # SQL migration tests
pnpm test:security       # auth + webhook signatures + state machines

# Run a single test file (the reliable way on Windows):
pnpm --filter @trudskill/backend exec vitest run src/modules/<path>.test.ts --no-file-parallelism
pnpm --filter @trudskill/frontend exec vitest run src/<path>.test.ts --no-file-parallelism

# Lint a single file (useful when pre-existing lint errors elsewhere block full lint):
npx eslint <path> --max-warnings=0

pnpm dev:stack           # docker compose infra + dev backend + dev frontend
pnpm docker:infra        # postgres + redis + rabbitmq + minio + supertokens only
pnpm contracts:generate  # regenerate OpenAPI/Zod from contracts
```

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs lint+typecheck, backend tests, frontend tests, contracts tests, and Python tests in parallel jobs on Ubuntu.

## Architecture

**Monorepo layout** (don't deep-import — go through workspace package entrypoints like `@trudskill/shared-types`):

- `apps/backend` — NestJS API. Module-per-domain under `src/modules/` (`iam`, `mvp`, `documents`, `esign`, `communication`, `integrations`, `audit`, `org`, `files`, `health`, `workspace`).
- `apps/frontend` — Next.js 15 App Router + TypeScript. Pages in `app/`, features in `src/features/<domain>/` (each typically: `api.ts`, `hooks.ts`, `types.ts`, `screens.tsx`).
- `apps/realtime` / `apps/worker` — separate Node services for WebSocket push and RabbitMQ consumers (bulk enrollment worker, etc.).
- `packages/api-contracts` — DTO + generated OpenAPI/Zod schemas. **Don't edit `src/generated/*` by hand** — use `pnpm contracts:generate`.
- `packages/shared-types` — runtime-agnostic types shared across apps.
- `packages/ui` — shared UI primitives (`DataTable`, `Column`, etc.) imported as `@trudskill/ui`.

**Database schemas** (PostgreSQL):

- `core` — tenants, users-tenant links.
- `iam` — roles, permissions, role_permissions, sessions, magic_link_tokens.
- `learning` — courses, course_versions, modules, materials, groups, enrollments, progress, **commissions** (Pillar A), **course_document_sets**.
- `assessment` — question banks, tests, attempts, assignments, submissions, reviews.
- `documents` — templates, template_versions, template_variables, template_bindings, numbering_rules, generated_documents.
- `lookup` — global non-tenant data (regulatory_acts).
- `org` — tenant licenses (Pillar A Plan C).
- `audit` — append-only audit log.
- `storage` — file metadata (S3/MinIO refs).
- `crm` — counterparties, deals (early stub).

**Multi-tenant** with strict isolation. Every domain entity has `tenantId` + `createdAt` + `updatedAt` + `status` via `BaseEntity`. Backend uses `TenantGuard` (extracts tenant from JWT + `x-tenant-id` header — must match) + `PermissionGuard` + `@RequirePermissions(...)` decorator.

**Permission model**: dot-separated `<domain>.<action>` (e.g. `learners.write`, `enrollments.read`, `learning.commissions.write`, `assessment.tests.read`). Seeded via numbered SQL migrations (e.g. `0010_iam_role_permissions_and_seed.sql`, `0031_iam_pillar_a_permissions.sql`, `0038_iam_learner_role_and_seed.sql`). When adding a new permission: new migration + assign to roles in same file. `@RequirePermissions('a.b', 'c.d')` requires ALL listed; use multiple decorators for OR.

**Request-scoped state** in MVP module: `MvpService` and `InMemoryMvpState` are `Scope.REQUEST`. `MvpRequestPersistenceInterceptor` loads tenant state at request start, persists mutations at end. **If you add a new in-memory collection, register it in [`apps/backend/src/modules/mvp/infrastructure/mvp-collections.ts`](apps/backend/src/modules/mvp/infrastructure/mvp-collections.ts)** — otherwise it's lost between HTTP requests (this bit Pillar A Plan A Task 10 in HTTP integration tests).

**Persistence backend abstraction** in MVP: `MVP_PERSISTENCE_BACKEND` token has `MemoryMvpPersistenceBackend` + `PostgresMvpPersistenceBackend`. Selected via env (`ALLOW_IN_MEMORY_STATE=true` keeps memory). Bulk load/save tenant state at request boundary, not per-call.

**API envelope.** All responses wrap `{ data, meta: { requestId, correlationId, timestamp } }`. Errors: `{ error: { code, message }, meta }`. Frontend `apiRequest` from [`src/lib/api/client.ts`](apps/frontend/src/lib/api/client.ts) unwraps automatically; tests assert against the envelope shape (see `mvp.http.integration.test.ts`).

**Documents pipeline** ([`apps/backend/src/modules/documents/`](apps/backend/src/modules/documents/)): templates → variables → bindings → numbering → generated_documents. The `enrollment-document-issuance.listener` issues all `autoIssue=true` documents in the course's document set on enrollment completion (Pillar A extended this from «one cert» to «document set»). Variable resolvers are pure functions in `pillar-a-variables.ts` (program / commission / enrollment / document / group_learners categories).

**Canonical E2E for §39 acceptance** — see README §1 «Канонический E2E» for the exact test file list (`business-flows.e2e.test.ts`, HTTP integration tests, role-flow tests, IAM regression). These define what «green» means for product acceptance.

## Backend conventions

- **Controller pattern**: `@Controller()` (root) + `@UseInterceptors(MvpRequestPersistenceInterceptor)` + `@UseGuards(TenantGuard)`. Endpoints add `@UseGuards(PermissionGuard) + @RequirePermissions(...)`.
- **DTO validation**: always `assertValidDto(SomeRequestClass, raw)` from `common/app-validation.pipe.ts` in the controller handler — never trust `@Body()` directly. DTOs use `class-validator` decorators (`@IsString`, `@MinLength`, `@ArrayMaxSize`, `@ValidateNested`, etc.). Bad input throws `BadRequestException` with `{ code, message }` shape.
- **Request context**: `@CurrentContext() c: RequestContext` injects `{ tenantId, userId, sessionId, requestId, correlationId, ip, userAgent }`. Pass it to service methods as last arg.
- **Audit**: every mutation writes via `this.audit(tenantId, actorId, action, entityType, entityId, oldValues, newValues, ctx, metadata?)`. Action names are dot-separated (`learning.learner_created`, `documents.group_order_issued`).
- **Errors**: throw NestJS exceptions with object form `{ code, message }` — e.g. `throw new BadRequestException({ code: 'validation_error', message: '...' })`. `HttpExceptionEnvelopeFilter` wraps to the API envelope.
- **Service instantiation in unit tests**: `new MvpService(state, tenantRepo, audit, documents, files, eventEmitter)` — 6 positional args. Use a `makeServices()` helper (see `learners-bulk-import.service.test.ts`).
- **HTTP integration tests** use a _stub controller_ pattern, not the real `MvpController`. See [`apps/backend/src/modules/mvp/mvp.http.integration.test.ts`](apps/backend/src/modules/mvp/mvp.http.integration.test.ts) — boots a minimal Nest app with a hand-rolled controller that asserts only the permission boundary. Extend that file rather than creating new ones for permission-only tests.

## Frontend conventions

- **Mutations use `useState` + async/await, NOT React Query mutations.** See `useDomainMutations` `wrap` pattern in [`apps/frontend/src/features/mvp/hooks.ts`](apps/frontend/src/features/mvp/hooks.ts:131). Reference examples: `CommissionDetailsScreen.onSaveEditInfo`, `useBulkImportMutation`.
- **`exactOptionalPropertyTypes: true`.** `{ name?: string }` does NOT accept `{ name: undefined }`. Use conditional spread: `{ name, ...(value ? { extra: value } : {}) }`.
- **No React Testing Library in deps.** «E2E» tests in [`src/e2e/`](apps/frontend/src/e2e/) are permission/routing assertions via `evaluateRouteAccess` + `getVisibleNavigation` + pure-function pipeline integration + dynamic-import smoke. Don't write `render()` tests — match the convention in `canonical-e2e-readiness.e2e.test.ts` and `admin-bulk-enrollment.e2e.test.ts`.
- **Navigation entries are data, not JSX.** Add to [`apps/frontend/src/features/navigation/model.ts`](apps/frontend/src/features/navigation/model.ts) — both `routeMeta` (access policy) and `navigationModel` (label + nav slot). `AppShell` renders them dynamically; **no per-section custom layout needed**.
- All `/admin/*` and learner cabinet pages wrap in `<ProtectedPage>` ([`src/widgets/shell/protected-page.tsx`](apps/frontend/src/widgets/shell/protected-page.tsx)) which uses `<AppShell>` (sidebar + breadcrumbs + auth check).
- **State wrappers** for screens: `PageContainer`, `PageHeader`, `SectionCard`, `SectionEmpty`, `SectionError`, `FieldError`, `LoadingState` from `src/components/`.
- **Shared UI** primitives (`DataTable`, `Column`, `StatusChip`, `FilterBar`) from `@trudskill/ui`.
- **API contract tests** stub global `fetch` with `vi.stubGlobal` and assert envelope unwrap + payload shape. See `api.contract.test.ts` per feature.

## Test categorization

Tests are NOT split by `*.unit.test.ts` / `*.integration.test.ts` filename suffix — they're categorized by **what they exercise**:

- **Service unit tests** (`*.service.test.ts`): instantiate the class directly, test pure business logic without Nest DI.
- **DTO validation** (`*.dto-validation.test.ts`): `plainToInstance` + `validateSync` — schema-level assertions.
- **HTTP integration** (`*.http.integration.test.ts`): boot a minimal NestApplication, test permission boundaries + envelope shape against a stub controller.
- **Business flow E2E** (`business-flows.e2e.test.ts` in backend): full domain flow without browser, using real services.
- **«E2E»** (frontend `src/e2e/*.e2e.test.ts`): permission routing + module smoke; NO React mount.

When adding a feature, the typical test trio: unit tests for the service, DTO validation for the request shape, HTTP integration for the new endpoint's permission boundary.

## Workflow conventions

- **Branches**: `feat/<YYYY-MM-DD>-<slug>`, `fix/...`, `chore/...`, `docs/...`. Date-prefixed.
- **Commits**: Conventional Commits enforced by `commit-msg` hook. Scope is the area: `feat(backend): ...`, `feat(frontend): ...`, `docs(plan): ...`, `chore(tooling): ...`. Use HEREDOC for multi-line messages.
- **Pre-commit** runs `lint-staged` (ESLint `--max-warnings=0 --fix --cache` + Prettier) on staged files only. Pre-existing lint failures elsewhere do NOT block your commit; check your own file with `npx eslint <path> --max-warnings=0`.
- **Pre-push** runs `pnpm typecheck` across the whole monorepo.
- **Never bypass hooks** (no `--no-verify`) unless explicitly asked. If a hook fails, fix root cause and create a new commit (not `--amend` — the failed commit didn't happen).
- **Migrations** are numbered SQL in [`apps/backend/migrations/`](apps/backend/migrations/). **Don't edit historical files.** Latest is `0038_iam_learner_role_and_seed.sql` as of 2026-05-28. Pick the next number for new ones.
- **PR description** template: `## Summary` (1-3 bullets) + `## Test plan` (checklist). PRs are squash-merged.

## Gotchas (Windows + Cyrillic path)

The repo path contains Cyrillic (`Кодинг`). This breaks:

- **Full `pnpm test:backend` crashes** during NestJS worker pool init with `tinypool` / `ERR_IPC_CHANNEL_CLOSED`. Verified pre-existing — not caused by any single change. **Workaround: run isolated files with `--no-file-parallelism`.** `mvp.domains.http.integration.test.ts` (2400 lines, ~2x other suites) is the most consistent crash candidate.
- **Don't rely on full backend suite as a local quality gate** — use isolated file runs + CI (Ubuntu, no Cyrillic, runs fine).
- Frontend full suite (`pnpm test:frontend`) **works** — only `vitest` over the heavyweight NestJS test setup crashes.

PowerShell-specific (the default shell on this machine): use `$null`, not `/dev/null`; use `$env:VAR`, not `$VAR`. Bash is available via the `Bash` tool for POSIX scripts.

## Domain-specific patterns

- **СНИЛС validation** uses ПФР checksum algorithm (sum < 100 → sum / sum ∈ {100,101} → 00 / sum > 101 → mod 101, with result ∈ {100,101} → 00). Implementation + test vectors in [`apps/backend/src/modules/mvp/learners-bulk-import.service.ts`](apps/backend/src/modules/mvp/learners-bulk-import.service.ts:48). Frontend mirror in [`apps/frontend/src/features/bulk-enrollments/validators.ts`](apps/frontend/src/features/bulk-enrollments/validators.ts) (documented deliberate duplication — extract to `shared-types` if ≥3 drift fixes).
- **ФИО parsing** assumes Russian convention `Фамилия Имя [Отчество]`. Use `parseFullName` from `learners-bulk-import.service.ts`; **do NOT** naive `name.split(' ')` (the older `MvpService.createLearner` does this and gets it wrong — use `createLearnerExtended` instead when handling Russian FIO).
- **Partial-success principle**: bulk operations (Excel imports, mass enrollments) accept valid rows and report per-row errors; never abort the whole batch on one bad row. Outcome shape: `{ total, created, reused, failed, rows: [{ rowNumber, status, ... }] }`.
- **Idempotency**: bulk endpoints take `idempotencyKey`. Outcomes are cached per `(tenantId, idempotencyKey)` in a dedicated state collection. Separate keyspaces for separate flows (`bulkImportIdempotency` ≠ `bulkEnrollmentIdempotency`). When wrapping one bulk call inside another, derive a sub-key: `${userKey}::<flow-name>`.
- **Audit log** entries have `metadata.delegated = true` when an action was performed via `learners.act_as` delegation (e.g. teacher acting on behalf of a learner).

## After every engineering session

Per [docs/DOCUMENTATION_MAP.md §agent-handoff-protocol](docs/DOCUMENTATION_MAP.md#agent-handoff-protocol):

1. Update [README.md](README.md) §2 «AI Agent State»: Current Stage / Last Completed Task / Current Task / Next Task / Last Updated At / By.
2. Append a `### 5.XX` entry to [LMS_AGENT_HANDOFF.md](LMS_AGENT_HANDOFF.md) §5 (sequentially numbered, currently up to §5.90) with: summary, files changed, test status, deviations.
3. If working from a plan in `docs/superpowers/plans/`, cross-link the plan from the handoff entry and tick off completed checkboxes in the plan file.
4. If you spawned new follow-up work (e.g. via `mcp__ccd_session__spawn_task`), mention it so the next agent doesn't duplicate it.
