# Environment and config

Configuration is validated via Zod at startup (fail-fast).

## Profiles (explicit)

- `DEPLOYMENT_PROFILE` is mandatory and must be one of: `dev`, `staging`, `prod`.
- `prod` profile is fail-fast: service startup stops if production invariants are violated.
- `NODE_ENV=production` must match `DEPLOYMENT_PROFILE=prod`.

## Required (runtime)

- Core dependencies: `DATABASE_URL`, `REDIS_URL`, `RABBITMQ_URL`.
- Storage: `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`.
- Realtime/webhook: `REALTIME_PUBLISH_KEY`, `INTEGRATION_WEBHOOK_SECRET`.

## Secrets provider abstraction

- `SECRETS_PROVIDER` supports `env`, `vault`, `kms`.
- Critical runtime keys (`auth.jwt`, `session.cookie`) are loaded through provider abstraction with version pinning:
  - `AUTH_JWT_SECRET_KEY_REF` + `AUTH_JWT_SECRET_VERSION`
  - `SESSION_SECRET_KEY_REF` + `SESSION_SECRET_VERSION`
- Rotation policy controls: `SECRET_ROTATION_MAX_AGE_DAYS` and rotation hooks in `SecretsService`.
- For production (`DEPLOYMENT_PROFILE=prod`), `SECRETS_PROVIDER=env` is forbidden.

## Optional/defaulted

- `BACKEND_PORT`, TTL values.
- `DB_MIGRATIONS_ENABLED=true` (backend applies SQL migrations on startup).
- `DB_MIGRATIONS_DIR=migrations` (relative to service working directory; fallback is `apps/backend/migrations`).
- Readiness thresholds:
  - `READINESS_QUEUE_BACKLOG_THRESHOLD`
  - `READINESS_QUEUE_LAG_SECONDS_THRESHOLD`
  - `READINESS_OUTBOX_BACKLOG_THRESHOLD`

## Health/readiness behavior

- `/health/ready` uses real dependency probes:
  - PostgreSQL connectivity (`select 1`) + migrations state (`core.schema_migrations` vs files in migrations dir)
  - Redis `PING`
  - RabbitMQ AMQP handshake + queue backlog/lag over `integrations.sync_jobs`
  - S3-compatible storage via AWS SDK `ListBuckets`
  - Outbox backlog over `integrations.dead_letters`
- Exceeded thresholds or failed probes switch readiness to `503 Service Unavailable`.

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
