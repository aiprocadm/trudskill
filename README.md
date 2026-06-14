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

**2026-06-14 (эта сессия, docs-only):** **Phase 0 — плейбук готовности к первому пилоту** (ветка `docs/2026-06-14-phase-0-readiness-spec`, §5.125). Некодовый owner-facing артефакт [docs/phase-0/](docs/phase-0/): индекс + 6 направлений (бренд/домен, запуск сервера, модель подписи, пилотный контент, пилотный клиент, лицензия+реестры) — критический путь к первому пилоту, выдающему юридически пригодные документы. После сверки с записью владельца 2026-06-08 (бренд/домен/лицензия/клиенты уже есть) фокус сужен до **НЭП + деплой + пилотный курс + прогон**; ЕСИА/платежи отложены в Phase 7. Backend/frontend нетронуты.

**2026-06-13:** **Phase 10 Track A — Excel-конструктор отчётов** реализован на ветке `feat/2026-06-13-phase-10a-excel-report-builder` (§5.121). Phase 9 полностью слита (Plan A #242 + Plan B #243). Read-model без миграции/нового права: реестр сущностей + чистый `buildReport` + exceljs-writer + 6 endpoints `reports/builder/*` + коллекция `reportTemplates` + страница `/admin/reports/builder`. v1 = ученики + назначения (`documents` отложена, D-A5); XLSX base64-в-конверте без S3 (D-A3). Реализовано последовательно in-process TDD (субагент-диспатч недоступен — `403`). Изолированные прогоны: backend 33 + http 85, frontend 14, contracts 7, typecheck 8/8, ESLint clean. **Слит в `main` (#245).** **Track B — WCAG-доступность** реализован (§5.122, ветка `feat/2026-06-13-phase-10b-wcag-accessibility`): статический гейт `eslint-plugin-jsx-a11y/recommended` в обоих путях линтования + a11y-фиксы 9 общих примитивов `@cdoprof/ui` + AppShell live-region; холистическое ревью поймало IMPORTANT-баг (`fieldId` схлопывал кириллицу в один id → дубль-id) → фикс; ui+frontend+lint+typecheck зелёные → **PR #246**. **Track C — PWA + web-push** реализован (§5.123, ветка `feat/2026-06-13-phase-10c-pwa-push`): PWA-манифест + Serwist service worker + web-push (VAPID, всё **dormant** за `WEB_PUSH_ENABLED=false` → `NoopWebPushSender`) + канал push в `NotificationDispatcher` к 5 событиям Phase 5; MVP-коллекция `pushSubscriptions` **без миграции/нового права**. Изолированные прогоны: frontend 566/566, backend таргет 73, typecheck 8/8, ESLint clean → **PR #248**.

**2026-06-11 (предыдущая сессия, вечер):** **Phase 4 Plan B — прокторинг (запись видео итогового теста)** реализована на ветке `feat/2026-06-11-phase-4-plan-b-proctoring` (§5.118), **Phase 4 закрыта целиком** (кроме отложенных владельцем ЕСИА/live-оператора): migration **0051** (`learning.proctoring_recordings` + `requires_proctoring` + per-student `proctoring_override` + права `proctoring.submit/read`), браузерный MediaRecorder → 30-сек webm-чанки → presigned PUT (лимит 10MB files-слоя), **5-й гейт `assertProctoringGate`** в `startAttempt` (412 `proctoring_required`, non-collision с Wave 1/Plan A), согласие 152-ФЗ + превью камеры, `● REC` + stop-on-submit + **resume-баннер после F5**, админ-очередь `/admin/proctoring-recordings` с плеером-склейкой чанков (AV-гейт, presigned GET, предупреждения о разрывах), override-select на странице группы, dormant **365-дневный** retention-cron (`PROCTORING_VIDEO_RETENTION_ENABLED=false`, lock 528_493, write-режим runner + регресс-guard). Финальное холистическое ревью снова оправдалось: **CRITICAL C1 — ретрай чанка запрашивал новый intent → 409 → мёртвый ретрай + фантомный чанк ронял всю сборку видео** (фикс: intent-кэш per-sequence + per-chunk деградация плеера) + I1 (F5 убивал запись навсегда → resume-баннер) + I2 (override был API-only → UI). Миграции теперь до **0051**. PR не создан на момент записи — см. Current Task.

**Предыдущее (2026-06-11, утро):** **Phase 4 Plan A — идентификация личности (селфи + паспорт, ручная сверка админом)** реализована на ветке `feat/2026-06-10-phase-4-plan-a-identity-verification` → **PR #240** (§5.117): migration **0050** (toggle + `learning.identity_verifications` + права `identity.submit/read/review`), MVP-коллекция `identityVerifications`, lifecycle start→upload→submit(согласие 152-ФЗ)→review, **4-й гейт `assertIdentityVerificationGate`** в `startAttempt` (412 `identity_verification_required`; сообщение намеренно не пересекается с Wave 1-регексом), dormant 90-дневный retention-cron изображений (`IDENTITY_IMAGE_RETENTION_ENABLED=false`, advisory-lock 528_492), 7 эндпоинтов, `/learner/identity` + `/admin/identity-verifications` (+`[id]`) + интерстициал в test-player + e2e. Холистическое ревью поймало **CRITICAL: `MvpTenantRunner` read-only** (штампы cron терялись) → добавлен **`runWithTenantStateAndSave`** (write-режим, зеркало `DocumentsTenantRunner`). Прокторинг → отдельный Plan B (не запланирован). Миграции теперь до **0050**.

**Предыдущее (2026-06-10):** Обе ветки 2026-06-08 **слиты в `main`**: Phase 0 деплой-фундамент (**#235**) + Production auth readiness A+B (**#237**; плюс **#236** — boot-fix под tsx). Закрыт follow-up §3.3 плана auth-readiness: `infra/bootstrap-admin.md` приведён к новой реальности (email-доставка magic-link по `NOTIFICATIONS_EMAIL_ENABLED`, авто-`SeedCredentialHygiene` при прод-буте, ручные psql-шаги → подстраховка) → слито **#238**, §5.115. Дополнительно слит **#239** (`DB_MIGRATIONS_ENABLED=''` → `'false'` в 13 тест-харнессах после #236). **Кодовых блокеров пилота не осталось** — следующий шаг deploy-execution владельцем.

V1 roadmap (см. [docs/superpowers/plans/2026-05-21-cdoprof-v1-roadmap.md](docs/superpowers/plans/2026-05-21-cdoprof-v1-roadmap.md)) — **Phase 1 + Pillar A + Phase 2 (A+B+C) + Phase 3 (Plan A + Plan B + Plan C)** реализованы и слиты (Plan C — PR #215). **Wave 1** — **Plan 1 (модульный гейтинг + время)** слит (PR #218), **Plan 2 (аутентификация перед экзаменом №816)** слит (PR #219). **Wave 2 (регуляторные выгрузки)** — **под-цели A (ФРДО #225) + B (ОТ-реестр #222/#223) + C (ЕИСОТ «лица на тестирование» #226) слиты**. **V1.1 антивирус-гейт полностью закрыт** (#216-217, #224). **Phase 5 Plan 5A (notification foundation)** слита в `main` (PR #228): `MailerService` (NoopMailer + SmtpMailer), `email_templates`/`email_deliveries` (миграция 0047), `NotificationDispatcher`, `EnrollmentEmailListener`, admin endpoints, `documents.revoked` event. **Phase 5 Plan 5B (recertification foundation)** реализована на ветке `feat/2026-06-05-phase-5-plan-b-recertification`: per-program validity `recertificationPeriodMonths` + штамповка `valid_until` при выдаче документа + таблица `recertification_drafts` (migration **0048**) + `RecertificationService` (scan→draft→approve/reject, письмо `recertification_due` слушателю/заказчику) + admin endpoints (`recertification.read/write`); планировщик/cron → отдельный план **5B-2**, frontend-очередь «Нужна переаттестация» → план **5C**. **Phase 5 Plan 5B-2 (recertification scheduler)** реализована на ветке `feat/2026-06-06-phase-5-plan-b2-recertification-scheduler`: ночной `@nestjs/schedule` cron (UTC, dormant за `RECERTIFICATION_SCAN_ENABLED=false`) + `pg_try_advisory_xact_lock` + cross-tenant скан (`MvpTenantRunner`); каденс 90/30/7 (`recertification_due`) и 14/7/1 (`course_deadline`) с send-once dedup (`email_deliveries.dedup_key`, migration **0049**); письмо `document_revoked`; `RecertificationScanner` вынесен из request-scoped сервиса. **Phase 5 Plan 5C (frontend-очередь «Нужна переаттестация»)** реализована на ветке `feat/2026-06-07-phase-5c-recertification-queue`: обогащение `GET /recertification-drafts` (`learnerName`/`courseTitle`/`learnerSnils?` через mvp-state резолверы, без миграции) + feature-модуль `features/recertification/` + страница `/admin/recertification` + навигация; объём «только список» (reject + «Проверить сейчас»; approve намеренно не выведен). Стабильный quality gate `pnpm -s ci:check` (Cyrillic-path fallback на isolated backend runs — см. CLAUDE.md Gotchas); миграции до **0049**.

### Current Goal

**Phase 0 — деплой-фундамент пилота** завершён → **PR #235** (ветка `feat/2026-06-08-phase-0-pilot-launch-foundation`): right-sized под соло-владельца — один сервер + Docker Compose + Caddy (авто-HTTPS) + сборка на сервере; 8 артефактов (`apps/frontend/Dockerfile`, `infra/docker-compose.prod.yml`, `infra/Caddyfile`, `infra/.env.production.example`, `.github/workflows/deploy.yml`, `infra/backup.sh`, рунбуки) + harden `scripts/check-env.ts`. **Production auth readiness (A+B)** **слита в `main` (#237)**: A) `EmailMagicLinkEmailSender` — доставка magic-link по SMTP; B) `SeedCredentialHygiene` — прод-хук, обезвреживающий утёкший seed-пароль `Password123!`. Активация ops пилота: `NOTIFICATIONS_EMAIL_ENABLED=true` + реальный `SMTP_*`. Рунбук `infra/bootstrap-admin.md` синхронизирован с этим (§5.115).

### Last Completed Task

**Phase 9 Plan A — SCORM 1.2 импорт + плеер** (2026-06-12, ветка `feat/2026-06-12-phase-9-plan-a-scorm`, §5.119): полный цикл brainstorming → spec (решения D1–D10) → план 17 задач → subagent-driven (two-stage review на каждую пачку) + fix-циклы. Backend: migration **0052** (`learning.scorm_packages`/`scorm_attempts` + `materials.scorm_package_id` + `'scorm'` в `materials_type_chk`; **новых прав нет** — пакеты `materials.write`, launch `materials.read`, commit `progress.recalculate`); чистые модули `parseScormManifest` (fast-xml-parser, отказ SCORM 2004), `scorm-zip-guards` (zip-bomb/traversal/encoded/NUL лимиты + MIME-map), `scorm-content-token` (HMAC base64url); `ScormService` (upload-intent с `maxBytes`, register, **синхронный process: AV-гейт → adm-zip → гард ВСЕХ entries до декомпрессии → putObject per entry**, idempotent, delete с 409-in-use + cleanup; launch с access-chain + единственный attempt + токен-launchUrl; commit cmi → завершение materialProgress); `ScormController` (8 authed) + **unguarded `ScormContentController`** (`:token/*rest`, HMAC-токен в пути, кросс-tenant изоляция по payload, stream+nosniff); files `getReadableFile`/`listObjectKeys`. Frontend: `features/scorm/` (api + чистый cmi-mapping), `/scorm` реестр пакетов (загрузка/обработка/удаление), scorm-опция в форме материала, **`ScormPlayer`** (scorm-again в `window.API`, same-origin iframe, commit на LMSCommit/LMSFinish, resume, ownership-checked cleanup) в курс-вьюере, next.config rewrite, e2e. Девиация: adm-zip вместо unzipper (тестируемость; лимиты сохранены). Холистические уловы review: zip-bomb-порядок гардов, encoded-traversal, Content-Type на presigned PUT (Windows .zip), 2 гонки `window.API` в плеере, prod secret-guard. Изолированные прогоны: frontend **537/537**, backend scorm **69** + mvp.http **78** + dto **125** + files **28** + migrations **50** + env **10**, typecheck 8/8, ESLint clean. Миграции до **0052**. PR не создан на момент записи — см. Current Task. **Предыдущее: Phase 4 Plan B — прокторинг** (2026-06-11, ветка `feat/2026-06-11-phase-4-plan-b-proctoring`, §5.118): полный цикл brainstorming → spec → план 15 задач → subagent-driven (two-stage review на каждую) → финальное холистическое ревью + fix-цикл + верификация фиксов. Backend: коллекция `proctoringRecordings`, `resolveProctoringRequirement` (override ?? флаг), lifecycle start(consent)/chunk-intent/complete/active(nextSequence), гейт + линковка attemptId, админ list/detail с `chunkIssues`, DTO, 7 эндпоинтов (+`PATCH /enrollments/:id/proctoring-override` под `learners.write`), retention-трио в `proctoring/`. Frontend: `features/proctoring/` (recorder state-machine без браузер-API в тестах, retry-once-then-skip с intent-кэшем, resume), `detectStartGate` (дедуп 3 регексов test-player), consent-панель, REC, resume-баннер, админ-плеер со склейкой Blob, навигация, e2e. Изолированные прогоны: backend-кластер **248/248** (10 файлов), миграции **48/48**, frontend таргет **72/72**, typecheck 8/8, ESLint clean; полный фронтенд 504/510 — 6 падений = известный environmental dynamic-import класс (изолированно зелёные, baseline идентичен). **Предыдущее:** **Phase 4 Plan A — идентификация личности (селфи + паспорт)** (2026-06-11, ветка `feat/2026-06-10-phase-4-plan-a-identity-verification`, §5.117): миграция 0050 + коллекция `identityVerifications` + lifecycle (start/upload-intent/submit/review) + гейт `assertIdentityVerificationGate` (412, без коллизии с Wave 1) + files-слой (`UploadIntentOptions`, `deleteObject`/`deleteFile`) + dormant retention-cron 90 дней + 7 эндпоинтов + frontend (`/learner/identity`, `/admin/identity-verifications`, интерстициал, e2e). 13 задач subagent-driven + two-stage review; **финальное холистическое ревью поймало CRITICAL** (read-only `MvpTenantRunner` терял штампы cron → `runWithTenantStateAndSave`) **и IMPORTANT** (заражённый файл брикал админ-ревью → graceful degradation `selfieFileError`/`passportFileError`). Изолированные прогоны зелёные (backend 214/214 + кластеры, frontend 39+, миграции 42/42, typecheck 8/8). **PR #240.** **Предыдущее:** **Production auth readiness (A+B)** (2026-06-08, ветка `feat/2026-06-08-production-auth-readiness`, **PR #237**, §5.114): A) `EmailMagicLinkEmailSender` доставляет magic-link через `MailerService`/SMTP (был log-only); B) `SeedCredentialHygiene` — прод-`OnApplicationBootstrap`-хук, ротирует утёкший seed-хеш `d845591…` → `disabled:<hex>` (прицельно, идемпотентно, non-prod no-op); парольный вход оставлен по решению владельца. 4 TDD-задачи subagent-driven + review (поймал/исправил SQL-дупликацию в гигиене → `RETURNING id` через `db.query`); backend `tsc` чист, IAM-регрессия 14 + новые наборы 8. **Слит (#237, 2026-06-08)**; рунбук-синхронизация §5.115 → **#238**. **Предыдущее (Phase 0): pilot launch foundation** (2026-06-08, ветка `feat/2026-06-08-phase-0-pilot-launch-foundation`, **слит #235**): 8 артефактов деплоя (single-VPS Docker+Caddy, build-on-server CD) + harden `check-env` + фикс 4 Next-15 route-param багов; brainstorm→spec→plan→8 задач subagent-driven + review (поймал маскировку `ignoreBuildErrors`, добавил tenant-id build-arg). 🚨 вскрыл 2 находки (magic-link log-only; seed `Password123!`) → закрыты auth-веткой (#237). **Предыдущее:** **Фикс pre-existing e2e `aggregateReviewerQueue` snapshot-shape** (2026-06-07, §5.113, ветка `fix/2026-06-07-reviewer-queue-e2e-snapshot` от main): закрыт known-failure (§5.110/§5.112) — `attemptAnswers: []`+`questions: []` в snapshot-литерал теста `admin-assessment-surface.e2e` + расширен локальный cast-тип; **backend untouched**; таргет-тест зелёный, ESLint clean. **NB для следующего агента:** PR #233 (Phase 5C) слит в `main` БЕЗ этого фикса (внешний `git reset` отбросил коммит до сквоша) → восстановлено cherry-pick'ом (`23e4743`), ожидает PR. **Предыдущее:** **Phase 5 Plan 5C — frontend-очередь «Нужна переаттестация»** (2026-06-07, ветка `feat/2026-06-07-phase-5c-recertification-queue`, §5.112, слит #233): backend-обогащение списка (`resolveLearnerDisplay` + `listDrafts`→`RecertificationDraftView` с `learnerName`/`courseTitle`, без миграции) + feature-модуль `features/recertification/` + страница `/admin/recertification` + навигация + e2e; объём «только список» (reject + «Проверить сейчас»; approve намеренно не выведен). 9 задач TDD subagent-driven (кластеры backend/frontend-core/screen) + two-stage review + holistic opus-review (READY TO MERGE, 0 Critical/Important); backend reminder-recipients 8 + recert-service 8 + mvp.http.integration 42, frontend format 10 + api.contract 5 + e2e 4; `pnpm typecheck` 8/8, ESLint clean. Review-фиксы: `resolveCourseTitleByVersion` тесты, `formatRemaining` NaN-guard, `reject` nullable-тип. Ожидает PR. **Предыдущее: Phase 5 Plan 5B-2 — recertification scheduler + reminder cadence** (2026-06-07, ветка `feat/2026-06-06-phase-5-plan-b2-recertification-scheduler`, §5.111): ночной cron + advisory-lock + cross-tenant скан (`MvpTenantRunner`) + каденс 90/30/7 & 14/7/1 (send-once `dedup_key`, migration 0049) + `document_revoked` listener + `RecertificationScanner`-рефактор; 15 задач TDD subagent-driven + two-stage review; full `tsc` чисто, таргет+регрессии зелёные; review поймал DI-провайдер (Task 10), UTC-cron (Task 12), DRY (Task 13). Ожидает PR. **Предыдущее: Визуальная дизайн-система (читаемость в приоритете)** (2026-06-06, ветка `feat/2026-06-06-visual-design-system` от свежего `origin/main`, §5.110): токены navy + читаемый синий `#1e40af` + холодные нейтрали (золото убрано по фидбэку владельца «плохо читаема»; **контраст всех пар измерен ≥ WCAG AA** — тело 18:1/14.6:1, минимум 5.37:1), шрифты Golos Text/PT Serif через `next/font` (раньше шрифт не грузился вовсе), герой «Следующий шаг» (`next-step-card.tsx`, виден на `/learner`), новый паттерн `.ui-callout`, чистка хардкод-цветов (вкл. баг тёмной темы в `tz-links` + theme-blind `calendar`). Всё через токены `packages/ui/src/tokens` + `styles/foundation.ts` → раскатано по ~40 экранам автоматически. UI-тесты 9/9, learner-home 26/26, typecheck ui+frontend + ESLint чисто. Ожидает PR. **Предыдущее (roadmap): Phase 5 Plan 5B — recertification foundation (validity stamping + recertification_drafts + scan + approve/reject endpoints)** (2026-06-05, ветка `feat/2026-06-05-phase-5-plan-b-recertification`; subagent-driven-development по [плану](docs/superpowers/plans/2026-06-05-phase-5-plan-b-recertification-cycle.md)). Все 9 задач: migration **0048** (`course_versions.recertification_period_months` + `generated_documents.valid_until` + `learning.recertification_drafts` + права `recertification.read/write`); чистый `addMonths/addDays` util (month-end clamp); writable `recertificationPeriodMonths` на program-meta; штамповка `valid_until = completed_at + период` (producer-resolved: `MvpService` → payload → issuance-listener → task → completeTask → document); `RecertificationDraftsRepository` (singleton: in-memory + postgres, идемпотентность по `(tenant,learner,sourceDoc)`); `RecertificationService` (pure `scanForRecertification(asOf, docs, 90)` через `DocumentsTenantRunner` → idempotent draft → письмо `recertification_due` слушателю+заказчику; `approveDraft` → reuse `createBulkEnrollments`; `rejectDraft`); закрыт 5A-gap пустого `{{courseTitle}}` (резолв названия курса на producer); admin endpoints `GET /recertification-drafts`, `POST /recertification/scan`, `POST /recertification-drafts/:id/{approve,reject}` + permission-boundary в `mvp.http.integration.test.ts`. Тесты: date-math 4, drafts-repo 5, recert-service 9, documents.service 46, issuance-listener 11, email-notifications 13, mvp.http.integration 42, dto-validation 104 (всего 234 таргет); `pnpm typecheck` 8/8; ESLint clean. Финальный code-review поймал и исправил 2 edge-bug'а (approve idem-key per-group; try/catch вокруг dispatch в scan). Handoff §5.106. **Предыдущее:** Phase 5 Plan 5A — notification foundation (PR #228, §5.105); Wave 2 Plan C — ЕИСОТ (#226, §5.104); Wave 2 Plan A — ФРДО (#225, §5.103).

### Current Task

**Phase 0 readiness плейбук** готов на ветке `docs/2026-06-14-phase-0-readiness-spec` (§5.125; спек `docs/superpowers/specs/2026-06-14-phase-0-foundation-readiness-design.md` + план `docs/superpowers/plans/2026-06-14-phase-0-foundation-readiness.md`, 8 задач, все чек-боксы закрыты). 7 owner-facing документов в `docs/phase-0/` + строка в PLANS_STATUS. Docs-only, тестов нет (по природе плана). Ожидает PR. **Предыдущее: Phase 10 Track A — Excel-конструктор отчётов** на ветке `feat/2026-06-13-phase-10a-excel-report-builder` (§5.121; spec `docs/superpowers/specs/2026-06-13-phase-10a-excel-report-builder-design.md` + plan `docs/superpowers/plans/2026-06-13-phase-10a-excel-report-builder.md`, 10 задач TDD). Read-model **без миграции/нового права** (по образцу analytics-dashboard, переиспользует `enrollments.read`/`write`): декларативный реестр сущностей + чистый движок `buildReport` + обобщённый exceljs-writer + 6 endpoints `reports/builder/{entities,preview,export,templates,templates/:id}` + новая MVP-state коллекция `reportTemplates`; страница `/admin/reports/builder` (выбор сущности/полей/фильтров → превью → скачивание XLSX → сохранение/загрузка/удаление шаблонов). v1 = две сущности **ученики + назначения** (`documents` отложена — D-A5); XLSX отдаётся base64-в-конверте без S3 (D-A3). Изолированные прогоны зелёные: backend 33 + http-integration 85, frontend 14, contracts 7, typecheck 8/8, ESLint clean. **Слит #245.** **Track B (WCAG) слит (#246); Track C (PWA + web-push) реализован → PR #248** (этот мёрдж `main` → phase-10c; §5.123). **Phase 9 полностью слита (#242 + #243).**

### Next Task

**Phase 10 полностью реализована: Track A слит (#245), Track B слит (#246), Track C → PR #248 (этот мёрдж).** Дальше — **deploy-execution** (владелец: сервер + DNS + SMTP, прогон `infra/server-setup.md` + `infra/bootstrap-admin.md`). Ops-активация: retention-cron'ы `IDENTITY_IMAGE_RETENTION_ENABLED=true` (90 дней) + `PROCTORING_VIDEO_RETENTION_ENABLED=true` (365 дней); SCORM-env `SCORM_CONTENT_TOKEN_SECRET`/`SCORM_PACKAGE_MAX_BYTES`/`SCORM_CONTENT_TOKEN_TTL_SECONDS`. **Отложено по решению владельца:** ЕСИА, live-оператор видео-ИД, НЭП (Phase 6), Pruffme/ЮKassa (Phase 7/8), clamav, управляемые сервисы. **Phase 10 Track A отложенное:** `documents`-сущность отчётов, CSV-формат, drill-down модалки, S3/async-экспорт для очень больших отчётов.

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
- ✅ **Полное приложение бутится; логин работает** (исправлено 2026-06-06, §5.108): DI-«deadlock» был из-за того, что `tsx`/esbuild не эмитит `emitDecoratorMetadata` → type-based DI без `@Inject` виснет. Все инъекции переведены на явный `@Inject`, `CommunicationModule` импортирует `IamModule`, добавлен regression-guard. `pnpm dev:web` → `Nest application successfully started`, логин end-to-end OK.
- ⚠️ **Остаток (Issue 4):** цепочка миграций `0003`/`0004`/… не накатывается на свежую БД из коробки (паттерн «FK на `(tenant_id,id)` до UNIQUE») — нужен consolidated baseline. `DB_MIGRATIONS_ENABLED` (`z.coerce.boolean`) — **исправлен**. Dev-БД развёрнута обходным путём (FK-safe IAM/audit-миграции + запись всех checksum'ов). Детали — [LMS_AGENT_HANDOFF.md](LMS_AGENT_HANDOFF.md) §13 Issue 3 (resolved) + Issue 4, §5.108.

### Last Updated By

executing-plans (этой сессии): **Phase 0 readiness плейбук** — некодовый owner-facing артефакт `docs/phase-0/` (7 документов), все 8 задач плана закрыты; поправка после сверки с записью владельца 2026-06-08 (бренд/домен/лицензия/клиенты уже есть → фокус НЭП+деплой+пилот); §5.125. **Предыдущее:** subagent-driven execution: **Phase 9 Plan A — SCORM 1.2 import + player** (загрузка zip + парсер манифеста + синхронная распаковка adm-zip с zip-bomb/traversal-гардами + раздача контента unguarded-роутом по HMAC-токену в пути (same-origin для iframe) + cmi-прогресс через scorm-again `window.API` → завершение materialProgress; 17 задач TDD, two-stage review per пачку; уловы: zip-bomb-порядок гардов, encoded-traversal/NUL, presigned PUT Content-Type на Windows .zip, 2 гонки `window.API` в плеере, prod secret-guard; девиация adm-zip↔unzipper задокументирована; миграция 0052; §5.119). **Предыдущее:** subagent-driven execution: **Phase 4 Plan B — proctoring** (MediaRecorder 30-сек чанки → presigned PUT; 5-й гейт 412 `proctoring_required`; согласие 152-ФЗ; resume после F5; админ-плеер со склейкой чанков; per-student override UI; dormant 365-дневный retention-cron lock 528_493 write-runner; 15 задач TDD, two-stage review per task; финальное холистическое ревью поймало CRITICAL C1 — мёртвый ретрай чанка + фантомный чанк ломал сборку видео (intent-кэш + per-chunk деградация), I1 — F5-обход записи (resume-баннер), I2 — override без UI (select на странице группы); миграция 0051; §5.118). **Предыдущее:** subagent-driven execution: **Phase 4 Plan A — identity verification** (селфи+паспорт → ручная сверка → гейт итогового экзамена; 13 задач TDD, two-stage review per task, финальное холистическое ревью поймало CRITICAL read-only `MvpTenantRunner` → `runWithTenantStateAndSave` + IMPORTANT graceful degradation на 423/409; миграция 0050; dormant retention-cron 528_492; §5.117). **Предыдущее:** subagent-driven execution: **Phase 0 pilot-launch-foundation** (8 артефактов деплоя, single-VPS Docker+Caddy, build-on-server CD, PR #235) + **Production auth readiness** (`EmailMagicLinkEmailSender` + `SeedCredentialHygiene`; 4 TDD-задачи, review поймал/исправил SQL-дупликацию в гигиене); brainstorm→spec→plan→implement обе; §5.114. **Предыдущее:** subagent-driven execution (Phase 5 Plan 5B-2 — recertification scheduler: @nestjs/schedule UTC-cron + pg_try_advisory_xact_lock + cross-tenant MvpTenantRunner + 90/30/7 & 14/7/1 каденс с send-once dedup_key (migration 0049) + document_revoked listener + RecertificationScanner-рефактор; 15 задач TDD, two-stage review поймал/исправил DI-провайдер, UTC-cron, DRY; full tsc чисто, регрессии зелёные; §5.111). **Предыдущее:** frontend-design execution (визуальная дизайн-система: navy+синий токены, Golos Text/PT Serif шрифты, герой «Следующий шаг», `.ui-callout`; убрано золото и пересобрана палитра под читаемость по фидбэку владельца — контраст измерен ≥ WCAG AA; чистка хардкод-цветов; временная витрина `/design-preview` создана и удалена; spawn_task на чужой pre-existing баг `aggregateReviewerQueue`; §5.110, ветка `feat/2026-06-06-visual-design-system`). **Предыдущее:** subagent-driven execution (Phase 5 Plan 5B — recertification foundation: migration 0048 + valid_until стамповка (producer→listener→task→document) + RecertificationDraftsRepository + RecertificationService scan/approve/reject + recertification_due email + courseTitle-fix + admin endpoints + permission-boundary tests; все 9 задач; review поймал и исправил баг чтения документов через DocumentsTenantRunner; backend таргет-набор зелёный 232 теста; pnpm typecheck 8/8, ESLint clean)

### Last Updated At

2026-06-14 (Phase 0 readiness плейбук, docs-only, ветка `docs/2026-06-14-phase-0-readiness-spec`, §5.125). **Предыдущее:** 2026-06-12 (Phase 9 Plan A — SCORM 1.2 импорт + плеер, ветка `feat/2026-06-12-phase-9-plan-a-scorm`, §5.119; миграции до 0052). **Предыдущее:** 2026-06-11, вечер (Phase 4 Plan B — прокторинг, слит #241, §5.118; Plan A #240 слит утром). **Предыдущее:** 2026-06-11 (Phase 4 Plan A — идентификация личности, PR #240, §5.117). **Предыдущее:** 2026-06-08 (Phase 0 деплой-фундамент слит #235; Production auth readiness A+B → PR #237, §5.114). **Предыдущее:** 2026-06-07 (фикс e2e `aggregateReviewerQueue` §5.113 слит #234; Phase 5 Plan 5C §5.112 слит #233; Plan 5B-2 §5.111; визуальная дизайн-система §5.110 PR #231; Phase 5 Plan 5B PR #229; Plan 5A #228, Wave 2 A/B/C #222-226)

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
