# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository

CDOProf — LMS/СДО platform for regulated professional education (ОТ, ПБ, медицина, МЧС, обязательные аттестации). `pnpm` + Turborepo monorepo on Windows path with Cyrillic (`D:\Кодинг\cdoprof--main\cdoprof--main`).

## Documentation hierarchy (SSOT)

When docs disagree, follow the order in [docs/DOCUMENTATION_MAP.md](docs/DOCUMENTATION_MAP.md):

1. Customer-signed protocol (e.g. ТЗ §47 Appendix Б).
2. [SDOPROF_TZ_FINAL.md](SDOPROF_TZ_FINAL.md) — product spec / acceptance.
3. Code + tests; described in [LMS_AGENT_HANDOFF.md](LMS_AGENT_HANDOFF.md) and [docs/TZ_MVP_TRACEABILITY.md](docs/TZ_MVP_TRACEABILITY.md).
4. [README.md](README.md) §2 «AI Agent State» — operational snapshot.

For «продолжай по ТЗ» tasks, read in this order:
README §2 → LMS_AGENT_HANDOFF §1 (date/branch) + §5 (recent work) + §13 (Known Issues) → SDOPROF_TZ_FINAL §41 (backlog) cross-referenced with TZ_MVP_TRACEABILITY (BL → file paths).

The active V1 plan and per-phase plans live under [docs/superpowers/plans/](docs/superpowers/plans/) — those are the implementation playbooks. Phase 1 + Pillar A are merged; Phase 2 Plan A is in PRs #191-#195 as of 2026-05-29.

## Commands

Everything runs from repo root.

```bash
pnpm ci:check            # lint + typecheck + contracts + tests + build (full gate)
pnpm typecheck           # turbo typecheck (8 tasks, cached)
pnpm lint                # turbo lint (uses next lint for frontend)
pnpm test                # turbo test (all projects)
pnpm test:backend        # vitest --project @cdoprof/backend
pnpm test:frontend       # vitest --project @cdoprof/frontend
pnpm test:contracts      # vitest --project @cdoprof/api-contracts
pnpm test:integration    # backend integration suite
pnpm test:migrations     # SQL migration tests

# Run a single test file (the only reliable way on Windows — see Gotchas):
pnpm --filter @cdoprof/backend exec vitest run src/modules/<path>.test.ts --no-file-parallelism
pnpm --filter @cdoprof/frontend exec vitest run src/<path>.test.ts --no-file-parallelism

pnpm dev:stack           # docker compose infra + backend + frontend dev
pnpm docker:infra        # postgres + redis + rabbitmq + minio + supertokens only
```

CI (`.github/workflows/ci.yml`) runs `pnpm lint`, `pnpm typecheck`, backend tests, frontend tests, contracts tests, and Python tests in parallel jobs.

## Architecture

