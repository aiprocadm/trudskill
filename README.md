# cdoprof monorepo foundation (Stage 0)

TypeScript-first monorepo for distance learning platform foundation.

## Structure

```text
apps/
  frontend/   # Next.js app
  backend/    # NestJS API app
  worker/     # background worker runtime
  realtime/   # realtime NestJS runtime

packages/
  ui/
  api-contracts/
  shared-types/
  test-utils/
```

## Requirements

- Node.js 22+
- pnpm 9+
- Docker + Docker Compose

## Install

```bash
pnpm install
cp .env.example .env
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

## Env management

- Root example: `.env.example`
- Global validation: `pnpm env:check`
- App-specific fail-fast validation:
  - `apps/frontend/src/env.ts`
  - `apps/backend/src/env.ts`
  - `apps/worker/src/env.ts`
  - `apps/realtime/src/env.ts`

## Run apps

```bash
pnpm dev
```

Or separately:

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

`husky` + `lint-staged` run on pre-commit and format/lint staged files.
