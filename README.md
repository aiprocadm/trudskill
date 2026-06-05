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

V1 roadmap (см. [docs/superpowers/plans/2026-05-21-cdoprof-v1-roadmap.md](docs/superpowers/plans/2026-05-21-cdoprof-v1-roadmap.md)) — **Phase 1 + Pillar A + Phase 2 (A+B+C) + Phase 3 (Plan A + Plan B + Plan C)** реализованы и слиты (Plan C — PR #215). **Wave 1** — **Plan 1 (модульный гейтинг + время)** слит (PR #218), **Plan 2 (аутентификация перед экзаменом №816)** слит (PR #219). **Wave 2 (регуляторные выгрузки)** — **под-цели A (ФРДО #225) + B (ОТ-реестр #222/#223) + C (ЕИСОТ «лица на тестирование» #226) слиты**. **V1.1 антивирус-гейт полностью закрыт** (#216-217, #224). **Phase 5 Plan 5A (notification foundation)** реализована на ветке `feat/2026-06-04-phase-5-notifications-recertifications`: `MailerService` (NoopMailer + SmtpMailer), `email_templates`/`email_deliveries` (миграция 0047), `NotificationDispatcher`, `EnrollmentEmailListener`, admin endpoints, `documents.revoked` event. Стабильный quality gate `pnpm -s ci:check` (Cyrillic-path fallback на isolated backend runs — см. CLAUDE.md Gotchas); миграции до **0047**.

### Current Goal

**Phase 5 Plan 5A (notification foundation)** завершена на ветке `feat/2026-06-04-phase-5-notifications-recertifications` (все 9 задач, все тесты зелёные). Следующий шаг — запланировать и выполнить **Phase 5 Plan 5B (recertification cycle)**: validity + scheduler + recertification_drafts.

### Last Completed Task

**Phase 5 Plan 5A — notification foundation (email engine + templates + delivery journal + enrollment/completed emails + documents.revoked event + admin endpoints)** (2026-06-04, ветка `feat/2026-06-04-phase-5-notifications-recertifications`; subagent-driven-development по [плану](docs/superpowers/plans/2026-06-04-phase-5-plan-a-notification-foundation.md)). Все 9 задач выполнены: провайдер-агностичный `MailerService` (NoopMailer default + SmtpMailer, env `NOTIFICATIONS_EMAIL_ENABLED`); `communication.email_templates` (code defaults + DB override) + `communication.email_deliveries` journal (migration 0047); `NotificationDispatcher`; `EnrollmentEmailListener` (`learning.enrollment_invited` new + `learning.enrollment_completed` extended → learner emails); emit `documents.revoked` (listener deferred to 5B); admin endpoints `GET /email-deliveries`, `GET /email-templates`, `PUT /email-templates/:key` (perms `notifications.read`/`notifications.write`) + permission-boundary в `mvp.http.integration.test.ts`. Тесты: mailer 1, smtp 2, email-notifications 12, enrollment-recipient 4, documents.service 45, mvp.http.integration 30; `pnpm typecheck` 8/8; ESLint clean. Handoff §5.105. **Предыдущее:** Wave 2 Plan C — ЕИСОТ «лица на тестирование» (#226, §5.104); Wave 2 Plan A — ФРДО (#225, §5.103); V1.1 AV-гейт Задачи 7-13 (#224, §5.102).

### Current Task

**Phase 5 Plan 5A завершена** на ветке `feat/2026-06-04-phase-5-notifications-recertifications` — все 9 задач выполнены, тесты зелёные, docs обновлены. Ветка ожидает PR/merge.

### Next Task

**Phase 5 Plan 5B — recertification cycle**: validity + scheduler + recertification_drafts — требует отдельного написания плана. Параллельно: 3 официальных артефакта ЛКОТ для Wave 2 (provisional `COLUMNS`/`ELEMENTS`/`RESPONSE_COLUMNS`); Phase 6 (Ростехнадзор/Минздрав-НМО) — не запланировано.

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

subagent-driven execution (Phase 5 Plan 5A — notification foundation: MailerService infra + email_templates/deliveries migration 0047 + NotificationDispatcher + EnrollmentEmailListener + documents.revoked event + admin endpoints + permission-boundary tests; все 9 задач; backend таргет-набор зелёный: mailer 1, smtp 2, email-notifications 12, enrollment-recipient 4, documents.service 45, mvp.http.integration 30; tsc 8/8, ESLint clean)

### Last Updated At

2026-06-04 (Phase 5 Plan 5A завершена на ветке feat/2026-06-04-phase-5-notifications-recertifications; previous: Wave 2 A/B/C #222-226, V1.1 AV-гейт #224, Wave 1 #218-219, Phase 3 Plan C #215, Phase 2 A/B/C, Phase 1 §4.3 + Pillar A)

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

- **V1.1 AV-гейт ставится с `ANTIVIRUS_ENABLED=false`** — `NoopAntivirusScanner` помечает файлы `clean` (dev/пилот). Реальная защита требует поднятого clamd + `ANTIVIRUS_ENABLED=true` (ops, spec §9). Файлы, загруженные до V1.1, остаются `pending` и сканируются лениво при первом скачивании. Задачи 7-13 V1.1 (проактивный скан при submit, `antivirusStatus` в чтении сабмишена + очереди ревью, HTTP-гейт boundary, гейтинг кнопки скачивания у ревьюера, статус у слушателя) — **выполнены** (handoff §5.102, ветка `feat/2026-06-02-v1.1-antivirus-tasks-7-13`). Единственный остаток — ops: поднять clamd и включить флаг.
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
