# Stage 0 Repository Audit (Monorepo Alignment)

_Date: 2026-03-24_

## 1) Scope and goal

This audit validates and hardens the repository for the target monorepo architecture:

- `apps/frontend`
- `apps/backend`
- `apps/worker`
- `apps/realtime`
- `packages/ui`
- `packages/api-contracts`
- `packages/shared-types`
- `packages/test-utils`

It also confirms unified engineering conventions for package management, TypeScript, lint/format, workspace orchestration, and environment handling.

## 2) Current-state inventory (as found)

### Top-level directories

- `apps/`
- `packages/`
- `docs/`
- `scripts/`
- `tooling/`

### Runtime apps (already present)

- `apps/frontend` (Next.js + React)
- `apps/backend` (NestJS)
- `apps/worker` (background runtime)
- `apps/realtime` (NestJS realtime runtime)

### Shared packages (already present)

- `packages/ui`
- `packages/api-contracts`
- `packages/shared-types`
- `packages/test-utils`

### Infra/config assets

- `docker-compose.yml` (PostgreSQL, Redis, RabbitMQ, MinIO)
- `turbo.json` (task graph)
- `pnpm-workspace.yaml` (workspace layout)
- `eslint.config.mjs` + `.prettierrc.json` (single root formatter/linter setup)
- `tsconfig.base.json` + root `tsconfig.json` references (single base TS hierarchy)

## 3) Problems discovered during audit

1. **No committed lockfile**:
   - `packageManager` is pinned to pnpm in root `package.json`, but `pnpm-lock.yaml` is still missing.
   - Attempting to generate it failed in this environment due blocked access to `registry.npmjs.org` via Corepack/pnpm bootstrap.
   - Risk: lower reproducibility for CI and local installs until lockfile is generated in a network-enabled environment.

2. **Potential ambiguity in repository navigation docs**:
   - Existing README was concise and did not explicitly document audit outcomes, placement rules, and structural governance in one place.

3. **No hard architectural blockers found**:
   - Target `apps/*` and `packages/*` structure already existed and matched Stage 0 goals.
   - No conflicting npm/yarn lockfiles were present.
   - No duplicate root ESLint/Prettier baselines were detected.

## 4) Mapping: "as-is" → "target"

| Target path | Source status | Decision |
|---|---|---|
| `apps/frontend` | Already present | Keep as canonical frontend runtime |
| `apps/backend` | Already present | Keep as canonical API/core runtime |
| `apps/worker` | Already present | Keep as canonical async/queue runtime |
| `apps/realtime` | Already present | Keep as canonical realtime runtime |
| `packages/ui` | Already present | Keep as shared UI layer |
| `packages/api-contracts` | Already present | Keep as contract layer |
| `packages/shared-types` | Already present | Keep as shared type layer |
| `packages/test-utils` | Already present | Keep as shared test helper layer |

## 5) What was changed in Stage 0 hardening

1. **Repository navigation/governance documentation improved**
   - README rewritten to include:
     - final monorepo tree,
     - purpose of each app/package,
     - standard commands,
     - placement rules for future modules,
     - explicit Stage 0 cleanup summary.

2. **Audit artifact added**
   - This document (`docs/repo-audit-stage-0.md`) records findings, decisions, and residual risks.

## 6) Unified conventions (final)

- **Package manager**: pnpm (single manager), lockfile generation pending due environment network restrictions.
- **Workspace model**: `pnpm-workspace.yaml` + Turbo tasks.
- **TypeScript**:
  - root base config: `tsconfig.base.json`;
  - root references config: `tsconfig.json`;
  - per-app/per-package tsconfig extends shared templates in `tooling/typescript`.
- **Lint/format**:
  - root `eslint.config.mjs` (flat config);
  - root `.prettierrc.json`.
- **Tests**:
  - unified via Vitest + Turbo task orchestration.
- **Env conventions**:
  - root `.env.example` + per-app `.env.example` files.
- **Infra**:
  - single `docker-compose.yml` retained.

## 7) Removed / merged / excluded legacy

- Conflicting lockfiles: **none found**.
- Duplicate root lint/format baselines: **none found**.
- Conflicting root TS baseline configs: **none found**.
- Redundant compose variants: **none found**.
- Legacy app/package trees outside target map: **none found**.

## 8) Residual risks / technical debt after Stage 0

1. **Bootstrap maturity**:
   - Current app/package implementations are intentionally minimal smoke scaffolds.
   - Domain modules, transport boundaries, and production build pipelines will be expanded in subsequent stages.

2. **Contract pipeline depth**:
   - `packages/api-contracts` exists structurally; full OpenAPI/WS contract generation and validation pipeline still needs staged rollout.

3. **Cross-workspace constraints**:
   - Dependency boundary rules (e.g., import constraints between app/runtime and package layers) should be enforced with additional linting/policy tooling in a later stage.

## 9) Readiness verdict

✅ Repository is Stage-0 ready for continued development against the target architecture:

- canonical monorepo paths are in place,
- workspace orchestration is unified,
- documentation and audit traceability are updated,
- lockfile generation is the only remaining environment-blocked item.
