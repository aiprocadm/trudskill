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

V1 roadmap (см. [docs/superpowers/plans/2026-05-21-cdoprof-v1-roadmap.md](docs/superpowers/plans/2026-05-21-cdoprof-v1-roadmap.md)) — **Phase 1 + Pillar A + Phase 2 (A+B+C) + Phase 3 (Plan A + Plan B + Plan C)** реализованы и слиты (Plan C — PR #215). **Wave 1** — **Plan 1 (модульный гейтинг + время)** слит (PR #218), **Plan 2 (аутентификация перед экзаменом №816)** слит (PR #219). **Wave 2 (регуляторные выгрузки)** — **под-цели A (ФРДО #225) + B (ОТ-реестр #222/#223) + C (ЕИСОТ «лица на тестирование» #226) слиты**. **V1.1 антивирус-гейт полностью закрыт** (#216-217, #224). **Phase 5 Plan 5A (notification foundation)** слита в `main` (PR #228): `MailerService` (NoopMailer + SmtpMailer), `email_templates`/`email_deliveries` (миграция 0047), `NotificationDispatcher`, `EnrollmentEmailListener`, admin endpoints, `documents.revoked` event. **Phase 5 Plan 5B (recertification foundation)** реализована на ветке `feat/2026-06-05-phase-5-plan-b-recertification`: per-program validity `recertificationPeriodMonths` + штамповка `valid_until` при выдаче документа + таблица `recertification_drafts` (migration **0048**) + `RecertificationService` (scan→draft→approve/reject, письмо `recertification_due` слушателю/заказчику) + admin endpoints (`recertification.read/write`); планировщик/cron → отдельный план **5B-2**, frontend-очередь «Нужна переаттестация» → план **5C**. Стабильный quality gate `pnpm -s ci:check` (Cyrillic-path fallback на isolated backend runs — см. CLAUDE.md Gotchas); миграции до **0048**.

### Current Goal

**Phase 5 Plan 5B (recertification foundation)** завершена на ветке `feat/2026-06-05-phase-5-plan-b-recertification` (все 9 задач, full `pnpm typecheck` 8/8, таргет-набор 232 теста зелёные). Следующий шаг — **Plan 5B-2** (ежедневный планировщик + advisory-lock + cross-tenant scan, реюз `RecertificationService.scanForRecertification`) и **Plan 5C** (frontend-очередь «Нужна переаттестация»).

### Last Completed Task

**Визуальная дизайн-система (читаемость в приоритете)** (2026-06-06, ветка `feat/2026-06-06-visual-design-system` от свежего `origin/main`, §5.110): токены navy + читаемый синий `#1e40af` + холодные нейтрали (золото убрано по фидбэку владельца «плохо читаема»; **контраст всех пар измерен ≥ WCAG AA** — тело 18:1/14.6:1, минимум 5.37:1), шрифты Golos Text/PT Serif через `next/font` (раньше шрифт не грузился вовсе), герой «Следующий шаг» (`next-step-card.tsx`, виден на `/learner`), новый паттерн `.ui-callout`, чистка хардкод-цветов (вкл. баг тёмной темы в `tz-links` + theme-blind `calendar`). Всё через токены `packages/ui/src/tokens` + `styles/foundation.ts` → раскатано по ~40 экранам автоматически. UI-тесты 9/9, learner-home 26/26, typecheck ui+frontend + ESLint чисто. Ожидает PR. **Предыдущее (roadmap): Phase 5 Plan 5B — recertification foundation (validity stamping + recertification_drafts + scan + approve/reject endpoints)** (2026-06-05, ветка `feat/2026-06-05-phase-5-plan-b-recertification`; subagent-driven-development по [плану](docs/superpowers/plans/2026-06-05-phase-5-plan-b-recertification-cycle.md)). Все 9 задач: migration **0048** (`course_versions.recertification_period_months` + `generated_documents.valid_until` + `learning.recertification_drafts` + права `recertification.read/write`); чистый `addMonths/addDays` util (month-end clamp); writable `recertificationPeriodMonths` на program-meta; штамповка `valid_until = completed_at + период` (producer-resolved: `MvpService` → payload → issuance-listener → task → completeTask → document); `RecertificationDraftsRepository` (singleton: in-memory + postgres, идемпотентность по `(tenant,learner,sourceDoc)`); `RecertificationService` (pure `scanForRecertification(asOf, docs, 90)` через `DocumentsTenantRunner` → idempotent draft → письмо `recertification_due` слушателю+заказчику; `approveDraft` → reuse `createBulkEnrollments`; `rejectDraft`); закрыт 5A-gap пустого `{{courseTitle}}` (резолв названия курса на producer); admin endpoints `GET /recertification-drafts`, `POST /recertification/scan`, `POST /recertification-drafts/:id/{approve,reject}` + permission-boundary в `mvp.http.integration.test.ts`. Тесты: date-math 4, drafts-repo 5, recert-service 9, documents.service 46, issuance-listener 11, email-notifications 13, mvp.http.integration 42, dto-validation 104 (всего 234 таргет); `pnpm typecheck` 8/8; ESLint clean. Финальный code-review поймал и исправил 2 edge-bug'а (approve idem-key per-group; try/catch вокруг dispatch в scan). Handoff §5.106. **Предыдущее:** Phase 5 Plan 5A — notification foundation (PR #228, §5.105); Wave 2 Plan C — ЕИСОТ (#226, §5.104); Wave 2 Plan A — ФРДО (#225, §5.103).

### Current Task

**Phase 5 Plan 5B завершена** на ветке `feat/2026-06-05-phase-5-plan-b-recertification` — все 9 задач выполнены, full typecheck 8/8, 234 таргет-теста зелёные, docs обновлены. Ветка ожидает PR/merge (12 коммитов поверх `origin/main`).

### Next Task

**Phase 5 Plan 5B-2 — daily scheduler**: `@nestjs/schedule` cron + `pg_try_advisory_lock` + cross-tenant enumeration, реюзит `RecertificationService.scanForRecertification`; туда же отложены `course_deadline`/`document_revoked` письма, каденс 90/30/7 и `license_expiring` (после persistence для `org`). **Plan 5C — frontend-очередь** «Нужна переаттестация» (навигация-данными + feature-модуль на endpoints 5B). Параллельно: 3 официальных артефакта ЛКОТ для Wave 2; Phase 6 (Ростехнадзор/Минздрав-НМО) — не запланировано.

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

frontend-design execution (визуальная дизайн-система: navy+синий токены, Golos Text/PT Serif шрифты, герой «Следующий шаг», `.ui-callout`; убрано золото и пересобрана палитра под читаемость по фидбэку владельца — контраст измерен ≥ WCAG AA; чистка хардкод-цветов; временная витрина `/design-preview` создана и удалена; spawn_task на чужой pre-existing баг `aggregateReviewerQueue`; §5.110, ветка `feat/2026-06-06-visual-design-system`). **Предыдущее:** subagent-driven execution (Phase 5 Plan 5B — recertification foundation: migration 0048 + valid_until стамповка (producer→listener→task→document) + RecertificationDraftsRepository + RecertificationService scan/approve/reject + recertification_due email + courseTitle-fix + admin endpoints + permission-boundary tests; все 9 задач; review поймал и исправил баг чтения документов через DocumentsTenantRunner; backend таргет-набор зелёный 232 теста; pnpm typecheck 8/8, ESLint clean)

### Last Updated At

2026-06-06 (визуальная дизайн-система — читаемость, §5.110, ветка feat/2026-06-06-visual-design-system; previous: Phase 5 Plan 5B завершена на ветке feat/2026-06-05-phase-5-plan-b-recertification; previous: Phase 5 Plan 5A #228, Wave 2 A/B/C #222-226, V1.1 AV-гейт #224, Wave 1 #218-219, Phase 3 Plan C #215, Phase 2 A/B/C, Phase 1 §4.3 + Pillar A)

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
