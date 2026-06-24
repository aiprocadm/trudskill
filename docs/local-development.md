# Local development

1. `cp .env.example .env`
2. `pnpm install`
3. `docker compose -f infra/docker-compose.yml up -d postgres redis rabbitmq minio minio-init`
4. Start services:
   - backend: `pnpm --filter @trudskill/backend dev`
   - worker: `pnpm --filter @trudskill/worker dev`
   - realtime: `pnpm --filter @trudskill/realtime dev`
   - frontend: `pnpm --filter @trudskill/frontend dev`

## Backend migration/seed behavior

- By default backend applies SQL migrations at startup (`DB_MIGRATIONS_ENABLED=true`).
- Migration chain is read from `apps/backend/migrations` (or `DB_MIGRATIONS_DIR`).
- IAM baseline seed is applied by migration `0010_iam_role_permissions_and_seed.sql`.
- Demo login defaults:
  - `tenant_admin` / `Password123!`
  - `manager` / `Password123!`
  - `methodist` / `Password123!`
