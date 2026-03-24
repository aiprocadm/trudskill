# @cdoprof/test-utils

Общий пакет тестовых утилит для unit/integration/e2e/contract тестов.

## Содержимое

- `factories/*`: базовые фабрики сущностей (tenant/user/role/learner/course/group/enrollment/task/document).
- `fixtures/*`: auth/tenant/reference-data фикстуры.
- `auth/*`, `tenant/*`: tenant-aware auth helpers (`createTestTenant`, `createTestUser`, `authAs`, `authHeaders`, `idempotencyKey`, `requestId`).
- `integration/*`, `e2e/*`: bootstrap/cleanup/API helpers.
- `contracts/*`: проверки стандартного response envelope.
- `mocks/*`: очереди/файлы/websocket/async task моки.
