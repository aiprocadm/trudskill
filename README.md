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

### Current Stage

V1 roadmap (см. [docs/superpowers/plans/2026-05-21-cdoprof-v1-roadmap.md](docs/superpowers/plans/2026-05-21-cdoprof-v1-roadmap.md)) — **Phase 1 + Pillar A + Phase 2 (A+B+C) + Phase 3 (Plan A + Plan B + Plan C)** реализованы. Phase 3 Plan A (admin assessment surface) — merged (#206/#207/#210). Phase 3 Plan B (learner test player + autograding) — merged (#211). Phase 3 Plan C (manual review + practical submissions) — ветка `feat/2026-05-31-phase-3-plan-c-manual-review` (не слита): presigned file upload (MinIO, AV отложен в V1.1), `completeAttemptReview` (ручная оценка эссе, `submitted → finished`), `returnAssignmentSubmission` (цикл доработки), reviewer queue с активными действиями (вместо Plan A skeleton), `GET /me/assignments`. Стабильный quality gate `pnpm -s ci:check` (Cyrillic-path fallback на isolated backend runs — см. CLAUDE.md Gotchas); миграции до **0042** на этой ветке.

### Current Goal

Смерджить **Phase 3 Plan C** (ветка `feat/2026-05-31-phase-3-plan-c-manual-review`, 13 задач реализованы и зелёные). Далее — V1.1 polish (антивирус-скан загрузок, partial credit, расширенная essay-review UX) либо старт Phase 4.

### Last Completed Task

**V1.1 — антивирус-скан как gate перед download (ядро, Tasks 1-6)** (2026-05-30, ветка `feat/2026-05-30-v1.1-antivirus-scan-gate`). Pluggable `AntivirusScanner` (Noop dev / ClamAV prod за `ANTIVIRUS_ENABLED`) + `ANTIVIRUS_SCANNER` DI-factory; `FilesService.scanFile` (скан → `antivirus_status`/`checked_at` → audit) + **download-гейт** в `createDownloadUrl` (отказ для не-`clean`: infected→423, error→409; ленивый скан `pending` — файл никогда не отдаётся непросканированным); `getSubmissionFileUrl` наследует гейт. Без миграции (0002 уже имеет колонки). Tests зелёные (noop 1/clamav 4/env 7/files.upload 12), typecheck OK. Коммиты `9571930`/`73b3154`/`7dbc753`/`37d025d`/`793f930`. AV по умолчанию OFF (Noop=clean) — реальная защита по флагу после clamd (ops, spec §9). **Tasks 7-13 отложены** (проактивный скан, статус в UI, интеграционный тест) — env friction на кириллическом пути. Подробно — handoff §5.96. **Предыдущее:** **Phase 3 Plan C — manual review + practical submissions** (2026-05-30, ветка `feat/2026-05-31-phase-3-plan-c-manual-review`, 13 задач через subagent-driven development). **Backend (Tasks 1-7)** — presigned file upload/download (`S3StorageClient` + `FilesService.createUploadIntent/createDownloadUrl`, MIME allowlist + 10MB cap, AV `pending`; `MvpService` конструктор не тронут); `completeAttemptReview` (ручная оценка essay-ответов, пересчёт score/passed, `submitted → finished`); `returnAssignmentSubmission` (под_review → returned → resubmit → fresh review); reviewer-queue refinement (только essay-pending попытки + `essayAnswers[]` на attempt-item); DTO + 4 endpoint'а (`upload-url`/`file-url`/`return`/`complete-review`); `GET /me/assignments` (зеркало `/me/tests`); migration 0042. **Frontend (Tasks 8-12)** — `practical-submissions/` (learner: список заданий + сдача text+file + resubmit), `reviewer-actions/` (активная очередь: take/score/comment/complete/return + per-essay grading + download), nav «Мои задания», e2e. **Открытие:** assignment review-цикл уже существовал (Pillar A) — Plan C переиспользовал. Tests: backend 133 (incl. canonical `business-flows.e2e` 4 без регрессий) + frontend Plan C 34; `tsc` 8/8, ESLint clean. Review-цикл поймал 1 Critical (essay questionId слался как testId → 400) + 1 Important (queue refetch) — починены.

### Current Task

Смерджить Phase 3 Plan C PR. Параллельно — known V1.1 polish: антивирус-скан загруженных файлов (сейчас остаются `antivirus_status='pending'`), GroupCounterpartyPicker integration в GroupDetailsScreen, granular 0..1 progress rate, real course name в progress section, фильтр `counterpartyId` в `GET /groups`.

### Next Task

**Phase 4** (ЕСИА / прокторинг, per roadmap) либо **V1.1 polish**: антивирус-скан загрузок как gate перед download (сейчас `pending`), partial credit для multi-choice, расширенная essay-review UX (показ текста ответа ученика прямо в reviewer queue — сейчас reviewer видит `essayAnswers` через queue item), file-upload для essay-ответов попыток.

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

AI Agent (V1.1 antivirus scan gate — core Tasks 1-6: pluggable scanner + download gate, committed + tests green; Tasks 7-13 deferred — Cyrillic-path env output-buffering friction)

### Last Updated At

2026-05-30 (V1.1 AV gate core Tasks 1-6 done + committed — ветка `feat/2026-05-30-v1.1-antivirus-scan-gate`; previous: Phase 3 Plan C 2026-05-30 manual review + practical submissions; Phase 3 Plan B 2026-05-30 merged #211, Plan A 2026-05-30 merged #210, Phase 2 Plan C 2026-05-30, Plan B 2026-05-29, Plan A 2026-05-28, Phase 1 §4.3 + Pillar A 2026-05-27)

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
