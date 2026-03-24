# cdoprof monorepo platform foundation (Stage 1)

Монорепозиторий проекта СДО с единой инженерной платформой для **contracts-first** и **monorepo-first** разработки.

## Назначение

Репозиторий подготовлен как фундамент для:

- синхронной типизации frontend ↔ backend;
- API-first контрактной разработки;
- масштабирования modular monolith (`apps/backend`) в service-oriented контур;
- общей тестовой и инфраструктурной платформы.

## Карта директорий

```text
apps/
  frontend/      # Next.js web app
  backend/       # NestJS API (modular monolith baseline)
  worker/        # async jobs / queue consumers
  realtime/      # websocket / realtime runtime

packages/
  shared-types/  # cross-runtime core types
  api-contracts/ # DTO/contracts/schemas baseline
  ui/            # shared UI primitives
  test-utils/    # shared test helpers and fixtures

tooling/
  typescript/    # shared tsconfig presets (app/package/frontend)

infra/
  docker-compose.yml  # PostgreSQL, Redis, RabbitMQ, MinIO

docs/
  architecture/   # architecture notes
```

## Stack

- Node.js 22+
- pnpm workspaces
- Turborepo
- TypeScript (strict)
- ESLint (flat config) + Prettier (single root config)
- Vitest
- Husky + lint-staged
- Docker Compose (local infra)

## Установка зависимостей

```bash
pnpm install
```


> Примечание: в CI используется безопасный fallback установки зависимостей — `--frozen-lockfile` при наличии `pnpm-lock.yaml`, иначе `--no-frozen-lockfile` для bootstrap-сценария.


## Настройка окружения

1. Скопируйте общий шаблон:

```bash
cp .env.example .env
```

2. Скопируйте app-level env (при необходимости локальных overrides):

```bash
cp apps/frontend/.env.example apps/frontend/.env.local
cp apps/backend/.env.example apps/backend/.env
cp apps/worker/.env.example apps/worker/.env
cp apps/realtime/.env.example apps/realtime/.env
```

3. Проверьте env-схему:

```bash
pnpm env:check
```

## Локальная инфраструктура

```bash
pnpm docker:up
```

Поднимаются сервисы:

- PostgreSQL
- Redis
- RabbitMQ
- MinIO (S3-compatible)
- MinIO bucket initializer (`cdoprof-dev`)

Остановка:

```bash
pnpm docker:down
```

## Стандартные команды из корня

```bash
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm test:unit
pnpm build
pnpm ci:check
pnpm format
pnpm format:check
pnpm clean
```

## Локальный запуск приложений

```bash
pnpm --filter @cdoprof/frontend dev
pnpm --filter @cdoprof/backend dev
pnpm --filter @cdoprof/worker dev
pnpm --filter @cdoprof/realtime dev
```

## Commit hooks and guardrails

- `pre-commit` → `lint-staged` (ESLint + Prettier only on staged files).
- `pre-push` → `pnpm typecheck`.
- `commit-msg` → Conventional Commit format validation.

## API-first и общая типизация

- `packages/shared-types` — доменно-нейтральные типы (tenant-aware, id, audit, status, pagination).
- `packages/api-contracts` — DTO и API-контракты (общие envelope контракты + domain-папки, например `health`).
- Внутренние зависимости подключаются через `workspace:*`.
- TS aliases и project references настроены на уровне корня.

## CI quality gates

GitHub Actions workflow выполняет из корня:

1. install dependencies
2. lint
3. typecheck
4. unit tests
5. build

## Вклад в репозиторий

Перед изменениями прочитайте `CONTRIBUTING.md`.
