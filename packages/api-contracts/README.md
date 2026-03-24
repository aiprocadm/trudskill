# @cdoprof/api-contracts

Единый API-first контрактный слой monorepo.

## Кто потребляет

- `apps/backend` как источник truth для REST/WS/webhook контрактов.
- `apps/frontend` через generated типы и клиент.
- `apps/worker`, `apps/realtime`, `packages/test-utils` для контрактных проверок и событий.

## Scope

- Версионированный OpenAPI skeleton с префиксом `/api/v1`.
- Общие response/error/meta контракты.
- Конвенции DTO нейминга и error-code каталога.
- Заготовки под REST, WebSocket и webhooks.

## Versioning и deprecation

- Версионирование через URI-префикс (`/api/v1`).
- Deprecated поля/эндпоинты объявляются заранее и поддерживаются минимум один минорный релиз.

## Скрипты

- `pnpm contracts:lint` — базовые проверки структуры и `/api/v1`.
- `pnpm contracts:build` — сборка пакета.
- `pnpm contracts:typecheck` — проверка типов.
- `pnpm contracts:generate` — генерация артефактов для frontend-потребления (`src/generated/*`).
- `pnpm --filter @cdoprof/api-contracts contracts:check-generated` — проверка целостности generated-файлов (marker + SHA256 source hash).

## Как расширять

1. Добавить/обновить схемы в `src/openapi/openapi.v1.json` и/или `src/*`.
2. Добавить доменную группу в `src/domains/*`.
3. Запустить `pnpm contracts:generate`.
4. Проверить `pnpm contracts:lint && pnpm contracts:typecheck`.

## Правила

- Не дублировать persistence-модели БД в 1:1.
- Доменные контракты добавлять в `src/domains/*` по группам.
- Generated-файлы в `src/generated/*` не редактировать вручную: hash-маркер в CI проверяет актуальность после `contracts:generate`.
