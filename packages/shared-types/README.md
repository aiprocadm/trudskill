# @cdoprof/shared-types

Общий foundation-слой типов для всех приложений monorepo: frontend, backend, worker, realtime и test utilities.

## Что внутри

- Платформенные типы: ids, request/meta, pagination, filters, sorting.
- Доменные базовые enum-статусы (user/enrollment/async/document/...).
- Tenant-aware типы: `TenantId`, `TenantScopedEntity`, `ActorRef`, `AuditMeta`.
- Lookup и file/task reference модели.

## Использование

- Импортировать только из публичного `@cdoprof/shared-types`.
- Новые enum/status добавлять в `src/enums`.
- Новые кросс-доменные модели добавлять по подпапкам (`core`, `tenant`, `pagination` и т.д.).
- Не размещать здесь persistence-сущности БД и бизнес-логику модулей.
