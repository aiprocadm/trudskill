# Environment and config

Configuration is validated via Zod at startup (fail-fast).

## Required (runtime)
- `DATABASE_URL`, `REDIS_URL`, `RABBITMQ_URL`
- `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`
- `AUTH_JWT_SECRET`, `SESSION_SECRET`, `REALTIME_PUBLISH_KEY`

## Optional/defaulted
- `BACKEND_PORT`, `REALTIME_PORT`, `WORKER_CONCURRENCY`, TTL values.

## Security notes
- Production must not use development secrets.
- Logs use redaction for token/password/secret-like fields.
