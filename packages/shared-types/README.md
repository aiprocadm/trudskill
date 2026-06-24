# @trudskill/shared-types

Общий foundation-слой типов для frontend, backend, worker, realtime и test-utils.

## Что внутри

- Платформенные типы: ids, audit/meta, pagination, filters, sorting.
- Доменные базовые enum-статусы (user/enrollment/async/document/...)
- Tenant-aware типы: `TenantId`, `TenantScopedEntity`, `ActorRef`, `AuditMeta`.
- Lookup и file/task reference модели.

## Как добавлять типы

- Новые enum/status: `src/enums/*` и `src/status/*`.
- Новые audit/meta типы: `src/audit/*`.
- Новые кросс-доменные модели по тематическим подпапкам (`tenant`, `pagination`, `tasks` и т.д.).

## Ограничения

- Импортировать только из публичного `@trudskill/shared-types`.
- Не размещать здесь persistence-сущности БД.
- Не добавлять бизнес-логику доменных модулей.
