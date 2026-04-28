# LMS / СДО Project README

## 1. Project Overview

CDOProf — монорепозиторий LMS/СДО платформы для обучающихся, преподавателей/кураторов и администраторов.

### Основные роли

- Learner (обучающийся)
- Teacher/Curator (преподаватель/куратор)
- Admin (администратор)

### Основные модули

- Аутентификация, сессии, роли/права (`apps/backend/src/modules/iam`, `apps/frontend/src/features/auth`)
- Курсы/обучение и смежные MVP домены (`apps/backend/src/modules/mvp`, `apps/frontend/app/courses*`, `apps/frontend/app/learner*`)
- Документы и e-sign (`apps/backend/src/modules/documents`, `apps/backend/src/modules/esign`)
- Коммуникации (чат, уведомления, вебинары) (`apps/backend/src/modules/communication`, `apps/frontend/app/chat`, `apps/frontend/app/notifications`, `apps/frontend/app/webinars`)
- Интеграции (`apps/backend/src/modules/integrations`, `apps/frontend/app/integrations`)
- Аналитика/аудит/метрики (`apps/backend/src/modules/audit`, `apps/backend/src/common/metrics`)

### Текущий стек

- Monorepo: pnpm workspace + Turborepo
- Frontend: Next.js + TypeScript
- Backend: NestJS + TypeScript
- Realtime service: Node.js/TypeScript
- Worker service: Node.js/TypeScript
- DB migrations: SQL в `apps/backend/migrations`
- Контракты/типы: `packages/api-contracts`, `packages/shared-types`

### Важные ограничения

- Работать итеративно и минимальными безопасными изменениями.
- README.md — единственный источник истины по состоянию проекта.
- Перед следующими крупными изменениями нужно валидировать критические сценарии IAM/доступов и multitenancy.

### Ссылки на обязательные документы

- Полное техническое задание / архитектурный контекст:
  - `docs/architecture-overview.md`
  - `docs/mvp-domain-database.md`
  - `apps/backend/docs/mvp-domain-database.md`
- Текущее состояние и план работ:
  - `docs/ENTERPRISE_OPERATIONAL_PLAN.md`
  - `docs/ENTERPRISE_OPERATIONAL_NEXT_STEPS.md`
  - `docs/ENTERPRISE_OPERATIONAL_COMPLETION_REPORT.md`
  - `docs/ENTERPRISE_OPERATIONAL_REMAINING_GAPS.md`
- Тестирование и регламенты проверок:
  - `docs/testing/test-strategy-stage-13.md`
  - `docs/run-tests.md`
- Безопасность/надежность/операции:
  - `docs/security-remediation-roadmap.md`
  - `docs/operations-runbook.md`
  - `docs/backup-and-restore.md`
  - `docs/observability.md`

## 2. AI Agent State

### Current Stage

Стабилизация документации и эксплуатационной готовности (README как SSOT + подготовка к следующей backend/frontend итерации).

### Current Goal

Расширить backend HTTP permission-boundary regression дополнительными сценариями `session_inactive` и зафиксировать результаты.

### Last Completed Task

Добавлены `session_inactive` HTTP integration сценарии для `workspace` и `documents`; целевой прогон `vitest` зелёный (2 files, 9 tests).

### Current Task

Синхронизировать handoff/README после расширения permission-boundary regression.

### Next Task

Определить следующий приоритетный backend HTTP scope (например, auth/session edge-cases для новых модулей) и добавить точечные integration-тесты без изменения public API.

### Do Not Touch

- Историю миграций в `apps/backend/migrations/*` (без отдельной задачи миграционного изменения).
- Сгенерированные контракты в `packages/api-contracts/src/generated/*` (менять только через генерацию).

### Important Decisions

- README.md ведется как единый источник истины для передачи контекста между агентами.
- Изменения вносятся малыми итерациями с обязательной фиксацией тестового статуса и рисков.
- Следующий высокий приоритет: безопасность и устойчивость IAM + контроль доступа по ролям.

### Known Risks

