# @cdoprof/api-contracts

Единый API-first контрактный слой monorepo.

## Scope

- Источник правды для `/api/v1` (OpenAPI skeleton).
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

## Правила

- Не дублировать persistence-модели БД в 1:1.
- Доменные контракты добавлять в `src/domains/*` по группам.
- Generated-файлы не редактировать вручную.
