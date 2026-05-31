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
- **`README.md` — канон по точке входа в репозиторий:** актуальный **AI Agent State**, команды и ссылки на E2E/CI (см. [docs/DOCUMENTATION_MAP.md](docs/DOCUMENTATION_MAP.md) — кто главный для ТЗ, трассировки и handoff; **несколько агентов** — [протокол передачи](docs/DOCUMENTATION_MAP.md#agent-handoff-protocol)).
- Перед следующими крупными изменениями нужно валидировать критические сценарии IAM/доступов и multitenancy.

### Ссылки на обязательные документы

- Агенты (несколько сессий, «продолжай по ТЗ»):
  - [`AGENTS.md`](AGENTS.md)
  - [`.cursor/rules/lms-multi-agent-handoff.mdc`](.cursor/rules/lms-multi-agent-handoff.mdc) (правило Cursor, `alwaysApply`)
  - [`docs/DOCUMENTATION_MAP.md` — протокол передачи](docs/DOCUMENTATION_MAP.md#agent-handoff-protocol)
- Требования и пилот (продуктовый канон и приёмка):
  - [`SDOPROF_TZ_FINAL.md`](SDOPROF_TZ_FINAL.md)
  - [`docs/TZ_MVP_TRACEABILITY.md`](docs/TZ_MVP_TRACEABILITY.md)
  - [`docs/DOCUMENTATION_MAP.md`](docs/DOCUMENTATION_MAP.md)
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

### Канонический E2E для приёмки §39 ТЗ

- Backend (бизнес-потоки без браузера): [`apps/backend/src/modules/mvp/business-flows.e2e.test.ts`](apps/backend/src/modules/mvp/business-flows.e2e.test.ts), сертификат по завершению: [`apps/backend/src/modules/documents/enrollment-certificate-flow.service.test.ts`](apps/backend/src/modules/documents/enrollment-certificate-flow.service.test.ts).
- Backend HTTP integration (envelope, `TenantGuard`, permission boundaries, доменные инварианты assessment; дополняют BL-010 в CI): [`mvp.http.integration.test.ts`](apps/backend/src/modules/mvp/mvp.http.integration.test.ts), [`mvp.domains.http.integration.test.ts`](apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts), [`mvp-internal-worker.http.integration.test.ts`](apps/backend/src/modules/mvp/mvp-internal-worker.http.integration.test.ts) (worker callback `…/internal/worker/mvp/bulk-enrollments`, BL-003), [`documents.http.integration.test.ts`](apps/backend/src/modules/documents/documents.http.integration.test.ts) (**GET** **`documents.read`**; **POST** → **`documents.write`** или **`documents.generate`** (**…/documents/generate**); **PATCH** / **PUT** / **DELETE** → **`documents.write`**, регресс **templates/:id** в harness), [`esign.http.integration.test.ts`](apps/backend/src/modules/esign/esign.http.integration.test.ts) (**POST:** submit, reuse-check (**read**), **applications/(approve|reject)**, start-review; **PATCH** **applications/:id** (**write**), **participants/:id** (**processes.write**); **processes** POST/start/**cancel**; **participants** POST (create)/invite/sign/skip/mark-viewed/**reject** (контуры **`processes.write`** / **`sign`**); application-files POST/verify/reject/**DELETE**; **GET:** **applications/:id**, application-files и **application-files/:id**, **legal-log** и **legal-log/:id**, **processes**, **processes/:id**, **processes/:id/status**, **participants**, **events**, **events/:id**), [`workspace.http.integration.test.ts`](apps/backend/src/modules/workspace/workspace.http.integration.test.ts), [`integrations.http.integration.test.ts`](apps/backend/src/modules/integrations/integrations.http.integration.test.ts) (**GET** → **`integrations.read`**; **POST**/**PATCH**/**PUT**/**DELETE** → **`integrations.write`**, стаб **…/integrations/providers/:id**); liveness (**без auth**): [`health.http.integration.test.ts`](apps/backend/src/modules/health/health.http.integration.test.ts); IAM: [`auth.http-regression.e2e.test.ts`](apps/backend/src/modules/iam/auth.http-regression.e2e.test.ts).
- Frontend (маршруты / роли): [`apps/frontend/src/e2e/lms-role-flows.e2e.test.ts`](apps/frontend/src/e2e/lms-role-flows.e2e.test.ts), при необходимости — [`apps/frontend/src/e2e/canonical-e2e-readiness.e2e.test.ts`](apps/frontend/src/e2e/canonical-e2e-readiness.e2e.test.ts).
- Регресс качества: `pnpm -s ci:check`. Отдельный Playwright/Cypress при появлении требования — не заменяет указанные Vitest-наборы до явного решения команды.

## 2. AI Agent State

Состояние ниже должно совпадать по смыслу с [LMS_AGENT_HANDOFF.md](LMS_AGENT_HANDOFF.md) (факты сессии, файлы, тесты). Подробный лог — там §5–§20; здесь — краткий ориентир для следующего агента.

> 📋 **Сводный статус всех 17 планов** (что слито / что осталось, карта PR→план) — [docs/superpowers/plans/PLANS_STATUS.md](docs/superpowers/plans/PLANS_STATUS.md) (сверено по git + коду, 2026-05-31).

### Current Stage

V1 roadmap (см. [docs/superpowers/plans/2026-05-21-cdoprof-v1-roadmap.md](docs/superpowers/plans/2026-05-21-cdoprof-v1-roadmap.md)) — **Phase 1 + Pillar A + Phase 2 (A+B+C) + Phase 3 (Plan A + Plan B + Plan C)** реализованы и слиты (Plan C — PR #215). **Wave 1 (учебно-экзаменационное соответствие)** — паритет с инкумбентом по обязательным требованиям ДО: **Plan 1 (модульный гейтинг + время на изучение)** слит (PR #218); **Plan 2 (аутентификация перед экзаменом, Приказ №816)** реализован на ветке `feat/2026-05-31-wave1-pre-exam-auth`. Стабильный quality gate `pnpm -s ci:check` (Cyrillic-path fallback на isolated backend runs — см. CLAUDE.md Gotchas); миграции до **0044**.

### Current Goal

Смерджить **Wave 1 Plan 2** (ветка `feat/2026-05-31-wave1-pre-exam-auth`, зелёная). Plan 1 (модульный гейтинг) уже слит (PR #218). Далее — **Wave 2**: регуляторные выгрузки (ФИС ФРДО → Минтруд/ЛКОТ → ЕИСОТ) — см. [дорожную карту паритета](docs/superpowers/specs/2026-05-30-legacy-parity-roadmap.md).

### Last Completed Task

**Wave 1 — Plan 2: аутентификация слушателя перед экзаменом (Приказ Минобрнауки №816)** (2026-05-31, ветка `feat/2026-05-31-wave1-pre-exam-auth`, subagent-driven, 9 задач). **Backend** — миграция `0044` (`group_courses.requires_pre_exam_auth`, `test_attempts.identity_*`, новая таблица `assessment.pre_exam_tokens`); MVP-коллекция `preExamTokens` (**consumed-токен = запись верификации**); чистый крипто-хелпер `pre-exam-token.ts` (зеркало magic-link: `randomBytes+SHA-256`, single-use, TTL 15м); `MvpService.requestPreExamToken` (выпуск + лог URL, **без возврата raw**) / `verifyPreExamToken` (redeem по hash, tenant-scoped) / `assertPreExamAuthGate` в `startAttempt` (**только итоговый экзамен — `moduleId == null`**, только при флаге группы; код `pre_exam_auth_required`); стамп `identityVerifiedAt`/`identityVerificationTokenId` на попытку; 2 endpoint'а (`assessment.attempts.take`). 6-арг конструктор не тронут; email = logging-заглушка. **Frontend** — `testPlayerApi.requestPreExamToken`/`verifyPreExamToken` + хук `useRequestPreExamToken`; интерстишал в `tests-list-screen` (детект гейта по ошибке, не задевает прочие); страница `app/exam-auth/[token]/page.tsx` (зеркало magic-link, idempotency-guard); маркер «Личность подтверждена ✓». Tests: backend `pre-exam-token` 6 + `pre-exam-auth.service` 9 + DTO 102 + HTTP-integration 18 + регресс `module-gating`/`test-player`/`business-flows.e2e` (138 в прогоне); frontend `test-player` 14; contracts 7; `tsc` 8/8; ESLint clean. Ревью ядра (subagent) APPROVED: подтверждены no-leak raw, tenant-scoping, привязка верификации по `enrollmentId`+`testId`, TTL/single-use; закрыты 3 пробела покрытия. **Известные ограничения:** реальный email-адаптер отложен (logging-заглушка); гейт только итогового экзамена; tenant-default «вкл. для новых групп» не реализован (есть per-group opt-in); маркер — в результате попытки, не в admin-карточке. Handoff §5.98. **Предыдущее:** Wave 1 Plan 1 (модульный гейтинг + время, §5.97, PR #218); V1.1 AV-скан (§5.96, PR #217).

### Current Task

Смерджить **Wave 1 Plan 2** PR (аутентификация перед экзаменом №816, зелёная ветка `feat/2026-05-31-wave1-pre-exam-auth`).

### Next Task

**Wave 2** — регуляторные выгрузки (ФИС ФРДО → Минтруд/ЛКОТ → ЕИСОТ), главный бизнес-блокер ухода со старой платформы; UI-каркас (`app/gov-export`) есть, нужен backend-адаптер + официальные шаблоны (внешний вход владельца). См. [дорожную карту паритета](docs/superpowers/specs/2026-05-30-legacy-parity-roadmap.md) §3 Тир 1 + §4. Параллельно — Phase 4 (ЕСИА / прокторинг, per V1 roadmap). Возможные малые follow-up Wave 1: реальный email-адаптер для №816, tenant-default «вкл. для новых групп», маркер идентификации в admin-карточке.

### Do Not Touch

- Историю миграций в `apps/backend/migrations/*` (без отдельной задачи миграционного изменения).
- Сгенерированные контракты в `packages/api-contracts/src/generated/*` (менять только через генерацию).

### Important Decisions

- Репозиторий: единый **операционный** конспект между агентами — блок `README` + передача сессии в `LMS_AGENT_HANDOFF.md`. Продуктовый канон — `SDOPROF_TZ_FINAL.md`; роли и порядок чтения при фразе «продолжай по ТЗ» — [docs/DOCUMENTATION_MAP.md](docs/DOCUMENTATION_MAP.md#agent-handoff-protocol).
- Изменения вносятся малыми итерациями с обязательной фиксацией тестового статуса и рисков.
- Следующий высокий приоритет: безопасность и устойчивость IAM + контроль доступа по ролям.

### Known Risks

- Риск рассинхронизации документации и кода при отсутствии регулярного обновления README после каждой итерации.
- Возможные регрессии в auth/session/permission flows при несистемном изменении backend и frontend.
- Наличие широкого backlog по enterprise-operational задачам; требуется приоритизация по критичности (security/reliability first).

### Last Updated By

AI Agent (Wave 1 Plan 2 — pre-exam auth №816; subagent-driven 9 tasks; core spec+quality review APPROVED — verified no-leak raw token, tenant-scoping, verification binding by enrollment+test, TTL/single-use; closed 3 coverage gaps)

### Last Updated At

2026-05-31 (Wave 1 Plan 2 done — pre-exam auth №816; previous: Wave 1 Plan 1 done — module gating + время на изучение (#218), V1.1 AV gate (#217), Phase 3 Plan C manual review + practical submissions (#215), Plan B (#211), Plan A (#210), Phase 2 Plan C, Plan B, Plan A, Phase 1 §4.3 + Pillar A)

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

- Поддержание синхронности README ↔ `LMS_AGENT_HANDOFF.md` после каждой инженерной сессии ([протокол](docs/DOCUMENTATION_MAP.md#agent-handoff-protocol)).

### Что делать следующим шагом

1. Открыть [LMS_AGENT_HANDOFF.md](LMS_AGENT_HANDOFF.md) §14 Recommended Next Steps и §20 Final Status.
2. Сверить с [docs/TZ_MVP_TRACEABILITY.md](docs/TZ_MVP_TRACEABILITY.md) и при необходимости с §41 [SDOPROF_TZ_FINAL.md](SDOPROF_TZ_FINAL.md).
3. Запустить `pnpm -s ci:check` перед и после значимых изменений; обновить этот README и handoff.

## 4. Iteration Log (текущая итерация)

### Измененные файлы

- `README.md`, `docs/DOCUMENTATION_MAP.md`, `LMS_AGENT_HANDOFF.md`, `SDOPROF_TZ_FINAL.md`, `AGENTS.md`, `.cursor/rules/lms-multi-agent-handoff.mdc` (протокол многоагентной передачи, Cursor rule `alwaysApply`, устранение противоречий README vs handoff).

### Принятые решения в итерации

- Один смысл «где остановились»: детали в `LMS_AGENT_HANDOFF.md`, краткое резюме в `README` §2; фраза «продолжай по ТЗ» → порядок в [DOCUMENTATION_MAP.md](docs/DOCUMENTATION_MAP.md#agent-handoff-protocol).

### Проверки в итерации

- Сверка содержимого README, handoff и карты документации на логическую согласованность (без обязательного полного `ci:check` только для правок markdown).

## 5. Backlog (приоритезированный)

Укрупнённый продуктовый backlog и BL — только в [SDOPROF_TZ_FINAL.md](SDOPROF_TZ_FINAL.md) §41 и матрице [docs/TZ_MVP_TRACEABILITY.md](docs/TZ_MVP_TRACEABILITY.md). Ниже — **репозиторные** приоритеты, если не задан иной порядок:

1. **P0 Security/Auth:** см. [docs/security-remediation-roadmap.md](docs/security-remediation-roadmap.md) и handoff §10.
2. **P0 Reliability:** health/readiness/metrics, [docs/operations-runbook.md](docs/operations-runbook.md).
3. **P1 UX Learning Flow:** состояния загрузки/ошибок в learning flow.
4. **P1 Reporting:** сценарии KPI/экспорта (см. BL-008 в трассировке).
5. **P2 Integrations:** idempotency/observability webhooks.

## 6. Test Status

### Что уже проходило (по доступным артефактам репозитория)

- В репозитории присутствуют unit/integration/e2e тесты для backend/frontend/packages.
- Общий запуск проверок описан в quick start и `docs/run-tests.md`.

### Статус текущей итерации

- Запущен consolidated regression для IAM/role-access + permission-boundary HTTP integration:
  - `pnpm exec vitest run apps/frontend/src/e2e/lms-role-flows.e2e.test.ts apps/frontend/src/e2e/role-access.e2e.test.ts apps/frontend/src/e2e/auth-routing.e2e.test.ts apps/backend/src/modules/iam/permission.guard.test.ts apps/backend/src/modules/iam/auth.security.test.ts apps/backend/src/modules/workspace/workspace.http.integration.test.ts apps/backend/src/modules/documents/documents.http.integration.test.ts`
  - Результат: success, 7 files / 23 tests passed.

## 7. Known Issues / Open Errors

- **V1.1 AV-гейт ставится с `ANTIVIRUS_ENABLED=false`** — `NoopAntivirusScanner` помечает файлы `clean` (dev/пилот). Реальная защита требует поднятого clamd + `ANTIVIRUS_ENABLED=true` (ops, spec §9). Файлы, загруженные до V1.1, остаются `pending` и сканируются лениво при первом скачивании. Задачи 7-13 V1.1 (проактивный скан при submit, статус файла в UI, HTTP-интеграционный тест) — отложены (handoff §5.96).
- Для полной картины по тестам и командам см. таблицу в [LMS_AGENT_HANDOFF.md](LMS_AGENT_HANDOFF.md) §12; здесь держите только краткое резюме после крупных прогонов.
- Регулярно синхронизировать `AI Agent State` с handoff ([протокол](docs/DOCUMENTATION_MAP.md#agent-handoff-protocol)).

## 8. Quick Start

1. Скопировать env: `cp .env.example .env`.
2. Поднять сервисы: `docker compose -f infra/docker-compose.yml up -d --build`.
3. Запустить проверки: `pnpm test`.

Backend при старте применяет SQL миграции (`apps/backend/migrations`) и baseline seed IAM при `DB_MIGRATIONS_ENABLED=true`.

## 9. Operational Endpoints

- Backend: `/api/v1/health/live`, `/api/v1/health/ready`, `/api/v1/health/startup`, `/api/v1/metrics`.
- Realtime: `/health`, `/ready`.
