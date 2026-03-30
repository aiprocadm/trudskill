# Local development

1. `cp .env.example .env`
2. `pnpm install`
3. `docker compose -f infra/docker-compose.yml up -d postgres redis rabbitmq minio minio-init`
4. Start services:
   - backend: `pnpm --filter @cdoprof/backend dev`
   - worker: `pnpm --filter @cdoprof/worker dev`
   - realtime: `pnpm --filter @cdoprof/realtime dev`
   - frontend: `pnpm --filter @cdoprof/frontend dev`
