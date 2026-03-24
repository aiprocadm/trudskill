# Infrastructure configs

This directory contains local orchestration assets for platform dependencies.

## Services

- PostgreSQL (`localhost:5432`)
- Redis (`localhost:6379`)
- RabbitMQ (`localhost:5672`, management `localhost:15672`)
- MinIO S3-compatible storage (`localhost:9000`, console `localhost:9001`)
- MinIO bucket initializer (`cdoprof-dev`)

## Usage

```bash
pnpm docker:up
pnpm docker:down
```

Or directly:

```bash
docker compose -f infra/docker-compose.yml up -d
docker compose -f infra/docker-compose.yml down
```

## Default local credentials

- PostgreSQL: `postgres/postgres`
- RabbitMQ: `guest/guest`
- MinIO: `minio/minio123`

These defaults are for local development only.
