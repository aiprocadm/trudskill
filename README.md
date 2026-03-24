# cdoprof monorepo (Stage 0 aligned)

Monorepo foundation for a distance-learning platform with clear runtime separation and shared contract/type layers.

## Final repository map

```text
apps/
  frontend/      # Next.js + React + TypeScript web app
  backend/       # NestJS modular-monolith core API
  worker/        # async jobs, queue consumers, heavy background processing
  realtime/      # websocket/live notifications/realtime signaling runtime

packages/
  ui/            # shared UI primitives/components
  api-contracts/ # API/WebSocket contract definitions and DTO schemas
  shared-types/  # runtime-agnostic shared domain types/enums/value objects
  test-utils/    # shared test fixtures/builders/helpers

docs/            # architecture and audit artifacts
infra/           # (reserved for future infra split; currently compose at root)
scripts/         # repository scripts/utilities
tooling/         # shared build/TS tooling presets
```

> Note: `infra/` is intentionally reserved as a future top-level technical folder; current infra bootstrap is kept in `docker-compose.yml`.

## Architecture logic

- **Single frontend** (`apps/frontend`) as the main user-facing modular web client.
- **Backend modular monolith** (`apps/backend`) as the core business/API runtime.
- **Worker contour** (`apps/worker`) for heavy async and queue/document/integration workloads.
- **Realtime contour** (`apps/realtime`) for websocket-based and live-status scenarios.
- **Shared packages** (`packages/*`) hold non-runtime-specific code reused across apps.

## Package manager and workspace

- **Package manager**: `pnpm` (single manager for the whole repository)
- **Workspace**: `pnpm-workspace.yaml`
- **Task orchestration**: `turbo.json`

## Requirements

- Node.js 22+
- pnpm 9+
- Docker + Docker Compose

## Quick start

```bash
pnpm install
cp .env.example .env
cp apps/frontend/.env.example apps/frontend/.env.local
cp apps/backend/.env.example apps/backend/.env
cp apps/worker/.env.example apps/worker/.env
cp apps/realtime/.env.example apps/realtime/.env
docker compose up -d
```

## Standard root commands

```bash
pnpm install
pnpm dev
pnpm build
pnpm lint
pnpm test
pnpm typecheck
pnpm env:check
```

## Run specific runtimes

```bash
pnpm --filter @cdoprof/frontend dev
pnpm --filter @cdoprof/backend dev
pnpm --filter @cdoprof/worker dev
pnpm --filter @cdoprof/realtime dev
```

## Environment conventions

- Root example: `.env.example`
- App examples:
  - `apps/frontend/.env.example`
  - `apps/backend/.env.example`
  - `apps/worker/.env.example`
  - `apps/realtime/.env.example`
- Root env schema check: `pnpm env:check`
- App-level fail-fast env validation lives in each app `src/env.ts`.

## Local infrastructure

```bash
docker compose up -d
```

Services:

- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`
- RabbitMQ: `localhost:5672` (management `localhost:15672`)
- MinIO S3 API: `localhost:9000` (console `localhost:9001`)

## What was consolidated in Stage 0

- Confirmed and retained canonical monorepo structure under `apps/*` and `packages/*`.
- Unified on a single package manager model (pnpm).
- Kept one root TypeScript base hierarchy (`tsconfig.base.json` + root references `tsconfig.json`).
- Kept one root lint/format baseline (`eslint.config.mjs`, `.prettierrc.json`).
- Preserved one Compose definition (`docker-compose.yml`) without duplicate variants.
- Added explicit audit report: `docs/repo-audit-stage-0.md`.

## Placement rules for new code

1. **Runtime code only in `apps/*`**
   - frontend/backend/worker/realtime concerns must stay in their dedicated runtime.
2. **Reusable code only in `packages/*`**
   - shared UI/types/contracts/test helpers must not be duplicated in apps.
3. **No legacy roots**
   - do not create parallel `frontend/`, `backend/`, `shared/` trees outside `apps/*`/`packages/*`.
4. **Infra separate from runtime**
   - infra configs go to root compose or future `infra/`; never inside runtime source trees unless runtime-specific.
5. **Config hierarchy discipline**
   - inherit from root TS/ESLint/Prettier where possible; add local overrides only when required.


## Known environment note

`pnpm-lock.yaml` is not yet committed because this execution environment cannot reach `registry.npmjs.org` for Corepack pnpm bootstrap. Generate and commit the lockfile in a network-enabled CI/dev environment as the first follow-up step.
