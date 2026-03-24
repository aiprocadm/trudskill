# @cdoprof/test-utils

Общий пакет тестовых утилит для unit/integration/e2e/contract тестов.

## Содержимое

- `factories/*`: базовые фабрики сущностей (tenant/user/role/learner/course/group/enrollment/task/document).
- `fixtures/*`: auth/tenant/reference-data фикстуры.
- `auth/*`, `tenant/*`: tenant-aware auth helpers (`createTestTenant`, `createTestUser`, `authAs`, `authHeaders`, `idempotencyKey`, `requestId`).
- `integration/*`, `e2e/*`: bootstrap/cleanup/API helpers и request builders.
- `contracts/*`: проверки единых response/error envelope.
- `mocks/*`: очереди/файлы/websocket/async task моки.

## Конвенции test data

- Каждая фабрика должна по умолчанию создавать tenant-safe тестовые объекты.
- RBAC сценарии проверяются через `authAs(role)` и `authHeaders(role)`.
- Contract assertions используются для проверок единых DTO envelope до предметной валидации.
