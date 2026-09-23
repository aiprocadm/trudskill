# Environment and config

> **Имена переменных переименованы (`BR-031`, 08.09.2026): `CDOPROF_*` → `TRUDSKILL_*`.** Скрипты пока читают ОБА имени и предупреждают о прежнем — чтобы уже настроенный сервер не потерял настройку молча. Обновите `.env.production` и задания cron; поддержка прежних имён временная.

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
- `SECRETS_PROVIDER=env` **is permitted in every profile, including `prod`** — модель развёртывания одиночная (VPS), внешнего менеджера секретов нет. Запрет, стоявший здесь до 31.08.2026, коду противоречил (см. `env.schema.ts`, комментарий к строгим профилям) и расходился с `infra/.env.production.example`, где отгружается ровно `SECRETS_PROVIDER=env` (журнал 317). Слабые и дефолтные значения секретов запрещены при ЛЮБОМ провайдере.
- `vault` и `kms` не ходят во внешнее хранилище: значения зеркалируются в окружение под префиксом (`VAULT_SECRET_AUTH_JWT_V1`, `KMS_SECRET_SESSION_COOKIE_V1`) чем-то внешним. Именно эти переменные и требует проверка при старте; адрес и токен хранилища приложение не читает и больше не просит (журнал 316).

## Optional/defaulted

- `BACKEND_PORT`, TTL values.
- `DB_MIGRATIONS_ENABLED=true` (backend applies SQL migrations on startup).
- `DB_MIGRATIONS_DIR=migrations` (relative to service working directory; fallback is `apps/backend/migrations`).
- Readiness thresholds:
  - `READINESS_QUEUE_BACKLOG_THRESHOLD`
  - `READINESS_QUEUE_LAG_SECONDS_THRESHOLD`
  - `READINESS_OUTBOX_BACKLOG_THRESHOLD`
- Слой хранения домена (Фаза 1 ТЗ перехода с CDOPROF):
  - `LMS_READ_MODEL=legacy|normalized|shadow` — откуда читать JSON-снимок центра (`normalized` = зеркало stage1; смысл не менялся, РМ32); `LMS_DUAL_WRITE_ENABLED` — писать снимок в обе таблицы.
  - `LMS_NORMALIZED_COLLECTIONS` — коллекции, которые читаются из нормализованных таблиц, через запятую (`groups,counterparties,learners,enrollments`); по умолчанию пусто — всё из снимка. Порядок включения: бэкфилл `POST /migration/backfill/runs/start` `{ "domain": "lms_normalized" }` → зелёный отчёт сверки → флаг. Откат — пустое значение; проекция при сохранении снимка пишет таблицы всегда (РМ35), так что данные не отстают. Неизвестное имя — ошибка старта. После миграции 0111 (срез 3b) повторить бэкфилл: колонка `linked_iam_user_id` у старых строк пуста, и слушатели под флагом `enrollments` увидели бы пусто (закрыто по умолчанию).

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

## Имена, оставленные от прежнего бренда (решение `BR-030`)

Ребрендинг CDOProf → trudskill НЕ переименовывает:

- **имя базы данных** `cdoprof` (`infra/docker-compose.yml`, строки подключения);
- **бакет объектного хранилища** `cdoprof-dev` (`DOCUMENTS_STORAGE_BUCKET`).

Это **данные, а не текст**: пользователь их не видит, а переименование требует остановки
сервиса, дампа, восстановления и правки всех строк подключения — риск потери данных при
нулевой пользе. Решение пересматривается только если появится независимая причина
мигрировать БД или хранилище.

Отдельной подкатегорией (`BR-031`, C-2) отложены переменные `CDOPROF_*` в скриптах
резервного копирования: их переименование делается **последней задачей** ребрендинга,
после успешного повторного прогона учений восстановления (`infra/restore-drill.sh`).

## Security notes

- Production must not use development secrets.
- Logs use redaction for token/password/secret-like fields.
