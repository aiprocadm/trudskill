# cdoprof monorepo — Stage 0 (repository architecture aligned)

Монорепозиторий подготовлен под целевую архитектуру платформы дистанционного обучения: единый frontend, backend как modular monolith, выделенные worker/realtime runtime-контуры и общие пакеты контрактов/типов/UI/test-utils.

## Итоговая карта репозитория

```text
apps/
  frontend/      # Next.js + React + TypeScript
  backend/       # NestJS modular monolith (core API/business)
  worker/        # очереди, фоновые задачи, тяжелые async-процессы
  realtime/      # websocket/live-notifications/realtime signaling

packages/
  ui/            # shared UI primitives/components
  api-contracts/ # API/WebSocket contracts + DTO schemas
  shared-types/  # runtime-agnostic domain types/enums/value objects
  test-utils/    # общие фикстуры, builders, mocks, helpers

docs/            # архитектура и аудит
infra/           # инфраструктурные артефакты (docker compose и т.п.)
scripts/         # служебные скрипты репозитория
tooling/         # общие шаблоны/пресеты tooling (TS и т.д.)
```

## Архитектурная логика

- `apps/frontend` — единое web-приложение (app shell + доменные модули интерфейса).
- `apps/backend` — серверное ядро в модели modular monolith.
- `apps/worker` — тяжелые асинхронные сценарии (jobs, imports/exports, document-heavy задачи).
- `apps/realtime` — realtime-коммуникации, статусы, уведомления и signaling.
- `packages/*` — общий код, не привязанный к конкретному runtime.

## Базовые инженерные соглашения

- **Package manager:** `pnpm` (единый для всего монорепозитория).
- **Workspace:** `pnpm-workspace.yaml`.
- **Task runner:** `turbo` (`turbo.json`).
- **TypeScript:** `tsconfig.base.json` (база) + root `tsconfig.json` (references).
- **Lint/format:** root `eslint.config.mjs` + `.prettierrc.json`.

## Требования окружения

- Node.js 22+
- pnpm 9+
- Docker + Docker Compose

## Быстрый старт

```bash
pnpm install
cp .env.example .env
cp apps/frontend/.env.example apps/frontend/.env.local
cp apps/backend/.env.example apps/backend/.env
cp apps/worker/.env.example apps/worker/.env
cp apps/realtime/.env.example apps/realtime/.env

docker compose -f infra/docker-compose.yml up -d
```

## Стандартные команды из корня

```bash
pnpm install
pnpm dev
pnpm build
pnpm lint
pnpm test
pnpm typecheck
pnpm env:check
```

## Точечный запуск runtime-контуров

```bash
pnpm --filter @cdoprof/frontend dev
pnpm --filter @cdoprof/backend dev
pnpm --filter @cdoprof/worker dev
pnpm --filter @cdoprof/realtime dev
```

## Env/config conventions

- Корневой шаблон: `.env.example`.
- Runtime-шаблоны:
  - `apps/frontend/.env.example`
  - `apps/backend/.env.example`
  - `apps/worker/.env.example`
  - `apps/realtime/.env.example`
- Проверка env-схемы: `pnpm env:check`.

## Что сделано в Stage 0

- Подтверждена и закреплена целевая структура `apps/*` и `packages/*`.
- Зафиксирован единый workspace и оркестрация задач.
- Подтверждена единая иерархия TS/ESLint/Prettier-конфигов.
- Проверено отсутствие конкурирующих lock-файлов (`package-lock.json`, `yarn.lock`) в репозитории.
- Обновлён аудит-отчет: `docs/repo-audit-stage-0.md`.

## Правила размещения нового кода

1. **Runtime-код — только в `apps/*`**.
2. **Shared-код — только в `packages/*`**.
3. **Без legacy-параллельных деревьев** (`frontend/`, `backend/`, `shared/` в корне запрещены).
4. **Infra отдельно от runtime** (`infra/` не смешивать с приложениями).
5. **Наследование root-конфигов обязательно**, локальные overrides — только при необходимости.

## Примечание по lockfile

В текущем окружении не удалось сгенерировать `pnpm-lock.yaml`, потому что Corepack не может скачать pinned-версию `pnpm` из `registry.npmjs.org` (HTTP tunneling proxy 403). Сгенерируйте и закоммитьте lockfile в CI/окружении с доступом к npm registry.