**Monorepo structure** (don't deep-import — go through workspace package entrypoints):

- `apps/backend` — NestJS API. Module-per-domain under `src/modules/` (`iam`, `mvp`, `documents`, `esign`, `communication`, `integrations`, `audit`, `org`, `files`, `health`).
- `apps/frontend` — Next.js 15 App Router + TypeScript. Pages in `app/`, features in `src/features/<domain>/` (each has `api.ts`, `hooks.ts`, `types.ts`, `screens.tsx`).
- `apps/realtime` / `apps/worker` — separate Node services.
- `packages/api-contracts` — DTO + generated OpenAPI/Zod schemas. Don't edit `src/generated/*` by hand.
- `packages/shared-types` — runtime-agnostic types shared across apps.
- `packages/ui` — shared UI primitives (`DataTable`, `Column`, etc.) imported as `@cdoprof/ui`.

**Multi-tenant** with strict tenant isolation. Backend uses `TenantGuard` + `PermissionGuard` + `RequirePermissions(...)` decorator. Every entity has `tenantId`, `createdAt`, `updatedAt`, `status` via `BaseEntity`.

**Request-scoped state** in MVP module: `MvpService` and `InMemoryMvpState` are `Scope.REQUEST`. Use `MvpRequestPersistenceInterceptor` to persist mutations at request end. **If you add a new in-memory collection, register it in [`apps/backend/src/modules/mvp/infrastructure/mvp-collections.ts`](apps/backend/src/modules/mvp/infrastructure/mvp-collections.ts)** — otherwise it's lost between HTTP requests (caught Pillar A Plan A Task 10).

**API envelope.** All responses wrap `{ data, meta: { requestId, correlationId, timestamp } }`. Errors: `{ error: { code, message }, meta }`. Frontend `apiRequest` from `src/lib/api/client.ts` unwraps automatically; tests assert against the envelope shape.

**Persistence backend abstraction** in MVP: `MVP_PERSISTENCE_BACKEND` token has memory + Postgres implementations selected via env. Bulk load/save tenant state at request boundary, not per-call.

**Documents pipeline** (`apps/backend/src/modules/documents/`): templates → variables → bindings → numbering → generated_documents → listener issues docs on enrollment completion. Pillar A Plan A merged the «document set per course» extension; resolvers are pure functions in `pillar-a-variables.ts`.

**Canonical E2E for §39 acceptance** — see README §1 «Канонический E2E» for the exact test file list (`business-flows.e2e.test.ts`, HTTP integration tests, role-flow tests, IAM regression). These are the source of truth for what «green» means.

## Frontend conventions

- **Mutations use `useState` + async/await, NOT React Query mutations.** See `useDomainMutations` wrap pattern in [`apps/frontend/src/features/mvp/hooks.ts`](apps/frontend/src/features/mvp/hooks.ts). Examples in `CommissionDetailsScreen`, `BulkImportScreen`.
- **`exactOptionalPropertyTypes: true`.** `{ name?: string }` does NOT accept `{ name: undefined }`. Use conditional spread: `{ name, ...(value ? { extra: value } : {}) }`.
- **No React Testing Library in deps.** «E2E» tests in `src/e2e/` are permission/routing assertions via `evaluateRouteAccess` + `getVisibleNavigation` + pure-function pipeline + dynamic-import smoke. Don't write `render()` tests — match the existing convention (see `canonical-e2e-readiness.e2e.test.ts`).
- **Navigation entries are data, not JSX.** Add to [`apps/frontend/src/features/navigation/model.ts`](apps/frontend/src/features/navigation/model.ts) — both `routeMeta` (access policy) and `navigationModel` (label + nav slot). `AppShell` renders them dynamically.
- All `/admin/*` and learner cabinet pages wrap in `<ProtectedPage>` which uses `<AppShell>` (sidebar + breadcrumbs).
- **State wrappers** for screens: `PageContainer`, `PageHeader`, `SectionCard`, `SectionEmpty`, `SectionError`, `FieldError` from `src/components/`.

## Workflow conventions

- **Branches**: `feat/<YYYY-MM-DD>-<slug>`, `fix/...`, `chore/...`. Date-prefixed.
- **Commits**: Conventional Commits enforced by `commit-msg` hook. Prefix scope: `feat(backend): ...`, `feat(frontend): ...`, `docs(plan): ...`.
- **Pre-commit** runs `lint-staged` (ESLint `--max-warnings=0 --fix` + Prettier) on staged files only. Pre-existing lint failures elsewhere do NOT block commits — but the full `pnpm lint` may fail; check with `npx eslint <your-file> --max-warnings=0` to scope.
- **Pre-push** runs `pnpm typecheck` across the whole monorepo.
- Never bypass hooks (no `--no-verify`) unless explicitly asked.
- Migrations are numbered SQL in [`apps/backend/migrations/`](apps/backend/migrations/). Don't edit historical files. Latest is `0038_iam_learner_role_and_seed.sql` as of 2026-05-28.

## Gotchas (Windows + Cyrillic path)

The repo lives at `D:\Кодинг\cdoprof--main\cdoprof--main`. The Cyrillic path triggers:

- **Full `pnpm test:backend` crashes** with `tinypool` / `ERR_IPC_CHANNEL_CLOSED` during NestJS worker pool initialization. Verified pre-existing — not caused by any single change. **Workaround: run isolated files with `--no-file-parallelism`.** `mvp.domains.http.integration.test.ts` (2400 lines) is the most consistent crash candidate.
- Don't rely on full backend test suite as a quality gate locally; rely on isolated runs + CI (which runs on Ubuntu without Cyrillic paths).
- Single test file runs work fine. Frontend full suite (`pnpm test:frontend`) works fine — it's only `vitest` over the backend's heavyweight NestJS test setup that crashes.

## Domain-specific patterns

- **СНИЛС validation** uses ПФР checksum algorithm (sum < 100 / sum == 100|101 → 00 / sum > 101 → mod 101 with 100/101 → 00). Implementation + test vectors in [`apps/backend/src/modules/mvp/learners-bulk-import.service.ts`](apps/backend/src/modules/mvp/learners-bulk-import.service.ts) and mirrored on frontend.
- **ФИО parsing** assumes Russian convention `Фамилия Имя [Отчество]`. Use `parseFullName` from `learners-bulk-import.service.ts`; do NOT naive `split(' ')`.
- **Partial-success principle**: bulk operations (Excel imports, mass enrollments) accept valid rows and report per-row errors; never abort the whole batch on one bad row.
- **Idempotency**: bulk endpoints take `idempotencyKey`. Outcomes are cached per `(tenantId, idempotencyKey)` in a dedicated state collection. Separate keyspaces for separate flows (e.g. `bulkImportIdempotency` ≠ `bulkEnrollmentIdempotency`).

## After every engineering session

Per [docs/DOCUMENTATION_MAP.md §agent-handoff-protocol](docs/DOCUMENTATION_MAP.md#agent-handoff-protocol):

1. Update [README.md](README.md) §2 «AI Agent State» (Current Stage / Last Completed Task / Current Task / Next Task / Last Updated At).
2. Add a `§5.XX` entry to [LMS_AGENT_HANDOFF.md](LMS_AGENT_HANDOFF.md) with files changed + test status.
3. Cross-link to plan documents if working from one.
