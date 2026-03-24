# Infrastructure configs

This directory contains infrastructure and runtime-independent local orchestration assets.

## Contents

- `docker-compose.yml` — local dependencies for development (PostgreSQL, Redis, RabbitMQ, MinIO).

## Usage

```bash
docker compose -f infra/docker-compose.yml up -d
docker compose -f infra/docker-compose.yml down
```
