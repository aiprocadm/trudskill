# cdoprof monorepo foundation (Stage 0)

TypeScript-first monorepo foundation for a distance-learning platform.

## Monorepo structure

```text
apps/
  frontend/   # Next.js app
  backend/    # NestJS API app
  worker/     # background jobs runtime
  realtime/   # websocket/realtime runtime

packages/
  ui/           # shared UI building blocks
  api-contracts/# shared transport contracts and DTO shapes
  shared-types/ # shared domain and utility types
  test-utils/   # shared test fixtures/helpers
```

## Requirements

- Node.js 22+
- pnpm 9+
- Docker + Docker Compose

## Installation

```bash
pnpm install
cp .env.example .env
cp apps/frontend/.env.example apps/frontend/.env.local
cp apps/backend/.env.example apps/backend/.env
cp apps/worker/.env.example apps/worker/.env
cp apps/realtime/.env.example apps/realtime/.env
```

## Local infrastructure

```bash
docker compose up -d
```

Services:

- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`
- RabbitMQ: `localhost:5672` (management `localhost:15672`)
- MinIO S3 API: `localhost:9000` (console `localhost:9001`)

## Environment management

- Root env schema check: `pnpm env:check`
- Root example: `.env.example`
- App examples:
  - `apps/frontend/.env.example`
  - `apps/backend/.env.example`
  - `apps/worker/.env.example`
  - `apps/realtime/.env.example`
- App-level fail-fast validation:
  - `apps/frontend/src/env.ts`
  - `apps/backend/src/env.ts`
  - `apps/worker/src/env.ts`
  - `apps/realtime/src/env.ts`

## Run applications

Run all apps in parallel:

```bash
pnpm dev
```

Run specific app:

```bash
pnpm --filter @cdoprof/frontend dev
pnpm --filter @cdoprof/backend dev
pnpm --filter @cdoprof/worker dev
pnpm --filter @cdoprof/realtime dev
```

## Quality gates

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Git hooks

`husky` + `lint-staged` run on pre-commit and validate conventional commits on commit-msg.
