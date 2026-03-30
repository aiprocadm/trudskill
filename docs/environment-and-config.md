# Environment and config

Configuration is validated via Zod at startup (fail-fast).

## Required (runtime)
- `DATABASE_URL`, `REDIS_URL`, `RABBITMQ_URL`
- `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`
- `AUTH_JWT_SECRET`, `SESSION_SECRET`, `REALTIME_PUBLISH_KEY`

## Optional/defaulted
- `BACKEND_PORT`, `REALTIME_PORT`, `WORKER_CONCURRENCY`, TTL values.
- `DB_MIGRATIONS_ENABLED=true` (backend applies SQL migrations on startup).
- `DB_MIGRATIONS_DIR=migrations` (relative to service working directory; fallback is `apps/backend/migrations`).

## Health/readiness behavior
- `/health/ready` uses real dependency probes:
	- PostgreSQL: `select 1`
	- Redis: `PING`
	- RabbitMQ: AMQP connection/channel handshake
	- S3-compatible storage: AWS SDK `ListBuckets`
- For URL-based services, ensure host/port and credentials are reachable from backend runtime network namespace.

## Database runtime
- Backend `DatabaseService` uses `pg` pool and provides query/transaction API.
- Migration chain is applied once per startup into `core.schema_migrations`.
- Runtime seed migration `0010_iam_role_permissions_and_seed.sql` creates:
	- `iam.role_permissions`
	- demo tenant/settings/requisites baseline
	- baseline IAM users/roles/permissions/role bindings

## Security notes
- Production must not use development secrets.
- Logs use redaction for token/password/secret-like fields.
