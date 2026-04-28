# LMS Agent Handoff

## Project overview / Обзор проекта

LMS/СДО монорепозиторий на `pnpm` workspace + Turborepo.

- Frontend: Next.js/TypeScript (`apps/frontend`).
- Backend: NestJS/TypeScript (`apps/backend`).
- Контракты/типы: `packages/api-contracts`, `packages/shared-types`.
- Миграции: `apps/backend/migrations`.
- Документация и регламенты: `docs`, root `README.md`.

## Current goal / Текущая цель

Закрыть текущую IAM hardening-итерацию по regression smoke (permission boundary + HTTP integration) и зафиксировать оставшиеся блокеры полного `test:backend`.

## Completed / Уже сделано

- [x] Прогнан и подтверждён permission-boundary regression пакет (IAM + workspace/documents HTTP)
  - Изменённые файлы:
    - `LMS_AGENT_HANDOFF.md`
  - Что изменено:
    - Зафиксирован результат по целевым тестам permission guard + HTTP integration.
  - Проверки:
    - `pnpm exec vitest run apps/backend/src/modules/iam/permission.guard.test.ts apps/backend/src/modules/workspace/workspace.http.integration.test.ts apps/backend/src/modules/documents/documents.http.integration.test.ts` — success.

- [x] Устранены падения IAM e2e/contract тестов из-за нового обязательного `SecretsService`
  - Изменённые файлы:
    - `apps/backend/src/modules/mvp/business-flows.e2e.test.ts`
    - `apps/backend/src/modules/iam/auth.controller.contract.test.ts`
    - `apps/backend/src/modules/iam/auth.http-regression.e2e.test.ts`
  - Что изменено:
    - Обновлена тестовая инициализация `AuthService` и Nest TestModule providers с `SecretsService`.
  - Проверки:
    - `pnpm exec vitest run apps/backend/src/modules/mvp/business-flows.e2e.test.ts apps/backend/src/modules/iam/auth.controller.contract.test.ts apps/backend/src/modules/iam/auth.http-regression.e2e.test.ts` — success.

- [x] Актуализированы unit-тесты health контроллера под текущий контракт readiness
  - Изменённые файлы:
    - `apps/backend/src/modules/health/health.test.ts`
  - Что изменено:
    - Добавлены обязательные моки `SecretsService` и readiness-зависимостей БД.
    - Обновлён сценарий degraded (только Redis non-critical).
    - Обновлено ожидание ошибки на `code: readiness_failed`.
  - Проверки:
    - `pnpm exec vitest run apps/backend/src/modules/health/health.test.ts` — success.

- [x] Обновлён README `AI Agent State` после функциональной итерации
  - Изменённые файлы:
    - `README.md`
  - Что изменено:
    - Актуализированы Current Goal/Last Completed Task/Current Task/Next Task/Last Updated At.
  - Проверки:
    - N/A (документационное изменение).

## In progress / В процессе

- [ ] Добить полный `pnpm test:backend` до полностью зелёного статуса
  - Что уже сделано:
    - Исправлены IAM/health падения, ранее ронявшие тест-раннер.
  - Что осталось:
    - Разобрать и закрыть миграционный блокер в `mvp-domain-migrations.test.ts`.

## Next tasks / Что делать дальше

- [ ] Согласовать и исправить конфликт migration-chain expectations в `apps/backend/src/infrastructure/database/mvp-domain-migrations.test.ts`:
  - отсутствующий baseline `0013_learning_duration_planned_end.sql`;
  - дублирующийся migration prefix `0019_*`.
- [ ] После фикса migration-chain снова выполнить полный `pnpm test:backend` и зафиксировать итог.
- [ ] При необходимости синхронизировать `README.md` и этот handoff после устранения миграционного блока.

## Important decisions / Важные решения

- Решение: Исправлять только тестовую инициализацию/моки без изменения runtime-логики модулей.
- Причина: Падения вызваны эволюцией DI-контрактов (`SecretsService`) и readiness-контракта в тестах.
- Последствия: Поведение production-кода не изменено, regression-suite стабилизирован точечно.

