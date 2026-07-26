# Infrastructure configs

This directory contains orchestration assets for local/prod-like runs.

## Services

- PostgreSQL (`5432`)
- Redis (`6379`)
- RabbitMQ (`5672`, management `15672`)
- MinIO (`9000`, console `9001`)
- ClamAV (`3310`) — antivirus for uploads; dev backend keeps `ANTIVIRUS_ENABLED=false` (Noop), prod enables it via `.env.production`
- Gotenberg (internal `3000`) — DOCX→PDF for the render engine (Фаза 1); no host port
- Backend (`3001`)
- Realtime (`3002`)
- Worker (background)

## Start

```bash
docker compose -f infra/docker-compose.yml up -d --build
```

## Stop

```bash
docker compose -f infra/docker-compose.yml down
```

All service logs are emitted to stdout/stderr in JSON-friendly format.
