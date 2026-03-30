# CDOProf platform monorepo

## Services
- `apps/frontend` - Next.js UI.
- `apps/backend` - NestJS API (JSON structured logs, health probes, metrics).
- `apps/worker` - async processing worker.
- `apps/realtime` - realtime delivery service.

## Quick start
1. Copy env: `cp .env.example .env`.
2. Start infra/services: `docker compose -f infra/docker-compose.yml up -d --build`.
3. Run checks: `pnpm test`.

## Operational endpoints
- Backend: `/api/v1/health/live`, `/api/v1/health/ready`, `/api/v1/health/startup`, `/api/v1/metrics`.
- Realtime: `/health`, `/ready`.

See docs in `docs/` for deployment, observability, and backup/restore runbooks.