## Assumptions / Предположения

- Предположение: Дубликат миграционного префикса `0019_*` может быть временным состоянием ветки и требует отдельного решения (не в рамках IAM hardening).
- Почему принято: Запрет на нецелевые изменения схем/миграций без явной необходимости и контекста бизнес-задачи.

## Known issues / Известные проблемы

- Проблема: `pnpm test:backend` всё ещё падает на `mvp-domain-migrations.test.ts` (2 assertions).
- Где проявляется: `apps/backend/src/infrastructure/database/mvp-domain-migrations.test.ts`.
- Возможное решение: Обновить baseline expectations под фактическую цепочку миграций и/или устранить дубль migration number.

- Проблема: Vitest workspace deprecation warning.
- Где проявляется: Практически на каждом запуске `pnpm exec vitest run ...`.
- Возможное решение: Мигрировать на `test.projects` в root vitest config.

## Changed files / Изменённые файлы

- `apps/backend/src/modules/mvp/business-flows.e2e.test.ts` — добавлен `SecretsService` в `AuthService` инициализацию.
- `apps/backend/src/modules/iam/auth.controller.contract.test.ts` — добавлен `SecretsService` в `AuthService` инициализацию.
- `apps/backend/src/modules/iam/auth.http-regression.e2e.test.ts` — добавлен `SecretsService` в providers тестового Nest-модуля.
- `apps/backend/src/modules/health/health.test.ts` — актуализированы моки и ожидания readiness/degraded.
- `README.md` — обновлена секция `AI Agent State`.
- `LMS_AGENT_HANDOFF.md` — синхронизировано состояние итерации.

## Commands run / Выполненные команды

- `find .. -name AGENTS.md -o -name CLAUDE.md`
  - Result: success
  - Notes: найден только `CLAUDE.md` в `node_modules`.
- `find . -maxdepth 2 -name 'LMS_AGENT_HANDOFF.md' -o -name 'README.md' -o -name 'package.json' -o -name 'pnpm-lock.yaml' -o -name 'yarn.lock' -o -name 'package-lock.json' -o -name 'pyproject.toml' -o -name 'requirements.txt' -o -name 'composer.json' -o -name 'Dockerfile' -o -name 'docker-compose.yml'`
  - Result: success
  - Notes: быстрый анализ стека.
- `rg -n "permission\.guard|permission|workspace|documents" apps/backend/src/modules --glob '*test.ts'`
  - Result: success
  - Notes: найден набор целевых permission/integration тестов.
- `pnpm exec vitest run apps/backend/src/modules/iam/permission.guard.test.ts apps/backend/src/modules/workspace/workspace.http.integration.test.ts apps/backend/src/modules/documents/documents.http.integration.test.ts`
  - Result: success
  - Notes: 9/9 tests passed.
- `pnpm test:backend`
  - Result: fail
  - Notes: изначально падали migration-chain + IAM secrets wiring.
- `pnpm exec vitest run apps/backend/src/modules/iam/permission.guard.test.ts apps/backend/src/modules/workspace/workspace.http.integration.test.ts apps/backend/src/modules/documents/documents.http.integration.test.ts apps/backend/src/modules/mvp/business-flows.e2e.test.ts apps/backend/src/modules/iam/auth.controller.contract.test.ts`
  - Result: success
  - Notes: после фикса `SecretsService`.
- `pnpm test:backend`
  - Result: fail
  - Notes: остались migration-chain + health readiness assertions.
- `pnpm exec vitest run apps/backend/src/modules/health/health.test.ts apps/backend/src/modules/iam/auth.http-regression.e2e.test.ts apps/backend/src/modules/mvp/business-flows.e2e.test.ts`
  - Result: success
  - Notes: 10/10 tests passed.

## How to continue / Как продолжить

1. Начать с `apps/backend/src/infrastructure/database/mvp-domain-migrations.test.ts`.
2. Сверить ожидания теста с реальным списком `apps/backend/migrations/*` и решить конфликт по `0019` префиксу.
3. Перезапустить `pnpm test:backend` и зафиксировать новый статус в handoff + README.
