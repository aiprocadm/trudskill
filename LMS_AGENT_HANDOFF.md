# LMS Agent Handoff

## Project overview / Обзор проекта

LMS/СДО монорепозиторий на pnpm workspace + Turborepo. Основной стек: Next.js (frontend), NestJS (backend), TypeScript, Vitest, SQL-миграции в backend.

Важные директории:

- `apps/frontend` — UI, auth/navigation фичи, e2e logic-level тесты.
- `apps/backend` — модули IAM, документы, интеграции, health, audit.
- `apps/backend/migrations` — SQL-миграции.
- `packages/api-contracts`, `packages/shared-types` — контракты и общие типы.
- `docs` — архитектура, тестовые и операционные регламенты.

## Current goal / Текущая цель

Продолжить P0 итерацию IAM hardening: стабилизировать regression-пакет login/refresh/logout + role access и зафиксировать текущее состояние для следующего агента.

## Completed / Уже сделано

- [x] Проведён целевой прогон IAM + frontend role-access тестов и устранена регрессия в backend IAM тестах
  - Изменённые файлы:
    - `apps/backend/src/modules/iam/auth.integration.test.ts`
    - `apps/backend/src/modules/iam/auth.security.test.ts`
  - Что изменено:
    - В тестах добавлена явная передача `SecretsService` в `AuthService`, чтобы соответствовать актуальному конструктору сервиса и убрать падение `getJwtSigningSecret`.
  - Проверки:
    - `pnpm exec vitest run apps/backend/src/modules/iam/auth.service.test.ts apps/backend/src/modules/iam/auth.integration.test.ts apps/backend/src/modules/iam/auth.security.test.ts apps/frontend/src/e2e/role-access.e2e.test.ts apps/frontend/src/e2e/auth-routing.e2e.test.ts` — success (24/24 tests passed).

## In progress / В процессе

- [ ] Расширить regression-пакет IAM до полного smoke (включая permission guard и связанные integration сценарии HTTP-границ)
  - Что уже сделано:
    - Базовый auth flow (login/refresh/logout/logoutAll/revokeSession) и frontend role access подтверждены зелёными прогонами.
  - Что осталось:
    - Добавить/прогнать смежные guard/integration тесты и сверить покрытие по критическим permission-boundary маршрутам.

## Next tasks / Что делать дальше

- [ ] Прогнать и при необходимости стабилизировать `apps/backend/src/modules/iam/permission.guard.test.ts` + HTTP integration тесты, завязанные на permission checks.
- [ ] Выполнить более широкий `pnpm test:backend` (или эквивалентный поднабор IAM/authorization) и зафиксировать статус/ошибки.
- [ ] Обновить README `AI Agent State` после следующей функциональной итерации с датой и списком проверок.

## Important decisions / Важные решения

- Решение: Исправление сделано только в тестах, без изменения runtime-кода IAM.
- Причина: Ошибка была в несоответствии тестовой инициализации (`AuthService` требует `SecretsService`).
- Последствия: Поведение production-кода не изменено, regression-пакет снова валиден.

## Assumptions / Предположения

- Предположение: Цель текущей итерации — сначала восстановить стабильность тестового набора IAM/role-access, а не менять бизнес-логику auth.
- Почему принято: `README` в `Next Task` указывает на приоритет запуска и hardening IAM regression-проверок.

## Known issues / Известные проблемы

- Проблема: Vitest печатает deprecation warning по workspace-конфигурации.
- Где проявляется: На запуске `pnpm exec vitest run ...`.
- Возможное решение: Перенести конфигурацию на `test.projects` в root vitest config в отдельной техдолг-итерации.

## Changed files / Изменённые файлы

- `apps/backend/src/modules/iam/auth.integration.test.ts` — передача `SecretsService` в `AuthService`.
- `apps/backend/src/modules/iam/auth.security.test.ts` — передача `SecretsService` в `AuthService`.
- `LMS_AGENT_HANDOFF.md` — создан и заполнен актуальным состоянием итерации.

## Commands run / Выполненные команды

- `pwd && rg --files -g 'AGENTS.md' -g 'LMS_AGENT_HANDOFF.md' -g 'README.md'`
  - Result: success
  - Notes: Быстрая проверка наличия ключевых файлов.
- `find .. -name AGENTS.md -o -name LMS_AGENT_HANDOFF.md`
  - Result: success
  - Notes: `LMS_AGENT_HANDOFF.md` отсутствовал до текущей итерации.
- `find . -maxdepth 2 -type f (package/lock/readme/docker...)`
  - Result: success
  - Notes: Определены стек и артефакты окружения.
- `find . -maxdepth 2 -type d (frontend/backend/api/database/migrations/components/pages/routes/tests/docs)`
  - Result: success
  - Notes: Определены основные директории.
- `rg -n "iam|auth|login|refresh|logout|role access|permission" apps/backend apps/frontend --glob '*test*' --glob '*spec*'`
  - Result: success
  - Notes: Найдены целевые тесты для P0 IAM/role access.
- `pnpm exec vitest run ...` (целевой набор IAM+frontend)
  - Result: fail
  - Notes: 8 backend тестов падали с `Cannot read properties of undefined (reading 'getJwtSigningSecret')`.
- `pnpm exec vitest run ...` (повторный целевой набор IAM+frontend)
  - Result: success
  - Notes: 24/24 тестов прошли после точечного фикса тестовой инициализации.

## How to continue / Как продолжить

Стартовать с `apps/backend/src/modules/iam/permission.guard.test.ts` и связанных HTTP integration тестов (`documents/workspace`) для подтверждения permission boundaries. После прогона обновить этот handoff + `README` секцию `AI Agent State` и явно зафиксировать команду/результат следующей regression-итерации.