- Риск рассинхронизации документации и кода при отсутствии регулярного обновления README после каждой итерации.
- Возможные регрессии в auth/session/permission flows при несистемном изменении backend и frontend.
- Наличие широкого backlog по enterprise-operational задачам; требуется приоритизация по критичности (security/reliability first).

### Last Updated By

AI Agent

### Last Updated At

2026-04-28 20:00 UTC

## 3. Current Project Status

### Что уже сделано

- Сформирована многосервисная архитектура (`apps/frontend`, `apps/backend`, `apps/worker`, `apps/realtime`).
- Добавлены ключевые backend-модули: IAM, документы, e-sign, коммуникации, интеграции, аудит, tenant/workspace.
- Добавлены frontend-страницы и feature-слои для auth, navigation, communication, integrations, MVP-сценариев.
- Есть инфраструктурные SQL-миграции, включая IAM/security и operational индексы.
- Подготовлены базовые runbook/observability/testing документы.

### Какие задачи выполнены (на уровне репозитория)

- Базовый foundation монорепозитория и окружения.
- Контрактный слой API и shared types packages.
- Набор unit/integration/e2e тестов по ключевым доменам (по структуре репозитория).

### Какие задачи в работе

- Нормализация процесса передачи контекста между агентами через README SSOT.
- Подготовка следующей приоритетной итерации по IAM hardening и role-access regression.

### Что делать следующим шагом

1. Запустить целевые тесты IAM и frontend role access.
2. Исправить найденные дефекты в минимальном объеме.
3. Обновить README: решения, риски, test status, измененные файлы.

## 4. Iteration Log (текущая итерация)

### Измененные файлы

- `README.md`

### Принятые решения в итерации

- Применен обязательный шаблон README для LMS/СДО.
- Зафиксирован явный `AI Agent State` для старта следующего агента.

### Проверки в итерации

- Проверка наличия структуры репозитория и исходных файлов через `rg --files`.
- Проверка текущего содержимого README перед обновлением.

## 5. Backlog (приоритезированный)

1. **P0 Security/Auth:** regression-пакет и hardening для login/refresh/logout + permission guard consistency.
2. **P0 Reliability:** проверка health/readiness/metrics цепочки для backend и realtime + runbook-валидация.
3. **P1 UX Learning Flow:** улучшение UX состояний загрузки/ошибок в курсах/уроках/кабинете.
4. **P1 Reporting:** валидация сценариев отчетности и выгрузок.
5. **P2 Integrations:** усиление idempotency/observability для webhook flows.

## 6. Test Status

### Что уже проходило (по доступным артефактам репозитория)

- В репозитории присутствуют unit/integration/e2e тесты для backend/frontend/packages.
- Общий запуск проверок описан в quick start и `docs/run-tests.md`.

### Статус текущей итерации

- Запущен consolidated regression для IAM/role-access + permission-boundary HTTP integration:
  - `pnpm exec vitest run apps/frontend/src/e2e/lms-role-flows.e2e.test.ts apps/frontend/src/e2e/role-access.e2e.test.ts apps/frontend/src/e2e/auth-routing.e2e.test.ts apps/backend/src/modules/iam/permission.guard.test.ts apps/backend/src/modules/iam/auth.security.test.ts apps/backend/src/modules/workspace/workspace.http.integration.test.ts apps/backend/src/modules/documents/documents.http.integration.test.ts`
  - Результат: success, 7 files / 23 tests passed.

## 7. Known Issues / Open Errors

- Нужна фактическая актуализация статуса тестов по последнему зеленому прогону (дата, набор команд, результаты).
- Нужна регулярная синхронизация `AI Agent State` после каждой инженерной итерации, чтобы исключить потерю контекста.

## 8. Quick Start

1. Скопировать env: `cp .env.example .env`.
2. Поднять сервисы: `docker compose -f infra/docker-compose.yml up -d --build`.
3. Запустить проверки: `pnpm test`.

Backend при старте применяет SQL миграции (`apps/backend/migrations`) и baseline seed IAM при `DB_MIGRATIONS_ENABLED=true`.

## 9. Operational Endpoints

- Backend: `/api/v1/health/live`, `/api/v1/health/ready`, `/api/v1/health/startup`, `/api/v1/metrics`.
- Realtime: `/health`, `/ready`.
