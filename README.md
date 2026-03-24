# cdoprof monorepo platform foundation (Stage 2)

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
  frontend/
  backend/
  worker/
  realtime/

packages/
  shared-types/  # cross-runtime platform/domain foundation types
  api-contracts/ # versioned OpenAPI skeleton + envelope/error/meta contracts
  ui/            # shared UI tokens/primitives/components/patterns
  test-utils/    # shared factories/fixtures/integration/e2e/contract helpers
```

## Стандартные команды из корня

```bash
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm contracts:lint
pnpm contracts:typecheck
pnpm contracts:build
pnpm contracts:generate
```

## Пакеты foundation-слоя

### `@cdoprof/api-contracts`

- источник правды для API-контрактов (`/api/v1`), response/error/meta envelope;
- подготовка к расширению под REST + WebSocket + webhooks + async tasks;
- generated артефакты располагаются в `packages/api-contracts/src/generated/*`.

### `@cdoprof/shared-types`

- общие enum, status models, tenant-aware и audit/meta типы;
- базовые pagination/filter/sort/file/task/lookup типы;
- используется frontend/backend/worker/realtime и test-utils.

### `@cdoprof/test-utils`

- factories/fixtures/auth helpers;
- integration/e2e bootstrap и contract assertion helpers;
- общие mocks/stubs для queues/files/websocket/async tasks.

### `@cdoprof/ui`

- design tokens + layout primitives;
- базовые reusable компоненты и registry patterns;
- status-aware и role-aware foundation для экранов реестров/карточек/мастеров.

## Слои и зависимости

- `apps/*` могут зависеть от `packages/*`;
- `packages/ui` зависит только от shared foundation (`shared-types`) и React;
- `packages/shared-types` не зависит от app/domains logic;
- API contracts не должны повторять persistence-модели БД 1:1.

## Обновление контрактов и генерация

1. Изменить OpenAPI skeleton / контракты в `packages/api-contracts/src/*`.
2. Выполнить `pnpm contracts:generate`.
3. Проверить `pnpm contracts:lint && pnpm contracts:typecheck`.
4. Использовать generated артефакты централизованно из `@cdoprof/api-contracts`.

## Вклад в репозиторий

Перед изменениями прочитайте `CONTRIBUTING.md`.
