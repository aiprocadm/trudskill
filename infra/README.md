# Infrastructure configs

This directory contains orchestration assets for local/prod-like runs.

## Services
- PostgreSQL (`5432`)
- Redis (`6379`)
- RabbitMQ (`5672`, management `15672`)
- MinIO (`9000`, console `9001`)
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
