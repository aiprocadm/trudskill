# Local development

1. `cp .env.example .env` — переменные для бэкенда, очереди и инфраструктуры.
2. `cp apps/frontend/.env.example apps/frontend/.env` — **отдельный шаг для фронтенда.**
   Next.js читает переменные только из своей папки, поэтому корневой `.env` ему не подходит:
   без этого файла `pnpm --filter @trudskill/frontend build` падает на разборе переменных
   (журнал расхождений, запись 20).
3. `pnpm install`
4. `docker compose -f infra/docker-compose.yml up -d postgres redis rabbitmq minio minio-init`
5. Start services:
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
