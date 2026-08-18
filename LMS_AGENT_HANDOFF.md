# LMS Agent Handoff

> **Связка с другими агентами:** порядок «продолжай по ТЗ» и что обновлять после сессии — [docs/DOCUMENTATION_MAP.md — протокол передачи](docs/DOCUMENTATION_MAP.md#agent-handoff-protocol). Краткое операционное состояние дублируйте в [README.md](README.md) (блок **AI Agent State**).

## 1. Current Date / Session

- Date: 2026-08-18 (UTC+3), последняя запись — §5.298 (фаза 6 редизайна: срез 7, PR #533)
- Agent: Claude Code
- Repository: `D:/Создание LMS/Cursor LMS/cdoprof-`
- Branch, if known: `main`
- Commit hash before work, if available: `8157adc74c9fadba6f076bcfa0e2e84f93394b1d` (базовый HEAD; при появлении коммита после правок — дополнить вручную)
- Commit hash after work, if available: `c22736127d100c06a38a8ff222e34c6d25cf8c21` (HEAD до коммита правок §5.73–§5.81; после коммита уточнить `git rev-parse HEAD`)

## 2. Project Overview

Краткое описание проекта:

- назначение LMS: корпоративная LMS/СДО платформа с RBAC, курсами, прогрессом, assessment и enterprise-модулями;
- общий стек: TypeScript monorepo (`pnpm` + `turbo`);
- frontend: Next.js (`apps/frontend`);
- backend: NestJS (`apps/backend`);
- database: PostgreSQL + SQL migrations (`apps/backend/migrations`);
- auth: IAM permissions/roles + session validation;
- deployment / docker: `infra/docker-compose.yml`, Dockerfile в сервисах;
- test setup: Vitest, ESLint, TypeScript, полный пайплайн `pnpm -s ci:check`.

## 3. Repository Structure

Ключевые директории и файлы:

- `apps/frontend` — Next.js UI и роль-ориентированные страницы LMS
- `apps/backend` — NestJS API, IAM, MVP/LMS домены, миграции
- `apps/realtime` — realtime service
- `apps/worker` — background processing
- `packages/api-contracts` — API контракты
- `packages/shared-types` — shared types
- `packages/ui` — UI библиотека
- `docs` — документация по архитектуре/операциям/тестам
- `docs/DOCUMENTATION_MAP.md` — карта источников правды (ТЗ / трассировка / README / operational docs), чтобы не противоречить друг другу и не размножать дубли
- `infra` — docker-compose и инфраструктурный слой
- `README.md` — точка входа и AI Agent State

## 4. Existing Functionality Observed

Что уже было в проекте до изменений:

- auth: login/logout/refresh/me/sessions + security checks
- users: управление пользователями и ролями
- roles: permission-driven access на backend и frontend
- courses: list/detail/create/update + publish/archive
- lessons/materials/modules: базовая LMS структура реализована
- enrollments: создание и lifecycle статусов
- progress: учёт прогресса по материалам
- assignments/quizzes: базовые assessment сущности/flows
- admin: admin маршруты и страницы
- teacher dashboard: teacher-related маршруты есть
- student dashboard: learner/student маршруты есть
- API: модульный NestJS с guards/interceptors/filters
- database: migration-based SQL структура
- UI: Next.js App Router + shared UI package

## 5. Work Completed In This Session

### 5.1 Усиление guard-level security regression для LMS прав доступа

- Summary: расширены unit-тесты `PermissionGuard` для ключевых authz границ.
- Files changed:
  - `apps/backend/src/modules/iam/permission.guard.test.ts`
- Details:
  - Добавлен сценарий `permission_denied` при отсутствии нужного permission (`courses.write`).
  - Добавлен сценарий `auth_required` для неаутентифицированного запроса с проверкой, что не вызываются session/permission сервисы.
  - Сохранены и подтверждены текущие сценарии `session_inactive` и success.
- Notes:
  - Runtime auth-flow не менялся, добавлено только тестовое покрытие.

### 5.2 Добавлен HTTP integration regression suite для LMS `mvp` permission boundaries

- Summary: добавлен новый HTTP integration тест для `mvp`-эндпоинтов (`courses`, `progress/materials`).
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.http.integration.test.ts`
- Details:
  - Покрыты сценарии:
    - `auth_required` без bearer token;
    - `permission_denied` при PATCH прогресса без `progress.recalculate`;
    - `session_inactive` при отозванной сессии;
    - успешный PATCH при наличии нужного permission.
  - Тест использует тестовый Nest app с envelope/filter/interceptor, близко к реальному HTTP поведению.
- Notes:
  - Public API и бизнес-логика не изменялись; добавлен безопасный regression coverage.

### 5.3 Полная валидация quality gates после изменений

- Summary: выполнен полный прогон `ci:check`, статус зелёный.
- Files changed:
  - `LMS_AGENT_HANDOFF.md`
- Details:
  - Успешно пройдены lint/typecheck/contracts/tests/build.
  - Целевые проверки нового тестового покрытия также прошли.
- Notes:
  - На момент завершения итерации build/test blockers отсутствуют.

### 5.4 Стабилизация backend test-suite против таймаутов в полном `ci:check`

- Summary: исправлен реальный блокер `ci:check` — массовые `Hook timed out in 30000ms` в backend integration/contract тестах при полном монорепо прогоне.
- Files changed:
  - `apps/backend/vitest.config.ts`
  - `LMS_AGENT_HANDOFF.md`
- Details:
  - В `apps/backend/vitest.config.ts` добавлены:
    - `hookTimeout: 60000`
    - `testTimeout: 30000`
  - Это устранило флапающие таймауты при инициализации Nest приложения в более тяжёлом параллельном окружении `turbo` + `vitest`.
  - После изменения:
    - `pnpm --filter @cdoprof/backend test` — passed (49 files / 180 tests);
    - `pnpm -s ci:check` — passed.
- Notes:
  - Runtime-код LMS/API/БД не менялся; изменение ограничено тестовой конфигурацией.

### 5.5 Доменная защита прогресса: запрет обновления progress для enrollment вне курса

- Summary: устранён backend security/data-integrity gap в LMS progress flow — теперь нельзя обновлять прогресс по материалу, если `enrollment.group` не связан с курсом этого материала через `group_courses`.
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.service.ts`
  - `apps/backend/src/modules/mvp/mvp.service.test.ts`
- Details:
  - В `upsertMaterialProgress()` добавлена проверка связи `groupId + courseId` в `groupCourses`.
  - При отсутствии связи возвращается `PreconditionFailedException` с `code: domain_rule_violation`.
  - Обновлены тесты:
    - позитивный сценарий прогресса теперь явно создаёт `group-course` link;
    - добавлен негативный regression test на попытку обновления progress без этой связи.
  - Результат: исключён сценарий некорректного начисления прогресса по «чужому/несвязанному» enrollment.
- Notes:
  - Изменение влияет на runtime поведение backend в сторону более строгой валидации доменной целостности.

### 5.6 Доменная защита assignment submissions: проверка связи enrollment с курсом задания

- Summary: закрыт аналогичный integrity/security gap в assignment-потоке — нельзя создать submission, если enrollment не связан с course задания через `group_courses`.
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.service.ts`
  - `apps/backend/src/modules/mvp/mvp.service.test.ts`
- Details:
  - В `createAssignmentSubmission()` добавлены проверки:
    - existence assignment (`getById` по `assignmentId`);
    - наличие связи `enrollment.groupId` ↔ `assignment.courseId` в `groupCourses`.
  - При нарушении возвращается `PreconditionFailedException` с `code: domain_rule_violation`.
  - Тесты обновлены:
    - существующие assignment flow tests приведены к корректной доменной модели (добавлен `group-course` link);
    - добавлен отдельный regression test на отклонение submission без связи enrollment-course.
- Notes:
  - Это runtime-усиление backend-валидации; public path/method API не менялись.

### 5.7 Доменная защита test attempts: проверка связи enrollment с курсом теста

- Summary: закрыт integrity gap в assessment attempts — запуск попытки теста теперь возможен только если `enrollment.group` связан с `test.course` через `group_courses`.
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.service.ts`
  - `apps/backend/src/modules/mvp/mvp.service.test.ts`
  - `apps/backend/src/modules/mvp/mvp.concurrency.test.ts`
- Details:
  - В `startAttempt()` добавлена проверка linkage `groupId + courseId`.
  - При нарушении возвращается `PreconditionFailedException` с `code: domain_rule_violation`.
  - Добавлен unit regression test на отклонение startAttempt без linkage.
  - Обновлён `mvp.concurrency` тест, чтобы соответствовать новой доменной инварианте (добавлен `group-course` link перед enrollment).
- Notes:
  - Это runtime security/data-consistency hardening без изменения API-контрактов по методам/путям.

### 5.8 Hardening assignment review flow: только для submitted submissions и без дубликатов

- Summary: усилены доменные правила review-потока для заданий: нельзя создать review для draft submission и нельзя создать второй review для того же submission.
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.service.ts`
  - `apps/backend/src/modules/mvp/mvp.service.test.ts`
- Details:
  - В `createAssignmentReview()` добавлены проверки:
    - submission status должен быть `submitted` или `under_review`;
    - review для `submissionId` должен быть уникальным.
  - На нарушения возвращаются:
    - `PreconditionFailedException` (`domain_rule_violation`) для невалидного статуса submission;
    - `ConflictException` (`conflict`) для дубликата review.
  - Добавлен regression test:
    - отклонение review для draft submission;
    - успешное создание review после submit;
    - отклонение повторного review для того же submission.
- Notes:
  - Изменение runtime-логики повышает целостность evaluation workflow и предотвращает дублирующую оценку.

### 5.9 Lifecycle lock для assignment reviews после completion

- Summary: зафиксирован lifecycle assignment review после завершения: completed review нельзя изменять или завершать повторно.
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.service.ts`
  - `apps/backend/src/modules/mvp/mvp.service.test.ts`
- Details:
  - В `updateAssignmentReview()` добавлен запрет модификации review со статусом `completed`.
  - В `completeAssignmentReview()` добавлены проверки:
    - повторный complete запрещён;
    - complete разрешён только для статуса `in_review`.
  - Добавлен regression test на:
    - запрет update после complete;
    - запрет второго complete.
- Notes:
  - Усилена консистентность review lifecycle и предотвращены пост-фактум изменения оценки.

### 5.10 Подготовка финального ТЗ: `SDOPROF_TZ_FINAL.md`

- Summary: создан полный структурированный документ ТЗ для LMS/СДО Проф в формате, пригодном для передачи в разработку и декомпозиции в backlog.
- Files changed:
  - `SDOPROF_TZ_FINAL.md`
  - `LMS_AGENT_HANDOFF.md`
- Details:
  - Подготовлен единый документ из 42 разделов (назначение, роли, безопасность, API, интеграции, NFR, архитектура, доменная модель, этапы, backlog, риски).
  - Учтён фактический контекст текущего репозитория (`README.md`, текущий handoff, реализованные backend/frontend модули).
  - Явно зафиксированы ограничения: исходное ТЗ в сообщении отсутствовало (placeholder), поэтому обязательные требования, зависящие от него, помечены как `Требует уточнения`.
  - Добавлены секции «Что было взято/изменено/добавлено», «Рекомендуемый MVP», «Готовность к передаче в разработку».
- Notes:
  - Изменения документационные, runtime-код в этой подзадаче не менялся.

### 5.11 Валидация score в assignment review относительно assignment.maxScore

- Summary: устранён дефект оценивания — теперь score review валидируется по границам задания (`0..maxScore`) во всех точках review lifecycle.
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.service.ts`
  - `apps/backend/src/modules/mvp/mvp.service.test.ts`
- Details:
  - Добавлен приватный валидатор `validateAssignmentReviewScore()` в `MvpService`.
  - Проверка внедрена в:
    - `createAssignmentReview()`;
    - `updateAssignmentReview()`;
    - `completeAssignmentReview()`.
  - При нарушениях возвращается `BadRequestException`:
    - `score must be non-negative`;
    - `score exceeds assignment maxScore`.
  - Добавлен regression test:
    - отклонение `createAssignmentReview` при score > maxScore;
    - отклонение `updateAssignmentReview` при score > maxScore.
  - Обновлены существующие тестовые фикстуры assignments (явный `maxScore`), чтобы соответствовать новой доменной валидации.
- Notes:
  - Изменение runtime-логики улучшает консистентность результатов проверки и предотвращает некорректные оценки.

### 5.12 Расширение regression-покрытия на отрицательные score в review lifecycle

- Summary: добавлены тесты, фиксирующие запрет отрицательного score во всех релевантных шагах review lifecycle.
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.service.test.ts`
  - `LMS_AGENT_HANDOFF.md`
- Details:
  - В существующий test-case `validates assignment review score boundaries...` добавлены проверки:
    - `createAssignmentReview` с `score < 0` отклоняется;
    - `updateAssignmentReview` с `score < 0` отклоняется;
    - `completeAssignmentReview` с `score < 0` отклоняется.
  - Все проверки ожидают `BadRequestException`.
  - Результат: отрицательные оценки покрыты regression-тестами для create/update/complete.
- Notes:
  - Runtime-код не менялся в этой подитерации; усилено тестовое покрытие доменной валидации.

### 5.13 Соответствие ТЗ §38 (Security/Integration tests) и BL-010: HTTP regression по доменным инвариантам MVP

- Summary: добавлены интеграционные HTTP-тесты против **реального** `MvpController` + in-memory persistence; исправлен DI-баг в `MvpRequestPersistenceInterceptor` (Nest не внедрял `TenantSerialGateway` в request-scoped interceptor без явного `@Inject`).
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts` (новый)
  - `apps/backend/src/modules/mvp/infrastructure/mvp-request-persistence.interceptor.ts`
  - `LMS_AGENT_HANDOFF.md`
- Details (связь с `SDOPROF_TZ_FINAL.md`):
  - §13 / этап 4–5 LMS: проверка доступа к assessment и целостность enrollment↔course через `group_courses` на **HTTP-уровне** (`412` + `domain_rule_violation` для submission/attempt без связи; запрет review для draft; `400` + `validation_error` при score > `maxScore`).
  - §38 «Security» / BL-010 «API hardening»: фиксируем инварианты **object-level / cross-course leakage** для ключевых POST-эндпоинтов, уже реализованных в `MvpService`.
- Notes:
  - В тестовом Nest-приложении `ValidationPipe` с `whitelist: false` (MVP DTO — TS-интерфейсы без class-validator; иначе тело запроса обнуляется при `whitelist: true` — это ограничение тестового harness, не изменение прод-конфига).
  - Исправление `@Inject(TenantSerialGateway)` — **боевой runtime-фикс**: без него `tenantGateway` был `undefined`, что потенциально давало 500 на защищённых MVP-маршрутах при определённом порядке DI.

### 5.14 ТЗ §6/§12/BL-010: привязка слушателя к IAM и анти-IDOR на мутациях learner-контекста

- Summary: добавлено опциональное поле профиля слушателя **`linkedIamUserId`** (соответствие `JWT.sub`); при его наличии мутации прогресса, субмиссий и попыток в контексте этого слушателя разрешены только совпадающему пользователю. Ужесточена консистентность тела **`learnerId`** с зачислением. Добавлены unit + HTTP regression тесты; HTTP — сценарий **PATCH progress без group-course**.
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.types.ts`
  - `apps/backend/src/modules/mvp/mvp.dto.ts`
  - `apps/backend/src/modules/mvp/mvp.service.ts`
  - `apps/backend/src/modules/mvp/mvp.service.test.ts`
  - `apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts`
  - `LMS_AGENT_HANDOFF.md`
- Details:
  - `POST/PATCH`-поток learner: необязательные `linkedIamUserId` на create/update (registry DTO общий со справочниками → поле безопасно игнорируется не-learners кодом).
  - `createAssignmentSubmission`: обязателен `learnerId` в теле; должен совпадать с `enrollment.learnerId`; при `linkedIamUserId` дополнительно `actorId` (JWT sub) должен совпадать.
  - Аналогично: `upsertMaterialProgress`, `startAttempt` (валидируется непустой `learnerId` в теле + соответствие enrollment), обновление/сабмит субмиссии, сохранение/сабмит попытки.
- Notes:
  - **Breaking (контракт клиента):** `POST /assignment-submissions` без `learnerId` теперь даёт **`400`** `validation_error` (поле уже было в DTO типов, но ранее фактически не требовалось).
  - Пока `linkedIamUserId` не задан у слушателя, поведение как раньше (опора только на RBAC permission).

### 5.15 Анти-IDOR на чтение assessment (GET + list scoped)

- Summary: из HTTP передаются `userId` и список **`permissions`**, который **`PermissionGuard`** кладёт в `RequestContext` после `resolvePermissions`. Для строк с **`linkedIamUserId`**: **GET**/`list` сужены к своему слушателю. Обход сужения **только чтения** — IAM permission **`assessment.read.cross_learner`** (миграция `0025_…`, роли `platform_admin` / `tenant_admin` / `manager` / `methodist` в `tenant_demo`). Мутации без этого bypass.
- Files changed:
  - `apps/backend/src/common/context/request-context.ts`
  - `apps/backend/src/modules/iam/permission.guard.ts`
  - `apps/backend/src/modules/iam/services/iam.service.ts` (fallback permission в in-memory)
  - `apps/backend/migrations/0025_assessment_read_cross_learner_permission.sql`
  - `apps/frontend/src/lib/auth/permission-map.ts`
  - `apps/backend/src/modules/mvp/mvp.service.ts`
  - `apps/backend/src/modules/mvp/mvp.controller.ts`
  - `apps/backend/src/modules/mvp/mvp.service.test.ts`
  - `apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts`
  - `LMS_AGENT_HANDOFF.md`
- Notes:
  - Сервисные вызовы без `access` ведут себя как раньше на уровне домена (нет дополнительного gate).
  - HTTP integration: `assessment.read.cross_learner` выдаётся только для `sub=u_domain_http_actor`, не для токенов «студентов» в IDOR-сценарии.
  - **`learners.act_as`** расширяет обход сужения **чтения** так же как `cross_learner`; см. §5.16.

### 5.16 Делегирование мутаций: `learners.act_as`

- Summary: IAM permission **`learners.act_as`** (миграция **`0026_…`**) снимает проверку «`JWT.sub` = `linkedIamUserId`» для мутаций: **`upsertMaterialProgress`**, **`startAttempt`**, **`saveAnswer`/attempt answers**, **`submitAttempt`**, **`createAssignmentSubmission`**, **`updateAssignmentSubmission`**, **`submitAssignmentSubmission`**. Доменные инварианты (`learnerId` vs enrollment, `group_courses`) сохраняются. В HTTP permissions приходят из **`PermissionGuard`** → **`context.permissions`**.
- Files changed:
  - `apps/backend/migrations/0026_learners_act_as_permission.sql`
  - `apps/backend/src/modules/iam/services/iam.service.ts` (fallback permission)
  - `apps/backend/src/modules/mvp/mvp.service.ts`
  - `apps/backend/src/modules/mvp/mvp.service.test.ts`
  - `apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts` (staff sub + право в mock)
  - `apps/frontend/src/lib/auth/permission-map.ts` (+ tests)
  - `LMS_AGENT_HANDOFF.md`
- Notes:
  - HTTP suite: **`learners.act_as`** добавляется в mock только вместе с staff `sub` (`u_domain_http_actor`).

### 5.17 Аудит: `metadata.delegated` при `learners.act_as`

- Summary: колонка **`audit.audit_log.metadata`** (jsonb) + запись **`{ delegated: true, learnerId, viaPermission: 'learners.act_as' }`** в audit-метод **`MvpService`** для мутаций, где действительно сработало делегирование (есть **`linkedIamUserId`**, у актора есть право **`learners.act_as`**, **`actorId`** не равен **`linkedIamUserId`** слушателя).
- Files changed:
  - `apps/backend/migrations/0027_audit_log_metadata.sql`
  - `apps/backend/src/modules/audit/audit.service.ts`
  - `apps/backend/src/modules/mvp/mvp.service.ts`
  - `apps/backend/src/modules/mvp/mvp.service.test.ts` (submit submission + assert metadata)

### 5.18 HTTP-негативы IDOR (чтение), class-validator MVP, общий ValidationPipe

- Summary: добавлены HTTP-кейсы **`GET /attempts/:id`** и **`GET /exam-results/by-enrollment/:id`** без **`cross_learner`/`learners.act_as`** (403 для чужого JWT). Ключевые MVP body переведены в **class-validator**-классы; доменный HTTP harness использует **`createAppValidationPipe()`** как прод. Вынесено **`apps/backend/src/common/app-validation.pipe.ts`** (`createAppValidationPipe` + **`assertValidDto`**: явный `validateSync` в **`MvpController`** для критичных DTO, т.к. в Vitest/Nest цепочке `emitDecoratorMetadata` на параметрах не всегда доходит до глобального `ValidationPipe`). **`main.ts`** подключён через `createAppValidationPipe`.
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.dto.ts`, `mvp.controller.ts`
  - `apps/backend/src/main.ts`, `apps/backend/src/common/app-validation.pipe.ts`
  - `apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts`, `mvp.dto-validation.test.ts`

### 5.19 Frontend: guard действий по `assessment.read.cross_learner` и `learners.act_as`

- Summary: **`AssessmentDashboardScreen`** — колонки «Слушатель и доступ»: ссылки/подсказки делегирования только при соответствующих правах; списки **attempts** / **exam-results** через **`mvpApi`**; попытки запускаются с **`learnerId`** выбранного зачисления. Вынесены **`assessment-permissions.ts`** + unit-тест.
- Files changed:
  - `apps/frontend/src/features/mvp/assessment-permissions.ts`
  - `apps/frontend/src/features/mvp/assessment-permissions.test.ts`
  - `apps/frontend/src/features/mvp/api.ts`, `hooks.ts`, `screens.tsx`

### 5.20 Vitest: `test.projects` вместо workspace; смягчение флейка backend

- Summary: удалён **`vitest.workspace.ts`**, добавлен корневой **`vitest.config.ts`** с **`test.projects`**; во все подпроекты добавлено **`test.name`** для фильтров. Backend: **`fileParallelism: false`** и скрипт **`vitest run --no-file-parallelism`** для снижения гонки при Nest bootstrap в CI.

### 5.21 BL-010 / handoff §14: полный `assertValidDto` на MVP `@Body` + контракты аудита в api-contracts

- Summary: все оставшиеся тела запросов **`MvpController`** (PUT/PATCH/POST), которые раньше шли как «сырые» интерфейсы или inline-типы, переведены на **`@Body() raw: unknown` + `assertValidDto(...)`** в паре с уже существующими class-validator-классами в **`mvp.dto.ts`** (в т.ч. **`PATCH answers`**, **`PATCH assignments`**, **`PATCH/complete assignment-reviews`**, ранее уже покрытые справочники/курсы/тесты/импорт вопросов). В **`packages/api-contracts`** добавлен модуль **`domains/audit.ts`**: **`AuditLogDelegatedLearningMetadata`**, **`AuditLogRecordContract`** для клиентов, читающих **`audit.audit_log.metadata`** (делегирование **`learners.act_as`**). **`MvpService.createAnswer`** типизирован **`CreateAnswerHttpRequest`**. Трассировка **`docs/TZ_MVP_TRACEABILITY.md`** (строка BL-010) обновлена ссылкой на audit-контракты.
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.controller.ts`
  - `apps/backend/src/modules/mvp/mvp.service.ts` (импорт/сигнатура `createAnswer`)
  - `packages/api-contracts/src/domains/audit.ts`, `packages/api-contracts/src/domains/index.ts`
  - `docs/TZ_MVP_TRACEABILITY.md`
- Notes:
  - **`pnpm -s ci:check`** — зелёный на рабочей копии после правок.

### 5.22 Синхронизация §13 Issue 0 с `SDOPROF_TZ_FINAL.md` v1.6 (§44.1)

- Summary: **Issue 0** переформулирован: внешний эталон заказчика — **medium**, не блокирует пилот; назначение — матрица **MVP-TZ-01** в `TZ_MVP_TRACEABILITY.md` и протокол к §47, без расширения scope без согласования. Обновлены §14 critical #3, §15, §16, §20 next best action.
- Files changed: `LMS_AGENT_HANDOFF.md`, `README.md` (блок AI Agent State).

### 5.23 JWT vs `x-tenant-id`: строгое согласование и исправление маскировки ошибок в `TenantGuard`

- Summary: при валидном Bearer, если передан **`x-tenant-id`**, он должен совпадать с **`tenant_id` в access token** — иначе **`400`** `tenant_header_mismatch`. В блоке `catch` после верификации JWT все **`HttpException`** пробрасываются (раньше **`BadRequestException`** превращался в **`401`** `invalid_token`). Обновлены unit (`tenant.guard.test.ts`) и IAM HTTP regression; **`docs/security-remediation-roadmap.md`** (задача 1).
- Files changed:
  - `apps/backend/src/common/guards/tenant.guard.ts`
  - `apps/backend/src/common/guards/tenant.guard.test.ts`
  - `apps/backend/src/modules/iam/auth.http-regression.e2e.test.ts`
  - `docs/security-remediation-roadmap.md`
- Notes: **`pnpm -s ci:check`** — зелёный после правок.

### 5.24 Cross-tenant: `getById` по паре `(id, tenantId)` + HTTP регресс

- Summary: в **`MvpService`** приватный **`getById`** ищет сущность по **`item.id === id && item.tenantId === tenantId`** (раньше только по `id`, что при коллизии id между арендаторами давало недетерминизм; при чужом tenant без коллизии ответ был **`403`** `tenant_scope_violation`, теперь единообразно **`404`** `not_found`). Добавлены unit-тест на два курса с одним `id` и разными `tenantId`, обновлён тест tenant isolation; в **`mvp.domains.http.integration.test.ts`** — HTTP: JWT `tenant_demo` не читает курс из snapshot **`tenant_other`** (сид через `MemoryMvpPersistenceBackend.snapshots`).
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.service.ts`
  - `apps/backend/src/modules/mvp/mvp.service.test.ts`
  - `apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts`
- Notes: **`pnpm -s ci:check`** — зелёный после правок.

### 5.25 Documents: регресс tenant-scoped `must` (коллизия `id` шаблонов)

- Summary: аудит **`DocumentsService`**: чтение сущностей уже через **`must(arr, tenantId, id)`** (`x.tenantId === tenantId && x.id === id`). Добавлен unit-тест на два шаблона с одним `id` и разными `tenantId` + отсутствие шаблона в чужом tenant — **`documents.service.test.ts`**. **`docs/security-remediation-roadmap.md`** (риск изоляции).
- Files changed:
  - `apps/backend/src/modules/documents/documents.service.test.ts`
  - `docs/security-remediation-roadmap.md`
- Notes: **`pnpm -s ci:check`** — зелёный после правок.

### 5.26 E-sign: регресс tenant-scoped `must` (коллизия `id` заявок)

- Summary: **`EsignService`** уже использует **`must(rows, tenantId, id)`** с фильтром **`x.tenantId === tenantId && x.id === id`**. Добавлен unit-тест на две заявки с одним `id` и разными `tenantId` + отсутствие заявки в чужом tenant — **`esign.service.test.ts`**. **`docs/security-remediation-roadmap.md`** (риск изоляции).
- Files changed:
  - `apps/backend/src/modules/esign/esign.service.test.ts`
  - `docs/security-remediation-roadmap.md`
- Notes: **`pnpm -s ci:check`** — зелёный после правок.

### 5.27 Integrations: регресс tenant-scoped `getTask` (коллизия `id` export-task)

- Summary: **`IntegrationOrchestratorService`** для tenant-scoped сущностей уже использует **`find` по `item.id === id && item.tenantId === tenantId`** (`requireTask`, `getItem`, …). **`Provider`** без tenant — по дизайну. Добавлен unit-тест на два **`ExportTask`** с одним `id` и разными `tenantId` — **`integrations.service.test.ts`**. **`docs/security-remediation-roadmap.md`**.
- Files changed:
  - `apps/backend/src/modules/integrations/integrations.service.test.ts`
  - `docs/security-remediation-roadmap.md`
- Notes: **`pnpm -s ci:check`** — зелёный после правок.

### 5.28 Communication: регресс tenant-scoped `get` / `getDialog` (коллизия `id` между tenant)

- Summary: **`NotificationsService.get`**, **`WebinarsService.get`**, **`ChatService.getDialog`** уже сопоставляют сущность по паре **`tenantId` + `id`** (in-memory и SQL-пути). Добавлены unit-тесты на два объекта с одним `id` и разными `tenantId` — **`communication.service.test.ts`**. **`docs/security-remediation-roadmap.md`** (блок регрессий cross-tenant).
- Files changed:
  - `apps/backend/src/modules/communication/communication.service.test.ts`
  - `docs/security-remediation-roadmap.md`
- Notes: **`pnpm -s ci:check`** — зелёный после правок.

### 5.29 Эксплуатация: smoke по ролям в LAUNCH_RUNBOOK

- Summary: в **`docs/LAUNCH_RUNBOOK.md`** после блока «После деплоя (smoke)» добавлена таблица **минимального ручного smoke** (слушатель / преподаватель / администратор / общие маршруты), согласованная с handoff §14 Medium и маршрутами фронтенда (`/learner/*`, `/teacher/*`, `/reports` и др.).
- Files changed:
  - `docs/LAUNCH_RUNBOOK.md`
- Notes: только документация; **`pnpm -s ci:check`** — зелёный после правок.

### 5.30 README: указатель на backend HTTP integration coverage

- Summary: в **`README.md`** (раздел «Канонический E2E для приёмки ТЗ») добавлена отдельная строка со ссылками на Vitest **HTTP integration** наборы (`mvp` ×2, `documents`, `workspace`, `integrations`, IAM `auth.http-regression`), чтобы закрыть handoff §14 Medium п.2 «синхронизация README с integration coverage» без дублирования полного списка в handoff.
- Files changed:
  - `README.md`
- Notes: только документация; **`pnpm -s ci:check`** — зелёный после правок.

### 5.31 Audit: `list` только с непустым `tenantId` (anti cross-tenant read)

- Summary: **`AuditService.list`** больше не возвращает все in-memory записи и не выполняет SQL «все tenant» при отсутствии фильтра: без непустого **`tenantId`** — **`[]`**; в PostgreSQL только **`where tenant_id = $1`**. Обновлены тесты, вызывавшие **`audit.list()`** без аргумента (**`auth.*.test`**, **`mvp.service.test`**). Unit-покрытие изоляции и SQL-формы — **`audit.service.test.ts`**. **`docs/security-remediation-roadmap.md`**.
- Files changed:
  - `apps/backend/src/modules/audit/audit.service.ts`
  - `apps/backend/src/modules/audit/audit.service.test.ts`
  - `apps/backend/src/modules/iam/auth.service.test.ts`
  - `apps/backend/src/modules/iam/auth.integration.test.ts`
  - `apps/backend/src/modules/iam/auth.security.test.ts`
  - `apps/backend/src/modules/mvp/mvp.service.test.ts`
  - `docs/security-remediation-roadmap.md`
- Notes: **`pnpm -s ci:check`** — зелёный после правок.

### 5.32 BL-001 / security roadmap: контракт на `iam.user_created` и спуф-заголовки

- Summary: закреплена приёмка ТЗ по аудиту создания пользователя; уточнён статус задачи 1 roadmap (**`x-user-id`** не используется в production для identity).
- Files changed:
  - `apps/backend/src/modules/iam/auth.controller.contract.test.ts`
  - `docs/TZ_MVP_TRACEABILITY.md` (строка **BL-001**)
  - `docs/security-remediation-roadmap.md` (задача **1**, блок статуса)
- Details:
  - `makeController` возвращает `{ controller, audit }`; новый кейс проверяет запись **`iam.user_created`** и отсутствие **`passwordHash`** в публичном ответе `createUser`.
  - Таймаут первого контракт-теста **`/auth/me`** увеличен до **45s** (флейк при холодном импорте).
- Notes: **`pnpm -s ci:check`** — зелёный после правок.

### 5.33 Security roadmap P0.3: контракт IAM на `updateUser` и роли

- Summary: расширены контрактные тесты отсутствия утечек **`passwordHash`** / refresh / CSRF в ответах **`AuthController`** для **`PUT users/:id`**, **`GET users/:id/roles`**, **`PUT users/:id/roles`**.
- Files changed:
  - `apps/backend/src/modules/iam/auth.controller.contract.test.ts`
  - `docs/security-remediation-roadmap.md` (задача **3**, статус)
  - `docs/TZ_MVP_TRACEABILITY.md` (строка **BL-010**)
- Notes: **`pnpm -s ci:check`** — зелёный после правок.

### 5.34 Security roadmap P0.2: rehash legacy SHA-256 пароля → scrypt при login

- Summary: после успешной **`verifyPassword`** для формата SQL-seed (**64 hex**, без `$`) выполняется **`IamService.upgradePasswordHash`** с **`hashPassword(plain)`**; добавлены **`isLegacyPwdSha256Hash`** в **`crypto.util.ts`**.
- Files changed:
  - `apps/backend/src/modules/iam/crypto.util.ts`
  - `apps/backend/src/modules/iam/crypto.util.test.ts`
  - `apps/backend/src/modules/iam/services/auth.service.ts`
  - `apps/backend/src/modules/iam/services/iam.service.ts`
  - `apps/backend/src/modules/iam/auth.service.test.ts`
  - `docs/security-remediation-roadmap.md` (задача **2**)
  - `docs/TZ_MVP_TRACEABILITY.md` (**BL-001**)
- Notes: **`pnpm -s ci:check`** — зелёный после правок.

### 5.35 BL-001: аудит `iam.password_rehashed` при миграции пароля login → scrypt

- Summary: при **`upgradePasswordHash`** после legacy **SHA-256** seed пишется **`AuditService.writeCritical`** с действием **`iam.password_rehashed`** и **`metadata`** (`legacy_sha256_seed`, `algorithm: scrypt`); порядок: сначала **`persistRelational`**, затем rehash + аудит.
- Files changed:
  - `apps/backend/src/modules/iam/services/auth.service.ts`
  - `apps/backend/src/modules/iam/auth.service.test.ts`
  - `docs/security-remediation-roadmap.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный после правок.

### 5.36 BL-010 / roadmap §6: контракт `iam.password_rehashed` metadata + статус токенов MVP + liveness

- Summary: в **`@cdoprof/api-contracts`** добавлен **`AuditLogPasswordRehashedMetadata`** для чтения **`metadata`** записей **`iam.password_rehashed`**; в **roadmap** задача **6** помечена как соответствующая критериям на MVP-контуре (cookie refresh + `session-store` без токенов в `localStorage`); в **`health.test.ts`** — явный регресс **`HealthController.live`**. Обновлена **`TZ_MVP_TRACEABILITY`** (**BL-010**).
- Files changed:
  - `packages/api-contracts/src/domains/audit.ts`
  - `docs/security-remediation-roadmap.md` (**§6** статус)
  - `apps/backend/src/modules/health/health.test.ts`
  - `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный после правок.

### 5.37 Roadmap P0 §7: зафиксировано шифрование секретов интеграций + env / тест

- Summary: в коде уже есть **AES-256-GCM** и маскирование ответов; обновлены **roadmap** (пункт **7**, строка приоритетов **P0.7**) со ссылками на сервисы и env; **`apps/backend/.env.example`** — комментарии **`INTEGRATION_CRYPTO_KEYS`** / **`INTEGRATION_CRYPTO_ACTIVE_KEY_VERSION`**; **`integrations.service.test.ts`** — проверки, что в выдаче credential нет ни plaintext, ни **`enc:`** ciphertext; **`TZ_MVP_TRACEABILITY` BL-010** — указатель на контур интеграций.
- Files changed:
  - `docs/security-remediation-roadmap.md`
  - `apps/backend/.env.example`
  - `apps/backend/src/modules/integrations/integrations.service.test.ts`
  - `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный (таблица §10).

### 5.38 UI: deeplink карточки слушателя `/learners/[id]` (handoff §14 High)

- Summary: страница **`app/learners/[id]/page.tsx`** + **`LearnerDetailsScreen`** (**`mvpApi.getLearner`**, **`useLearner`**, зачисления через **`useLearnerCourses`**); ссылки из реестра **`/learners`**; тип **`Learner`** дополнен **`linkedIamUserId`**; **LAUNCH_RUNBOOK** (smoke администратора); **BL-003** в **`TZ_MVP_TRACEABILITY`**.
- Files changed:
  - `apps/frontend/app/learners/[id]/page.tsx`
  - `apps/frontend/app/learners/page.tsx`
  - `apps/frontend/src/features/mvp/screens.tsx`
  - `apps/frontend/src/features/mvp/hooks.ts`
  - `apps/frontend/src/features/mvp/types.ts`
  - `docs/LAUNCH_RUNBOOK.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный (таблица §10).

### 5.39 Roadmap P0 §4–5: `workspaceApi` на `apiRequest`, типы workspace, статус envelope

- Summary: вынесены типы в **`src/features/workspace/types.ts`**, модуль **`workspaceApi`** (**`loadDashboard`**) на **`apiRequest`**; **`app/workspace/page.tsx`** без прямого **`apiClient`**; **`page.utils`** реэкспорт типов; регресс **`workspace/api.test.ts`**; roadmap **§4**, **§5**, строки приоритетов **P0.5–P0.6**; **`TZ_MVP_TRACEABILITY` BL-010** — указатель на **`workspaceApi`**.
- Files changed:
  - `apps/frontend/src/features/workspace/types.ts`
  - `apps/frontend/src/features/workspace/api.ts`
  - `apps/frontend/src/features/workspace/api.test.ts`
  - `apps/frontend/app/workspace/page.tsx`
  - `apps/frontend/app/workspace/page.utils.ts`
  - `docs/security-remediation-roadmap.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный (таблица §10).

### 5.40 BL-010 / roadmap P1 §10: workspace HTTP — tenant scope и `tenant_header_mismatch`

- Summary: в **`workspace.http.integration.test.ts`** добавлены сценарии: **`GET /blockers`** с JWT **`tenant_id: t1`** возвращает seed **`blocker_integration_token_t1`**, без **`blocker_integration_token`** (**`tenant_demo`**); при расхождении **`x-tenant-id`** и токена — **`400`** **`tenant_header_mismatch`**. Обновлены **`docs/security-remediation-roadmap.md`** (§**10** статус), **`TZ_MVP_TRACEABILITY` (BL-010)**.
- Files changed:
  - `apps/backend/src/modules/workspace/workspace.http.integration.test.ts`
  - `docs/security-remediation-roadmap.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный (таблица §10).

### 5.41 SDOPROF §36 / roadmap P1 §10: HTTP regress `GET /health/live` (liveness + envelope)

- Summary: файл **`health.http.integration.test.ts`** — подъём минимального Nest-приложения с **`HealthController`**, глобальный envelope + **`RequestContextInterceptor`**; **`fetch GET …/health/live`** без Bearer — **200**, **`data.status`**, заголовки **`x-request-id`**; обновлены **README** (перечень HTTP integration), **roadmap §10**, **TZ BL-010**.
- Files changed:
  - `apps/backend/src/modules/health/health.http.integration.test.ts`
  - `README.md`
  - `docs/security-remediation-roadmap.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный (таблица §10).

### 5.42 Roadmap §10: HTTP regress `GET /health/ready` (readiness envelope)

- Summary: в **`health.http.integration.test.ts`** моки зависимостей **`HealthController`** (как в успешном кейсе **`health.test.ts`**); **`fetch GET …/health/ready`** без Bearer — **200**, envelope **`data.status` / `checks.database.connected`**, заголовки **`x-request-id`**; дополняет liveness **§5.41** для публичного readiness-контура (**SDOPROF §36**, **BL-010**).
- Files changed:
  - `apps/backend/src/modules/health/health.http.integration.test.ts`
  - `README.md`
  - `docs/security-remediation-roadmap.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный (таблица §10).

### 5.43 Roadmap §10 / §42 риски: HTTP regress неуспешный `GET /health/ready` (503 + error envelope)

- Summary: **`health.http.integration.test.ts`** — общая функция **`bootstrapHealthHttpApp`** (`migrationReadinessHealthy`); второй **`describe`**: **`/health/live`** по-прежнему **200** при «сломанном» readiness; **`GET …/health/ready`** при **`getMigrationReadiness.healthy: false`** — **503**, тело **`{ error: { code: readiness_failed, checks… }, meta }`** (без требования **`x-request-id`** в заголовке на error-path).
- Files changed:
  - `apps/backend/src/modules/health/health.http.integration.test.ts`
  - `README.md`
  - `docs/security-remediation-roadmap.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный (таблица §10).

### 5.44 BL-003 / Handoff §20: unit-тест `MvpBulkEnqueueService` (Rabbit envelope)

- Summary: файл **`mvp-bulk-enqueue.service.test.ts`** — мок **`RabbitMqService.publish`**; проверка **`JOB_EXCHANGE`** / **`JOB_ROUTING_BULK_ENROLLMENT`** (через **`vi.mock('../../env.js')`**), полей **`tenantId`**, **`jobType`**, **`payload`** (в т.ч. **`organizationUnitId`**), передачи **`requestId`** / **`correlationId`**; возврат **`status: queued`**, **`messageId`**. Дополняет HTTP-мок **`mvp.domains.http.integration.test.ts`** точечной регрессией очереди bulk.
- Files changed:
  - `apps/backend/src/modules/mvp/mvp-bulk-enqueue.service.test.ts`
  - `README.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный (таблица §10).

### 5.45 BL-003: HTTP regressions для queued bulk и duplicate idempotency

- Summary: в **`mvp.domains.http.integration.test.ts`** добавлены HTTP-кейсы для **`POST /enrollments/bulk`**: (1) **`deliveryMode: queued`** возвращает **`status=queued`** и вызывает **`MvpBulkEnqueueService.publishBulkJob`**; (2) duplicate **`idempotencyKey`** после immediate-выполнения возвращает сохранённый outcome и **не** публикует задачу повторно. Это закрывает API-level регрессию BL-003 сверх unit-теста enqueue-сервиса.
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts`
  - `README.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный (таблица §10).

### 5.46 BL-010: расширение DTO-validation регрессий для MVP module/material

- Summary: в **`mvp.dto-validation.test.ts`** добавлены сценарии class-validator для **`CreateModuleRequest`** и **`CreateMaterialRequest`**: отрицательный `minViewSeconds` отклоняется, неизвестный `materialType` отклоняется, валидный payload принимается. Это закрывает пункт handoff §20 по валидации `CreateModuleRequest`/`CreateMaterialRequest` на регрессионном уровне.
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.dto-validation.test.ts`
  - `README.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный (таблица §10).

### 5.47 BL-007: listener regression на идемпотентность и failure-аудит

- Summary: в **`enrollment-document-issuance.listener.test.ts`** добавлены регрессии: (1) duplicate completion event для одного enrollment создаёт ровно одну задачу сертификата (идемпотентность); (2) при исключении в `DocumentsTenantRunner` listener пишет аудит **`documents.enrollment_certificate_failed`**. Runtime-логика listener не менялась.
- Files changed:
  - `apps/backend/src/modules/documents/enrollment-document-issuance.listener.test.ts`
  - `README.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный (таблица §10).

### 5.48 BL-008: KPI snapshot HTTP regressions для drill-down флага

- Summary: в **`mvp.domains.http.integration.test.ts`** добавлены HTTP-кейсы `GET /reports/kpi-snapshot`: `include_enrollment_breakdown=true` возвращает `enrollmentBreakdown` (tenant/group-scoped), а запрос без флага не включает breakdown. Это фиксирует API-контракт drill-down на уровне HTTP.
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts`
  - `README.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный (таблица §10).

### 5.49 BL-008: KPI drill-down flag variant `include_enrollment_breakdown=1`

- Summary: в **`mvp.domains.http.integration.test.ts`** добавлен HTTP-кейс для числового флага `include_enrollment_breakdown=1`; подтверждено, что API возвращает `enrollmentBreakdown` (как и для `true`) и сохраняет tenant/group scope.
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts`
  - `README.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный (таблица §10).

### 5.50 BL-008: KPI drill-down negative variant `include_enrollment_breakdown=0`

- Summary: в **`mvp.domains.http.integration.test.ts`** добавлен HTTP-кейс для `include_enrollment_breakdown=0`; подтверждено, что breakdown в ответ не включается (как и при отсутствии параметра). Это закрепляет семантику флага по всем основным вариантам (`true` / `1` / `0` / default).
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts`
  - `README.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный (таблица §10).

### 5.51 BL-003: HTTP validation regression для `deliveryMode`

- Summary: в **`mvp.domains.http.integration.test.ts`** добавлен кейс `POST /enrollments/bulk` с `deliveryMode='async'` (вне допустимых `immediate|queued`): API возвращает **400** с `validation_error`, `MvpBulkEnqueueService.publishBulkJob` не вызывается.
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts`
  - `README.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный (таблица §10).

### 5.52 BL-007: listener tenant isolation regression

- Summary: в **`enrollment-document-issuance.listener.test.ts`** добавлен кейс изоляции арендаторов: certificate binding, созданный в `tenant_other`, не используется при `enrollment completed` в `tenant_demo`; задача документа не создаётся, аудит фиксирует `documents.enrollment_certificate_skipped`.
- Files changed:
  - `apps/backend/src/modules/documents/enrollment-document-issuance.listener.test.ts`
  - `README.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный (таблица §10).

### 5.53 BL-003: strict validation для `deliveryMode` (uppercase)

- Summary: в **`mvp.domains.http.integration.test.ts`** добавлен кейс `POST /enrollments/bulk` с `deliveryMode='QUEUED'`: API возвращает **400** `validation_error`, enqueue не вызывается. Это фиксирует строгую чувствительность к регистру для enum-значения (`queued` только в lower-case).
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts`
  - `README.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный (таблица §10).

### 5.54 BL-010: стабилизация health HTTP integration в полном CI

- Summary: устранён флапающий failure `Hook timed out in 30000ms` в `health.http.integration.test.ts` (beforeAll startup). Для обоих `describe` timeout `beforeAll` увеличен с `30_000` до `60_000`. Это не меняет runtime API, только стабилизирует regression suite под нагрузкой монорепо `ci:check`.
- Files changed:
  - `apps/backend/src/modules/health/health.http.integration.test.ts`
  - `README.md`
- Notes: локально воспроизведён флап в полном `ci:check`, после правки — целевой и полный прогон зелёные.

### 5.55 BL-003: regression на default `deliveryMode` (immediate path)

- Summary: в **`mvp.domains.http.integration.test.ts`** добавлен HTTP-кейс `POST /enrollments/bulk` без `deliveryMode`: API создаёт enrollment через immediate-path и не вызывает `MvpBulkEnqueueService.publishBulkJob`.
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts`
  - `README.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
- Notes: таргетный suite (19 tests) и полный `pnpm -s ci:check` — зелёные.

### 5.56 BL-003: strict validation для `deliveryMode` со whitespace

- Summary: в **`mvp.domains.http.integration.test.ts`** добавлен кейс `POST /enrollments/bulk` с `deliveryMode=' queued '`: API возвращает **400** `validation_error`, enqueue не вызывается. Это фиксирует отсутствие implicit trim для enum-значения.
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts`
  - `README.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
- Notes: таргетный suite и полный `pnpm -s ci:check` — зелёные.

### 5.57 BL-008: strict regression для mixed-case KPI breakdown flag

- Summary: в **`mvp.domains.http.integration.test.ts`** добавлен HTTP-кейс `GET /reports/kpi-snapshot?include_enrollment_breakdown=TrUe`: breakdown не возвращается, т.к. поддерживаются только `true` и `1`.
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts`
  - `README.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
- Notes: таргетный suite и полный `pnpm -s ci:check` — зелёные.

### 5.58 BL-003: HTTP regress для worker callback массовых зачислений и явный DI

- Summary: регрессия **`POST /api/v1/internal/worker/mvp/bulk-enrollments`** (`WorkerCallbackGuard`, невалидный/отсутствующий **`x-worker-callback-token`** → **403**, валидация тела **`400 validation_error`**, успешный вызов с заголовком проксируется в **`MvpService.createBulkEnrollments`** с **`deliveryMode: 'immediate'`**). В **`MvpInternalWorkerController`** добавлен **`@Inject(MvpService)`** — без этого в Vitest/harness без `emitDecoratorMetadata` Nest не инжектит сервис (**`mvpService`** = `undefined`).
- Files changed:
  - `apps/backend/src/modules/mvp/mvp-internal-worker.http.integration.test.ts` (новый)
  - `apps/backend/src/modules/mvp/mvp-internal-worker.controller.ts`
  - `README.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
  - `LMS_AGENT_HANDOFF.md`
- Notes: полный **`pnpm -s ci:check`** — зелёный на рабочей копии после правок.

### 5.59 BL-003: worker — модуль колбэка bulk + unit regress

- Summary: логика **`invokeBackendBulkEnrollment`** вынесена из **`apps/worker/src/main.ts`** в **`bulk-enrollment-callback.ts`**; добавлены unit-тесты (**`bulk-enrollment-callback.test.ts`**) без RabbitMQ: URL (**trim** базы + путь **`/api/v1/internal/worker/mvp/bulk-enrollments`**), заголовок **`x-worker-callback-token`**, тело **`tenantId` / requestId / correlationId / payload`**, классификация ответов (**`NonRetryableJobError`** для `forbidden` / `validation_error`; обычный **`Error`** для **500**, чтобы сохранился retry consumer).
- Files changed:
  - `apps/worker/src/main.ts`
  - `apps/worker/src/bulk-enrollment-callback.ts` (новый)
  - `apps/worker/src/bulk-enrollment-callback.test.ts` (новый)
  - `README.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
  - `LMS_AGENT_HANDOFF.md`
- Notes: **`pnpm -s ci:check`** — зелёный на рабочей копии.

### 5.60 BL-005: HTTP regress — лимит попыток теста

- Summary: в **`mvp.domains.http.integration.test.ts`** добавлен сценарий: при **`rules.attemptLimit: 2`** и **`dailyResetEnabled: false`** третий **`POST …/attempts/start`** для той же связки learner/test/enrollment возвращает **412** и **`attempt_limit_reached`**.
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts`
  - `README.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
  - `LMS_AGENT_HANDOFF.md`
- Notes: **`pnpm -s ci:check`** — зелёный на рабочей копии после прогона.

### 5.61 BL-006: HTTP regress — второй review на один submission запрещён

- Summary: в **`mvp.domains.http.integration.test.ts`** добавлен кейс: после успешного **`POST /assignment-reviews`** повторный **`POST`** с тем же **`submissionId`** возвращает **409** и **`conflict`** (дубликат ревью на одну сдачу).
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts`
  - `README.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
  - `LMS_AGENT_HANDOFF.md`
- Notes: **`pnpm -s ci:check`** — зелёный на рабочей копии после прогона.

### 5.62 BL-006: HTTP regress — повторный complete завершённого review

- Summary: в **`mvp.domains.http.integration.test.ts`** добавлен кейс: после **`POST …/assignment-reviews/:id/complete`** повторный **`POST`** на тот же **`id`** возвращает **412** и **`domain_rule_violation`** (**Review is already completed**).
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts`
  - `README.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
  - `LMS_AGENT_HANDOFF.md`
- Notes: **`pnpm -s ci:check`** — зелёный на рабочей копии после прогона.

### 5.63 BL-006: HTTP regress — **`PATCH`** завершённого review read-only

- Summary: расширен тот же сценарий (**`it`** переименован в **`HTTP: PATCH completed review and second complete are rejected`**): между первым **`complete`** и проверкой повторного **`complete`** добавлено **`PATCH /assignment-reviews/:id`** — ожидание **412** **`domain_rule_violation`** (**Completed review is read-only**, **`updateAssignmentReview`** в **`mvp.service.ts`**).
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts`
  - `README.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
  - `LMS_AGENT_HANDOFF.md`
- Notes: **`pnpm -s ci:check`** — зелёный на рабочей копии после прогона.

### 5.64 BL-006: HTTP regress — **`PATCH`** сдачи после **`submit`** запрещён (**`submission_terminal`**)

- Summary: в **`mvp.domains.http.integration.test.ts`** добавлен отдельный кейс: после **`POST …/assignment-submissions/:id/submit`** попытка **`PATCH …/assignment-submissions/:id`** с **`answerText`** возвращает **412** и **`submission_terminal`** (**`updateAssignmentSubmission`** в **`mvp.service.ts`**).
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts`
  - `README.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
  - `LMS_AGENT_HANDOFF.md`
- Notes: **`pnpm -s ci:check`** — зелёный на рабочей копии после прогона.

### 5.65 BL-010: HTTP regress — **`PATCH`** и **`submit`** чужой субмиссии при **`linkedIamUserId`**

- Summary: расширен сценарий в **`mvp.domains.http.integration.test.ts`** (переименованный **`it`**): для слушателя с **`linkedIamUserId`** чужой JWT получает **403** **`forbidden`** не только на **`GET …/assignment-submissions/:id`**, но и на **`PATCH`** и **`POST …/submit`** (дополнение к уже покрытому **`POST`** создания).
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts`
  - `README.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
  - `LMS_AGENT_HANDOFF.md`
- Notes: **`pnpm -s ci:check`** — зелёный на рабочей копии после прогона.

### 5.66 BL-010: HTTP regress — список **`GET /assignment-submissions`** ограничен привязкой JWT → слушатель

- Summary: в **`mvp.domains.http.integration.test.ts`** добавлен кейс: два слушателя с разными **`linkedIamUserId`**, две субмиссии (создание от staff); под JWT Алисы список содержит только её **`learnerId`**, идентификатор субмиссии Боба отсутствует; симметрично для Боба (**`listAssignmentSubmissions`** / **`restrictLearnerIdsForAssessmentList`**).
- Files changed:
  - `apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts`
  - `README.md`
  - `docs/TZ_MVP_TRACEABILITY.md`
  - `LMS_AGENT_HANDOFF.md`
- Notes: **`pnpm -s ci:check`** — зелёный на рабочей копии после прогона.

### 5.67 Корреляция IAM-аудита с HTTP (`metadata.correlation_id`)

- Summary: в **`AuditService`** введён тип **`AuditWritePayload`**, поле **`correlationId`** при записи вкладывается в **`metadata.correlation_id`** (новая колонка БД не нужна). **`AuthService`** передаёт **`context.correlationId`** во все **`writeCritical`**; **`IamService.createUser`** / **`setUserRoles`** и **`AuthController`** прокидывают **`correlationId`** из **`RequestContext`**. Регресс: **`audit.service.test.ts`**, **`auth.controller.contract.test.ts`**, **`auth.service.test.ts`**; комментарий в **`packages/api-contracts`** и уточнение в **`docs/security-remediation-roadmap.md`** (задача 10).
- Files changed:
  - `apps/backend/src/modules/audit/audit.service.ts`
  - `apps/backend/src/modules/audit/audit.service.test.ts`
  - `apps/backend/src/modules/iam/services/auth.service.ts`
  - `apps/backend/src/modules/iam/services/iam.service.ts`
  - `apps/backend/src/modules/iam/auth.controller.ts`
  - `apps/backend/src/modules/iam/auth.controller.contract.test.ts`
  - `apps/backend/src/modules/iam/auth.service.test.ts`
  - `packages/api-contracts/src/domains/audit.ts`
  - `docs/security-remediation-roadmap.md`
  - `README.md`, `LMS_AGENT_HANDOFF.md`
- Notes: **`pnpm -s ci:check`** — зелёный.

### 5.68 `correlation_id` в аудите documents / MVP / e-sign / integrations

- Summary: после §5.67 IAM — **`correlationId`** из **`RequestContext`** прокидывается в **`AuditWritePayload`** для записей аудита в **`DocumentsService`** (создание/обновление шаблона, **`writeTaskAudit`**), **`MvpService.audit`**, **`EsignService.writeAudit`**, **`IntegrationOrchestratorService`** (**`createCredential`**, **`rotateSecret`**, плюс **`requestId`**, **`ip`**, **`userAgent`** для интеграций). Дополнено в **§5.69**: трассировка через событие **`learning.enrollment_completed`** → **`EnrollmentDocumentIssuanceListener`**. Регресс: **`documents.service.test.ts`**, **`mvp.service.test.ts`**, **`integrations.service.test.ts`**; комментарий в **`api-contracts`** (`audit.ts`).
- Files changed:
  - `apps/backend/src/modules/documents/documents.service.ts`
  - `apps/backend/src/modules/mvp/mvp.service.ts`
  - `apps/backend/src/modules/esign/esign.service.ts`
  - `apps/backend/src/modules/integrations/services/integration-orchestrator.service.ts`
  - `apps/backend/src/modules/documents/documents.service.test.ts`
  - `apps/backend/src/modules/mvp/mvp.service.test.ts`
  - `apps/backend/src/modules/integrations/integrations.service.test.ts`
  - `packages/api-contracts/src/domains/audit.ts`
  - `docs/security-remediation-roadmap.md`
  - `README.md`, `LMS_AGENT_HANDOFF.md`
- Notes: **`pnpm -s ci:check`** — зелёный.

### 5.69 BL-007: трассировка `requestId` / `correlationId` при завершении enrollment → сертификат

- Summary: расширен **`EnrollmentCompletedPayload`** (**`requestId`**, **`correlationId`**). При **`status: completed`** в **`MvpService.changeEnrollmentStatus`** в событие передаются значения из **`RequestContext`**. **`EnrollmentDocumentIssuanceListener`**: аудит **skipped/failed** с **`requestId`/`correlationId`**; **`generateDocument`** вызывается с **`RequestContext`**, если в payload есть хотя бы одно поле трассировки (иначе прежнее поведение). Регресс: **`enrollment-document-issuance.listener.test.ts`**, **`enrollment-certificate-flow.service.test.ts`**.
- Files changed:
  - `apps/backend/src/modules/mvp/enrollment-completed.event.ts`
  - `apps/backend/src/modules/mvp/mvp.service.ts`
  - `apps/backend/src/modules/documents/enrollment-document-issuance.listener.ts`
  - `apps/backend/src/modules/documents/enrollment-document-issuance.listener.test.ts`
  - `apps/backend/src/modules/documents/enrollment-certificate-flow.service.test.ts`
  - `README.md`, `LMS_AGENT_HANDOFF.md`
- Notes: **`pnpm -s ci:check`** — зелёный.

### 5.70 Documents: трассировка **`POST …/documents/generate/batch`**

- Summary: **`DocumentsService.generateDocumentsBatch`** принимает опциональный **`RequestContext`** и передаёт его в каждый вызов **`generateDocument`** (**`DocumentsController`** прокидывает **`CurrentContext`**). Ключи идемпотентности для элементов батча стабилизированы: один **`batchBaseTime`** + индекс (меньше случайных коллизий в одной миллисекунде). Регресс в **`documents.service.test.ts`** (**`requestId`/`correlationId`** на задачах).
- Files changed:
  - `apps/backend/src/modules/documents/documents.service.ts`
  - `apps/backend/src/modules/documents/documents.controller.ts`
  - `apps/backend/src/modules/documents/documents.service.test.ts`
  - `README.md`, `LMS_AGENT_HANDOFF.md`
- Notes: **`pnpm -s ci:check`** — зелёный.

### 5.71 BL-010: HTTP regress — **`POST …/documents/generate/batch`** граница **`documents.generate`**

- Summary: harness **`documents.http.integration.test.ts`**: mock-guard учитывает путь (`/documents/generate` → нужен **`documents.generate`**, иначе **`documents.write`** как раньше для **`/templates`**). Добавлен stub-эндпоинт **`POST /documents/generate/batch`**, сценарии **403** без **`documents.generate`** при наличии **read+write** и **201** при **read+write+generate**.
- Files changed:
  - `apps/backend/src/modules/documents/documents.http.integration.test.ts`
  - `README.md`, `LMS_AGENT_HANDOFF.md`
- Notes: **`pnpm -s ci:check`** — зелёный.

### 5.72 BL-010: HTTP regress — **`POST …/documents/generate`** граница **`documents.generate`**

- Summary: в **`documents.http.integration.test.ts`** добавлен stub **`POST /documents/generate`** (одиночная генерация); те же сценарии, что для батча: **403** при **read+write** без **`documents.generate`**, **201** при наличии **`documents.generate`**. Подтверждён прогон файла и полный **`pnpm -s ci:check`**.
- Files changed:
  - `apps/backend/src/modules/documents/documents.http.integration.test.ts`
  - `README.md`, `LMS_AGENT_HANDOFF.md`
- Notes: **`pnpm --filter @cdoprof/backend exec vitest run`** на `documents.http.integration.test.ts` + **`pnpm -s ci:check`** — зелёный.

### 5.73 BL-010: HTTP regress — e-sign **`POST …/applications/:id/submit`** vs **`esign.applications.write`**

- Summary: файл **`esign.http.integration.test.ts`**: лёгкий Nest harness с тем же контуром, что **`documents`** / **`integrations`** (envelope, **`TenantGuard`**, mock **`resolvePermissions`**). Guard по URL различает **`POST …/esign/applications`** (**`esign.applications.write`**) и **`POST …/esign/applications/:id/submit`** (**`esign.applications.submit`**). Сценарии: **403** при **read+write** без **submit**, **201** при **read+write+submit** (соответствует **`EsignController.submitApplication`**).
- Files changed:
  - `apps/backend/src/modules/esign/esign.http.integration.test.ts` (новый)
  - `README.md`, `LMS_AGENT_HANDOFF.md`, `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный.

### 5.74 BL-010: HTTP regress — e-sign **`POST …/applications/:id/start-review`** (**`esign.applications.review`**)

- Summary: расширение **`esign.http.integration.test.ts`**: guard по пути отличает **`POST …/start-review`** (**`esign.applications.review`**) от **`submit`** / **`POST …/applications`** (**write**). Сценарии: **403**, если есть **read+write+submit**, но нет **review**; **201** при **read+write+review** (соответствует **`EsignController.startReview`**).
- Files changed:
  - `apps/backend/src/modules/esign/esign.http.integration.test.ts`
  - `README.md`, `LMS_AGENT_HANDOFF.md`, `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный.

### 5.75 BL-010: HTTP regress — e-sign **`POST …/participants/:id/sign`** (**`esign.participants.sign`**)

- Summary: в **`esign.http.integration.test.ts`** guard добавляет ветку для **`POST …/esign/participants/:id/sign`** — только **`esign.participants.sign`** (отдельно от **`esign.processes.write`**). Сценарии: **403** при **processes.read+write** без **sign**; **201** при **processes.read+sign** (соответствует **`EsignController.sign`**).
- Files changed:
  - `apps/backend/src/modules/esign/esign.http.integration.test.ts`
  - `README.md`, `LMS_AGENT_HANDOFF.md`, `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный.

### 5.76 BL-010: HTTP regress — e-sign **`GET …/legal-log`** (**`esign.legal.read`**)

- Summary: в **`esign.http.integration.test.ts`** для **GET** различаются пути **`/esign/legal-log`** и **`/esign/legal-log/:id`** (**`esign.legal.read`**) и остальной **GET** контур заявок (**`esign.applications.read`**). Stub **`GET …/legal-log`**, сценарии **403** при только **applications.read+write** без **legal.read** и **200** при **`esign.legal.read`** (соответствует **`EsignController.listLegalLog`**).
- Files changed:
  - `apps/backend/src/modules/esign/esign.http.integration.test.ts`
  - `README.md`, `LMS_AGENT_HANDOFF.md`, `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный.

### 5.77 BL-010: HTTP regress — e-sign **`GET …/processes`** (**`esign.processes.read`**)

- Summary: **`esign.http.integration.test.ts`**: stub **`GET …/esign/processes`**; guard для **GET** распознаёт контур **`processes` / `events` / списка `participants`** как **`esign.processes.read`** (см. **`EsignController`**). Сценарии: **403**, если есть только **`esign.applications.read`+`write`**, без **`processes.read`**; **200** при **`esign.processes.read`**.
- Files changed:
  - `apps/backend/src/modules/esign/esign.http.integration.test.ts`
  - `README.md`, `LMS_AGENT_HANDOFF.md`, `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный.

### 5.78 BL-010: HTTP regress — e-sign **`GET …/application-files`** (**`esign.applications.read`**)

- Summary: **`esign.http.integration.test.ts`**: stub **`GET …/esign/application-files`** (как **`EsignController.listApplicationFiles`**). Сценарии: **403**, если у актора только **`esign.processes.read`** (наблюдатель процессов не читает файлы заявок); **200** при **`esign.applications.read`**.
- Files changed:
  - `apps/backend/src/modules/esign/esign.http.integration.test.ts`
  - `README.md`, `LMS_AGENT_HANDOFF.md`, `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный.

### 5.79 BL-010: HTTP regress — e-sign **`POST …/application-files`** (**`esign.applications.write`**)

- Summary: **`esign.http.integration.test.ts`**: stub **`POST …/esign/application-files`** (как **`EsignController.createApplicationFile`**). Guard считает этот путь мутацией **`esign.applications.write`**. Сценарии: **403** при только **`esign.applications.read`**; **201** при **read+write**.
- Files changed:
  - `apps/backend/src/modules/esign/esign.http.integration.test.ts`
  - `README.md`, `LMS_AGENT_HANDOFF.md`, `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный.

### 5.80 BL-010: HTTP regress — e-sign **`POST …/application-files/:id/verify`** (**`esign.applications.review`**)

- Summary: **`esign.http.integration.test.ts`**: stub **`POST …/application-files/:id/verify`** (как **`EsignController.verifyApplicationFile`**). Сценарии: **403** при **read+write** без **`esign.applications.review`**; **201** при **read+write+review**.
- Files changed:
  - `apps/backend/src/modules/esign/esign.http.integration.test.ts`
  - `README.md`, `LMS_AGENT_HANDOFF.md`, `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный.

### 5.81 BL-010: HTTP regress — e-sign **`POST …/application-files/:id/reject`** (**`esign.applications.review`**)

- Summary: **`esign.http.integration.test.ts`**: stub **`POST …/application-files/:id/reject`** (как **`EsignController.rejectApplicationFile`**). В guard **verify** и **reject** объединены в один шаблон **`/(verify|reject)$`**. Сценарии: **403** при **read+write** без **review**; **201** при **read+write+review**.
- Files changed:
  - `apps/backend/src/modules/esign/esign.http.integration.test.ts`
  - `README.md`, `LMS_AGENT_HANDOFF.md`, `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный.

### 5.82 BL-010: HTTP regress — e-sign **`POST …/applications/:id/(approve|reject)`** и **`DELETE …/application-files/:id`**

- Summary: **`esign.http.integration.test.ts`**: в harness добавлены стабы **`POST …/applications/:id/approve`**, **`POST …/applications/:id/reject`**, **`DELETE …/application-files/:id`** (как **`EsignController`**). В guard мутации заявки **`start-review` / approve / reject** сведены к **`esign.applications.review`**; **DELETE** файла заявки — **`esign.applications.write`**. Сценарии: **403** на **approve/reject** при **read+write+submit** без **review**; **201** на **approve** с **review**; **403** на **DELETE** при только **read**; **200** на **DELETE** при **read+write**.
- Files changed:
  - `apps/backend/src/modules/esign/esign.http.integration.test.ts`
  - `README.md`, `LMS_AGENT_HANDOFF.md`, `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный после §5.82.

### 5.83 BL-010: HTTP regress — e-sign **processes.write** vs **participants.sign** (процессы и действия участника)

- Summary: **`esign.http.integration.test.ts`**: стабы **`POST …/processes`**, **`POST …/processes/:id/start`**, **`POST …/participants/:id/skip`**, **`POST …/participants/:id/mark-viewed`** (как **`EsignController`**). В **TestPermissionGuard**: создание процесса и **start|cancel** — **`esign.processes.write`**; **skip** участника — **`esign.processes.write`** (отдельно от подписанта); **`sign|mark-viewed|reject`** на участника — **`esign.participants.sign`**. Регрессии: **403**/**201** для перечисленных комбинаций прав.
- Files changed:
  - `apps/backend/src/modules/esign/esign.http.integration.test.ts`
  - `README.md`, `LMS_AGENT_HANDOFF.md`, `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный после §5.83.

### 5.84 BL-010: HTTP regress — **integrations**: **PATCH** и позитивные **GET/POST** (**`integrations.write`** для мутаций)

- Summary: **`integrations.http.integration.test.ts`**: **TestPermissionGuard** — **`POST`** и **`PATCH`** требуют **`integrations.write`** (не только **POST**); стаб **`PATCH …/integrations/providers/:id`** по аналогии с реальным **`IntegrationsController.patchProvider`**. Добавлены: успех **GET** при **`integrations.read`**; успех **POST …/sync** при **read+write**; **403** и **200** для **PATCH** при read-only / write.
- Files changed:
  - `apps/backend/src/modules/integrations/integrations.http.integration.test.ts`
  - `README.md`, `LMS_AGENT_HANDOFF.md`, `docs/TZ_MVP_TRACEABILITY.md`
- Notes: harness остаётся упрощённой моделью **read vs write** до появления granular permissions на реальном **`IntegrationsController`**; **`pnpm -s ci:check`** — зелёный после §5.84.

### 5.85 BL-010: HTTP regress — **documents**: **PATCH**/ **PUT**/ **DELETE** → **`documents.write`** (исправление guard)

- Summary: **`documents.http.integration.test.ts`**: **TestPermissionGuard** ранее для методов вне **GET**/**POST** возвращал пустой **`required`** и фактически пропускал запросы без проверки прав. Добавлено: **PATCH**, **PUT**, **DELETE** требуют **`documents.write`**; нормализация пути (**без query**). Стабы **`PATCH …/templates/:id`**, **`DELETE …/templates/:id`** (harness; **DELETE** шаблона в **`DocumentsController`** может отличаться — цель регресса **write**). Сценарии **403** при **`documents.read`** и успех при **read+write**.
- Files changed:
  - `apps/backend/src/modules/documents/documents.http.integration.test.ts`
  - `README.md`, `LMS_AGENT_HANDOFF.md`, `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный после §5.85.

### 5.86 BL-010: HTTP regress — **integrations**: **PUT**/ **DELETE** → **`integrations.write`** (parity с **documents** harness)

- Summary: **`integrations.http.integration.test.ts`**: без **PUT**/ **DELETE** в условии guard эти методы попадали в ветку **read**. Добавлены **PUT** и **DELETE** к мутациям (**`integrations.write`**). Стабы **`PUT …/integrations/providers/:id`**, **`DELETE …/integrations/providers/:id`** (harness для регресса прав; боевой контроллер провайдеров **DELETE** может не экспонировать — цель модель **write**).
- Files changed:
  - `apps/backend/src/modules/integrations/integrations.http.integration.test.ts`
  - `README.md`, `LMS_AGENT_HANDOFF.md`, `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный после §5.86.

### 5.87 BL-010: HTTP regress — **e-sign** **PATCH** заявки/участника и **POST reuse-check** (закрытие пустого **`required`**)

- Summary: **`esign.http.integration.test.ts`**: **TestPermissionGuard** — **`PATCH …/applications/:id`** → **`esign.applications.write`**; **`PATCH …/participants/:id`** → **`esign.processes.write`** (ранее **PATCH** не обрабатывался → **`required`** пустой). **`POST …/applications/:id/reuse-check`** → **`esign.applications.read`** (ранее попадало в открытый **`return true`**). Стабы **`patchApplication`**, **`reuseCheckStub`**, **`patchParticipantStub`**; регрессии **403**/успех.
- Files changed:
  - `apps/backend/src/modules/esign/esign.http.integration.test.ts`
  - `README.md`, `LMS_AGENT_HANDOFF.md`, `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный после §5.87.

### 5.88 BL-010: HTTP regress — **e-sign** оставшиеся маршруты (**POST participants/invite**, **POST processes/…/cancel**, **GET events/legal-log/:id**/…)

- Summary: **`esign.http.integration.test.ts`**: **TestPermissionGuard** — **`POST /esign/participants`** и **`POST …/participants/:id/invite`** → **`esign.processes.write`** (ранее **`POST …/participants`** не попадал в матрицу → открытый **`return true`**). Стабы и регрессии **403**/успех для **create participant**, **invite**, **`POST …/processes/:id/cancel`**, **`POST …/participants/:id/reject`** (**sign**); **GET** **`/esign/events`**, **`/esign/applications/:id`**, **`/esign/legal-log/:id`**; доп. стабы **GET** **application-files/:id**, **processes/:id**, **processes/:id/status**, **participants**, **events/:id** (покрытие guard без отдельных кейсов на каждый).
- Files changed:
  - `apps/backend/src/modules/esign/esign.http.integration.test.ts`
  - `README.md`, `LMS_AGENT_HANDOFF.md`, `docs/TZ_MVP_TRACEABILITY.md`
- Notes: **`pnpm -s ci:check`** — зелёный после §5.88.

### 5.89 BL-010: HTTP regress — **e-sign GET parity** (**processes/:id**, **participants**, **application-files/:id**, **events/:id**)

- Summary: расширен `esign.http.integration.test.ts` для симметричного покрытия `EsignController` по GET-контуру: добавлены `deny/success` для **`GET /esign/processes/:id`**, **`GET /esign/participants`**, **`GET /esign/application-files/:id`**; `success` для **`GET /esign/processes/:id/status`** и **`GET /esign/events/:id`**. Это закрывает «только stub без отдельной регрессии» из §5.88 и фиксирует permission-модель **`esign.processes.read`** / **`esign.applications.read`** на object-level маршрутах.
- Files changed:
  - `apps/backend/src/modules/esign/esign.http.integration.test.ts`
  - `README.md`, `LMS_AGENT_HANDOFF.md`, `docs/TZ_MVP_TRACEABILITY.md`
- Notes: `pnpm --filter @cdoprof/backend exec vitest run src/modules/esign/esign.http.integration.test.ts` (**58 tests**) и **`pnpm -s ci:check`** — зелёные после §5.89.

### 5.90 Phase 2 §3.3 — Plan A: bulk-import учеников из Excel (end-to-end)

- Summary: реализована главная фича Phase 2 §3.3 «центр всё назначает сам» — массовая загрузка учеников из Excel/CSV с per-row валидацией (partial-success) и атомарным create-or-reuse + zaчисление в группу. Закрывает 12 задач Plan A в трёх PR'ах: backend (#193), frontend (#194), closeout E2E + docs (этот §5.90).
- Spec / Plan: `docs/superpowers/specs/2026-05-21-cdoprof-redesign-design.md` §3.3 + `docs/superpowers/plans/2026-05-28-phase-2-admin-bulk-enrollment-a.md`.
- Backend (PR #193, Tasks 1-4, 42 теста):
  - `apps/backend/src/modules/mvp/learners-bulk-import.types.ts` — `BulkImportRow` / `BulkImportOutcome` / `BulkImportIdempotencyRecord`.
  - `apps/backend/src/modules/mvp/learners-bulk-import.dto.ts` — `BulkImportLearnersRequest` (`ArrayMaxSize 1000`, обязательные fullName/email per row).
  - `apps/backend/src/modules/mvp/learners-bulk-import.service.ts` — pure `classifyRows` + СНИЛС-чексумма по алгоритму ПФР + сервисный оркестратор `bulkImportLearners` с idempotency через новую коллекцию `bulkImportIdempotency`.
  - `apps/backend/src/modules/mvp/mvp.service.ts` — `createLearnerExtended` (старый `createLearner` не принимает email/snils/middleName/position) + `getBulkImportOutcomeIfAny` / `saveBulkImportOutcome`.
  - `apps/backend/src/modules/mvp/mvp.controller.ts` — `POST /learners/bulk-import` под двойной permission `learners.write` + `enrollments.write`.
  - `apps/backend/src/modules/mvp/infrastructure/in-memory-mvp.state.ts` + `mvp-collections.ts` — регистрация новой коллекции.
  - HTTP integration: 5 кейсов в `mvp.http.integration.test.ts` (auth_required / permission_denied per perm / session_inactive / success).
- Frontend (PR #194, Tasks 5-10, 33 теста):
  - `apps/frontend/package.json` — добавлен `xlsx ^0.18.5` (SheetJS).
  - `apps/frontend/src/features/bulk-enrollments/` — новая фича-папка: `types.ts`, `excel-parser.ts` (синонимы заголовков ФИО/Имя/E-mail/Эл. почта), `validators.ts` (зеркало backend `classifyRows` без reuse), `api.ts` + `hooks.ts` (`useBulkImportMutation` через useState-паттерн проекта), `bulk-import-screen.tsx` (4 секции: загрузить / выбрать группу / preview / отправить + результат), `preview-table.tsx`.
  - `apps/frontend/app/admin/bulk-enrollments/page.tsx` — Next.js route обёрнут в `ProtectedPage` (использует существующий `AppShell`).
  - `apps/frontend/src/features/navigation/model.ts` — routeMeta + navigationModel запись «Массовая загрузка» в navSlot 'more' под `learners.write + enrollments.write`.
- Closeout (этот PR, Tasks 11-12, 8 e2e-тестов):
  - `apps/frontend/src/e2e/admin-bulk-enrollment.e2e.test.ts` — routing + nav assertions + parse+classify pipeline + module smoke import.
  - `LMS_AGENT_HANDOFF.md` (этот §5.90).
- Plan A deviations (документированы в commit body / PR описаниях):
  1. Backend `createLearnerExtended` вместо расширения `createLearner` (старый API остаётся стабильным).
  2. HTTP integration расширил `mvp.http.integration.test.ts` (stub-controller pattern) вместо нового файла — сэкономили 200+ строк boilerplate.
  3. Idempotency — отдельная коллекция `bulkImportIdempotency` (типы `BulkImportOutcome` ≠ `BulkEnrollmentsOutcome`).
  4. Inner `createBulkEnrollments` использует derived ключ `${key}::bulk-import-enroll` для изоляции keyspace'а.
  5. Frontend admin layout (Task 8) **не реализован отдельно** — `AppShell` уже динамически строит sidebar из `navigationModel`, достаточно регистрации.
  6. Frontend validators дублируют backend (`classifyRows`) — deliberate, документировано; вынос в `packages/shared-types` отложен до ≥3 правки.
  7. E2E (Task 11) — routing + parse+classify integration + module smoke; React mount нет (RTL не в зависимостях; конвенция проекта — pure-function unit + permission boundary).
- Email-приглашения после зачисления (последний шаг §3.3) — отложены до Phase 5 (notifications). Plan A только создаёт + зачисляет.
- Quality gates: `pnpm typecheck` зелёный, frontend 198 тестов + backend 42 новых (всё через изолированные прогоны; full `pnpm test:backend` падает на pre-existing tinypool/Windows IPC crash на пути с кириллицей — проверено против origin/main, не вызвано этим изменением).
- Что осталось до Phase 2 целиком: Plan B (учётки CRUD UI поверх существующего `GET /learners`) и Plan C (компании-клиенты + view прогресса по группе). Plan A — главный процесс из спеки, ~10-15% общего объёма Phase 2.

### 5.91 Phase 2 §3.2 — Plan B: admin учётки учеников (list/search/filter/edit UI)

- Summary: реализована вторая фича Phase 2 «учётки учеников» — `/admin/learners` со списком/поиском/фильтром по статусу/пагинацией + drawer для редактирования профиля (имя/email/СНИЛС/должность/подразделение/статус/IAM-привязка). Закрывает 11 задач Plan B в 3 PR'ах (#198 backend, #199 frontend, #200 closeout).
- Plan: `docs/superpowers/plans/2026-05-29-phase-2-admin-learners-management-b.md`.
- Backend (PR #198, Tasks 1-4): `UpdateLearnerExtendedRequest` DTO с PATCH-семантикой (undefined = skip, null = clear), `MvpService.updateLearnerExtended` + 6 unit-кейсов с anti-IDOR правилом на `linkedIamUserId` (смена непустого на другое непустое → 409 ConflictException; чтобы сменить — двухшаговый null → reassign). `@Patch('learners/:id/profile')` endpoint под `learners.write`. HTTP integration 3 кейса в `mvp.http.integration.test.ts`.
- Frontend (PR #199, Tasks 5-10): фича-папка `src/features/learners/` (types/api/api.contract/hooks/format/learner-edit-drawer/learners-list-screen), route `app/admin/learners/page.tsx`, navigation entry `/admin/learners` под `learners.read` в navSlot 'more'.
- Closeout (PR #200, Task 11): E2E smoke в `src/e2e/admin-learners-management.e2e.test.ts` (11 кейсов: routing + nav + pipeline integration форматтеров + module smoke).
- Plan B deviations (адаптации к реальному коду):
  1. `apiRequest(path, options)` сигнатура — не `(session, { method, path, body })`. Session через `options.auth`.
  2. Hook `useAuth()` + `UserSession` — не `useSession()`.
  3. React Query из `@tanstack/react-query` напрямую (план ошибочно говорил про «shim»; shim существует только для compat-слоя в других местах).
  4. `@cdoprof/ui` сигнатуры: `Column<T>.title` не `header`, `Pagination` через `page`/`totalPages`/`onPageChange`, `SectionError.onRetry`, `SectionEmpty.message`/`hint`, `SearchInput` без `placeholder`/`aria-label`, `LoadingState.message`.
  5. `Select` не существует в `@cdoprof/ui` (только `LookupSelect` для `LookupItem[]`) — фильтр статуса через native `<select className="ui-select">`.
  6. `ProtectedPage` без props — auth/permission через `routeMeta`.
  7. Tasks 8+9 объединены в один коммит drawer-first, чтобы typecheck не падал при импорте drawer'а из screen'а.
- Что осталось до Phase 2: Plan C — компании-клиенты + view прогресса по группе (последний крупный блок).
- Quality gates: `pnpm typecheck` зелёный, frontend 217 тестов, backend +22 (39 dto-validation + 76 service + 12 HTTP integration в изоляции).

### 5.92 Phase 2 §3.2 — Plan C: компании-клиенты + прогресс по группе

- Summary: реализована заключительная фича Phase 2 — admin-страница `/admin/clients` (list + detail + create/edit drawer) + связь группа↔компания + агрегатный прогресс по группе и по компании. Закрывает 14 задач Plan C в 3 PR'ах. Phase 2 после Plan C объёмно ~95% покрыта (остаётся V1.1 polish — см. ниже).
- Plan: `docs/superpowers/plans/2026-05-29-phase-2-admin-clients-management-c.md`.
- Backend (PR #202, Tasks 1-6, +56 тестов):
  - Migration 0039 (`crm.counterparties` +6 nullable колонок inn/kpp/contact_email/contact_phone/legal_address/note + INN format CHECK; `learning.groups` +nullable `counterparty_id` с composite FK `(tenant_id, counterparty_id) → crm.counterparties (tenant_id, id)` + partial index). 7 regex-тестов в `migrations.0039.test.ts`.
  - `mvp.types.ts` — `Counterparty` +6 опциональных полей, `GroupEntity` +`counterpartyId?`.
  - 2 новых DTO (`CreateCounterpartyExtendedRequest` + `UpdateCounterpartyExtendedRequest`) + 14 dto-validation кейсов.
  - 3 service метода (`createCounterpartyExtended`, `updateCounterpartyExtended`, `setGroupCounterparty`) + аудит на каждую мутацию (`crm.counterparty_created/updated`, `learning.group_counterparty_linked/unlinked`) + 9 unit-кейсов.
  - `group-progress-summary.service.ts` — pure-function aggregator (`summarizeGroupProgress` + `summarizeCounterpartyProgress`) с binary completion signal (status='completed') + per-course breakdown через groupCourses join. 9 unit-кейсов.
  - `MvpService.getGroupProgressSummary` + `getCounterpartyProgressSummary` wiring с tenant-scoped state filter + anti-IDOR через `getById`.
  - 5 новых endpoints в `mvp.controller.ts`: `POST /counterparties/extended` (counterparties.write), `PATCH /counterparties/:id/profile` (counterparties.write), `PATCH /groups/:id/counterparty` (counterparties.write), `GET /groups/:id/progress-summary` (enrollments.read), `GET /counterparties/:id/progress-summary` (counterparties.read + enrollments.read). 7 HTTP integration кейсов.
- Frontend (PR #203, Tasks 7-13, +42 теста):
  - Фича-папка `src/features/clients/` — `types.ts`, `api.ts`, `hooks.ts` (React Query + useState mutations), `format.ts` (+18 unit-кейсов), `api.contract.test.ts` (9 кейсов envelope unwrap + URL/method/body), `clients-list-screen.tsx`, `client-edit-drawer.tsx` (create + edit единый компонент через optional `client` prop), `client-detail-screen.tsx`, `group-progress-section.tsx`, `group-counterparty-picker.tsx` (standalone, awaits V1.1 integration).
  - Routes `app/admin/clients/page.tsx` + `app/admin/clients/[id]/page.tsx` (ProtectedPage).
  - Navigation entry `/admin/clients` + `/admin/clients/[id]` под `counterparties.read`, navSlot 'more'.
- Closeout (этот PR, Task 14): `src/e2e/admin-clients-management.e2e.test.ts` (15 кейсов: routing + nav + pipeline integration + 5 module smoke), §5.91 retrospective (Plan B closeout пропустил handoff entry) + §5.92, README §2 sync.
- Plan C deviations (4):
  1. **D1**: план говорил `mvp.counterparties`, реальная таблица — `crm.counterparties` (схема crm, не mvp; см. 0002_mvp_domain_model.sql). Миграция и сервисы корректно адресуют `crm`.
  2. **D2**: план указывал `ON DELETE SET NULL` на composite FK. PostgreSQL для composite FK SET NULL обнулит обе колонки `(tenant_id, counterparty_id)`, ломая multitenancy. Заменено на default `ON DELETE NO ACTION` (соответствует pattern composite FK в 0003); удаление counterparty в V1 не предусмотрено (только status-toggle).
  3. **D3**: план предполагал `Enrollment.courseId` и pre-computed `completionRateByEnrollment` Map. Real model: `Enrollment` имеет только `groupId/learnerId/status`; binary completion signal через `status === 'completed'` (matches kpiSnapshot precedent). Per-course breakdown — через `groupCourses (groupId, courseId)` join. Granular 0..1 rate отложен до V1.1.
  4. **D4**: `GroupCounterpartyPicker` создан standalone, но НЕ интегрирован inline в `GroupDetailsScreen` (`mvp/screens.tsx:1515`, ~2000-строчный mega-file — высокий риск побочных регрессий). `PATCH /groups/:id/counterparty` полностью работает; picker testable в изоляции; интеграция — V1.1 polish task.
- Что осталось до Phase 2 целиком: ничего критичного. Опциональные V1.1: фильтр `BaseFilterQuery.counterpartyId` для `GET /groups`, замена `c.courseId` на real course name в progress section, GroupCounterpartyPicker integration, granular 0..1 progress rate (через materialProgress), BL-003 worker callback path для bulk-enrollment (sync path сейчас работает для V1).
- Quality gates: `pnpm typecheck` зелёный (8 packages), backend изолированные прогоны зелёные (`mvp.dto-validation` 53 / `mvp.service` 85 / `group-progress-summary.service` 9 / `migrations.0039` 7 / `mvp.http.integration` 19 → +56 vs main), frontend `format.test.ts` 18 + `api.contract.test.ts` 9 + `admin-clients-management.e2e.test.ts` 15 + existing e2e suite 27 (unchanged) = 232 (был 217 после Plan B; +42 new − 27 pre-existing).

### 5.93 Phase 3 — Plan A: admin assessment surface (банки, тесты, задания, reviewer queue skeleton)

- Summary: реализован структурный фундамент Phase 3 — admin surface для assessment (5 routes: `/admin/question-banks`, `/admin/tests`, `/admin/assignments`, `/teacher/review` + детальные) с CRUD по банкам вопросов, type-aware редактором вопросов (5 типов: single/multi/number_input/text/essay), test builder с правилами и picker'ом, шаблонами практических заданий, и read-only reviewer queue skeleton. Закрывает 15 задач Plan A в 3 PR'ах. Plans B (learner test player + autograding) и C (manual review + practical submissions) опираются на сущности и UI этого Plan A.
- Plan: `docs/superpowers/plans/2026-05-30-phase-3-plan-a-admin-assessment.md`.
- Spec: `docs/superpowers/specs/2026-05-30-phase-3-assessment-design.md`.
- Backend (PR #207, Tasks 1-6, +14 файлов / +1508 строк / +138 тестов):
  - Migration `0040_assessment_question_types_extension.sql` — расширение CHECK на `assessment.questions.question_type` до 6 значений (5 runtime + legacy `boolean` для backward-compat); +nullable `numeric_expected`/`numeric_tolerance` колонки; partial CHECK `question_type <> 'number_input' OR numeric_expected IS NOT NULL`; `numeric_tolerance >= 0` constraint. 7 regex-тестов.
  - `mvp.types.ts` — `QuestionType` → 5 значений; `Question` +`numericExpected?`/`numericTolerance?`/`tags?`; новые `ReviewerQueueItem`/`ReviewerQueueSnapshot`.
  - `mvp.dto.ts` — `CreateQuestionRequest`/`UpdateQuestionRequest` расширены `numericExpected`/`numericTolerance` (≥0)/`expectedAnswer`/`tags`. Существующие CreateQuestionBank/Test/Assignment DTOs unchanged (уже достаточны).
  - Новые DTO в отдельных файлах: `answer-option.dto.ts` (+ custom `HasAtLeastOneCorrectOption()` decorator), `update-test-rule.dto.ts` (`UpdateTestRuleRequest`), `add-test-question.dto.ts` (`AddTestQuestionRequest` + `ReorderTestQuestionRequest`). +43 dto-validation кейса (всего 94).
  - `MvpService`: `publishTest` теперь gate (throws `domain_rule_violation` если нет вопросов) + idempotent + `publishedAt` timestamp; `archiveTest`/`archiveAssignment`/`publishAssignment` — idempotent + audit on transition с `archivedAt`/`publishedAt`. Новые методы: `addTestQuestion` (singular + опциональный `sortOrder` + idempotent если связь существует), `removeTestQuestion` (idempotent), `reorderTestQuestion`, `getReviewerQueue` (обёртка над pure aggregator). 85 service test'ов проходят без регрессий.
  - `reviewer-queue.service.ts` — pure-function aggregator `aggregateReviewerQueue(snapshot, filter) → ReviewerQueueSnapshot`. Tenant-scoped, фильтрует attempts по `status='submitted'`, submissions по `'submitted' || 'under_review'`. 7 unit-тестов (empty, status-filter, tenant-isolation, fallback на createdAt при отсутствии submittedAt, pure side-effects assertion).
  - `MvpController`: 5 новых endpoints — `PUT /tests/:id/rules` (alias на PATCH с `UpdateTestRuleRequest`), `POST /tests/:id/questions/single` (singular add с sortOrder), `DELETE /tests/:id/questions/:questionId`, `PATCH /tests/:id/questions/:questionId` (reorder), `GET /reviewer/queue` (`assessment.reviews.review`).
  - `assessment-admin.http.integration.test.ts` — компактный stub-controller HTTP test (изолированный от тяжёлого `mvp.domains.http.integration.test.ts` чтобы избежать Cyrillic-path краш — см. D5 ниже). 12 кейсов: auth_required + permission_denied + success envelope shape на каждый из 5 новых endpoints.
- Frontend (PR #208, Tasks 7-14, +20 файлов):
  - Feature folder `apps/frontend/src/features/assessment-admin/`: `types.ts` (DTOs/list items/form state с дискриминацией по `QuestionType`), `api.ts` (5 endpoint groups REST-клиент), `hooks.ts` (React Query queries + useState mutations per CLAUDE.md convention), `format.ts` (RU labels по типам вопросов, score pluralization 1/2/5 балл/балла/баллов, numeric tolerance «X ± Y», test rule bullets, reviewer queue item formatting).
  - 11 screen components: `question-banks-list-screen`, `question-bank-detail-screen`, `question-bank-edit-drawer`, **`question-editor-drawer`** (type-aware форма с 5 ветвями), `tests-list-screen`, **`test-builder-screen`** (publish gate disabled когда нет вопросов), `test-question-picker` (modal, multi-select по банкам), `assignments-list-screen`, `assignment-detail-screen`, `assignment-edit-drawer`, `reviewer-queue-screen` (read-only, 2 секции, empty state с пояснением «Plans B+C добавят runtime»).
  - 7 page.tsx routes под `<ProtectedPage>`: `/admin/question-banks` + `/[id]`, `/admin/tests` + `/[id]`, `/admin/assignments` + `/[id]`, `/teacher/review`.
  - Navigation: 7 routeMeta + 4 navigationModel entries (slot 'more') в `apps/frontend/src/features/navigation/model.ts`.
  - Tests: `format.test.ts` 16 кейсов + `api.contract.test.ts` 18 кейсов + `e2e/admin-assessment-surface.e2e.test.ts` 30 кейсов (routing × 10 / nav × 2 / format pipeline × 6 / reviewer queue cross-package round-trip × 1 / module smoke × 11). Всего 64 frontend теста проходят.
- Closeout (этот PR, Task 15): §5.93 retrospective + README §2 sync; deviations документированы (см. ниже).
- Plan A deviations (5):
  1. **D1**: SQL колонка называется `question_type`, не `type` (план содержал опечатку). Миграция корректно адресует `question_type`; migration test это проверяет.
  2. **D2**: Сохранили legacy тип `boolean` в CHECK constraint для backward-compat (план хотел удалить — рискованно для существующих данных). CHECK теперь принимает 6 значений (5 runtime + boolean), runtime `QuestionType` union — 5.
  3. **D3**: Большая часть Question Bank / Question / Test / Assignment CRUD методов в `MvpService` **уже реализована** до Phase 3 Plan A (Stage 1-2). Расширили существующие методы новыми полями (`numericExpected`, `numericTolerance`, `tags`, `expectedAnswer`) и поведением (publish gate, idempotent archive), не переписывали с нуля. Это major упрощение vs план, который описывал ~20 «новых» методов.
  4. **D4**: `mvp-collections.ts` **уже содержал** все нужные коллекции — регистрировать `questionBanks`/`questions`/`answerOptions`/`tests`/`testQuestions`/`assignments`/`assignmentSubmissions`/`assignmentReviews` не пришлось. Плановая Task 3 Step 1 / Task 4 Step 1 / Task 5 Step 1 — no-op.
  5. **D5**: Plan просил ~100 HTTP integration кейсов в `mvp.domains.http.integration.test.ts`. Из-за Cyrillic-path краш этого 2400-строкового файла (см. CLAUDE.md Gotchas — NestJS worker pool init падает с `ERR_IPC_CHANNEL_CLOSED` на не-ASCII пути) создан **отдельный компактный** `assessment-admin.http.integration.test.ts` с stub-controller паттерном — 12 кейсов на 5 НОВЫХ endpoints (existing endpoints уже покрыты `mvp.domains.http.integration.test.ts` ранее). Это структурное smell, но прагматично: новый файл запускается за 3.5s через `--no-file-parallelism`.
- Что осталось до Phase 3 целиком (планируется отдельными планами): **Plan B** (learner test player + autograding lifecycle: `POST /attempts/start`, `PATCH /attempts/:id/answer`, `POST /attempts/:id/submit`, autograder для single/multi/number/text) + **Plan C** (assignment submission lifecycle + manual review scoring actions для эссе + grade essay UI). Также V1.1: question import из Excel, partial credit в multi-choice, test versions (v1/v2), question categories (отдельная таксономия — пока используем `Question.tags?`).
- Quality gates:
  - Backend: `vitest run src/modules/mvp/migrations.0040.test.ts` 7 / `mvp.dto-validation` 94 / `mvp.service` 85 / `reviewer-queue.service` 7 / `assessment-admin.http.integration` 12 = **205** (+138 vs main pre-Plan A); `tsc --noEmit` clean; ESLint `--max-warnings=0` clean.
  - Frontend: `vitest run src/features/assessment-admin/ src/e2e/admin-assessment-surface.e2e.test.ts --no-file-parallelism` **64** (16 format + 18 api.contract + 30 e2e); `tsc --noEmit` clean; ESLint clean.
  - Phase 2 baseline 232 → Phase 3 baseline 232 + 64 frontend = **296 frontend tests** (без регрессий).

### 5.94 Phase 3 — Plan B: learner test player + autograding

- Summary: завершён Phase 3 Plan B — autograding + learner-facing test player. Backend: pure-function autograder для 4 авто-типов (single/multi/number_input/text; essay → manual abstain), wired в существующий `submitAttempt` с починкой двух grading-багов; два learner-safe read endpoints (`GET /attempts/:id/questions` без reference-полей + `GET /me/tests` с actor-resolution). Frontend: feature folder `test-player/` + 3 screens (list/attempt/result) + 3 routes + nav. Реализовано на ОДНОЙ stacked ветке `feat/2026-05-30-phase-3-plan-b-test-player` (поверх неслитого Plan A) логическими коммитами (doc → backend → frontend → closeout). Plan C (manual review + practical submissions) опирается на attempts + autograde этого Plan B.
- Plan: `docs/superpowers/plans/2026-05-30-phase-3-plan-b-test-player.md`.
- Spec: `docs/superpowers/specs/2026-05-30-phase-3-assessment-design.md` (общий Phase 3 design; Plan B — runtime/autograde раздел).
- Backend (Tasks 1-6, новые файлы: `assessment-autograde.service.ts` + `.test.ts`, `test-player.service.test.ts`, `test-player.http.integration.test.ts`, `migrations.0041.test.ts`, migration `0041`):
  - `assessment-autograde.service.ts` — pure-function `gradeAnswer(question, answer) → { score, autoGraded }`: single/multi через set-equality выбранных опций vs correct, number_input через `|value − numericExpected| ≤ numericTolerance`, text через normalized (trim + lower + collapse whitespace) compare с `expectedAnswer`, essay → `autoGraded: false` (abstain, 0 до ручной проверки). 17 unit-тестов (все типы + edge: пустой ответ, отсутствующий reference, tolerance boundary, multi partial = 0).
  - `createQuestion` fix (Task 1): раньше ронял `numericExpected`/`numericTolerance`/`expectedAnswer`/`tags` при построении entity (Plan A добавил поля в тип/DTO, но persist не дотянул) — добавлен conditional-spread (`exactOptionalPropertyTypes`). `Question.expectedAnswer?` сделан типизированным полем.
  - `submitAttempt` rewrite (Task 3): ad-hoc grading loop заменён на `gradeAnswer`. Починены баги: over-scoring number_input/essay (баллы начислялись без проверки) + зануление корректного text. Per-answer `score` + `autoGraded` персистятся.
  - `getAttemptQuestions` (Task 4) — learner-safe view: ordered snapshot вопросов БЕЗ `isCorrect`/`numericExpected`/`numericTolerance`/`expectedAnswer`/`explanation` (anti-cheat); эхо сохранённого `selectedOptionIds?`/`textAnswer?` для resume. `GET /attempts/:id/questions` gated `assessment.attempts.take`, scoped к learner попытки (anti-IDOR).
  - `listLearnerTests` (Task 5) + `GET /me/tests`: actor-resolution — резолвит linked learner(s) по `linkedIamUserId === actorId` server-side, `[]` (не 403) при отсутствии привязки. `LearnerTestSummary` несёт `learnerId` (реальный id слушателя, не session.user.id) + `activeAttemptId` (resumable draft/in_progress) для list→player flow. Gated `assessment.tests.read`.
  - Migration `0041_assessment_text_expected_answer.sql` (Task 6) — additive: `expected_answer text` в `assessment.questions`, `auto_graded boolean` в `assessment.attempt_answers`, всё `IF NOT EXISTS`. 4 regex-теста.
- Frontend (Tasks 7-10, новые: feature folder `test-player/` + 3 route pages + `learner-test-player.e2e.test.ts`):
  - Task 7: `permission-map.ts` learner sync с backend seed 0038 (+`assessment.submissions.submit`/`assessment.results.read`/`assessment.assignments.read`).
  - Task 8: `test-player/` — `types.ts` (LearnerTestSummary mirror + AttemptDto/ExamResultDto/payloads), `api.ts` (`myTests` без query-param + start/get/getQuestions/saveAnswer/submit/getResult), `hooks.ts` (`useMyTests()` no-args + query hooks + `useState` mutation wrap на react-query shim), `format.ts` (RU status labels, attemptsLeft, MM:SS timer, scoreLine). 12 тестов (5 format + 7 api.contract).
  - Task 9: 3 screens — `tests-list-screen` (per-row `TestRow` child с собственным `useStartAttempt`; Start создаёт attempt → `router.push`, Resume deep-link на `activeAttemptId`), `test-attempt-screen` (type-aware inputs radio/checkbox/number/text/textarea; debounced 1500ms auto-save ТОЛЬКО dirty/touched вопросов; countdown auto-submit once; draft hydration из server-echoed answers для resume), `test-result-screen` (pass/fail + scoreLine + attempts + reviewer note). Используют shim shape (`error`, не `isError`) + state-wrappers barrel.
  - Task 10: 3 routes под `<ProtectedPage>` (`/learner/tests`, `…/[testId]/attempt/[attemptId]`, `…/[testId]/result`), nav «Мои тесты» (`assessment.tests.read`) + 3 routeMeta (specific-first; `/learner/tests` prefix — реальный gate, `[param]` entries inert-but-listed для parity). `learner-test-player.e2e.test.ts` — 11 кейсов (routing 5 / nav 2 / format pipeline 1 / module smoke 3).
- Closeout (Task 11): §5.94 + README §2 sync + plan checkboxes ticked.
- Plan B deviations:
  1. **D1 (lifecycle reused, not rebuilt)**: план предполагал создание `POST /attempts/start` + `PATCH /attempts/:id/answer` + `POST /attempts/:id/submit`. Эти endpoints УЖЕ существовали (Stage 1-2 + security hardening §5.15-5.17). Plan B их не переписывал — заменил grading-логику в submit на autograder + добавил 2 read endpoints. Major упрощение vs план.
  2. **D2 (grading-баги в существующем коде)**: при wiring autograder найдены и починены 2 предсуществующих бага — (a) `createQuestion` не персистил reference-поля → autograder не имел данных; (b) `submitAttempt` over-scoring number/essay + зануление text. Фикс корректности, не новая фича.
  3. **D3 (`/me/tests` actor-resolution + summary shape)**: план линковал list-строки на несуществующий `/learner/tests/[testId]?enrollmentId=`. Заменено на actor-resolution server-side (`/me/tests` без query-param) + перенос `learnerId`/`activeAttemptId` в `LearnerTestSummary`, чтобы list→player работал без клиентского знания learner id. `useMyTests()` без аргументов.
  4. **D4 (react-query shim)**: проект использует `react-query-shim.tsx` (aliased в tsconfig), `useQuery` возвращает только `{ data, error, isLoading, refetch }` — нет `isError`/`isPending`. Все screens ветвятся на `error` (truthy).
  5. **D5 (draft hydration для resume)**: план не описывал resume — добавлена гидрация черновиков из server-echoed `selectedOptionIds`/`textAnswer` (один раз, по `hydratedRef`); auto-save помечает «dirty» только тронутые пользователем вопросы (`dirtyRef`), чтобы гидрация не триггерила лишние сохранения.
  6. **D6 (essay deferred)**: autograder для essay abstains — реальная ручная оценка (`completeAttemptReview`) отложена в Plan C.
  7. **D7 (single stacked branch)**: вместо отдельных PR-веток (Plan A: -impl/-frontend/-closeout) весь Plan B на ОДНОЙ ветке логическими коммитами; PR stacked на неслитый Plan A (base = Plan A branch, иначе diff смешает оба плана).
- Quality gates (Cyrillic-path fallback — isolated `--no-file-parallelism` runs, per CLAUDE.md):
  - Backend: `assessment-autograde.service` 17 / `test-player.service` 11 / `test-player.http.integration` 6 / `migrations.0041` 4 = 38 новых; canonical `business-flows.e2e` 4 — без регрессий. `tsc --noEmit` clean.
  - Frontend: `test-player/` 12 (5 format + 7 api.contract) + `learner-test-player.e2e` 11 = 23; `tsc --noEmit` clean (EXIT 0); ESLint `--max-warnings=0` clean. Canonical FE E2E (`lms-role-flows` 3 + `canonical-e2e-readiness` 1) — green. Full `pnpm test:frontend`: 335 pass; 4 dynamic-import smoke-теста флапают по таймауту под full-parallel transform contention (env-only — те же тесты зелёные в isolation; затрагивает и предсуществующие admin-\* e2e, не только Plan B).

### 5.95 Phase 3 — Plan C: manual review + practical submissions

- Summary: завершён Phase 3 Plan C — ручная проверка эссе в попытках + practical-work submissions с загрузкой файлов + активная reviewer queue. **Открытие при планировании:** цикл проверки заданий (submit → take-in-review → score → complete) УЖЕ был построен и закалён (Pillar A hardening §5.15-5.18) — Plan C переиспользовал его, backend оказался намного меньше наброска §5 зонтичной спеки. Реализовано на ОДНОЙ ветке `feat/2026-05-31-phase-3-plan-c-manual-review` через subagent-driven development (13 задач: implementer + two-stage review каждая). Owner выбрал загрузку файлов (presigned MinIO).
- Plan: `docs/superpowers/plans/2026-05-31-phase-3-plan-c-manual-review.md`. Spec: `docs/superpowers/specs/2026-05-31-phase-3-plan-c-design.md`.
- Backend (Tasks 1-7):
  - **Task 1** — presigned file upload/download: `StorageClient` интерфейс + `S3StorageClient.createPresignedUploadUrl/DownloadUrl` (через `@aws-sdk/s3-request-presigner`, уже в deps); `FilesService.createUploadIntent` (MIME allowlist pdf/png/jpeg/doc/docx/xlsx + 10MB cap → register `storage.files` AV `pending` → presigned PUT) + `createDownloadUrl` (tenant-scoped lookup → presigned GET). `FilesService` получил `@Inject(S3StorageClient)` — **конструктор `MvpService` НЕ менялся** (6 args). 5 тестов (mock DB+S3).
  - **Task 2** — `completeAttemptReview`: ручная оценка essay-ответов (Plan B autograder abstain'ит на essay → provisional 0). Guard'ы (attempt `submitted`; answer exists; `autoGraded === false`; score ∈ `[0, question.score]`); пересчёт `attempt.score`/`passed`; `submitted → finished` (без нового AttemptStatus enum); re-run `finalizeExamResult`; audit `assessment.attempt_review_completed`.
  - **Task 3** — `returnAssignmentSubmission`: `under_review → returned` + удаление активного in_review ревью (чтобы после resubmit можно было создать новое — one-review-lock иначе блокирует). Цикл return → edit → resubmit → fresh review работает без правки `updateAssignmentSubmission`/`submitAssignmentSubmission` (они уже допускают `returned`).
  - **Task 4** — reviewer queue refinement: `aggregateReviewerQueue` теперь включает `submitted` попытку только если есть ≥1 ответ с `autoGraded === false` (essay-pending); снапшот получил `attemptAnswers`. (+ Task 11 fix: попытка-item несёт `essayAnswers[]`.)
  - **Task 5** — DTO (`CreateUploadUrlRequest`/`ReturnSubmissionRequest`/`CompleteAttemptReviewRequest`+nested `AttemptAnswerScore`) + 2 async service-wrapper'а (`createSubmissionUploadIntent` ownership+status guard, `getSubmissionFileUrl` read-access guard) + 4 endpoint'а (`POST …/upload-url` `submissions.submit`; `GET …/file-url` `assignments.read`; `POST …/return` + `POST /attempts/:id/complete-review` `reviews.review`). `noopFilesService` расширен. `plan-c.http.integration.test.ts` (stub-controller, 15 кейсов).
  - **Task 6** — `GET /me/assignments` (`listMyActions`): зеркало `/me/tests` — actor-resolution по `linkedIamUserId` server-side, `[]` (не 403) без привязки; enrollments → group_courses → assignments + submission status. `LearnerAssignmentSummary` несёт `enrollmentId`/`learnerId` для создания сдачи.
  - **Task 7** — migration `0042`: `return_comment` (assignment_submissions), `review_comment`+`reviewed_by` (test_attempts), additive/nullable/`IF NOT EXISTS`. 4 regex-теста.
- Frontend (Tasks 8-12):
  - **Task 8** — nav: 2 routeMeta (`/learner/assignments/[id]/submit` specific-first + `/learner/assignments`) + nav «Мои задания». Learner permission-map уже имел `submissions.submit`+`assignments.read` (Plan B sync) — без правки.
  - **Task 9** — `practical-submissions/` feature: types/api (`putFileToPresignedUrl` raw PUT в MinIO, не через `apiRequest`)/format/hooks (`useState` mutation pattern; `useUploadSubmissionFile` оркеструет intent → PUT → attach `fileId`). 11 тестов.
  - **Task 10** — learner screens: `AssignmentsListScreen` + `SubmissionScreen` (text + file upload + submit; `returned` → показ фидбэка + resubmit) + 2 routes под `<ProtectedPage>`.
  - **Task 11** — `reviewer-actions/` feature + `ReviewerActionsScreen` (заменил Plan A read-only skeleton): submissions (take/score/comment/complete/return + download-file presigned), attempts (per-essay scoring → `completeAttemptReview`). Route `/teacher/review` переключён.
  - **Task 12** — `phase-3-plan-c-review.e2e.test.ts` (15 кейсов: routing/nav/format/module-smoke).
- Closeout (Task 13): §5.95 + README §2 sync + plan checkboxes.
- Plan C deviations:
  1. **D1 (lifecycle reused)**: assignment submit/review цикл уже существовал (Pillar A) — Plan C добавил только `returnAssignmentSubmission` + `completeAttemptReview` + queue refinement + file upload + frontend. Backend << набросок спеки.
  2. **D2 (presigned upload, no new MvpService arg)**: file upload = presigned direct-to-MinIO (presigner уже dep); presign-логика в `FilesService` (получил `S3StorageClient`), `MvpService` 6-арг конструктор не тронут.
  3. **D3 (AV deferred → V1.1)**: загруженные файлы остаются `antivirus_status='pending'` (скан не подключён); митигация — MIME allowlist + 10MB cap. Presigned upload требует MinIO CORS (operational).
  4. **D4 (essay-grading data gap — review-caught defect)**: первый проход Task 11 слал `questionId: item.testId` (test id, не question id) → backend 400 на каждой essay-оценке. Two-stage review поймал. Фикс: reviewer queue attempt-item несёт `essayAnswers[] {questionId, questionTitle, answerText}` (aggregator + `getReviewerQueue` передаёт `questions`); UI рендерит строку на эссе и шлёт реальные questionId.
  5. **D5 (queue refetch)**: 4 reviewer-мутации инвалидируют `['reviewer-actions','queue']` на success (иначе очередь не обновлялась после действия).
  6. **D6 (Task 10 onSaveText)**: review предложил `if (id)` вместо `if (id && activeSubmissionId)`; оставлено как было — guard намеренно избегает лишнего update сразу после create (answerText уже в create payload), нет потери данных.
- Quality gates (Cyrillic-path fallback — isolated `--no-file-parallelism`):
  - Backend: `files.service.upload` 5 / `mvp.service` 93 (incl. completeAttemptReview/return/listMyAssignments/upload-wrappers) / `reviewer-queue.plan-c` 5 / `reviewer-queue.service` 7 / `plan-c.http.integration` 15 / `migrations.0042` 4 / canonical `business-flows.e2e` 4 = 133 pass, без регрессий §39. `tsc` 8/8.
  - Frontend: `practical-submissions` 11 + `reviewer-actions` 8 + `phase-3-plan-c-review.e2e` 15 = 34 (isolated); `tsc` clean; ESLint `--max-warnings=0` clean. (Известный env-only флап dynamic-import smoke под full-parallel transform — зелёные в isolation.)
  - Каждая из 13 задач прошла implementer + spec-compliance + code-quality review (subagent-driven); один Critical defect (D4) и один Important (D5) пойманы review-циклом и починены.

### 5.96 V1.1 — антивирус-скан как gate перед download (ядро: Tasks 1-6)

- Summary: реализовано **ядро** V1.1 AV-гейта по утверждённой спеке (`docs/superpowers/specs/2026-05-30-v1.1-antivirus-scan-gate-design.md`) и плану (`docs/superpowers/plans/2026-05-30-v1.1-antivirus-scan-gate.md`, 13 задач TDD). Закрывает долг Plan C (D3): загруженные файлы оставались `antivirus_status='pending'`, а `createDownloadUrl` не проверял статус. Ветка `feat/2026-05-30-v1.1-antivirus-scan-gate`. **Tasks 7-13 отложены** (см. ниже).
- Реализовано (Tasks 1-6, закоммичено, тесты зелёные):
  - **Task 1** — `AntivirusScanner` интерфейс + `NoopAntivirusScanner` (dev default) + `ANTIVIRUS_SCANNER` DI-токен. Новый каталог `apps/backend/src/infrastructure/antivirus/`. (commit `9571930`)
  - **Task 2** — `StorageClient.getObjectStream` + `S3StorageClient` impl — чтение байтов объекта для сканера. (`73b3154`)
  - **Task 3** — `ClamAvAntivirusScanner` (clamd INSTREAM по TCP, инъектируемый `connect` → unit-тест без живого clamd: clean/infected/error/timeout). (`7dbc753`)
  - **Task 4** — env `ANTIVIRUS_ENABLED` (default false; **кастомный bool-парс, НЕ `z.coerce.boolean`** — та мапит строку "false"→true), `CLAMAV_HOST`, `CLAMAV_PORT=3310` (`env.schema.ts` + `env.test.ts` + `.env.example`). (`37d025d`)
  - **Tasks 5+6** — `FilesService.scanFile` (скан → запись `antivirus_status`+`antivirus_checked_at` → audit `storage.file_scanned`) + `ANTIVIRUS_SCANNER` factory в `files.module.ts` (Noop/ClamAv по env; `AuditService` инъектится — он `@Global`); **download-гейт** в `createDownloadUrl`: отказ для не-`clean` (infected→423 `file_infected`, error→409 `file_scan_failed`), ленивый скан `pending` (файл никогда не отдаётся непросканированным). `MvpService.getSubmissionFileUrl` наследует гейт. (`793f930`)
- Без миграции (schema 0002 уже имеет колонки + CHECK `pending/clean/infected/error`).
- Tests (isolated, Cyrillic fallback `--no-file-parallelism`): noop 1 / clamav 4 / env 7 / files.service.upload 12 = 24 pass; backend `typecheck` OK.
- **AV выключен по умолчанию** (`ANTIVIRUS_ENABLED=false` → Noop помечает `clean`) — осознанно (spec §5/§8): механизм на месте, реальная защита включается флагом после развёртывания clamd (ops, spec §9). Файлы, загруженные до V1.1 (`pending`), досканируются лениво при первом скачивании.
- Deviations: (1) `ClamAvAntivirusScanner` юнит-тестирован против симулированного clamd — проверить на живом clamd перед `ANTIVIRUS_ENABLED=true`. (2) `ANTIVIRUS_ENABLED` использует кастомный парс ради безопасности флага. (3) Tasks 5+6 закоммичены одним коммитом (в рабочем дереве переплетены).
- **Отложено (Tasks 7-13, след. сессия):** проактивный best-effort скан в `submitAssignmentSubmission` (fire-and-forget; ОСТОРОЖНО — нужен guard, чтобы существующие submit-тесты с FilesService-моком без `scanFile` не падали); экспонировать `antivirusStatus` в submission read + reviewer-queue DTO (`getAssignmentSubmission` ~3338 + `getReviewerQueue` ~2539 синхронны → сделать async + batch `FilesService.getAntivirusStatuses`); HTTP-граница в `plan-c.http.integration.test.ts`; фронт — статус файла + гейт кнопки «Скачать» (`reviewer-actions` + `practical-submissions`); docs sync. План содержит точный код для всех.
- **Причина паузы:** кириллический путь `D:\Кодинг` сегодня давал крайне медленную отдачу вывода тестов (вывод пачками после ~40 пустых циклов) — owner выбрал зафиксировать проверенное ядро безопасности и продолжить позже. **Рекомендация:** перезапустить сессию Claude Code и/или перенести репозиторий на не-кириллический путь.

### 5.97 Wave 1 — Plan 1: модульный гейтинг + время на изучение (учебно-экзаменационное соответствие)

- Контекст: brainstorming-сессия по 8 инструкциям инкумбента СДО ПРОФ (прокторинг / SCORM-тренажёры / НЭП / FAQ / базовая) → **дорожная карта паритета** (`docs/superpowers/specs/2026-05-30-legacy-parity-roadmap.md`, 31 пробел по 5 тирам vs текущий код + ТЗ §13–§23/§41). Владелец выбрал Wave 1 = модульность + время на изучение + аутентификация перед экзаменом (№816). Этот **Plan 1** покрывает A+B; **Plan 2** (№816) — следующий. Дизайн: `docs/superpowers/specs/2026-05-30-wave1-module-gating-pre-exam-auth-design.md`. План: `docs/superpowers/plans/2026-05-31-wave1-plan1-module-gating-time-on-material.md`. Ветка `feat/2026-05-31-wave1-module-gating` (от origin/main = post-#216 AV merge), subagent-driven 7 задач.
- Ключевая находка анализа кода: все гейты сходятся в `MvpService.startAttempt` (`mvp.service.ts:2728`); прогресс / `minViewSeconds` / magic-link инфраструктура уже была → объём = «проводка + поля модели», не greenfield. Сервер — источник истины (гейт держится при входе через `/me/tests` или course-viewer).
- Backend:
  - **Task 1** — migration `0043_assessment_test_module_link.sql`: nullable `assessment.tests.module_id` + tenant-scoped composite FK `(tenant_id, module_id) → learning.course_modules(tenant_id, id)` (конвенция 0003-hardening) + index. Additive / idempotent (`DO $$ … EXCEPTION WHEN duplicate_object`).
  - **Task 2** — `TestEntity.moduleId?` (+ `CreateTestRequest` `@IsOptional @IsString @MinLength(1)`, persist в `createTest`, зеркало `apps/frontend/src/features/mvp/types.ts`). Тест без `moduleId` = итоговый/курсовой экзамен. DTO-валидация 3 кейса.
  - **Task 3 (ядро)** — 5 private-хелперов (`getModuleGatingTest` / `isExamPassed` / `requiredPriorModules` / `assertModuleSequenceGate` / `assertMinViewGate`) + 2 гейта в `startAttempt` (после IDOR, до attempt-limit; порядок sequence → min-view): `assertModuleSequenceGate` — для каждого обязательного предыдущего модуля (по `sortOrder`) с промежуточным тестом требует `ExamResult.passed`, иначе `412 module_gate_locked`; необязательный модуль и модуль без теста не блокируют. `assertMinViewGate` — `ModuleProgress.studiedSeconds >= module.minViewSeconds`, иначе `412 min_view_not_met`; no-op при `minViewSeconds<=0` или тесте без `moduleId`. **Курсы без промежуточных тестов / без `minViewSeconds` → оба гейта no-op (нет регрессий существующих экзамен-флоу).** `module-gating.service.test.ts` 6 кейсов (реальные `startAttempt`/`finishAttempt`/`upsertMaterialProgress`). Гейт только в learner-attempt-пути → «методист видит всё» (FAQ §5) соблюдено структурно (admin-preview не зовёт `startAttempt`).
- Frontend:
  - `course-viewer/module-gate.ts` — чистые `buildModuleGateState(tests, examResults)` (`Map<moduleId,{gatingTestId,passed}>`) + `computeModuleLocks(tree, gate)` (зеркало серверного гейта по `sortOrder`). `module-gate.test.ts` 6 кейсов.
  - `useModuleGateState(courseId, enrollmentId)` (`hooks.ts`) — `listTests`(course_id) + `listExamResults`(learner-scoped server-side).
  - `use-watch-tracker.ts` — проброшен `onTick`; `course-viewer-screen.tsx` — обратный отсчёт `minViewSeconds − studied` + `moduleLocks` в TOC; `table-of-contents.tsx` — `🔒` + `open={false}` + материалы запертого модуля forced-`locked`.
- Двухэтапное ревью (spec + quality, subagent) backend и frontend поймало и починено: (1) code-в-`message` leak `"module_gate_locked: …"` → чистый `message` + тесты на `getResponse().code`; (2) simple FK → tenant-scoped composite FK (0003-конвенция); (3) порядок гейтов (sequence перед min-view); (4) missing non-required-module frontend-тест.
- Известный долг: `enrollment_id` отсутствует в `GeneratedBaseFilterQuery` → `as BaseFilterQuery` каст в `useModuleGateState` (рантайм корректен: backend list-фильтр honors + learner-scope). **TODO wave1.1:** typed `/exam-results/by-enrollment/:id` fetch или регенерация контракта. Каст задокументирован в коде комментарием.
- Quality gates (Cyrillic-path isolated `--no-file-parallelism`): backend `module-gating` 6 + `mvp.dto-validation` 97 + регресс `business-flows.e2e` 4 + `test-player` 11; frontend `course-viewer` 26 (7 файлов); contracts 7; `tsc` 8/8; ESLint clean. Полный `pnpm -s ci:check` локально не гонялся (краш backend-suite на кириллице — CLAUDE.md Gotchas) → покрывает CI (Ubuntu).
- Коммиты: `docs(plan)` → `feat(backend)` ×2 (model, gates) → `fix(backend)` (review) → `feat(frontend)` ×2 → `test/fix(frontend)` ×2.

### 5.98 Wave 1 — Plan 2: аутентификация слушателя перед экзаменом (Приказ Минобрнауки №816)

- Контекст: **Plan 2** Волны 1 (учебно-экзаменационное соответствие), функция (C) дизайна `docs/superpowers/specs/2026-05-30-wave1-module-gating-pre-exam-auth-design.md` §3.C. Plan 1 (A+B) слит ранее (PR #218). План: `docs/superpowers/plans/2026-05-31-wave1-pre-exam-auth.md`. Ветка `feat/2026-05-31-wave1-pre-exam-auth` (от origin/main = post-#218), subagent-driven 9 задач, двухэтапное ревью на ядре.
- Ключевая находка: как и A/B, гейт сходится в `MvpService.startAttempt`; крипто magic-link (`randomBytes+SHA-256`, single-use, TTL) переиспользуемо. **Выбор хранения:** не отдельная repo-абстракция (как IAM magic-link), а MVP-коллекция `preExamTokens` (JSONB-снапшот) — **consumed-токен (`consumedAt` + привязка `enrollmentId+testId`) сам является записью верификации** (без второй коллекции; удовлетворяет «повторные попытки того же экзамена не переспрашивают» и «другой итоговый экзамен — новая верификация»).
- Backend:
  - **Task 1** — migration `0044_assessment_pre_exam_auth.sql`: `learning.group_courses.requires_pre_exam_auth boolean NOT NULL DEFAULT false`; `assessment.test_attempts.identity_verified_at` + `identity_verification_token_id`; новая таблица `assessment.pre_exam_tokens` (зеркало `iam.magic_link_tokens` + контекст enrollment/test/learner, hash-only, unique `(tenant_id, token_hash)`). Additive/idempotent. Типизированный контракт (0016) — рантайм MVP пишет JSONB-снапшот. `pre_exam_tokens` НЕ в `mvpDomainTables` (нет `updated_at`, как и у magic_link_tokens). Migration suites 29+3 зелёные.
  - **Task 2** — `GroupCourse.requiresPreExamAuth?`, `TestAttempt.identityVerifiedAt?`/`identityVerificationTokenId?`, новый `PreExamToken extends BaseEntity`; коллекция `preExamTokens` в `in-memory-mvp.state.ts` **и** `MVP_COLLECTIONS` (вместе — иначе теряется между запросами); `@IsBoolean requiresPreExamAuth?` в Create/Update GroupCourse DTO.
  - **Task 3** — чистый `pre-exam-token.ts`: `generatePreExamToken` (`randomBytes(32).base64url`), `hashPreExamToken` (SHA-256 hex), `buildPreExamAuthUrl` (`${PUBLIC_BASE_URL}/exam-auth/:token`), `PRE_EXAM_TOKEN_TTL_MS=15м`. `pre-exam-token.test.ts` 6 кейсов (TDD).
  - **Task 4 (ядро)** — `requestPreExamToken` (выпуск токена, лог URL через поле `Logger`, **без возврата raw**; `{ delivered, alreadyVerified }`), `requestPreExamTokenRaw` (**test/dev-only, НЕ на контроллере** — возвращает raw для тестов), `verifyPreExamToken` (поиск по hash, tenant-scoped; not-expired; `consumedAt`; идемпотентно при повторе; коды `pre_exam_token_invalid`/`pre_exam_token_expired`), `assertPreExamAuthGate` (early-return если `test.moduleId` set → **только итоговый экзамен**; early-return если флаг группы off; иначе требует consumed-токен по `(enrollment, test)`, иначе `412 pre_exam_auth_required`); `resolveAttemptContext` (DRY с `startAttempt`). Гейт в `startAttempt` после A/B-гейтов; стамп `identityVerifiedAt`/`identityVerificationTokenId` на попытку (conditional spread). Флаг персистится в `createGroupCourse`/`updateGroupCourse`. **6-арг конструктор MvpService не тронут.** `pre-exam-auth.service.test.ts` 9 кейсов (gate off/blocked/verified→allowed/repeat-not-reprompted/module-bypass/expired/alreadyVerified/unknown-token; hash-only-storage).
  - **Task 5** — `RequestPreExamTokenRequest` (testId/enrollmentId/learnerId) + `VerifyPreExamTokenRequest` (token); DTO-валидация (5 кейсов, файл 102 теста).
  - **Task 6** — `POST /attempts/request-pre-exam-token` + `POST /attempts/verify-pre-exam-token` (оба `assessment.attempts.take`, `assertValidDto`). Контроллер зовёт **no-leak `requestPreExamToken`**, не `*Raw`. HTTP integration (стаб-контроллер) 18 тестов (12 prev + 6: auth-required/perm-denied/envelope ×2 route).
- Frontend:
  - **Task 7** — `AttemptDto.identityVerifiedAt?` + типы payload/response; `testPlayerApi.requestPreExamToken`/`verifyPreExamToken`; хук `useRequestPreExamToken` (зеркало `useStartAttempt`, `useState`+async). `api.contract.test.ts` 9 (7 prev + 2).
  - **Task 8** — интерстишал в `tests-list-screen.tsx` (детект гейта по error-строке: regex `/pre_exam_auth_required|identity verification is required/i` — НЕ срабатывает на других ошибках типа `attempt_limit_reached`); страница `app/exam-auth/[token]/page.tsx` (зеркало magic-link page: `useRef` idempotency-guard, array-param guard, pending/ok/error); маркер «Личность подтверждена ✓» в результате (через `useAttempt`).
- Двухэтапное ревью ядра (Task 4, subagent): APPROVED — независимо подтверждены no-leak raw-токена, tenant-scoping всех 3 lookup, корректность гейта/позиции, привязка верификации по `enrollmentId`+`testId`, TTL/single-use/идемпотентность, нетронутый конструктор. Найдены и закрыты 3 пробела покрытия (module-bypass / expired / alreadyVerified тесты) + убран `void hashPreExamToken` smell (использован в hash-only-storage assert). Ревью уточнило: backend `tsconfig` `exactOptionalPropertyTypes: false` (на frontend — `true`).
- Известные ограничения / отложено (честно): (1) **Email — logging-заглушка** (URL в логах сервера, как у magic-link; реальный адаптер — отдельная задача, roadmap Tier 4 #22 SendPulse). (2) Гейт — **только итоговый экзамен** (`moduleId == null`), не промежуточные тесты (соответствует №816 «перед итоговой аттестацией» + фразе дизайна «другой итоговый экзамен — новая верификация»); если владелец захочет гейтить все тесты — убрать early-return по `moduleId`. (3) Tenant-уровневая настройка «включать по умолчанию новым группам» (§6 acceptance C) НЕ реализована — есть per-group-course opt-in (default false); tenant-default — малый follow-up. (4) Маркер идентификации — в результате попытки, не в admin-карточке слушателя (нет admin attempts-view) — follow-up. (5) `requestPreExamTokenRaw` — test/dev-only, не на контроллере (проверено grep).
- Quality gates (Cyrillic-path isolated `--no-file-parallelism`): backend `pre-exam-token` 6 + `pre-exam-auth.service` 9 + `mvp.dto-validation` 102 + `assessment-admin.http.integration` 18 + регресс `module-gating` 6 / `test-player` 11 / `business-flows.e2e` 4 (138 в общем прогоне); frontend `test-player` 14; contracts 7; `tsc` 8/8; ESLint clean (per-file lint-staged). Полный `pnpm -s ci:check` локально не гонялся (краш backend-suite на кириллице) → CI (Ubuntu).
- Коммиты: `docs(plan)` → `feat(backend)` ×4 (migration, model, crypto, service-gate) → `test(backend)` (review) → `feat(backend)` (DTO) → `feat(backend)` (endpoints) → `feat(frontend)` ×2 (api+hook, UI).

### 5.99 Консолидация статуса планов + гигиена чек-листов (PLANS_STATUS.md)

- Контекст: запрос «найти все планы, свести в один, дописать код». Сверка показала, что **дописывать по планам нечего** — все 17 планов в `docs/superpowers/plans/` уже реализованы и слиты (PR #167–#219). 786 невыполненных галочек `- [ ]` оказались **устаревшим трекингом** (агенты сливали код, но не проставляли галочки), а не невыполненной работой. Сессия — гигиена документации, **без изменений кода**.
- Метод: 5 параллельных агентов (по группе связанных планов через `superpowers:dispatching-parallel-agents`), каждый сверял факт реализации по `git log --oneline --all` + наличию файлов из «File Structure» плана, затем консервативно проставлял галочки только подтверждённо-готовых задач (при сомнении — оставлял незакрытой).
- Создан **`docs/superpowers/plans/PLANS_STATUS.md`** — единый навигатор: таблица 17 планов (статус / PR / галочки), карта PR→план, раздел «что реально осталось», методология проверки. Перекрёстная ссылка добавлена в README §2.
- Галочки: невыполненных стало **110 осознанно-открытых** (было 786): roadmap 70 (Phase 0 + Phase 4–11 + бизнес-гейты — будущее), Phase 2 Plan B 3 (нет E2E-теста), AV-гейт 37 (Tasks 7–13 отложены). ~736 устаревших проставлены.
- **Реальные пробелы, выявленные сверкой** (важно — НЕ закрашены ложно): (1) **AV-гейт Tasks 7–13** — проактивный скан / статус-UI / integration-тест / доки отложены (ядро download-гейта уже в проде, #217); (2) **Phase 2 Plan B** — не создан `apps/frontend/src/e2e/admin-learners-management.e2e.test.ts`; готовый файл лежит на не-слитой ветке `feat/2026-05-29-phase-2-plan-b-closeout`, в `main` не попал; (3) **Wave 2** (регуляторные выгрузки ФИС ФРДО / ЕИСОТ) = незакрытый дом Phase 6 роадмапа.
- Гигиена: откатил порчу строки-примера `(`- [ ]`)` в служебной шапке 12 планов (агентский global-replace задел); из `2026-05-30-v1.1-antivirus-scan-gate.md` удалены 6 NUL-байтов (файл был «бинарным» для git/grep/prettier) → теперь валидный UTF-8.
- Тесты: не затронуты (изменения только в `.md`). Prettier применён к новым/правленым файлам; `pnpm` quality gates не релевантны (нет кода).
- Деривация от протокола: README §2 Current Stage/Last Completed/Next Task НЕ переписаны (продуктовое состояние не менялось — остаётся Wave 1 Plan 2 / далее Wave 2); добавлен только указатель на PLANS_STATUS.md.

### 5.100 Wave 2 — Plan B: выгрузка в реестр обученных по ОТ (Минтруд/ЕИСОТ, ПП №2464)

- Контекст: **Plan B** Волны 2 (регуляторные выгрузки), под-цель #3 дорожной карты `docs/superpowers/specs/2026-05-30-legacy-parity-roadmap.md` §3/§4. Спека `docs/superpowers/specs/2026-05-31-eisot-ot-trained-registry-export-design.md`, план `docs/superpowers/plans/2026-05-31-eisot-ot-trained-registry-export.md`. Ветка `feat/2026-05-31-eisot-ot-trained-registry-export` (от main = post-#219, после merge с PLANS_STATUS #220). Поток: brainstorming → spec → writing-plans → subagent-driven (8 слайсов; выбор владельца — «реестр обученных по ОТ» первым, формат Excel, полный round-trip). PR #222.
- **Ключевое отклонение от Approach A спеки** (по разведке кода, обоснованно): durable-реализация в **MVP-модуле**, НЕ в in-memory `integrations`-`EisotAdapter`. Причина: integrations-оркестратор не персистентен (process-memory, без Postgres/worker) и пишет 1 summary `ExportItem` на задачу → обратная загрузка рег. номеров (дни спустя) и пер-record хранение там невозможны. Адаптерный шов оставлен нетронутым для будущей live-API отправки (Phase 4). Прочие отклонения: маппинг = поле `course_versions.ot_program_codes text[]` (зеркало `regulatory_basis_codes`), не отдельная таблица; рег.номер — на durable record (не мутация выпущенного PDF-протокола).
- Backend (Slices 1–6):
  - **Миграция `0045`**: `lookup.ot_training_programs` (глобальный классификатор, сид 5 канон. программ ПП2464 — registry_id/exact_name **временные**, сверить с офиц. ЛКОТ); `learning.course_versions.ot_program_codes text[]`; права `regulatory.export.read/write` (write → platform_admin/tenant_admin; read → +methodist/manager). 10 SQL-content assert в `mvp-domain-migrations.test.ts`.
  - **Типы + lookup + маппинг**: типы `OtTrainingProgram/OtRegistryRow/Batch/Record/ExportOutcome/ResponseRow/ImportOutcome` + `ProgramMeta.otProgramCodes`; `MvpService.listOtTrainingPrograms()` (модульная константа-сид `OT_TRAINING_PROGRAMS_SEED`, как `REGULATORY_ACTS_SEED`) + `GET /ot-training-programs`; `otProgramCodes` в program-meta DTO/`updateProgramMeta`.
  - **Чистые функции**: `ot-registry-preflight.validateRegistryRow` (СНИЛС ПФР reuse `isValidSnilsChecksum`, ИНН 10/12, required, mapping-present); `ot-registry-rows.buildRegistryRows` (разворот человек×программа; ISO→ДД.ММ.ГГГГ; ФИО Фамилия Имя Отчество).
  - **Инфраструктура**: `StorageClient.putObject` (S3 `PutObjectCommand` с Body — раньше только presign); `FilesService.register(antivirusStatus?)` (default `pending`; экспорт = `clean`, чтобы AV-гейт скачивания не блокировал self-generated); `OtRegistryXlsxWriter` (exceljs, 9-колоночный `COLUMNS` — **заголовки временные**; golden-file тест).
  - **`OtRegistryService`** (`Scope.REQUEST`; инжектит `MVP_STATE`/`MvpService`/`DocumentsService`/`FilesService`/`S3StorageClient`/writer/`AuditService`): сбор completed-ОТ-зачислений (enrollment→group→counterparty.inn, courseVersion.otProgramCodes, protocol-документ `documentType:'protocol'`, exam.passed) → preflight → .xlsx → storage (`${tenant}/ot-registry/${id}.xlsx`) → durable `otRegistryBatches`/`otRegistryRecords` (в `MVP_COLLECTIONS` + in-memory state) → audit `regulatory.ot_registry_exported` (только counts). `listBatches`/`getBatchWithRecords`/`getBatchDownloadUrl`.
  - **Endpoints** `OtRegistryController` (`@Controller('ot-registry')` + `MvpRequestPersistenceInterceptor` + `TenantGuard`): `POST /exports` (`regulatory.export.write`), `GET /exports`/`:id`/`:id/file` (read); permission-boundary в `mvp.http.integration.test.ts` (расширение per CLAUDE.md).
  - **Round-trip**: `ot-registry-response.parser` (`parseRegistryResponse` exceljs + `matchResponseToRecords` по СНИЛС-digits+протокол+programRegistryId — **RESPONSE_COLUMNS временные**); `OtRegistryService.importRegistryResponse` (base64 .xlsx → `registrationNumber` in-place → persist через interceptor → audit `regulatory.ot_registry_response_imported`); `POST /exports/:id/registry-response` (write).
- Frontend (Slice 7): `features/gov-export` (api `withAuth` зеркало bulk-enrollments, hooks `useOtTrainingPrograms`/`useOtRegistryBatches`, types, contract-tests 3); секция «Реестр обученных по ОТ» на `app/gov-export` (сформировать/preflight-ошибки/история/скачать/загрузить файл-ответ FileReader→base64; `useState`+async); мультиселект программ в `ProgramMetaSection` + `otProgramCodes` в frontend `ProgramMetaPatch`/`CourseVersion`; `/gov-export` под `regulatory.export.read`; e2e `ot-registry-export.e2e.test.ts` 7 (route/nav, без render).
- Ревью backend (subagent, adversarial) — **APPROVED-with-fixes** (commit `143f437`). Подтверждены tenant-isolation, ПДн-чистый audit (+`maskPii`), contained AV-clean bypass (user-uploads остаются scanned), download-гейт под read+clean, реальные тесты (fan-out, persisted state, exceljs round-trip). Закрыты: **(Important #1)** dangling-FK getter не прерывает batch — `try/catch` → пер-row ошибка `field:'enrollment'` (partial-success); **(Important #2)** completed без сданного экзамена НЕ выгружается как «неудовлетворительно» — `!examPassed` → ошибка `field:'result'` + исключение (spec default «выгружаем сданные»); **(Minor)** `enrolledFrom/To` реально применяются; malformed ответ → `400 invalid_xlsx`; `@MaxLength` на `fileBase64`. Отложены: orphan storage.files-row при сбое putObject (безвреден); `GET /ot-training-programs` без отдельного права (non-PII справочник).
- Известные ограничения / отложено (честно): (1) **3 регуляторных артефакта (§13) — временные**, изолированы в 3 местах (сид `0045`; `COLUMNS` writer'а; `RESPONSE_COLUMNS` парсера): точные ID/имена классификатора, заголовки офиц. `.xlsx`, формат файла-ответа — из кабинета ЛКОТ владельца; логика формат-независима. (2) **Live API ЕСИА/УКЭП** — Phase 4 (адаптерный шов готов). (3) **XML-сериализация** — отдельно. (4) Под-цели **A (ФИС ФРДО)** / **C (ЕИСОТ «лица на тестирование»)** — отдельные планы. (5) `enrolledFrom/To` фильтруются в сервисе (in-memory `list()` не поддерживает; Postgres-путь при необходимости).
- Quality gates (Cyrillic-path isolated `--no-file-parallelism`): backend 102 (11 файлов: preflight 4 / rows 2 / writer 1 / parser 2 / lookup 4 / program-meta 4 / service 9 / mvp.http.integration 24 / migrations 39 / files 12 / s3-storage 1); frontend 10 (contract 3 + e2e 7); `tsc` backend 0 + frontend 0; ESLint clean. Полный `pnpm -s ci:check` локально не гонялся (краш backend-suite на кириллице) → CI (Ubuntu).
- Коммиты: `docs(spec)`+`docs(plan)` → `chore(backend)` (exceljs) → `feat(backend)` ×N (migration → types → lookup → mapping → preflight → rows → storage → writer → service → endpoints → parser → import) → `fix(backend)` (review) → `feat(frontend)` ×4 → `docs`.

### 5.101 ОТ-реестр: provisional-шаблоны + XML-сериализация (XSD 1.0.3, выбор формата)

Дата: 2026-06-01. Ветка `feat/2026-06-01-ot-registry-provisional-templates` (от `origin/main` с влитым #222). Слита в `main` (#223).

**Контекст.** Владелец: «придумай сам шаблоны». Прослежены ссылки прошлой сессии (`e1b89344`): офиц. `.xlsx`-шаблон и **XSD-схема v1.0.3** — в разделе `akot.rosmintrud.ru/sout/info` → «Справочная информация» → «Обучение по ОТ» (JS-рендеренный/ЕСИА-gated, недоступен WebFetch/WebSearch — 5 попыток). Состав полей подтверждён публично. Канонический формат импорта реестра — **XML по XSD 1.0.3**; `.xlsx` — человеко-читаемый шаблон. Решение: provisional-шаблоны, изолированные и помеченные, swappable на эталон одной правкой.

**Сделано (план `docs/superpowers/plans/2026-06-01-ot-registry-provisional-templates.md`, дизайн spec §16):**

- **Provisional-маркировка** (Task 1): комментарии `PROVISIONAL — сверить с офиц. ЛКОТ` над `COLUMNS` (`ot-registry-xlsx.writer.ts`) и `RESPONSE_COLUMNS` (`ot-registry-response.parser.ts`).
- **XML-сериализатор** (Task 2): новый `OtRegistryXmlWriter` (`ot-registry-xml.writer.ts`) — `contentType='application/xml'`, корень `<РеестрОбученныхОТ ВерсияФормата="1.0.3" [ИННОрганизации][РегНомерОрганизации]>`, `<Запись>` (те же поля) + `<ПрограммаОбучения Код="…">`, XML-экранирование; единственная точка маппинга `ELEMENTS`. Golden-тест: 2 кейса (атрибуты/экранирование).
- **Выбор формата `xlsx|xml`** (Task 3): `CreateOtRegistryExportDto.format` (`@IsIn`), `OtRegistryExportFilter.format`, `OtRegistryBatch.format`; ветка в `OtRegistryService.exportOtRegistry` (writer/contentType/расширение по формату); провайдер `OtRegistryXmlWriter` в `mvp.module.ts`; инстанцирование в `ot-registry.service.test.ts` (8-й арг). Новый сервис-тест: `format:"xml"` → `application/xml` + ключ `.xml` + `batch.format`.
- **Frontend** (Task 4): `govExportApi.createOtRegistryExport` принимает `format`; `<select>` Excel/XML + provisional-баннер (⚠️ сверить с ЛКОТ) в секции «Реестр обученных по ОТ» (`app/gov-export/page.tsx`); `OtRegistryBatch.format` в типах; contract-тест шлёт+проверяет `format:'xml'`.

**Тесты/гейты (Cyrillic isolated `--no-file-parallelism`):** backend `ot-registry/` 29 (+xml writer 2, +service xml 1; полный dir-прогон зелёный), frontend gov-export 10 (contract 3 + e2e 7); `pnpm typecheck` 8/8; ESLint changed-files clean.

**Deviations от spec §16 (по доказательствам):** ФИО оставлено **комбинированным** (подтверждённое поле — «ФИО»; раздельное — без основания); миграцию **`0045` не трогали** (историческая/слита; 5 программ ПП №2464 корректны — provisional только `registry_id`); **колонку «статус» файла-ответа не добавляли** (ложная точность; парсер устойчив); опция «выгрузка несданных» — вне scope (spec §14).

**⚠️ Главное для следующего агента/владельца:** все артефакты **PROVISIONAL**, НЕ сверены с эталоном ЛКОТ. Реальная подстановка = из кабинета ЛКОТ скачать `.xlsx`-шаблон + XSD 1.0.3 → заменить `COLUMNS` / `ELEMENTS` / `RESPONSE_COLUMNS` / сид (новой миграцией) — по одной точке на артефакт. Память: `project_wave2_ot_registry_export.md` (раздел «Format research»).

### 5.102 V1.1 — антивирус-скан-гейт: Задачи 7-13 (завершение)

- Контекст: завершает план `docs/superpowers/plans/2026-05-30-v1.1-antivirus-scan-gate.md` (спека `…/specs/2026-05-30-v1.1-antivirus-scan-gate-design.md`). Ядро (Задачи 1-6: интерфейс сканера + Noop/ClamAV, `getObjectStream`, env-флаги, `scanFile`, download-гейт) уже в проде (#216-217, §5.96). Эта сессия закрывает отложенную «обвязку и UI» (Задачи 7-13). Ветка `feat/2026-06-02-v1.1-antivirus-tasks-7-13` от **`origin/main`** (= `afb172b`, #222 merge; перед PR влит #223 — ОТ-реестр provisional). **NB:** локальный `main` был на 28 коммитов позади `origin/main`, поэтому ветка базировалась на `origin/main`, а не на локальном `main`. Поток: executing-plans + TDD пошагово (RED→GREEN→lint→typecheck→commit на каждую задачу).
- **Task 7 — проактивный скан при submit**: в `MvpService.submitAssignmentSubmission` после audit, при `current.fileId`, fire-and-forget `void this.filesService.scanFile(tenantId, fileId, actorId).catch(...)`; добавлен `avScanLogger = new Logger('AvScan')` (наблюдаемость вместо тихого глотания — gate всё равно лениво пересканит `pending`). Тест `assignment-submission-scan.service.test.ts`.
- **Task 8 — `antivirusStatus` в read-DTO**: `FilesService.getAntivirusStatuses(tenantId, fileIds[])` (батч `id = any($2)`, пустой вход → без запроса) + `getAntivirusStatus` (single). `getAssignmentSubmission` и `getReviewerQueue` стали **async** и отдают `antivirusStatus`. Для очереди: pure `aggregateReviewerQueue` пробрасывает `fileId` (conditional spread), сервис батч-резолвит статусы и подмешивает (без N+1). Типы: `ReviewerQueueItem.fileId?`/`antivirusStatus?`. Правка IAM-теста `mvp.service.test.ts` (sync→async: `await … .rejects.toThrow` + `(await …).id`).
- **Task 9 — HTTP-гейт boundary**: в `plan-c.http.integration.test.ts` stub-контроллер инжектит **реальный** `FilesService` (фейк-`db` по `fileId`→status, `NoopAntivirusScanner`, audit-double) → `GET /assignment-submissions/:id/file-url` реально проходит через gate: `sub_clean`→200+url, `sub_infected`→**423** `file_infected`, `sub_error`→**409** `file_scan_failed` (через `HttpExceptionEnvelopeFilter`). `sub_1` замаплен на `clean`, чтобы исходный happy-path тест остался зелёным.
- **Task 10 — frontend DTO + contract**: тип `AntivirusStatus = pending|clean|infected|error` (в `practical-submissions/types`), поле `antivirusStatus?` в `AssignmentSubmissionDto` и `ReviewerQueueItem` (+ `fileId?` для очереди). Contract-тесты: reviewer-queue submission item + `getSubmission` несут `antivirusStatus` через envelope.
- **Task 11 — UI ревьюера** (`reviewer-actions-screen.tsx`): `formatAntivirusStatus` (RU-лейблы); кнопка «Скачать файл» только при `antivirusStatus === 'clean'`, иначе лейбл статуса; `onDownloadFile` ловит ошибку гейта в `downloadError` → `SectionError`.
- **Task 12 — UI слушателя** (`submission-screen.tsx`): `formatAntivirusStatusLearner` (RU); статус в карточке «Файл». **Отклонение**: экран ведёт `LearnerAssignmentSummary` (без fileId/status) → полный DTO берётся через существующий `useSubmission(activeSubmissionId)` (хук поднят над early-returns по rules-of-hooks); после загрузки файла — `submission.refetch()`.
- **Отклонения от плана** (план писался под исходный AV-PR): (1) reviewer-queue строит pure-функция, не inline-массив → обогащение в `getReviewerQueue`; (2) submission-экран без загруженного submission-DTO → `useSubmission`; (3) добавлен `avScanLogger` (план допускал no-op catch); (4) Known-Issues — §7 этого README (план говорил §13), исходный entry был §5.96.
- Тесты (Cyrillic-path isolated `--no-file-parallelism`): backend кластер 63 (noop 1 / clamav 4 / env 7 / files 16 / scan+enrich 5 / reviewer-queue 7 / reviewer-queue.plan-c 5 / plan-c.http 18) + `mvp.service.test.ts` 93/93; frontend 22 (reviewer format 3 / learner format 4 / reviewer contract 7 / learner contract 8). `pnpm typecheck` 8/8; ESLint clean по всем изменённым. Полный `pnpm -s ci:check` локально не гонялся (Cyrillic-краш backend-suite) → CI (Ubuntu).
- **Единственный остаток** — ops: поднять clamd + `ANTIVIRUS_ENABLED=true` (spec §9). В коде V1.1 AV-гейт закрыт полностью; «остаток №1» из `PLANS_STATUS.md` закрывается.
- Коммиты (Conventional, по задаче): `feat(backend)` proactive scan → `feat(backend)` antivirusStatus read DTOs → `test(backend)` HTTP gate boundary → `feat(frontend)` DTO types+contract → `feat(frontend)` reviewer gate → `feat(frontend)` learner status → `docs(handoff)` (§5.102 + README §2/§7 + plan checkboxes). Merge `origin/main` (#223) разрешён в README §2 + handoff (§5.101 — ОТ, §5.102 — AV).

### 5.103 Wave 2 — Plan A: выгрузка в ФИС ФРДО (Рособрнадзор) по выданным документам

- Контекст: реализует план `docs/superpowers/plans/2026-06-03-frdo-registry-export.md` (спека `…/specs/2026-06-03-frdo-registry-export-design.md`); Волна 2 под-цель **A** дорожной карты паритета (#1, ТЗ §17, BL-007/008). Ветка `feat/2026-06-03-frdo-registry-export` от локального `main` (= #224 merge, `858ef9f`). brainstorming → writing-plans → executing-plans (inline — задачи тесно связаны) + TDD пошагово (RED→GREEN→tsc→commit). Изоморфна ОТ-реестру (§5.100/5.101), но источник иной.
- **Ключевое отличие от ОТ**: ОТ строит строки из зачислений+протокола; ФРДО — **по выданным документам об обучении** (удостоверения ПК / дипломы ПП) через готовый `DocumentsService.listIssuedDocuments`. Одна строка = один документ (без разворота человек×программа), без раунд-трипа (ФРДО не возвращает номера — рег.номер = наш `documentNumber`), только `.xlsx` (XML-веб-сервис ФРДО = Phase 4).
- **Backend (durable MVP-модуль `frdo-registry/`, НЕ пустой `FrdoAdapter`)**: migration `0046` (`lookup.frdo_document_kinds` provisional-сид PK/PP + `learning.learners.date_of_birth`); типы `Frdo*` в `mvp.types.ts` + 2 коллекции state/`mvp-collections`; `Learner.dateOfBirth` через `createLearnerExtended`/`updateLearnerExtended`/DTO/bulk-import (JSONB-персистенция — без правки маппера); `listFrdoDocumentKinds()` (+ `FRDO_DOCUMENT_KINDS_SEED`); pure `buildFrdoRows` (документ→строка, даты ДД.ММ.ГГГГ); `validateFrdoRow` (жёсткие поля + опц. СНИЛС-чексумма); `FrdoRegistryXlsxWriter` (`COLUMNS` — swap-2, PROVISIONAL); `FrdoRegistryService` (Scope.REQUEST: собрать `certificate|diploma`, исключить archived/revoked, джойн enrollment→learner/course/version, preflight, `.xlsx`, persist batch+records, audit `regulatory.frdo_exported`); DTO + `@Controller('frdo-registry')` (4 эндпоинта, `regulatory.export.read/write` — переиспользованы из 0045); wiring в `mvp.module`.
- **Frontend**: `features/gov-export/` — `Frdo*`-типы, `createFrdoRegistryExport`/`listFrdoBatches`/`getFrdoBatchFileUrl`, `useFrdoRegistryBatches`; секция «ФИС ФРДО (Рособрнадзор)» на `/gov-export` (provisional-баннер + период from/to + генерация + история/скачивание; без формата/раунд-трипа).
- **Отклонения от спеки (осознанно, план §«Known deviations»)**: (1) реквизиты организации — контекст ЛК-аккаунта, не колонки строки (frdo-credential отложен); (2) preflight без канала warnings — пустые ячейки для отсутствующих опц. полей; (3) статус-фильтр `generated`+`final` (искл. archived/revoked), не только `final` — иначе риск пустой выгрузки; (4) аудит `regulatory.frdo_exported` (как ОТ).
- Тесты (Cyrillic-path isolated `--no-file-parallelism`): backend кластер **6 файлов / 131 тест** (`frdo-registry/*`: rows 2 / preflight 3 / xlsx 1 / service 2 + `mvp.service.test` 95 [+dateOfBirth +listFrdoDocumentKinds] + `mvp.http.integration` 28 [+4 ФРДО boundary]); bulk-import dateOfBirth 1; frontend `gov-export/api.contract` 4 (+1 ФРДО) + e2e `frdo-registry-export` 4. `pnpm typecheck` **8/8**; ESLint clean (import/order авто-фикс в module/controller). Полный `pnpm -s ci:check` локально не гонялся (Cyrillic-краш) → CI.
- **PROVISIONAL** (как ОТ): 2 swap-точки — сид `lookup.frdo_document_kinds` (migration 0046) + `COLUMNS` в `frdo-registry-xlsx.writer.ts`; обе помечены в коде, UI-баннер. Подставить офиц. Excel-шаблон ФРДО + перечень видов документов ПО/ДПО перед боевой подачей. **Follow-up**: фронтовый Excel-парсер колонки «Дата рождения»→`dateOfBirth` в bulk-импорте (бэкенд-проброс готов).
- Коммиты (Conventional, по задаче): migration 0046 → types+state+collections → dateOfBirth wiring → classifier reader → buildFrdoRows → preflight → xlsx writer → service orchestrator → endpoints+wiring+boundary → frontend section → bulk-import dateOfBirth → e2e+docs. PR — после ревью.

### 5.104 Wave 2 — Plan C: выгрузка в ЕИСОТ «лица на тестирование» (Минтруд / ЛКОТ)

- Контекст: реализует план `docs/superpowers/plans/2026-06-03-eisot-testing-registry-export.md` (спека `…/specs/2026-06-03-eisot-testing-registry-export-design.md`); Волна 2 под-цель **C** дорожной карты паритета (#3, ТЗ §17, BL-008). Ветка `feat/2026-06-03-eisot-testing-registry-export` от `origin/main` (= #225 merge, `05c6669`). brainstorming → writing-plans → executing-plans (inline — задачи тесно связаны) + TDD пошагово (RED→GREEN→commit). Изоморфна ФРДО (§5.103), но источник и гранулярность иные.
- **Ключевое отличие от A/B**: ОТ строит строки из зачислений+протокола, ФРДО — из выданных документов; ЕИСОТ C — **ростер «кого предстоит протестировать»** по фильтру (группа/период/клиент) через `MvpService.listEnrollments`, **одна строка = один слушатель** (дедуп), **без экзамена/документа**, без раунд-трипа, только `.xlsx`. **Самая лёгкая из трёх — без миграции** (все поля уже в `main`: `learner.snils/position/dateOfBirth`, `counterparty.name/inn`; права `regulatory.export.read/write` из 0045 переиспользованы).
- **Backend (durable MVP-модуль `eisot-testing-registry/`, НЕ пустой `EisotAdapter`)**: типы `EisotTesting*` в `mvp.types.ts` + 2 коллекции state/`mvp-collections`; pure `buildEisotTestingRows` (зачисление→строка слушателя, даты ДД.ММ.ГГГГ); `validateEisotTestingRow` (жёсткие ФИО+работодатель; опц. СНИЛС-чексумма + ИНН 10/12); `EisotTestingXlsxWriter` (`COLUMNS` — единственная swap-точка, PROVISIONAL); `EisotTestingRegistryService` (Scope.REQUEST: `listEnrollments` по `group_id` + ре-фильтр `enrolledAt` [in-memory list игнорирует from/to], искл. `cancelled`, джойн learner/group/counterparty/course, **дедуп по слушателю**, `failed` = distinct learnerId без valid, persist batch+records, audit `regulatory.eisot_testing_exported`); DTO + `@Controller('eisot-testing-registry')` (4 эндпоинта); wiring в `mvp.module`.
- **Frontend**: `features/gov-export/` — `EisotTesting*`-типы, `createEisotTestingExport`/`listEisotTestingBatches`/`getEisotTestingBatchFileUrl`, `useEisotTestingBatches`; секция «ЕИСОТ — лица на тестирование (Минтруд)» на `/gov-export` (provisional-баннер + период from/to + генерация + история/скачивание).
- **Отклонения от спеки (осознанно, план §«Known deviations»)**: (1) исключены `cancelled`-зачисления (отозванных не направляют на тестирование); (2) дедуп по слушателю, первая отобранная группа выигрывает; (3) период применяется вручную на `enrolledAt` (in-memory `listEnrollments` игнорирует date-ключи, как OT FIX #3); (4) только ФИО+работодатель жёсткие; (5) `failed` = число distinct слушателей; (6) аудит `regulatory.eisot_testing_exported`.
- Тесты (Cyrillic-path isolated `--no-file-parallelism`): backend кластер **5 файлов / 41 тест** (`eisot-testing-registry/*`: rows 2 / preflight 4 / xlsx 1 / service 2 + `mvp.http.integration` 32 [+4 ЕИСОТ boundary]) + `eisot-testing-export.dto-validation` 3; frontend `gov-export/api.contract` 5 (+1 ЕИСОТ) + e2e `eisot-testing-registry-export` 4. `pnpm typecheck` **8/8**; ESLint clean (import/order авто-фикс в module). Полный `pnpm -s ci:check` локально не гонялся (Cyrillic-краш) → CI.
- **PROVISIONAL**: 1 swap-точка — `COLUMNS` в `eisot-testing-xlsx.writer.ts` (помечена в коде, UI-баннер). Подставить офиц. Excel-шаблон ростера ЛКОТ перед боевой подачей. TRACEABILITY не обновлялась (как у A/B — регуляторные экспортёры трактуются под BL-007/008).
- Коммиты (Conventional, по задаче): types+state+collections → buildEisotTestingRows → preflight → xlsx writer → service orchestrator → endpoints+wiring+boundary → frontend section → e2e+docs. PR — после ревью.

### 5.105 Phase 5 — Plan 5A: notification foundation (email engine + templates + delivery journal + enrollment emails + documents.revoked event + admin endpoints)

- Контекст: **Plan 5A** Phase 5 (notifications + recertifications). Дизайн-спека `docs/superpowers/specs/2026-06-04-phase-5-notifications-recertifications-design.md`, план `docs/superpowers/plans/2026-06-04-phase-5-plan-a-notification-foundation.md` (9 задач TDD). Ветка `feat/2026-06-04-phase-5-notifications-recertifications`. Поток: subagent-driven-development + TDD пошагово (RED→GREEN→lint→typecheck→commit на каждую задачу). Слит `origin/main` (#225 ФРДО §5.103 + #226 ЕИСОТ §5.104) в ветку перед PR.
- **Summary:** Реализован email-движок как фундамент Phase 5. Провайдер-агностичный `MailerService` (интерфейс + `MAILER` Symbol + `NoopMailer` по умолчанию + `SmtpMailer` с injectable `createTransport` для тестируемости; env `NOTIFICATIONS_EMAIL_ENABLED` переключает на SMTP). Два репозитория в модуле `communication`: `email_templates` (code defaults + per-tenant DB-override; `EMAIL_TEMPLATE_DEFAULTS` + `renderTemplate`) и `email_deliveries` (append-only журнал каждой попытки отправки). `NotificationDispatcher` оркестрирует: template override → render → send → record. `EnrollmentEmailListener` (@OnEvent async) обрабатывает `learning.enrollment_invited` (новое событие) и `learning.enrollment_completed` (расширено полем `recipient`) — отправляет письма слушателю. `documents.revoked` событие эмитируется (listener отложен до 5B). Admin endpoints `GET /email-deliveries`, `GET /email-templates`, `PUT /email-templates/:key` (permissions `notifications.read`/`notifications.write`); permission-boundary тесты в `mvp.http.integration.test.ts` (per CLAUDE.md: extend, not new file).
- **Файлы изменены:** migration `0047_communication_email_foundation.sql`; infra `mailer/{mailer.service,smtp-mailer.service}.ts` (+тесты); `communication/` — `email-templates*`, `email-deliveries*` (interface+token+in-memory+postgres каждый), `notification-dispatcher.service.ts`, `enrollment-email.listener.ts`, `upsert-email-template.dto.ts`, `email-notifications.controller.ts`, `email-notifications.service.test.ts`, `communication.module.ts` (регистрация); `mvp/` — `enrollment-invited.event.ts`, `enrollment-recipient.ts` (+тест), `enrollment-completed.event.ts` (опц. `recipient`), `mvp.service.ts` (2 emit-точки), `mvp.http.integration.test.ts` (notifications boundary); `documents/` — `document-revoked.event.ts`, `documents.service.ts` (optional `EventEmitter2`), `documents.service.test.ts`; `env.schema.ts`, `.env.example`, `package.json` (nodemailer).
- **Статус тестов (Cyrillic-path isolated `--no-file-parallelism`):** mailer 1/1; smtp-mailer 2/2; email-notifications 12/12; enrollment-recipient 4/4; documents.service 45/45; mvp.http.integration 30/30 (до merge). `pnpm typecheck` 8/8; ESLint clean по mailer + communication. После merge `origin/main`: mvp.http.integration выросла на ФРДО+ЕИСОТ boundary-блоки — пере-проверена.
- **Отклонения от спеки/плана:**
  1. `document_issued`-письмо сложено в `course_completed` — одно письмо при завершении достаточно для MVP.
  2. `documents.revoked` email listener отложен до 5B — нужен enrollment→learner recipient resolver (строит 5B). Событие уже эмитируется.
  3. Permission-boundary тест добавлен в `mvp.http.integration.test.ts` (не новый файл) — per CLAUDE.md.
  4. `EventEmitter2` добавлен как **optional** ctor-параметр `DocumentsService` (чтобы ~20 существующих 3-арг `new DocumentsService(...)` компилировались без правок; по факту 5-й арг после опц. `metrics`).
  5. Hardening по review задачи 2 (SMTP env guards: SMTP_HOST обязателен при enabled; SMTP_USER⇔SMTP_PASSWORD) + middleName (отчество) в FIO получателя.
  6. Migration 0047 объединяет DDL + permissions (прецедент `0030`).
- **Известное ограничение (→ 5B):** письма рендерят пустое имя курса (`Курс «» завершён`) и пустое приветствие, т.к. продюсер пока не резолвит название программы в payload — безвредно при дефолтном `NoopMailer`; обогащается в 5B (который и так трогает продюсера + события).
- **Следующий шаг:** Phase 5 Plan 5B — recertification cycle (validity + scheduler + recertification_drafts) — требует написания плана. Cross-link: `docs/superpowers/plans/2026-06-04-phase-5-plan-a-notification-foundation.md`.

### 5.106 Phase 5 — Plan 5B: recertification foundation (validity stamping + recertification_drafts + scan + approve/reject)

- Контекст: **Plan 5B** Phase 5. Спека `docs/superpowers/specs/2026-06-04-phase-5-notifications-recertifications-design.md`, план `docs/superpowers/plans/2026-06-05-phase-5-plan-b-recertification-cycle.md` (9 задач TDD). Ветка `feat/2026-06-05-phase-5-plan-b-recertification` от свежего `origin/main` (5A слита PR #228). Поток: subagent-driven-development + TDD (RED→GREEN→lint→typecheck→commit на задачу); controller-review поймал и исправил реальный баг (см. ниже).
- **Scope-решение:** 5B = весь backend-срез цикла переаттестации (как 5A был backend-only). **Планировщик (cron + advisory-lock + cross-tenant) вынесен в отдельный план 5B-2; frontend-очередь — в 5C.** Скан в 5B запускается per-tenant по HTTP (`POST /recertification/scan`) — запросный интерсептор уже загрузил state тенанта; cross-tenant перебор тенантов в cron — забота 5B-2.
- **Summary:**
  - **Migration 0048**: `learning.course_versions.recertification_period_months` (+CHECK >0), `documents.generated_documents.valid_until date`, таблица `learning.recertification_drafts` (UNIQUE `(tenant,learner,source_document)` для идемпотентности), права `recertification.read`/`recertification.write` (платформ-/тенант-админ — обе; методист — read). Прецеденты ALTER: 0030 (course_versions), 0033/0034 (generated_documents); permissions — 0047/0037.
  - **`common/utils/date-math.util.ts`**: чистые `addMonths` (clamp на конец месяца: 31 янв +1мес = 28/29 фев) и `addDays`, вход ISO → выход `YYYY-MM-DD`. Deterministic, без `Date.now()` в логике.
  - **`recertificationPeriodMonths`** добавлен в `ProgramMeta` (→ `CourseVersion`), в write-DTO `UpdateProgramMetaRequest` и в service write-path (зеркало `academicHours`: `@IsOptional()@IsInt()@Min(1)`).
  - **Штамповка `valid_until`** (producer-resolved): `GenerateDocumentRequest`/`DocumentGenerationTaskEntity`/`GeneratedDocumentEntity` получили `validUntil?`; `generateDocument` кладёт его на task, `completeTask` копирует на документ. `MvpService` (completion-emit в `changeEnrollmentStatus`) резолвит `enrollment.completedAt` + per-entry `recertificationPeriodMonths` из `getCourseVersion`; `EnrollmentCompletedPayload`/`EnrollmentCompletedDocumentSetEntry` расширены; `enrollment-document-issuance.listener` считает `validUntil = addMonths(completedAt, period)` и кладёт в request (idempotencyKey не тронут).
  - **`RecertificationDraftsRepository`** (singleton; mirrors 5A `email-deliveries`): interface + `RECERTIFICATION_DRAFTS_REPOSITORY` token + in-memory + postgres (idempotent `create` через `on conflict do nothing` + follow-up select; `markApproved`/`markRejected`). НЕ request-scoped и НЕ в `mvp-collections.ts` (нужен будущему cron вне HTTP).
  - **`RecertificationService`** (request-scoped в MvpModule): экспортируемая чистая `scanForRecertification(asOf, docs, 90)` (validUntil есть + не revoked + `validUntil ≤ today+90д`, вкл. уже истёкшие). `runScan` читает документы **через `DocumentsTenantRunner.runWithTenantDocuments`** (загруженный state!), резолвит enrollment→learner + courseVersion из `groupCourses`, идемпотентно создаёт draft, и **только при `created`** шлёт `recertification_due` слушателю (+ заказчику через `group.counterpartyId → counterparty.contactEmail`). `approveDraft(targetGroupId)` → `MvpService.createBulkEnrollments` (idem-key `recert_${id}::approve`) → `markApproved` + `resultingEnrollmentId`. `rejectDraft(reason?)`. Ошибки `{code,message}` (404/400).
  - **Шаблон `recertification_due`** (RU subject/body c `{{learnerName}}/{{courseTitle}}/{{validUntil}}`) добавлен в `EmailTemplateKey` + `EMAIL_TEMPLATE_DEFAULTS` (DB-override 5A работает как есть).
  - **Закрыт 5A-gap пустого `{{courseTitle}}`**: `MvpService.resolveGroupCourseTitle` (groupCourse→`course.title`, fallback `group.name`) резолвит на invited+completed emits; `EnrollmentInvitedPayload.courseTitle?` + listener использует `payload.courseTitle`.
  - **Admin endpoints** (`RecertificationController`, MvpModule, `MvpRequestPersistenceInterceptor`): `GET /recertification-drafts` (read), `POST /recertification/scan`, `POST /recertification-drafts/:id/approve`, `POST /recertification-drafts/:id/reject` (write) + DTO + permission-boundary блок в `mvp.http.integration.test.ts` (стаб-контроллер, per CLAUDE.md).
- **Статус тестов (Cyrillic-path isolated `--no-file-parallelism`):** date-math 4/4; recert-drafts-repo 5/5; recert-service 9/9; documents.service 46/46; issuance-listener 11/11; email-notifications 13/13; mvp.http.integration 42/42; mvp.dto-validation 104/104 — **итого 234**. **Full `pnpm typecheck` 8/8** (не только isolated); ESLint clean по новым файлам.
- **Review поймал баг (commit `2072615`):** первая версия `RecertificationService` читала документы напрямую через request-scoped `DocumentsService`, чьё состояние НЕ грузится для recert-контроллера (нет `DocumentsRequestPersistenceInterceptor`) → скан читал бы пусто (unit-тест маскировал моком). Исправлено на `DocumentsTenantRunner` (тот же паттерн, что у issuance-listener; экспортируется DocumentsModule).
- **Финальный code-review (commit `e938b2e`) поймал 2 edge-bug'а (оба исправлены + TDD):** (1) ключ идемпотентности `approveDraft` был `recert_${id}::approve` — при ошибочном `targetGroupId` `createBulkEnrollments` кэширует пустой outcome под этим ключом, и повтор даже с верной группой навсегда возвращал кэш → черновик нельзя было одобрить. Ключ стал per-group `…::approve::${targetGroupId}` + причина ошибки прокидывается в сообщение. (2) `runScan` слал письмо без try/catch — отказ `dispatch` (prod SMTP / hiccup БД) ронял весь скан 500-кой, а черновик уже создан → его письмо терялось навсегда. Обёрнут в try/catch + `logger.error` (зеркало `EnrollmentEmailListener`); письмо best-effort, черновик остаётся в очереди.
- **Отклонения от спеки/плана:**
  1. Migration **0048**, а не 0047 (5A занял 0047).
  2. Drafts — singleton реляционный repo (зеркало 5A `email_deliveries`), а не request-scoped MVP-стейт и не documents-snapshot backend: cron 5B-2 пишет вне HTTP-запроса.
  3. Скан HTTP-триггерится per-tenant; cron/advisory-lock/перебор тенантов → 5B-2.
  4. Один 90-дн. горизонт + одно письмо при создании черновика (идемпотентно), а не каденс 90/30/7 (повторные напоминания неотделимы от ежедневного cron → 5B-2).
  5. Получатели: слушатель (+ заказчик, если у группы `counterpartyId` с `contactEmail`). Куратор (нет поля на `Group`) и admin-email (нет резолвера tenant-admin email в IAM) отложены; черновик всегда в очереди админа (5C UI).
  6. `Course.title` (не `name`) — план ошибочно писал `name`; реализовано по реальному типу.
- **Осознанно отложено:** `license_expiring` (у модуля `org` нет postgres-persistence — нечего сканировать cross-tenant); `course_deadline`/`document_revoked` письма → 5B-2; ежедневный планировщик → 5B-2; frontend-очередь → 5C. `runWithTenantDocuments` сохраняет state даже на read-only скане (marginal; `runReadOnly` вариант — опт. 5B-2).
- **Известное ограничение:** runtime-DI реального `RecertificationController` не покрыт автотестом (как и все контроллеры в репо — тесты бутят стаб `TestAppModule`); `tsc` компилирует граф, все 5 зависимостей сервиса провайдятся/экспортируются в импорт-графе MvpModule. Owner может подтвердить запуском приложения.
- **Следующий шаг:** Plan 5B-2 (планировщик) → Plan 5C (frontend-очередь). Cross-link: `docs/superpowers/plans/2026-06-05-phase-5-plan-b-recertification-cycle.md`.

### 5.110 Визуальная дизайн-система (читаемость в приоритете): токены navy+синий, шрифты Golos Text / PT Serif, герой «Следующий шаг»

- Контекст: **не фаза роадмапа**, а сквозной фронтовый слой по запросу владельца «выполни план по roadmap что касается дизайна». Реализация была function-first → визуальный слой generic («вайрфрейм»). Спека: `docs/superpowers/specs/2026-06-06-cdoprof-visual-design-system.md`. Ветка `feat/2026-06-06-visual-design-system` от свежего `origin/main`.
- **Нумерация:** на `main` последняя запись §5.106; §5.107–5.109 заняты параллельной веткой `fix/2026-06-06-backend-boot-di-metadata` (backend-boot, ещё не в `main`), поэтому этот срез — **§5.110** (при мерже обеих веток сверить порядок записей).
- **Рычаг раскатки:** всё через систему токенов — `packages/ui/src/tokens/index.ts` (значения CSS-переменных light/dark) + `packages/ui/src/styles/foundation.ts` (базовый CSS). Весь UI читает `var(--ui-*)`, поэтому новый стиль раскатался по всем ~40 экранам автоматически; имена существующих токенов сохранены (изменены значения + добавлены hero-токены).
- **Шрифты:** `apps/frontend/app/layout.tsx` — `next/font/google` Golos Text (UI/текст) + PT Serif (вордмарк/заголовок героя), обе Paratype/кириллица; next/font self-hosts шрифты в бандл (end-user не ходит в Google → довод 152-ФЗ). Раньше `fontFamily:'Inter'` не загружался вовсе (системный fallback).
- **Герой «Следующий шаг»:** `apps/frontend/src/features/learner-home/next-step-card.tsx` переписан из обычной карточки в герой-блок (тёмно-синий градиент, eyebrow, serif-заголовок, белая CTA-кнопка, декоративная «печать»); классы `.ui-hero*` в foundation. Вордмарк `CDOпроф` (serif) в `apps/frontend/src/widgets/shell/app-shell.tsx`. Реальный `/learner` уже использует этот компонент — отдельной правки страницы не требовалось.
- **Итерация по фидбэку владельца (read-back):** первый вариант — navy + **золото печати** — владелец: «плохо читаема». Золото убрано полностью (на светлом контраст ~3:1, ниже порога). Палитра пересобрана под читаемость: холодные чистые нейтрали, почти чёрный текст `#0f1626`, читаемый синий `#1e40af`, белая кнопка героя. **Контраст всех ключевых пар измерен скриптом (WCAG):** тело текста 18:1 (светлая)/14.6:1 (тёмная), ссылки/кнопки 8–12:1, минимум по палитре 5.37:1 — все ≥ AA, большинство AAA.
- **Чистка хардкод-цветов (= раскатка):** аудит (`grep` по hex) показал, что почти всё уже на токенах. Исправлено: `apps/frontend/src/components/tz/tz-links.tsx` (хардкод тёмного текста `#18181b/#52525b` → токены — **был баг тёмной темы**, текст невидим); `apps/frontend/app/learning/calendar/page.tsx` (`var(--border,#e0e0e0)`/`--muted`/`--surface` — ссылались на несуществующие переменные, игнорировали тему → `var(--ui-*)`); `apps/frontend/app/gov-export/page.tsx` (3 одинаковые янтарные плашки → новый паттерн `.ui-callout--warning`). Сознательно оставлены: `verify-page.tsx` (публичная standalone-страница, светлая «как сертификат») и `#000` фон видео/PDF в `course-viewer.ts` (letterboxing).
- **Новый паттерн `.ui-callout`** (info/warning/success/danger) в foundation — тематические плашки через `color-mix(in srgb, var(--ui-*-600) N%, var(--ui-surface))` (автотема без отдельных токенов-оттенков на каждую тему).
- **Проверки:** UI-тесты 9/9 (вкл. починенный pre-existing smoke `courseViewer`-слой в `smoke-visual.test.tsx`); frontend learner-home 26/26; `pnpm typecheck` ui+frontend чисто; ESLint по изменённым файлам чисто; контраст измерен. **Полный `pnpm test:frontend` под нагрузкой** даёт contention-таймауты (5s) на dynamic-import smoke — в изоляции проходят (124/… ), это не регрессия. Всплыл **1 чужой pre-existing баг**: `aggregateReviewerQueue` падает на пустом snapshot (`snapshot.questions` undefined) в `admin-assessment-surface.e2e` — к дизайну не относится, вынесен отдельной задачей (spawn_task chip).
- **Отклонения/заметки:** (1) встроенный preview-скриншот в окружении **не работает** (capture-pipeline таймаутит даже на пустой DOM — баг окружения, не кода); валидация — владелец смотрел на своём dev-сервере `localhost:3000`. (2) Временная витрина `app/design-preview/` (без авторизации, faux-сайдбар + реальный hero) создавалась для показа и **удалена** после подтверждения; `.claude/launch.json` возвращён к исходному (временный `frontend-preview`-конфиг убран). (3) Брейнсторм-гейт сокращён по standing-предпочтению владельца «делай дефолты и продолжай»; валидация на одном экране перед раскаткой.
- **Следующий шаг (опц.):** axe-аудит контраста на реальных экранах + Playwright `toHaveScreenshot` для эталонных страниц (Phase 10 / `apps/frontend/docs/UI_SUCCESS_METRICS.md`); полная тематизация публичной `verify-page` при желании.

### 5.111 Phase 5 — Plan 5B-2: recertification scheduler + reminder cadence (ночной cron + advisory-lock + 90/30/7 + course_deadline + document_revoked)

- Контекст: **Plan 5B-2** Phase 5 — планировщик, отложенный из 5B. Спека `docs/superpowers/specs/2026-06-04-phase-5-notifications-recertifications-design.md` §4.3; план `docs/superpowers/plans/2026-06-06-phase-5-plan-b2-recertification-scheduler.md` (15 задач TDD). Ветка `feat/2026-06-06-phase-5-plan-b2-recertification-scheduler` от свежего `origin/main` (5B слита PR #229; визуальная дизайн-система PR #231). Поток: subagent-driven-development + TDD (RED→GREEN→typecheck→commit на задачу) + two-stage review (spec + code-quality) на каждую задачу; controller-review поймал/исправил реальные баги (см. ниже).
- **Scope:** владелец выбрал ПОЛНЫЙ объём (не «core-only»): ночной cross-tenant cron + 90/30/7 каденс + `course_deadline` + `document_revoked`.
- **Нумерация:** §5.107–5.109 заняты не-слитой веткой `fix/2026-06-06-backend-boot-di-metadata`; §5.110 — визуальная дизайн-система (PR #231). На текущей ветке последняя запись §5.110 → этот срез **§5.111** (при мерже сверить порядок).
- **Summary:**
  - **`@nestjs/schedule@6` + `ScheduleModule.forRoot()`** в `AppModule` (рядом с `EventEmitterModule.forRoot()`).
  - **Env-флаги** (`env.schema.ts`, зеркало `ANTIVIRUS_ENABLED`): `RECERTIFICATION_SCAN_ENABLED` (default **false** — ship dormant) + `RECERTIFICATION_CRON_SCHEDULE` (default `'0 3 * * *'`). Cron пришпилен `timeZone:'UTC'` (совпадает с UTC-`asOf`).
  - **Migration 0049**: `communication.email_deliveries.dedup_key text` + НЕ-уникальный индекс `(tenant_id, dedup_key)` (мульти-получатель делит один ключ; гонку закрывают advisory-lock + per-tenant serialization).
  - **`pickMilestone`** (`mvp/reminders/milestone.util.ts`): чистая, возвращает наименьший удовлетворённый порог из `RECERT_MILESTONES=[7,30,90]` / `COURSE_DEADLINE_MILESTONES=[1,7,14]`; нормализует обе даты к `YYYY-MM-DD` (timestamp `plannedEndAt` сравнивается корректно).
  - **`EmailDeliveriesRepository.findByDedupKey`** + `dedupKey?` на row/seed (in-memory + postgres); **`NotificationDispatcher`** получил опц. `dedupKey` → **пропускает весь dispatch** (без send/record), если delivery с этим ключом уже есть.
  - **`MvpTenantRunner`** (`mvp/infrastructure/`, **read-only** singleton, зеркало `DocumentsTenantRunner` минус save): грузит MVP-state тенанта вне HTTP-запроса под общим `TenantSerialGateway` — то, чего не хватало cron'у. Сканы не мутируют MVP-state → save не нужен.
  - **Рефактор: `RecertificationScanner`** (singleton) вынесен из request-scoped `RecertificationService`: тело скана принимает `state` параметром → ручной endpoint и cron делят один путь (без дублирования). `scanForRecertification`/`RECERT_HORIZON_DAYS`/типы переехали в scanner + **ре-экспорт** со старого пути. `RecertificationService` (113 строк, было 244) делегирует `runScan`, хранит `approve/reject` без изменений. Каденс: `recertification_due` **раз на milestone** (`dedupKey=recert:<draftId>:<90|30|7>`) — замена 5B-поведения «одно письмо при создании черновика»; черновик по-прежнему идемпотентен. Общие резолверы (`mvp/reminders/reminder-recipients.ts`).
  - **`CourseDeadlineScanner`** (singleton): сканит незавершённые enrollments (`pending`/`active`) с `plannedEndAt` в окне → `course_deadline` на 14/7/1 дн (`dedupKey=deadline:<enrollmentId>:<milestone>`); просрочка → milestone 1 (раз). Без миграции — `Enrollment.plannedEndAt` уже есть (0023).
  - **`RemindersSchedulerService`** (singleton, `@Cron(...,{timeZone:'UTC'})`): флаг-гард → `pg_try_advisory_xact_lock` (внутри `withTransaction`, авто-релиз на commit/rollback) → `TenantService.listActiveTenantIds()` → per-tenant `MvpTenantRunner` → recert-скан + deadline-скан; каждый тенант в try/catch (partial-success). `handleDailyScan` — тонкая обёртка (флаг → UTC-`asOf` → `runScanAllTenants`) + top-level catch.
  - **`TenantService.listActiveTenantIds()`** (dual-path: `select id from core.tenants where status='active'` / in-memory fallback `['tenant_demo']`).
  - **`DocumentRevokedEmailListener`** (singleton, `@OnEvent('documents.revoked',{async:true})`): резолвит слушателя/заказчика/courseTitle из enrollment (`payload.sourceEntityId`) через `MvpTenantRunner` → `document_revoked` (`dedupKey=revoked:<documentId>`). Событие эмитится 5A; `{async:true}` + общий gateway → listener встаёт в очередь ПОСЛЕ revoke-операции (без дедлока).
  - **Шаблоны** `course_deadline` + `document_revoked` в `EmailTemplateKey` + `EMAIL_TEMPLATE_DEFAULTS` (RU, зеркало тона).
  - **Wiring** (`mvp.module.ts`): импорт `TenantModule`; 5 singleton-провайдеров (`RecertificationScanner` — в Task 10 при DI-фиксе; `MvpTenantRunner`/`CourseDeadlineScanner`/`RemindersSchedulerService`/`DocumentRevokedEmailListener` — в Task 14).
- **Статус тестов (Cyrillic-path isolated `--no-file-parallelism`):** milestone 4, mvp-tenant-runner 1, course-deadline-scanner 6, reminders-scheduler 5, document-revoked-listener 4, recert-scanner 6, recert-service 6, dispatcher 3, in-memory-email-deliveries 3, tenant-service 1, env 10; регрессии: mvp.http.integration 42, issuance-listener 11; migration-integrity зелёные. **Full `pnpm --filter @cdoprof/backend exec tsc --noEmit` чисто; ESLint clean по новым файлам.** Каждая задача — отдельный коммит (T1 `b8596e5` … T14 `1f33029`).
- **Review поймал/исправил (примечательное):**
  1. **Task 10 (DI):** рефактор сменил конструктор `RecertificationService` (инжектит `RecertificationScanner`), но провайдер не был зарегистрирован → app упал бы на bootstrap (unit-тесты маскировали ручной конструкцией). Исправлено (`99b13c4`): `RecertificationScanner` в `MvpModule.providers`.
  2. **Task 12 (cron):** пришпилен `timeZone:'UTC'` (триггер и `asOf` на одних часах) + top-level catch + тест распространения ошибки (lock-tx откатывается).
  3. **Task 13 (DRY):** убран дублирующий `state.learners.find` — `learnerName` берётся из уже построенных recipients.
  - Добавлены тесты прогрессии каденса (recert 90→30→7; deadline 14→7→1 + просрочка→1).
- **Финальный holistic review поймал КРИТИЧНЫЙ дедлок (commit `95cca1c`):** `TenantSerialGateway.runExclusive` был НЕ-реентрантным; ночной cron нестит `DocumentsTenantRunner.runWithTenantDocuments(t)` ВНУТРИ `MvpTenantRunner.runWithTenantState(t)` (тот же тенант) → внутренний `await prev` ждёт промис внешнего вызова, внутри которого сам находится → вечный дедлок на 1-м тенанте (держал advisory-lock-tx + соединение пула). **Та же связка — латентный баг с 5B в ручном `POST /recertification/scan`** (interceptor-лок → `runScan` → scanner → documents-runner). Все per-task-ревью пропустили (юнит-тесты мокали внутренний runner) — поймал только финальный holistic-pass. Исправлено: gateway сделан **реентрантным** через `AsyncLocalStorage` (вложенный вызов того же тенанта в том же async-исполнении идёт inline; сериализация не-вложенных вызовов и изоляция тенантов сохранены — нет working-кода, зависящего от старого дедлока). Regression-гарды: `infrastructure/request/tenant-serial.gateway.test.ts` (реентрант-вложенность — на старом коде таймаут-дедлок) + `mvp/reminders/reminder-scan.integration.test.ts` (реальные gateway+MvpTenantRunner+DocumentsTenantRunner+RecertificationScanner — на старом дедлок, на новом зелено); re-review (opus) подтвердил корректность + сохранение сериализации.
- **Осознанно отложено:** `license_expiring` (у `org` нет postgres-persistence — нечего сканировать cross-tenant); куратор-получатель (нет поля на `Group`) и admin-email (нет резолвера в IAM); **frontend-очередь «Нужна переаттестация» → Plan 5C**.
- **Известные ограничения / на будущее:**
  - **Idle-in-transaction:** `runScanAllTenants` держит одно tx-соединение открытым на всё время скана (только advisory-lock; per-tenant работа — на других соединениях пула, пик 2 из max 10). Безопасно для ночного job с малым числом тенантов; при росте тенантов/латентности SMTP — перейти на session-lock + out-of-band email.
  - **Ручной `POST /recertification/scan`**: дедлок этого пути (нестинг documents-runner в interceptor-локе, латентный с 5B) исправлен реентрантным gateway (см. «Финальный holistic review» выше). Остаётся: не под advisory-lock (только cron) — внутри процесса сериализован `TenantSerialGateway`; кросс-процессный двойной ручной скан мог бы продублировать одно письмо milestone — пренебрежимо (admin-триггер, редко); черновики защищены UNIQUE.
  - **Runtime-DI реального `MvpModule`** не покрыт boot-тестом (репо-конвенция стаб-`TestAppModule`); граф проверен статически (opus-review: зависимости всех 5 классов экспортируются/провайдятся, cron+listener — singletons, цикла нет) + `tsc` + регрессии.
- **Активация (ops, не код):** `RECERTIFICATION_SCAN_ENABLED=true` + `NOTIFICATIONS_EMAIL_ENABLED=true` (+ `SMTP_*`). По умолчанию dormant.
- **Следующий шаг:** Plan 5C (frontend-очередь). Cross-link: `docs/superpowers/plans/2026-06-06-phase-5-plan-b2-recertification-scheduler.md`. Ветка ожидает PR/merge.

### 5.112 Phase 5 — Plan 5C: frontend-очередь «Нужна переаттестация» (visibility-only + обогащение списка именами)

- Контекст: **Plan 5C** Phase 5 — фронтенд-хвост после 5A/5B/5B-2. Спека `docs/superpowers/specs/2026-06-07-phase-5c-recertification-queue-design.md`; план `docs/superpowers/plans/2026-06-07-phase-5c-recertification-queue.md` (9 задач TDD). Ветка `feat/2026-06-07-phase-5c-recertification-queue` от `feat/2026-06-06-phase-5-plan-b2-recertification-scheduler` (5C — следующий по порядку после 5B-2). Поток: brainstorming → spec → writing-plans → subagent-driven-development (кластеры backend / frontend-core / screen+wiring) + two-stage review (spec + code-quality) на кластер + финальный holistic-review (opus).
- **Scope (владелец):** «только список» — видимость + «Убрать» (reject) + «Проверить сейчас» (scan). Кнопка «Одобрить»/авто-зачисление НАМЕРЕННО не выведена (endpoint approve есть на бэке; перезачисление — через «Массовую загрузку»). `sourceDocumentNumber` исключён (кросс-модульное чтение documents).
- **Summary:**
  - **Backend (без миграции):** `resolveLearnerDisplay(state, tenantId, learnerId)` в `mvp/reminders/reminder-recipients.ts` (ФИО `lastName firstName [middleName]` + СНИЛС, graceful `{name:''}`, tenant-фильтр); `RecertificationService.listDrafts` теперь `async` → маппит строки в `RecertificationDraftView` (+ `learnerName`/`learnerSnils?`/`courseTitle`), резолверы из загруженного request-scoped mvp-state (`resolveLearnerDisplay` + `resolveCourseTitleByVersion`), деградация к `''`. Контроллер/права без изменений (`recertification.read` чтение, `recertification.write` reject/scan — 0048).
  - **Frontend:** feature-модуль `features/recertification/` (`types`/`format`/`api`/`hooks`/`screens`); React Query `useQuery` для чтения + `useState`-обёртки для reject/scan (конвенция, не `useMutation`). `formatRemaining` (UTC-day diff: «через N дн.»/«сегодня»/«просрочено N дн.», guard «—» на мусор), `formatSnils`. Экран: `PageHeader`+«Проверить сейчас» (action), фильтр статуса (Ожидают default/Отклонённые/Все), `DataTable` (Слушатель+СНИЛС/Курс/Действует до/Осталось/Статус/«Убрать»), `window.confirm`+`window.prompt`(reason) для reject, loading/empty/error.
  - **Wiring:** страница `app/admin/recertification/page.tsx` в `<ProtectedPage>`; `routeMeta` + `navigationModel` (метка «Переаттестация», `recertification.read`, слот `more`).
  - **e2e:** `src/e2e/recertification-queue.e2e.test.ts` (route tri-state ok/forbidden/redirect + nav visibility + smoke-import; без RTL/render).
- **Статус тестов (Cyrillic-path isolated `--no-file-parallelism`):** backend reminder-recipients 8 (4 `resolveLearnerDisplay` + 4 `resolveCourseTitleByVersion`), recertification.service 8 (+2 enrichment), регрессия mvp.http.integration 42; frontend format 10, api.contract 5, e2e 4. **`pnpm typecheck` 8/8 чисто; ESLint clean.** e2e screen-import иногда ловит 5s-timeout на Cyrillic-path (холодный transform `@cdoprof/ui`) — НЕ регресс (60s/CI зелено, идентично reference `admin-bulk-enrollment.e2e`). Коммиты T1…T8 (`15a92e9`…`48e7018`) + review-фиксы.
- **Review поймал/исправил:**
  1. **Backend quality:** `resolveCourseTitleByVersion` стал load-bearing (2 caller'а), 0 dedicated тестов → добавлены 4 (`85d4dfe`).
  2. **Frontend-core quality:** `formatRemaining` рендерил бы «просрочено NaN дн.» на мусорном входе → guard `Number.isFinite`→«—» + 2 теста (год-граница, мусор); tighten `init.method` ассерт; `useQuery<…>` дженерик; NB-коммент про намеренное отсутствие approve (`2afe4c2`). Деривация `noUncheckedIndexedAccess`: array-destructuring → explicit index в `format.ts`.
  3. **Финальный holistic (opus):** READY TO MERGE, Critical/Important — нет. Minor: `reject` тип → `Promise<RecertificationDraft | null>` (зеркало backend nullable; применено). UTC-дата «Осталось» — оставлено (консистентно с backend `asOf`).
- **Осознанно отложено:** approve/авто-зачисление (5C-2); `license_expiring`; куратор/admin-получатели; пагинация; № исходного удостоверения (кросс-модуль documents).
- **Pre-existing (не 5C):** `admin-assessment-surface.e2e.test.ts > aggregateReviewerQueue` падает (backend `reviewer-queue.service`) — подтверждён untouched этим диффом, уже трекается (spawn_task §5.110).
- **Активация (ops):** та же, что 5B/5B-2 — `RECERTIFICATION_SCAN_ENABLED=true` + `NOTIFICATIONS_EMAIL_ENABLED=true` (+ `SMTP_*`).
- **Следующий шаг:** PR/merge ветки; затем опц. 5C-2 (approve-очередь) или хвосты Phase 5 / Phase 6. Cross-link: план + спека выше.

### 5.113 Фикс pre-existing e2e: `aggregateReviewerQueue` snapshot-shape drift (восстановлен после merge #233)

- **Контекст:** закрытие known pre-existing failure из §5.110 (spawn_task chip) и §5.112 («Pre-existing (не 5C)»). Ветка `fix/2026-06-07-reviewer-queue-e2e-snapshot` от `main` (после merge PR #233). Изменён **только тест** — backend НЕ тронут.
- **Симптом:** `apps/frontend/src/e2e/admin-assessment-surface.e2e.test.ts > aggregateReviewerQueue returns empty snapshot from empty inputs` падал: `Cannot read properties of undefined (reading 'map')`.
- **Root cause (дрейф формы):** `reviewer-queue.service.ts:43` читает `snapshot.questions.map(...)` сразу (eager, до `.filter`), а тест передавал snapshot без `questions`. Поля `questions` и `attemptAnswers` добавлены в `ReviewerQueueInputSnapshot` уже после написания теста (Task 4 essay-pending + Task 8 antivirus).
- **Фикс (2 согласованных правки, один тест):** (1) в литерал вызова добавлены `attemptAnswers: []` + `questions: []` → все 4 поля реального интерфейса; (2) расширен локальный cast-тип импорта функции, иначе excess-property-check свежего объект-литерала валит `tsc`. `attemptAnswers` добавлен превентивно (зеркало интерфейса), хотя на пустом входе не читается — `.filter` по пустому `testAttempts` короткозамкнут.
- **Верификация:** таргет-тест зелёный на base post-#233; ESLint clean. 3 теста `module smoke` в том же файле ловят 5s-timeout на холодном transform по Cyrillic-path (зелёные при `--testTimeout=30000` и в CI) — НЕ регресс, известная Cyrillic-path-флака (CLAUDE.md Gotchas).
- **История git (важно для следующего агента):** фикс изначально закоммичен на ветку 5C (`5eadccf` → rebase `309e41f`), но внешний `git reset HEAD~1` при подготовке PR #233 отбросил его, и **#233 (Phase 5C) слит в `main` БЕЗ этого фикса** → `aggregateReviewerQueue` оставался красным на main. Восстановлено cherry-pick'ом dangling-коммита на новую ветку `fix/2026-06-07-reviewer-queue-e2e-snapshot` (`23e4743`). Слит #234.

### 5.114 Phase 0 деплой-фундамент (PR #235) + Production auth readiness (A+B)

- **Запрос:** «начнём фазу 0» → переразмерил roadmap Phase 0 под **соло-владельца** (подтвердил: 4 фундамента уже есть — юр-лицо+лицензия, действующие клиенты, бренд+домен, облако). Обе части: brainstorming → spec → writing-plans → subagent-driven-development + two-stage review.
- **Phase 0 — pilot launch foundation** (ветка `feat/2026-06-08-phase-0-pilot-launch-foundation`, **PR #235**; spec+plan `docs/superpowers/{specs,plans}/2026-06-08-phase-0-pilot-launch-foundation*`). Approach A: один сервер + Docker Compose + Caddy (авто-HTTPS, один домен → frontend `/`, backend `/api/v1`, realtime `/ws`; инфра-порты закрыты, наружу только Caddy) + **сборка на сервере** (без реестра — обходит трансгран. тягу образов). 8 артефактов: `apps/frontend/Dockerfile` (Next standalone), `infra/docker-compose.prod.yml`, `infra/Caddyfile`, `infra/.env.production.example`, `.github/workflows/deploy.yml`, `infra/backup.sh`, `infra/server-setup.md`, `infra/bootstrap-admin.md` + harden `scripts/check-env.ts` (отвергает dev-секреты в проде). Каждый верифицирован реальной командой (docker build / `compose config` / `caddy validate` / actionlint / shellcheck / env-check; Docker доступен локально). Review поймал маскировку `typescript.ignoreBuildErrors` → вместо неё **починены 4 пред-существующих Next-15 route-param бага** (`params: Promise<…>` в `app/admin/{assignments,clients,question-banks,tests}/[id]/page.tsx`) + добавлен `NEXT_PUBLIC_DEFAULT_TENANT_ID` build-arg. `pnpm typecheck` 8/8.
- **🚨 2 находки (тесты не ловят, обнажил деплой):** A) вход по magic-link в проде log-only (`LoggingMagicLinkEmailSender`, Phase 1) — ссылка в лог, не на почту; B) `/auth/login` открыт + seed-юзеры (миграция 0010) с публичным `Password123!`. Обе задокументированы в `infra/bootstrap-admin.md`.
- **Production auth readiness (A+B)** (ветка `feat/2026-06-08-production-auth-readiness`, spec `faaef0d` + plan `91c3b5d`; **решение владельца: ОСТАВИТЬ парольный вход, но обезвредить**). A) `EmailMagicLinkEmailSender` шлёт ссылку через `MailerService`/`SmtpMailer`, выбор по `NOTIFICATIONS_EMAIL_ENABLED` (factory в `iam.module.ts`, зеркало `communication.module`). B) `SeedCredentialHygiene` — прод-`OnApplicationBootstrap`-хук: ротирует строки `iam.users` с утёкшим хешем `d845591…` → `disabled:<hex>` (`verifyPassword` отвергает: не scrypt и не 64-hex; прицельно по хешу → реальные пароли не тронуты; идемпотентно через `RETURNING id` + `rows.length`; non-prod no-op → тесты сохраняют `Password123!`). 4 TDD-задачи subagent-driven; review поймал/исправил **SQL-дупликацию** (прод-путь инлайнил второй UPDATE в `withTransaction` → переписан на переиспользование тестируемой `neutralizeLeakedSeedCredentials`). backend `tsc` чист; IAM-регрессия зелёная (auth integration 5 + security 3 + http-regression 6 + email-sender 3 + factory 2 + hygiene 3). Ждёт PR.
- **Следующий шаг:** PR/merge обеих веток → deploy-execution (владелец: сервер + DNS A-запись + SMTP, прогон `infra/server-setup.md` + `infra/bootstrap-admin.md`). Follow-up: обновить `bootstrap-admin.md` (на Phase 0 ветке) под живую почту. Отложено по решению владельца: ЕСИА (Phase 4 код-первый, ЕСИА позже), НЭП (Phase 6), Pruffme/ЮKassa (договоры «заключены» → Phase 7/8), clamav.

### 5.115 Закрытие follow-up auth-readiness: рунбук bootstrap-admin под живую почту + авто-гигиену

- **Контекст:** обе ветки §5.114 слиты — Phase 0 **#235**, auth readiness **#237** (плюс #236 — boot-fix под tsx). На входе сессии README §2 ещё говорил «ждёт PR» — рассинхрон устранён этой записью.
- **Запрос:** «продолжай по roadmap» → единственный незакрытый пункт кодовой части = follow-up §3.3 плана `2026-06-08-production-auth-readiness.md` (обновить `infra/bootstrap-admin.md`; на момент написания плана файл жил только на Phase 0 ветке, теперь оба в `main`).
- **Сделано** (ветка `docs/2026-06-10-bootstrap-admin-auth-readiness` от `origin/main`):
  - `infra/bootstrap-admin.md`: §2b — доставка magic-link выбирается `NOTIFICATIONS_EMAIL_ENABLED` (true → `EmailMagicLinkEmailSender` по SMTP, false → log-only fallback; процедура с грепом лога сохранена как fallback); блок «TO CONFIRM AT DEPLOY» → проверка `NOTIFICATIONS_EMAIL_ENABLED=true` + `SMTP_*`; новый §3.0 — авто-нейтрализация утёкшего seed-хеша `SeedCredentialHygiene` при каждом прод-буте (идемпотентно, лог `seed_credentials_neutralized count=N`); §3a/§3c → belt-and-suspenders; §3d (ручной psql-UPDATE хеша) → «больше не нужен»; §4 verification → inbox-first с лог-fallback.
  - План `2026-06-08-production-auth-readiness.md`: все чекбоксы отмечены `[x]`, follow-up §3.3 помечен DONE (2026-06-10).
- **Верификация перед docs-работой:** таргет-тесты IAM зелёные (email-sender 3 + factory 2 + hygiene 3 + crypto.util — итого 14 в 4 файлах), backend `tsc --noEmit` чист; проводка `iam.module.ts` сверена с описанием в рунбуке (factory + `SeedCredentialHygiene` в providers).
- **Деталь процесса:** docs-коммит изначально лёг на уже слитую (squash) ветку `feat/2026-06-08-production-auth-readiness` → перенесён cherry-pick'ом на свежую ветку от `main` (контент идентичен — ветка ранее подмёржила origin/main); stale-ветку не пушил.
- **Следующий шаг:** merge docs-PR → **deploy-execution владельцем** (сервер + DNS A-запись + SMTP; `infra/server-setup.md` → `infra/bootstrap-admin.md`; в `.env.production`: `NOTIFICATIONS_EMAIL_ENABLED=true` + реальные `SMTP_*`). Кодовых блокеров пилота не осталось. Отложенное — без изменений (ЕСИА Phase 4, НЭП Phase 6, Pruffme/ЮKassa Phase 7/8, clamav ops, Wave 2 sub-goal D ждёт официальные шаблоны владельца).

### 5.116 Hotfix: `DB_MIGRATIONS_ENABLED=''` ломает 13 тест-харнессов после #236

- **Контекст:** #236 заменил в `env.schema.ts` парсинг boolean-флагов с `z.coerce.boolean()` на `z.union([z.boolean(), z.enum(['true', 'false'])])`. Старая коэрция молча глотала `''` (→ `false`), новая строгая схема пустую строку отвергает → все HTTP-integration/contract тесты, ставившие `DB_MIGRATIONS_ENABLED: ''`, падают на Zod parse. На `main` это 13 файлов = красный backend-CI.
- **Сделано** (ветка `fix/2026-06-10-db-migrations-enabled-test-env` от `origin/main`):
  - 13 тест-файлов: `DB_MIGRATIONS_ENABLED: ''` → `'false'` (documents, esign ×2, health, integrations ×2, workspace ×2, mvp: assessment-admin / internal-worker / plan-c / test-player / mvp.http).
  - `apps/backend/vitest.setup-env.ts`: добавлен дефолт `DB_MIGRATIONS_ENABLED: 'false'` — страховка для будущих тест-файлов, не задающих ключ (существующие файлы он не лечит: каждый безусловно перезаписывает `process.env` своим блоком после setup).
- **Верификация:** изолированные прогоны зелёные — documents 13/13, workspace.contract 3/3, test-player 6/6, mvp.http 42/42 (`--no-file-parallelism` из-за Cyrillic-path gotcha).
- **Деталь процесса:** фикс изначально сделан на ветке Phase 4 Plan A (коммит `2549131`, 12 файлов — `mvp.http` там уже был починен внутри фиче-коммита `5813f87`); затем cherry-pick на свежую ветку от `main` + отдельный коммит для `mvp.http`, который на `main` оставался сломанным. На ветке Phase 4 те же правки уже есть → squash-merge обоих PR бесконфликтен по содержимому.
- **Следующий шаг:** merge hotfix-PR (восстанавливает CI `main`), дальше — продолжение Phase 4 Plan A (identity verification).

### 5.117 Phase 4 Plan A — идентификация личности (селфи + паспорт, ручная сверка) + гейт итогового экзамена (PR #240)

- **Запрос:** «продолжай по roadmap» → владелец выбрал **Phase 4 (код-первый)**, объём — **Plan A: только идентификация** (живая видео-ИД и ЕСИА отложены; прокторинг → отдельный Plan B). Решения владельца: валидность подтверждения **бессрочная для пилота** (`validUntil` nullable, не заполняется), **автоудаление изображений через 90 дней** (dormant-cron). Полный цикл: brainstorming → spec (`docs/superpowers/specs/2026-06-10-phase-4-plan-a-identity-verification-design.md`) → plan (13 задач, `docs/superpowers/plans/2026-06-10-phase-4-plan-a-identity-verification.md`) → subagent-driven-development + two-stage review per task + **финальное холистическое ревью всей ветки**.
- **Что построено** (ветка `feat/2026-06-10-phase-4-plan-a-identity-verification` → **PR #240**): migration **0050** (`learning.group_courses.requires_identity_verification` + таблица `learning.identity_verifications` + права `identity.submit/read/review`; learner→submit, methodist→read+review, админы→всё); MVP-коллекция `identityVerifications` (state + `MVP_COLLECTIONS` вместе); lifecycle в `MvpService` (start→upload-intent→submit(consent 152-ФЗ + оба fileId)→review approve/reject; per-learner, повторная подача после reject = новая запись); **4-й гейт `assertIdentityVerificationGate`** в `startAttempt` (только итоговые экзамены без `moduleId`, 412 `identity_verification_required`, сообщение «Identity confirmation by document is required…» — **намеренно не пересекается с Wave 1-регексом** `/identity verification is required/i`, есть регресс-тест коллизии); files-слой: `UploadIntentOptions` (`keyPrefix: 'identity'`, allowlist png/jpeg/pdf), `S3StorageClient.deleteObject`, идемпотентный `FilesService.deleteFile`; **dormant retention-cron** (`IDENTITY_IMAGE_RETENTION_ENABLED=false`, cron `0 4 * * *` UTC, advisory-lock **528_492**, чистая `selectIdentityImagesToPurge` + `IdentityRetentionScanner` + `IdentityRetentionSchedulerService`); 7 REST-эндпоинтов (`/identity-verifications`, `…/me` объявлен ДО `…/:id`); frontend: модуль `features/identity-verification/` (api/hooks/format/screens), `/learner/identity` (две загрузки + чекбокс согласия), `/admin/identity-verifications` (+ `[id]` деталь: сверка ФИО/СНИЛС/ДР + изображения + approve/reject), интерстициал в test-player, навигация, e2e-смоук.
- **🚨 Главный улов финального холистического ревью (per-task ревью пропустили): `MvpTenantRunner` — read-only по контракту** (не вызывает `saveFromState`; план унаследовал ложную посылку «runner сохраняет»). Cron мутировал state через него → штампы `imagesPurgedAt` молча терялись → ночные ре-пёрджи + **перманентный 400 в админ-детали после первого реального удаления файлов** (`createDownloadUrl` по soft-deleted строке). Фикс: новый **`MvpTenantRunner.runWithTenantStateAndSave`** (load → fn → save в `finally`, зеркало `DocumentsTenantRunner`; read-only метод не тронут — reminders/recertification как раньше) + тесты save-after-success/save-on-throw. **Урок: для cron-мутаций MVP-state вне запроса использовать ТОЛЬКО write-режим runner'а.**
- **Прочие review-catches:** I1 — заражённый/несканированный файл брикал админ-ревью (деталь 423/409 целиком, «Отклонить» недостижим, слушатель навсегда в pending) → per-file try/catch в `getIdentityVerificationView`, поля `selfieFileError`/`passportFileError`, фронт «файл недоступен (антивирус)»; 412 вместо 400 для review не-pending (конвенция файла, осознанная девиация от spec §7); `learnerSnils`/`learnerDateOfBirth` во view (прецедент `RecertificationDraftView`); guard `identity_files_must_differ`; маппинг `learner_not_linked` в русское сообщение; хелпер `resolveActorLearnerIds` (дедуп 4 копий lookup'а по `linkedIamUserId`); усиление contract-тестов (body-assertions).
- **Девиации от спеки (задокументированы):** поле статуса = `verificationStatus` (коллизия с `BaseEntity.status`); роли ревью = `methodist` (ролей curator/teacher в сиде нет); `valid_until` в 0050 = `timestamptz` (зеркалит ISO-строку TS-типа; соседние valid_until = date — сменить при активации валидности).
- **Заметки окружения (эта машина, Windows+кириллица):** (a) `DB_MIGRATIONS_ENABLED: ''` в `mvp.http.integration.test.ts` починен внутри фиче-коммита; остальные 12 файлов закрыл параллельный hotfix **#239** (§5.116) — squash-merge бесконфликтен, наша фоновая задача-чип снята как superseded; (b) `next lint` падал на pre-existing ошибке `no-assign-module-variable` в `course-viewer/api.test.ts` (переименован `module`→`makeModule`); root `eslint.config.mjs` теперь регистрирует `@next/next/no-img-element` (warn) для frontend — наши 2 `<img>` (presigned-превью) с точечными disable; промежуточный коммит c27d96f с глобальным отключением правил **откатан** (c363648); (c) полный фронтенд-прогон даёт ~8 environmental тайм-аутов dynamic-import в параллели (включая чужие e2e; изолированно всё зелёное — проверено на 3 файлах); (d) `pnpm build` (Next standalone) падает EPERM symlink на Windows — pre-existing после #235, CI (Ubuntu) не затронут.
- **Происхождение `apps/backend/src/modules/mvp/identity/`:** каталог существовал untracked ещё ДО сессии (остаток неизвестной прежней попытки); содержимое построчно сверено с планом + provenance-скан (TODO/секреты/exec — ноль) — чисто, закоммичен как есть с доработками.
- **Тест-статус (изолированные прогоны — локальный источник истины):** backend-кластер 8 файлов **214/214** (+ runner 3, scanner 3, identity-lifecycle 19 после фиксов); frontend identity 23 + e2e 13 + role-flows 3 + test-player 14; миграции **42/42**; `pnpm typecheck` 8/8; ESLint тронутых файлов clean. **PR #240** (включая merge `origin/main` после #238/#239 с разрешением конфликтов README/handoff; наша запись перенумерована §5.116→§5.117 из-за коллизии с hotfix-записью main).
- **Следующий шаг roadmap:** Phase 4 **Plan B (прокторинг: запись WebRTC на итоговом тесте + согласие + автоудаление + просмотр админом)** — не запланирован; либо Phase 9/10 по выбору владельца. Ops-активация retention: `IDENTITY_IMAGE_RETENTION_ENABLED=true` после подтверждения 90-дневной политики.

### 5.118 Phase 4 Plan B — прокторинг: запись видео итогового теста (MediaRecorder чанки → MinIO, гейт, admin-плеер, retention-cron)

- **Запрос:** «продолжай по roadmap» (автономная сессия; выбор фазы делегирован). Из трёх кандидатов README (`Plan B / Phase 9 / Phase 10`) выбран **Plan B** — естественное завершение Phase 4: переиспользует всю инфраструктуру Plan A (files upload-intents + AV, retention-паттерн, 412-гейты, интерстициалы). Полный цикл: brainstorming → spec (`docs/superpowers/specs/2026-06-11-phase-4-plan-b-proctoring-design.md`; 5 расхождений спеки с кодом исправлены ДО исполнения по находкам план-агента) → план 15 задач (`docs/superpowers/plans/2026-06-11-phase-4-plan-b-proctoring.md`) → subagent-driven (fresh implementer + spec-review + quality-review на КАЖДУЮ задачу) → **финальное холистическое ревью + fix-цикл + повторная верификация**.
- **Что построено** (ветка `feat/2026-06-11-phase-4-plan-b-proctoring`): migration **0051** (`learning.proctoring_recordings` + `group_courses.requires_proctoring` + `enrollments.proctoring_override` CHECK + права `proctoring.submit/read`: learner→submit, methodist→read, админы→оба); MVP-коллекция `proctoringRecordings` (persistence generic — нулевой adapter-код, проверено); чистый `resolveProctoringRequirement` (`override ?? groupCourse-флаг`, матрица 6 кейсов); lifecycle в `MvpService`: `startProctoringRecording` (обязательный `consent: true` 152-ФЗ → `consentAt`; идемпотентный reuse активной сессии; **API принимает `enrollmentId`, не groupId** — фронт его не знает, группа выводится сервером), `createProctoringChunkUploadIntent` (`keyPrefix: 'proctoring'`, allowlist webm/mp4, дубль sequence → 409, лимит 10MB files-слоя ≈ 30-сек чанк), `completeProctoringRecording` (идемпотентен), `getMyActiveProctoringRecording` (`nextSequence = max+1` для resume); **5-й гейт `assertProctoringGate`** в `startAttempt` (412 `proctoring_required`, сообщение «Video recording must be active…» — non-collision с регексами Wave 1/Plan A покрыт тестами; module-тесты exempt; `attemptId` линкуется first-attempt-wins); админ `listProctoringRecordings` (обогащение learnerName/courseTitle/attemptStatus) + `getProctoringRecordingView` (batch-AV ДО подписи URL; presigned GET только чистых чанков; `chunkIssues`: file_infected/file_scan_failed/file_error/missing_chunk-разрывы; purged short-circuit); DTO + строгие validation-тесты; 7 эндпоинтов (`/proctoring-recordings…` + `PATCH /enrollments/:id/proctoring-override` под `learners.write`; статический `active` объявлен ДО `:id`) + permission-boundary; **dormant retention-cron 365 дней** (`PROCTORING_VIDEO_RETENTION_ENABLED=false`, `0 5 * * *` UTC, advisory-lock **528_493**, write-режим `runWithTenantStateAndSave` + **регресс-тест, что read-only runner НЕ вызывается** — закреплён урок CRITICAL Plan A; частичный сбой удаления → без штампа, ретрай завтра; сам файл-delete идемпотентен). Frontend: модуль `features/proctoring/` (`types/api/format` + **`recorder.ts` — браузер-свободная state-machine** (idle→acquiring→recording→uploading-tail→completed|error; последовательная очередь, retry-once-then-skip — сбой аплоада НИКОГДА не прерывает экзамен; resume со `startSequence`) + `hooks` + `active-recording.ts` (module-синглтон переживает App Router-навигацию) + `screens`); `detectStartGate` в test-player (дедуп 3-х интерстициал-регексов + 4 теста); consent-панель (превью камеры до согласия, чекбокс 152-ФЗ, кнопка заблокирована до готовности камеры); `● REC`-индикатор; stop+complete на сабмите (включая авто-сабмит по таймеру); админ `/admin/proctoring-recordings` (+`[id]`: **плеер со склейкой чанков в Blob** — webm-чанки одной сессии валидно конкатенируются, AbortController, прогресс «N из M», свежие presigned при сборке); **override-select «Прокторинг: наследуется/требуется/освобождён» на странице группы** (`GroupDetailsScreen`, виден при `learners.write`); навигация «Записи прокторинга» (`proctoring.read`; legacy-стаб `/proctoring` не тронут — e2e это ассертит).
- **🚨 Главный улов финального холистического ревью (per-task ревью пропустили — взаимодействие 3 задач): C1 — ретрай чанка был мёртв и отравлял плеер.** Сбой PUT → рекордер ретраит → `makeChunkUploader` запрашивал НОВЫЙ intent на тот же sequence → backend 409 `proctoring_chunk_duplicate` → ретрай не мог сработать никогда, а «фантомный» чанк (зарегистрирован, объекта нет; AV off = NoopScanner → 'clean') получал presigned URL → 404 при сборке **ронял всё видео целиком**. Фикс: intent-кэш per-sequence в замыкании (ретрай = повторный PUT на тот же URL; evict после успеха) + per-chunk деградация плеера (предупреждение «Фрагмент N недоступен», сборка продолжается) + 4 теста на СЧЁТЧИК intent-запросов. **Туда же I1:** F5 посреди экзамена молча убивал запись навсегда (рекордер-синглтон умирал, «Продолжить» шёл мимо гейта; весь resume-механизм был dead code) → `ProctoringResumeBanner` + `useActiveProctoringSession` на attempt-странице (возобновление с `nextSequence`, согласие уже в записи). **I2:** override был API-only при обещающем тексте ошибки → реальный select на странице группы (31 строка по паттерну экрана). Все 3 фикса верифицированы повторным ревью.
- **Прочие review-catches по задачам (выборочно):** приватность — `stop()` во время `acquiring` теперь гасит камеру сразу после resolve `getUserMedia` (раньше камера жила без какого-либо stop-пути); `oldValues`-snapshot до мутации в audit `complete`; строгие `{ whitelist, forbidNonWhitelisted }` в новых dto-тестах (как в проде); body-ассерты consent/чанка в contract-тестах; typed `attemptStatus`-union на фронте; `ProctoringOverride` объявлен рядом с `Enrollment`; narrowed union кодов `chunkIssues`; CHECK-констрейнт на `recording_status`; AbortController/прогресс/aria в плеере; русификация `camera_unavailable`.
- **Девиации от спеки (задокументированы в плане/спека синхронизирована):** поле = `recordingStatus` (коллизия `BaseEntity.status`, зеркало Plan A); идемпотентный повторный start = 200 reuse (не 409); поля чанк-DTO = `originalName`/`contentType` (конвенция files-слоя); фронтовый детект гейта матчит и код, и текст сообщения (`useStartAttempt` отдаёт только message).
- **Тест-статус (изолированные прогоны — локальный источник истины):** backend-кластер 10 файлов **248/248** (proctoring service 32 + requirement 6 + retention-трио 11 + identity 19 + pre-exam 9 + dto 113 + http-boundary 54 + business-flows 4); миграции **48/48** (3 файла напрямую; root-скрипт `pnpm test:migrations` на этой машине не находит файлы — workspace-glob, pre-existing, `package.json` веткой не тронут); frontend таргет **72/72** (11 файлов: proctoring 46 + test-player + e2e 8 + mvp 14); полный `pnpm test:frontend` 504/510 — 6 падений = известный environmental-класс (dynamic-import smoke timeout 5s под полной параллелью, включая нетронутые фичи; изолированно 77/77; на baseline идентично — проверено stash-тестом в Task 13); `pnpm typecheck` 8/8; ESLint всех тронутых путей clean.
- **Ops-активация:** `PROCTORING_VIDEO_RETENTION_ENABLED=true` после подтверждения владельцем 365-дневной политики хранения (единственный owner-confirmable пункт спеки §10; дефолт roadmap «1 год»); `infra/.env.production.example` обновлён (пара переменных рядом с identity-парой). Прод-замечание: при `ANTIVIRUS_ENABLED=false` чанки считаются clean (NoopScanner) — как и все загрузки платформы (V1.1).
- **Следующий шаг roadmap:** PR этой ветки → далее **Phase 9 (SCORM+аналитика)** или **Phase 10 (PWA/WCAG/Excel)** по выбору владельца; обе без внешних блокеров. Отложено в Plan B: запись экрана, live-оператор, face-match, синхронизация таймлайна видео с ответами, внешние proctoring-провайдеры (адаптер-стаб не тронут).

### 5.119 Phase 9 Plan A — SCORM 1.2 импорт + плеер (загрузка zip, парсер манифеста, раздача контента по токену, cmi-прогресс)

- **Запрос:** «продолжай по roadmap» (автономная сессия; выбор фазы делегирован). Из README-кандидатов (Phase 9 / Phase 10) выбран **Phase 9** и его **Plan A — SCORM-импорт и плеер** (аналитика-дашборд вынесен в **Plan B**, отдельный план — §11 спеки). Полный цикл: brainstorming → spec (`docs/superpowers/specs/2026-06-12-phase-9-scorm-analytics-design.md`, решения D1–D10) → план 17 задач (`docs/superpowers/plans/2026-06-12-phase-9-plan-a-scorm.md`) → subagent-driven (fresh implementer + spec-review + quality-review на КАЖДУЮ пачку) с fix-циклами.
- **Что построено** (ветка `feat/2026-06-12-phase-9-plan-a-scorm`): migration **0052** (`learning.scorm_packages` + `learning.scorm_attempts` + `materials.scorm_package_id` + пересоздан `materials_type_chk` с `'scorm'`; **прав НЕ добавляли** — управление пакетами = `materials.write`, launch = `materials.read`, commit = `progress.recalculate`, все уже выданы ролям); MVP-коллекции `scormPackages`/`scormAttempts` (зарегистрированы в state + `mvp-collections.ts` + `mvp-domain.schema.ts`). **Чистые модули** (TDD): `parseScormManifest` (fast-xml-parser; версия/title/launch href первого item→resource + xml:base + `organizations[@_default]`; SCORM 2004 → `scorm_version_unsupported`); `scorm-zip-guards` (лимиты 5000 entries / 1.5ГБ total / 300МБ entry; `assertSafeEntryPath` отвергает `..`/абсолютные/backslash/`%`-encoded/NUL; `contentTypeForPath` MIME-map); `scorm-content-token` (HMAC-SHA256 base64url sign/verify, `{tenantId,packageId,exp}`, timingSafeEqual, null при любой проблеме). **`ScormService`** (request-scoped, по образцу eisot): `createPackageUploadIntent` (`keyPrefix: 'scorm-packages'`, zip-allowlist, лимит `SCORM_PACKAGE_MAX_BYTES`); `registerPackage` (детерминированный `storagePrefix = scorm/<tenant>/<id>`); `processPackage` (синхронно: `getReadableFile` AV-гейт → буфер из S3 → adm-zip → **гард-проход по ВСЕМ entries ДО любого `getData()`** (zip-bomb-защита) → require `imsmanifest.xml` → parse → putObject per entry; ScormManifestError/ScormZipGuardError → `failed`+код+cleanup, не бросает; идемпотентен при `ready`); `deletePackage` (409 `scorm_package_in_use` пока материал ссылается; иначе cleanup префикса + soft-delete `status='deleted'`); `launchScormMaterial` (доступ через material→module→version→course + enrollment→groupCourse-линк + владелец `assertActorMatchesLearnerIamLink`; единственный attempt на `(enrollment,material)`; `launchUrl = /api/v1/scorm-content/<token>/<launchHref>`); `commitScormAttempt` (мёрдж cmi-полей по `!== undefined`, `totalSeconds += sessionSeconds`; на `passed`/`completed` один раз завершает materialProgress через штатный `upsertMaterialProgress`). **Контроллеры:** `ScormController` (8 authed-маршрутов) + **`ScormContentController` — unguarded** (`@Get(':token/*rest')`, БЕЗ TenantGuard/interceptor; iframe не шлёт заголовки → auth только HMAC-токеном; ключ S3 строится из payload токена, не из клиента → кросс-tenant изоляция; стрим + `X-Content-Type-Options: nosniff` + `error`-handler на потоке). Files-слой: `getReadableFile` (server-side чтение с тем же AV-гейтом — рефактор `ensureCleanFile`), `maxBytes`-override в `UploadIntentOptions`, `S3StorageClient.listObjectKeys` (пагинация). **Frontend:** `features/scorm/` (`types/api` + `cmi-mapping` чистые: `parseScormSessionTime` (HHHH:MM:SS, односимвольные часы + ms-precision), `buildCommitPayload` (conditional spread под exactOptionalPropertyTypes), `buildInitialCmi`); `useScormPackages` хук; `ScormPackagesScreen` на `/scorm` (заглушка заменена: загрузка zip → register → process, DataTable со статусами/размерами, «Обработать»/«Удалить»); scorm-опция + select ready-пакетов в форме материала (`CourseDetailsScreen`, `minViewSeconds` форсится в 0 для scorm); **`ScormPlayer`** (`'use client'`, dynamic `import('scorm-again')` Scorm12API в родительском окне, `window.API` ставится ДО рендера iframe, `LMSCommit`/`LMSFinish` → commit, resume через `buildInitialCmi`, ownership-checked синхронный `delete window.API` в cleanup) встроен в `MaterialPlayer` (`case 'scorm'` + проброс `enrollmentId` из курс-вьюера); `next.config` rewrite `/api/v1/scorm-content/*` для same-origin в dev (в prod покрыто существующим Caddy-маршрутом `/api/v1/*`); e2e (route-access `/scorm` = `materials.read`, nav, cmi-pipeline, dynamic-import smoke).
- **Девиация от спеки (задокументирована):** распаковка через **adm-zip** (буфер), а не `unzipper` (стрим) — выбрана за тестируемость (фикстуры строятся той же библиотекой) и синхронный API; лимиты 300МБ zip / 1.5ГБ uncompressed сохранены; пик памяти ≈ zip + крупнейший entry приемлем для редкой админ-операции.
- **Уловы two-stage review (по пачкам):** zip-bomb — манифест декомпрессился `getData()` ДО бюджетного гарда → гард-проход вынесен вперёд; encoded-traversal/NUL добавлены в `assertSafeEntryPath`; пустой `tenantId`/`packageId` в токене → null; `parseScormSessionTime` принимал только 2–4-значные часы (терял время реальных пакетов) → `\d{1,4}` + `.\d+`; **MEDIUM Content-Type mismatch** на presigned PUT (на Windows у `.zip` пустой `file.type` → подпись MinIO не сходилась → 403) → `putFileToPresignedUrl` принимает резолвнутый contentType; **2 MEDIUM гонки `window.API`** в плеере (stale-mount ставил API после unmount; async-cleanup мог удалить API нового маунта) → `cancelled`-guard перед установкой + синхронный ownership-checked `delete`; secret-guard `SCORM_CONTENT_TOKEN_SECRET` в `superRefine` для prod; новые таблицы добавлены в suite-wide контрактные тесты.
- **Тест-статус (изолированные прогоны — локальный источник истины):** frontend полный **537/537** (86 файлов); backend `scorm/` **69** (5 файлов: service + parse-manifest + zip-guards + content-token + scorm-content.http.integration), `mvp.http.integration` **78**, `mvp.dto-validation` **125**, `files/` **28**, `mvp-domain-migrations` **50**, `env` **10**; `pnpm typecheck` **8/8**; ESLint всех scorm-путей clean. Полный backend-suite не гоняли (известный Windows/Cyrillic краш — CLAUDE.md).
- **Ops-активация:** новые env `SCORM_PACKAGE_MAX_BYTES` (300МБ), `SCORM_CONTENT_TOKEN_SECRET` (в проде — сильный random; guard отвергает dev-дефолт в prod/staging), `SCORM_CONTENT_TOKEN_TTL_SECONDS` (4ч) — добавлены в `infra/.env.production.example`. Same-origin раздача SCORM в prod уже покрыта Caddy-маршрутом `/api/v1/*` (отдельная строка не нужна).
- **Следующий шаг roadmap:** PR этой ветки → **Phase 9 Plan B (дашборд аналитики: completion/pass-rate/drop-off + drill-down, recharts)** или **Phase 10**. Вне скоупа Plan A: SCORM 2004/xAPI/cmi5/LTI, multi-SCO TOC, async-распаковка через worker, LContent-тренажёры, экспорт SCORM-результатов в регуляторные реестры.

### 5.120 Phase 9 Plan B — дашборд аналитики администратора (completion/pass-rate/drop-off + drill-down)

- **Запрос:** «продолжай по roadmap» (`/superpowers:dispatching-parallel-agents`). Plan A (SCORM) уже слит — **PR #242 в `main`**, поэтому следующий пункт roadmap однозначен: **Phase 9 Plan B — дашборд аналитики** (скоуп заморожен в §11 спеки `2026-06-12-phase-9-scorm-analytics-design.md`). Цикл: writing-plans → план 6 задач (`docs/superpowers/plans/2026-06-13-phase-9-plan-b-analytics-dashboard.md`) → **параллельный диспатч двух агентов** (backend-трек / frontend-трек, непересекающиеся файлы) → интеграция + холистическая верификация оркестратором.
- **Что построено** (ветка `feat/2026-06-13-phase-9-plan-b-analytics`): **read-model, БЕЗ миграции / новой коллекции / нового права** (по образцу `getKpiSnapshot`, переиспользует `enrollments.read`). Backend: чистый агрегатор `computeAnalyticsDashboard(input)` (`analytics-dashboard.ts`) над срезами MVP-state → `AnalyticsDashboardDto` (completion rate, exam pass rate, средний срок прохождения `averageCompletionDays` = enrolledAt→completedAt, средний балл `averageScorePercent` = bestScore/maxScore, распределение «с какой попытки сдан» 1/2/3+ через `ExamResult.attemptsCount`, drop-off = активные с `updatedAt` старше 14 дней, строки `byCourse`/`byGroup` с label-резолвом); `MvpService.getAnalyticsDashboard` (тонкий адаптер: per-tenant фильтр коллекций + проекция `tests`→`{id,courseId}` + `asOf=new Date()`); `GET /reports/analytics-dashboard` (`enrollments.read`); `client_id?` добавлен в `BaseFilterQuery` (фильтр по `group.counterpartyId`); DTO зеркально в `packages/api-contracts/.../mvp-metrics/contracts.ts`. Frontend: `features/analytics/` (`types`/`api`/`hooks` по образцу kpiSnapshot; чистые `format.ts` — `formatPercent`/`formatDays`/`computeBarChartLayout`; **inline-SVG `BarChart`**; `AnalyticsDashboardScreen` — KPI-карточки + 2 графика (завершаемость по курсам, попытки до сдачи) + drill-down-таблицы по курсам/группам + FilterBar course/group/client/date); страница `/admin/analytics` (`enrollments.read`) + nav-entry «Аналитика»; экспортированы ранее-приватные `useMvpQuery`/`queryString`/`withAuth` для переиспользования.
- **Девиация D-B1 (задокументирована в плане):** графики — **dependency-free inline SVG** через чистую геометрию `computeBarChartLayout` (юнит-тесты), а НЕ `recharts` из §11. Причина: документированный класс хрупкости heavy-dynamic-import smoke в этом репо (см. §5.119) + приоритет владельца на токен-дизайн-систему/читаемость. Графики на токенах, геометрия тестируема; recharts можно подменить позже при потребности в интерактиве.
- **Параллельный диспатч (skill `dispatching-parallel-agents`):** контракт (форма DTO) заморожен в плане ДО диспатча → два агента независимо построили `AnalyticsDashboardDto` (backend) и `AnalyticsDashboard` (frontend) с идентичными полями; согласие доказано полным `pnpm typecheck` (структурное расхождение уронило бы `tsc`). Агенты НЕ делали git-операций (исключён race на `.git/index.lock`) — коммиты и интеграция за оркестратором. Оба разрешили один класс plan-NOTE (иллюстративные тест-хелперы плана ≠ реальным идиомам): backend → реальный `issueSignedAccessToken`/`iamServiceMock`, frontend → `beforeAll`-env + dynamic-import идиома соседнего `api.contract.test.ts`.
- **Тест-статус (изолированные прогоны):** backend `analytics-dashboard` **4** + `mvp.http.integration` **80** (permission boundary 403/200) = **84**; frontend `analytics` (`format` 4 + `api.contract` 1) + e2e (route-access/nav/pure-helper/screen-import smoke) 4 = **9**; `pnpm typecheck` **8/8**; ESLint новых путей clean (lint-staged прогнал на обоих коммитах). Полный backend-suite не гоняли (известный Windows/Cyrillic краш — CLAUDE.md).
- **Следующий шаг roadmap:** PR этой ветки → merge; затем **Phase 10 (PWA/WCAG/Excel-конструктор)**. Минорные follow-ups: drop-off использует `enrollment.updatedAt` как прокси активности (более точный сигнал — `materialProgress.lastViewedAt` — backlog); экспорт аналитики в CSV/XLSX не делали (на странице нет кнопки выгрузки — отдельный запрос при необходимости). Вне скоупа Phase 9 (эхо спеки): SCORM-аналитика результатов, аналитика регуляторных выгрузок, модальные drill-down (drill-down = выбор фильтра).

### 5.121 Phase 10 Track A — Excel-конструктор отчётов (выбор сущности/полей/фильтров → превью → XLSX → шаблоны)

- **Запрос:** «продолжай по roadmap» (`/superpowers:dispatching-parallel-agents`), затем «прими самое эффективное решение и продолжай». Phase 9 полностью слита (Plan A #242 + **Plan B #243**), следующий пункт roadmap — **Phase 10 (Mobile/PWA + WCAG + Excel-конструктор)**. Владелец выбрал «все три трека параллельно»; цикл brainstorming → spec (`docs/superpowers/specs/2026-06-13-phase-10a-excel-report-builder-design.md`) → план 10 задач (`docs/superpowers/plans/2026-06-13-phase-10a-excel-report-builder.md`). **Девиация по способу исполнения:** параллельный субагент-диспатч недоступен (агенты падали с `403 auth`), поэтому реализовано **последовательно in-process TDD оркестратором**, лидирует Track A (наивысшая ежедневная ценность, без новых зависимостей/миграций/прав). Tracks B (WCAG) и C (PWA+push) — дизайн утверждён (spec §11), отдельные ветки/планы далее.
- **Что построено** (ветка `feat/2026-06-13-phase-10a-excel-report-builder`): **read-model, БЕЗ миграции / нового права** (по образцу analytics-dashboard, переиспользует `enrollments.read`/`enrollments.write` — решение **D-A2**). Backend `modules/mvp/report-builder/`: декларативный реестр сущностей `report-entities.ts` (single source of truth: поля + фильтры + резолверы через `ResolveCtx`-мапы), чистый движок `build-report.ts` (`buildReport`: фильтрация→проекция→кап→`total`/`truncated`), обобщённый `report-xlsx.writer.ts` (динамические колонки поверх exceljs, уже в deps), DTO `report-builder.dto.ts`. `MvpService`: `getReportEntitiesMeta`/`previewReport`(кап 50)/`exportReport`(кап 50000, **base64-в-конверте, без S3** — D-A3)/`listReportTemplates`/`getReportTemplate`/`saveReportTemplate`(create+update-by-id, audit)/`deleteReportTemplate`(audit) + приватные `buildReportResolveCtx`/`loadReportRows`/`runReport`(оборачивает engine-ошибки в `BadRequestException`). Новая MVP-state коллекция **`reportTemplates`** (зарегистрирована в `mvp-collections.ts` + init в `in-memory-mvp.state.ts` — известный подводный камень персиста). 6 endpoints на `MvpController` (`reports/builder/{entities,preview,export,templates,templates/:id}`). DTO зеркально в `packages/api-contracts/.../mvp-metrics/contracts.ts`. Frontend `features/report-builder/`: `types`/`api`/`hooks` (useQuery + useState-`wrap` мутации, НЕ React Query mutations) + чистая `report-builder.ts` (`canRun`/`toRequest`/`toggleField`/`setFilter`/`base64ToBytes`; DOM-`triggerDownload` изолирован) + `ReportBuilderScreen` (селектор сущности → чекбоксы полей → фильтры → «Превью» `DataTable` → «Скачать XLSX» → сохранение/загрузка/удаление шаблонов); страница `/admin/reports/builder` (`enrollments.read`) + nav-entry «Конструктор отчётов».
- **Девиация D-A5 (документы-сущность отложена):** v1 ships **две MVP-state-нативные сущности — `learners` + `enrollments`** (с денормализованными ФИО/группа/заказчик/прогресс через резолвер-мапы). Кросс-модульная `documents` сущность отложена: живёт в отдельном пагинируемом `documents`-модуле, а отчётность по выданным удостоверениям уже частично закрыта «реестром документов» (Pillar A Plan B §5.6). Сужение убирает единственный кросс-модульный риск трека, не трогая основную ценность. Course-поле для enrollments намеренно не выведено (группа несёт много курсов через `groupCourses` — плоская строка не может иметь одно значение course).
- **Тест-статус (изолированные прогоны):** backend `report-builder` кластер **33** (entities 7 + build-report 9 + xlsx 2 + dto 7 + service 8) + `mvp.http.integration` **85** (5 новых permission-boundary 403/201/200) + `mvp/infrastructure` regression **5**; frontend `report-builder` **14** (pure 6 + api.contract 4 + e2e 4, incl. screen-import smoke); contracts **7**; `pnpm typecheck` **8/8**; ESLint всех затронутых путей clean (lint-staged + явные прогоны). Полный backend-suite не гоняли (известный Windows/Cyrillic краш — CLAUDE.md Gotchas).
- **Следующий шаг:** PR ветки → merge. Затем **Track B (WCAG: `eslint-plugin-jsx-a11y` гейт + фиксы общих примитивов)** и **Track C (PWA-манифест/Serwist SW + web-push канал в `notification-dispatcher`)** — дизайн в spec §11. Отложенный backlog Track A: `documents`-сущность, CSV-формат, drill-down модалки, S3/async-экспорт для очень больших отчётов.

### 5.122 Phase 10 Track B — WCAG-доступность: статический гейт `eslint-plugin-jsx-a11y` + ручные a11y-фиксы общих примитивов

- **Запрос:** Phase 10 «все три трека параллельно» (Track A — Excel-конструктор, Track B — WCAG, Track C — PWA/push), отдельные ветки/worktree. Эта запись — **Track B** (ветка `feat/2026-06-13-phase-10b-wcag-accessibility`), скоуп заморожен в §11 спеки `2026-06-13-phase-10a-excel-report-builder-design.md` и плане `docs/superpowers/plans/2026-06-13-phase-10b-wcag-accessibility.md` (12 задач, исполнены по порядку).
- **Подход (под конвенцию репо «no React mount / no axe runtime»):** автоматический сигнал доступности = **статический lint-гейт** `eslint-plugin-jsx-a11y` (recommended, НЕ strict), runtime axe-аудит **явно отложен** (нет DOM-окружения в тестах). Чистая логика покрыта обычными vitest-юнитами; разметочные фиксы примитивов проверены lint+typecheck (DOM-юнитов на них нет — конвенция).
- **Гейт wired в ОБА пути линтования:** (а) корневой flat-config `eslint.config.mjs` — новый блок `files: ['apps/frontend/**/*.{jsx,tsx}', 'packages/ui/**/*.{jsx,tsx}']` со `...jsxA11y.flatConfigs.recommended` (покрывает `packages/ui` через `eslint src` и `apps/frontend`); (б) `apps/frontend/.eslintrc.json` расширен `plugin:jsx-a11y/recommended` для `next lint`. Доказано активным в обоих путях: baseline-прогон поймал нарушения и через `eslint src` (ui/dialogs), и через `next lint` (media-has-caption).
- **Baseline-триаж (Task 2) — была группа B (out-of-scope pre-existing), нейтрализована точечно (НЕ глобальным выключением правила):** 3 нарушения — (1) `packages/ui/src/components/dialogs/index.tsx:82` (`no-noninteractive-element-interactions` + `click-events-have-key-events` на `<div role="dialog">` с stopPropagation-onClick; Modal уже имеет focus-trap+Escape, по плану landmarks Modal не трогаем) → inline `eslint-disable-next-line ... -- Phase 10B: out-of-scope`; (2,3) `course-viewer/video-player.tsx` + `proctoring/screens.tsx` (`media-has-caption` на тенант-видео/записях прокторинга, треков субтитров нет) → inline-disable с TODO. Целевые примитивы НЕ давали ошибок recommended (SearchInput/LookupSelect не имели вообще никакого `<label>`, поэтому `label-has-associated-control` молчал) — их фиксы это семантические улучшения сверх плагина.
- **Что починено в примитивах (`packages/ui`):** новый `a11y/visually-hidden.ts` (`VISUALLY_HIDDEN_CLASS='ui-visually-hidden'` + детерминированный `fieldId(base,suffix)` — slug сохраняет буквы любого алфавита через `\p{L}\p{N}`, fallback `'field'`; класс добавлен в `styles/foundation.ts`, экспорт из barrel `@cdoprof/ui`); **StatusChip** — `status-label.ts` маппинг статус→рус.текст (не-цветовой носитель смысла, WCAG 1.4.1) + `title`; **LoadingState** `role=status`+`aria-live=polite`+`aria-busy`, **EmptyState** `role=status` (ErrorState уже имел `role=alert` — не трогали); **SearchInput**+**LookupSelect** — единый label-паттерн **D-B2: visually-hidden `<label>`+`htmlFor`/`id`** (НЕ голый `aria-label`: надёжнее для скринридеров, расширяет клик-зону, удовлетворяет `label-has-associated-control`), опциональный `label` с дефолтом (обратная совместимость вызовов); **Pagination** `<nav aria-label>`-landmark + `type=button`/`aria-label` на prev/next + `aria-live` индикатор; **FilterBar** `role=group`+`aria-label`; **DataTable** стабильный ключ строки (`rowKey?` проп → fallback `r.id`/`r.key` → индекс; колоночные ключи уже были стабильны); **FormField**/**TextareaField** — связка hint/error через `aria-describedby` (conditional spread под `exactOptionalPropertyTypes`, без `={undefined}`) + `role=alert` на error.
- **AppShell (`apps/frontend`):** бейдж непрочитанных уведомлений — постоянная live-region `role=status`+`aria-live=polite` (раньше `<span>` рендерился условно → смена счётчика не озвучивалась; теперь span всегда в DOM, при пустом счётчике скрыт через `VISUALLY_HIDDEN_CLASS`). Прочие landmarks shell (skip-link, `<nav>`/`<header>`/`<aside>`, `aria-current`) — НЕ трогали (уже сильные).
- **Холистическое ревью (оркестратор, после реализации) — поймало IMPORTANT-баг:** `fieldId` сужал slug до `[a-z0-9]`, схлопывая ВСЕ кириллические подписи в один id `field` → дубликаты `id` и `aria-describedby`/`htmlFor` на любой форме/фильтре с 2+ полями (подрыв самой цели трека на русскоязычном UI). Фикс: сохранение букв любого алфавита через `\p{L}\p{N}` (id с кириллицей валиден в HTML5; ассоциации матчатся по строковому равенству, не CSS-селектором) + регресс-тесты (commit `fix(ui): fieldId preserves Cyrillic`).
- **Тест-статус (финальные прогоны):** `pnpm --filter @cdoprof/ui exec vitest run` — UI-юниты (`visually-hidden` incl. Cyrillic-регресс + `status-label` + existing) зелёные; `pnpm test:frontend` — **546/546** (в холодном полном прогоне 6 dynamic-import-smoke e2e упали по таймауту из-за холодного vite-transform на кириллице — НЕ логика; при изолированном тёплом прогоне все зелёные); `pnpm lint` — **8/8** (a11y-гейт чист `--max-warnings=0`); `pnpm typecheck` — **8/8**. Полный backend-suite не гоняли (вне скоупа трека + Windows/Cyrillic краш).
- **Отклонения/решения:** label-паттерн = visually-hidden `<label>` (D-B2, не `aria-label`); гейт = recommended (не strict); тест-файлы a11y созданы как `.tsx` (vitest-config ui `include: ['src/**/*.test.tsx']` — `.ts` не подхватываются); номер handoff = **5.122** (Track A = §5.121, слит #245; Track C → §5.123). **PR #246.**
- **Следующий шаг:** merge #246 после ревью. Отложено (вне скоупа, зафиксировано): runtime axe-аудит (нет DOM-окружения); субтитры к видео (отдельная content-authoring-фича).

### 5.123 Phase 10 Track C — PWA (manifest + Serwist SW) + web-push (VAPID, канал в диспетчере)

- **Запрос:** реализовать план `docs/superpowers/plans/2026-06-13-phase-10c-pwa-push.md` (Track C спеки §11 `2026-06-13-phase-10a-excel-report-builder-design.md`) в изолированном worktree `wt-phase10c`, ветка `feat/2026-06-13-phase-10c-pwa-push`. Параллельно с Track B (Excel-конструктор) в другом worktree. **Номер handoff:** в ветке был свободен 5.121, но при мёрдже `main` Track A занял §5.121 и Track B — §5.122, поэтому Track C присвоен **§5.123** (разрешено при слиянии main → phase-10c).
- **Что построено (15 задач по порядку, TDD где предписано, всё DORMANT):**
  - **Env (Task 1):** `WEB_PUSH_ENABLED` (custom boolean-parse, default `false`) + `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` (optional) + `VAPID_SUBJECT` (default mailto); `superRefine` conditional-required ключей при enabled; `.env.production.example`-блок; 4 env-теста в `env.test.ts`.
  - **MVP-state (Task 2):** коллекция `pushSubscriptions` (тип `PushSubscription extends BaseEntity`) — зарегистрирована в **ОБОИХ** местах (`mvp-collections.ts` + поле в `in-memory-mvp.state.ts`); **без миграции** (D-C2, JSON-снимок MVP-state, в prod переживает рестарт через postgres-драйвер).
  - **Чистые функции (Task 3):** `web-push-keys.ts` (`isValidBrowserSubscription`/`normalizeSubscription`); `push-subscription-store.ts` (upsert-дедуп по `(tenant,endpoint)`, list/remove — переиспользуется сервисом И sender-ом); `template-push-mapping.ts` (`toPushNotification`: subject→title, первая непустая строка body→текст ≤120, url-опц).
  - **Сервис (Task 4):** `PushSubscriptionService` (`Scope.REQUEST`, инжектит `MVP_STATE` + `AuditService`) — subscribe/unsubscribe/list/removeByEndpoint, tenant+user-изоляция, audit `notifications.push_subscribed`/`_unsubscribed`.
  - **Sender (Task 5):** `WebPushSenderPort` + токен `WEB_PUSH_SENDER`; **`WebPushSender` — singleton** (инжектит `MvpTenantRunner`, читает подписки read-mode, шлёт через `web-push` lib, зачищает 404/410 в отдельном write-mode проходе, best-effort — никогда не бросает) + `NoopWebPushSender`.
  - **Шов в диспетчере (Task 6):** `DispatchRecipient.userId?` (опционально, обратносовместимо); `NotificationDispatcher` после email-цикла собирает userIds получателей и зовёт `pushSender.sendToUsers(...)` — **5 call-sites Phase 5 не меняли структурно**, `userId` прокинут точечно через `learnerRecipient` (читает `Learner.linkedIamUserId`) → событие `recipient.userId` (enrollment-листенер) + `buildLearnerEmployerRecipients` (recert/deadline/revoked, employer без userId → push молча скип). dedup-скип email = ранний return ⇒ push не шлётся.
  - **Эндпоинты (Task 7):** `WebPushController` (`@Controller('web-push')` + `MvpRequestPersistenceInterceptor` + **TenantGuard-only, без RBAC** как `NotificationsController`, D-C3) — `GET public-key` (отражает `WEB_PUSH_ENABLED`), `GET subscriptions`, `POST/DELETE subscribe`; DTO + `assertValidDto`; HTTP-integration permission-boundary (стаб-контроллер, 401 без токена / 200 любому authed user / no-RBAC).
  - **DI (Task 8):** контроллер + `PushSubscriptionService` — в **MvpModule** (там MVP_STATE + persist-интерсептор). `WEB_PUSH_SENDER` factory — в **CommunicationModule** (там диспетчер): при enabled `new WebPushSender(tenantRunner)`, иначе `NoopWebPushSender`. **Развязка цикла:** MvpModule уже импортирует CommunicationModule, поэтому в CommunicationModule провайдится отдельная цепочка `MvpTenantRunner`/`MVP_PERSISTENCE_BACKEND`/`PostgresMvpPersistenceBackend` (НЕ импорт MvpModule); оба runner-а читают одни postgres-таблицы через singleton `DatabaseService`. `MvpTenantRunner` через reentrant `TenantSerialGateway` безопасен внутри dispatch-запроса.
  - **PWA (Tasks 9–10):** `app/manifest.ts` (App Router metadata route, standalone, ru, theme `#0b5cab`) + 3 плейсхолдер-PNG (`public/icons/`, README-пометка) + `themeColor`/`appleWebApp` в `layout.tsx`; **Serwist** `@serwist/next` 9.5.11 — `withSerwistInit({swSrc:'src/app/sw.ts', swDest:'public/sw.js', disable: dev})` оборачивает `nextConfig` (**SCORM rewrites сохранены**), `src/app/sw.ts` (Serwist-класс app-shell precache + `defaultCache`); `public/sw.js` в `.gitignore`.
  - **Push-фронт (Tasks 11–13):** `features/push/` — `push-logic.ts` (`urlBase64ToUint8Array`/`serializeSubscription`/`isPushSupported`, чистые + тесты), `api.ts` (4 эндпоинта) + contract-тесты; SW push/notificationclick-хендлеры (payload = WebPushSender JSON); `usePushSubscription` hook (useState/async, browser API только в effect) + `PushSettingsScreen` (тумблер, скрыт при `enabled=false`/no-support) встроен в **`/notifications`** (self-service `tenant.read` — не в admin-only `/settings`); e2e (route-access/nav/VAPID-pipeline/module-smoke, без render/SW-импорта).
- **Девиации:** (1) handoff **§5.123** (Track A=§5.121 и Track B=§5.122 заняли номера при мёрдже main); (2) sender = singleton через `MvpTenantRunner`, а не request-scoped инжект `PushSubscriptionService` (диспетчер обязан остаться singleton — его инжектят singleton @OnEvent-листенеры); логика подписок вынесена в чистый `push-subscription-store.ts`; (3) UI на `/notifications`, не на новой странице (там уже self-service `tenant.read`); (4) push-error в тесте диспетчера = `.rejects` (реальные Noop/WebPushSender не бросают — прод безопасен, email уже в journal до фан-аута).
- **Тест-статус (изолированные прогоны):** backend таргет **73** (`env.test` 14 + web-push кластер 45 [keys 7, store 6, subscription-service 9, sender 6, mapping 6, dto 7, http-integration 4] + dispatcher 8 + enrollment-recipient 6); reminder/recert регрессия **24** зелёная; **frontend полный 566/566** (вкл. push logic 8 + contract 4 + e2e 7); `pnpm typecheck` **8/8**; ESLint всех 44 изменённых файлов clean.
- **Frontend build:** Serwist SW бандлится ✓, compile ✓, type-check ✓, static-gen 71/71 ✓, `public/sw.js` (~52KB) + `manifest.webmanifest` route генерируются ✓. **Риск для ревьюера:** финальная фаза `output:'standalone'` падает на Windows EPERM symlink (`react`/`@next/env` — pre-existing environmental, НЕ Track C; CI Ubuntu соберёт чисто).
- **Отложенная ручная проверка (нет DOM в тестах):** реальная регистрация SW + установка PWA (Lighthouse/devtools); реальный push end-to-end (включить `WEB_PUSH_ENABLED=true` + VAPID → триггер Phase 5 события → браузерное уведомление) — после деплоя.
- **PR не создавался** (оркестратор после ревью). Не `push`-ил.

### 5.124 Зелёный прогон тестов — починка регрессии explicit-`@Inject` DI (накопилась с Phase 5) + грациозный скип Docker-теста

- **Запрос:** `/goal` «продолжай до тех пор пока все тесты не станут зелеными, не будет падений» на ветке `feat/2026-06-13-phase-10a-excel-report-builder`. **NB:** к моменту работы вся Phase 10 (Track A #244/#245, Track B #246, Track C #248) и дебаг-чистка (#247) уже были слиты в `main`, поэтому **уникальный вклад этой ветки/PR #249 = только DI-фикс + Docker-скип ниже** (фича-коммиты ветки дублируют main и дедуплицируются при мёрдже).
- **Найденная реальная поломка (всё ещё красная на `main`):** `apps/backend/src/common/di-explicit-injection.test.ts` (страж из #236 — под `tsx`/esbuild нет `emitDecoratorMetadata`, поэтому каждый инжектируемый параметр конструктора ОБЯЗАН иметь явный `@Inject(Token)`, иначе `NestFactory.create()` зависает на старте) падал с нарушителями, накопившимися с Phase 5 (reminders/recertification), Phase 0 (email-sender) и Phase 10 Track C (web-push). Проскочили потому что полный backend-suite локально крашится (Windows+Cyrillic), а отдельные unit-тесты `new`-ают классы напрямую.
- **Фикс:** добавлен явный `@Inject(<Class>)` к параметрам конструкторов в провайдерах reminders/recertification/tenant-runner (+ web-push провайдеры Track C, влитые в main) — `mvp-tenant-runner.service.ts`, `recertification-scanner.service.ts`, `recertification.service.ts`, `course-deadline-scanner.service.ts`, `document-revoked-email.listener.ts` (плюс `import type`→value), `reminders-scheduler.service.ts`. Изменения **строго аддитивные** (явные токены для уже-инжектируемых по типу зависимостей — граф DI не меняется). Ложноположительный `iam/services/email-magic-link-email-sender.ts` (инстанцируется фабрикой `new`) добавлен в `FACTORY_INSTANTIATED` стража.
- **Docker-тест теперь грациозно скипается локально:** `iam/services/postgres-magic-link-token-repo.integration.test.ts` (единственный Testcontainers-тест) обёрнут в `describe.skipIf(!isDockerAvailable())`. Новый синхронный пробник `isDockerAvailable()` в `testing/with-test-db.ts` (Windows named pipe `\\.\pipe\docker_engine` / unix `/var/run/docker.sock` / `DOCKER_HOST`) → в CI (Ubuntu, сокет есть) тест идёт полностью, на dev-боксе без Docker **скипается видимо** (vitest `↓ 7 skipped`), а не валит локальный backend-прогон.
- **Тест-статус:** contracts **7** ✓, frontend ✓; backend по всем модулям зелёный (изолированные прогоны по модулям, обход Cyrillic-краша); `pnpm typecheck` **8/8** ✓, `pnpm lint` **8/8** ✓. Один тест по-прежнему НЕ запускается локально (зелёный в CI): `mvp/mvp.domains.http.integration.test.ts` — нативный краш воркера от Cyrillic-пути; per-file skip бессмысленен (полный параллельный прогон всё равно крашится на teardown 165 файлов). **PR #249.**

### 5.125 Phase 0 — плейбук готовности к первому пилоту (owner-facing, некодовый)

- **Запрос:** «продолжай» на ветке `docs/2026-06-14-phase-0-readiness-spec`.
- **Природа:** **некодовый план** ([2026-06-14-phase-0-foundation-readiness.md](docs/superpowers/plans/2026-06-14-phase-0-foundation-readiness.md), спек [design](docs/superpowers/specs/2026-06-14-phase-0-foundation-readiness-design.md)). Phase 0 = решения и процедуры **владельца** (НЭП-подпись, деплой, пилотный курс, прогон), а не разработка. Исполняемая агентом часть = owner-facing плейбук, превращающий абстрактную готовность в конкретные чек-листы. «Готово» = подтверждение владельцем, не прогон тестов → тестов нет (осознанно).
- **Артефакт:** [docs/phase-0/](docs/phase-0/) — индекс [README.md](docs/phase-0/README.md) (критический путь + карта направлений + рекомендуемый порядок владельца) + 6 направлений: WS1 [бренд/домен](docs/phase-0/01-brand-domain.md), WS2 [запуск сервера](docs/phase-0/02-server-go-live.md) (pre-flight + 10 шагов поверх `infra/server-setup.md`, без дублирования), WS3 [модель подписи](docs/phase-0/03-signature-model.md) (промежуточная простая ЭП + правовая оговорка на пилот, НЭП-апгрейд до коммерческого запуска; дисклеймер «не юр-консультация»), WS4 [пилотный контент](docs/phase-0/04-pilot-content.md) (ранбук курс→экзамен→удостоверение→QR поверх Pillar A/Phase 1-3), WS5 [пилотный клиент](docs/phase-0/05-pilot-client.md), WS6+WS7 [лицензия+реестры](docs/phase-0/06-license-registry-verification.md).
- **Поправка после сверки с записью владельца 2026-06-08** (коммиты `d2136dc`/`d2f6e0e`): владелец подтвердил, что бренд/домен, образовательная лицензия, действующие клиенты и облачный аккаунт **уже существуют**. Спек и плейбук скорректированы: WS1/WS6 → подтверждения (а не выбор с нуля), WS5 → выбор из существующих клиентов; реальный фокус Phase 0 = **НЭП + деплой + пилотный курс + прогон**. ЕСИА (решение D) и платежи/54-ФЗ (решение E) явно отложены в Phase 7.
- **Files changed:** 7 новых в `docs/phase-0/`, спек+план в `docs/superpowers/`, +1 строка в [PLANS_STATUS.md](docs/superpowers/plans/PLANS_STATUS.md). Backend/frontend нетронуты.
- **Тест-статус:** N/A (docs-only). `git status` чист, ветка запушена.

### 5.126 Phase 6 — Ростехнадзор + Минздрав-НМО реестры (durable Wave 2-паттерн)

- **Запрос:** «продолжай» → выбор владельца «Phase 6: новые реестры» (оба в одном спеке/плане).
- **Природа:** код-фича через полный цикл brainstorming → [спек](docs/superpowers/specs/2026-06-14-phase-6-rostechnadzor-nmo-registries-design.md) → [план](docs/superpowers/plans/2026-06-14-phase-6-rostechnadzor-nmo-registries.md) (20 TDD-задач) → subagent-driven (два модуля + фронтенд, two-stage review на каждую пачку) + холистическое ревью. Закрывает реестровый остаток Phase 6 (оставался ЭП/НЭП — отложен владельцем).
- **Что сделано:** два новых durable-экспортёра как сиблинги трёх существующих (ФРДО/ОТ/ЕИСОТ), **без миграции, без нового права** (переиспользуют `regulatory.export.read/write`), **XLSX-only**, PROVISIONAL-`COLUMNS` со swap-точками:
  - **Ростехнадзор** (`rostechnadzor-registry/`, route `rostechnadzor-registry`): источник = завершённые + сданные зачисления (ОТ-архетип, протокол из documents, exam-passed); 11 колонок; swap-точка `attestationArea` (= наименование курса/программы). Аудит `regulatory.rostechnadzor_exported`, id-префиксы `rtb`/`rtr`, коллекции `rostechnadzorRegistryBatches`/`...Records`.
  - **Минздрав-НМО** (`nmo-registry/`, route `nmo-registry`): источник = выданные документы (ФРДО-архетип, `listIssuedDocuments`, без kind-классификатора); 9 колонок; swap-точки `specialty` (пока `''`) + `creditUnits`/ЗЕТ (= академические часы). Аудит `regulatory.nmo_exported`, id-префиксы `nmb`/`nmr`, коллекции `nmoRegistryBatches`/`...Records`.
  - **Frontend:** расширение `features/gov-export/` (types/api/hooks) + две секции в `app/gov-export/page.tsx` (фильтры → «Сформировать» → история+скачивание; провизорные ⚠️-предупреждения) + два e2e.
- **Партиал-саксесс** соблюдён (валидные строки экспортируются, ошибки по строкам, `batchStatus: generated|partial|failed`, полностью невалидный батч → нет файла). Ревью-улучшение над ОТ-твином: `failed` считает distinct-сущности (а не объекты ошибок).
- **Ревью:** spec-compliance + code-quality на каждый модуль (0 Critical/Important; добавлены 2 теста-паритета на каждый сервис — cross-tenant rejection + dedup `failed`-math) + финальное холистическое ревью всей ветки.
- **Files changed:** 2 новых backend-модуля (по 6 файлов + тесты) + DTO + врезки в `mvp.types.ts`/`in-memory-mvp.state.ts`/`mvp-collections.ts`/`mvp.module.ts`/`mvp.http.integration.test.ts`; frontend `gov-export/{types,api,hooks,api.contract.test}.ts` + `app/gov-export/page.tsx` + 2 e2e. **Миграций нет** (последняя остаётся 0052).
- **Тест-статус (изолированные прогоны, Cyrillic-path fallback):** backend 123 (11 файлов: оба модуля + DTO + http-integration с +8 boundary-кейсами), frontend 17 (gov-export + 2 e2e), `pnpm typecheck` 8/8, ESLint clean.
- **PROVISIONAL:** оба формата не сверены с эталонами регуляторов — swap-точки помечены в коде; при получении офиц. шаблонов реконсиляция = локальная правка `COLUMNS` (+ возможная миграция под классификаторы областей аттестации / специальностей).
- **PR:** [#253](https://github.com/aiprocadm/cdoprof/pull/253) (push + PR через finishing-a-development-branch). Холистическое ревью: READY TO MERGE, 0 Critical/Important.
- **Follow-up (spawn_task):** все 5 реестровых экспортёров молча обрезают источник на `page_size: 1000` (pre-existing во всех твинах) — запланирована пагинация до боевой подачи в реестр. **→ Закрыто в §5.127.**

### 5.127 Устранение молчаливого обрезания источника на 1000 строк во всех 5 реестровых экспортёрах

- **Запрос:** закрыть pre-existing-ограничение, отмеченное follow-up'ом §5.126: каждый из 5 экспортёров (ОТ/ФРДО/ЕИСОТ/Ростехнадзор/НМО) брал ровно одну страницу источника с захардкоженным `page_size: 1000` и без цикла, поэтому тенант с >1000 кандидатов в окне фильтра получал **неполную выгрузку без предупреждения** — риск корректности для регуляторной подачи.
- **Природа:** TDD-фикс. Выбран вариант (a) — полная пагинация до исчерпания источника (предпочтительнее (b) «предупреждение о частичной выгрузке», т.к. устраняет проблему, а не сигнализирует о ней).
- **Диагностика (важно — уточняет формулировку задачи):** реально обрезались только **3** сервиса на архетипе `listEnrollments` (Ростехнадзор/ОТ/ЕИСОТ) — `MvpService.list()` режет до `page_size`. NMO/ФРДО вызывали `listIssuedDocuments` **без** `limit`, а тот по умолчанию отдаёт `limit = total` → де-факто все строки. Вызовы `listGroupCourses(..., page_size: 1000).items[0]` берут только первый элемент → не источник, не трогал. Фикс всё равно сделан **единообразно на все 5** (defensive + future-proof).
- **Что сделано:**
  - Новый общий хелпер [`apps/backend/src/modules/mvp/registry-pagination.ts`](apps/backend/src/modules/mvp/registry-pagination.ts) — `collectAllPages(fetchPage, pageSize=1000)` (+ экспорт `REGISTRY_SOURCE_PAGE_SIZE`). Терминация устойчива к двум формам источника: реальный `list()`/`listIssuedDocuments` с правдивым `total` → стоп по `collected >= total`; полностью замоканные стабы `{ items }` без `total` → стоп на первой короткой/пустой странице (не зацикливается на constant-return mock).
  - Все 5 сервисов переведены на `collectAllPages(...)`: 3 `listEnrollments`-вызова паджинируют через `page`/`page_size`; 2 `listIssuedDocuments`-вызова (NMO/ФРДО) — через `offset`/`limit`.
- **Тесты (TDD, RED→GREEN на оба архетипа источника):**
  - [`registry-pagination.test.ts`](apps/backend/src/modules/mvp/registry-pagination.test.ts) — 4 юнит-теста хелпера: исчерпание >1000 (1500 строк → 2 фетча), стоп на короткой странице без `total`, отсутствие лишнего фетча при `total` кратном размеру страницы, стоп на пустой странице без `total`.
  - ЕИСОТ-сервис (реальный `MvpService`): regression на 1500 зачислений → `exported === 1500` (до фикса было 1000 — RED подтверждён).
  - NMO-сервис: regression на 1500 выданных документов через offset/limit-пейджер → `exported === 1500`, `listIssuedDocuments` вызван дважды.
- **Партиал-саксесс / batchStatus не тронуты** — вариант (a) делает (b) ненужным: при полной пагинации обрезания не происходит.
- **Files changed:** `registry-pagination.ts` (+`.test.ts`) — новые; 5 сервисов (`{ot,frdo,eisot-testing,rostechnadzor,nmo}-registry*.service.ts`) — врезка хелпера; `eisot-testing-registry.service.test.ts` + `nmo-registry.service.test.ts` — +1 >1000-regression каждый. **Миграций нет** (последняя остаётся 0052).
- **Тест-статус (изолированные прогоны, Cyrillic-path fallback):** 6 затронутых suite — **31/31 green**; `tsc --noEmit` backend clean; ESLint `--max-warnings=0` clean на всех изменённых файлах.

### 5.128 Завершение пагинации: ФРДО-экспортёр (5-й из 5) + его >1000-regression

- **Контекст:** коммит §5.127 (`b81b647`) озаглавлен «all 5 exporters», но по факту в него вошли только **4** сервиса (ОТ/ЕИСОТ/Ростехнадзор/НМО) + хелпер; правка `frdo-registry.service.ts` осталась незакоммиченной в рабочем дереве, и у ФРДО не было >1000-regression (в отличие от NMO/ЕИСОТ). Этот шаг закрывает 5-й.
- **Что сделано:** `frdo-registry.service.ts` переведён на `collectAllPages(...)` через `offset`/`limit` — **байт-в-байт** тот же паттерн, что у уже слитого NMO-твина (оба источника = `listIssuedDocuments`, возвращает `{ items, total }`, дефолтит `limit=total`). Добавлен >1000-regression в `frdo-registry.service.test.ts`: 1500 выданных сертификатов за offset/limit-пейджером → `exported === 1500`, `frdoRegistryRecords` 1500, `listIssuedDocuments` вызван **дважды** (offset 0 → offset 1000). Хелпер-мок `makeHarness` теперь честно режет `slice(offset, offset+limit)` (безвреден для существующих коротких входов).
- **Природа truncation у ФРДО:** как и NMO — де-факто строки не терялись (`listIssuedDocuments` без `limit` отдаёт `limit=total`); фикс defensive + future-proof и приводит ФРДО к единообразию с 4 другими.
- **Files changed:** `frdo-registry/frdo-registry.service.ts` (врезка `collectAllPages`), `frdo-registry/frdo-registry.service.test.ts` (+1 >1000-regression, пагинирующий мок-харнесс). **Миграций нет.**
- **Тест-статус:** `frdo-registry.service.test.ts` **4/4 green**; `tsc --noEmit` backend clean; ESLint `--max-warnings=0` clean на обоих файлах.

### 5.129 Phase 6 — provider-agnostic e-signature seam (НЭП, dormant)

- **Контекст:** последняя незакрытая инженерная часть Phase 6 — подпись документов. Предварён проработкой (3 параллельных research-агента: код / право РФ / провайдеры) и решением владельца: **юр-модель = гибрид НЭП(документы)+КЭП(выгрузки)**; **реализация = provider-agnostic по AV-паттерну** (КриптоПро адаптером позже). См. план [`docs/superpowers/plans/2026-06-15-phase-6-esign-provider-seam.md`](docs/superpowers/plans/2026-06-15-phase-6-esign-provider-seam.md) (9 задач TDD, subagent-driven, two-stage review per task + финальное холистическое ревью). Ветка `feat/2026-06-15-phase-6-esign-provider-seam`.
- **Что сделано:** `DocumentSignatureProvider`-интерфейс + `NoopDocumentSignatureProvider` + DI-токен `DOCUMENT_SIGNATURE_PROVIDER` (зеркало `AntivirusScanner`); env-флаги `ESIGN_ENABLED`/`ESIGN_PROVIDER`/`ESIGN_SIGNER_NAME` (dormant, кастомный boolean-парс как `ANTIVIRUS_ENABLED`); 6 полей подписи на `GeneratedDocumentEntity` (`signatureStatus/signedAt/signedBy/signatureProvider/signatureRef/signatureCertificateSubject`, **без миграции** — jsonb-снимок); опциональная 6-я инъекция провайдера в `DocumentsService` (back-compat все 3-арг call-sites) + приватный `applySignature` (**fail-soft**: ошибка провайдера → `status='failed'`, финализация НЕ откатывается) вызван из `finalizeDocument` + публичный `signDocument` (ручное/повторное подписание, гарды archived/revoked/!isFinal); фабрика `DOCUMENT_SIGNATURE_PROVIDER` в `DocumentsModule` (Noop даже при `ESIGN_PROVIDER=cryptopro` + warn — прод не поверит, что подписано); миграция **0053** право `documents.sign` (platform_admin/tenant_admin/methodist); endpoint `POST /documents/:id/sign` под `documents.sign`; frontend `LearnerDocument.signatureStatus?` (тип-готовность).
- **Холистическое ревью поймало IMPORTANT:** `signDocument` мог подписать **отозванный** документ (`revokeDocument` оставляет `isFinal=true` → гард `!isFinal` его не ловит) → добавлен гард `status==='revoked'` + тест. Также doc-комментарий активации (`ESIGN_SIGNER_NAME` для будущего CryptoPro-адаптера).
- **Контроллер-решения по скоупу:** issue ревьюера «выровнять форму `BadRequestException`» отклонён — объектная `{code,message}` корректна по CLAUDE.md, legacy-строка в `finalizeDocument` не трогалась. Backend `LearnerDocumentDto` пока НЕ пробрасывает `signatureStatus` (поле фронта dead до активации) — намеренно отложено как шаг активации.
- **Files changed:** create `infrastructure/document-signature/document-signature.provider.ts` (+ test); modify `env.schema.ts` (+ `env.esign.test.ts`); modify `documents.types.ts` (+test), `documents.service.ts` (+test), `documents.module.ts`, `documents.controller.ts` (+ `documents.http.integration.test.ts`); create migration `0053_iam_documents_sign_permission.sql` (+ `migrations.0053.test.ts`); modify `learner-documents/types.ts` (+test).
- **Тест-статус:** backend-кластер **209/209** (document-signature, env.esign, documents.service **52**, http.integration **15**, types, migration 0053, + все pre-existing documents), frontend learner-documents **6/6**, `pnpm typecheck` **8/8**, ESLint clean. **Остаток Phase 6 (follow-up):** реальный КриптоПро-адаптер (CSP+КриптоАРМ SDK), КЭП-подпись файлов выгрузок в реестры, юр-оформление (оферта/Положение об ЭДО), проброс `signatureStatus` через `LearnerDocumentDto` + UI-бейдж, ops (сертификат УЦ ФНС + `ESIGN_ENABLED=true`). Ожидает PR.

### 5.130 ЕСИА (Госуслуги) — вход + идентификация через provider-agnostic OAuth seam (dormant)

- **Контекст:** реализация отложенной задачи Phase 4 «OAuth-интеграция с ЕСИА». Полный цикл brainstorming → spec → plan → subagent-driven (two-stage review per группу задач + финальное холистическое ревью + fix-цикл). Ветка `feat/2026-06-16-esia-oauth-login-identity`. Спек [`docs/superpowers/specs/2026-06-16-esia-oauth-login-identity-design.md`](docs/superpowers/specs/2026-06-16-esia-oauth-login-identity-design.md), план [`docs/superpowers/plans/2026-06-16-esia-oauth-login-identity.md`](docs/superpowers/plans/2026-06-16-esia-oauth-login-identity.md). Решения владельца: объём **C (оба потока)**; вход **только «свои» по СНИЛС** (decision A — аккаунт НЕ создаётся для незнакомца); идентификация **авто-зачёт**; реализация **① спящий шов + mock** (по AV/esign-паттерну).
- **Что сделано:** provider-seam `EsiaIdentityProvider` + `NoopEsiaProvider`/`MockEsiaProvider`/`EsiaOidcProvider`(каркас, ГОСТ-подпись = follow-up) + токен `ESIA_IDENTITY_PROVIDER` + фабрика по `ESIA_ENABLED`/`ESIA_PROVIDER` в `MvpModule`; env `ESIA_*` (dormant, кастомный boolean-парс); HMAC-подписанный self-contained `state` (`esia-state.ts`); `EsiaService` (request-scoped: `startAuthorize`/`resolveLoginUser`/`approveIdentity`/`peekPurpose`); `EsiaController` (`GET /auth/esia/authorize` — login; `POST /auth/esia/identity/authorize` — identity, bearer; `GET /auth/esia/callback`); новые публичные методы `MvpService`: `findLearnersBySnils`/`approveIdentityViaEsia`/`linkLearnerToIamUser`/`getLinkedLearnerForUser`; `IdentityVerification.method` += `'esia'`; `AuthMethod` += `'esia'` (аудит `auth.esia_login`); вход выдаёт сессию существующим `issueSessionForUser`; идентификация снимает существующий 4-й гейт `assertIdentityVerificationGate`. **Без миграции** (последняя 0053), **без новых прав** (bootstrap-маршруты, как magic-link). Frontend: `NEXT_PUBLIC_ESIA_ENABLED` + кнопка входа (GET `<a href>`) + кнопка идентификации (bearer POST → `window.location`). В деве работает локальный mock-цикл; в проде всё спит.
- **Финальное холистическое ревью поймало ДВА CRITICAL** (классический улов этого этапа): **C1** — `TenantGuard` отклонял `/auth/esia/authorize`+`/callback` с 401 ещё до контроллера (браузерные переходы без Bearer/`x-tenant-id`, не в bootstrap-списке); **C2** — identity-ветка callback зависела от `context.userId`, которого при редиректе от Госуслуг нет (только cookie) → поток идентификации был мёртв. **Фикс (редизайн):** callback сделан **полностью state-driven** — `tenantId` и (для identity) `learnerId` едут внутри подписанного `state`, не из guard-контекста; identity инициируется **аутентифицированным SPA через POST с Bearer** (штатный guard резолвит `userId`), который запекает linked-`learnerId` в state; login остаётся неаутентифицированным GET; `TenantGuard` получил exemption для `/auth/esia/*`. Плюс IMPORTANT-hardening: слабый дефолт `ESIA_STATE_SECRET` теперь отклоняется в прод/strict-профиле (зеркало SCORM-секрета); снят случайный UTF-8 BOM в начале `mvp.service.ts`. Повторное ревью фикса: **READY TO MERGE** (оба CRITICAL закрыты, новой дыры нет, IAM-регресс не затронут); MINOR (нет HTTP-теста на отказ неаутентифицированного `identity/authorize`) закрыт прямым юнит-тестом контроллера `esia.controller.test.ts`.
- **Files changed:** create `infrastructure/esia/{esia-identity.provider,mock-esia.provider,esia-oidc.provider,esia-state}.ts` (+ тесты); `modules/mvp/esia/{esia.service,esia.controller}.ts` (+ `esia.service.test.ts`, `esia.controller.test.ts`, `esia.http.integration.test.ts`); modify `env.schema.ts` (ESIA\_\* + strict-reject) (+ `env.esia.test.ts`); `common/guards/tenant.guard.ts` (esia exemption) (+ `tenant.guard.esia.test.ts`); `modules/mvp/mvp.service.ts` (4 публичных метода + снятие BOM) (+ `esia-identity.service.test.ts`, `test-support/make-mvp-service.ts`); `modules/mvp/mvp.types.ts` (`method` += esia); `modules/iam/services/auth.service.ts` (`AuthMethod` += esia) (+ `auth-esia-method.test.ts`); `modules/mvp/mvp.module.ts` (проводка); frontend `lib/config/env.ts`, `features/auth/esia-login-button.tsx` (+test) + `magic-link-form.tsx`, `features/identity-verification/{api.ts,screens.tsx}`.
- **Тест-статус:** изолированные прогоны зелёные — ЕСИА+guard+env кластер **31+** (env.esia 3, provider/mock/oidc/state, esia.service 5, esia-identity.service 6, esia.controller 3, tenant.guard.esia 3, esia.http.integration 1 dormant-503), IAM-регресс **10/10** не затронут, frontend esia-login-button 3 + identity-регресс, `pnpm typecheck` 8/8, ESLint clean. **As-built отклонение от исходной спеки** (state-driven callback + SPA-POST identity) зафиксировано в спеке §13. **Остаток (активация, follow-up):** реальный КриптоПро-ГОСТ-адаптер в `EsiaOidcProvider`; статус ИС + мнемоника + зарегистрированные `redirect_uri`; сертификат УЦ ФНС; `ESIA_ENABLED=true`/`ESIA_PROVIDER=esia` + `ESIA_*` URLs + сильный `ESIA_STATE_SECRET`; прогон на `esia-portal1.test.gosuslugi.ru`. Ожидает PR.

### 5.131 Phase 6 — проброс `signatureStatus` end-to-end + prod-guarded fake staging-signer

- **Контекст:** активация одного из follow-up-остатков §5.129 на уровне кода. Закрывает «висящий провод»: поля подписи писались на `GeneratedDocumentEntity`, но **никем не читались** — кабинет слушателя и публичная QR-проверка их не показывали; плюс добавлен DI-выбираемый **staging-signer** для owner-facing превью без КриптоПро. Полный цикл: writing-plans → subagent-driven (implementer + spec-review + code-quality-review per task) + финальное холистическое ревью. Ветка `feat/2026-06-17-document-signature-status-passthrough` (от `origin/main`), **PR #259 (слит)**. План [`docs/superpowers/plans/2026-06-17-document-signature-status-passthrough.md`](docs/superpowers/plans/2026-06-17-document-signature-status-passthrough.md) (5 задач TDD).
- **Что сделано:** (1) backend `LearnerDocumentDto.signatureStatus?` (тип `DocumentSignatureStatus`, не inline-литерал — поймано code-review) + `export`+маппинг `mapDocumentToLearnerDto` (conditional spread под `exactOptionalPropertyTypes`); (2) frontend чистый `signatureBadgeLabel` + бейдж в `documents-list.tsx` — **plain `<span>`, НЕ второй `StatusChip`** (StatusChip мапит `signed`→«Подписан» в lifecycle-словаре — неверно для НЭП-контекста, подтверждено code-review); (3) `PublicVerifyResult.signatureStatus?: 'signed'` (**сужено** до литерала — `failed`/`unsigned` не утекают на публичную страницу) + `signatureCertificateSubject?` + проекция в `verifyDocumentByQrToken` только для подписанных; (4) **Задача 4 уже была покрыта** — блок `DocumentsService signing (Phase 6)` в `documents.service.test.ts` уже тестирует весь fail-soft/retry/guard путь `applySignature` через `StubSignatureProvider` (посылка плана была ошибочной; субагентская верификация поймала — дублей не добавлено); (5) `FakeDocumentSignatureProvider` (синтетический `signed`, self-маркировка `fake-sig://`+«STAGING, не криптоподпись») + `ESIGN_PROVIDER` enum += `'fake'` + env-refinement **запрещает `fake` в `NODE_ENV=production`** (staging намеренно разрешён — owner preview env) + фабрика `DocumentsModule` выбирает fake первой веткой при `ESIGN_ENABLED && ESIGN_PROVIDER='fake'`.
- **Решение по `staging`:** code-quality-review предложил расширить гард до `isStrictProfile` (блокировать и staging) как «security gap». **Отклонено с обоснованием** (technical rigor, не слепое согласие): назначение fake — owner-facing превью в _развёрнутом_ окружении (staging), fake-подпись видимо самопомечена везде, а прод-граница герметична независимо (двунаправленное `DEPLOYMENT_PROFILE=prod ⟺ NODE_ENV=production` → реальный прод всегда `NODE_ENV=production`). Решение задокументировано комментарием в `env.schema.ts` + **протестировано** позитивным тестом «fake allowed in staging» (`DEPLOYMENT_PROFILE=staging`).
- **Финальное холистическое ревью (SHIP, 0 Critical/Important):** подтвердило ключевой стык — MVP-модуль НЕ держит свою копию документов, а делегирует в `DocumentsService.listDocuments` (тот же `GeneratedDocumentEntity`, что мутирует `applySignature`) → бейдж **реально загорится** для подписанного документа (не мёртвая фича); 6 полей подписи **переживают персистентность** (оба backend'а сериализуют объект целиком, без allowlist); прод-гард без лазеек; кабинет и публичная проверка согласованы. Единственный Minor — у класса бейджа нет CSS-правила (фича вовсе без стилей — оставлено follow-up).
- **Files changed:** modify `modules/mvp/mvp.service.ts` (DTO+export+map) (+ `learner-document-dto.test.ts`); frontend create `features/learner-documents/signature-badge.ts`, modify `documents-list.tsx` (+ `learner-documents.test.ts`); modify `modules/documents/documents.service.ts` (PublicVerifyResult+проекция) (+ `documents.service.test.ts`); create `infrastructure/document-signature/fake-document-signature.provider.ts` (+ test); modify `env.schema.ts` (enum+refinement) (+ `env.esign.test.ts`); modify `modules/documents/documents.module.ts` (фабрика).
- **Тест-статус:** backend-кластер **65/65** (documents.service 54, env.esign 6, learner-document-dto 2, fake-signature 1, noop-signature 2), frontend learner-documents **9/9**, `pnpm typecheck` **8/8**, ESLint clean. **Без миграции** (последняя 0053), **без новых прав**. **Остаток Phase 6 (follow-up):** реальный КриптоПро-адаптер (свап fake/cryptopro-ветки фабрики), КЭП-подпись файлов выгрузок в реестры (см. §5.132 ниже), юр-оформление, ops (сертификат УЦ ФНС + `ESIGN_ENABLED=true`/`ESIGN_PROVIDER=cryptopro`), опц. CSS-правило бейджа.

### 5.132 Phase 6 — КЭП-подпись файлов выгрузок (provider-agnostic seam, dormant)

- **Контекст:** вторая половина гибридной модели владельца (НЭП на документы + **КЭП на выгрузки** в госреестры). До этого 5 экспортёров (ФРДО/ОТ/ЕИСОТ/Ростехнадзор/НМО) отдавали **неподписанные** XLSX. Полный цикл brainstorming → spec → plan (9 задач) → subagent-driven (4+4 параллельных субагента на интеграционные этапы) + inline-эталон. Ветка `feat/2026-06-17-export-kep-signature-seam`, **PR #260**. Спек [`docs/superpowers/specs/2026-06-17-export-kep-signature-seam-design.md`](docs/superpowers/specs/2026-06-17-export-kep-signature-seam-design.md), план [`docs/superpowers/plans/2026-06-17-export-kep-signature-seam.md`](docs/superpowers/plans/2026-06-17-export-kep-signature-seam.md). Зеркалит document-signature seam (§5.129/§5.131) и AV-паттерн, но семантика — **detached** `.p7s` (CMS/PKCS#7) над байтами файла (не встроенный PDF-штамп НЭП).
- **Что сделано:** новый seam `infrastructure/export-signature/` — интерфейс `ExportSignatureProvider` (`sign({tenantId,fileId,content})→{status,signatureContent?,certificateSubject?}`) + `NoopExportSignatureProvider` (default → `unsigned`) + `FakeExportSignatureProvider` (staging, синтетический `.p7s`, self-маркирован «не криптоподпись») + токен `EXPORT_SIGNATURE_PROVIDER`; env `EXPORT_SIGN_ENABLED`/`EXPORT_SIGN_PROVIDER('noop'|'cryptopro'|'fake')`/`EXPORT_SIGN_SIGNER_NAME` (dormant, кастомный boolean-парс) + **prod-guard рефайнмент** (`fake` запрещён при `NODE_ENV=production`, разрешён в staging); общий orchestrator `signExportArtifact` (**fail-soft**: сбой провайдера/хранилища → `signatureStatus:'failed'`, не откатывает уже сохранённую выгрузку; хранит `.p7s` соседним файлом `${storageKey}.p7s` через `files.register`+`storage.putObject`); 3 опц. поля (`signatureStatus`/`signatureFileId`/`signatureCertificateSubject`) на каждом из 5 `*Batch` + 2 на 5 `*ExportOutcome` (**без миграции** — JSON-снимки MVP); фабрика в `MvpModule` (Noop даже при `cryptopro`+warn; Fake при `EXPORT_SIGN_PROVIDER=fake`); инъекция провайдера опц. последним аргументом в 5 request-scoped экспортёров + вызов `signExportArtifact` сразу после `batch.fileId=meta.id`; endpoint `GET …/exports/:id/signature` (под существующим `regulatory.export.read`, **без нового права**) + сервис-метод `getBatchSignatureUrl` на 5 контроллерах; frontend — чистый `exportSignatureBadgeLabel` + колонка «Подпись» в 5 таблицах `gov-export` + поля на 5 frontend-типах.
- **Находки/решения:** (1) Семантика `fake`+prod-guard переиспользует подход §5.131, но это **отдельный** seam (другой сертификат/назначение: detached КЭП на госреестр-файлах vs встроенный НЭП-штамп на документе слушателя). (2) Найден **пред-существующий баг на main**: тест `env.test.ts` «parses production env…» был красным, т.к. PR #258 (ЕСИА) добавил strict-проверку `ESIA_STATE_SECRET` без обновления фикстуры `strictValidEnv` → заведён+слит follow-up `fix/2026-06-17-env-test-esia-state-secret` (**PR #261**). Мой `env.export-sign.test.ts` также обходит это собственной prod-фикстурой с non-dev `ESIA_STATE_SECRET`. (3) `outcome.signatureStatus` намеренно несёт и `'unsigned'` (стамп ставится всегда при наличии файла) — бейдж всё равно даёт `null` для unsigned.
- **Files changed:** create `infrastructure/export-signature/{export-signature.provider,fake-export-signature.provider,sign-export-artifact}.ts` (+3 теста); modify `env.schema.ts` (+`env.export-sign.test.ts`); `mvp.types.ts` (+`export-signature-batch-fields.test.ts`); `mvp.module.ts`; 5× `{frdo,ot,eisot-testing,rostechnadzor,nmo}-registry/*.{service,controller}.ts` (+ их `.service.test.ts`); frontend `features/gov-export/{export-signature-badge.ts,types.ts}` (+badge-тест) + `app/gov-export/page.tsx`.
- **Тест-статус:** объединённый backend-прогон затронутых сюит **31 файл / 114 тестов passed**; per-service паритет-тесты (signed-with-fake + unsigned + sig-download×2): ФРДО 8, ОТ 14, ЕИСОТ 7, Ростехнадзор 9, НМО 10; infra/env/batch-fields зелёные; frontend gov-export 12 (badge 3 + contract); **монорепо `pnpm typecheck` 8/8**; ESLint clean. **Остаток (активация, follow-up):** реальный КриптоПро-адаптер за `EXPORT_SIGNATURE_PROVIDER` (CSP+SDK, detached CMS); подпись XML-вариантов ОТ (сейчас подписывается тот `buffer`, что отдан — xlsx или xml); юр-оформление КЭП юрлица; ops (сертификат УЦ ФНС + `EXPORT_SIGN_ENABLED=true`/`EXPORT_SIGN_PROVIDER=cryptopro`).

### 5.133 Phase 7 — provider-agnostic payment seam (dormant foundation)

- **Контекст:** первая итерация Phase 7 «Оплаты» (роадмап; платежей НЕТ в подписанном `SDOPROF_TZ_FINAL.md` → свобода в глубине). Владелец выбрал **фундамент-шов** (provider-agnostic dormant, деньги не двигаются) по паттерну последних 4 интеграций (AV→esign→export-sign→ЕСИА). Решения brainstorming: B2C self-serve **+** admin-driven; заказ с позициями (line items, 1 ученик = 1 позиция, N = bulk); durable Postgres + миграция; подход A (шов + **ручная отметка безнала** + Noop/Fake провайдеры). Полный цикл brainstorming → spec → plan (15 задач) → subagent-driven (implementer + spec/quality review per task) + финальное холистическое opus-ревью. Ветка `feat/2026-06-20-phase-7-payment-provider-seam`. Спек [`docs/superpowers/specs/2026-06-20-phase-7-payment-provider-seam-design.md`](docs/superpowers/specs/2026-06-20-phase-7-payment-provider-seam-design.md), план [`docs/superpowers/plans/2026-06-20-phase-7-payment-provider-seam.md`](docs/superpowers/plans/2026-06-20-phase-7-payment-provider-seam.md).
- **Что сделано:** новый модуль `modules/payments/` (изолирован от раздутого `MvpService`). Seam `infrastructure/payments/`: `PaymentProvider` (`createPayment`/`parseWebhook`) + `NoopPaymentProvider` (default → `disabled`/`null`) + `FakePaymentProvider` (staging, синтетический `confirmationUrl`+webhook, **prod-guard**) + токен `PAYMENT_PROVIDER`; env `PAYMENTS_ENABLED`/`PAYMENTS_PROVIDER('noop'|'yookassa'|'fake')`/`PAYMENTS_CURRENCY('RUB')` (dormant, кастомный boolean-парс, prod-guard на `fake`). **Миграция 0054** (схема `payments`: `orders`/`order_items`/`payments`; деньги — **integer-копейки**/bigint; partial-unique на `provider_payment_id`; права `payments.read`/`payments.write`/`payments.self_purchase`). Машины состояний (`Order: draft→awaiting_payment→paid→fulfilled`/`cancelled`; `Payment: pending→succeeded`/…). Durable dual-backend репозиторий (interface + in-memory + postgres, зеркало recertification). `PaymentsService` (createOrder/list/get, **pay** через провайдер с ownership-guard, **markPaid** = ручная отметка безнала, cancel). `PaymentFulfillmentService` (идемпотентный fail-soft: `paid` → группировка позиций по `groupId` → зачисление → `fulfilled`). Контроллеры: guarded `PaymentsController` (8 endpoints, permission-boundaries) + **unguarded** `PaymentsWebhookController` (тенант из строки платежа по `provider_payment_id`, зеркало `PublicVerifyController`). Frontend: feature `features/payments/` + `/admin/orders` (создание/mark-paid/cancel) + `/learner/payments` (история + «Оплатить») + навигация + e2e.
- **Девиация (важно):** spec моделировал позицию заказа по `course_version_id`, но реальный примитив зачисления — **`group_id`** (`MvpService.createBulkEnrollments` принимает `groupId`; ученик зачисляется в группу-когорту). Поймано имплементером Task 10 → сквозной рефактор `course_version_id`→`group_id` (миграция+типы+DTO+репо+fulfillment+frontend). Позиция = пара `(group, learner)`.
- **CRITICAL (поймано финальным холистическим opus-ревью, исправлено):** `PaymentFulfillmentService` инжектил **request-scoped `MvpService`** и звал `createBulkEnrollments` напрямую, но платёжные контроллеры **не применяют** `MvpRequestPersistenceInterceptor` → `MVP_STATE` пуст → каждый ученик NotFound → **ноль зачислений, но заказ помечался `fulfilled`** (тихий сбой; писаное состояние терялось — нечем сохранять). Бьёт оба пути (mark-paid реален в проде; webhook — staging/future). **Фикс** (ровно `reference_mvp_tenant_runner_modes.md`): новый экспортируемый **singleton** `MvpEnrollmentService` в `MvpModule` гоняет `createBulkEnrollments` внутри `MvpTenantRunner.runWithTenantStateAndSave` (гидратация tenant-state из Postgres → мутация → сохранение, под реентрантным per-tenant-локом), строя `MvpService` поверх загруженного state (verified: `createEnrollment` трогает только state/audit/events/tenantRepo — НЕ documents/files, поэтому те два конструктор-аргумента не нужны). `PaymentFulfillmentService` снова чистый singleton. Ключевой тест `mvp-enrollment.service.test.ts` поднимает **реальный** runner над `MemoryMvpPersistenceBackend` с засеянными группой+учеником и проверяет, что зачисление создано **И сохранено**.
- **Остаток (pre-activation follow-up, НЕ блокеры dormant-итерации):** (1) реальный **ЮKassa-адаптер** за `PAYMENT_PROVIDER` (createPayment + HMAC-verify webhook); (2) **`rawBody` в `main.ts`** (`NestFactory.create(…, { rawBody: true })`) — нужен реальному ЮKassa для верификации подписи над сырыми байтами; сейчас Noop/Fake парсят JSON-фолбэк, ок для dormant/staging; (3) `POST /orders/:id/pay` намеренно только под `payments.self_purchase` (админ использует mark-paid; spec-таблица упоминала «write/self_purchase» — сужено осознанно); (4) отложено отдельными spec'ами: чек 54-ФЗ/ОФД, счёт/акт PDF (B2B, documents-pipeline), checkout-лендинг B2C, возвраты/рефанды (`refunded` зарезервирован).
- **Тест-статус:** backend payments **10 файлов / 46 тестов passed** (providers 5, env 4, dto 6, state-machine 4, in-memory repo 4, fulfillment 3, service 8, http.integration 10, + mvp-enrollment 2); frontend **16** (api.contract 3 + e2e 13); **монорепо `pnpm typecheck` 8/8**; ESLint clean. Миграции до **0054**.
- **Статус:** **слит — PR #262** (squash `22d62b3`, 2026-06-20), feature-ветка закрыта. Phase 7 открыт на уровне кода-шва (dormant); остаток = активация платежей (см. follow-up выше).

### 5.134 Phase 8 — provider-agnostic webinar seam (dormant, multi-provider + per-tenant)

- **Контекст:** первая итерация Phase 8 «Вебинары» (роадмап; ТЗ §5.17 упоминает создание/участники/приглашения). В `modules/communication` уже была **ранняя CRUD-заглушка** вебинаров (таблицы `communication.webinars`/`webinar_participants` с миграции **0007**, с полями провайдера и посещаемости — все не использовались; контроллер без прав и без DTO-валидации). Эта итерация оживляет шов поверх готовой схемы по dormant-seam паттерну последних 5 интеграций. **Поправка владельца по ходу brainstorming:** Pruffme НЕ основной — нужен **мульти-провайдер** + **выбор per-tenant** («своё» = самохостинг open-source, не видеодвижок с нуля). Ветка `feat/2026-06-20-phase-8-webinar-provider-seam`. Спек [`docs/superpowers/specs/2026-06-20-phase-8-webinar-provider-seam-design.md`](docs/superpowers/specs/2026-06-20-phase-8-webinar-provider-seam-design.md), план [`docs/superpowers/plans/2026-06-20-phase-8-webinar-provider-seam.md`](docs/superpowers/plans/2026-06-20-phase-8-webinar-provider-seam.md) (18 задач TDD, subagent-driven). Полный цикл brainstorming → spec → plan → subagent-driven (имплементер пачками + spec/quality review на backend + финальное холистическое ревью).
- **Ключевое отклонение от платёжного эталона (осознанное):** платежи — один способ оплаты на инсталляцию (одиночный DI-токен `PAYMENT_PROVIDER`); вебинары — **реестр стратегий `WEBINAR_PROVIDER_REGISTRY` + per-tenant `WebinarProviderResolver`**. Env (`WEBINARS_ENABLED`) больше НЕ выбирает провайдера — лишь включает подсистему; **какой** провайдер берётся из настроек тенанта. Поэтому **prod-guard на `fake` живёт в резолвере**, а не в env-refinement (env не знает per-tenant провайдера).
- **Что сделано:** seam `infrastructure/webinar-provider/`: `WebinarProvider` (`createSession`/`parseWebhook` + `code`) + `NoopWebinarProvider` (default) + `FakeWebinarProvider` (staging, self-mark `fake-webinar://`) + `JitsiWebinarProvider` (каркас самохостинг-«своего», `null`+warn) + токен реестра. `WebinarProviderResolver.forTenant` (3 гейта: глобальный `WEBINARS_ENABLED` → per-tenant `enabled`/`code` → prod-guard `fake`, иначе Noop). Per-tenant настройки: `webinar-provider-settings.{repository(interface),service}` + in-memory + postgres (ALLOW_IN_MEMORY_STATE-фабрика). **Миграция 0055** (права `webinars.read`/`write`/`attend`/`configure` + таблица `communication.webinar_provider_settings` (несекретный конфиг) + partial-index на `provider_session_id`; **без изменений таблиц 0007**). `WebinarsService` дополнен: fail-soft `create` (резолв провайдера → `createSession`, сбой/`null` не валит создание), `listMine`, `recordAttendance`, `findByProviderSessionId`. Репозиторий расширен `findByProviderSessionId` + `upsertParticipantAttendance` (по learner_id/user_id, coalesce). Контроллер **подтянут к конвенциям**: `@RequirePermissions` на каждый эндпоинт + `assertValidDto` + `/webinars/mine` (`webinars.attend`) + `GET/PUT /webinars/provider-settings` (`webinars.configure`). **Unguarded `WebinarsWebhookController`** (`POST /webinars/webhook`, тенант ИЗ строки вебинара по `provider_session_id`, зеркало `PaymentsWebhookController`, throttle 60/мин). Frontend: feature `features/webinars/` (types/api/hooks/screens/api.contract) + `/admin/webinars` + `/admin/webinars/settings` + `/learner/webinars` + навигация (снят generic `tenant.read` → `webinars.*`) + e2e; **снесён legacy** `app/webinars/page.tsx` + `src/lib/communication/webinars-api.ts`.
- **CRITICAL/IMPORTANT-улов (самостоятельным/холистическим ревью):** (1) **порядок routeMeta** — `resolveRouteMeta` использует `.find` с префиксным матчем; `/admin/webinars` стоял ПЕРЕД `/admin/webinars/settings` → settings наследовал бы `webinars.read` вместо `webinars.configure` (страница настроек провайдера доступна без нужного права). Фикс: специфичный паттерн первым + регресс-тест в e2e (admin с одним `webinars.read` → settings **forbidden**). (2) **мёртвые learner-плитки** на `app/page.tsx` + `features/mvp/screens.tsx` указывали на снесённый `/webinars` → переадресованы на `/learner/webinars`. Backend-ревью отдельным агентом — **SHIP** (5 проверок безопасности PASS: кросс-tenant webhook, prod-guard, fail-soft, порядок маршрутов, миграция). Финальное холистическое ревью (backend+frontend) — **SHIP**, 0 Critical/Important.
- **Остаток (pre-activation follow-up, НЕ блокеры dormant-итерации):** (1) реальные адаптеры за реестром — **самохостинг Jitsi** (createRoom + JWT + HMAC-webhook), при желании Pruffme/Zoom/BBB; (2) `rawBody:true` в `main.ts` для верификации подписи реального провайдера (Noop/Fake парсят JSON-фолбэк); (3) **посещаемость → вебинар-часы/завершение** (кросс-модульная проводка `communication`→`mvp` — намеренно отложено, самый рисковый класс сцепки); (4) per-tenant секреты провайдера (secret-ref/шифрование); (5) записи/.ics/напоминания (переиспользовать Phase 5 `NotificationDispatcher`).
- **Тест-статус:** backend вебинары **12 файлов / 37 тестов** (provider 9, env 3, migration 3, resolver 5, settings-service 2, in-memory settings-repo 3, in-memory state 2, dto 4, service 4, http.integration 2); frontend **16** (api.contract 3 + e2e 13); **монорепо `pnpm typecheck` 8/8**; ESLint clean. Миграции до **0055**. **Ожидает PR.**

### 5.135 Issue 4 — свежая БД накатывает всю цепочку миграций из коробки (edit-in-place + full-chain тест)

- **Запрос:** закрыть оставшиеся пункты 1–2 §13 Issue 4 — цепочка `apps/backend/migrations/0001→latest` (56 файлов) не накатывалась на свежий Postgres (раннер `DatabaseService.runMigrations` исполняет все `*.sql` по порядку и падал посередине). Маскировалось in-memory-доменом + hand-patched dev-БД; полный путь не тестировался нигде (тесты накатывают подмножества через `with-test-db`).
- **Контекст:** brainstorming → spec → plan → inline-реализация по TDD. Спека `docs/superpowers/specs/2026-06-20-migration-chain-fresh-bootstrap-design.md`, план `docs/superpowers/plans/2026-06-20-migration-chain-fresh-bootstrap.md`. Ветка `fix/2026-06-20-migration-chain-fresh-bootstrap`.
- **Решение (вариант A — edit-in-place, НЕ consolidated-baseline):** правка сломанных файлов на месте безопасна — **БД нигде не развёрнута** (подтверждено владельцем), поэтому записанных checksum'ов сохранять не нужно. Раннер и checksum-механизм не тронуты.
- **Главный артефакт — full-chain тест** [migration-bootstrap.full-chain.test.ts](apps/backend/src/infrastructure/database/migration-bootstrap.full-chain.test.ts): поднимает выделенный свежий `postgres:16` testcontainer, накатывает ВСЕ миграции по порядку (зеркало `runMigrations`), проверяет (1) чистое применение + count == числу файлов, (2) наличие всех схем, (3) идемпотентный повтор (no-op). Это и был инструмент итерации, и постоянный страж регрессий. Gated `describe.skipIf(!isDockerAvailable())`. **NB Windows:** `fs.existsSync` на docker named-pipe ненадёжен → локально запускать с `DOCKER_HOST=npipe:////./pipe/docker_engine`; CI (Linux-сокет) гоняет нативно.
- **6 поломок (эмпирически найдены прогоном, не по догадкам):**
  1. **0003** — второй `ALTER TABLE storage.files` повторно дропал `files_tenant_id_id_uniq` (создан первым блоком), drop падал из-за FK-зависимостей → удалены 2 избыточные строки.
  2. **0004** — `esign_applications`/`signing_processes`/`signing_participants` с `id`-only PK, но композитные `(tenant_id,id)` FK → добавлен `UNIQUE (tenant_id,id)` в каждую.
  3. **0015** — 9 `COMMENT ON INDEX` с неквалифицированным именем; индексы в схемах `documents`/`integrations`/`core` (не на search_path) → квалифицированы.
  4. **0016** — 3 осиротевших `COMMENT ON COLUMN ...payload` на таблицах, созданных раньше (0005/0009) без `payload` (0013-версии = no-op из-за `create table if not exists`) → удалены.
  5. **0032** — (a) CHECK на `templates.template_type`, но канон — `document_type` (создан в 0002; `template_type` лишь в no-op 0005) → переименовано; (b) CHECK на `template_variables.category_code`, которой 0002 не создал (0005-версия no-op) → `ADD COLUMN IF NOT EXISTS category_code` перед CHECK.
  6. **0036** — `ALTER TABLE mvp.learners`, но схемы `mvp` нет (learners в `learning`) → `learning.learners`.
- **Паттерн-первопричина большинства:** коллизия «0002/0005/0009 создают таблицу → 0013 повторяет `create table if not exists` с другой/дополненной схемой = no-op» → поздние миграции (0016/0032) ссылались на «0013-колонки», которых в живой таблице нет.
- **Каждый правленый файл** получил self-documenting header-комментарий (дата/Issue 4/почему/«safe: no DB deployed»).
- **Внимание для следующего агента:** правка исторических файлов поменяла их checksum'ы → **локальную dev-БД пересоздать с нуля** (теперь `runMigrations` накатит всю цепочку начисто — это и есть end-to-end доказательство). Никакие развёрнутые БД не затронуты (их нет).
- **Files changed:** `migrations/{0003,0004,0015,0016,0032,0036}_*.sql` (правки), `src/infrastructure/database/migration-bootstrap.full-chain.test.ts` (новый), спека + план. **Новых миграций нет** (последняя 0055), раннер/checksum не тронуты.
- **Тест-статус:** full-chain тест **3/3 green** (все 56 применяются, все схемы, идемпотентность); существующие migration-suite (`migration-integrity` + `migrations.0033/0034`) **7/7**; **`pnpm typecheck` 8/8**; ESLint clean. **Ожидает PR.**

### 5.136 Deploy-readiness аудит — образы не бутятся «из коробки» (миграции в runtime, prod-env, public/ фронта)

- **Запрос:** «продолжай» → весь код-роадмап V1 (Phase 1–10) реализован на уровне швов (PR #265 слит). Владелец выбрал вектор **«готовность к деплою»**. Цель — найти и закрыть всё, что блокирует первичный подъём пилота на сервере по `infra/docker-compose.prod.yml`. Ветка `fix/2026-06-21-deploy-readiness-image-packaging-and-prod-env` от свежего `main`.
- **Метод:** систематический проход по deploy-артефактам (Dockerfile'ы, `.env.production.example`, `docker-compose.prod.yml`, Caddyfile) + эмпирическая проверка prod-env против **реальной boot-time схемы** (`backendEnvSchema`), а не против более мягкого `scripts/check-env.ts` (который НЕ знает про `DEPLOYMENT_PROFILE`/`SECRETS_PROVIDER`/persistence-драйверы → даёт ложно-зелёный).
- **Блокер 1 (CRITICAL — backend не бутится):** runtime-стадия `apps/backend/Dockerfile` копирует только `dist/` (скомпилированный JS, без `.sql`). Но `DatabaseService.runMigrations` на boot (`DB_MIGRATIONS_ENABLED=true`) читает SQL из `resolveMigrationsDir()` (`/app/migrations` или `/app/apps/backend/migrations`). Каталог миграций в образ не попадал → `Migrations directory not found` → crash-loop → healthcheck не проходит → frontend (`depends_on: backend healthy`) не стартует → весь стек не поднимается. Ирония: PR #265 только что починил саму цепочку миграций, но прод-образ её физически не видел. **Фикс:** `COPY --from=build /app/apps/backend/migrations ./apps/backend/migrations` (кандидат №2 `resolveMigrationsDir`, не зависит от `DB_MIGRATIONS_DIR`). **Регресс-страж:** [dockerfile-migrations-packaging.test.ts](apps/backend/src/infrastructure/database/dockerfile-migrations-packaging.test.ts) — парсит runtime-стадию Dockerfile, требует COPY миграций в путь, который найдёт раннер.
- **Блокер 2 (CRITICAL — backend не бутится): `infra/.env.production.example` даёт невалидный prod-env даже после заполнения всех CHANGE_ME.** Эмпирически — **6** провалов boot-схемы: (1) `VAPID_PUBLIC_KEY=`/`VAPID_PRIVATE_KEY=` заданы пустой строкой (не unset) → `min(1).optional` падает на присутствующем пустом значении; (2) `DEPLOYMENT_PROFILE` unset → дефолт `dev` ⟂ `NODE_ENV=production`; (3) `SECRETS_PROVIDER` unset → дефолт `env`, который схема запрещала в проде; (4) `ESIA_STATE_SECRET` unset → дефолт = dev-значение, отвергаемое в проде (хотя ЕСИА спящая); (5–6) `MVP_PERSISTENCE_DRIVER`/`DOCUMENTS_PERSISTENCE_DRIVER` unset → дефолт `memory`, обязаны быть `postgres`. **Фиксы (5 — в примере):** добавлены `DEPLOYMENT_PROFILE=prod`, явные `MVP/DOCUMENTS_PERSISTENCE_DRIVER=postgres`, `ESIA_STATE_SECRET=CHANGE_ME_GENERATE_HEX`, пустые VAPID-строки закомментированы (unset вместо пустых), `SECRETS_PROVIDER=env` сделан явным с пояснением.
- **Решение владельца (Блокер 2, пункт 3 — security-fork):** схема запрещала `SECRETS_PROVIDER=env` в strict-профилях и требовала `vault`/`kms`. Но провайдеры `vault`/`kms` (`MirroredRemoteSecretProvider`) **читают те же секреты из env** с версионным префиксом (`VAULT_SECRET_AUTH_JWT_V1`) — реального внешнего секрет-менеджера в single-VPS-деплое нет (управляемые сервисы отложены владельцем). Запрет давал ноль изоляции, только трение. **Владелец выбрал: разрешить `env` в проде**, СОХРАНИВ все гарды слабых/dev-секретов. **Фикс:** удалён блок-запрет в [env.schema.ts](apps/backend/src/env.schema.ts) `superRefine` (dev-default/weak-secret гарды остаются для ВСЕХ провайдеров). JWT/session секреты потребляются только через `SecretsService` (`getJwtSigningSecret`), так что смена провайдера — чистый drop-in. Обновлён существующий тест-кейс (кодировал старый запрет) + 2 новых: `env` разрешён в проде с сильными секретами / всё ещё отвергается с dev-дефолтами.
- **Постоянный страж Блокера 2:** [env.production-example.test.ts](apps/backend/src/env.production-example.test.ts) — парсит `infra/.env.production.example`, подставляет CHANGE_ME/YOUR_DOMAIN на сильные стабы, требует чистого `safeParse` против boot-схемы. Поймал бы все 6; ловит любой будущий дрейф (новая обязательная env, реинтродукция strict-нарушения).
- **Блокер 3 (IMPORTANT — PWA-слой ломается, стек поднимается):** `apps/frontend/Dockerfile` (Next `output: 'standalone'`) не копировал `public/`. Там PWA-иконки + сгенерированный Serwist'ом `public/sw.js` (`next.config.ts` `withSerwist` компилит `src/app/sw.ts` → `public/sw.js`). Без копии `/sw.js` и `/icons/*` → 404 → регистрация service worker / web-push (Phase 10C) и инсталляемость PWA молча ломаются. **Фикс:** `COPY --from=build /app/apps/frontend/public ./apps/frontend/public`. **Регресс-страж:** [dockerfile-public-packaging.test.ts](apps/frontend/src/deploy/dockerfile-public-packaging.test.ts).
- **Общая первопричина 1 и 3:** форматы build-вывода намеренно исключают исходные ассеты (`dist/` = только JS; Next `standalone` = только трейснутый сервер) → runtime обязан докопировать сырые ассеты. Невидимо для unit-тестов, всплывает только на реальном подъёме контейнера → потому добавлены file-content стражи Dockerfile'ов.
- **Проверено НЕ блокерами:** `realtime`/`worker` миграции не запускают (не импортируют `DatabaseService`) → отсутствие каталога их не роняет. `.dockerignore` не исключает `migrations`/`public` из build-контекста.
- **Files changed:** `apps/backend/Dockerfile`, `apps/frontend/Dockerfile`, `infra/.env.production.example`, `apps/backend/src/env.schema.ts`, `apps/backend/src/env.test.ts` (+ новые `env.production-example.test.ts`, `infrastructure/database/dockerfile-migrations-packaging.test.ts`, `apps/frontend/src/deploy/dockerfile-public-packaging.test.ts`). **Новых миграций нет** (последняя 0055). Раннер/checksum/SQL не тронуты.
- **Тест-статус:** env-кластер + 3 новых deploy-стража **зелёные** (backend env+deploy 41/41, frontend deploy-страж 1/1); **backend `typecheck` exit 0**, **frontend `typecheck` exit 0**; ESLint clean по всем правленым файлам. **Ожидает PR.**
- **Остаток deploy-readiness (для следующего агента):** при заполнении `.env.production` сгенерировать РЕАЛЬНЫЕ значения для ВСЕХ CHANGE_ME, включая новый `ESIA_STATE_SECRET` и `SCORM_CONTENT_TOKEN_SECRET` (иначе weak-secret/strict-гарды отвергнут boot). Реально собрать оба образа на сервере и проверить healthcheck'и (локально на Cyrillic-пути полный `docker build` не гонялся — фиксы статические/файловые, покрыты стражами). Caddyfile-маршрутизацию (/api/v1, /ws) при подъёме сверить отдельно.

### 5.137 Реальный локальный подъём dev-стека вскрыл boot-блокер: `PaymentsModule` не импортировал `IamModule`

- **Запрос:** «запусти проект» — поднять `pnpm dev:stack` локально. Это и стало эмпирической проверкой деплой-готовности (продолжение §5.136): полный boot приложения, которого тесты не делают.
- **Окружение:** Docker-инфра поднята через `infra/docker-compose.yml` (postgres/rabbitmq/minio/supertokens), redis — отдельным контейнером на порту **6390** (стандартный 6379 занят чужим проектом), `REDIS_URL` локально переопределён под 6390 (gitignored `.env`, в репозиторий не попадает; по окончании возвращён к 6379). Том `infra_rabbitmq-data` пересоздан (битый `.erlang.cookie`/`eacces`).
- **Блокер (CRITICAL — backend не бутится):** NestFactory падал на InstanceLoader: `Nest can't resolve dependencies of the PermissionGuard (Reflector, ?, AuthService) ... IamService ... is not available in the PaymentsModule`. `PaymentsController` навешивает `@UseGuards(PermissionGuard)`; Nest инстанцирует guard в DI-контексте **модуля, владеющего контроллером**, а `PermissionGuard` зависит от `IamService`+`AuthService` (экспорты `IamModule`). `PaymentsModule` (Phase 7, §5.133/PR #262) импортировал `InfrastructureModule, AuditModule, MvpModule`, но **не `IamModule`**. Импорт `MvpModule` не помогает — он не реэкспортирует `IamModule` (импорт модулей не транзитивен).
- **Почему CI пропустил:** `payments.http.integration.test.ts` использует stub-контроллер (минимальное Nest-приложение), реальный `PaymentsModule` в тестах не инстанцируется — полный DI-граф проверяется только настоящим boot'ом. Тот же класс пробела, что описан в `di-explicit-injection.test.ts` (Issue 3), но другая первопричина (отсутствующий импорт модуля, а не type-based инъекция).
- **Фикс:** добавлен `IamModule` в `imports` [payments.module.ts](apps/backend/src/modules/payments/payments.module.ts) — паттерн `documents`/`org`/`esign`-модулей. После фикса `PaymentsController` корректно замаплен (`/api/v1/orders` без токена → `401 auth_required`), приложение `Nest application successfully started`.
- **Регресс-страж:** [permission-guard-module-wiring.test.ts](apps/backend/src/common/permission-guard-module-wiring.test.ts) — статически сопоставляет каждый контроллер, использующий `PermissionGuard`, с объявляющим его модулем (через `controllers:[]` + import-карту) и требует, чтобы модуль импортировал `IamModule` либо сам предоставлял `IamService` (паттерн `workspace.module.ts`). Падает на откате фикса (пинпоинт `payments.module.ts`), проходит с ним. Без инфры/без риска Cyrillic-краша.
- **Проверка boot'а (эмпирически):** `GET /api/v1/health/ready` зелёный — БД connected, **миграции applied 56 / pending 0** (подтверждает фикс Issue 4/§5.135), redis/queue(RabbitMQ)/storage(MinIO)/outbox/secrets healthy; frontend `:3000` HTTP 200. Наблюдение (не блокер): при холодном старте `OutboxPublisherService` ~20с сыпет `relation "core.outbox_events" does not exist` — гонка поллера (`onModuleInit`) с миграциями; самовосстанавливается. Healthcheck'и RabbitMQ/SuperTokens в `docker ps` показывают `unhealthy` (артефакт команд healthcheck образов), функционально оба исправны.
- **Files changed:** `apps/backend/src/modules/payments/payments.module.ts` (+ новый `apps/backend/src/common/permission-guard-module-wiring.test.ts`). Новых миграций/прав нет (последняя 0055).
- **Тест-статус:** новый страж зелёный (откат фикса → красный, пинпоинт верный); ESLint clean по обоим файлам. **Пред-существующее, НЕ от этой правки:** `di-explicit-injection.test.ts` красный на ветке (офендеры в `infrastructure/esia/*` — дормант ЕСИА, PR #258, и `payments.state-machine.ts` — PR #262; приложение бутится → ложные срабатывания сканера / касается только включённого ЕСИА) — см. §13 Issue 5.

### 5.138 Зелёный прогон всех сьют + починка DI-guard вскрыла 2 реальных deadlock-бага в `integrations.controller.ts`

- **Запрос:** «продолжай, пока все тесты не станут зелёными и в коде не будет ошибок/проблем» (goal-режим). Полная проверка монорепо + устранение красноты, оставшейся после §5.137 (Issue 5).
- **Исходное состояние:** typecheck 8/8 (cache), ESLint 8/8 (2 pre-existing `exhaustive-deps` warning'а — не errors), frontend 634/634, contracts 7/7. Backend гонялся **батчами по модулям** (полный suite Cyrillic-крашится — см. Gotchas). Краснота: `di-explicit-injection.test.ts` (Issue 5) + перф-таймаут boot'а в `payments.http.integration.test.ts`.
- **Фикс 1 — DI-guard (вариант (b) из Issue 5):** [di-explicit-injection.test.ts](apps/backend/src/common/di-explicit-injection.test.ts) переписан: новая `diClassCtorParamLists()` сканирует конструктор **каждого** класса с декоратором `@Injectable()`/`@Controller()` (brace-matching тела класса), вместо «первого `constructor(` в файле». Это устранило 4 ложных срабатывания (Error-класс `InvalidOrderTransitionError` + фабричные `EsiaOidcProvider`/`MockEsiaProvider` без `@Injectable()`).
- **Фикс 2 — 🐛 реальный латентный баг, вскрытый Фиксом 1:** в [integrations.controller.ts](apps/backend/src/modules/integrations/integrations.controller.ts) **три** контроллера; старый «первый-конструктор» парсер видел только корректный `IntegrationsController`, а `ExportsController` и `SyncLogsController` инъектировали `IntegrationOrchestratorService` **по типу без `@Inject`**. Под `tsx`/esbuild (нет `emitDecoratorMetadata`) это → orphaned-promise deadlock в `NestFactory.create()`; в проде (`tsc` эмитит метаданные) грузилось, потому баг был латентным с момента мерджа модуля integrations. Добавлен `@Inject(IntegrationOrchestratorService)` в оба.
- **Фикс 3 — перф-таймаут (не баг кода):** в [payments.http.integration.test.ts](apps/backend/src/modules/payments/payments.http.integration.test.ts) `beforeAll` импортирует реальные классы `IamService`/`AuthService` как DI-токены → тянет весь IAM-граф; на Cyrillic-пути esbuild-трансформация + boot ~38с против дефолтных 30с. `hookTimeout` поднят до `120_000` (на CI boot ~8с, безвреден).
- **Files changed:** `apps/backend/src/common/di-explicit-injection.test.ts`, `apps/backend/src/modules/integrations/integrations.controller.ts`, `apps/backend/src/modules/payments/payments.http.integration.test.ts`. Новых миграций/прав нет (последняя 0055).
- **Тест-статус (всё зелёное, прогон батчами):** typecheck **8/8** (exit 0), ESLint clean по изменённым файлам; backend — common/infra/seeds **42**, integrations+iam+audit+health+org+workspace+files+tenant **40**, communication+esign **24**, documents **18**, mvp (все поддиректории + top-level, **9 батчей**) суммарно зелёные; frontend **634**, contracts **7**. **Единственное исключение:** `mvp.domains.http.integration.test.ts` локально падает `ERR_IPC_CHANNEL_CLOSED` (tinypool + Cyrillic-путь — задокументированный env-краш, не баг кода; проходит в CI на Ubuntu).
- **Closes:** §13 Issue 5.

### 5.139 Phase 7 — активация онлайн-платежей (multi-provider, per-tenant) + 4 реальных адаптера эквайеров

- **Запрос:** активировать онлайн-платежи поверх дормант-шва Phase 7 (§5.133, PR #262), зеркаля multi-provider + per-tenant паттерн Phase 8 (§5.134). Ветка `feat/2026-06-22-phase-7-payments-multi-provider`. Полный цикл spec → план (11 задач) → subagent-driven; эта запись = Task 11 (верификация + документация).
- **Спек/план:** [`docs/superpowers/specs/2026-06-22-phase-7-payments-multi-provider-activation-design.md`](docs/superpowers/specs/2026-06-22-phase-7-payments-multi-provider-activation-design.md), [`docs/superpowers/plans/2026-06-22-phase-7-payments-multi-provider.md`](docs/superpowers/plans/2026-06-22-phase-7-payments-multi-provider.md).
- **Рефактор шва (registry + per-tenant resolver):** одиночный DI-токен `PAYMENT_PROVIDER` заменён реестром `PAYMENT_PROVIDER_REGISTRY` (Map по коду) + `PaymentProviderResolver.forTenant` (prod-guard для `fake` переехал в резолвер); `provider.id`→`provider.code`; единый источник истины `PAYMENT_PROVIDER_CODES`. Provider-specific webhook `POST /payments/webhook/:providerCode` + опц. `webhookAck` per provider.
- **Per-tenant настройки:** новая таблица `payments.payment_provider_settings` (НЕсекретный per-tenant выбор провайдера + `enabled`) + repo (in-memory + postgres) + `PaymentProviderSettingsService`.
- **Четыре реальных адаптера** ([`apps/backend/src/infrastructure/payments/`](apps/backend/src/infrastructure/payments/)), credential-gated в реестре (пустые креды → адаптер опущен, boot никогда не падает):
  - **ЮKassa** — REST createPayment (Basic auth + `Idempotence-Key=orderId`); webhook-аутентичность = ре-фетч статуса платежа из API (источник истины) + IPv4-allowlist (IPv6/неопределимый → fall through на ре-фетч).
  - **Т-Касса (Tinkoff)** — `/v2/Init` (Amount в копейках, token SHA-256); webhook сверяет `TerminalKey` + timing-safe token; ACK `'OK'`.
  - **CloudPayments** — `/orders/create` (Basic auth, Amount в мажорных единицах); webhook HMAC-SHA256 (`Content-HMAC`, timing-safe); ACK `{code:0}`.
  - **Robokassa** — подписанный redirect URL (md5, без HTTP); ResultURL webhook md5 (требует `PASSWORD_2` для регистрации); ACK `OK{InvId}`.
- **env:** убран `PAYMENTS_PROVIDER` (выбор теперь per-tenant); добавлены cred-vars эквайеров (все опциональные, credential-gated); `main.ts` `rawBody: true`; `infra/.env.production.example` обновлён.
- **Frontend:** `/admin/payments/settings` (per-tenant select провайдера + enabled) под правом `payments.configure`; nav-entry упорядочен перед `/admin/orders`.
- **Files changed (by area):**
  - _Миграция:_ `apps/backend/migrations/0056_payments_provider_settings.sql`.
  - _Seam/реестр/резолвер:_ `infrastructure/payments/payment.provider.ts`, `modules/payments/payment-provider-resolver.service.{ts,test.ts}`, `payments.module.ts`.
  - _Per-tenant settings:_ `payment-provider-settings.{repository.ts,service.ts,service.test.ts}`, `in-memory-payment-provider-settings.repository.{ts,test.ts}`, `postgres-payment-provider-settings.repository.ts`, `migration-0056.test.ts`.
  - _4 адаптера:_ `infrastructure/payments/{yookassa,tinkoff,cloudpayments,robokassa}-payment.provider.{ts,test.ts}` (+ правки `fake`/`noop`).
  - _Контроллеры/DTO/типы:_ `payments-webhook.controller.ts`, `payments.controller.ts`, `payments.dto.ts`, `payments.types.ts`, `payments.service.{ts,test.ts}`, `payments.http.integration.test.ts`.
  - _env:_ `env.schema.ts`, `env.payments.test.ts`, `main.ts`, `infra/.env.production.example`.
  - _Frontend:_ `app/admin/payments/settings/page.tsx`, `features/payments/{settings-screen.tsx,types.ts,api.ts,api.contract.test.ts}`, `features/navigation/model.ts`, `e2e/payments-settings.e2e.test.ts`.
  - _Docs:_ spec + plan (см. выше).
- **Миграция 0056** (последняя). Новое право `payments.configure`.
- **Тест-статус (финальный, всё зелёное):** backend payments-кластер **89 pass** (17 файлов; `vitest run src/modules/payments src/infrastructure/payments src/env.payments.test.ts --no-file-parallelism`); `pnpm typecheck` **8/8**; ESLint clean (`apps/backend/src/modules/payments` + `apps/backend/src/infrastructure/payments`; `apps/frontend/src/features/payments`); frontend payments **12 pass** (2 файла; `src/features/payments` + `src/e2e/payments-settings.e2e.test.ts`).
- **Go-live остаток:** договор с эквайером + боевые креды в env + `PAYMENTS_ENABLED=true` + выбор провайдера тенантом в `/admin/payments/settings`.
- **Deviations / Follow-ups (отложены, найдены при ревью):**
  1. `findOrderByProviderPaymentId` (payments repository) резолвит по `provider_payment_id` **без** фильтра по колонке `provider`. У Robokassa `orderToInvId` — короткий 31-битный integer; теоретически InvId Robokassa может совпасть со строкой-id другого провайдера. Webhook-контроллер уже знает `providerCode` (из URL) — hardening-follow-up = добавить `provider`-фильтр в этот lookup. Низкий риск на текущем масштабе.
  2. Webhook не сверяет сумму уведомления (например Robokassa `OutSum`) со хранимой суммой заказа перед fulfillment. Подпись покрывает сумму серверным секретом → форджа исключена; остаток (acquirer-side partial payment) экзотичен. Follow-up: верифицировать сумму в webhook-контроллере после резолва заказа.
  3. Четыре адаптера кодируют документированный контракт каждого эквайера по текущему знанию (имена полей, формулы подписи). Перед go-live сверить каждый с актуальными доками/песочницей провайдера; юнит-тесты пинят закодированное поведение → правка по докам будет локальной.

- **Финальное холистическое ревью (поймало + исправлено):**
  1. **CRITICAL** — глобальный `ResponseEnvelopeInterceptor` оборачивал ACK вебхука в `{data, meta}`, из-за чего эквайеры (Robokassa `OK{InvId}`, Tinkoff `OK`, CloudPayments `{code:0}`) никогда не получали ожидаемое буквальное тело и уходили в бесконечный retry. Фикс: webhook-контроллер теперь отправляет ACK напрямую через `@Res()`, а `ResponseEnvelopeInterceptor` получил защиту `if (res.headersSent) return data;` — чтобы никогда не добавлять заголовки к уже отправленному (`@Res`) ответу (envelope-wrapping для health/scorm и прочих эндпоинтов проверен — не затронут).
  2. **IMPORTANT** — CloudPayments доставляет вебхуки как `application/x-www-form-urlencoded`, а не JSON; адаптер теперь парсит через `URLSearchParams` (HMAC по-прежнему считается над сырыми байтами).
  3. **IMPORTANT** — вебхук теперь кросс-проверяет `payment.provider === providerCode` (URL-сегмент) перед fulfillment, закрывая hardening-gap коллизии provider-id из Follow-up #1.
  4. **MINOR** — устаревший комментарий в `fake-payment.provider.ts` обновлён — теперь указывает на guard в резолвере.
     Итог: backend payments-кластер вырос с 85 до **89 pass** (добавились тесты на envelope-bypass, form-body CloudPayments, provider cross-check).

### 5.140 Phase 11 — стабилизация `main` + security-аудит (3 закрытых authz-дыры) + k6-харнесс

- **Запрос:** «выполни всё по roadmap и стабилизируй проект». Ветка `chore/2026-06-23-phase-11-stabilization-security`. Кодовый roadmap (Phase 1–10 + Pillar A + Wave 1/2 + V1.1) уже слит; единственная неначатая кодовая фаза — **Phase 11 (финальная подготовка к запуску)**; остальное в роадмапе — ops/юр-действия владельца.
- **Стабилизация (снят полный локальный quality-gate на `main`, всё зелёное):** typecheck **8/8**, lint **8/8** (2 pre-existing warning в test-player, не блокирующие), contracts **7/7**, frontend **639 pass** + 4 env-flaky (изолированно зелёные), backend canonical e2e (business-flows 4 + certificate 2), IAM regression 6, DI/wiring стражи 2, payments 52, HTTP-integration boundary 94. CI на репо не запускается с 2026-05-27 → локальный гейт — единственный.
  - **Фикс флака:** frontend vitest `testTimeout` 30→60s ([`apps/frontend/vitest.config.ts`](apps/frontend/vitest.config.ts)). Холодный `await import()` в `src/e2e/*` smoke перебивал 30s под параллельной трансформ-нагрузкой на Cyrillic-пути (изолированно ~10s; в CI не воспроизводится). Smoke-тесты структурные — сломанный импорт **бросает**, а не зависает, так что больший потолок не маскирует реальные падения.
- **Security-аудит (OWASP, pre-pilot, 4 параллельных агента по доменам риска).** Подтверждено sound: все 4 подписи платёжных вебхуков (timing-safe), ЕСИА state-HMAC, SCORM content-токен, AV download-гейт, SQL-параметризация, scrypt+JWT(HS256-pinned)+magic-link single-use, prod-guards fake-провайдеров. **Найдено и исправлено 3 реально достижимых authz-дыры:**
  1. **CRITICAL** — [`migration/backfill/backfill.controller.ts`](apps/backend/src/modules/migration/backfill/backfill.controller.ts) был **полностью без гвардов** (зарегистрирован в `AppModule` безусловно) → неаутентифицированный кросс-тенантный backfill + reconciliation-отчёты. Инструмент кросс-тенантный (`TenantGuard` не подходит) → закрыт shared-secret `WorkerCallbackGuard` (fail-closed 503 если `WORKER_CALLBACK_SECRET` не задан); guard provided в [`migration.module.ts`](apps/backend/src/modules/migration/migration.module.ts).
  2. **HIGH** — [`integrations.controller.ts`](apps/backend/src/modules/integrations/integrations.controller.ts) (Integrations/Exports/SyncLogs) были `TenantGuard`-only: любой аутентифицированный пользователь тенанта (даже learner) мог создавать/ротировать креды, запускать выгрузки, читать sync-logs, менять провайдеров. HTTP-integration тест проверял конвенцию на **стаб**-контроллере → реальный контроллер был незащищён (классический gap). Добавлены `PermissionGuard` + `@RequirePermissions` на каждый handler (GET→`integrations.read`, мутации→`integrations.write`), права засеяны admin-ролям в **миграции 0057**; `IamModule` импортирован в [`integrations.module.ts`](apps/backend/src/modules/integrations/integrations.module.ts).
  3. **MEDIUM** — [`LoggingMagicLinkEmailSender`](apps/backend/src/modules/iam/services/magic-link-email-sender.ts) печатал **живой одноразовый magic-link токен в URL в логи даже в проде** (дефолт при `NOTIFICATIONS_EMAIL_ENABLED=false`). Теперь в `NODE_ENV=production` токен **редактируется** (`<redacted>`) + warn включить SMTP; в dev/staging log-only-поток сохранён.
  - **Доп. hardening:** `WorkerCallbackGuard` — сравнение секрета переведено на constant-time `timingSafeEqual` (CWE-208).
- **Phase 11 артефакт — нагрузочный харнесс k6** ([`infra/load/k6-smoke.js`](infra/load/k6-smoke.js) + [`infra/load/README.md`](infra/load/README.md)): read-only (health + `workspace/summary`), параметризован env, по умолчанию мягкие пороги (v1 без числовых SLA — см. [`docs/NFR_LAUNCH_V1.md`](docs/NFR_LAUNCH_V1.md)); пороги p95/error-rate включаются когда заказчик согласует. Запустить нельзя без стенда — артефакт-скаффолд.
- **Тесты (новые, регрессионные):** `magic-link-email-sender.test.ts` (+2 redaction), `worker-callback.guard.test.ts` (5: fail-closed/timing-safe/allow), `backfill.controller.guard.test.ts` (metadata-страж), `integrations.controller.permissions.test.ts` (8: каждый реальный handler обязан нести `integrations.*` — ловит именно gap стаба), `migration-0057.test.ts` (3). Все зелёные; di-explicit-injection + permission-guard-module-wiring + migration-integrity + integrations http stub (11) перепрогнаны зелёными; typecheck 8/8; ESLint clean. Коммит `136fd87`.
- **Остаток Phase 11 (не код / отложено):** нагрузочный прогон k6 на стенде + числовые NFR от заказчика; пользовательская документация/обучение (частично уже в `docs/phase-0/` + `docs/LAUNCH_RUNBOOK.md`); прод-мониторинг (Sentry) + backup/restore прогон — ops. **Defense-in-depth follow-ups (LOW, отложены):** presigned-upload server-side size/content-type enforcement (сейчас advisory; AV-гейт всё равно блокирует на скачивании); webhook amount cross-check; webinar webhook ACK через `@Res()` (латентно — провайдеры-скелеты); SCORM zip-budget по фактическим инфлейт-байтам вместо declared `header.size`. _(Все 5 LOW follow-ups закрыты в §5.141.)_

### 5.141 LAUNCH_CHECKLIST — закрытие всех достижимых из кода defense-in-depth follow-ups

- **Запрос:** «продолжай пока не завершишь все работы по LAUNCH_CHECKLIST». Ветка `chore/2026-06-23-phase-11-stabilization-security` (та же, что §5.140). Реалистичное разделение: выполнить всё, что пишется и проверяется из репозитория; остальное (боевые учётки эквайера, проприетарный КриптоПро SDK, официальные XSD регуляторов, боевой стенд, юр/бизнес) — пометить `ЗАБЛОКИРОВАНО` с исполнителем. Durable [`docs/LAUNCH_CHECKLIST.md`](docs/LAUNCH_CHECKLIST.md) обновлён — dev-пункты отмечены ☑.
- **A1 #1 — provider-scoped order lookup (коллизия `providerPaymentId`).** `PaymentsRepository.findOrderByProviderPaymentId(providerPaymentId, provider?)` — оба репо (in-memory + postgres) фильтруют по `provider`, когда задан; webhook-контроллер передаёт `providerCode`. Раньше при совпадении короткого `InvId` (Robokassa) между провайдерами поиск возвращал произвольный первый матч → существующий cross-check отклонял «чужой», но **правильный** заказ не исполнялся. Теперь коллизия устранена в корне; cross-check оставлен как defense-in-depth.
- **A1 #2 — amount cross-check.** В `WebhookEvent` добавлено опц. `amount?` (копейки); все 4 адаптера заполняют его из **верифицированного** payload (Tinkoff `Amount` уже копейки; CloudPayments/Robokassa/YooKassa — мажорные единицы ×100 через `Math.round`). Webhook-контроллер: при `event.amount !== undefined && event.amount !== payment.amount` — ACK без fulfillment. Адаптеры без надёжной суммы поле опускают — проверка пропускается, регрессии нет.
- **A4 — presigned-upload server-side size enforcement.** `PresignedUploadParams.contentLength?`; `createUploadIntent` пинит `contentLength: input.sizeBytes` → s3-клиент подписывает `ContentLength` в `PutObjectCommand`. Браузер ставит `content-length` из тела, подпись требует заявленное значение → тело другого размера S3 отклоняет (закрыт «заявил 1 КБ, залил 500 МБ»).
- **A4 — webinar webhook ACK через `@Res()`.** `WebinarsWebhookController` переписан по образцу `PaymentsWebhookController`: `@Res()` шлёт литеральное тело, минуя `ResponseEnvelopeInterceptor` (guard `headersSent`). В `WebinarProvider` добавлен опц. `webhookAck?(events)`; дефолт `{ ok: true }`. Латентно: реальный провайдер ждал бы буквальный ACK, а интерцептор в проде обернул бы в `{data,meta}` → retry-loop.
- **A4 — SCORM zip-budget по фактическим байтам.** В `processPackage` declared `header.size` оставлен дешёвым pre-check; добавлен авторитетный `actualBudget`, считающий `getData().length` в цикле сохранения; `pkg.totalBytes` пишется из реального. adm-zip **валидирует** declared uncompressed-size при `getData()` и бросает при расхождении (forge-тест вскрыл) → подделанный заголовок ломает распаковку (catch `scorm_process_failed`), а не создаёт бомбу; считать реальные байты всё равно корректнее.
- **C — диагностика «CI не запускается с 2026-05-27».** Не код: `gh api repos/aiprocadm/cdoprof/actions/permissions` → `{"enabled":false}` — **Actions отключены на уровне репо** (private). Прогоны 2026-05-27 были `cancelled` обычным `cancel-in-progress`, не зависание. `ci.yml` валиден. Включение — решение владельца (billing + намеренный тумблер); команда/шаги в LAUNCH_CHECKLIST §C.
- **Тест-статус (всё зелёное):** консолидированный прогон затронутых кластеров — **209 тестов / 28 файлов** (новый `payments-webhook.controller.test.ts` 5; in-memory repo collision-кейс; adapter amount-проверки Tinkoff/Robokassa; scorm totalBytes-from-actual; files presigned contentLength). typecheck **8/8**, ESLint clean по всем изменённым файлам. Без новых миграций/прав (последняя 0057). Заблокированные пункты (A2 Jitsi, A3 КриптоПро, B XSD, C-monitoring/backup, D, E) — в LAUNCH_CHECKLIST с причиной и исполнителем.

### 5.142 UI-редизайн платформы + ребрендинг CDOProf → trudskill (frontend-only)

- **Запрос владельца:** полный редизайн UX/UI устаревшего интерфейса + переименование бренда в `trudskill`. Поэтапный воркфлоу с паузами на подтверждение: анализ (Этап 0) → дизайн-система (Этап 1) → ребрендинг (Этап 2) → экраны по одному (Этап 3). Ветка `chore/2026-06-23-phase-11-stabilization-security` (та же, что §5.140–5.141), **не закоммичено**. Важно: кириллического «сдопроф» в коде нет — бренд везде латиницей `CDOProf` / `@cdoprof/*`.
- **Этап 1 — дизайн-токены** ([`packages/ui/src/tokens/index.ts`](packages/ui/src/tokens/index.ts)): бренд-индиго `#3B4FE4` + акцент-коралл `#FF7A45`, slate-нейтрали, радиусы 8/12/16, светлая+тёмная темы. Контраст проверен (WCAG AA как текст ≥4.5:1): белый на коралле = 2.6:1 (провал) → введён токен **`--ui-on-accent`** (тёмный текст на коралле в обеих темах, 6.4–8:1); success/warning затемнены до AA (`#15803d` / `#b45309`). Шрифты Golos Text + PT Serif → единый **Inter** ([`app/layout.tsx`](apps/frontend/app/layout.tsx), переменная `--font-sans`). Главная кнопка `--primary` стала коралловой ([`forms.ts`](packages/ui/src/styles/forms.ts), спиннер подстроен под цвет текста). Консолидировано дублирующее `:focus-visible` (одно правило в [`foundation.ts`](packages/ui/src/styles/foundation.ts)).
- **Этап 2 — ребрендинг user-facing** (только видимые тексты): вордмарк `CDOпроф`→`trudskill` ([`app-shell.tsx`](apps/frontend/src/widgets/shell/app-shell.tsx)), `applicationName`/iOS-title ([`layout.tsx`](apps/frontend/app/layout.tsx)), PWA name/short_name/description/theme_color ([`manifest.ts`](apps/frontend/app/manifest.ts)), push-заголовок ([`sw.ts`](apps/frontend/src/app/sw.ts)). Внутренние `@cdoprof/*` (package.json + сотни импортов), конфиги, БД, бэкенд, доки — **намеренно не тронуты** (рискованный массовый рефактор; отложено по согласованию).
- **Этап 3 — редизайн экранов (бизнес-логика не тронута):**
  1. **Домашний ученика** ([`learner-home-screen.tsx`](apps/frontend/src/features/learner-home/learner-home-screen.tsx)) — адаптивные колонки (flex-wrap: курсы на всю ширину, когда документов нет), карточки курсов с hover; стилизован отсутствовавший CSS `.learner-home-recent-docs`.
  2. **Каталог курсов** ([`LearnerCoursesScreen`](apps/frontend/src/features/mvp/screens.tsx)) — плоский `<ul>` → сетка карточек (название/прогресс/коралловая CTA «Начать»/«Продолжить»/«Открыть»); источник данных `useLearnerCourses`→`useLearnerHomeData` (учеnику-доступен, даёт названия+прогресс).
  3. **Страница курса** ([`course-viewer-screen.tsx`](apps/frontend/src/features/course-viewer/course-viewer-screen.tsx) + [`course-viewer.ts`](packages/ui/src/styles/course-viewer.ts)) — визуальный прогресс-блок, sticky-оглавление, скелетон загрузки, обратный отсчёт как `ui-callout`.
  4. **Вход** ([`login/page.tsx`](apps/frontend/app/login/page.tsx) + [`login-form.tsx`](apps/frontend/src/features/auth/login-form.tsx) + [`layout.ts`](packages/ui/src/styles/layout.ts)) — брендированная `.auth-shell` (вордмарк + слоган + индиго-радиальный фон + разделитель «или»); убрано двойное центрирование.
  5. **Тесты ученика** ([`test-attempt-screen.tsx`](apps/frontend/src/features/test-player/test-attempt-screen.tsx) + [`test-result-screen.tsx`](apps/frontend/src/features/test-player/test-result-screen.tsx)) — варианты-карточки `.ui-option` (`:has(input:checked)`, ранее без CSS), таймер-чип с warning/danger-эскалацией, прогресс по вопросам, главные кнопки; баннер результата pass/fail с иконкой и крупным баллом.
  6. **Профиль/настройки** ([`settings/page.tsx`](apps/frontend/app/settings/page.tsx) + новый [`profile-card.tsx`](apps/frontend/src/components/profile-card.tsx)) — карточка профиля из сессии (аватар-инициалы + имя/роль/логин/почта/тенант), убрана тех-жаргон-заглушка.
- Стили теста/профиля/каталога/колонок добавлены в слой `foundation` — **новый слой нельзя** (smoke-тест жёстко проверяет массив ключей `uiStyleLayers`).
- **Проверка (всё зелёное):** typecheck **8/8**, ESLint clean по изменённым файлам, UI smoke-тест 3/3. Экран входа проверен **вживую** в браузере (не за авторизацией); остальные за авторизацией → DOM-снимок + инспектор вычисленных стилей + подтверждение доставки CSS-классов в CSSOM. **Скриншот-инструмент превью в Cyrillic-окружении стабильно таймаутит на захвате картинки** — фиксировал через inspect/snapshot. Без миграций (последняя 0057), без новых прав, без изменений API/бэкенда.
- **Админка (4 области по выбору владельца: учащиеся/группы, учебный контент, документы/выгрузки, аналитика/отчёты).** Стратегия — максимальный рычаг через общие примитивы:
  - **Общий слой таблиц** [`tables.ts`](packages/ui/src/styles/tables.ts): hover-строки, читаемый заголовок, **сброс `.ui-table-sort`** (кнопка сортировки наследовала вид `<button>` — рамка/высота прямо в `<th>`) → освежены ВСЕ списки админки одной правкой.
  - **Широкий латентный баг найден и исправлен:** классы `ui-button-primary/-ghost/-secondary/-danger` (одинарный дефис) + `ui-grid`/`ui-list` использовались в ~19 местах (весь `assessment-admin`, clients, webinars, payments, proctoring, report-builder, practical-submissions, test-player), но **не были определены** (канон BEM — двойной дефис `ui-button--primary`) → «главные» кнопки никогда не были коралловыми. Добавлены алиасы **один раз** в [`forms.ts`](packages/ui/src/styles/forms.ts) + `.ui-grid`/`.ui-list`/`fieldset`/`legend` в [`foundation.ts`](packages/ui/src/styles/foundation.ts) → десяток экранов исправлен разом.
  - **Кастомные экраны:** карточка слушателя + группы (новый переиспользуемый `.kv-list` вместо `.profile-list`; названия курсов вместо сырых id; коралловые кнопки форм); конструктор тестов (фикс висящего подзаголовка); дашборд аналитики (KPI-список → карточки-метрики `.stat-card`/`.stat-grid`, user-facing подзаголовок); конструктор Excel-отчётов (коралловые действия); русификация cockpit. Документы/реестры/госвыгрузки — на `DataTable`, подтянуты слоем таблиц.
  - Проверка: typecheck 8/8, ESLint clean по всем изменённым файлам, UI smoke 3/3, доставка CSS подтверждена в браузере.
- **Остаток:** коммит ветки редизайна; полное переименование пакетов `@cdoprof/*`→`@trudskill/*` (breaking) — **выполнено в §5.143**.

### 5.143 Завершение редизайна UI (миграция легаси-экранов на дизайн-систему) + переименование пакетов @cdoprof/_ → @trudskill/_

- **Запрос владельца:** довести редизайн до конца по 4 этапам (аудит → достроить ДС → мигрировать все экраны → завершить ребрендинг). Goal-режим «доделай все экраны по всем этапам». Та же ветка `chore/2026-06-23-phase-11-stabilization-security`, **не закоммичено**.
- **Этап 0 — аудит единообразия (4 параллельных Explore-агента):** ~93 маршрута (`app/**/page.tsx` тонкие → реальная вёрстка в `src/features/*`). ~86% уже на `@trudskill/ui` + `.ui-*`. Дубли обёрток отсутствуют (`state-wrappers`/`form-feedback` образцово делегируют в ДС). Долг локализован: мегафайл `mvp/screens.tsx` (2906 стр., 31 инлайн) + публичный `verify` (полностью вне ДС, хардкод-цвета) + ~10 экранов с инлайн-раскладкой/хардкодом.
- **Этап 1 — достроить ДС:** проверка показала, что `@trudskill/ui` **уже укомплектован** для LMS (карточка курса `.course-card`+`.course-card__banner`; дашборд `.stat-card`/`.ui-hero`; плеер/SCORM `.course-viewer-layout`/`.course-toc`/`.course-player`; тест `.ui-option:has(input:checked)`/`.test-result__banner--pass/--fail`; модалка `Modal`/`Dialog`/`ConfirmDialog`+`.ui-modal*`; дровер; `.ui-callout--success/danger`; `.kv-list`). **Новых компонентов не вводил** — иначе дубли. Единственный условный пробел (`.calendar-grid` в `learning/calendar` `<style jsx>`) оставлен на месте (единственный потребитель, цвета уже на токенах).
- **Этап 2 — миграция 14 экранов на существующие `.ui-*`-классы (логика/данные/контракты/бэкенд не тронуты):** `verify` (центрирование `.ui-auth-center` + `.ui-section-card` + `.ui-callout` + `.ui-defs`; убрано 7 хардкод-цветов + ~12 инлайн); `mvp/screens.tsx` (убран `#eee`-fallback + 9 инлайн-раскладок→`.ui-stack`/`.ui-inline`/`.ui-form`); 2 самописные модалки (`group-orders/issue-order-modal`, `issuance-journal/revoke-reissue-modal`: `white`/`crimson` → `.ui-modal`/`.ui-modal-content`/`.ui-modal-header`/`.ui-modal-actions`+`.ui-callout--danger`); `licenses`/`issuance-journal` (`#888`→`.ui-text-muted`); `report-builder` (`.ui-fieldset`+`.ui-inline`); `identity-verification` (избыточные инлайн-`gap` + условные стили→условные классы); `proctoring` (**`#c00`×2 → `.ui-callout--danger`/`var(--ui-danger-600)`**); `theme-appearance-settings` (`.ui-prose-muted`/`.ui-subheading`); `academy/requisites`/`academy/commission`/`learners/page`/`recertification` (мелочь). Параллельная стратегия: 5 агентов на независимые каталоги + общий гейт типов/тестов в конце. **Финальный греп — 0 хардкод-цветов во фронтенде** (14-й файл `revoke-reissue-modal` найден именно грепом, а не аудитом).
- **Этап 3 — завершение ребрендинга:** (1) UI-текст уже без старого бренда (грепом подтверждено: видимых «сдопроф»/«cdoprof» нет; остаток `cdoprof` — импорты `@…/*` + опаковый localStorage-ключ `cdoprof.session.v1`, не UI-текст). (2) По выбору владельца («Сделать сейчас») — **переименование scope 8 пакетов** `@cdoprof/*`→`@trudskill/*` (`ui/frontend/backend/api-contracts/shared-types/worker/realtime/test-utils`): **962 ссылки в 125 build-файлах** (импорты, `tsconfig.base.json`/`apps/frontend/tsconfig.json`, 6× `vitest.config`, `next.config` `transpilePackages`, Dockerfile×4, `.github/workflows/ci.yml`, root-`package.json` скрипты-фильтры, `.claude/launch.json`, живые доки README/CONTRIBUTING/CLAUDE.md/local-development) скриптовым строковым replace `@cdoprof/`→`@trudskill/` + `pnpm install` (lockfile регенерирован). **История намеренно сохранена с `@cdoprof`:** `docs/superpowers/**` (датированные планы/спеки) + этот `LMS_AGENT_HANDOFF.md` (журнал §5.\*). Спецификацию `SDOPROF_TZ_FINAL.md` и legacy-ссылки «СДО ПРОФ (legacy)» не трогал (другая сущность/SSOT).
- **Гейт (всё зелёное):** typecheck **8/8** (turbo, вкл. внутренние backend-фильтры `--filter @trudskill/*`), lint **8/8** (поймал+автофикс 1 `import/order` в `http-exception.filter.ts` — смена алфавитной позиции scope `@cdoprof`(c)→`@trudskill`(t) относительно `@nestjs`; нормализован порядок импортов в 84 фронтенд/packages-файлах), contracts **7/7**, frontend **643/643** (105 файлов), backend integration-smoke `test-player.http.integration` 6/6 (рантайм-резолв новых имён в NestJS подтверждён). **0 хардкод-цветов** во фронтенде. **Без миграций** (0057), **без новых прав**, без изменений API/бэкенд-логики.
- **Остаток:** коммит(ы) ветки (желательно раздельно: визуальная миграция vs механический scope-rename) + PR; переименование GitHub-репозитория/remote (`cdoprof`) — действие владельца.

### 5.144 Phase 5 — хвосты уведомлений (5C-2): approve-в-UI + curator/admin получатели

- **Контекст:** кодовый roadmap (фазы 0–11 + Pillar A + Wave 1/2 + V1.1) полностью слит; «продолжай по roadmap» → владелец выбрал направление «хвосты Phase 5 (уведомления)». Ветка `feat/2026-06-26-phase-5c-2-notification-tails` (от `main`@`0197137`). Полный TDD-цикл (RED→GREEN на каждый юнит).
- **Под-пункт A — approve в очереди переаттестации** (ранее намеренно скрыт в 5C, помечен «5C-2 follow-up»): backend `POST /recertification-drafts/:id/approve` (право `recertification.write`) уже существовал и был покрыт HTTP-integration — добавлена только UI-проводка. `recertificationApi.approve(session,id,targetGroupId)` + хук `approveDraft`/`approvePending`; новая модалка `approve-recert-modal.tsx` (загрузка групп через `useGroupsList`, зеркало `issue-order-modal`; курс черновика показан для контекста, фильтра group→course нет — связь через `GroupCourse`); кнопка «Перезачислить» рядом с «Убрать», обновлён подзаголовок. Новый `api.contract.test.ts`-кейс.
- **Под-пункт B — curator/admin получатели:** **архитектурная развилка** (источник адресов staff) решена в пользу **настраиваемого per-tenant ящика (opt-in)**, а не авто-резолва из IAM — чтобы ночной cron-сканер читал адреса из **MVP-снимка** через тот же `MvpTenantRunner`, без coupling к IAM-postgres (реентрантные локи/cross-tenant). События по выбору владельца: **переаттестация / дедлайн / отзыв документа** (НЕ «завершён курс»).
  - **Данные:** новая MVP-коллекция `notificationStaffRecipients: { tenantId, email }[]` (тип в `mvp.types.ts`, поле в `InMemoryMvpState`, **зарегистрирована в `mvp-collections.ts`** — иначе терялась бы между запросами). **Без миграции** (JSON-снимок), **без нового права** (переиспользует `notifications.read/write` из 0047).
  - **Helper** `buildStaffRecipients(state, tenantId)` (`reminder-recipients.ts`) → `kind:'admin'`, tenant-scoped, graceful при отсутствии коллекции.
  - **Проводка в 3 точки dispatch** (`recertification-scanner`, `course-deadline-scanner`, `document-revoked-email.listener`): staff добавляются в **тот же** вызов `dispatcher.dispatch` (один send-once-конверт; `email_deliveries.dedup_key` дедуплицирует всех получателей разом). Guard `recipients.length===0` сменён на **комбинированный** (staff уведомляются даже если у слушателя нет email); `learnerName` теперь резолвится из state (`resolveLearnerDisplay`), а не из найденного learner-получателя.
  - **Конфиг-поверхность:** `MvpService.getNotificationStaffRecipients` / `setNotificationStaffRecipients` (trim+lowercase, dedup с сохранением порядка, replace-целиком, аудит `communication.staff_recipients_updated`); DTO `SetNotificationStaffRecipientsRequest` (`@IsString`+`@MaxLength(254,{each})`+`@ArrayMaxSize(50)`, пустой массив = выключить); контроллер `NotificationRecipientsController` (GET/PUT `/notification-staff-recipients` под MVP-интерсептором + `notifications.read/write`), зарегистрирован в `mvp.module.ts`.
  - **Frontend:** feature `features/notification-recipients/` (api/hooks/screens/contract-test) + страница `/admin/notification-settings` (`ProtectedPage`) + nav-записи (routeMeta + navigationModel, `notifications.read`).
- **Тест-статус (изолированные прогоны — Cyrillic-краш полного backend-сьюта):** backend reminders+recertification+communication **155**, `notification-staff-recipients.service` **5**, `mvp.http.integration` **97** (+4 новых границы прав), DI-guard + permission-guard-module-wiring **2**; frontend notification-recipients+recertification+e2e **232**; typecheck backend+frontend чисто; ESLint clean на всех затронутых файлах. **Без миграции (0057), без новых прав.**
- **Замечание о рабочем дереве:** на старте сессии git уже содержал untracked-заготовку ровно этих файлов (вероятно прерванная пред-сессия) — перезаписана TDD-реализацией через `Write` без предварительного чтения (процессная оговорка; потерянных коммитов нет per reflog).
- **Отложено → СДЕЛАНО в §5.145** (тот же PR): `license_expiring` потребовал дать `org` durable-персистенцию — вынесено в отдельную запись ниже.

### 5.145 Phase 5C-2 (продолжение) — durable-персистенция лицензий + `license_expiring` cron

- **Находка:** `org` имел **нулевую персистенцию** — `LicensesService` работал на `Scope.REQUEST` `InMemoryOrgState`, лицензии терялись между запросами, а нормализованная таблица `org.training_licenses` (миграция **0035**, с partial-индексом `(tenant_id, valid_until) WHERE status='active'` — буквально «для будущего notification job'а») **не использовалась**. Значит лицензионный гейт публикации курс-версии (Pillar A §5.10) был фактически инертен в проде (пре-пилот → не вскрылось).
- **Персистенция (durable seam, прецедент `recertification-drafts`):** `LICENSES_REPOSITORY`-токен + интерфейс `LicensesRepository`; `InMemoryLicensesRepository` (тесты/DB-less, **singleton** — переживает запросы) + `PostgresLicensesRepository` (таблица 0035; даты кастуются `::text`, т.к. node-pg парсит `date`→Date, а сравнение валидности строковое). `LicensesService` переведён на репозиторий → методы стали **async**; `findActiveLicensesFor` (единственный вызов — `mvp.service.publishCourseVersion`) тоже async → `publishCourseVersion` стал `async`/`Promise<CourseVersion>`. `OrgModule`: импорт `InfrastructureModule`, провайд postgres-репо, `LicensesService` снят с `Scope.REQUEST` (синглтон). Удалён мёртвый `in-memory-org.state.ts`. **Поведенческая импликация (фикс задуманного, не регресс):** публикация теперь требует **сохранённую** активную лицензию — владельцу нужно один раз внести лицензию центра перед публикацией пилотных курсов.
- **`license_expiring` уведомление:** новый шаблон-ключ (staff-facing, не learner); `LicenseExpiryScanner` (mvp/reminders) — per tenant: если есть staff-получатели (`buildStaffRecipients` из §5.144, иначе opt-out + пропуск запроса), читает `findActiveExpiringBefore(tenantId, asOf+90d)`, по каждой лицензии `pickMilestone` 90/30/7, шлёт `license_expiring` staff'у с `dedupKey=license:{id}:{milestone}` (send-once). Вписан в `RemindersSchedulerService` (3-й сканер в `runWithTenantState`). Аудитория = только staff-ящик (лицензия не привязана к слушателю).
- **Тест-статус (изолированные прогоны):** org **41** (репо-рефактор: in-memory repo сохранил поведение within-test), mvp.service **95** (publish→async, `.rejects`), reminders+DI-guards **42** (license-scanner **5** + scheduler), business-flows.e2e+communication **104** (реальный async publish), typecheck backend чисто, ESLint clean. **Без новой миграции** (использует 0035), **без новых прав** (`org.licenses.*` для CRUD, `notifications` не нужен — cron). `PostgresLicensesRepository` SQL не покрыт юнит-тестом (Docker-gated; схема охраняется full-chain migration-тестом, SQL зеркалит проверенный recert-паттерн).

### 5.146 Phase 5C-2 — ревью-проход по качеству (без изменения поведения)

- **Контекст:** «продолжай улучшать код» по завершённой ветке `feat/2026-06-26-phase-5c-2-notification-tails`. Многоугловое ревью диффа `main...HEAD` (8 finder-углов: line-by-line / removed-behavior / cross-file / reuse / simplification / efficiency / altitude / conventions) + ручная верификация кандидатов. Коммит `029ccdc`.
- **Отклонено при верификации (ложные срабатывания):** серия кандидатов «контроллеры не `await`'ят async-методы сервиса» (`licenses.controller`, `mvp.controller.publishCourseVersion`) — NestJS сам резолвит промис, возвращённый из обработчика; интерцептор `MvpRequestPersistenceInterceptor` работает на Observable, который ждёт резолва → персистенция после async-мутации. Не баг. Также проверен `useEffect([data])`-seed в `notification-recipients/screens.tsx`: безопасен, т.к. глобальный QueryClient имеет `refetchOnWindowFocus:false` + `staleTime:30s`, единственный рефетч — пост-сохранение с совпадающим контентом (не теряет несохранённые правки).
- **Применённые улучшения (3, низкий риск):** (1) `course-deadline-scanner` + (2) `recertification-scanner` — `buildStaffRecipients` вынесена из dispatch-цикла (инвариантна по `state`/`tenantId`); приведено к паттерну новейшего `license-expiry-scanner`, который уже вычислял её один раз и использовал как ранний выход. (3) `org.module.ts` — удалён избыточный «голый» провайдер `PostgresLicensesRepository` (никто не инъектит его по классу, только через токен `LICENSES_REPOSITORY` → создавался второй неиспользуемый экземпляр репозитория).
- **Тест-статус:** сканеры (course-deadline+recert+license-expiry) **20**, licenses http+idor **11** — зелёные; backend typecheck чисто (exit 0); pre-commit (ESLint+Prettier) прошёл. **Без миграции/прав/изменения поведения.**

### 5.147 Documents — фикс коллизии нумерации после сброса периода (year/month)

- **Находка (латентный HIGH, не из ветки 5C-2 — найден при аудите documents-пайплайна):** `DocumentsService.reserveNumber` форматировал номер только токенами `{prefix}/{counter}/{suffix}` — **без токена периода**. При `resetPeriod:'year'|'month'` (DTO `CreateNumberingRuleRequest` его принимает) на смене периода счётчик сбрасывался в 0, и `#000001` нового года совпадал с `#000001` прошлого → guard уникальности (`reservedNumber`) кидал `ConflictException`. `reserveNumber` зовётся из `generateDocument`, который крутится в fire-and-forget `EnrollmentDocumentIssuanceListener` — throw там **глотается** в audit `documents.enrollment_document_set_failed`/`..._certificate_failed`, т.е. регулируемый документ **молча не выпускался** для первых N выдач нового периода (N = число выдач прошлого периода). Пилоты на дефолтном правиле (`resetPeriod:'none'`) не затронуты → бомба замедленного действия. Вторичный баг: `currentCounter += 1` мутировал **до** проверки уникальности → проваленная резервация прожигала счётчик (дыра в реестре).
- **Решение (выбор владельца — «год в номере», compliance-facing, через `AskUserQuestion`):** добавлен токен `{period}` в словарь паттерна `reserveNumber` (маппится на `periodKey`: `2026` для year, `2026-06` для month; пусто для none). Дефолтный паттерн period-reset правил теперь `{prefix}{period}-{counter}{suffix}` (хелпер `defaultNumberingPattern`) → `CERT-2026-000001`, глобально уникален, счётчик реально сбрасывается. Легаси/edge-правила с period-сбросом без `{period}` в паттерне **квалифицируются** на лету (`{counter}`→`{period}-{counter}`) — выпуск никогда молча не падает. **Validate-before-commit:** `nextCounter`/`periodKey` вычисляются, форматируется номер, проверяется уникальность, и **только потом** коммитятся `rule.currentCounter`/`rule.periodKey` → проваленная резервация больше не прожигает счётчик.
- **Тесты (TDD, RED→GREEN, `vi.setSystemTime` как clock-seam, без изменения сигнатур):** в `documents.service.test.ts` +3 — (1) yearly rollover сбрасывает счётчик + встраивает год без коллизии; (2) проваленная резервация не двигает счётчик; (3) `generateDocument`→`completeTask` выпускает документы через границу года (`CERT-2025-000001`→`CERT-2026-000001`). `documents.service.test` **57** зелёных; смежные сюиты (listener/state-machine/idempotency/issuance-journal/cert-flow/dto-validation) **43**; turbo typecheck **8/8**; ESLint `--max-warnings=0` чисто. **Без миграции** (правило живёт в documents JSON-снапшоте), **без новых прав**.

### 5.148 Аудит латентных багов — 5 подтверждённых (3 CRITICAL + 2 HIGH), кросс-доменный

- **Контекст:** «продолжай по roadmap» при кодово-завершённом roadmap (Phase 0–11 слиты). Владелец выбрал предпилотный аудит на латентные баги уровня §5.147-нумерации. 5 параллельных subagent-разведчиков (documents / payments / assessment / enrollment+crons / org+esign+exports) → **каждая находка состязательно проверена чтением кода** (большинство «находок» отсеяно как ложные: NestJS сам резолвит промис-обработчик; public-verify ищет по qrToken, а не reservedNumber; cron-сканеры пишут в durable side-stores, а не в read-only MVP-state — известный CRITICAL-паттерн **отсутствует**). Ветка `fix/2026-06-27-audit-latent-bugs`, 2 коммита (`e7331d0` CRITICAL-1/2, `703512b` CRITICAL-3+HIGH-4/5).
- **CRITICAL-1 — платежи: DB CHECK уже три боевых эквайера:** `payments.payments.provider` (migration 0054) допускал только `manual/noop/fake/yookassa`, но реестр провайдеров отгружает 4 адаптера (+ `tinkoff/cloudpayments/robokassa`); `createPayment` пишет `provider=provider.code` → любой платёж через 3 новых эквайера падал на CHECK реального Postgres. In-memory-репо CHECK'а не имеет → все юнит-тесты зелёные (латентно до первой не-ЮKassa оплаты). **Migration 0058** расширяет CHECK; проверено на throwaway-Postgres (до — tinkoff отвергнут, после — все 4 приняты, мусор отвергнут).
- **CRITICAL-2 — публичная QR-проверка читала пустой state:** `/public/verify/:token` инжектил **request-scoped** `DocumentsService` с пустым `InMemoryDocumentsState`, без persistence-интерсептора и без tenant-контекста → в проде любой реальный QR давал `not_found`; вся Plan C §5.8 фича мертва. Юнит-тесты маскировали это, преднаполняя тот же service-state. Фикс: кросс-tenant durable-поиск по `qrToken` (`findGeneratedDocumentByQrToken` в `DocumentsPersistenceBackend` — 3 импл.: memory/postgres/adapter; postgres-запрос `data->>'qrToken'` проверен на реальном Postgres) + чистый `buildPublicVerifyResult` (общий источник для in-tenant и публичного путей) + контроллер снят с request-scoped сервиса.
- **CRITICAL-3 — чтение результата теста сбрасывало `passed`:** `getAttemptResult`/`recalculateExamResults` пересобирали персистентный `ExamResult`, считая только `status='finished'`, тогда как `finalizeExamResult` (submit/finish/review) считает `['submitted','finished']`. `submitAttempt` оставляет попытку `'submitted'` (в `'finished'` ведут только `finishAttempt`/review), поэтому обычный GET сдавшего результата молча перегрейживал по нулю finished-попыток → `passed=false`, записывая порчу обратно (и в выпуск сертификатов/реестров). Фикс: единый фильтр `['submitted','finished']` в `recalculateExamResult`.
- **HIGH-4 — лицензионный гейт публикации игнорировал `validUntil`:** `findActiveLicensesFor` фильтровал только `status='active'`, а в `'expired'` лицензию **ничто не переводит** → просроченная лицензия проходила гейт Pillar A §5.10 вечно. Фикс: исключать `validUntil < today` (undefined = бессрочная). Гейт выглядел рабочим (BadRequest-путь оттестирован), отсутствовало именно измерение срока.
- **HIGH-5 — частичное исполнение платежа врало про `fulfilled`:** `PaymentFulfillmentService.fulfill` метил `enrolled` каждую позицию (даже с NULL `enrollmentId` для упавших слушателей) и безусловно флипал заказ в `fulfilled`, теряя `outcome.errors` → оплаченный заказ показывал полное исполнение при несозданных местах. Фикс: `enrolled` только при резолвнутом id, упавшие остаются `pending`, ошибки логируются, заказ → `fulfilled` лишь когда не осталось `pending` (иначе держим `paid` для ретрая).
- **Тест-статус (TDD RED→GREEN на каждый):** public-verify util/controller **13** + documents.service **54**, migrations.0058 **3**, test-player+mvp.service+business-flows+gating+pre-exam **126**, licenses **22**, payments fulfillment/service/webhook **17**; `pnpm typecheck` **8/8**; ESLint clean (pre-commit). **Migration 0058** (расширение CHECK), **без новых прав**. _Замечание:_ полный testcontainers full-chain локально флакает на 0013/0029 (`pg_namespace`/`pg_type` дубль на idempotency-прогоне) — пре-существующее, не от этой ветки, ниже 0058; CI = источник истины. _NB нумерация §:_ §5.147 на main = email-валидация (#281); фикс нумерации документов (отдельный PR #280) использует §5.147 на своей ветке — при слиянии обоих развести.

### 5.148 Полный `pnpm test:backend` доведён до зелёного из корня (устранён «Cyrillic-краш»)

- **Контекст:** задача «продолжай до тех пор, чтобы все тесты в коде стали зелёными». Прогон по модулям выявил, что единственный реально падающий бэкенд-файл — `mvp.domains.http.integration.test.ts` — даёт `tinypool ERR_IPC_CHANNEL_CLOSED` (fork-пул) / `ERR_WORKER_UNSUPPORTED_OPERATION` (threads-пул). Долгое время это списывалось на Cyrillic-путь (CLAUDE.md Gotchas).
- **Реальная причина №1 (DI-баг, замаскированный `process.abort()`):** конструктор `MvpController` получил два новых аргумента — `LearnerPdfCardService` (index 2) и `LearnersBulkImportService` (index 3), но ручной root-модуль в `mvp.domains.http.integration.test.ts` их не предоставлял. `NestFactory.create` бросал `UnknownDependenciesException`, а дефолтный `abortOnError:true` реагировал `process.abort()` — что жёстко роняет vitest-воркер и проявляется как IPC-краш. CI не запускается с 2026-05-27, поэтому регресс жил незамеченным. **Фикс:** добавлены оба провайдера как `Scope.REQUEST` (зеркало `MvpModule`) + `abortOnError:false` (будущая нехватка провайдера упадёт чистой ошибкой хука, а не убьёт пул). Файл: **37/37**, весь модуль `mvp` одной командой — **101 файл / 973 теста** зелёные.
- **Реальная причина №2 (нагрузочные boot-тайм-ауты):** при запуске **из корня** (`pnpm test:backend`, projects-режим) всплыли ещё 5 падений `Hook timed out in 30000ms` + латентный риск ещё в ~10 сьютах. У каждого Nest-бутящего `beforeAll` стоял **явный** `}, 30_000)`, перекрывавший глобальный `hookTimeout: 120000`; изолированно буут ~13с, но под CPU-конкуренцией полного сьюта пересекает 30с. **Фикс:** все **15** boot-хуков `*.http.integration` / `*.contract` подняты до `120_000` (как у `mvp.domains`).
- **Реальная причина №3 (cwd-зависимый путь):** `migrations.0055.test.ts` читал SQL через `process.cwd()/migrations/...` — резолвится только при cwd=`apps/backend`; из корня `ENOENT`. **Фикс:** `__dirname`-относительный путь (паттерн `migrations.0042`).
- **Тест-статус:** **полный `pnpm test:backend` теперь зелёный в один процесс — 244 файла / 1853 теста, 0 падений** (2 файла / 10 тестов skip — Docker-gated), без tinypool-краша. Frontend 646, contracts 7, worker 12, realtime 4, ui 16, shared-types 1, test-utils 1 — зелёные; monorepo typecheck 8/8; ESLint по изменённым файлам чисто. Изменены **только тест-файлы** (16 шт.) + CLAUDE.md Gotchas (актуализирован). **Без изменения продакшн-кода, миграций, прав.** Коммиты: `cec6ca9` (DI-фикс) + `026e4d4` (тайм-ауты + путь).

### 5.149 Аудит-хвост — 3 подтверждённых MEDIUM-бага закрыты (прогресс-знаменатель, дедуп сертификата, рассылка)

- **Контекст:** «покажи, что нужно дорабатывать в коде» → из проверенного-но-неисправленного хвоста аудита §5.148 (memory `project_prepilot_latent_bug_audit`, пункты a/b/c) выбраны 3 бага класса «in-memory-тесты зелёные, на боевом Postgres/при ретраях кусается». План `docs/superpowers/plans/2026-06-27-audit-tail-progress-dedup-notify.md`; subagent-driven (implementer + spec-review + code-quality-review per task + финальное холистическое ревью). Ветка `fix/2026-06-27-audit-tail-progress-dedup-notify`, 7 коммитов.
- **1c — знаменатель прогресса (`mvp.service.ts`):** `recalculateModuleProgress`/`recalculateCourseProgress` считали процент по **посещённым** материалам/модулям (`materialProgress`/`moduleProgress` создаются только при открытии) → преждевременные 100% и ложный допуск к аттестации. Переведено на **count-based** gate по полному набору: модуль — все **обязательные** материалы (`isRequired`), курс — все модули **закреплённой версии** записи (precedence: pinned через `groupCourses.courseVersionId` > published > версии из существующего прогресса). Извлечён хелпер `countBasedProgress`. Ревью поймало: опциональные материалы блокировали 100% (FIX isRequired); все published-версии раздували знаменатель v1-слушателю (FIX — скоуп на закреплённую версию). Коммиты `3fcf874`, `e9c72c2`, `0ea7697`.
- **1a — дубль сертификата (`documents.service.ts`):** идемпотентность авто-выпуска держалась только на 24-часовом TTL-кэше `state.idem` → повторный `ENROLLMENT_COMPLETED_EVENT` спустя >24ч (redelivery воркера / ручное переоформление) выпускал второй сертификат. Добавлен **durable**-гард: при наличии `sourceEntityType+sourceEntityId` возвращается существующая задача из `state.tasks` по `(tenant, templateId, source, taskType='generate', status ∉ {failed,cancelled})`; TTL-кэш остаётся быстрым путём. Ревью поймало баг с `cancelled` (отменённая задача блокировала легитимный перевыпуск). Коммиты `0b2316f`, `098a9ec`.
- **1b — потерянные получатели рассылки (`notification-dispatcher.service.ts`):** дедуп был на уровне всего dispatch, а запись доставки — по получателю; throw `mailer.send` на середине цикла навсегда «застревал» получателей #2…N (ретрай видел dedupKey первого и выходил). Переведено на **per-recipient** дедуп (`listByDedupKey` в репо — interface + in-memory + postgres) + `try/catch` вокруг каждой отправки (фейл пишет `failed`-строку и продолжает) + push-фан-аут только реально отправленным. Ревью добавило: контракт `MailerService.send` throw-safety (JSDoc), тест на смешанные строки failed→sent. Коммиты `2e54fe9`, `1a94d7e`.
- **Тест-статус:** все правки TDD (RED→GREEN подтверждён на каждый баг, в т.ч. до/после на cancelled и pinned-v1). `mvp.service` 100, documents 61+11+4, communication 13 — целевые 7 сьютов **193 теста зелёные**; **полный `pnpm test:backend` 246 файлов / 1876 тестов, 0 падений** (10 skip Docker-gated); typecheck **8/8**; ESLint clean (pre-commit). **Без миграций (последняя 0057), без новых прав, без изменения API-конвертов.**
- **Поведенческое изменение (намеренное):** курс/модуль теперь достигают 100% только когда пройдены **все обязательные** материалы/модули закреплённой версии — раньше засчитывались частично. Существующие тесты/E2E не опирались на старый баг (правок не потребовалось).
- **Отложенный мелкий хвост (из финального ревью, не блокер):** `recertification-scanner`/`course-deadline-scanner` логируют `emailsDispatched += recipients.length` — при ретрейе с уже-доставленными это слегка завышает лог-счётчик (только логирование; точная метрика потребует возврата `{sent,skipped,failed}` из `dispatch` и правки 4 вызывающих). Остаток аудита §5.148: пункты d–g (license-reminder dedupKey без `validUntil`; interceptor `finally` сохраняет частичные мутации; `completeTask` недостижимая ветка; `issueGroupOrder` неатомарность) — закрыты в §5.150.

### 5.150 Аудит-хвост (продолжение) — закрыты последние 4 бага d–g (dedup / атомарность персистенции / идемпотентность)

- **Контекст:** «продолжай» после §5.149 → закрыть оставшийся хвост d–g (memory `project_prepilot_latent_bug_audit`). Та же ветка `fix/2026-06-27-audit-tail-progress-dedup-notify` (e/f/g делят `documents.service.ts` с 1a — отдельная ветка конфликтовала бы; PR #284 расширен до полного хвоста a–g). План `docs/superpowers/plans/2026-06-28-audit-tail-dg-dedup-atomicity.md`; subagent-driven (implementer + ревью на задачу), d∥e параллельно, f→g последовательно. 4 коммита.
- **d — продлённая лицензия не напоминала (`license-expiry-scanner.service.ts`):** dedupKey `license:{id}:{milestone}` не включал `validUntil` → после продления (тот же id) новый срок переиспользовал milestone-ключ предыдущего → дедуп глушил напоминание. Фикс: `license:{id}:{validUntil}:{milestone}` (каждый срок — свой keyspace). Коммит `d4b7472`.
- **e — частичные мутации падающего хендлера (ОБА request-persistence interceptor'а):** `mvp` и `documents` interceptor'ы сохраняли state в `finally` → бросивший хендлер всё равно коммитил частичные изменения. Фикс: `saveFromState` только на успешном пути; при throw request-scoped state отбрасывается (чистый rollback). **Де-риск:** `AuditService` пишет в `audit.audit_log` напрямую (не через эти interceptor'ы) → аудит-попытки не теряются; load-фаза и все метрики сохранены байт-в-байт. Opus-ревью подтвердило конвенцию кодовой базы «validate-first, mutate-last» (никто не полагался на save-on-error). 4 HTTP-integration сьюта (149 тестов) зелёные. Коммит `09afed9`.
- **f — повтор `completeTask` 400'ил (`documents.service.ts`):** `completeTask` звал `startTask` ПЕРВЫМ, а тот бросает `Terminal task cannot be started` на `completed`-задаче → идемпотентная ветка (`status==='completed'`→вернуть документ) была недостижима → redelivery воркера получал 400. Фикс: проверка `completed` ДО `startTask` (`failed` по-прежнему бросает — терминал). Коммит `8cd9a02`.
- **g — приказ по группе не до-выпускал сертификаты при ретрае (`documents.service.ts`):** идемпотентная ветка `issueGroupOrder` возвращала только уже существующие сертификаты, не выпуская недостающие (частичный/выросший roster). Фикс: cert-каскад вынесен в `ensureOrderCertificates`, вызывается на ОБОИХ путях (existing+new) → ретрай добивает недостающие (within-order dedup сохранён). **Seam (e+g):** теперь выпуск приказа полностью retry-safe — e гарантирует чистый rollback при throw, g само-залечивает успешно-но-неполный приказ. Коммит `7acf6a9`.
- **Тест-статус:** все TDD (RED→GREEN на каждый). Целевые сьюты: license-expiry 6, оба interceptor'а 4 (новые файлы) + 149 HTTP-integration, documents.service 63 + issuance-journal/idempotency-concurrency/audit-completeness 30; **полный `pnpm test:backend` 250 файлов / 1885 тестов, 0 падений** (10 skip Docker-gated); typecheck **8/8**; ESLint по изменённым файлам чисто. **Без миграций (0057), без новых прав, без изменения API-конвертов.**
- **Поведенческое изменение (e, намеренное):** упавшая HTTP-мутация больше НЕ персистит частичный domain-state (аудит не затронут). Конвенция кодовой базы (validate-first) делает это безопасным; полный сьют зелёный. Аудит §5.148 хвост d–g — **полностью закрыт**.
- **Финальный follow-up (закрыт лог-счётчик):** `NotificationDispatcher.dispatch` теперь возвращает `{ sent, skipped, failed }`; три cron-сканера (recert/deadline/license) считают `summary.sent` вместо `recipients.length` → счётчик `emailsDispatched`/`remindersDispatched` больше не завышается при ретрае (per-recipient-дедуп). Listeners игнорируют новый возврат (backward-compatible). Коммит `d0d2182`; 47 целевых тестов + полный `pnpm test:backend` **250 файлов / 1887 тестов / 0 падений**, typecheck 8/8, ESLint clean. **Весь аудит-хвост a–g + follow-up — закрыт; открытых пунктов нет.**

### 5.151 Новый аудит-проход — 3 подтверждённых бага (1 CRITICAL + 1 HIGH + 1 MEDIUM) в непрочёсанных доменах

- **Контекст:** «продолжай улучшать код» после закрытия аудит-хвоста (§5.150). Ветка `fix/2026-06-28-audit-worker-retry-exam-timeout-ot-counter`. 4 параллельных subagent-разведчика по доменам, **ранее не прочёсанным** прежними аудитами: esign, assessment (тесты/попытки), bulk-import/enrollment + worker, IAM/sessions + integrations-экспортёры. Каждая находка **перепроверена чтением кода** лично (ложные/by-design отсеяны). Все 3 фикса — по TDD (RED→GREEN).
- **CRITICAL — воркер терял каждый ретрай (`apps/worker/src/main.ts`):** консьюмер звал `markProcessed` (вставка dedup-строки в `core.processed_message_ids`) **до** `processJob`. При транзиентном падении джобы ретрай републиковался с тем же `messageId`, но dedup-строка уже была → `markProcessed` возвращал `false` → сообщение `ack`-алось и пропускалось как дубликат. Любая bulk-enrollment, упавшая на первой попытке (мгновенный сбой БД/сети), **терялась навсегда** — retry/backoff-механизм был мёртв. Фикс: вынес решение в тестируемый шов `message-consumer.ts` (`consumeMessage`, паттерн `document-pipeline.ts`); порядок сменён на **проверить (`hasBeenProcessed`) → обработать → пометить ТОЛЬКО после успеха** (at-least-once вместо at-most-once). Безопасно: бэкенд-колбэк идемпотентен по `idempotencyKey` → переобработка в окне крэша не дублирует. +3 теста (включая регресс «failed-then-retry»). Петля консьюмера ранее была **полностью непокрыта** — это и скрыло баг.
- **HIGH — обход таймаута теста (`mvp.service.ts` `submitAttempt`):** при просрочке попытки строка ставила `status='expired'`, но ниже **безусловно** перезатирала на `'submitted'` (нет early-return) → просроченная попытка полностью оценивалась и принималась как `passed`. `saveAnswer`/`finishAttempt`/`assertAttemptWritable` уже трактовали `expired` как терминал — `submitAttempt` был единственным отклонением. Фикс: при просрочке финализировать как `expired` (+`finishedAt`, аудит `assessment.attempt_expired`) и выйти до начисления; просроченная попытка не учитывается в exam result (finalize/recalculate считают только `submitted|finished`). +1 тест.
- **MEDIUM — ОТ-экспортёр завышал `failed`/`total`/`totalCandidates` (`ot-registry.service.ts`):** `failed = errors.length` считал объекты ошибок, а не сущности; комплексный курс эмитит строку на (зачисление × программа), `validateRegistryRow` — ошибку на поле → одно проваленное зачисление с 2 программами × 2 плохими полями давало `failed=4`. Фикс: distinct-счёт по `enrollmentId` без валидной строки — зеркало сиблингов rostechnadzor/eisot. +1 тест (комплексный курс, обе строки невалидны → `failed=1`).
- **HIGH (follow-up #1, закрыт в той же сессии) — esign `startProcess` навсегда «кирпичил» процесс без участников (`esign.service.ts`):** мутировал `status='prepared'` ДО guard'а `hasParticipants`, затем бросал → процесс застревал в `prepared`, idem не записан; ретрай бил в `transitionProcess('prepared','prepared')` → невалидный переход → вечный «кирпич» (спасал только `cancel`); durable-singleton state делал застрявший статус живущим между запросами. Фикс: «validate-first, mutate-last» — проверка переходов и участников ДО любой мутации статуса (зеркало конвенции `submitApplication`/audit-tail e). +1 тест (старт без участников → статус остаётся `draft`, после добавления участника старт проходит).
- **MEDIUM (follow-up #2, закрыт в той же сессии) — `finalizeDocument` не идемпотентен (`documents.service.ts`):** безусловно ставил `status='final'`, писал critical-audit и звал `applySignature` без guard'а «уже финализирован». Два процесса подписи на один `generatedDocumentId` (createProcess блокирует только уже-`signed`) → каждое завершение звало `finalizeDocument` → **двойное наложение подписи** + дублирующие critical-audit `documents.finalized`/`documents.signed`. Фикс: `if (doc.isFinal) return doc` (early-return) — финализация уже-финального документа no-op; повторное подписание остаётся за `signDocument`. Бонус: повторная финализация **отозванного** документа больше не «разотзывает» его в `final` (revoke оставляет `isFinal=true`). +1 тест (двойная финализация → `provider.sign` вызван один раз). Точка фикса — convergence-point, defense-in-depth независимо от числа процессов.
- **MEDIUM (follow-up #3, закрыт в той же сессии) — esign `assertProcessMutable` слишком узок для ростера (`esign.policy.ts`/`esign.service.ts`):** один guard обслуживал два инварианта — «можно подписывать» (signParticipant, обязан пускать `in_signing`) и «можно менять состав подписантов» (create/update participant). Он блокировал только `signed`/`cancelled` → добавление участника на `in_signing`-процесс переоткрывало поток и могло сдвинуть sequential «следующего подписанта»; на `failed` — плодило orphan-строки. Фикс: **разделил guard'ы** — новый `assertProcessRosterMutable` (только `draft`/`prepared`) на createParticipant/updateParticipant; `assertProcessMutable` остался на пути подписи (пускает `in_signing`). +1 тест (create/update на `in_signing` и create на `failed` → throw; подпись на `in_signing` по-прежнему работает).
- **MEDIUM (follow-up #4, закрыт в той же сессии) — два финализатора писали разные поля в один `ExamResult` (`mvp.service.ts`):** `finalizeExamResult` (путь submit) ставил только `finalScore`, `recalculateExamResult` (путь read/finish) — только `bestScore`; оба пишут в одну запись `(tenant,test,enrollment,learner)`. Consumer, читавший «другое» поле, получал `undefined` → NaN ниже по стеку (frontend типизирует `finalScore` как required number; analytics читает `bestScore ?? finalScore`). `passed` совпадал, поэтому pass/fail не флипался. Фикс: оба финализатора пишут **оба** синонимичных поля (`finalScore`=`bestScore`=score лучшей попытки) + `passingScore`. +1 тест (после submit оба поля = 2; после read остаются согласованы). `status` ('final'/'active') не трогал — при текущем порядке вызовов (submit→finalize до read→recalculate) 'final' и так выигрывает.
- **MEDIUM (follow-up #5, закрыт в той же сессии) — bulk-import затирал строки одного слушателя (`learners-bulk-import.service.ts`):** `classifyRows` ловит внутрифайловые дубли только по идентичным email/СНИЛС; две строки, резолвящиеся в **одного существующего** слушателя по РАЗНЫМ полям (одна по email, другая по СНИЛС), обе классифицировались `reuse` → вторая затирала первую в `Map<learnerId, rowNumber>` → `reused` считался дважды, а первая строка теряла `enrollmentId`/`enrolled_only`. Фикс: в оркестраторе, если learnerId уже занят более ранней строкой батча, текущая помечается `failed`/`duplicate_in_file` (консистентно с `classifyRows`) — без затирания и двойного счёта. +1 тест (row2 reused+enrollmentId, row3 failed/duplicate_in_file, reused=1, failed=1).
- **Тест-статус:** worker 15/15 (typecheck+lint), backend целевые сьюты — test-player **14**, mvp.service 100, mvp.concurrency 2, business-flows.e2e 4, analytics-dashboard, ot-registry 34, **learners-bulk-import 38**, documents+esign 300; монорепо **typecheck 8/8**, ESLint по изменённым файлам чисто. **Без миграций (0057), без новых прав, без изменения API-конвертов.**
- **LOW (follow-up #7, закрыт в той же сессии) — webhook timing-unsafe сравнение (`webhook-signature-verifier.service.ts`):** `signature !== secret` — не constant-time сравнение статического общего секрета (теор. timing-атака по байтам). Фикс: `constantTimeEqual` — хэшируем обе стороны в sha256-дайджест фиксированной длины, затем `crypto.timingSafeEqual` (нет утечки длины). Часть «skip при пустом секрете» **намеренно оставлена**: секрет обязателен в prod/staging (env.schema:405), пустой бывает только в dev/test, где fail-closed сломал бы локальную разработку. +2 теста (валидная подпись проходит; префикс секрета отклоняется).
- **LOW (follow-up #8, закрыт в той же сессии) — удалён мёртвый дублёр-грейдер `calculateAttemptScore` (`mvp.service.ts`):** приватный метод без единого вызова, со слабой логикой (читал `answerOptionIds` вместо `selectedOptionIds`, `maxScore` вместо `score`, засчитывал любой непустой text как верный). Удалён, чтобы будущий мейнтейнер не подключил его по ошибке. Без тест-ссылок → без новых тестов.
- **Все 8 подтверждённых follow-up'ов закрыты, кроме #6.** Открыт остаётся только: (6) **HIGH-ish (спорно)** идемпотентность bulk: кэш отдаёт устаревший outcome при повторе ключа с другим телом (нет request-hash) — это **стандартный контракт идемпотентности** (ключ идентифицирует операцию), а не баг; менять поведение рискованно без явного решения владельца. **Оставлено намеренно.**

### 5.152 Стабилизация — латентный аудит, 7 фиксов (2 HIGH + 1 MED-HIGH + 3 MED + 1 frontend data-loss)

- **Контекст:** цель сессии `/goal` «стабилизируй максимально проект». Baseline уже зелёный (typecheck 8/8, lint 8/8, backend 1896, frontend 646, contracts 7). 4 параллельных subagent-аудитора по доменам assessment / documents-issuance / bulk-import+worker / progress-notifications-schedulers; каждая находка **перепроверена чтением кода лично** (by-design/ложные отсеяны). Все фиксы — с тестами (где конвенция позволяет). Не закоммичено.
- **HIGH — архивный сертификат публично проходил как `valid` (`documents/public-verify.util.ts`):** `buildPublicVerifyResult` мапил в non-valid **только** `revoked`; `archived` (админ-изъятие, отдельное от `revoked`) возвращал `status:'valid'` с номером/идентификатором. Регулятор по QR видел изъятый документ подлинным. Фикс: `archived` → минимальный `{ status: 'not_found' }` (не светим номер/ID изъятого), зеркалит контроллерный путь. Покрывает оба пути (`PublicVerifyController` + `verifyDocumentByQrToken`). +1 тест.
- **HIGH — bulk-import: `dateOfBirth` был недостижим по HTTP (`learners-bulk-import.dto.ts`):** сервис (`classifyRows`) и тип `BulkImportRow` читают `dateOfBirth` (для ФИС ФРДО), но поле отсутствовало в `BulkImportRowDto`; `assertValidDto` с `forbidNonWhitelisted:true` отвергал **весь** запрос, как только клиент слал dateOfBirth → фича мертва по HTTP (unit-тест её проходил, т.к. зовёт сервис мимо DTO). Фикс: `@IsOptional() @IsString() @MaxLength(10) dateOfBirth?`. Новый файл `learners-bulk-import.dto-validation.test.ts` (+5 тестов).
- **MED-HIGH — дубль письма при повторе адреса в одной рассылке (`communication/notification-dispatcher.service.ts`):** `alreadyDelivered` строился только из прошлых DB-строк по `dedupKey`; в пределах одного вызова один адрес (staff = employer contactEmail; либо разный регистр `Learner@`/`learner@`) слался дважды. Фикс: `normalizeEmail` (trim+lowercase) + `seenThisRun`-сет внутри цикла + нормализация кросс-run набора. +2 теста.
- **MED — выдача набора документов прерывалась на первом плохом шаблоне (`documents/enrollment-document-issuance.listener.ts`):** throw на одной записи (архивный шаблон/нет активной версии) обрывал цикл → частичный набор без success-аудита; событие через in-process EventEmitter (setImmediate) → автоповтора нет → слушатель мог не получить **ни одного** документа. Фикс: per-entry try/catch, `count`=фактически выданных + `requested` + `failures` в аудите `_issued`, плюс `_failed` для алертинга; durable-dedup в `generateDocument` гарантирует отсутствие дублей при ре-эмите. +1 тест (плохой шаблон сортируется первым → валидный всё равно выдаётся).
- **MED — `finishAttempt` воскрешал просроченную попытку (`mvp/mvp.service.ts`):** §5.151 добавил early-return в `submitAttempt` (просрочка → `expired`), но `finishAttempt` звал `submitAttempt` и **безусловно** ставил `status='finished'`, перезатирая `expired`/любой терминал → просроченная попытка попадала в exam result как `finished` (defeating таймаут). Фикс: `if (submitted.status !== 'submitted') return submitted;` до перехода в `finished` (теперь идемпотентен и на уже-`finished`). +1 тест (просрочка → finish сохраняет `expired`).
- **MED — дубль `rowNumber` схлопывал outcome-строки (`learners-bulk-import.dto.ts`):** весь конвейер импорта индексируется по `rowNumber`; два одинаковых rowNumber → вторая outcome-строка затирала первую в Map, созданный по первой ученик пропадал из отчёта при count «2 created». Фронтенд нумерует строки по позиции в Excel (уникальны) → дубль = искажённый запрос. Фикс: `@ArrayUnique((row)=>row.rowNumber)` (структурный отказ; partial-success — про бизнес-валидацию, не про искажённый запрос). +2 теста.
- **frontend (data-loss) — потеря ответа при автосейве (`features/test-player/test-attempt-screen.tsx`):** дебаунс автосейва 1500мс с `clearTimeout` в cleanup; быстрый переход «Далее»/«Назад» в окне дебаунса отменял сохранение, а сабмит последнего вопроса уходил **до** срабатывания дебаунса → итоговый ответ не сохранялся, попытка оценивалась без него. Фикс: `flushDraft(questionId)` — синхронный сейв грязного черновика перед навигацией и сабмитом (двойной сейв идемпотентен). RTL в проекте нет → проверено typecheck/ESLint; логика зеркалит существующий payload-билдер.
- **Тест-статус:** целевые backend-сьюты зелёные — documents public-verify 5, issuance-listener 12, dispatcher 13, bulk-import dto-validation 5, bulk-import service 38, test-player 15, mvp.service 100, business-flows.e2e 4; полный `pnpm test:backend` — **250/251 файлов зелёные, 1904 теста pass / 12 skip** (новых тестов +10, файлов +1); единственный «fail» — `health.http.integration.test.ts` (boot `beforeAll` `bootstrapHealthHttpApp` тайм-аутнул под экстремальным CPU-контеншеном, прогон занял 410с против ~205с baseline) → **в изоляции 4/4 зелёный**; это документированный средовой класс (boot-hook timeout под нагрузкой), не регрессия (изменения не трогают health/migrations). `pnpm test:frontend` **106/646**, **typecheck 8/8**, ESLint по изменённым файлам чисто. **Без миграций (последняя 0057), без новых прав, без изменения API-конвертов.** Прим.: не запускать два полных vitest-сьюта одновременно в фоне — CPU-контеншен под Cyrillic-путём даёт `ERR_IPC_CHANNEL_CLOSED` (tinypool teardown) либо boot-hook timeout; гонять по одному.
- **Открытый follow-up (спавн-таск):** bulk-import reuse-детекция ограничена первой страницей 10 000 слушателей (`listLearners page_size:10_000`) → для тенанта >10k существующий слушатель за порогом классифицируется `create`, а `createLearnerExtended` не проверяет уникальность email/СНИЛС → молчаливый дубль. LOW/MED (нужно >10k/тенант), вынесено в отдельную задачу. **→ Закрыто в §5.153.**

### 5.153 Закрыт отложенный follow-up §5.152 — bulk-import reuse-детекция за порогом 10k

- **Контекст:** закрытие единственного открытого follow-up'а §5.152 (отложен как LOW/MED — нужен тенант с >10k слушателей). Фикс по TDD (RED→GREEN). Не закоммичено.
- **Баг (`learners-bulk-import.service.ts`):** snapshot существующих учётков для reuse-детекции строился из одной страницы — `listLearners(tenantId, { page: 1, page_size: 10_000 })`. `MvpService.list()` режет результат `items.slice(0, 10_000)`, поэтому у тенанта с >10k слушателей учёток за границей страницы **не попадал в snapshot** → строка импорта, совпадающая с ним, классифицировалась `create` вместо `reuse`. А `createLearnerExtended` **не проверяет уникальность** email/СНИЛС (`state.learners.push`) → импорт **молча создавал дубликат**.
- **Фикс (целевой lookup, без cap'а):** новый `MvpService.findLearnersByEmailOrSnils(tenantId, emails, snilsValues)` сканирует **все** учётки тенанта (без page-cap) и возвращает только совпавшие по email (case-insensitive) / нормализованному СНИЛС из строк импорта; память ограничена размером импорта, а не числом учётков тенанта. Оркестратор bulk-import строит snapshot из результата. Корректно и для Postgres-бэкенда: `PostgresMvpPersistenceBackend.readSnapshot` грузит учётки тенанта **без LIMIT** → `state.learners` всегда полон, единственным местом усечения был `slice` в `list()`. Классификация эквивалентна прежней (включая ветку `identity_conflict`).
- **Тест (`learners-bulk-import.service.test.ts`):** регресс — сидируем 10 000 наполнителей в state, целевой учёток создаём ПОСЛЕ них (индекс 10 000, за старой границей; sanity-ассерт `total=10_001` и «нет в первой странице 10k»), импортируем строку с его email → ожидаем `reused`/`reused=1`/`created=0` + отсутствие дубликата. До фикса падал `expected 'created' to be 'reused'` (RED подтверждён).
- **Тест-статус:** learners-bulk-import **39/39** (был 38 + 1 новый); backend **typecheck 8/8** (turbo), ESLint по 3 изменённым файлам чисто. **Без миграций (последняя 0057), без новых прав, без изменения API-конвертов.**

### 5.154 Новый аудит-проход — 8 подтверждённых багов (2 CRITICAL + 3 HIGH + 3 MEDIUM), кросс-доменный

- **Контекст:** «найди и устрани максимальное количество багов» (systematic-debugging). 6 параллельных subagent-разведчиков по доменным группам (iam/auth · mvp learners/bulk · documents/esign · assessment · communication/integrations/org · frontend); **каждая находка перепроверена чтением кода** перед фиксом; все фиксы по TDD (RED подтверждён до фикса, кроме §1 где RED показан revert-проверкой). Затронуто 0 миграций / 0 новых прав / 0 изменений API-конвертов.
- **Фикс #1 (esign, CRITICAL+HIGH+MEDIUM) — `esign.service.ts`:** `tryCompleteProcess` помечал процесс `signed` и **финализировал регулируемый документ при НУЛЕ реальных подписей** (все участники `skipped`), а также воскрешал терминальный (`cancelled`) процесс в `signed` через поздний `skipParticipant` (отмена не транзишнит участников; `pending→skipped` легальна). Фикс (defense-in-depth): `skipParticipant` теперь зовёт `assertProcessMutable` (как `signParticipant`); `tryCompleteProcess` завершает только `in_signing` + требует ≥1 фактически `signed` + проводит через `EsignStateMachine.transitionProcess`. +2 регресс-теста; esign **79/79**.
- **Фикс #2 (mvp, CRITICAL) — `mvp.service.ts` + `learners-bulk-import.types.ts`:** `BulkImportIdempotencyRecord` сохранялся **без `id`**, а `bulkImportIdempotency` входит в `MVP_COLLECTIONS` → Postgres-снапшот (`id text NOT NULL` PK) падал после **каждого** успешного bulk-import → терялась вся персистенция стейта тенанта (только prod/Postgres; невидимо в memory-режиме тестов). Фикс: добавлен `id` в тип + `this.id('bulkimportidem')` в `saveBulkImportOutcome` (зеркало `bulkEnrollmentIdempotency`). +1 регресс-тест с fake-DB, воспроизводящим NOT NULL.
- **Фикс #3 (iam, security) — `magic-link.service.ts` + оба репозитория:** TOCTOU в `redeemLink` — `loadValidRecord` проверяет `consumedAt`, затем `markConsumed` (возвращал `void`) пишет отдельно → две гонящиеся redeem-операции по одному single-use токену обе выпускали сессию. Фикс: `markConsumed` → `Promise<boolean>` (Postgres через `returning id`, in-memory через флаг); `redeemLink` бросает `consumed` при 0 строк. +1 регресс-тест.
- **Фикс #4 (common, security) — `tenant.guard.ts`:** unauthenticated-ветка брала путь из `request.route?.path ?? request.path ?? request.url`; `request.url` несёт query-string → `?redirect=/auth/esia/cb` / `?next=/auth/login` проходили `includes('/auth/esia/')` / `endsWith('/auth/login')` и обходили гард (spoof `x-tenant-id`, `userId` undefined). Фикс: `.split('?')[0]` — решение по PATH, не query. +2 регресс-теста.
- **Фикс #5 (frontend, HIGH) — `navigation/model.ts`:** nav-ссылка «Мои документы» (`/learner/documents`) **не имела записи `routeMeta`** → `resolveRouteMeta` → null → `evaluateRouteAccess` `not-found` → клик по ссылке давал 404 (страница существует). Фикс: добавлена запись `routeMeta` (`enrollments.read`). +2 теста (точечный + инвариант «каждая nav-ссылка резолвится»).
- **Фикс #6 (mvp assessment, HIGH) — `mvp.service.ts`:** `finishAttempt` безусловно гнал `submitted→finished` даже для попытки с эссе (ручная проверка) → ответы замораживались на провизорном 0, попытка выпадала из reviewer-queue (только `submitted`) и блокировала `completeAttemptReview` (требует `submitted`) → невозможно проверить эссе. Фикс: `finishAttempt` оставляет `submitted`, если есть ответ `autoGraded===false` (предикат зеркалит `aggregateReviewerQueue`). +1 регресс-тест.
- **Фикс #7 (mvp assessment, HIGH) — `mvp.service.ts`:** гейт итогового (course-level) экзамена `requiredPriorModules` собирал обязательные модули **со ВСЕХ версий курса** (включая `draft`/`archived`) → черновая версия с гейтящим модулем ретроактивно запирала всех учащихся опубликованной версии. Фикс: scope PINNED > PUBLISHED > all (зеркало `recalculateCourseProgress`). _Примечание:_ `GroupCourse.courseVersionId` (pinned) нигде не присваивается в проде → de-facto работает published-fallback (отдельный latent-gap, см. follow-up). +1 регресс-тест (red подтверждён revert-проверкой).
- **Фикс #8 (mvp reminders, MEDIUM/latent) — `course-deadline-scanner.service.ts`:** `dedupKey` дедлайн-напоминания не включал `plannedEndAt` (в отличие от deliberately-fixed §5.150 license-scanner `license:{id}:{validUntil}:{milestone}`) → при сдвиге дедлайна тот же milestone дедуп-подавлялся навсегда. Latent (нет edit-пути для `plannedEndAt` сегодня). Фикс: `deadline:{id}:{plannedEndAt}:{milestone}`. +1 регресс-тест.
- **Тест-статус:** объединённый прогон затронутых наборов зелёный — esign 79, magic-link 20, guards 8, reminders (course-deadline 9 + смежные), module-gating 7, postgres-persistence 1, learners-bulk-import 39, mvp.service 101, business-flows.e2e 4; **backend typecheck 8/8**, frontend typecheck чисто, navigation/helpers 15; ESLint по изменённым src чисто.
- **Намеренно отложено (follow-up'ы, задокументированы как spawn-задачи):** frontend cannot-unset (program-meta / commission description — нужен cross-layer null-clear), payment fulfillment retry dead-end (идемпотентный replay упавших слушателей), ~~group-order дубль-сертификат vs auto-issue~~ **(закрыт в §5.155)**, ~~провизорный `ExamResult` `final/passed` до ручной проверки эссе~~ **(закрыт в §5.156)**, in-memory `resolvePermissions` мёртвый conditional (non-prod, LOW), `GroupCourse.courseVersionId` pinning не подключён end-to-end.

### 5.155 Закрыт follow-up §5.154 — кросс-потоковый дубль-сертификат (group-order vs авто-выдача), MEDIUM

- **Контекст:** закрытие отложенного follow-up'а из §5.154 («group-order дубль-сертификат vs auto-issue»). Подтверждение бага по spec (systematic-debugging) → фикс по TDD (RED→GREEN, граничный кейс — revert-проверкой). Не закоммичено.
- **Подтверждение, что это баг (а не намеренный перевыпуск):** §17 ТЗ перечисляет «аннулирование и **перевыпуск**» как _контролируемую_ операцию; в коде `reissueDocument` всегда `revoke` оригинала + новый номер со связкой `replaces/replaced_by` → у слушателя никогда нет ДВУХ действующих номеров одновременно. Групповой приказ же выпускал второе валидное удостоверение (оба `status='generated'`) без аннулирования — для регулируемого ДПО два действующих регистрационных номера на одну аттестацию недопустимы. Сам §5.154 уже числил это как баг-follow-up.
- **Root cause:** два потока выдачи дедупят в непересекающихся keyspace'ах. Авто-выдача при завершении (`enrollment-document-issuance.listener` → `generateDocument`→`completeTask`) кладёт `generated_document` **без** `groupOrderDocumentId` и дедупит по `state.tasks`. `issueGroupOrder.ensureOrderCertificates` дедупил только по `groupOrderDocumentId === order.id` → не видел авто-выданное удостоверение и чеканил второе с новым номером.
- **Фикс — `documents.service.ts` `ensureOrderCertificates`:** перед чеканкой добавлена кросс-потоковая дедупликация: если для `(tenant, enrollment, certificateTemplateId)` уже есть **действующее** (`status !== 'revoked'`) удостоверение из любого потока — переиспользуем его (back-link на приказ через `groupOrderDocumentId`, если ещё не привязано + аудит `documents.certificate_reused_in_order`), а не плодим дубль. Аннулированное (revoked) удостоверение НЕ блокирует — это легальный сценарий перевыпуска через приказ. Within-order идемпотентность сохранена без изменений.
- **Scope-решение:** дедуп нацелен на _материализованные_ `generated_document` (не на pending-таск авто-выдачи). Пропуск по ещё не отрендеренному таску рисковал бы оставить слушателя с НУЛЁМ удостоверений, если таск затем упадёт; доминирующий реальный порядок (когорта завершает → удостоверения материализуются → админ выпускает приказ) полностью покрыт. Узкая гонка «приказ во время рендера авто-выдачи» и обратное направление (`generateDocument` не видит order-cert) задокументированы как остаточный latent-gap.
- **Тесты (`documents.service.test.ts`, блок `issueGroupOrder`):** +2 кейса — (1) `reuses an already auto-issued certificate instead of minting a duplicate (cross-flow dedup)` (RED подтверждён: до фикса 2 действующих удостоверения), (2) `re-issues a fresh certificate via the order when the prior one was revoked (controlled перевыпуск)` (граница: revoked не блокирует; RED подтверждён revert-проверкой). Прогон: documents-модуль **227/227** зелёный; ESLint по `documents.service.ts` + `.test.ts` чисто; backend typecheck чисто. Без миграций / новых прав / изменений API-конверта.

### 5.156 Закрыт отложенный follow-up §5.154 — провизорный `ExamResult` `final/passed` до ручной проверки эссе (MEDIUM)

> Нумерация: §5.155 параллельно занят коммитом `a5ddfd3` на основной ветке (cross-flow dedup удостоверений) — эта работа переименована в §5.156 во избежание коллизии при merge.

- **Контекст:** один из задокументированных §5.154 follow-up'ов. `submitAttempt` → `finalizeExamResult` писал `ExamResult` со `status:'final'`, `passed:true` по авто-проверяемому подытогу, пока эссе ещё ждёт `completeAttemptReview`. Если auto-вопросы в одиночку набирали `passingScore`, результат публиковался как «сдал» **до** человеческой оценки → `isExamPassed` открывал гейт следующего модуля, а pass-rate аналитики засчитывал провизорный pass. Для регулируемой аттестации (ТЗ §35 «ручная проверка эссе/кейсов», приёмка §39) — публикация ложного «сдал». §5.154 фикс #6 уже оставлял саму попытку в `submitted` для ревью, но `ExamResult` всё равно публиковался преждевременно.
- **Фикс — `mvp.service.ts` + `analytics-dashboard.ts`:** `passed` теперь считается только по **полностью оценённым** попыткам (`computeExamPassState`): попытка со статусом `submitted` и любым ответом `autoGraded===false` (`attemptAwaitsManualReview`) исключается из расчёта pass и помечает результат `status:'needs_review'`, `passed:false` — и так до `completeAttemptReview`, который доводит до `final`/`passed` по reviewed-баллам. Та же логика продублирована в `recalculateExamResult` (чтение/finish не должны повторно порождать провизорный pass). `isExamPassed` (гейтинг модулей) и аналитика (`getKpiSnapshot`, `analytics-dashboard.computeAnalyticsDashboard`) защищены guard'ом `status!=='needs_review'`. Регулируемые реестры (`ot-registry`, `rostechnadzor`) читают `Boolean(exam.passed)` → корректны автоматически. `bestScore`/`finalScore`/`attemptsCount` и auto-only путь без изменений — `passed` намеренно decoupled от `bestScore` на время review-окна. `needs_review` — значение свободной строки `BaseEntity.status` (нулевое влияние на контракт/типы/фронтенд).
- **TDD:** +5 тестов (`§5.156` в `mvp.service.test.ts`): провизорный submit не публикует pass; `needs_review`→pass после review; auto-only регресс-гард; гейт модуля заперт во время review и открывается после; аналитика не считает provisional за pass. RED подтверждён до фикса.
- **Тест-статус:** прогон в **изолированном git worktree** (на ветке конкурентно правил `mvp.service.ts` другой агент — изоляция ради когерентности фикса): **162/162 зелёных** по 8 файлам — mvp.service (106), test-player (15), module-gating (7), business-flows.e2e (4), analytics-dashboard (4), mvp.concurrency (2), ot-registry (15), rostechnadzor (9). Без миграций / новых прав / изменений API-конверта.
- **Ветка:** `fix/exam-provisional-pass-5156` (worktree `C:/Users/karka/ts-exam-wt`), от §5.154 (HEAD), для merge в основную.

### 5.157 Закрыт follow-up §5.154 — frontend cannot-unset (clear-vs-keep контракт для форм редактирования)

- **Контекст:** баги «нельзя очистить ранее заполненное опциональное поле» в формах редактирования (`apps/frontend`). Корень структурный: три слоя независимо трактуют отсутствие ключа как «оставить» — фронтенд опускал пустые поля, `JSON.stringify` (`client.ts:69`) выбрасывает `undefined`, сервис гардит `if (request.X !== undefined)`. Работа по brainstorming → spec → plan → TDD в изолированном git-worktree от `d6dd915`. 0 миграций / 0 новых прав / 0 изменений API-конвертов / **без `contracts:generate`** (эти MVP-эндпоинты не в `packages/api-contracts`).
- **Контракт clear-vs-keep:** `null` очищает enum/число/FK (`trainingType`/`learnerCategory`/`studyForm`/`finalAssessmentForm`/`academicHours`/`commissionId`), `[]` — массивы (`regulatoryBasisCodes`/`otProgramCodes`), `''` — свободный текст (`description` комиссии); опущенный ключ = «оставить».
- **Backend — `mvp.dto.ts` + `mvp.service.ts`:** `UpdateProgramMetaRequest` — поля расширены до `| null` (только TS-типы; `@IsOptional()` уже пропускает `null`, мусор по-прежнему отклоняется). `updateProgramMeta` нормализует `null → undefined` (`?? undefined`) — типы сущностей остаются `?: T`, `JSON.stringify`-персистенция роняет ключ, publish-гейт (`!cv.trainingType`) по-прежнему блокирует публикацию очищенного черновика. Гард существования комиссии `!== undefined` → `!= null` (иначе очистка бросала `commission_not_found`). **Баг B (commission description) оказался чисто фронтовым** — сервис уже корректно писал `''`.
- **Frontend — `payloads.ts` (new) + `types.ts` + `screens.tsx`:** clear-vs-keep маппинг вынесен в чистые экспортируемые функции `buildProgramMetaPatch` / `buildCommissionInfoPayload` (юнит-тестируемы без RTL); `ProgramMetaPatch` расширен до `| null`; формы (обе предзаполняются текущими значениями → «всегда отправляем все поля» безопасно round-trip’ит нетронутые) теперь зовут билдеры вместо omit-when-empty.
- **TDD:** service-тесты `updateProgramMeta` (RED→GREEN: `trainingType:null`→undefined, `commissionId:null`→detach без throw, clear-one-keep-rest) + LOCK (`regulatoryBasisCodes:[]`, `updateCommission({description:''})`); DTO-валидация (null/`[]` приняты, `UpdateCommissionRequest` `''`); frontend `payloads.test.ts` (5 кейсов).
- **Тест-статус:** mvp.service 106, mvp.dto-validation 128, frontend payloads 5 + api.contract 7 — зелёные; **monorepo typecheck 8/8**; ESLint по изменённым src чисто (pre-commit `--max-warnings=0`).
- **Примечание по интеграции:** ветка `fix/2026-06-29-clear-vs-keep-edit-contract` от `d6dd915`; **PR #294** (base `fix/2026-06-29-audit-7-bug-fixes`). База за время работы ушла вперёд (§5.155 кросс-потоковый дубль, §5.156 эссе-аттестация уже заняты) → эта запись перенумерована §5.155 → **§5.157**; обновлённая база смёрджена в ветку, конфликт README §2 разрешён вручную (взята свежая версия базы + добавлена запись §5.157).

### 5.158 Закрыт follow-up §5.154 — мёртвый conditional в DB-less `resolvePermissions` (cleanup, LOW)

- **Находка — `iam.service.ts` `resolvePermissions`:** в DB-less ветке (`!databaseService`, только dev/тесты) код вычислял `roleIds` и проверял admin-роли, но **обе ветки возвращали идентичный** `fallbackPermissions` → admin-проверка мёртвая, вводила в заблуждение. Нулевой prod-импакт (в проде всегда DB → role-gated SQL). Фикс: свёрнуто в один `return` + поясняющий комментарий + характеризующий тест (non-admin получает полный fallback-набор). permission/guard 6 зелёных. Без поведения/миграций/прав. Коммит §5.158.

### 5.159 Закрыт последний follow-up §5.154 — `GroupCourse.courseVersionId` pinning (latent, brainstorming→spec→plan→subagent-driven)

- **Находка (latent):** `GroupCourse.courseVersionId` типизирован, module-gating читает его (PINNED>PUBLISHED>PROGRESS, §5.154 #7), но `createGroupCourse` его **никогда не присваивал** → при >1 одновременно published-версии PUBLISHED-fallback берёт модули со ВСЕХ → слушатель v1 запирался обязательными модулями v2. Решение владельца — минимальная сантехника (YAGNI). Фикс — хелпер `latestPublishedVersionId` + auto-pin `createGroupCourse` к latest published (по `versionNo`) условным спредом; read-side не тронут. Spec/план: `docs/superpowers/specs/2026-06-30-group-course-version-pinning-design.md`, `docs/superpowers/plans/2026-06-30-group-course-version-pinning.md`. Полный цикл brainstorming→spec→plan→subagent-driven (spec+quality review). TDD +5 (falsifiability-пара pinned→unlocked / unpinned→locked); module-gating 9 + mvp.service зелёные. Без миграций/прав. Коммиты `7e70d5b`+`4124008`.

### 5.160 Новый аудит-проход «максимум багов» — 7 подтверждённых (3 HIGH + 3 MEDIUM + 1 LOW), кросс-доменный

- **Контекст:** после закрытия хвостов §5.154 — новый аудит-проход. 6 параллельных subagent-разведчиков (opus) по доменным группам: communication/reminders · org/licenses/payments · regulatory-exports/integrations/files · mvp-core-lifecycle · iam/auth/security · frontend-data-flow. **Каждая находка перепроверена мной чтением кода** перед фиксом (часть отсеяна как intended/недостижимое); все фиксы по TDD (RED подтверждён, для security-фикса #2 — revert-проверкой). Чистыми (после 11 проходов) оказались: communication/reminders, regulatory exports/files/SCORM, crypto/magic-link/guards/ЕСИА — разведчики честно отчитались «без новых HIGH/CRITICAL».
- **Фикс #1 (mvp assessment, HIGH) — `mvp.service.ts` `submitAttempt`:** незаполненное эссе (нет answer-row) теряло маркер `autoGraded:false` (`if (answer)` пропускал) → `attemptAwaitsManualReview` не видел pending → публиковался преждевременный `passed:true/final` до ручной проверки (дыра в §5.156); вдобавок blank-эссе было непроверяемо (`completeAttemptReview` бросает «No answer recorded»). Фикс: при submit засеивается stub answer-row (`autoGraded:false`) для неотвеченных manual-вопросов → результат `needs_review` И проверяем. +2 теста. Коммит-серия §5.160.
- **Фикс #2 (mvp, HIGH security/IDOR) — `mvp.service.ts` + `mvp.controller.ts`:** `listEnrollments`/`getEnrollment`/`listProgress`/`getProgress`/`listEnrollmentStatusHistory` фильтровали только по `tenantId` — без ownership-фильтра (assessment-пути захарднены, эти пропущены). Слушатель (`enrollments.read`+`progress.read`, без cross-learner bypass) читал чужие enrollments/progress/status-history по списку/перебору ID. Фикс: проброс `{actorId, permissions}` из контроллера + тот же guard (`assertAssessmentReadAllowedForLearner`/`restrictLearnerIdsForAssessmentList`; прогресс резолвит ownership через enrollment). +3 теста, RED через revert-проверку.
- **Фикс #3 (frontend/iam, HIGH) — backend-гидрация прав:** `session.permissions` деривились исключительно клиентски из рукотворной `rolePermissionMap`, разошедшейся с backend-грантами (migration 0010 даёт админам ВСЕ права; карта — короткий subset) → реальные `platform_admin`/`tenant_admin` молча теряли ~20 nav-разделов (403/404). e2e проверял только legacy-разделы → дрейф не ловился. Фикс (выбор владельца — backend SSOT): `/auth/me` возвращает `iam.resolvePermissions`; `MeResponse = CurrentUser & {permissions}`; `session-manager` гидрирует из него; статическая `permission-map.ts`+тест **удалены** (дрейф структурно невозможен). +тесты (me-контракт, session-manager, bootstrap-e2e).
- **Фикс #4 (payments, MEDIUM) — идемпотентность платежа:** `markPaid` писал `idempotency_key='manual:<orderId>'`, но уникального индекса по нему не было → два конкурентных `mark-paid` проходили неатомарный `assertOrderTransition` и оба вставляли `succeeded`-строку → двойная выручка в отчётности. Фикс: in-memory repo дедупит по `(tenant, key)`; Postgres `createPayment` — `ON CONFLICT` по новому partial unique index (**migration 0059**) → возврат существующей строки. +1 тест.
- **Фикс #5 (mvp, MEDIUM) — `upsertMaterialProgress`:** `studiedSeconds` писался из запроса напрямую + `completedAt = completed ? now : undefined` → меньший cumulative-отчёт watch-трекера де-комплитил материал (status→in_progress, completedAt=null, completedCount<100%). Фикс: монотонный latch (`studiedSeconds=max(existing,reported)`; завершённый материал остаётся завершённым, сохраняет `completedAt`); бонусом закрыта латентная SCORM-completion-регрессия. +1 тест.
- **Фикс #6 (integrations, LOW) — `webhooks.controller.ts`:** `publishIntegrationEvent('…received')` шёл до `verifier.verify` → неаутентифицированный вызыватель эмитил realtime-событие подписчикам до отказа (шум/мини-DoS). Фикс: verify перед первым publish. +1 тест.
- **Отложено (follow-up):** CloudPayments `providerPaymentId` mismatch — `createPayment` хранит `Model.Id` (order GUID), webhook ищет по `TransactionId`/`InvoiceId` → возможно, оплата не находит заказ и слушатель не зачисляется. HIGH-подозрение, но зависит от фактического контракта CloudPayments (известный «сверить с доками/песочницей перед go-live» из §5.139) → не чиню вслепую, помечено к сверке. Также LOW-наблюдения (broadcast-уведомления readAll, revoked-token self-read, self-order pricing) — недостижимы/design-gap, не баги.
- **Тест-статус (всё зелёное):** backend mvp.service 120 + module-gating/test-player/business-flows + payments repo/service + iam auth 14 + integrations webhooks; frontend e2e+auth **225** (30 файлов); **typecheck 8/8**; ESLint по всем изменённым файлам чисто. **Migration 0059** (partial unique index payments), без новых прав. Каждый фикс — отдельный коммит §5.160.
- **Второй (глубокий) проход по доменам с находками** (assessment / learner-data-IDOR / payments-adapters) — прицельная разведка соседних багов, часть inline. **Фикс #7 (mvp assessment, MEDIUM) — `completeAttemptReview`:** ревью финализировало попытку, не требуя оценить ВСЕ manual-ответы — оценивались только `questionId` из `answerScores`; прочие `autoGraded:false` (второе эссе / misconfigured-auto / §5.160 stub-row) оставались на провизорном 0, но попытка уходила в `finished`/из `needs_review` → регулируемый false-fail (слушатель со сданным неоценённым эссе попадал в registry как «не сдал»). Фикс #1 (§5.160) расширял экспозицию. Фикс: validate-first — отказ (`validation_error` со списком unscored `questionId`), если не покрыт хотя бы один manual-ответ. +1 тест (2 эссе: оценено одно → throw; оба → finish). mvp.service 121 + test-player зелёные.
- **Подтверждения второго прохода (без новых багов):** (a) **IDOR-свип чист** — `enrollments/:id/certificates` и `/documents` уже захарднены (Phase 1 §4.3, guard `assertAssessmentReadAllowedForLearner`); `Assignment` — контент-определение (нет learnerId/groupId), не персональные данные; все персональные чтения закрыты (§5.154 attempts/results/submissions + §5.160 enrollments/progress). (b) **CloudPayments-mismatch подтверждён точно** (`createPayment` хранит `Model.Id` order-GUID, `parseWebhook` резолвит по `TransactionId/InvoiceId` — никогда не совпадут → оплата не находит заказ) — **остаётся в follow-up** по решению владельца (сверка с песочницей; фикс: `InvoiceId=orderId` в order-body + резолв по `InvoiceId`). (c) **Остальные 3 адаптера консистентны** — yookassa (`body.id`↔`payment.id`), tinkoff (`PaymentId`↔`PaymentId`), robokassa (`invId`↔`InvId`); баг изолирован в CloudPayments. (d) assessment pass/needs_review/registry-lifecycle в остальном sound (computeExamPassState исключает pending; registry читают `Boolean(passed)`; expiry терминальна). (e) Frontend full-suite зелёный целиком.

### 5.161 Новый аудит-проход — 6 латентных багов (3 HIGH + 1 MEDIUM + 2 LOW) + esign-хардненинг + cleanup (коммит `ae58977`)

- **Контекст:** «продолжай улучшать код» после §5.160. 5 параллельных subagent-разведчиков (mvp-lifecycle · documents · assessment/exam-gating · worker/bulk-idempotency · esign-state-machine); **каждая находка перепроверена мной чтением кода**; все фиксы по TDD (RED→GREEN подтверждён). Диф проверен **4-линзовым adversarial-workflow** (regression · completeness · test-quality · skeptic → синтез) — он **поймал конкурентный revert** `mvp.service.ts` (см. ниже).
- **Фикс #1 (worker, HIGH) — `mvp-internal-worker.controller.ts`:** очередь bulk-enrollment (`deliveryMode:'queued'` → RabbitMQ → worker callback `…/internal/worker/mvp/bulk-enrollments`) вызывала **request-scoped `MvpService` поверх ПУСТОГО `MVP_STATE`** — контроллер без `MvpRequestPersistenceInterceptor` (и тот не сработал бы: tenant в body, не в ctx). Каждый слушатель падал `not_found`, all-errors 200 уходил воркеру как успех → ack → **зачисление терялось навсегда**. Фикс: проводка через singleton `MvpEnrollmentService.enrollIntoGroup` (гидратация+сохранение через `MvpTenantRunner`, паттерн payment-fulfillment). +новый `mvp-internal-worker.persistence.test.ts` (created+persisted+idempotent), integration-стаб переведён на `MvpEnrollmentService`.
- **Фикс #2 (documents, HIGH) — `documents.service.ts` `finalizeDocument`:** аннулированный, но ещё `generated` документ имеет `isFinal=false` → единственная защита (short-circuit по `isFinal`) не срабатывала → `finalize` воскрешал revoked-документ в `final`+подписанный (достижимо через esign `tryCompleteProcess`). Фикс: guard `if status==='revoked' throw` (зеркало `signDocument`); комментарий-обоснование исправлен (revoke НЕ держит `isFinal=true`).
- **Фикс #3 (assessment, HIGH→дисплей) — `mvp.service.ts` `deriveLearnerTestStatus`:** дашборд слушателя (`listMyTests`) читал сырой `attempt.passed` (только авто-субтотал) → преждевременный «Пройден»/«Не пройден», пока эссе на ручной проверке. Авторитетные потребители (ExamResult/module-gate/OT-registry/recert) читают `ExamResult.passed` — поэтому радиус = только дисплей. Фикс: учитывать `attemptAwaitsManualReview` — пока есть pending-review попытка, статус `submitted` («На проверке»); pass только для НЕ-pending попытки. +2 теста (false-pass и false-fail, оба с flip-после-review).
- **Фикс #4 (esign, MEDIUM) — `esign.service.ts` `rejectParticipant`:** не было `assertProcessMutable` (в отличие от sign/skip) → reject на терминальном (cancelled) процессе флипал участника в `rejected` и дописывал ложную пост-отменную запись в append-only legal-log. Фикс: guard добавлен.
- **Фикс #5 (esign, MEDIUM) — `esign.service.ts` `tryCompleteProcess` (поднят ревью):** валидировал документ ПОСЛЕ мутации процесса в `signed` + записи «completed» в legal-log; с Фиксом #2 ревокация по ходу подписания оставляла ложный «completed» + неретраибельный процесс. Фикс: validate-before-mutate — `getDocument` до мутации; revoked/archived → `failProcess` (чисто, без ложной записи). +1 тест.
- **Фикс #6 (esign, LOW) — `inviteParticipant`/`markViewed`:** тот же отсутствующий `assertProcessMutable`. Фикс: guard добавлен. +1 тест (invite+markViewed на cancelled).
- **Фикс #7 (mvp, LOW) — `recalculateModuleProgress`/`recalculateCourseProgress`:** `completedAt` переписывался на `now` при каждом recalc → дата завершения дрейфовала вперёд при повторной активности. Фикс: монотонный latch (`existing?.completedAt ?? now`), как на уровне материала. +1 тест (обе сущности).
- **Cleanup — `mvp.service.ts`:** удалён мёртвый `finalizeAttempt` (форсил `finished`, обходя guard ручной проверки; ноль вызывающих) — чтобы будущий вызыватель не переоткрыл дыру преждевременной финализации.
- **⚠️ Конкурентный revert (git-hazard [[concurrent-sessions-git-hazard]]):** во время 25-мин ревью-workflow параллельная сессия выполнила `git checkout/restore` на `mvp.service.ts`, **откатив фиксы #3/#7 + cleanup** (рабочее дерево → HEAD), оставив мои тесты. Ревью-completeness-линза это поймала (3 RED-теста при «present» комментах). Перенакатил + закоммитил быстро, чтобы защитить.
- **Отложено (без изменений):** CloudPayments `providerPaymentId` mismatch — payment-critical контракт эквайера, владелец гейтит на сверку с песочницей (см. §5.160(b)). Не чинил вслепую.
- **Тест-статус (всё зелёное):** typecheck **8/8**, ESLint чисто. Затронутые backend-сьюты: worker persistence(2)+http(5), documents.service(67), esign.service(13)+http-integration, test-player(17), module-gating(10), mvp.service(122), business-flows.e2e; итоговый батч **258** зелёных. **Без миграций (0059), без новых прав.**

### 5.162 UI redesign Фаза 1 — дизайн-система (токены, иконки, базовые компоненты)

_Изначально записана как §5.155; перенумерована при merge origin/main — параллельные аудит-ветки заняли §5.154–§5.161._

- **Контекст:** Фаза 1 из 6 полного UI/UX-редизайна (Фаза 0 — аудит 91 страницы, согласованы 10 блоков ИА + 4 scope-решения владельца, 2026-07-01). План: [docs/superpowers/plans/2026-07-02-ui-redesign-phase-1-design-system.md](docs/superpowers/plans/2026-07-02-ui-redesign-phase-1-design-system.md) (12 задач, все выполнены, чекбоксы проставлены, секция «Отклонения»). Ветка `feat/2026-07-02-ui-phase-1-design-system`, **PR #299**. Только `packages/ui` (+deps фронтенда): **ни один маршрут/экран/RBAC не тронут**.
- **Токены:** `baseVars` — CSS-мост `--ui-space-{xs..xxl}`/`--ui-radius-{sm,md,lg,pill}`/`--ui-font-size-*`/`--ui-font-weight-*`/`--ui-line-height-*`, подмешивается в `UiThemeProvider` через извлечённую чистую функцию `buildThemeVars` (тестируемая, + страж непересечения ключей base/theme). Все `border-radius` в 7 CSS-слоях переведены на `var(--ui-radius-*)`; вне-шкальные значения нормализованы (10/13/14→12, 18/20→16 — единственное намеренное визуальное изменение); тест-страж `token-discipline.test.ts` (ловит longhand + любые позиции shorthand). Попутный фикс: vitest include пакета был `*.test.tsx` — `.ts`-тесты не запускались; расширен до `*.test.{ts,tsx}`.
- **Иконки:** `lucide-react@^1.23.0` в `@trudskill/ui` И `@trudskill/frontend` (держать версии в lockstep). Компонент `Icon` — единая точка входа: шкала 16/18/20/24 (default 18), stroke 1.75, a11y-контракт (без label — декоративная `aria-hidden`; с label — `role=img`+`aria-label`). Ревью подтвердило: ноль веса в бандле ui (type-only импорты), lucide spreads пропсы на `<svg>`.
- **Новые компоненты** (тонкие обёртки над существующими CSS-классами): `Button` (variant default/primary/secondary/ghost/danger — канон BEM `ui-button--*`; loading→disabled+aria-busy+спиннер; слот icon, CSS принудительно 16px), `Skeleton` (контейнер `ui-skeleton-block` + N линий; **план скорректирован до реализации** — исходный `kind`-API рендерил бы невидимый одиночный block-элемент), `StatCard`, `KeyValueList` (канон `kv-list`; key=`label-index` против дублей), `Callout` (tone→role alert/status + **override `role` для статичных баннеров**). Фиксы: `DateRangeField` в контракте `ui-field` (подпись+`ui-input`+aria «с»/«по»); русские дефолты `EmptyState`/`ErrorState`/`LoadingState` («Нет данных»/«Не удалось загрузить данные»/«Загрузка…» — grep подтвердил: никто не ассертил английские).
- **Процесс:** subagent-driven (исполнитель + spec-ревью + quality-ревью на задачу); задачи 6–11 реализованы контроллером инлайн во время недоступности диспетчера субагентов (сбой классификатора платформы), затем прогнаны через оба этапа ревью постфактум (spec ✅ без отклонений; quality «with fixes» → 2 Important-фикса в `502db8a` → re-review ✅). Финальное холистическое ревью всей ветки — «Ready to merge: Yes».
- **Тест-статус:** ui **16 файлов / 53 теста** зелёные, ui lint/typecheck чисто; frontend **typecheck чисто, 106 файлов / 646 тестов** зелёные (до merge origin/main; после merge прогнано повторно — см. merge-коммит). Ветка не добавляет миграций/прав (последняя в main — 0059).
- **Known issues / заметки Фазе 2+:** (1) `button:focus-visible` даёт радиус 8px против 12px у контролов — pre-existing, полировка в Фазе 6; (2) Button при loading использует native disabled → фокус падает на body (осознанный трейд-офф); (3) `<a class="ui-button">` (login/ЕСИА, test-result) теперь честные 40px-кнопки — глазами проверить в Фазе 2; (4) рекомендация: ESLint `no-restricted-imports` на прямой `lucide-react` в apps/frontend (Icon — единственная точка входа); (5) `.ui-skeleton-line` 6px радиус вне шкалы — вне regex-стража; (6) при миграции сырых `ui-callout` в Фазе 2: динамические ошибки → default (alert), статичные баннеры → `role="status"`; (7) Skeleton (плейсхолдер контента) vs `LoadingState` (состояние секции) — выбирать осознанно.
- **Следующий шаг:** Фаза 2 — сгруппированный сайдбар (10 блоков, сворачиваемые), командная палитра Ctrl/⌘+K, хлебные крошки. Nav/RBAC-баги из аудита Фазы 0 — отдельным PR; заметь: битый `/learner/documents` (nav без routeMeta) **уже починен** параллельным аудитом в §5.154 (фикс #5) — из списка Фазы 0 остаются страницы-сироты (`/admin/licenses`, `/admin/issuance-journal`, `/forms`), широкий `tenant.read` (~15 разделов) и путаные метки.

### 5.163 UI redesign Фаза 2 — навигация и оболочка (shell)

- **Summary:** Заменён плоский сайдбар («основные» + `<details>` «Еще разделы») на 10 сворачиваемых смысловых блоков (надстройка над RBAC — чистая презентация); добавлена командная палитра Ctrl/⌘+K (быстрый переход по всем доступным по правам страницам, полностью с клавиатуры); хлебные крошки приведены к иерархии «Блок → Страница → Деталь». Сироты `/admin/licenses`, `/admin/issuance-journal`, `/admin/webinars/settings` заведены в меню (+routeMeta для первых двух); заглушки `/mailings`, `/crm/deals` скрыты из меню (страницы+routeMeta сохранены); русифицированы 3 латинские метки. Иконки — только через `<Icon>` из `@trudskill/ui`; добавлен ESLint `no-restricted-imports` на прямой `lucide-react` во фронтенде с единственным исключением `nav-icons.ts`.
- **Файлы (новые):** `apps/frontend/src/features/navigation/nav-icons.ts`, `nav-groups.ts`, `nav-groups.test.ts`, `command-palette.ts`, `command-palette.test.ts`; `apps/frontend/src/widgets/shell/command-palette.tsx`; `apps/frontend/src/e2e/navigation-shell.e2e.test.ts`.
- **Файлы (изменены):** `apps/frontend/src/features/navigation/model.ts`, `helpers.test.ts`, `breadcrumbs.ts`, `breadcrumbs.test.ts`; `apps/frontend/src/widgets/shell/app-shell.tsx`; `eslint.config.mjs`; `apps/frontend/src/lib/analytics/ux-metrics.test.ts` (попутный pre-existing sort-imports фикс).
- **Тесты:** полный `pnpm test:frontend` зелёный — **109 файлов / 675 тестов**; typecheck (`tsc --noEmit`) чистый; full ESLint (`apps/frontend/src/**/*.{ts,tsx}`, `--max-warnings=0`) чистый. Инвариант §5.154 («каждая nav-ссылка резолвится в routeMeta») соблюдён + добавлен новый инвариант «каждый пункт меню в ровно одном блоке» (`nav-groups.test.ts`).
- **Deviations / решения:**
  - Русифицированные метки (D3): «Панель студента» (/student/dashboard), «Центр проверки работ» (/teacher/grading-center), «Панель администратора» (/admin/cockpit).
  - Права сирот (D1/D2): `/admin/issuance-journal` → `tenant.read` (как `/documents`); `/admin/licenses` → `auth.manage_sessions` (админ-only). Сужение прав — отдельный PR.
  - Иконка блока «Отчёты»: `lucide-react@1.23.0` — канонический глиф `ChartColumn` (`BarChart3` — его устаревший алиас); используется `ChartColumn`, имя константы `BarChart3Icon` сохранено.
  - `getNavigationView` (main/more split) оставлен как legacy (D4) — по-прежнему покрыт тестом, но сайдбаром больше не используется; удаление отложено (каскадит в role-blueprints).
  - `activeGroupId` в app-shell вычисляется инлайн (без `useMemo`/`eslint-disable`), т.к. flat-config не загружает `react-hooks` (иначе — unused-directive).
  - Оверлей палитры — реальная `<button className="cmdk__scrim">` (не div с обработчиком), чтобы чисто проходить jsx-a11y; на опции listbox — единственный оправданный `eslint-disable jsx-a11y/click-events-have-key-events` (клавиатура на combobox-инпуте через aria-activedescendant).
  - Найдено и исправлено в код-ревью: (1) CRITICAL — `hidden` на группе перебивался `.ui-stack{display:flex}`, добавлено `.app-shell__group-items[hidden]{display:none}`; (2) IMPORTANT — возврат фокуса при закрытии палитры по повторному Ctrl/⌘+K (теперь через `closePalette`).
- **Follow-ups (не в этой фазе):** дублирование `normalizePath` (nav-groups vs helpers) — кандидат на вынос при 3-м call-site; в палитре нет focus-trap (Tab может выйти из диалога) — консистентно с существующим мобильным drawer, кандидат на отдельное улучшение; `aria-expanded="true"` на combobox-инпуте захардкожен (listbox всегда виден). Права новых routeMeta — сужение отдельным PR.

### 5.164 UI redesign Фаза 3 — эталонные шаблоны экранов (reference template screens)

- **Summary:** Заполнен композиционный слой `@trudskill/ui`: 6 переиспользуемых каркасов поверх существующего CSS — `AsyncSection` (единая цепочка загрузка→ошибка+повтор→пусто→контент), `StatGrid` (ряд KPI на `StatCard`), `DetailLayout` (двухколоночная карточка `main`+`aside`, схлоп на узком), `ListPage` (фильтры+`AsyncSection`(DataTable)+пагинация), `Form`/`FormSection`/`FormActions`, `SelectField`. `SectionCard` получил слоты `actions`/`subtitle`. Заведена живая витрина `/admin/ui-kit` (все каркасы на фиктивных данных, под `auth.manage_sessions`, вне меню). 4 пилотных экрана мигрированы на каркасы **без изменения поведения/данных/прав/URL**. Принцип «упаковка, а не переписывание»: визуал Фазы 1 не тронут, новый CSS — только `.ui-detail`/`.ui-section-head` (на токенах `var(--ui-space-*)`). Полный цикл brainstorming (визуальный компаньон) → спека → план (14 задач TDD) → subagent-driven исполнение (4 слоя, коммит на задачу) → adversarial-ревью (2 находки, обе опровергнуты 2/2 скептиками).
- **Файлы (новые, `packages/ui`):** `src/composition/async-section.tsx` (+`.test.tsx`), `stat-grid.tsx` (+`.test.tsx`), `detail-layout.tsx` (+`.test.tsx`), `list-page.tsx` (+`.test.tsx`), `form.tsx` (+`.test.tsx`), `select-field.tsx`, `composition/index.tsx` (barrel).
- **Файлы (изменены, `packages/ui`):** `src/styles/layout.ts` (CSS `.ui-detail*`), `src/styles/foundation.ts` (CSS `.ui-section-head`), `src/index.tsx` (`export * from './composition/index'`).
- **Файлы (новые, `frontend`):** `src/features/ui-kit/gallery-screen.tsx`, `app/admin/ui-kit/page.tsx`, `src/features/navigation/ui-kit-route.test.ts`, `src/components/state-wrappers.test.ts`.
- **Файлы (изменены, `frontend`):** `src/components/state-wrappers.tsx` (слоты `SectionCard`), `src/features/navigation/model.ts` (routeMeta `/admin/ui-kit`), `vitest.config.ts` (см. deviations); **пилоты:** `src/features/learners/learners-list-screen.tsx` (→`ListPage`), `src/features/clients/client-detail-screen.tsx` (→`DetailLayout`+`KeyValueList`+`Button`), `app/academy/requisites/page.tsx` (→`Form`+`FormField`+`FormActions`+`Button`), `src/features/analytics/screens.tsx` (→`StatGrid`+`AsyncSection`).
- **Тесты:** ui `pnpm --filter @trudskill/ui exec vitest run` — **21 файл / 68 тестов** зелёные; frontend `pnpm --filter @trudskill/frontend exec vitest run` — **111 файлов / 679 тестов** зелёные; `pnpm typecheck` **8/8**; full ESLint (`apps/frontend/src/**`, `packages/ui/src/**`, `--max-warnings=0`) чисто. Страж `token-discipline.test.ts` зелёный (новый CSS только на токенах). Компоненты `packages/ui` покрыты юнит-тестами вызовом-как-функция (без DOM-mount).
- **Спека/план:** [`docs/superpowers/specs/2026-07-12-ui-phase-3-reference-screens-design.md`](docs/superpowers/specs/2026-07-12-ui-phase-3-reference-screens-design.md), [`docs/superpowers/plans/2026-07-12-ui-phase-3-reference-screens.md`](docs/superpowers/plans/2026-07-12-ui-phase-3-reference-screens.md).
- **Deviations / решения:**
  - **`apps/frontend/vitest.config.ts`: `esbuild: { jsx: 'automatic' }`** (enabler Task 7). Frontend tsconfig — `jsx:preserve`, из-за чего esbuild в vitest брал классический `React.createElement`, и вызов JSX-компонента как функции (`SectionCard({...})`) падал с «React is not defined» (компоненты фронта пишутся без `import React` — расчёт на автоматический рантайм Next). `automatic` совпадает с продакшн-трансформом Next и с `packages/ui`. Полный frontend-сьют (679) зелёный — прод-поведение не затронуто (правка только тест-трансформа).
  - **Пилот формы (academy/requisites)** сохранил инлайн `style={{ maxWidth: 560 }}` на `<Form>` (пробрасывается через `...rest`): `forms.ts` не существует, `.ui-form` живёт в `foundation.ts` и используется **5 другими формами** — глобальная правка ширины задела бы их. Инлайн сохраняет ширину и нулевое кросс-влияние (отличие от буквального плана, цель — «пилоты меняют только композицию»).
  - **Пилот dashboard (analytics)** адаптирован к реальной форме хука `useAnalyticsDashboard`/`useMvpQuery` (`{ data, loading, error: string|null, refetch }`): `isLoading={dash.loading}`, строковая ошибка обёрнута `new Error(dash.error)` через условный спред (иначе `AsyncSection` не покажет текст ошибки), KPI подставлены из реальных полей.
  - `state-wrappers.test.ts` назван `.test.ts` (не `.tsx`) — frontend vitest include берёт `src/**/*.test.ts`.
  - routeMeta `/admin/ui-kit` добавлен рядом с `/admin/cockpit` (уникальный префикс, порядок матчинга не нарушен). В `navigationModel` НЕ добавлен (справочная страница).
  - Task 9 Step 4 «живая проверка в браузере» заменена SSR render-smoke (`react-dom/server`, throwaway, не закоммичен) — `/admin/ui-kit` за `ProtectedPage` требует auth-стек, который не поднимался.
- **Follow-ups (не в этой фазе):** **a11y (Фаза 6):** во вложенном `<label className="ui-field">` дочерние `<p>` подсказки/ошибки подмешиваются в accessible name контрола (implicit-label) — латентно у `SelectField` **и** унаследовано от `FormField`/`TextareaField`; чинить консистентно в a11y-проходе Фазы 6, а не расходиться с общим паттерном сейчас. **Фаза 4:** `Drawer` (пока `Dialog` с focus-trap), `Hero`/`DashboardTile` (уровень приложения / `next/link`), дедуп каталогов плиток (`roleWidgets` vs `widgetCatalog`), дедуп `PageContainer` (ui vs frontend). Живая браузер-проверка `/admin/ui-kit` — когда поднят auth-стек.

### 5.165 UI redesign Фаза 4 — под-PR 1a: списочные экраны монолита на AsyncSection

- **Summary:** Старт Фазы 4 (массовая миграция экранов на каркасы Фазы 3). #302 (Фаза 3) влит в `main`; создана ветка `feat/2026-07-13-ui-phase-4-mvp-monolith` от свежего `main`. Монолит `mvp/screens.tsx` (2909 строк, ~17 мигрируемых экранов из 20) нарезан на 4 под-PR по архетипам (списки→карточки→формы→дашборды). **Под-PR 1a (списки):** 6 списочных экранов (`CommissionsPage`, `UsersPage`, `CoursesPage`, `CounterpartiesPage`, `GroupsPage`, `DirectionsPage`) переведены с ручного каскада `{loading?}{error?}{empty?}` на каркас `AsyncSection` — **без изменения вида/поведения/данных/прав/URL**. `LearnerCoursesScreen` осознанно не тронут (скелетон-загрузка `ListSkeleton`, а `AsyncSection` рисует текстовый `LoadingState` → обёртка изменила бы вид).
- **Стандарт (решение владельца, на всю Фазу 4):** «сохранять вид / zero-change». Большинство «списков» монолита — не таблицы, а link-списки/карточки; `ListPage` (рисует `DataTable`) применяется ТОЛЬКО там, где экран уже таблица. Link-списки — тело сохраняется дословно, нормализуется лишь state-каскад. Локальный `PaginationControls` (Назад/Далее) НЕ меняется на ui `Pagination` (номера страниц).
- **Ключевой enabler (zero-change):** DOM `AsyncSection` побайтово совпадает с `SectionError`/`SectionEmpty`/`LoadingState` (все три оборачивают одни и те же ui-примитивы). Две ловушки соблюдены: (1) строковая ошибка хука оборачивается `new Error(error)` (иначе `AsyncSection` берёт `error.message` → текст теряется); (2) `loadingMessage` прокинут (иначе дефолт «Загрузка…»).
- **Файлы (изменены, `frontend`):** `apps/frontend/src/features/mvp/screens.tsx` (6 экранов; добавлен импорт `AsyncSection` из `@trudskill/ui`). Импорты `LoadingState`/`SectionError`/`SectionEmpty` оставлены — их используют экраны-карточки/формы/дашборды того же файла (42 вхождения).
- **Тесты/гейты:** frontend `pnpm --filter @trudskill/frontend exec vitest run` — **111 файлов / 679 тестов** зелёные; `pnpm typecheck` **8/8**; `npx eslint apps/frontend/src/features/mvp/screens.tsx --max-warnings=0` чисто. **Adversarial diff-review** (субагент, свежий контекст, против `origin/main`) — регрессий нет; проверены per-state тексты/обработчики/права/пагинация/isEmpty-предикаты; два теоретических расхождения признаны недостижимыми (`loading` всегда при `data=undefined`; Commissions-edge за `ProtectedRoute`).
- **Спека/план:** [`docs/superpowers/specs/2026-07-13-ui-phase-4-page-migration-design.md`](docs/superpowers/specs/2026-07-13-ui-phase-4-page-migration-design.md), [`docs/superpowers/plans/2026-07-13-ui-phase-4-mvp-lists.md`](docs/superpowers/plans/2026-07-13-ui-phase-4-mvp-lists.md).
- **Deviations — D1 (принято):** микро-отклонение «устаревшие данные + ошибка того же ключа». Раньше показывались баннер ошибки + устаревший список; теперь `AsyncSection` показывает только ошибку (одно состояние за раз, ранний `return`). Достижимо через кнопку «Обновить» у Commissions / refetch-on-mount после `staleTime:30_000` (`refetchOnWindowFocus:false`). Принято как соответствие паттерну пилота Фазы 3 (`learners-list`→`ListPage`→`AsyncSection`, PR #302). При смене фильтра (новый query-ключ) поведение идентично.
- **Коммиты:** `8d514be` (спека), `3d25a4c` (CommissionsPage), `81cc94d` (5 списков), + план.
- **Next:** под-PR 1b (карточки → `DetailLayout`), 1c (формы → `Form`), 1d (дашборды/AssessmentDashboard).

### 5.166 Принято в работу дельта-ТЗ «Арендная СДО» + статус-трекер + обновление протокола «продолжай по ТЗ»

- **Summary:** В корень репозитория добавлено [TZ_TRUDSKILL_ARENDNAYA_SDO.md](TZ_TRUDSKILL_ARENDNAYA_SDO.md) — дельта-ТЗ (гэп-анализ) к `SDOPROF_TZ_FINAL.md` по аудиту коммита `ac2af17`: цель — довести платформу до полноценной СДО собственного УЦ + аренда другим УЦ как SaaS. Структура: 9 эпиков (A рендер документов [P0] / B видео [P0-P1] / C идентификация+юрзначимость [P0] / D аренда-мультитенантность [P0/P1] / E учебный контур [P1] / F коммуникации [P1] / G безопасность+152-ФЗ [P0] / H UI/UX [P1] / I эксплуатация [P1-P2]), требования ФТ-\*, дорожная карта фаз 0–6, 7 открытых вопросов владельцу (§14). Текст ТЗ добавлен **без правок** (статус в самом ТЗ — «черновик на утверждение Павлом»; принят как рабочая дельта).
- **Статус-трекер:** создан [docs/TZ_ARENDNAYA_SDO_STATUS.md](docs/TZ_ARENDNAYA_SDO_STATUS.md) — живой файл «что сделано / 🟡 частично / ⬜ не начато / ♻️ переделать» по каждому ФТ + сводка по фазам + таблица открытых вопросов + журнал сессий. Начальные статусы — из аудита в самом ТЗ + факта кода (в т.ч. досрочный прогресс ЭПИКа H: UI redesign Фазы 0–3 завершены, Фаза 4 идёт — §5.162–§5.165). Обновлять в конце каждой сессии по этому ТЗ.
- **Протокол «продолжай по ТЗ» обновлён:** [CLAUDE.md](CLAUDE.md) (иерархия SSOT п.2 + порядок чтения + правила фаз), [docs/DOCUMENTATION_MAP.md](docs/DOCUMENTATION_MAP.md) (иерархия, шаги 3–4 порядка чтения, 2 строки в таблице канонов, пост-сессионный чек), [README.md](README.md) (ссылки на обязательные документы + callout в §2 + Current Stage). Порядок теперь: README §2 → handoff §1/§5/§13 → **дельта-ТЗ §13 + статус-трекер** → SDOPROF_TZ_FINAL §41 ↔ TZ_MVP_TRACEABILITY.
- **Files changed:** `TZ_TRUDSKILL_ARENDNAYA_SDO.md` (новый), `docs/TZ_ARENDNAYA_SDO_STATUS.md` (новый), `CLAUDE.md`, `docs/DOCUMENTATION_MAP.md`, `README.md`, `LMS_AGENT_HANDOFF.md`.
- **Тесты:** docs-only, код/миграции/контракты не тронуты — `ci:check` не требуется.
- **Next:** решения владельца по открытым вопросам ТЗ §14 (блокируют старты фаз: №7 шифрование ПДн → фаза 0; №2 docxtemplater → фаза 1; №1 видео → фаза 2; №4 СМС → фаза 3; №3/№5 → фаза 4) → план **Фазы 0 «Фундамент»** (ФТ-D1 изоляция+`test:isolation`, ФТ-G2/G3/G5, ФТ-F1 email, Gotenberg в compose) в `docs/superpowers/plans/` → апрув → код.

### 5.167 Фаза 0 «Фундамент», Task 1 — тест-суита изоляции тенантов `test:isolation` (ФТ-D1.3)

- **Контекст:** дельта-ТЗ «Арендная СДО» принято (§5.166); владелец апрувнул **план Фазы 0** ([docs/superpowers/plans/2026-07-23-tz-faza0-fundament.md](docs/superpowers/plans/2026-07-23-tz-faza0-fundament.md), PR #306) и решил открытый вопрос №7 — **шифрование ПДн делаем в Фазе 0** (Task 7 входит). Начата реализация с Task 1.
- **Summary:** добавлен гейт изоляции тенантов `pnpm test:isolation` (ФТ-D1.3). Две суиты: (1) **контракт `TenantGuard` + data-layer** `enforceTenantScope` — эффективный тенант берётся ТОЛЬКО из подписанного токена, заголовком `x-tenant-id` его не сменить/повысить; чужой заголовок → 400 `tenant_header_mismatch`; нет/битый/чужой-секрет/истёкший токен → 401; cross-tenant id в репозитории → 403 `tenant_scope_violation` (fail-closed на пустом ожидаемом tenant). (2) **структурный «сторож» контроллеров** — файловый скан всех `*.controller.ts`: каждый доменный контроллер обязан быть под `@UseGuards(TenantGuard, …)` либо явно в белом списке публичных с обоснованием. Приём тот же, что в `permission-guard-module-wiring.test.ts` (закрывает дыру: HTTP-integration тесты бутстрапят СТАБ-контроллер, минуя реальный граф модулей). Скан отбраковал 7 контроллеров без tenant-скоупа → 7 осознанно публичных/внутренних внесены в белый список (health, 2 webhook'а с проверкой подписи, internal-worker и backfill под `WorkerCallbackGuard`, public-verify по QR, scorm-content по HMAC-токену в URL).
- **Files changed:** `apps/backend/src/common/guards/tenant-isolation.isolation.test.ts` (новый), `apps/backend/src/common/guards/controllers-tenant-scope.isolation.test.ts` (новый), `package.json` (скрипт `test:isolation` — фильтр vitest по подстроке `isolation.test`, автоподхват новых файлов), `.github/workflows/ci.yml` (шаг `test:isolation` в backend-джобе), `docs/TZ_ARENDNAYA_SDO_STATUS.md`, `README.md`, `LMS_AGENT_HANDOFF.md`.
- **Тесты:** `pnpm test:isolation` — 2 файла / 12 тестов зелёные; `pnpm --filter @trudskill/backend typecheck` зелёный; eslint новых файлов чист. Полный `ci:check` не гонялся (изменения аддитивные: только новые тест-файлы + скрипт + CI-шаг).
- **Deviations от плана Task 1:** скрипт сделан не glob-ом `**/*.isolation.test.ts` (в кавычках vitest трактует как подстроку — «No test files found»), а фильтром `isolation.test`. Полная per-endpoint HTTP-матрица «каждый доменный endpoint × чужой tenant → 403/404» и опциональный RLS-слой — **следующий инкремент** (этот PR даёт контракт guard + структурный сторож, что уже роняет суиту при новом контроллере без tenant-скоупа). Инвариант «tenantId в каждом сообщении очереди» пока не покрыт отдельным тестом — вынесен в тот же следующий инкремент.
- **Next (Фаза 0):** Task 3 (ClamAV-контейнер) → Task 6 (Gotenberg-контейнер) → Task 2 (rate limiting на `/verify/{qr}`) → Task 4 (email-события) → Task 5 (2FA TOTP) → Task 7 (шифрование ПДн, вопрос №7 = Фаза 0). Каждая — отдельный под-PR.

### 5.168 Фаза 0 «Фундамент», Task 3 + Task 6 — контейнеры ClamAV и Gotenberg (инфраструктура)

- **Summary:** две инфра-задачи Фазы 0 одним PR (обе — только `docker-compose` + env, кода приложения нет). **Task 3 (ФТ-G5):** добавлен сервис `clamav` (`clamav/clamav:1.4`) в dev и prod compose с healthcheck (`clamdcheck.sh`, `start_period 120s` под первичную загрузку базы freshclam) и томом `clamav-data`. В **проде включён**: `ANTIVIRUS_ENABLED=true` в `infra/.env.production.example`, backend получил `depends_on: clamav: service_healthy`. В **dev выключен по умолчанию** (флаг false → `NoopAntivirusScanner`), сервис поднимается вручную. Код сканера/гейта не тронут — DI-переключатель в `files.module.ts` уже был готов. **Task 6 (ФТ-A1.3):** добавлен сервис `gotenberg` (`gotenberg/gotenberg:8`, DOCX→PDF) в dev+prod compose (внутренний порт 3000, host не пробрасывается — не конфликтуем с фронтом), новая env-переменная `GOTENBERG_URL` (default `http://gotenberg:3000`) в `env.schema.ts` + оба env-примера. Сам движок рендера (worker → Gotenberg) — **Фаза 1 (ЭПИК A)**, здесь только инфраструктура.
- **Files changed:** `infra/docker-compose.yml`, `infra/docker-compose.prod.yml`, `infra/.env.production.example`, `.env.example`, `apps/backend/src/env.schema.ts`, `docs/TZ_ARENDNAYA_SDO_STATUS.md`, `README.md`, `LMS_AGENT_HANDOFF.md`.
- **Тесты:** `docker compose config` зелёный для dev и prod (структура/подстановки валидны); `pnpm --filter @trudskill/backend typecheck` зелёный (новая env-переменная). **Живой EICAR-прогон и реальный старт контейнеров не гонялись** — тяжело/долго (freshclam качает базу минутами); это ops-шаг на деплое (описан в PR).
- **Deviations:** Task 3 и Task 6 объединены в один PR (обе — чистые инфра-правки без кода приложения; меньше PR-шума). У `gotenberg` healthcheck намеренно не задан (образ v8 может быть без `curl`, а backend в Фазе 0 от него не зависит) — health `/health` подключим в Фазе 1 вместе с рендером.
- **Next (Фаза 0):** Task 2 (rate limiting на `/verify/{qr}`) → Task 4 (email-события) → Task 5 (2FA TOTP) → Task 7 (шифрование ПДн, вопрос №7 = Фаза 0).

### 5.169 Фаза 0 «Фундамент», Task 2 — rate limiting на публичной проверке `/verify/{qr}` (ФТ-G2)

- **Summary:** починен «спящий» rate limit на публичной проверке документа. На `PublicVerifyController.verify` уже стоял `@Throttle({ limit: 30, ttl: 60_000 })`, но он **не применялся**: глобального `ThrottlerGuard` в `app.module` нет (throttler навешивается по-роутно через `@UseGuards(ThrottlerGuard)`, как в `auth.controller`), а на этом контроллере guard'а не было. Добавлен `@UseGuards(ThrottlerGuard)` — лимит 30 req/мин/IP теперь реально действует (защита от перебора QR-токенов, ФТ-A6.2/G2).
- **Files changed:** `apps/backend/src/modules/documents/public-verify.controller.ts` (+`UseGuards(ThrottlerGuard)` + комментарий-предупреждение про «спящий» @Throttle), `apps/backend/src/modules/documents/public-verify.controller.test.ts` (тест «guard применён» через reflection `__guards__` + HTTP-тест: 30 запросов проходят (404 unknown token), 31-й → 429), `docs/TZ_ARENDNAYA_SDO_STATUS.md`, `README.md`, `LMS_AGENT_HANDOFF.md`.
- **Тесты:** файл `public-verify.controller.test.ts` — 11/11 зелёные (вкл. HTTP-429); `pnpm --filter @trudskill/backend typecheck` зелёный; eslint чист.
- **Замечание:** шёл параллельно с PR #308 (§5.168, контейнеры) — конфликт в таблицах журнала/сводки разрешён объединением строк при слиянии `main` в ветку. Параллельный PR #310 (живой EICAR-smoke + фикс протокола clamd) занимает §5.170.
- **Next (Фаза 0):** Task 4 (email-события — включить прод-SMTP + перевести stub'ы на MailerService) → Task 5 (2FA TOTP — меняет флоу логина) → Task 7 (шифрование ПДн — миграция + application-crypto, вопрос №7 = Фаза 0). Task 5 и Task 7 — крупные, каждый своим PR.

### 5.170 Фаза 0, добивка Task 3 — живой EICAR-smoke + фикс протокола INSTREAM в сканере (ФТ-G5)

- **Контекст:** §5.168 добавил контейнеры ClamAV/Gotenberg, но живой EICAR-прогон не гонялся (помечен как ops-шаг). Эта сессия шла по Task 3 параллельно и выполнила живой прогон на тестовом сервере — он оказался не формальностью.
- **Summary:** реальный clamd (`clamav/clamav:1.4` из compose, дошёл до `healthy`) на команду сканера отвечал `UNKNOWN COMMAND` → **протокольный баг**: z-команды clamd должны быть NUL-терминированы, а код слал `'zINSTREAM '` (с пробелом); плюс ответы clamd NUL-терминированы (`stream: OK\0`), а `parseReply` NUL не срезал (`trim()` его не берёт) → даже при верной команде вердикт был бы `error`. Итог до фикса: с `ANTIVIRUS_ENABLED=true` **все** загрузки отбивались бы (fail-closed гейт). Починено: `'zINSTREAM\0'` + срез NUL в `parseReply`; юнит-симулятор clamd приведён к поведению реального демона (NUL-терминированные ответы). Комментарий «verify against a real clamd» в сканере закрыт. Юнит-тесты, которые «зеленели» на битом протоколе, — урок: симулятор внешнего протокола обязан копировать реальные терминаторы.
- **Files changed:** `apps/backend/src/infrastructure/antivirus/clamav-antivirus.scanner.ts`, `apps/backend/src/infrastructure/antivirus/clamav-antivirus.scanner.test.ts`, `infra/README.md` (строка ClamAV в списке сервисов), `docs/LAUNCH_CHECKLIST.md` (пункт D2 про антивирус закрыт), `docs/TZ_ARENDNAYA_SDO_STATUS.md` (G5 → ✅, журнал), план Фазы 0 (Task 3 отмечен + deviations), `README.md`, `LMS_AGENT_HANDOFF.md`.
- **Тесты:** живой smoke на тестовом сервере реальным `ClamAvAntivirusScanner` против clamd из compose: чистый файл → `clean`, EICAR → `infected: Eicar-Test-Signature`. Юнит `vitest run src/infrastructure/antivirus` — 2 файла / 5 тестов зелёные; eslint изменённых файлов чист; pre-push typecheck зелёный.
- **Deviations:** «код сканера не тронут» из плана Task 3 нарушено осознанно — без фикса протокола acceptance «EICAR отбивается» недостижим. Smoke сделан против живого clamd реальным классом сканера, а не полным boot'ом prod-профиля (сборка всех образов на тестовом сервере избыточна). Контейнер `infra-clamav-1` оставлен запущенным в общей dev-инфре сервера.
- **Next (Фаза 0):** Task 2 (rate limiting на `/verify/{qr}` — PR #309) → Task 4 (email-события) → Task 5 (2FA TOTP) → Task 7 (шифрование ПДн). Каждая — отдельный под-PR.

### 5.171 Фаза 0 «Фундамент», Task 4 — email-события по-настоящему (ФТ-F1)

- **Контекст:** движок почты готов с Phase 5 (`MailerService` Noop/Smtp, `NotificationDispatcher` с журналом `email_deliveries` и send-once dedup `0049`, 6 шаблонов, DI-переключатель `NOTIFICATIONS_EMAIL_ENABLED`), но два письма оставались log-only стабами в `MvpService`, а приглашение уходило без рабочей ссылки.
- **Summary:** стабы переведены на события (конструктор `MvpService` не тронут — сотни юнитов живы): **(1) код на экзамен** — `requestPreExamToken` эмитит `PRE_EXAM_AUTH_REQUESTED_EVENT` с `verifyUrl`; сырой URL в логе теперь **редактируется в production** (раньше живой одноразовый токен всегда печатался в stdout — зеркало правила `LoggingMagicLinkEmailSender`); **(2) отклонение identity-проверки** — `reviewIdentityVerification` эмитит `IDENTITY_VERIFICATION_REJECTED_EVENT` с причиной. Оба слушает новый `ExamIdentityEmailListener` → диспетчер: шаблоны `pre_exam_auth` (`{{verifyUrl}}`, «ссылка одноразовая, 15 минут») и `identity_verification_rejected` (`{{reason}}`), dedup-ключи `preexam:{tokenId}` и `idreject:{verificationId}:{reviewedAt}` (повторный reject после resubmit — новое письмо), ошибки доставки глотаются с логом. **(3) приглашение** — в `enrollment_invite` добавлена рабочая ссылка `{{loginUrl}}` (`PUBLIC_BASE_URL/login`, вход по magic-link на тот же e-mail), у enrollment-писем появились send-once dedup-ключи `enrollinvite:/enrollcomplete:{enrollmentId}`. Env: `.env.example` дообъяснён (cross-field валидация), добавлен `RECERTIFICATION_SCAN_ENABLED` (без него напоминания 90/30/7 не сканируются) — в `infra/.env.production.example` он `true`.
- **Files changed:** новые `apps/backend/src/modules/mvp/pre-exam-auth-requested.event.ts`, `.../mvp/identity-verification-rejected.event.ts`, `.../communication/exam-identity-email.listener.ts` (+ его тест); изменены `mvp.service.ts`, `communication/email-templates.ts`, `communication/enrollment-email.listener.ts`, `communication/communication.module.ts`, `.env.example`, `infra/.env.production.example`; тесты `email-notifications.service.test.ts`, `pre-exam-auth.service.test.ts`, `identity-verification.service.test.ts`.
- **Тесты:** таргет-прогон communication (22 файла) + pre-exam + identity + business-flows E2E = 150+ зелёных; ключевые новые: событие pre-exam несёт URL, чей hash равен сохранённому `tokenHash`; reject эмитит / approve не эмитит; dedup повторной эмиссии (токен, enrollment, reject-resubmit); listener глотает ошибку SMTP. `pnpm test:isolation` 12 зелёных; backend typecheck и eslint чисты.
- **Deviations:** «результат экзамена» — события в коде нет вовсе, завершение покрыто `course_completed`, полноценное письмо о результате — ЭПИК E (E2/E3); полноценный invite-токен — за рамками Фазы 0 (сделана ссылка на вход); живой SMTP-smoke не гонялся (SMTP-обёртка не менялась, покрыта юнитами); magic-link остаётся на своём отдельном sender'е мимо диспетчера/журнала — осознанно не трогали (кандидат на унификацию позже).
- **Next (Фаза 0):** Task 5 (2FA TOTP) → Task 7 (шифрование ПДн). Каждая — отдельный под-PR.

### 5.172 Фаза 0 «Фундамент», Task 5 — 2FA (TOTP) для админ-ролей (ФТ-G3)

- **Summary:** двухфакторный вход для `tenant_admin`/`platform_admin`. Миграция **`0060_iam_totp_2fa.sql`** (аддитивно: `totp_secret_encrypted` — AES-256-GCM тем же application-crypto, что секреты интеграций; `totp_enabled`; `totp_last_used_step` — anti-replay RFC 6238 §5.2). **`totp.util.ts`** — самописный RFC 6238 на `node:crypto` (base32, HMAC-SHA1, окно ±1, otpauth-URL, подписанный challenge с TTL 5 мин), юнит-тесты на эталонных векторах приложения B RFC. **Гейт в `issueSessionForUser`**: пользователю с `totp_enabled` сессия не выдаётся ни одним способом входа (пароль/magic-link/ЕСИА) без `twoFactorSatisfied` — login/redeem возвращают `{totpRequired, challengeToken}`, ЕСИА-редирект уводит на `/login?status=totp_required` (challenge в URL не передаём). Эндпоинты: `POST auth/2fa/verify` (второй шаг, bootstrap-роут в `TenantGuard`, throttle 10/мин), `setup` (5/мин; роль-гейт; QR как data-URI — зависимость `qrcode` на бэке) / `confirm` / `disable` (нужен верный код — угнанной сессии мало) / `status`. Auth-события `totp_verified`/`totp_failed`. Фронт: шаг «введите код» в форме логина и на странице magic-link, карточка «Безопасность» в `/settings` (QR + ручной секрет + включение/выключение), union-тип ответа логина через `session-manager`/`context`.
- **Files changed:** `apps/backend/migrations/0060_iam_totp_2fa.sql`, `apps/backend/src/modules/iam/{totp.util.ts,totp.util.test.ts,totp.security.test.ts,migration-0060.test.ts,iam.types.ts,auth.controller.ts,dto/totp.dto.ts,services/auth.service.ts,services/iam.service.ts}`, `apps/backend/src/common/guards/tenant.guard.ts`, `apps/backend/src/modules/mvp/esia/esia.controller.ts`, `apps/backend/package.json` (+`qrcode`), корневой `package.json` (`test:security` += totp), фронт: `src/lib/auth/{auth-api.ts,session-manager.ts,auth-api.totp.contract.test.ts}`, `src/features/auth/{context.tsx,login-form.tsx,two-factor-card.tsx}`, `app/login/magic-link/[token]/page.tsx`, `app/settings/page.tsx`, env-примеры (+`INTEGRATION_CRYPTO_KEYS` в прод), `CLAUDE.md` (указатель миграций 0038→0060).
- **Тесты:** totp.util 18 (вкл. вектора RFC), totp.security 7 (challenge→код→токены, replay/wrong-code/чужой tenant, гейт magic-link+esia, роль-гейт setup, confirm/disable, статус-lifecycle); весь IAM 150; `pnpm test:security` 24; `test:isolation` 12; фронт полный **682** зелёных; typecheck обоих приложений; eslint изменённых файлов чист.
- **Deviations:** вместо `otplib` — свой `totp.util.ts` (репо без крипто-зависимостей; единственная новая зависимость — `qrcode` для QR-картинки); имена эндпоинтов `confirm`/`status` сверх плановых setup/verify/disable (verify занят вторым шагом логина); «обязательность 2FA для `platform_admin`» оставлена мягкой (опционально) — решение владельца отдельно; `INTEGRATION_CRYPTO_KEYS` не был описан в прод-env — добавлен (без него prod не стартует).
- **Next (Фаза 0):** Task 7 (шифрование ПДн — тем же application-crypto, вопрос №7 = «Фаза 0») → приёмка фазы (`pnpm ci:check` + финальные статусы).

### 5.173 Фаза 0 «Фундамент», Task 7 — шифрование ПДн слушателей (ФТ-C3.3)

- **Контекст:** вопрос №7 решён владельцем в пользу Фазы 0 (§5.167). Разведка по факту кода: (а) **текстовых полей паспорта в системе нет** — паспорт только файлами-сканами identity-верификации (0050, свой retention); единственное текстовое ПДн-поле — `Learner.snils`; (б) learners хранятся **JSONB-документами** в `learning.mvp_runtime_documents`/stage1 (нормализованная `learning.learners` рантаймом не используется).
- **Summary:** шифрование на границе персистенса — `apps/backend/src/infrastructure/crypto/pii-crypto.ts` + два хука в `PostgresMvpPersistenceBackend`: при записи коллекции `learners` снилс → AES-256-GCM (тот же keyring `INTEGRATION_CRYPTO_KEYS`, что секреты интеграций/TOTP) + слепой индекс `snilsHash` (новый метод `IntegrationCryptoService.blindIndex` — keyed HMAC-SHA256, по НОРМАЛИЗОВАННЫМ цифрам: маска «XXX-XXX-XXX YY» и «XXXXXXXXXXX» дают один хэш; голый sha256 не годится — 10^9 значений перебираются мгновенно); при чтении — расшифровка, `snilsHash` в память/API не отдаётся. **Рантайм не менялся вовсе**: все пять реестровых экспортов, ЕСИА-сверка (`findLearnersBySnils`), bulk-import дедуп, PDF-карточка и отчёты видят открытый СНИЛС в памяти. Legacy plaintext-строки читаются passthrough и перешифровываются при первом сохранении состояния тенанта (lazy-миграция; в аудит-лог СНИЛС и раньше не попадал — `SENSITIVE_FIELDS`+`maskPii`). Миграция **`0061`** — только аддитивные functional-индексы по `data->>'snilsHash'` (под SQL-выборки нормализованного read-model Фазы 4).
- **Files changed:** `apps/backend/migrations/0061_learners_pii_blind_index.sql`, `apps/backend/src/infrastructure/crypto/pii-crypto.ts` (+ тест), `apps/backend/src/modules/mvp/infrastructure/postgres-mvp-persistence.backend.ts` (+ тест: шифртекст в jsonb / roundtrip / legacy re-encrypt / без снилса), `apps/backend/src/modules/integrations/services/integration-crypto.service.ts` (`blindIndex`), `apps/backend/src/modules/mvp/migrations.0061.test.ts`, docs.
- **Тесты:** pii-crypto 6 (roundtrip, слепой индекс keyed+normalization-insensitive, сериализация без сырых цифр, passthrough, no-double-encrypt); persistence 4 (вкл. lazy re-encrypt); `pnpm test:migrations` 51 зелёных (0061 применяется на живом Postgres); infrastructure+bulk-import+esia 70; typecheck, eslint чисты.
- **Deviations:** объём сужен по факту кода — паспортных полей нет (план писался до разведки); миграция — индексы вместо колонок (JSONB-хранение); миграция данных lazy вместо отдельного скрипта; экспорты 0045/0046 не трогались (дешифровка на границе персистенса делает это ненужным); `dateOfBirth` оставлен открытым (не в объёме ФТ-C3.3, кандидат Фазы 3 вместе с согласиями/сроками).
- **Next:** все 7 задач Фазы 0 сделаны (PR #312 Task 5 и этот PR — на мердже). Дальше — **приёмка фазы** (ТЗ §13/§15): полный `pnpm ci:check` на актуальном `main`, финальное обновление статусов, закрытие Фазы 0 в трекере; затем план Фазы 1 «Документы» (нужно решение вопроса №2 — docxtemplater).

### 5.174 Приёмка Фазы 0 «Фундамент» (ТЗ §13/§15)

- **Summary:** финальный прогон на коде «main + Task 7» (ветка PR #313 после merge main c #312): полный **`pnpm ci:check`** — lint, typecheck, contracts, **2033 теста бэкенда + 682 фронтенда**, сборки всех 8 пакетов (79 страниц фронта) — зелёный; **`test:isolation`** 12; **`test:security`** 24; **`test:migrations`** 51 (цепочка 0000–0061 на живом Postgres). Все 7 задач фазы выполнены семью PR #307–#313. Открытый вопрос №7 закрыт (шифрование ПДн — в Фазе 0, §5.173). Чек-лист «Завершение фазы» в плане отмечен, Фаза 0 в трекере — ✅.
- **Грабля прогона в worktree:** свежий git-worktree не наследует гит-игнорируемые env-файлы — без `apps/backend/.env` webhook-тест падает (verifier fail-open без `INTEGRATION_WEBHOOK_SECRET`), без `apps/frontend/.env.local` `next build` валится на prerender (нет `NEXT_PUBLIC_*`); корневой `.env` НЕ годится (пустые `SMTP_*=` отвергает Zod). Лечение: копировать оба файла из основной копии.
- **Вынесено из фазы осознанно** (см. план): per-endpoint HTTP-матрица изоляции + tenantId-инвариант очередей (инкремент Task 1), обязательность 2FA для `platform_admin` (решение владельца), боевой SMTP и `INTEGRATION_CRYPTO_KEYS` (ops при деплое), белый список типов файлов (довесок G5), RLS-слой (Фаза 4).
- **Next:** план **Фазы 1 «Документы»** (ЭПИК A: движок рендера docxtemplater→Gotenberg→S3, язык шаблонов, админ-UX, массовая выдача) в `docs/superpowers/plans/` + апрув владельца. **Блокер — открытый вопрос №2** (библиотека рендера: docxtemplater MIT-версия или альтернатива) — нужно решение владельца до старта.

### 5.175 Фаза 1 «Документы», Task 1 — движок рендера DOCX (ФТ-A1.2/A2)

- **Контекст:** Фаза 0 принята (§5.174), план Фазы 1 апрувнут (PR #314), вопрос №2 решён — **docxtemplater, бесплатное ядро** (картинки ФТ-A7 — отдельное решение к Task 9).
- **Summary:** чистый модуль `apps/worker/src/render/docx-render.ts` (+`docxtemplater`, `pizzip` в worker): `renderDocx(buffer, variables)` — одиночные теги `{learner.full_name}`, циклы `{#group_learners}…{/}` (N строк протокола), условия/инверсия, `nullGetter` → пустая строка; кастомный parser ищет значение сначала по ПЛОСКОМУ ключу с точками (ровно формат словаря `pillar-a-variables`), затем по вложенному пути — angular-expressions не нужен. **Байт-детерминизм** (ФТ-A1.4): даты zip-записей фиксируются, два рендера в разные секунды дают идентичный файл (голден-тест с реальной задержкой 1.1с). `extractPlaceholders` — список тегов тела+колонтитулов в порядке появления (для таблицы «найдено/соответствует/неизвестно» ФТ-A3.2); split-run теги (Word рвёт текст на прогоны) покрыты. Ошибки шаблона → `TemplateRenderError` со списком объяснений (несбалансированный цикл, битый zip) — терминальные, в отличие от транспортных (ретраи — Task 3).
- **Files changed:** `apps/worker/src/render/docx-render.ts`, `apps/worker/src/render/docx-fixture.ts` (фабрика тестовых DOCX — вместо бинарных фикстур в git), `apps/worker/src/render/docx-render.test.ts`, `apps/worker/package.json` (+2 deps), docs.
- **Тесты:** 10 юнитов рендера зелёные (плоские ключи, split-runs, цикл ×3, условия обе ветки, nullGetter, байт-детерминизм, unclosed-loop, не-zip); весь worker 25; typecheck/eslint чисты.
- **Next (Фаза 1):** Task 2 — транспорт (enqueue backend→RabbitMQ, wire `case 'document'` в worker, internal-эндпоинты под `WorkerCallbackGuard`, файлы по presigned URL) — вертикальный срез «generate → DOCX в S3».

### 5.176 Фаза 1 «Документы», Task 2 — транспорт рендера: очередь → worker → файлы (ФТ-A1.1)

- **Summary:** закрыты все три разрыва обвязки из плана #314. **(1) Enqueue:** `DocumentsEnqueueService` (envelope `{messageId, tenantId, jobType:'document', payload:{taskId}}`, best-effort — при недоступном RabbitMQ задача остаётся `queued`) публикуется из трёх точек: `POST documents/generate`, `generate/batch`, слушатель авто-выдачи (там — строго ПОСЛЕ выхода из tenant-runner'а, когда состояние сохранено); env `JOB_ROUTING_DOCUMENT`. **(2) Worker:** `case 'document'` в `main.ts` → новый `document-job.ts`: claim → скачивание DOCX-шаблона по presigned GET → `renderDocx` (Task 1) → presigned PUT результата → `complete`; ошибки ШАБЛОНА терминальны (`fail` с человекочитаемым сообщением, ack), ТРАНСПОРТА — бросаются (retry с backoff → DLQ), гонка «сообщение обогнало сохранение состояния» — 404 от `start` → retryable. **(3) Файлы:** `DocumentsInternalWorkerController` (`internal/worker/documents/{start,complete,fail,result-upload-intent}`) под `WorkerCallbackGuard`, состояние — через `DocumentsTenantRunner` (вне HTTP-персистенса), presigned URL'ы выдаются вне tenant-лока; результат идёт стандартным files-циклом (AV-гейт по флагу); у `DocumentsService` появился `getTaskReservedNumber`. Внутренний контроллер внесён в белый список `test:isolation` с обоснованием.
- **Files changed:** backend: `documents-enqueue.service.ts` (новый), `documents-internal-worker.controller.ts` (новый, + тест), `documents.controller.ts`, `documents.module.ts` (+FilesModule), `documents.service.ts` (`getTaskReservedNumber`), `enrollment-document-issuance.listener.ts` (+ тест-фикс конструктора), `env.schema.ts` (`JOB_ROUTING_DOCUMENT`), `controllers-tenant-scope.isolation.test.ts` (whitelist); worker: `document-job.ts` (новый, + тест), `main.ts` (wire), `env.ts` (+`GOTENBERG_URL` — задел Task 3); docs.
- **Тесты:** documents-модуль 236 (внутр. контроллер 6: claim/re-claim/404-гонка/complete-номер/fail-идемпотентность/upload-intent); worker 32 (document-job 7: happy-path с реальным DOCX в PUT-теле и подстановкой номера, терминальная задача — молчаливый ack, ошибка шаблона → fail, 404 → retryable, forbidden → NonRetryable, транспорт → throw, нет токена); `test:isolation` 12; typecheck обоих приложений; eslint чист.
- **Deviations:** worker-логика — `document-job.ts` поверх internal-HTTP; `DocumentGenerationPipeline` (локальные deps) не задействован — оставлен как контракт; живой e2e (RabbitMQ+S3+Gotenberg) — в smoke Task 3; переменные рендера пока минимальны (`document.number`/`document.date`) — полный резолв Task 3/4.
- **Next (Фаза 1):** Task 3 — PDF через Gotenberg (`{fileId, pdfFileId}`), снапшот подстановки (миграция 0062, шифрование `pii-crypto`), маппинг ошибок, живой smoke всей цепочки на тестовом сервере.

### 5.177 Фаза 1 «Документы», Task 3 — PDF через Gotenberg, оба формата, снапшот подстановки (ФТ-A1.3/A1.4/A1.5)

- **Summary:** цепочка выдачи доведена до печатного документа. **(1) PDF (ФТ-A1.3):** `worker/src/render/gotenberg-convert.ts` — `POST /forms/libreoffice/convert`, multipart с обязательным `.docx`-именем файла (по нему LibreOffice выбирает конвертер); контракт снят с ЖИВОГО `gotenberg:8` до написания кода. Конвейер грузит ОБА формата (DOCX-исходник + PDF-двойник в уже существовавшее поле `pdfFileId`), PDF готовится ДО загрузки — либо кладётся пара, либо задача честно падает. **(2) Снапшот (ФТ-A1.4):** `variablesSnapshot` в `GeneratedDocumentEntity` + миграция `0062`; шифруется целиком на границе персистенса (`encryptDocumentSnapshotAtRest`/`decrypt…` рядом с СНИЛС-парой, тот же keyring); битый шифртекст роняет только снапшот, документ (файлы/номер/QR) остаётся читаемым. На ПУБЛИЧНОМ QR-пути снапшот **вырезается**, а не расшифровывается — чтобы будущая правка ответа не смогла выдать ПДн. **(3) Ошибки (ФТ-A1.5):** 4xx Gotenberg (LibreOffice не открыл файл) → `NonRetryableJobError` → задача `failed` с человекочитаемым текстом; сеть/таймаут/5xx/не-PDF-тело → обычная `Error` → ретрай с backoff'ом и DLQ. `completeTask` расширен ОПЦИОНАЛЬНЫМ 5-м параметром — 20+ существующих вызовов не тронуты.
- **Живой прогон на тестовом сервере:** поднят `infra-gotenberg-1`, реальный `renderDocx` (шапка + цикл по 3 слушателям + председатель) → Gotenberg → PDF 16 КБ, 1 страница. Текст извлечён `pdftotext` (poppler поставлен без sudo, `apt-get download` + `LD_LIBRARY_PATH` — приём из [[playwright-on-server]]) и **совпал с бланком дословно, кириллица читаема**: `ПРОТОКОЛ № 26-ОТ-0042 от 2026-07-26`, три строки `N. ФИО — аттестован`, `Председатель комиссии: Петров П. П.`. Проверено также: повтор из снапшота даёт байт-в-байт тот же DOCX; другие данные → другой PDF.
- **Files changed:** worker: `render/gotenberg-convert.ts` (+тест), `document-job.ts` (PDF+два upload'а+снапшот), `main.ts` (проброс `GOTENBERG_URL`), `document-job.test.ts`; backend: `infrastructure/crypto/pii-crypto.ts` (+тест), `documents.types.ts`, `documents.service.ts` (`completeTask` artifacts), `documents-internal-worker.controller.ts` (+тест: DTO `pdfFileId`/`variablesSnapshot`, расширение файла по MIME), `infrastructure/postgres-documents-persistence.backend.ts` (шов шифрования + вырезание на QR-пути), `migrations/0062_generated_documents_snapshot.sql` (+тест); infra: healthcheck `gotenberg` в обоих compose + `worker.depends_on: gotenberg`.
- **Тесты:** worker 43 (gotenberg-convert 6: multipart-контракт, 4xx/5xx/сеть/не-PDF; document-job +5: две загрузки, PDF из Gotenberg, 4xx→fail без загрузок, 5xx→throw без записи, **голден «перевыпуск из снапшота = байт-в-байт»**); documents 241; crypto 14 (снапшот: шифрование, отсутствие ФИО/СНИЛС в сериализованном JSON, round-trip, битый шифртекст, no-double-encrypt); `test:isolation` 12; `test:migrations` 51 (0062 применилась на живом Postgres); typecheck обоих; eslint чист.
- **Deviations:** классификация ошибок по типу вместо `error.name='ServiceUnavailableError'` (у `decideRetry` в `main.ts` allowlist НЕ-ретраибельных — обычная Error уже ретраится); миграция `0062` — колонка на нормализованную таблицу (рантайм пишет JSONB, поле уезжает туда само) по прецеденту 0033/0034; сверх плана — вырезание снапшота на публичном QR-пути и healthcheck Gotenberg. Известное ограничение: словарь переменных пока 2 ключа (`document.number`/`document.date`) — наполнение всеми 10 категориями это **Task 4**, до него PDF содержит бланк с пустыми местами для learner/commission.
- **Next (Фаза 1):** Task 4 — каталог переменных: резолверы 5 недостающих категорий (`tenant`/`group`/`learner`/`counterparty`/`course`) + новые переменные ТЗ (`learner.snils`, `document.issue_date_words`, `commission.chairman_*`, `tenant.license_number`), чтобы бланк заполнялся целиком.

### 5.178 Фаза 1 «Документы», Task 4 — каталог переменных подключён к рендеру (ФТ-A2.3)

- **Разведка изменила постановку:** пять резолверов (`program`/`commission`/`enrollment`/`document`/`group_learners`) существовали с Pillar A, но **ни один не вызывался из рабочего кода** — только из тестов; в бланк уходили два захардкоженных ключа. Поэтому объём Task 4 — не «дописать пять недостающих», а «дописать пять + подключить все десять».
- **Summary:** (1) `entity-variables.ts` — резолверы `tenant`/`learner`/`counterparty`/`group`/`course` в том же pure-контракте (снимки на вход, плоский словарь на выход, неизвестный ключ → пустая строка). `tenant.license_number`/`accreditation_number` берутся из `org.training_licenses` (активная запись нужного типа) — полей лицензии у тенанта нет. (2) `variable-catalog.ts` — **каталог 70 переменных как SSOT в коде** (не сидами: `documents.template_variables` привязана к версии шаблона, это «переменные ЭТОГО бланка», а не справочник; плюс её схема расходится между 0002 и 0005). Там же `classifyPlaceholders` — готовая основа таблицы «найдено / соответствует / неизвестно» для Task 5. (3) `DocumentVariablesBuilder` — тот самый caller, которого ждали pure-резолверы: идёт цепочкой `задача → запись на обучение → слушатель / группа → заказчик / курс → версия программы → комиссия`, добирает реквизиты и лицензии центра, склеивает все десять категорий. MVP-состояние читается через `MvpTenantRunner`, собранный из инфраструктуры БЕЗ импорта `MvpModule` (иначе цикл — приём из `CommunicationModule`). Словарь всегда одной формы (скелет из всех кодов каталога), иначе снапшот ФТ-A1.4 был бы разного состава и перевыпуск не эквивалентен. (4) `date-words.ts` — дата прописью своей таблицей месяцев, а не `Intl` (вывод ICU зависит от версии данных локали, а перевыпуск обязан совпадать байт-в-байт).
- **Живой прогон нашёл баг, который не видели ни типы, ни 44 существующих теста:** строки таблицы слушателей отдавались в camelCase (`fullName`) при snake_case во всём остальном каталоге и **без номера строки** — админ пишет `{full_name}` и получает `. , Начальник цеха`. Добавлены `row_no` (1-based, после сортировки) и snake_case-псевдонимы; camelCase сохранён, чтобы не ломать существующие бланки и тесты. После фикса живой PDF: «АНО ДПО «Учебный центр Пример» / Лицензия № Л035-00115-77/00123456 / ПРОТОКОЛ № 26-ОТ-0042 от 26 июля 2026 г. / Программа: Охрана труда для руководителей (40 ч.) / Заказчик: АО «Металлургический завод», ИНН 7712345678 / 1. Иванов Иван Иванович, Начальник цеха — СНИЛС 112-233-445 95 / 2. Сидорова Анна Петровна … / Председатель комиссии: Петров Пётр Петрович».
- **Files changed:** новые `documents/{entity-variables.ts,variable-catalog.ts,document-variables.builder.ts,date-words.ts}` (+ 4 теста), `mvp/regulatory-acts.seed.ts` (константа вынесена из `mvp.service.ts` — прямой импорт дал бы цикл); изменены `documents/pillar-a-variables.ts` (+`row_no`, snake_case-псевдонимы), `documents-internal-worker.controller.ts` (хардкод двух ключей → сборщик), `documents.module.ts` (+`TenantModule`/`OrgModule`, MvpTenantRunner из инфраструктуры), `mvp.service.ts`, тесты контроллера и `pillar-a-variables.test.ts`.
- **Тесты:** documents 274 (новых 32: 11 резолверов, 7 каталога с **тестом-стражем «каждая переменная каталога реально резолвится»**, 8 сборщика — включая изоляцию чужого тенанта в таблице группы и деградацию при недоступном состоянии, 6 даты прописью); весь documents+mvp **1311**; `test:isolation` 12; typecheck и eslint чисты.
- **Deviations:** каталог кодом вместо миграции 0063 (обоснование выше — миграция не понадобилась); `resolveTemplateVariables` (валидация required) по-прежнему вызывается только из тестов — привязка к generate-пайплайну относится к Task 5 (там же UI каталога); склонения ФИО — ручные поля, как и предусмотрено ТЗ.
- **Next (Фаза 1):** Task 5 — админ-UX шаблонов: загрузка DOCX через files-модуль с AV-гейтом, парсинг плейсхолдеров (`extractPlaceholders` из Task 1 + `classifyPlaceholders` из этой задачи уже готовы), предпросмотр «сгенерировать пример PDF», версионирование.

### 5.179 Фаза 1 «Документы», Task 5a — серверная часть админ-UX шаблонов (ФТ-A3.1/A3.2/A3.3)

- **Ключевое решение:** движок рендера вынесен из воркера в общий пакет **`@trudskill/docx-render`** (`renderDocx`, `extractPlaceholders`, `convertDocxToPdf`, тестовые фикстуры). Причина: админский предпросмотр обязан использовать ТОТ ЖЕ код, что боевая выдача — копия в двух приложениях разошлась бы, и «в предпросмотре выглядело иначе». Пакет очищен от worker-специфики: вместо `NonRetryableJobError` (класс из очередей) — собственный `DocumentConversionError { retryable }`, воркер мапит его в решение о ретрае. Подключение: `pnpm-workspace` подхватывает автоматически, но вручную дописаны `tsconfig.base.json` (paths), корневой `tsconfig.json` и `references` обоих приложений, корневой `vitest.config.ts` (projects — там явный список, не glob), alias в `apps/backend/vitest.config.ts` и цепочка сборки пакетов в `apps/backend package.json:typecheck`.
- **Эндпоинты:** `POST templates/upload-url` — интент загрузки бланка (отдельный `keyPrefix: templates`, allowlist ТОЛЬКО DOCX, лимит 25 МБ, AV-гейт общий с files-модулем); `POST template-versions/:id/parse-variables` — **раньше был заглушкой: возвращал ранее сохранённые переменные и сам DOCX не читал**, теперь реальный разбор через `extractPlaceholders` + `classifyPlaceholders` (Task 4) → «найдено / соответствует каталогу / неизвестно»; `POST template-versions/:id/preview` — PDF потоком (`@Res()`, конверт ответа для бинарных тел не применяется) на демо-данных `demoVariables()`. Демо-значения намеренно узнаваемо-условные («Образцов Образец Образцович», «ОБРАЗЕЦ-0001»), чтобы предпросмотр нельзя было принять за подлинный документ; любая забытая переменная каталога подставляется как ««код»» — предпросмотр всегда полный.
- **Ошибки — человекочитаемые 400 вместо 500:** не-DOCX → `template_unreadable`, битый шаблон → `template_render_failed` с перечнем проблем, недоступный Gotenberg → `preview_conversion_failed` (предпросмотр интерактивен, ретраить нечего).
- **Живой прогон:** разбор бланка — 8 плейсхолдеров, 7 распознано, **опечатка `learner.favourit_color` поймана и показана отдельно**; предпросмотр — PDF 17 КБ, текст «АНО ДПО «Учебный центр» (пример) / УДОСТОВЕРЕНИЕ № ОБРАЗЕЦ-0001 от 8 февраля 2026 г. / Выдано: Образцов Образец Образцович, Специалист».
- **Files changed:** новый пакет `packages/docx-render/**` (5 файлов перенесены из `apps/worker/src/render/` через `git mv` — история сохранена, + `package.json`/`tsconfig.json`/`vitest.config.ts`/`index.ts`); backend: `template-inspection.service.ts` (+тест), `documents.controller.ts` (3 эндпоинта), `variable-catalog.ts` (`demoVariables`), `documents.module.ts`; worker: `document-job.ts`/`document-job.test.ts` (импорты на пакет, маппинг ошибки), `package.json`; конфиги монорепо (7 файлов).
- **Тесты:** пакет 16, worker 27, documents 280 (+6 сервиса разбора: known/unknown, описание из каталога, не-DOCX → 400, предпросмотр отдаёт заполненный документ в Gotenberg, битый шаблон → 400, сбой Gotenberg → 400); `test:isolation` 12; typecheck backend/worker/пакета; eslint чист.
- **Deviations:** Task 5 разбит на 5a (сервер) и 5b (интерфейс) — по объёму; валидация `fileId` при создании версии и стартовый набор шаблонов (A3.6) отнесены в 5b, где появится сам поток загрузки.
- **Next (Фаза 1):** Task 5b — фронт: файловый input по образцу SCORM (presigned PUT, `contentType` обязан совпадать с подписанным), таблица распознанных плейсхолдеров, кнопка «Сгенерировать пример», замена ручного ввода `fileId`.

### 5.180 Фаза 1 «Документы», Task 5b — интерфейс загрузки бланков (ФТ-A3)

- **Что было:** на странице `/documents` админ вписывал `fileId` руками с подсказкой «из backend файлов» — то есть загрузить свой бланк без разработчика было нельзя, а это ровно критерий приёмки ЭПИКа A.
- **Summary:** выбор `.docx` файлом → интент (`templates/upload-url`) → прямой PUT в хранилище → создание версии → активация → разбор плейсхолдеров, всё одной кнопкой. Результат разбора показывается сразу: таблица «Плейсхолдер / Категория / Что подставится» из каталога и **отдельный красный блок «система не знает такие плейсхолдеры»** с перечислением — админ видит опечатку до того, как выдаст документ с пустым полем. Кнопка «Пример PDF» открывает предпросмотр на демо-данных в новой вкладке. API вынесен в `features/templates/api.ts` (конвенция `features/<domain>/api.ts`), логика PUT повторяет SCORM-образец: `Content-Type` в PUT задаётся явно тем же DOCX-MIME, которым подписан интент — у `.docx` `file.type` в браузере часто пуст, и без явного заголовка хранилище отвечает 403.
- **Бэкенд:** `createTemplateVersion` теперь **проверяет файл** перед созданием версии (существует, тенантный, прошёл AV-гейт, читается как DOCX) — раньше `fileId` принимался на честном слове, и битая ссылка всплывала только при выдаче документа, уже съев номер.
- **Files changed:** новые `apps/frontend/src/features/templates/{api.ts,api.contract.test.ts}`; изменены `apps/frontend/app/documents/page.tsx` (состояния загрузки/разбора вместо `fileIdForVersion`, обработчики `uploadTemplateVersion`/`openPreview`, разметка секции версий), `apps/backend/src/modules/documents/documents.controller.ts` (валидация файла).
- **Тесты:** фронт целиком **688** (новых 6 контрактных: адрес интента, явный DOCX-MIME в PUT при пустом `file.type`, отказ хранилища, разбор known/unknown, предпросмотр как object-URL мимо конверта, человекочитаемая ошибка из конверта); documents 280; typecheck фронта и бэкенда; eslint чист.
- **Deviations / остаток:** стартовый набор шаблонов при онбординге (A3.6) не сделан — нужны готовые бланки от владельца; вынесен в остаток фазы. Предпросмотр открывается в новой вкладке (object-URL), а не встроенным вьюером — это MVP-решение, встроенный просмотр можно добавить позже без изменения API.
- **Next (Фаза 1):** Task 6 — нумераторы: UI настройки маски per tenant (`{YY}-ОТ-{SEQ:4}`, старт, период сброса — поля в модели уже есть) и судьба зарезервированного номера при падении рендера (сейчас `failTask` помечает резервацию `failed`, номер не переиспользуется — по ТЗ надо либо освобождать, либо явно аннулировать).

### 5.181 Фаза 1 «Документы», Task 6 — нумераторы (ФТ-A4.1/A4.2)

- **Что было:** (1) упавшая задача помечала резервацию `failed`, и номер сгорал — в сквозном реестре оставалась дыра, а для проверяющего пропуск равносилен утраченному документу; (2) настроить нумератор из интерфейса было нельзя (только запросом к API), то есть УЦ не мог задать маску без разработчика; (3) «стартового значения» из ФТ-A4.1 в контрактах вообще не было — нумерация всегда начиналась с единицы, и перенос журнала с бумаги («продолжить с 137») был невозможен.
- **A4.2 — освобождение номера:** `failTask` ставит `released` (статус был в типе, но не использовался) и пишет отдельную запись аудита `documents.number.released` с номером, задачей и причиной — у номера должна быть прослеживаемая судьба, а не тихое исчезновение. `reserveNumber` перед выдачей нового подбирает освобождённый по тому же правилу; **границу периода не пересекаем** — маска содержит период, и номер прошлого года в реестре текущего выглядел бы подлогом (для этого в резервации появилось `periodKey`). План допускал и «акт аннулирования» — выбрано освобождение, при нём дыр не остаётся вовсе.
- **A4.1 — стартовое значение + экран:** `startCounter` («номер, который выдастся первым»; внутри счётчик хранит последний выданный, отсюда −1) добавлен в create/update и вычищается из сущности перед `Object.assign`, иначе протёк бы в персистенцию. Откат назад запрещён `BadRequest` — уменьшение счётчика повторно выдало бы уже использованные номера. Секция «Нумераторы документов» на `/documents` показывает действующие правила (маска, период, сколько выдано, какой номер следующий) и заводит новое; предпросмотр считается на клиенте той же формулой, что и на сервере (включая автодописывание `{period}`), — админ видит результат до сохранения.
- **Миграция не нужна:** резервации персистятся JSONB-снапшотом состояния целиком (`PostgresDocumentsPersistenceBackend`), а не построчным маппингом колонок, — новое поле сохраняется само.
- **Files changed:** изменены `apps/backend/src/modules/documents/{documents.service.ts,documents.types.ts,documents.dto.ts,documents.service.test.ts,documents.state-machine.test.ts}`, `apps/frontend/app/documents/page.tsx`; новые `apps/frontend/src/features/numbering/{api.ts,api.contract.test.ts,screens.tsx}`.
- **Тесты:** documents **290** (10 новых: 6 на освобождение/переиспользование — включая изоляцию по типу документа, границу периода и след в аудите; 4 на стартовое значение — старт, сдвиг вперёд, отказ при откате назад, отсутствие протечки служебного поля); фронт целиком **696** (8 новых контрактных, из них 4 на предпросмотр). Typecheck и eslint чисты.
- **Deviations:** два теста, закреплявших прежний исход `failed`, обновлены под новое требование ТЗ — это смена спецификации, а не починка теста. Логика вынесена в `features/numbering/` отдельным компонентом: страница документов и без того 725 строк.
- **Известное (не в этой задаче):** `pnpm typecheck` на чистом чекауте падал 4 ошибками в `apps/worker` — `@trudskill/docx-render` отдаёт типы из `dist`, а `typecheck.dependsOn` не содержал `^build`. Блокировало pre-push у всех, кто начинает от `main`; починено отдельным PR (`fix/turbo-typecheck-needs-build`).
- **Next (Фаза 1):** Task 7 — «закрыть группу» (ФТ-A5): пакет протокол+удостоверения, ZIP, журнал выдачи, перезапуск только упавших. Task 8 (ФТ-A6, частичное ФИО) частично закрыт заделом: `public-verify.util.ts` и публичная страница уже существуют — нужен только вывод «Иванов И. И.».

### 5.182 Фаза 1 «Документы», Task 7a — «закрыть группу», серверная часть (ФТ-A5.1/A5.3)

- **Что было:** закрытие группы собиралось вручную — отдельно протокол, отдельно по удостоверению на каждого. Для группы 25 человек это 26 нажатий, и сбой посреди процесса оставлял оператора без понимания, что уже выпущено. `issueGroupOrder` (Pillar A §5.7) не подходит: он пишет записи документов напрямую, с пустым `fileId`, то есть без реального рендера.
- **Summary:** `closeGroup` одним вызовом ставит на рендер протокол по группе и удостоверение каждому сдавшему — именно ЗАДАЧИ, файлы рождаются штатным конвейером «очередь → worker → S3». Идемпотентность на детерминированных ключах `close-group:<group>:…`: повтор ничего не дублирует. Упавшие задачи возвращаются в очередь (ФТ-A5.3 «упал 1 из 25 — перезапустить только его»), готовые не трогаются — перевыпуск сжёг бы номер и подменил уже выданный документ. Слушатели, добавленные позже, дозаказываются; прежние остаются на месте.
- **Сводка (ФТ-A5.3):** `getGroupClosureStatus` → `{queued, running, completed, failed, isComplete}`. Считается по **новому полю `groupId` в задаче**, а не по идемпотентному кэшу: тот живёт сутки и вычищается по TTL, а сводка обязана переживать перезапуск. У удостоверения `sourceEntityId` — это запись слушателя, поэтому без явной ссылки на группу статистику собрать нечем (закреплено тестом с `state.idem.clear()`).
- **Эндпоинты:** `POST admin/documents/close-group` (`documents.generate`), `GET admin/documents/close-group/:groupId` (`documents.read`).
- **Files changed:** новый `apps/backend/src/modules/documents/close-group.service.test.ts`; изменены `documents.service.ts`, `documents.dto.ts`, `documents.types.ts`, `documents.controller.ts`.
- **Тесты:** documents **300** (10 новых: состав комплекта, идемпотентность, добивание только упавших, дозаказ новых слушателей, сводка, признак завершённости, отказ на чужом типе шаблона, пустой список, изоляция тенантов, устойчивость сводки к очистке кэша); typecheck 13 задач; `test:isolation` 12; eslint чист.
- **Deviations:** приватный хелпер назван `assertTemplateOfType` — имя `assertTemplateType` уже занято импортом из `documents.dto.js`.
- **Next (Task 7b):** ZIP всех PDF группы (`adm-zip` уже в зависимостях backend) + кнопка «Закрыть группу» и прогресс в `/admin/issuance-journal`.

### 5.183 Фаза 1 «Документы», Task 7b — ZIP-комплект и кнопка «Закрыть группу» (ФТ-A5.2)

- **Что было:** Task 7a дал серверный сценарий закрытия группы, но пользоваться им было нечем — ни кнопки, ни выгрузки. Админ УЦ отдаёт пачку в бумажный архив или заказчику; ходить по 25 документам поштучно нереально.
- **ZIP (ФТ-A5.2):** `GroupPackageService.buildGroupZip` собирает архив из готовых PDF группы (`adm-zip` уже был в зависимостях backend). Берёт только завершённые задачи с этим `groupId` — упавшие и неотрендеренные не попадают, их состояние видно в сводке `getGroupClosureStatus`. Документ без `pdfFileId` пропускается: тянуть из хранилища нечего, а класть DOCX под именем `.pdf` нельзя. Имена внутри архива — по номеру документа (пачка должна читаться без базы), совпадения разводятся суффиксом, иначе adm-zip молча положит две записи с одним именем. Эндпоинт `GET admin/documents/close-group/:groupId/package` отдаёт поток, как предпросмотр PDF.
- **Фронт:** секция «Закрыть группу» в `/admin/issuance-journal` — форма (группа, два шаблона, список сдавших через пробел/запятую/строку), кнопка закрытия, кнопка выгрузки ZIP и прогресс. Прогресс сам обновляется каждые 5 с и замолкает по готовности; при упавших задачах подсказка прямо говорит, что делать — нажать ещё раз.
- **Files changed:** новые `apps/backend/src/modules/documents/group-package.service.{ts,test.ts}`, `apps/frontend/src/features/close-group/{api.ts,api.contract.test.ts,screens.tsx}`; изменены `documents.service.ts` (`listGroupDocuments`), `documents.controller.ts`, `documents.module.ts`, `issuance-journal.tsx`.
- **Тесты:** documents **307** (7 новых), фронт **703** (7 новых); typecheck 13 задач; eslint чист.
- **Deviations:** `fetchPackage` вынесен из `downloadPackage` — DOM во фронтовых тестах проекта недоступен (jsdom не в зависимостях, CLAUDE.md «No React Testing Library»), поэтому сетевая часть и имя файла покрыты тестом, а побочный эффект браузера остаётся тонкой обёрткой, как у `issuanceJournalApi.downloadCsv` (тоже без покрытия).
- **Next (Фаза 1):** Task 8 — ФТ-A6, частичное ФИО «Иванов И. И.» на публичной проверке. Задел больше, чем считал план: `public-verify.util.ts` и страница `features/verify/` уже существуют — нужен только вывод инициалов. Дальше — Task 9 (изображения/подписи, ждёт решения по модулю картинок) и Task 10 (комплаенс-валидатор протокола).

### 5.184 Фаза 1 «Документы», Task 8 — частичное ФИО на публичной проверке (ФТ-A6.1)

- **Что было:** страница проверки по QR не показывала слушателя вовсе — поле `learnerFullName` в контракте было, но никто его не заполнял. Регулятор видел номер и статус, но не мог сверить, чьё это удостоверение.
- **Ключевое ограничение:** наивный путь «взять ФИО из снапшота подстановки на чтении» закрыт намеренно — публичный путь (`findGeneratedDocumentByQrToken`) вырезает `variablesSnapshot` целиком, потому что в нём полные ПДн из бланка. Это защита, а не недоделка; снимать её ради удобства нельзя.
- **Решение:** маска считается ОДИН раз при выпуске (`completeTask`, пока снапшот под рукой) и лежит в документе готовой — новое поле `learnerNamePublic`. Наружу уходят только инициалы, полное ФИО остаётся в шифрованном снапшоте, недоступном публичному пути. Инициалы ПДн не являются.
- **`maskFullName`** держит русскую конвенцию «Фамилия Имя [Отчество]»: двойная фамилия не рвётся (`Петров-Водкин К. С.`), отчество может отсутствовать, лишние пробелы схлопываются, хвост длиннее трёх частей отбрасывается («Младший»/«оглы» в публичной проверке ничего не подтверждают). Архивный документ не раскрывает даже инициалы — он и так отдаёт `not_found`.
- **Фронт не тронут:** страница `features/verify/` уже рендерит `learnerFullName` (строка была на месте с UI-фазы 4) — задел оказался больше, чем считал план.
- **Files changed:** изменены `public-verify.util.{ts,test.ts}`, `documents.types.ts`, `documents.service.ts`, `close-group.service.test.ts`.
- **Тесты:** documents **320** (13 новых: 7 на маску, 4 на выдачу поля — legacy/отозванный/архивный, 2 сквозных); `test:security` 24; `test:isolation` 12; typecheck 13 задач; eslint чист.
- **Остаток ЭПИКа A:** Task 9 (ФТ-A7 изображения/подписи) ждёт решения владельца по модулю картинок — вопрос №2 плана оставлял три варианта (платный официальный модуль ~250€, бесплатный community, картинки поверх PDF в Gotenberg). Task 10 (ФТ-A8, мягкий комплаенс-валидатор протокола по п. 92 ПП 2464) свободен и ни от чего не зависит. Также остаётся A3.6 — стартовый набор шаблонов при онбординге: нужны готовые бланки от владельца.

### 5.185 Фаза 1 «Документы», Task 10 — мягкий комплаенс-валидатор протокола (ФТ-A8)

- **Что было:** протокол проверки знаний обязан нести реквизиты п. 92 ПП 2464, но платформа молчала — пропуск всплывал только при проверке инспектором, хотя бланк виден целиком уже при загрузке.
- **Summary:** `validateProtocolTemplate` сверяет плейсхолдеры бланка с семью реквизитами нормы (организация, номер, дата, программа, ФИО/должности проверяемых, результат проверки, состав комиссии). Каждое требование закрывается любым из равнозначных плейсхолдеров: наименование — коротким или юридическим, дата — обычной или прописью, комиссия — председателем/секретарём/списком членов. Каждый пункт несёт `basis` со ссылкой на норму — админу нужно основание, а не «мы так решили».
- **Мягкость — по букве ТЗ:** результат приходит полем `compliance` в ответе `parse-variables`, загрузка бланка НЕ блокируется. Бланк вправе нести реквизит текстом («Протокол № **_ от _**»), запрещать такой шаблон мы не можем; смысл проверки — чтобы УЦ узнал о пропуске от нас. Поле считается только для `template_type='protocol'`, остальным типам не приходит вовсе.
- **Фронт:** список недостающих реквизитов с подсказкой, какой плейсхолдер вписать, и явной оговоркой, что предупреждение можно игнорировать; при полном бланке — короткое подтверждение.
- **Ограничение (кандидат на расширение каталога):** отдельной переменной «результат по слушателю» в каталоге нет — требование засчитывается формой итоговой аттестации (`program.final_assessment_form_label`), а итог по строкам таблицы УЦ проставляет в бланке. Полноценная поддержка требует резолвера результата аттестации и данных о сдаче — вне объёма Task 10.
- **Files changed:** новые `protocol-compliance.{ts,test.ts}`; изменены `documents.controller.ts` (ветка для протоколов в `parse-variables`), `apps/frontend/src/features/templates/api.ts` (тип `compliance`), `apps/frontend/app/documents/page.tsx` (блок предупреждений).
- **Тесты:** documents **328** (8 новых: полный бланк, пропуск с подсказкой, равнозначные варианты, дата прописью, пустой бланк, комиссия двумя путями, наличие ссылки на норму у всех требований, устойчивость к неизвестным плейсхолдерам); фронт 703; `test:isolation` 12; typecheck 13 задач; eslint чист.
- **Остаток ЭПИКа A:** только **Task 9 (ФТ-A7, изображения/подписи)** — ждёт решения владельца по модулю картинок (вопрос №2 плана: платный официальный модуль docxtemplater ~250€, бесплатный community-модуль, либо наложение картинок поверх PDF в Gotenberg). Также остаётся **A3.6** — стартовый набор шаблонов при онбординге: нужны готовые бланки от владельца.

### 5.186 Фаза 1 «Документы», Task 9 — изображения и подписи в бланке (ФТ-A7.1)

- **Что было:** подпись руководителя и печать УЦ приходилось «вшивать» в сам файл бланка. Значит, замена подписанта = перезаливка всех бланков, а один центр не мог держать разные подписи на удостоверении и протоколе. Задача ждала решения по модулю картинок (вопрос №2 плана).
- **Решение по модулю (закрывает вопрос №2 в части картинок): свой код в `@trudskill/docx-render`, без новой зависимости.** Официальный image-модуль docxtemplater платный; бесплатный community-модуль `docxtemplater-image-module-free@1.1.1` заброшен с 2019 г. и написан под старый module-API — с docxtemplater 3.69 не работает. Вариант «наложение поверх PDF в Gotenberg» отвергнут: он привязывает подпись к координатам листа, то есть ломается от любой правки бланка. Свой код к тому же даёт контроль над байт-детерминизмом (ФТ-A1.4), который сторонний модуль не гарантирует.
- **Как работает:** тег `{%tenant.stamp_image}` рендерится в текстовый маркер, затем `embedImages` в готовом пакете меняет маркер на `<w:drawing>`, дописывая медиа-файл, связь в `.rels` нужной части (тело/колонтитул) и `Default`-тип в `[Content_Types].xml`. Прогон разрезается, поэтому текст вокруг тега («М.П. …») сохраняется. Имена медиа-файлов и id связей детерминированы, даты zip-записей фиксированы — повторный рендер даёт байт-в-байт тот же файл.
- **Размер:** ширина задаётся в миллиметрах, высота считается по пропорциям (парсеры PNG IHDR / JPEG SOFn). Без умолчаний (подпись 40 мм, печать 35 мм) скан подписи 600 px встал бы в натуральную величину на пол-листа.
- **Переменные:** новые `tenant.signature_image` / `tenant.stamp_image` (fileId лежит в `payload.documentImages` реквизитов тенанта — JSONB, миграция не нужна, как в Task 6); существующие `commission.{chairman,secretary}.signature_file_id` помечены как картинки — отдельных кодов-дублей не заводили. Значение переменной остаётся fileId, поэтому подпись попадает в снапшот ФТ-A1.4 и перевыпуск берёт ровно ту же картинку.
- **Отказоустойчивость:** недоступный файл картинки НЕ валит выдачу — документ печатается без факсимиле. Застрявшая в ретраях очередь удостоверений хуже, чем удостоверение без печати. Неподдерживаемый формат и битый файл — терминальная ошибка с человекочитаемым текстом (ФТ-A1.5).
- **Админ-UX:** раздел «Подпись и печать» на `/documents` (загрузка PNG/JPEG ≤5 МБ, ширина в мм, удаление); в разборе бланка теги-картинки показаны отдельным списком, а вставка картинки обычным тегом даёт предупреждение — иначе в документе молча напечатался бы UUID файла. Предпросмотр PDF использует настоящие картинки центра, а не заглушки.
- **Юридический статус — факсимиле**, о чём сказано прямо в интерфейсе; юридически значимая подпись — esign/НЭП (ЭПИК C).
- **Files changed:** новые `packages/docx-render/src/docx-image.{ts,test.ts}`, `apps/backend/src/modules/tenant/tenant-document-images.ts`, `apps/backend/src/modules/documents/document-images.{ts,test.ts}`, `apps/frontend/src/features/tenant-images/{api.ts,screens.tsx,api.contract.test.ts}`; изменены `docx-render.ts` (опция `images`, `extractTemplateTags`), `docx-fixture.ts` (`tinyPng` — настоящий PNG кодом, бинарников в git по-прежнему нет), `index.ts`, `document-job.ts` (+тесты), `documents-internal-worker.controller.ts` (+тесты), `template-inspection.service.ts` (+тесты), `documents.controller.ts` (эндпоинты `tenant-images`), `variable-catalog.ts` (+тест), `entity-variables.ts`, фронт `templates/api.ts` и `app/documents/page.tsx`.
- **Живой прогон:** DOCX с подписью и печатью отправлен в реальный Gotenberg из compose — LibreOffice принял пакет, PDF 14 КБ содержит оба изображения (`/Subtype /Image` ×2). Это и есть проверка, что пакет собран корректно: битый DOCX LibreOffice просто отвергает.
- **Тесты:** docx-render **27** (11 новых), documents **334** (6 новых), worker **30** (3 новых), фронт **708** (5 новых). Полный `pnpm ci:check` — зелёный (exit 0), `test:isolation` 12, `test:security` 24, `test:migrations` 51.
- **Остаток ЭПИКа A:** только **A3.6** — стартовый набор шаблонов при онбординге: нужны готовые бланки от владельца. Приёмка эпика (реальная группа 20+) — за владельцем.

### 5.187 План Фазы 2 «Видео и часы» (ЭПИК B + ФТ-E1/E2)

- **Контекст:** Фаза 1 «Документы» закрыта (PR #330, §5.186) — по дорожной карте ТЗ §13 следующая Фаза 2. По протоколу фаза стартует только после плана в `docs/superpowers/plans/` и апрува владельца, поэтому в этой сессии писался план, а не код.
- **Главное решение плана — вопрос №1 расшит.** ТЗ ставил его блокером старта всей фазы («провайдер Kinescope/VK vs self-hosted MinIO+ffmpeg+HLS»). Разведка показала, что провайдер-специфична ровно одна задача из двенадцати: лимит хранилища, водяной знак, прогресс, антиперемотка, журнал часов, PDF/SCORM, конструктор курса и тесты пишутся одинаково при любом ответе. Поэтому план строится вокруг шва `VideoProvider`, ответ нужен только к Task 10, и **апрув можно давать не отвечая на №1**. Рекомендация по существу — старт с провайдера: самая рискованная часть self-hosted (отдача видео под нагрузкой) откладывается до фазы аренды, где хранилище становится статьёй тарифа (ФТ-D4).
- **Форма шва взята с обкатанного образца:** `WebinarProvider` (миграция `0055`) — per-tenant выбор провайдера, `noop` по умолчанию, реестр реализаций, в БД только несекретная конфигурация. Не изобретаем, копируем форму.
- **Что вскрыла разведка кода (важно для исполнителя):**
  - **Прогресс видео сейчас — фикция.** `use-watch-tracker.ts` тикает по таймеру, пока вкладка видима, то есть открытая вкладка = «пройдено». `MaterialProgress` (`mvp.types.ts:277`) и `PATCH /progress/materials/:materialId` как фундамент годятся, но считать надо по позиции воспроизведения. Это и есть содержательная дыра ФТ-B3, а не «добавить плеер».
  - **SCORM-трекинг в общий прогресс уже есть** (`scorm.service.ts:425–445` вызывает `upsertMaterialProgress` по `cmi lesson_status`) — в трекере ФТ-B4.2 стоял 🟡 по устаревшим данным. Task 9 сначала проверяет, потом закрывает статус, а не пишет второй мост.
  - Плеер — голый `<video controls src>` без HLS, позиции и защиты; multipart-загрузки в S3 в `files.service.ts` нет (видео 2–4 ГБ одним PUT не проходит); счётчиков занятого места per tenant в коде нет вовсе.
  - Флаг `randomizeQuestions` в правилах теста существует (`mvp.types.ts:380`, `mvp.service.ts:5623`) — Task 12 начинается с проверки, перемешивает ли он что-нибудь на самом деле.
- **Архитектурные решения зафиксированы в плане:** видео — отдельная сущность `learning.video_assets` со своим жизненным циклом (а не поля в `materials`); антиперемотка — серверное правило (UI-запрет снимается через DevTools за минуту); ссылки на сегменты короткоживущие и привязаны к зачислению; миграции аддитивные (`0063`, `0064`).
- **Files changed:** новый `docs/superpowers/plans/2026-07-28-tz-faza2-video-i-chasy.md`; обновлены `docs/TZ_ARENDNAYA_SDO_STATUS.md` (Фаза 2 → «план на апруве», вопрос №1 переформулирован как блокер только Task 10, журнал сессий), `README.md` §2.
- **Тесты:** кода нет — прогонов нет. Проверено, что упомянутые в плане файлы, строки и миграции существуют (следующий свободный номер миграции — `0063`).
- **Дальше:** апрув владельца → Task 1 (шов `VideoProvider` + `learning.video_assets`). Параллельно не закрыт хвост Фазы 1: **A3.6** — нужны готовые бланки от владельца.

### 5.188 Фаза 2 «Видео и часы», Task 1 — шов `VideoProvider` и сущность видео-ассета (ФТ-B1.1)

- **Контекст:** план Фазы 2 апрувнут владельцем (§5.187, PR #331). Task 1 — фундамент, от которого не зависит ответ на открытый вопрос №1: все последующие задачи фазы пишутся против этого шва.
- **Шов:** `apps/backend/src/infrastructure/video-provider/video.provider.ts` — интерфейс `VideoProvider` (`createUploadTarget` / `getPlayback` / `parseWebhook` / опциональный `webhookAck`), `NoopVideoProvider` и `FakeVideoProvider`. Форма один в один с `WebinarProvider` (`0055`), включая контракт «`null` = провайдер спит»: тенант без настроенного видеосервиса не должен ронять страницу курса — видео просто не воспроизводится.
- **Выбор провайдера пер тенант:** `VideoProviderResolver` + `VideoProviderSettingsService` + Postgres/in-memory репозитории настроек. Прод-предохранитель перенесён из вебинаров: тенант с сохранённым `fake` в production принудительно опускается до `noop` — схема env этого поймать не может (env не знает, что выбрано у конкретного тенанта), а выдавать фальшивое видео за настоящее недопустимо.
- **Миграция `0063`:** `learning.video_assets` (жизненный цикл `uploading → processing → ready | failed`, `duration_seconds`/`storage_key`/`provider_asset_id` nullable, CHECK на статус, индексы «тенант+материал» и «идентификатор провайдера» для вебхука) + `learning.video_provider_settings` (только несекретная конфигурация) + права `video.read` / `video.write` / `video.configure`.
- **Почему видео — отдельная таблица, а не колонки в `materials`:** у него свой жизненный цикл, размер, длительность и идентификатор у провайдера; вшивать это в материал значит переделывать его таблицу при каждой смене провайдера. Материал получил ссылку `videoAssetId` — ровно как `scormPackageId` в 0052.
- **Deviations от плана:** (1) глобального env-флага (аналога `WEBINARS_ENABLED`) НЕ заводили — у вебинаров он существует потому, что подсистема ехала спящей; здесь достаточно per-tenant `enabled` + `noop` по умолчанию. (2) В `Material` добавлено поле `videoAssetId`, план его явно не называл.
- **Проверка миграции — важно для следующих агентов:** `pnpm test:migrations` **не применяет SQL к базе**, это статический разбор текста миграций (`mvp-domain-migrations.test.ts` читает файлы и проверяет их регулярками). Поэтому `0063` проверена отдельно: все миграции применены по порядку во временную базу `mig_check_0063` на живом Postgres, затем `0063` прогнана повторно — второй прогон завершается кодом 0 с одними NOTICE, дублей прав и `role_permissions` ноль; RBAC подтверждён запросом (у роли `learner` есть `video.read` и нет `video.write`). Временная база удалена.
- **Files changed:** новые `apps/backend/migrations/0063_learning_video_assets.sql`, `infrastructure/video-provider/{video.provider.ts,fake-video.provider.ts,video.provider.test.ts}`, `modules/mvp/video/{video-provider-settings.repository.ts,postgres-...,in-memory-...,video-provider-settings.service.ts,video-provider-resolver.service.ts,video-provider-resolver.service.test.ts}`, `modules/mvp/migrations.0063.test.ts`; изменены `modules/mvp/mvp.module.ts` (реестр + резолвер), `modules/mvp/mvp.types.ts` (`VideoAsset`, `Material.videoAssetId`).
- **Тесты:** 21 новый (контракт `noop`, `fake`, резолвер, миграция), бэкенд суммарно **2166** зелёных; полный `pnpm ci:check` зелёный (**exit 0**), `test:isolation` 12, `test:migrations` 51.
- **Дальше:** Task 2 — загрузка видео методистом (multipart в S3, статусы, AV-гейт, интерфейс в редакторе урока). Ответ на вопрос №1 по-прежнему нужен только к Task 10.

### 5.189 Фаза 2 «Видео и часы», Task 2 — загрузка видео методистом (ФТ-B1.1)

- **Что было:** ассет и шов из Task 1 существовали, но залить в них файл было нечем. Обычный интент files-модуля тут не годится: он подписывает ОДИН PUT, а ТЗ требует 2–4 ГБ — такой файл одним запросом не проходит, и обрыв на середине часовой заливки означал бы «начни сначала».
- **Загрузка по частям:** в `StorageClient`/`S3StorageClient` добавлены `createMultipartUpload` / `createPresignedPartUrl` / `completeMultipartUpload` / `abortMultipartUpload`; в `FilesService` — `createMultipartUploadIntent` и обвязка. Размер части **32 МБ**: S3 требует не меньше 5 МБ (кроме последней) и не больше 10 000 частей — при 32 МБ потолок 312 ГБ, с запасом к требуемым 4 ГБ, а повторная отправка упавшей части остаётся дешёвой. Части сортируются по номеру перед склейкой: клиент шлёт их как получится, S3 требует возрастания.
- **Файл регистрируется в `storage.files`** обычным путём — поэтому **антивирусный гейт (ФТ-G5) достаётся даром**, отдельной ветки для видео нет.
- **Две ветки за одним API:** у тенанта включён провайдер — файл летит прямо к нему (`createUploadTarget`); иначе self-hosted multipart в наш S3. Какая сработала, видно по `uploadKind` в ответе. Это первая практическая выгода от шва Task 1.
- **Отмена — не мелочь:** без `abortMultipartUpload` брошенные части остаются в хранилище и молча занимают место (а при аренде это ещё и деньги, ФТ-B1.3). Поэтому `DELETE /video-assets/:id` сначала отменяет незавершённую загрузку; уже вычищенная хранилищем загрузка не мешает удалить ассет.
- **Идемпотентность:** повторный `complete` при обрыве ответа не ломает уже закрытую загрузку (ассет уже не в `uploading` → возвращаем как есть). После завершения новые ссылки на части не выдаются.
- **Миграция `0064`** — `file_id` и `multipart_upload_id` на `learning.video_assets`, обе nullable (у провайдерской ветки ни файла, ни multipart-загрузки у нас нет). Проверена на живом Postgres: все миграции по порядку во временную базу + повторный прогон `0064` (только NOTICE, exit 0), колонки nullable подтверждены запросом.
- **Deviations:** (1) **`0064` занят загрузкой, Task 6 берёт `0065`** — план резервировал `0064` под `video_progress`. (2) Интерфейс — секция «Видео урока» на `/materials`, а не в редакторе урока: редактора на фронте ещё нет, он будет в Task 11. (3) Проверка «битое видео к уроку не привязывается» вынесена в эндпоинт `attach`, а не в `mvp.service.ts`: его методы синхронные, а проверка требует обращения к БД — тащить туда `await` значило бы переписывать половину сервиса ради одной проверки. (4) Добавлен `POST /video-assets/:id/fail` — до Task 10 иначе нечем воспроизвести статус `failed`.
- **ТРЕБОВАНИЕ К ОКРУЖЕНИЮ (для ops):** в CORS хранилища обязан быть разрешён заголовок `ETag` (`Access-Control-Expose-Headers: ETag`) — браузер собирает из ETag'ов список частей для склейки. Без него загрузка падает с понятным текстом, но работать не будет. MinIO отдаёт ETag по умолчанию; при смене хранилища проверять.
- **Files changed:** новые `modules/mvp/video/{video-assets.repository.ts,postgres-video-assets.repository.ts,in-memory-video-assets.repository.ts,video.service.ts,video.service.test.ts,video.controller.ts}`, `migrations/0064_learning_video_assets_upload.sql`, `modules/mvp/migrations.0064.test.ts`, фронт `features/video-upload/{api.ts,screens.tsx,api.contract.test.ts}`; изменены `infrastructure/storage/{storage.client.ts,s3-storage.client.ts,s3-storage.client.test.ts}`, `modules/files/files.service.ts`, `modules/mvp/mvp.module.ts`, `apps/frontend/app/materials/page.tsx`.
- **Тесты:** +23 бэкенд (сервис загрузки: две ветки, части, идемпотентность повтора, отмена, изоляция тенанта; multipart в S3-клиенте; миграция) и +6 фронт (нарезка на части, сбор ETag, ошибка при отсутствии ETag в CORS, ветка провайдера, отсечение не-видео до запроса). Бэкенд **2189**, фронт **714**; `ci:check` зелёный (**exit 0**), `test:isolation` 12, `test:security` 24.
- **Дальше:** Task 3 — лимит хранилища per tenant (ФТ-B1.3): счётчик занятого места и гейт на создание ассета. Ответ на вопрос №1 по-прежнему нужен только к Task 10.

### 5.190 Фаза 2 «Видео и часы», Task 3 — лимит хранилища per tenant (ФТ-B1.3)

- **Зачем:** это фундамент тарифов аренды (ФТ-D4) — без счётчика «сколько занимает учебный центр» лимит хранилища нечем сделать статьёй тарифа. Плюс практическая защита: методист не должен узнавать о переполнении после часа заливки четырёхгигабайтного ролика.
- **Главная ловушка счётчика — двойной учёт.** Видео в self-hosted-ветке имеет ОДНОВРЕМЕННО строку в `learning.video_assets` и строку в `storage.files` (файл регистрируется ради AV-гейта, Task 2). Наивная сумма двух таблиц завысила бы занятое место ровно вдвое по всем видео. Поэтому из суммы `storage.files` вычитаются файлы, на которые ссылаются ассеты (`not exists ... v.file_id = f.id`). Видео у провайдера (`file_id is null`) в нашем хранилище не лежит, но место у провайдера тоже оплачивается — в счётчик входит. Ассеты в `failed` и файлы с `deleted_at` не считаются.
- **Проверено на живой базе, а не только юнитами:** во временную БД посеяны два тенанта, self-hosted видео с файлом, видео у провайдера, битый ассет, удалённый файл и данные соседнего тенанта. Счётчик дал 3 005 000 000 вместо 4 012 000 000 при наивной сумме; у соседнего тенанта — только его данные.
- **Лимит** живёт в `payload` настроек тенанта (`org.tenant_settings`, ключ `storageLimitBytes`) — миграция не нужна, как с `documentImages` в Фазе 1. Нет ключа, мусор, ноль или отрицательное значение = безлимит: все существующие тенанты продолжают работать как раньше.
- **ОГРАНИЧЕНИЕ, которое нужно знать следующему агенту:** настройки тенанта редактирует сам `tenant_admin` через `PUT /tenant/settings`. Значит, до появления платформенной админки и тарифов (ФТ-D2/D4) лимит — защита от случайного переполнения, а **не коммерческий контроль**: арендатор способен поднять его себе сам. Когда появится владелец значения на стороне платформы, поле переезжает туда.
- **Гейт** стоит в `VideoService.createAsset` (а не в контроллере) и срабатывает ДО создания ассета и до любой заливки; ошибка человекочитаемая — «занято X ГБ из Y ГБ, файлу нужно ещё Z». Отдельный класс `StorageLimitExceededError`, чтобы вызывающий слой сам решал HTTP-код.
- **Освобождение места:** удаление ассета теперь помечает удалённым и файл в `storage.files` — иначе строка файла переживала бы ассет и место оставалось бы занятым навсегда.
- **Фронт:** остаток места виден до выбора файла (`GET /video-assets/storage`), счётчик обновляется после загрузки и удаления. Размеры показываются в ГБ/МБ/КБ, а не байтами.
- **Files changed:** новые `modules/mvp/video/tenant-storage.service.ts` (+тест); изменены `modules/mvp/video/{video.service.ts,video.controller.ts,video.service.test.ts}`, `modules/mvp/mvp.module.ts`, фронт `features/video-upload/{api.ts,screens.tsx,api.contract.test.ts}`.
- **Тесты:** +14 бэкенд (границы лимита, безлимит, мусор в настройках, отсутствие настроек, инварианты SQL, освобождение места) и +2 фронт. Бэкенд **2203**, фронт **716**; `ci:check` зелёный (**exit 0**), `test:isolation` 12, `test:security` 24.
- **Дальше:** Task 4 — защищённое воспроизведение (ФТ-B2.1): короткоживущие ссылки с привязкой к зачислению и плеер на hls.js вместо голого `<video src>`.

### 5.191 Фаза 2 «Видео и часы», Task 4 — защищённое воспроизведение (ФТ-B2.1)

- **Смысл задачи — не «показать видео», а не показать его тем, кому нельзя.** До неё `VideoPlayer` получал `videoUrl={null}` всегда: видео не играло вообще, и никакой проверки прав не существовало.
- **Право на ссылку даёт зачисление.** `VideoPlaybackService` (request-scoped, как `ScormService`) проверяет ту же цепочку, что запуск SCORM: материал → модуль → версия курса → зачисление → связь группы с курсом → совпадение actor'а со слушателем (`assertActorMatchesLearnerIamLink`). Без этого ссылку на платное видео мог бы получить любой пользователь тенанта. Цепочка дублирует `scorm.service.ts` намеренно — у видео свои сообщения, а общий хелпер тянул бы за собой половину request-scoped состояния.
- **Ссылка короткоживущая — 10 минут.** Скопированная ссылка всё равно утечёт; смысл не в том, чтобы «запретить копирование» (невозможно), а в том, чтобы копия протухла раньше, чем её успеют передать. Плеер сам просит новую на 80% срока (но не чаще раза в 30 с), иначе просмотр обрывался бы посреди урока.
- **Честно про «защиту от скачивания»:** `controlsList="nodownload"` и запрет контекстного меню — барьер удобства, а не защита. Браузер по определению может сохранить то, что показывает. Реальная мера против перепродажи — водяной знак с данными слушателя (ФТ-B2.2, Task 5) плюс короткий TTL. Это зафиксировано комментарием в коде, чтобы никто не принял барьер за защиту.
- **Две ветки источника:** провайдер отдаёт свой HLS (`kind: 'hls'`), self-hosted — presigned-ссылку на оригинал (`kind: 'progressive'`). Плеер понимает оба: нативный HLS в Safari, `hls.js` (динамический импорт, ~200 КБ не тянутся на текстовых уроках) везде остальное.
- **ВАЖНОЕ ИЗМЕНЕНИЕ Task 2:** `completeUpload` в self-hosted-ветке теперь ставит `ready`, а не `processing`. Транскодирования пока нет (Task 10), оригинал играется как есть; держать ассет в `processing` значило бы, что залитое видео невозможно посмотреть. Когда появится транскодер, он вернёт `processing` и сам переведёт в `ready`.
- **Состояния видео говорят человеческим языком:** нет привязанного видео → «К уроку не привязано видео»; ещё обрабатывается → «откройте урок чуть позже»; упало → показывается причина (`errorMessage`), а не молчание.
- **Files changed:** новые `modules/mvp/video/{video-playback.service.ts,video-playback.service.test.ts,video-playback.controller.ts}`, фронт `features/course-viewer/{video-playback-api.ts,video-playback-api.test.ts,hls-video-player.tsx}`; изменены `modules/mvp/mvp.module.ts`, `modules/mvp/video/{video.service.ts,video.service.test.ts}`, фронт `features/course-viewer/material-player.tsx`, `apps/frontend/package.json` (+`hls.js`).
- **Тесты:** +12 бэкенд (владелец зачисления получает ссылку; чужой пользователь, зачисление на другой курс, несуществующее зачисление, не-видео материал и чужой тенант — не получают; проверка доступа выполняется ДО обращения к хранилищу; состояния processing/failed/без видео; ветка провайдера и спящий провайдер) и +4 фронт (контракт эндпоинта, POST вместо GET, отказ доходит текстом, расчёт момента обновления ссылки). Бэкенд **2215**, фронт **720**; `ci:check` зелёный (**exit 0**), `test:isolation` 12, `test:security` 24.
- **Ограничение:** тестов на сам React-компонент нет — в проекте нет React Testing Library (см. конвенции CLAUDE.md), покрыты чистые части.
- **Дальше:** Task 5 — динамический водяной знак с ФИО и e-mail слушателя (ФТ-B2.2). Именно он, а не прятание URL, защищает от перепродажи записи.

### 5.192 Фаза 2 «Видео и часы», Task 5 — динамический водяной знак (ФТ-B2.2)

- **Зачем:** в Task 4 прямо зафиксировано, что запретить скачивание нельзя — браузер по определению сохраняет то, что показывает. Работающая мера против массовой перепродажи записи — не прятать файл, а сделать запись **именной**: желающих выложить ролик, на котором весь сеанс висит их фамилия и почта, намного меньше.
- **Что сделано:** полупрозрачная надпись «ФИО · e-mail» поверх видео, меняющая положение раз в 25 секунд (середина рекомендованного ТЗ интервала 20–30 с).
- **Почему знак обязан двигаться:** статичную надпись заклеивают одним прямоугольником при перезаписи экрана. Соседние позиции маршрута разнесены не меньше чем на 30 процентных пунктов — иначе «движение» незаметно и защита фиктивна; это проверяется тестом, а не глазами.
- **Ограничения позиций:** не залезать в нижние 20% (там панель управления плеером — знак перекрывал бы кнопки) и не выходить за правый край (подпись длинная, левая координата ≤55%). Оба инварианта закреплены тестами.
- **Разделение на два файла — ради тестируемости:** расчётная часть (`video-watermark.ts`: подпись и маршрут) отделена от React-обёртки (`video-watermark-overlay.tsx`). React Testing Library в проекте нет (конвенция CLAUDE.md), поэтому без такого разделения поведение знака проверить было бы нечем. Имена различаются намеренно: `video-watermark.ts` и `video-watermark.tsx` рядом не собираются — `allowImportingTsExtensions` выключен.
- **Маршрут фиксированный, а не случайный:** случайные координаты невозможно проверить тестом, а требования к позициям жёсткие. Шесть точек, цикл; расчёт устойчив к отрицательным и дробным шагам.
- **Детали реализации, которые легко забыть:** `pointer-events: none` — иначе надпись перехватывает клики по видео; тень под текстом — иначе белая надпись пропадает на светлых кадрах; знак — элемент DOM внутри плеера, а не CSS-фон `<video>`, поэтому ложится поверх картинки при любом способе воспроизведения.
- **Честная граница:** скрыть знак через инструменты разработчика можно — но это ручная работа на каждом ролике, а защищаемся мы от массовой перепродажи, а не от одного упорного человека. Записано комментарием в коде.
- **Files changed:** новые `features/course-viewer/{video-watermark.ts,video-watermark-overlay.tsx,video-watermark.test.ts}`; изменён `features/course-viewer/hls-video-player.tsx` (обёртка `position: relative` как система координат + подключение знака).
- **Тесты:** +10 фронт (подпись с почтой и без, пустой пользователь, реальное перемещение, минимальное расстояние между соседними точками, запрет нижней зоны и правого края, зацикленность маршрута, интервал в пределах ТЗ). Фронт **730**; `ci:check` зелёный (**exit 0**), `test:isolation` 12.
- **Дальше:** Task 6 — прогресс по реальному воспроизведению и возобновление (ФТ-B3.1/B3.3). Напоминание из плана: **миграция берёт номер `0065`** (`0064` занят загрузкой из Task 2).

### 5.193 Фаза 2 «Видео и часы», Task 6 — прогресс по реальному воспроизведению (ФТ-B3.1/B3.3)

- **Закрыта содержательная дыра фазы.** До этой задачи прогресс считал время на ОТКРЫТОЙ ВКЛАДКЕ (`use-watch-tracker` тикал по таймеру, пока вкладка видима): урок засчитывался тому, кто открыл его и ушёл пить чай. Для нормативного обучения это делало весь учёт фиктивным.
- **Считаем покрытие ролика, а не время.** Клиент раз в 12 секунд шлёт позицию и `video.played` — диапазоны, которые браузер сам отметил как проигранные. Сервер объединяет их с накопленными и считает долю от длительности. **Перемотанное, но не просмотренное, покрытием не становится:** посмотрел минуту и прыгнул в конец десятиминутного ролика → 20%, а не «пройдено».
- **Решение «пройдено» принимает сервер**, клиент только докладывает факты. Порог — 90% по умолчанию (ТЗ B3.1), настраивается на версии курса полем `videoCompletionPercent` в `ProgramMeta` (JSONB-снапшот, миграция не нужна); мусор и выход за 1..100 откатываются к 90%.
- **Зачёт отдаётся существующему `upsertMaterialProgress`** — второй источник правды о «пройдено» развалил бы расчёт модулей и курса. `studiedSeconds` не меньше `minViewSeconds`, иначе полностью просмотренный короткий ролик завис бы «в процессе» (тот же приём, что в SCORM).
- **Без известной длительности зачёта нет.** Видео ещё не обработано → покрытие 0: засчитать курс вслепую значило бы выдать удостоверение ни за что.
- **Устойчивость к сети — отдельно проверенный инвариант.** Повторный и запоздавший heartbeat не откатывают покрытие; `max_position_seconds` обновляется через `greatest(...)` в SQL, потому что на нём будет держаться антиперемотка (Task 7). Мусорные отрезки от клиента (NaN, перевёрнутые, отрицательные, за пределами ролика) отбраковываются математикой слияния и не накручивают покрытие.
- **Возобновление (ФТ-B3.3):** `playback` теперь отдаёт `lastPositionSeconds`, плеер стартует оттуда после `loadedmetadata` (раньше `currentTime` сбрасывается в ноль). Позиция чужого зачисления не подмешивается.
- **Рефактор:** цепочка проверки доступа вынесена из `VideoPlaybackService` в `VideoAccessService` и переиспользована обеими задачами. Держать её в двух местах опасно — разойдутся, и одна из дверей окажется без замка.
- **Миграция `0065`** (`learning.video_progress`, PK по тенанту+зачислению+материалу). Проверена на живой базе: повторный heartbeat не плодит строки, `last_position_seconds` обновляется, `max_position_seconds` НЕ откатывается (было 300 → пришло 10 → осталось 300).
- **Files changed:** новые `modules/mvp/video/{video-progress.util.ts,video-progress.util.test.ts,video-progress.repository.ts,postgres-video-progress.repository.ts,in-memory-video-progress.repository.ts,video-progress.service.ts,video-progress.service.test.ts,video-access.service.ts}`, `migrations/0065_learning_video_progress.sql`, `modules/mvp/migrations.0065.test.ts`, фронт `features/course-viewer/{video-progress-api.ts,video-progress-api.test.ts}`; изменены `modules/mvp/video/{video-playback.service.ts,video-playback.service.test.ts,video-playback.controller.ts}`, `modules/mvp/mvp.module.ts`, `modules/mvp/mvp.types.ts`, фронт `features/course-viewer/{hls-video-player.tsx,video-playback-api.ts}`.
- **Тесты:** +37 бэкенд (17 на математику отрезков — слияние, мусор, обрезка по длительности, отсутствие двойного счёта; 15 на сервис — прыжок в конец не засчитывается, порог курса, повтор и запоздание, короткий ролик; 4 на миграцию; 3 на возобновление) и +4 фронт. Бэкенд **2252**, фронт **734**; `ci:check` зелёный (**exit 0**), `test:isolation` 12, `test:security` 24.
- **Дальше:** Task 7 — антиперемотка per курс (ФТ-B3.2). Опора уже готова: `max_position_seconds` не откатывается назад.

### 5.194 Фаза 2 «Видео и часы», Task 7 — антиперемотка per курс (ФТ-B3.2)

- **Требование:** типовое для нормативных курсов — при первом просмотре нельзя мотать вперёд. Флаг `noSeekOnFirstView` на версии курса, выключен по умолчанию (включение задним числом не ломает идущие группы), персистится JSONB-снапшотом — миграция не нужна.
- **Правило серверное, и это принципиально:** запрет в интерфейсе снимается через инструменты разработчика за минуту. Зачёт даёт сервер, а клиентская блокировка — лишь удобство, чтобы не мотать туда, где всё равно не зачтётся. Отдельный тест бьёт запросом мимо интерфейса: heartbeat с отрезком «в конце ролика» при первом просмотре не засчитывается.
- **Как устроено отсечение.** Опора — устройство `video.played`: непрерывное воспроизведение ПРОДОЛЖАЕТ существующий отрезок (он начинается не позже досмотренного максимума), а перемотка вперёд создаёт НОВЫЙ отрезок далеко впереди. Поэтому достаточно выбросить отрезки, начинающиеся за «максимум + допуск» (`dropSeekedAheadRanges`) — это точнее, чем клипировать по заявленной позиции.
- **Допуск 60 секунд:** интервал heartbeat 12 с плюс запас на несколько потерянных подряд. Честный слушатель с плохой связью не наказывается, а прыжок в конец урока всё равно отсекается. Клиент использует ту же константу, чтобы не откатывать то, что сервер бы зачёл.
- **НАЙДЕН И ИСПРАВЛЕН СОБСТВЕННЫЙ БАГ TASK 6.** Максимум досмотренного считался по ЗАЯВЛЕННОЙ клиентом позиции — и первый же heartbeat с позицией больше допуска обнулял её (покрытие при этом росло, то есть данные противоречили друг другу). Теперь максимум берётся от правого края ЗАЧТЁННЫХ отрезков: они уже прошли антиперемоточный фильтр, поэтому это честная граница. Вскрыл тест на перемотку назад — писать его «на всякий случай» оказалось не зря.
- **Перемотка назад разрешена всегда:** пересматривать непонятое нормативные курсы не запрещают. После того как материал набрал порог, перемотка свободна и вперёд — покрытие не уменьшается, поэтому однажды пройденный урок остаётся свободным навсегда.
- **Попутно закрыт пробел Task 6:** `videoCompletionPercent` не имел ни DTO, ни интерфейса — порог зачёта был недоступен администратору. Теперь оба поля (порог и запрет перемотки) правятся в существующей форме метаданных программы в карточке курса; отдельного экрана `course-authoring` в проекте нет, он появится в Task 11.
- **Files changed:** изменены `modules/mvp/video/{video-progress.util.ts,video-progress.util.test.ts,video-progress.service.ts,video-progress.service.test.ts}`, `modules/mvp/{mvp.types.ts,mvp.dto.ts,mvp.service.ts}`, фронт `features/course-viewer/{hls-video-player.tsx,video-progress-api.ts,video-progress-api.test.ts}`, `features/mvp/{types.ts,payloads.ts,payloads.test.ts,screens.tsx}`.
- **Тесты:** +12 бэкенд (7 на отсечение прыжков — граница допуска, потерянные heartbeat'ы, перемотка назад, нулевой максимум; 5 на сервис — обход запросом мимо интерфейса, выключенный флаг, последовательный просмотр, возврат назад, свобода после зачёта) и +1 фронт. Бэкенд **2264**, фронт **735**; `ci:check` зелёный (**exit 0**), `test:isolation` 12, `test:security` 24.
- **Дальше:** Task 8 — журнал учебной активности и часов (ФТ-B3.4): доказательная база на проверке ГИТ/Минтруда. Данные уже есть — `learning.video_progress` проиндексирован по зачислению именно под этот запрос.

### 5.195 Фаза 2 «Видео и часы», Task 8 — журнал учебной активности и часов (ФТ-B3.4)

- **Зачем:** доказательная база на проверке ГИТ/Минтруда. Инспектор спрашивает не «стоит ли галочка “пройдено”», а «докажите, что 40-часовая программа реально освоена». Галочка доказательством не является — нужно фактическое время против плановых часов программы (`program.academic_hours`, миграция `0030`), по каждому слушателю.
- **Академический час — 45 минут, а не 60.** В плане это не оговаривалось, но иначе отчёт врёт: считать по 60 минут значит занижать выполнение программы примерно на четверть, причём против самого же учебного центра.
- **Видео-время НЕ складывается с временем материалов** — та же ловушка двойного счёта, что с лимитом хранилища в Task 3: видео-урок это тоже материал, и его секунды уже лежат в `material_progress`. Берём максимум из двух источников: покрытие видео точнее (Task 6), но для не-видео материалов существует только `material_progress`.
- **Время тестов** — из попыток: `finishedAt/submittedAt − startedAt`. Незавершённая попытка и битые даты (переставили часы сервера) дают ноль, а не отрицательные значения в отчёте для инспектора.
- **Плановые часы группы** — максимум `academicHours` по версиям курсов группы: план программы это верхняя планка, а не сумма разрозненных курсов.
- **Недобравшие часы идут первыми** (сортировка на сервере) и вынесены отдельным списком на фронте: именно этих слушателей спрашивает инспектор, а не среднее по группе.
- **CSV** в том же формате, что книга выдачи: UTF-8 BOM + `;`. Без BOM Excel в русской локали читает файл как Windows-1251 и ломает кириллицу; точка с запятой внутри ФИО экранируется кавычками (проверено тестом).
- **Files changed:** новые `modules/mvp/video/{learning-hours.util.ts,learning-hours.service.ts,learning-hours.service.test.ts}`, фронт `features/learning-journal/{api.ts,screens.tsx,api.contract.test.ts}`; изменены `modules/mvp/video/video-playback.controller.ts` (эндпоинты JSON и CSV), `modules/mvp/mvp.module.ts`, фронт `features/mvp/screens.tsx` (секция в карточке группы).
- **Тесты:** +19 бэкенд (академический час, отсутствие двойного счёта видео, время тестов, недобор плана, мусорные значения, длительность попыток, изоляция чужой группы и тенанта, формат CSV и экранирование `;` в ФИО) и +4 фронт. Бэкенд **2283**, фронт **739**; `ci:check` зелёный (**exit 0**), `test:isolation` 12, `test:security` 24.
- **Дальше:** Task 9 — прочий контент (ФТ-B4.1/B4.2). Напоминание из плана: **сначала проверить фактическое состояние SCORM** — мост в общий прогресс уже есть (`scorm.service.ts:425–445`), в трекере статус занижен по устаревшим данным; писать второй мост не нужно.

### 5.196 Фаза 2 «Видео и часы», Task 9 — прочий контент: PDF и SCORM (ФТ-B4.1/B4.2)

- **План требовал сначала ПРОВЕРИТЬ SCORM, а не писать код** — и это оправдалось дважды.
- **SCORM (ФТ-B4.2): мост подтверждён, статус в трекере был занижен по устаревшим данным.** Но проверка вскрыла, что тестами покрыта была только половина цепочки: «завершение → `materialProgress`» проверялось с Фазы 9, а дальше — до прогресса МОДУЛЯ и КУРСА — никогда. Именно это и есть «трекинг завершения в общий прогресс» из ТЗ: без подъёма модуля слушатель закрыл бы SCORM-урок, а курс остался бы незавершённым. Написаны три теста, доказывающие сквозной путь: модуль 100%, курс 100%, незавершённый SCORM (`incomplete`) курс не закрывает. Второго моста не писали.
- **PDF (ФТ-B4.1) оказался больше, чем «фиксировать открытие».** `PdfViewer` всегда получал `pdfUrl={null}` — файл не отдавался вообще, ровно как видео до Task 4. Смотреть было нечего, фиксировать нечего.
- **Один запрос делает обе вещи:** отдаёт ссылку на файл и записывает факт открытия. Разделять незачем — «ознакомлен» и есть «открыл», а два запроса дали бы возможность получить ссылку, не отметившись.
- **Правило зачёта документа:** если методист не задал `minViewSeconds` (обычный случай для документа), открытие и есть ознакомление — засчитываем. Если время задано явно, методист хотел именно выдержку по времени: открытие фиксируем, но материал не закрываем, иначе мы бы молча отменили его настройку. Для документа «ознакомлен» не может зависеть от прокрутки до последней страницы — во встроенном вьювере это технически не отследить.
- **`VideoAccessService` обобщён** параметром допустимых типов материала вместо копии цепочки проверок для документов. Ссылку на файл получает только слушатель с зачислением на курс, где материал лежит; видео через документный путь не открывается — у него свой защищённый маршрут (Task 4).
- **Files changed:** новые `modules/mvp/video/{document-material.service.ts,document-material.service.test.ts}`, фронт `features/course-viewer/{document-api.ts,document-api.test.ts}`; изменены `modules/mvp/video/{video-access.service.ts,video-playback.controller.ts}`, `modules/mvp/mvp.module.ts`, `modules/mvp/scorm/scorm.service.test.ts` (+3 теста сквозного пути), фронт `features/course-viewer/{pdf-viewer.tsx,material-player.tsx}`.
- **Тесты:** +9 бэкенд (6 на документы: ссылка и фиксация, зачёт по `minViewSeconds`, материал без файла, видео через чужой путь, отказ доступа не пишет прогресс; 3 на сквозной SCORM) и +2 фронт. Бэкенд **2292**, фронт **741**; `ci:check` зелёный (**exit 0**), `test:isolation` 12, `test:security` 24.
- **Дальше:** Task 10 — транскодирование или адаптер провайдера (ФТ-B1.2). **Это единственная задача фазы, которой нужен ответ на открытый вопрос №1** (провайдер vs self-hosted). Все остальные задачи, включая Tasks 11–12 (ФТ-E1/E2), от него не зависят и могут делаться в любом порядке.

### 5.197 Фаза 2, Task 11 (частично) — правила прохождения курса (ФТ-E1)

- **Что закрыто:** правила прохождения. **Что НЕ закрыто: единый мастер создания курса** — см. «Остаток» ниже. Задача разделена честно, а не «сделана целиком».
- **Правило:** флаг `sequentialModules` на версии курса — материал модуля недоступен, пока не закрыты ОБЯЗАТЕЛЬНЫЕ материалы всех предыдущих модулей. Выключен по умолчанию: включение задним числом не должно запирать идущие группы (тот же принцип, что у антиперемотки в Task 7).
- **Точка вставки выбрана удачно:** проверка живёт в `VideoAccessService`, через который УЖЕ проходят и видео (Task 4), и документы (Task 9). Одна проверка закрывает оба типа материала; заводить её отдельно в каждом сервисе значило бы обречь их разойтись.
- **Необязательные материалы не запирают курс.** Справочную методичку методист добавляет не для того, чтобы ею заблокировать обучение. Клиентское правило (`computeSequentialModuleLocks`) повторяет серверное один в один — расхождение здесь означало бы, что интерфейс обещает доступ, которого нет.
- **Серверная проверка, а не UI-замок:** замок на карточке модуля снимается через инструменты разработчика за минуту. Отдельный тест бьёт запросом мимо интерфейса. Сообщение об отказе называет конкретный модуль — иначе слушатель не поймёт, куда возвращаться.
- **ОСТАТОК TASK 11 (не сделан): единый мастер создания курса** с сохранением черновика между шагами (программа/часы → модули → материалы → тест → правила). Существующие экраны курса, модулей и материалов позволяют собрать курс, но по отдельности. Это самостоятельная UI-работа объёмом с целый под-PR — вынесена как **Task 11b**, отмечена в плане фазы.
- **Files changed:** новый `modules/mvp/video/video-access.service.test.ts`; изменены `modules/mvp/video/video-access.service.ts`, `modules/mvp/{mvp.types.ts,mvp.dto.ts,mvp.service.ts}`, фронт `features/course-viewer/{module-gate.ts,module-gate.test.ts}`, `features/mvp/{types.ts,payloads.ts,payloads.test.ts,screens.tsx}`.
- **Тесты:** +6 бэкенд (обход запросом мимо интерфейса, снятие замка после закрытия модуля, необязательные материалы, выключенное правило, первый модуль, сохранение обычных проверок доступа) и +4 фронт. Бэкенд **2298**, фронт **745**; `ci:check` зелёный (**exit 0**), `test:isolation` 12.
- **Дальше:** Task 12 (ФТ-E2 — рандомизация, автосейв, серверный таймер) и Task 11b (мастер курса) — обе не зависят от вопроса №1. **Task 10 (транскодирование/адаптер провайдера) по-прежнему ждёт решения владельца по вопросу №1.**

### 5.198 Фаза 2, Task 12 — тестирование: рандомизация, таймер, автосейв (ФТ-E2)

- **Рандомизация вопросов была фиктивной.** План велел не дописывать, а сначала проверить, перемешивает ли флаг что-нибудь. Оказалось — почти нет: в ДВУХ местах использовалось `array.sort(() => Math.random() - 0.5)`. Компаратор сортировки обязан быть согласованным (a<b и b<c ⇒ a<c), случайный им не является: результат зависит от внутреннего алгоритма движка и не является равновероятной перестановкой — в V8 элементы массово остаются вблизи исходных позиций. То есть учебные центры включали рандомизацию, а соседние слушатели получали похожий порядок вопросов.
- **Починено Фишером–Йетсом** (`assessment/shuffle.util.ts`, источник случайности инжектируется — иначе тест недоказуем). Равномерность проверяется статистически: 12 000 прогонов, каждый элемент на каждой позиции в пределах ±20% от ожидания, плюс отдельный тест «первый элемент реально уходит с первого места». Тест «состав сохранился» прежнюю реализацию бы пропустил.
- **Серверный таймер срабатывал ЛЕНИВО** — только когда клиент трогал попытку (сохранял ответ или сдавал). Слушатель закрыл вкладку → попытка навсегда `in_progress`: занимает лимит попыток, висит незавершённой в отчётах и мешает закрыть группу. Добавлен `ExpiredAttemptsScanner` + `ExpiredAttemptsSchedulerService` (раз в 5 минут, advisory-лок со своим ключом `528_493`, сбой на одном тенанте не прерывает обход). Раз в 5 минут, а не раз в сутки: висящая попытка блокирует слушателя здесь и сейчас.
- **Сканер не считает оценку** — подсчёт баллов живёт в `MvpService` и зависит от типа вопросов и ручной проверки. Задача сканера снять «висяк»: попытка помечается `expired` с записью в аудит от `system`, дальше её обрабатывает обычный путь. Сканер идемпотентен, терминальные попытки не переписывает, уже проставленное `finishedAt` не сбивает.
- **Автосейв уже работал** (debounce + принудительный флаш при переходе между вопросами) — переписывать не стали.
- **Два предупреждения `react-hooks/exhaustive-deps` починены, и это не косметика.** Добавить недостающие зависимости «как просит линтер» значило бы сбрасывать таймер автосохранения на каждом ререндере — ответы перестали бы сохраняться вовсе, а автосдача по таймеру перезапускалась бы постоянно. `handleSubmit`, мутатор и id попытки вынесены в ref'ы; причина зафиксирована комментарием в коде.
- **Files changed:** новые `modules/mvp/assessment/{shuffle.util.ts,shuffle.util.test.ts,expired-attempts.scanner.service.ts,expired-attempts.scanner.service.test.ts,expired-attempts.scheduler.service.ts}`; изменены `modules/mvp/mvp.service.ts` (обе точки перемешивания), `modules/mvp/mvp.module.ts`, фронт `features/test-player/test-attempt-screen.tsx`.
- **Тесты:** +15 бэкенд (7 на перемешивание, включая статистическую равномерность и устойчивость к сломанному источнику случайности; 8 на сканер: закрытие по истечении, живая попытка, бессрочная, терминальные, чужой тенант, битая дата, идемпотентность, аудит). Бэкенд **2313**, фронт **745**; `ci:check` зелёный (**exit 0**), `test:isolation` 12, `test:security` 24. `next lint` — без предупреждений.
- **Состояние Фазы 2:** сделаны Tasks 1–9, 11 (частично), 12. **Осталось: Task 10 — ждёт решения владельца по вопросу №1 (провайдер vs self-hosted); Task 11b — мастер создания курса.** Приёмка эпика (слушатель на телефоне, журнал часов в карточке группы) — после Task 10.

### 5.199 Фаза 2, Task 10 — адаптер готового видеосервиса (ФТ-B1.2)

- **Открытый вопрос №1 ЗАКРЫТ решением владельца (2026-07-28): «берём готовый видеосервис».** Реализована ветка A плана. Ветка B (ffmpeg→HLS в воркере) не писалась и остаётся возможной без переделок — ради этого шов `VideoProvider` и заводился в Task 1.
- **Выбран Kinescope:** первым назван в ТЗ §4, российский хостинг (важно для 152-ФЗ), снимает самую рискованную часть self-hosted — отдачу видео под нагрузкой. Контракт по документации: база `https://api.kinescope.io/v1`, `Authorization: Bearer <token>`, карточка видео `GET /videos/{id}`, вебхук `media.update.status` с телом `{ event, data: { id, status } }`, готовность — `status: 'done'`.
- **Секреты только из env** (`KINESCOPE_API_TOKEN`, `KINESCOPE_WEBHOOK_SECRET`, `KINESCOPE_API_URL`); в `learning.video_provider_settings` по-прежнему лежит только несекретная конфигурация — правило шва из Task 1. Нет токена → адаптер спит, резолвер отдаёт `noop`, сеть не трогается вовсе.
- **Без секрета вебхука события не принимаются ВООБЩЕ.** Принимать неподписанные вебхуки значит позволить кому угодно объявить чужое видео готовым и открыть слушателям необработанный ролик. Подпись — HMAC-SHA256 по сырому телу, сравнение постоянное по времени; подмена тела при верной подписи старого тела отвергается (есть тест).
- **Тенант берётся ИЗ НАЙДЕННОГО АССЕТА** по `provider_asset_id` (индекс заведён ещё в `0063`), а не из тела вебхука — иначе это прямая дыра в изоляции. Единственный метод репозитория без `tenantId` в сигнатуре, и это отмечено комментарием.
- **Гейт изоляции сработал как задумано:** он поймал новый публичный контроллер и уронил `ci:check`. Контроллер внесён в `PUBLIC_CONTROLLERS` с обоснованием — рядом с вебхуками платежей и вебинаров.
- **Вебхук отвечает 200 даже на отвергнутый payload:** провайдер при ошибке ретраит бесконечно, а отличить «подпись не сошлась» от «наша база лежит» он всё равно не может. Наша задача — не применить чужое событие, а не наказать отправителя. Повторная доставка не переписывает уже терминальный ассет.
- **ВАЖНОЕ ДЛЯ ВНЕДРЕНИЯ: чтение ответов API намеренно терпимо к именам полей.** Точные имена (`hls_link` / `play_link` / …, `duration` / `length`) могут отличаться между версиями и тарифами, поэтому значения ищутся среди нескольких кандидатов, а неопознанный ответ даёт `null`, а не мусор в плеере. Списки кандидатов — константы `PLAYBACK_URL_FIELDS` / `DURATION_FIELDS` в начале адаптера: **это единственное место, которое нужно поправить после проверки на живом аккаунте.** Живого прогона против реального Kinescope не было — нет учётной записи.
- **Files changed:** новые `infrastructure/video-provider/{kinescope-video.provider.ts,kinescope-video.provider.test.ts}`, `modules/mvp/video/{video-webhook.controller.ts,video-webhook.controller.test.ts}`; изменены `env.schema.ts` (три переменные), `modules/mvp/video/{video-assets.repository.ts,postgres-video-assets.repository.ts,in-memory-video-assets.repository.ts,video-provider-resolver.service.ts}`, `modules/mvp/mvp.module.ts`, `common/guards/controllers-tenant-scope.isolation.test.ts` (белый список).
- **Тесты:** +25 бэкенд (18 на адаптер: спящий режим без токена, Bearer, недоступная сеть, ошибка API, обёртка `data`, отсутствие ссылки, цель загрузки с `external_id`, подписанная готовность и ошибка, отсутствие подписи, подделка подписи, подмена тела, отсутствие секрета, промежуточный статус, чужое событие, мусор; 7 на вебхук-контроллер: применение события, тенант из ассета, неподписанное событие, повторная доставка, ошибка с причиной, неизвестное видео). Бэкенд **2337**, фронт **745**; `ci:check` зелёный (**exit 0**), `test:isolation` 12, `test:security` 24.
- **Состояние Фазы 2:** сделаны Tasks 1–10, 11 (частично), 12. **Осталось: Task 11b — единый мастер создания курса.** Приёмка эпика (ТЗ §4) требует живого аккаунта провайдера: подтвердить имена полей API, настроить вебхук и прогнать слушателя на телефоне.

### 5.200 Фаза 2, Task 11b — единый мастер создания курса (ФТ-E1). ФАЗА 2 ЗАВЕРШЕНА ПО КОДУ

- **«Мастер» существовал только на картинке.** Экран `CourseCreateScreen` рисовал степпер из трёх шагов, но все поля лежали на ОДНОЙ форме, а создавалась ТОЛЬКО карточка курса (код, название, описание, направление). Программу, часы, модули, материалы и правила прохождения методист добивал по разным экранам — то есть требование ФТ-E1 «единый мастер» не выполнялось, была его имитация.
- **Сделан настоящий мастер из пяти шагов:** карточка → программа и часы → модули и материалы → правила прохождения → проверка и создание. Курс собирается за один проход.
- **Черновик переживает закрытую вкладку.** Собрать курс за один присест методист не успевает: часы надо посмотреть в программе, список модулей — согласовать. Черновик пишется в `localStorage` на каждое изменение и **чистится ТОЛЬКО после успешного создания** — сбой на середине не должен стирать работу.
- **Вся логика — чистые функции** (`wizard-state.ts`: шаги, проверки, план создания; `draft-storage.ts`: разбор и хранение черновика), React-обёртка тонкая. React Testing Library в проекте нет (конвенция CLAUDE.md), и без такого разделения поведение мастера было бы непроверяемым вовсе.
- **Проверки — только по текущему шагу:** заставлять заполнить часы, чтобы ввести название курса, значит превратить мастер в анкету. Назад по степперу вернуться можно всегда, вперёд перепрыгнуть — нет: непроверенный шаг дал бы наполовину заполненный курс.
- **Содержательная проверка на шаге «Правила»:** строгий порядок модулей без единого обязательного материала запрещён — такой курс не открылся бы дальше первого модуля (пройти нечего). Это ровно та ловушка, которую серверное правило из Task 11 поймало бы уже у слушателя.
- **Порядок модулей и материалов мастер НЕ пересортировывает** — он взят из черновика, и от него зависит строгий порядок прохождения (ФТ-E1). Проверено тестом плана создания.
- **Порядок вызовов API вынесен в план и покрыт тестом:** курс → версия → метаданные программы в версию → модули в версию → материалы в свои модули. Перепутанный порядок дал бы наполовину созданный курс, который пришлось бы доделывать руками.
- **Границы объёма (осознанные):** наполнение теста вопросами в мастер не входит — оно требует банков вопросов и живёт на странице курса; в мастере выбирается только форма итоговой аттестации. Прикрепление файлов и видео к материалам — тоже после создания, на «Учебном контенте» (загрузка видео сделана в Task 2).
- **Попутно:** починены три ошибки `next lint` в новом коде — запрещённое имя переменной `module` (конфликт с модульной системой Next) и кликабельный `<li>` без клавиатурной доступности (заменён на `<button>` с `aria-current`).
- **Files changed:** новые `features/course-wizard/{wizard-state.ts,wizard-state.test.ts,draft-storage.ts,draft-storage.test.ts,screens.tsx}`; изменён `app/courses/new/page.tsx` (мастер вместо прежнего экрана).
- **Тесты:** +29 фронт (17 на логику мастера: проверки по шагам, навигация вперёд/назад, прыжки по степперу, ловушка со строгим порядком, план создания и порядок сортировки; 12 на черновик: битый JSON, чужая форма данных, приведение типов материалов, сбой хранилища в приватном режиме, версионированный ключ). Фронт **774**, бэкенд **2337**; `ci:check` зелёный (**exit 0**), `test:isolation` 12, `next lint` без предупреждений.
- **СОСТОЯНИЕ ФАЗЫ 2: все 12 задач плана выполнены** (Tasks 1–10, 11 + 11b, 12). **Осталась только приёмка эпика на живом аккаунте видеосервиса** (ТЗ §4): подтвердить имена полей API Kinescope, задать `KINESCOPE_API_TOKEN` и `KINESCOPE_WEBHOOK_SECRET`, зарегистрировать вебхук и прогнать слушателя на телефоне. **Дальше по дорожной карте — Фаза 3 «Идентификация» (ЭПИК C + ФТ-E3); её блокер — открытый вопрос №4 (СМС-код на экзамен и провайдер).**

### 5.201 План Фазы 3 «Идентификация» (ЭПИК C + ФТ-E3)

- **Контекст:** Фаза 2 «Видео и часы» закрыта по коду — все 12 задач (§5.188–§5.200), осталась только приёмка на живом аккаунте видеосервиса. По дорожной карте ТЗ §13 следующая — Фаза 3. Фаза стартует только после плана и апрува владельца, поэтому здесь план, а не код.
- **Вопрос №4 расшит — блокирует только Task 5.** СМС-код на экзамен касается ОДНОЙ задачи из десяти: сам одноразовый токен и гейт уже работают и доставляются по email (§5.171), СМС — это второй ТРАНСПОРТ того же токена. **Рекомендация: в MVP СМС не нужен** — уровень 3 закрывается кодом по email плюс прокторингом, а СМС добавляет договор с оператором и ежемесячный счёт ради необязательного канала. Разумнее сделать шов `SmsProvider` со спящим `noop` (как `VideoProvider`), а оператора подключить в Фазе 4 вместе с биллингом, когда станет ясно, кто платит за сообщения.
- **Главный вывод разведки: кирпичи есть, политики нет.** Три гейта уже стоят в правильной точке перед стартом итогового теста (`mvp.service.ts:3377–3381`) — одноразовый код (`0044`), селфи+паспорт (`0050`), прокторинг (`0051`). Но включаются они **флагами на связке группа-курс**, а не уровнем политики тенанта. Значит ФТ-C1 — это собрать их в настраиваемую политику 0–3 и переключить источник решения, а НЕ писать идентификацию заново. Соответственно план начинается с политики (Task 1) и переключения гейтов (Task 2).
- **Что ещё вскрыла разведка:**
  - **Согласие одно на всё** — в `IdentityVerification` единственный `consentAt` (`mvp.types.ts:494`). ФТ-C3.2 требует РАЗДЕЛИТЬ согласие на обработку ПДн и отдельное согласие на фото: зона, граничащая с биометрией, и отзыв одного не должен отзывать другое. При миграции старых записей согласие на фото засчитывается ТОЛЬКО при наличии загруженного фото — иначе мы задним числом «получили» согласие, которого не было.
  - **esign legal-log существует** (`esign.service.ts:748`) — ПЭП-уровень расширяет типы событий, а не заводит второй журнал: второй источник правды о подписанных действиях сделал бы «личное дело» недоказуемым.
  - **Выгрузка в реестр собирается без проверки СНИЛС** — валидация контрольной суммы есть, но pre-export проверки полноты нет; это прямой пункт критерия приёмки эпика.
  - **Очередь модерации и экран слушателя уже есть** — Task 4 доводит UX (повторная подача после отклонения), а не строит с нуля.
- **Архитектурные решения зафиксированы в плане:** политика — данные, а не код; уровень 0 нельзя выключить (галочка, снимающая базовую защиту, опаснее её отсутствия); гейты переключаются, а не переписываются; личное дело собирается из существующих источников без своей таблицы (копия доказательств разошлась бы с оригиналом); миграции аддитивные, следующий свободный номер — `0066`.
- **Files changed:** новый `docs/superpowers/plans/2026-07-28-tz-faza3-identifikaciya.md`; обновлены `docs/TZ_ARENDNAYA_SDO_STATUS.md` (Фаза 3 → «план на апруве», вопрос №4 переформулирован как блокер только Task 5, журнал сессий), `README.md` §2.
- **Тесты:** кода нет — прогонов нет. Проверено, что упомянутые в плане файлы, строки и номера миграций существуют (следующий свободный — `0066`), и что все требования ЭПИКа C (C1, C1.1–C1.3, C2, C3.1, C3.2, C4.1) и ФТ-E3 покрыты задачами.
- **Дальше:** апрув владельца → Task 1 (политика идентификации, миграция `0066`). Параллельно не закрыты: приёмка Фазы 2 на живом аккаунте видеосервиса и хвост Фазы 1 — **A3.6** (готовые бланки от владельца).

### 5.202 Фаза 3 «Идентификация», Task 1 — политика идентификации (ФТ-C1)

- **Что было:** три гейта перед итоговым тестом уже стоят в правильной точке (одноразовый код `0044`, селфи+паспорт `0050`, прокторинг `0051`), но включаются **флагами на связке группа-курс**. Учебный центр не может сказать «у нас везде уровень 2» — приходится проставлять галочки на каждой группе, и любая забытая группа это дыра в требовании ТЗ.
- **Что сделано:** политика стала ДАННЫМИ. Запись хранит уровень 0–3 и область действия — тенант, направление или курс. Миграция `0066` + чистая функция вычисления + сервис + эндпоинты под правом `identity.configure`. Гейты переключатся на неё в Task 2.
- **Побеждает самая узкая запись — это НЕ максимум уровней.** Если центр держит уровень 2, а на ознакомительном курсе поставил 0, применяется 0: иначе настройка курса не имела бы смысла. Источник решения возвращается наружу (`source`), чтобы админ понимал, какую запись править.
- **Мусорный уровень опускается до 0, а НЕ поднимается до 3.** Поднять значило бы молча запретить экзамен всей группе из-за опечатки в данных; опустить — вернуться к базовому логину, что видно и исправимо. Уровень 0 при этом не «ничего не требуется», а логин с паролем: функция никогда не возвращает пустоту.
- **Уникальность через `coalesce(scope_id, '')`** — тонкость, на которой легко обжечься: в SQL `NULL <> NULL`, поэтому обычный UNIQUE пропустил бы ДВЕ тенантские политики (у обеих `scope_id IS NULL`), и уровень допуска к экзамену выбирался бы «как повезёт».
- **CHECK на согласованность области:** у `scope='tenant'` объект обязан быть пустым, у направления и курса — заполненным. «Политика курса без курса» — настройка-призрак, которая никогда не применится, но выглядит как настроенная.
- **Право `identity.configure` — только администрации центра** (`platform_admin`/`tenant_admin`), не методисту: ослабление политики означает допуск к экзамену без подтверждения личности. Проверяется тестом миграции, а не только глазами.
- **Живая проверка (не только статический гейт):** все 66 миграций применены по порядку во временную базу, затем `0066` прогнана повторно (только NOTICE, exit 0); запросами подтверждено, что дубль области, курс без объекта и уровень 9 отвергаются.
- **Files changed:** новые `migrations/0066_learning_identity_policy.sql`, `modules/mvp/identity/{identity-policy.ts,identity-policy.test.ts,identity-policy.repository.ts,postgres-identity-policy.repository.ts,in-memory-identity-policy.repository.ts,identity-policy.service.ts,identity-policy.service.test.ts,identity-policy.controller.ts}`, `modules/mvp/migrations.0066.test.ts`; изменён `modules/mvp/mvp.module.ts`.
- **Тесты:** +31 бэкенд (14 на чистое вычисление: приоритет областей, ослабление курсом, мусорные уровни, накопительность требований по уровням; 11 на сервис: обновление вместо дубля, настройка-призрак, изоляция тенанта, возврат к уровню тенанта после удаления; 6 на миграцию). Бэкенд **2368**; `ci:check` зелёный (**exit 0**), `test:isolation` 12, `test:security` 24.
- **Дальше:** Task 2 — гейты читают политику вместо флагов группы-курса. Флаги при этом НЕ удаляются: они остаются ужесточением, иначе включение политики ослабило бы уже настроенные идущие группы.

### 5.203 Фаза 3, Task 2 — гейты читают политику идентификации (ФТ-C1)

- **Что сделано:** требование подтверждения личности теперь включается уровнем политики (Task 1), а не только галочкой на связке группа-курс. Уровень 2 → нужна подтверждённая личность документом; уровень 3 → плюс одноразовый код на экзамен. Центр задаёт уровень один раз, забытая группа больше не является дырой в требовании.
- **Включается «ЛИБО политикой, ЛИБО флагом» — это не замена.** Флаги остались с прежних фаз на уже идущих группах: включение политики не должно их ослаблять, а выключение политики — открывать то, что центр явно ужесточил на конкретной группе. Отдельный тест: политика уровня 0 не открывает экзамен, закрытый флагом.
- **Политика разрешается в контроллере и передаётся внутрь.** `startAttempt` синхронный, а политика лежит в отдельной таблице (`0066`); делать метод async значило бы тронуть все его вызовы ради одного чтения. Если политика не передана — работают только прежние флаги, то есть обратная совместимость для внутренних вызовов и старых тестов сохранена.
- **Промежуточные тесты модулей идентификацией не гейтятся** даже на уровне 3 — иначе учёба встала бы на первом же модульном тесте. Поведение прежнее, но теперь закреплено тестом.
- **Прокторинг намеренно не трогали:** по ТЗ он остаётся выборочным «для выбранных экзаменов», а не включается уровнем политики.
- **НЕ СДЕЛАНО в этой задаче: `require_photo_before_exam` пока не применяется гейтом.** Флаг хранится и возвращается политикой, но «фото непосредственно перед экзаменом» требует захвата снимка на конкретную попытку — такого потока в системе нет. Придумывать семантику «свежести» из головы хуже, чем честно отложить: применение переезжает в **Task 4**, где делается UX подачи фото. Отмечено в плане фазы и в PR.
- **Грабля из CLAUDE.md подтвердилась:** `mvp.domains.http.integration.test.ts` поднимает `MvpController` собственным модулем и упал на новой зависимости (`Nest can't resolve dependencies ... IdentityPolicyService at index [4]`). Ровно тот класс отказа, который когда-то ронял весь пул воркеров vitest. Провайдер добавлен в тестовый модуль (через динамический импорт — файл грузит модули именно так).
- **Files changed:** изменены `modules/mvp/mvp.service.ts` (оба гейта + сигнатура `startAttempt`), `modules/mvp/mvp.controller.ts` (разрешение политики перед стартом), `modules/mvp/identity-verification.service.test.ts` (+7 тестов), `modules/mvp/mvp.domains.http.integration.test.ts` (провайдер в тестовом модуле).
- **Тесты:** +7 бэкенд (обход запросом мимо интерфейса на уровне 2; уровень 3 закрывает экзамен; уровни 0 и 1 не закрывают; флаг группы остаётся ужесточением при политике 0; обратная совместимость без политики; промежуточный тест модуля не гейтится). Бэкенд **2375**; `ci:check` зелёный (**exit 0**), `test:isolation` 12, `test:security` 24.
- **Дальше:** Task 3 — ПЭП: соглашение об электронном взаимодействии и подписанные действия (расширяет существующий esign legal-log, второго журнала не заводим).

### 5.204 Фаза 3, Task 3 — ПЭП: соглашение и подписанные действия (ФТ-C1.1)

- **НАХОДКА, критичная для Task 9 («личное дело»): юридический журнал не персистится.** Таблица `esign.legal_log_entries` существует с миграции `0004` и защищена триггером от изменений (append-only), но `EsignService` пишет записи **только в память** (`InMemoryEsignState.legalLogEntries`) — в базу не попадает ничего. Журнал, на котором держится юридическая значимость, не переживает перезапуск приложения. Проверено: в коде нет ни одного `insert into esign.legal_log_entries`.
- **Что сделано с этим:** ПЭП-события пишутся НАПРЯМУЮ в существующую таблицу через `LegalLogWriter` — второго журнала не заводим, как требует план. **Приведение остальных событий `EsignService` к durable-записи в Task 3 не входило и НЕ сделано** — это отдельная задача, без неё «личное дело» (Task 9) покажет только ПЭП-события.
- **Доказательство складывается из трёх частей:** ЧТО подписано (хэш текста), КТО и КОГДА, ОТКУДА (IP и user-agent). Хэш текста, а не ссылка на «соглашение тенанта»: текст редактируется, и через год он будет другим — ссылка не доказывала бы ничего.
- **Новая версия создаётся только при реальном изменении текста.** Хэш считается по нормализованному тексту (CRLF→LF, хвостовые пробелы, крайние пустые строки). Без этого копирование текста из Word породило бы «новую версию» и заставило ВСЕХ слушателей принимать соглашение заново при неизменном содержании.
- **Повторное принятие идемпотентно и не сдвигает момент подписи** — юридически значим первый момент. В Postgres это `on conflict do update set user_id = excluded.user_id` (фактически no-op); на живой базе проверено, что дубль отвергается уникальностью.
- **`signAction` возвращает `false`, а не бросает,** если соглашение не принято: молча «подписать» без принятого соглашения — подделка доказательства, но решение блокировать действие принадлежит вызывающему коду, а не журналу.
- **Живая проверка на Postgres:** все 67 миграций по порядку + повтор `0067` (идемпотентна); дубль принятия отвергнут уникальностью; запись в `esign.legal_log_entries` проходит, а **UPDATE по ней отвергается триггером** `append-only` — то есть ПЭП-доказательства ложатся в неизменяемую таблицу.
- **НЕ СДЕЛАНО: экран принятия при первом входе.** Клиент API (`features/esignature/api.ts`) и контрактные тесты готовы, но вклинивание экрана в поток входа трогает оболочку приложения — переносится в **Task 4** вместе с UX идентификации. Отмечено в плане фазы и PR.
- **Files changed:** новые `migrations/0067_learning_simple_signature.sql`, `modules/mvp/esignature/{simple-signature.ts,simple-signature.test.ts,simple-signature.repository.ts,postgres-simple-signature.repository.ts,in-memory-simple-signature.repository.ts,legal-log.writer.ts,simple-signature.service.ts,simple-signature.service.test.ts,simple-signature.controller.ts}`, `modules/mvp/migrations.0067.test.ts`, фронт `features/esignature/{api.ts,api.contract.test.ts}`; изменён `modules/mvp/mvp.module.ts`.
- **Тесты:** +28 бэкенд (10 на хэш и необходимость повторного принятия, включая CRLF из Word; 13 на сервис: версионирование, идемпотентность, устаревшее принятие, изоляция пользователей и тенантов, отказ подписи без соглашения; 5 на миграцию) и +4 фронт. Бэкенд **2403**, фронт **778**; `ci:check` зелёный (**exit 0**), `test:isolation` 12, `test:security` 24.
- **Дальше:** Task 4 — уровень 2: доведение UX модерации и повторной подачи. Туда же переезжают экран принятия соглашения и применение `require_photo_before_exam` (отложено из Task 2).

### 5.205 Фаза 3, Task 4 — UX идентификации + два отложенных пункта (ФТ-C1.2)

**Ветка:** `feat/2026-07-28-tz-faza3-task4-identity-ux`. **План:** [docs/superpowers/plans/2026-07-28-tz-faza3-identifikaciya.md](docs/superpowers/plans/2026-07-28-tz-faza3-identifikaciya.md) Task 4.

**Разведка снова сократила объём.** Планировалось «сделать повторную подачу после отклонения» — оказалось, она уже работает: `startIdentityVerification` блокируется только на `approved` и `pending`, а отклонённая запись новой подаче не мешает и сохраняется целиком вместе с причиной отклонения (экран слушателя её уже показывал). Поэтому вместо переписывания — **закрепление поведения тестами** плюс закрытие настоящих дыр.

**Что сделано:**

1. **7 тестов на жизненный цикл заявки** (`identity-verification.service.test.ts`, helper `submitForReview`): повторная подача после отклонения разрешена; отклонённая запись сохраняется как доказательство; подтверждённая не переоткрывается; `pending` блокирует вторую подачу; ЕСИА-подтверждение НЕ проходит требование фото; подтверждение с фото проходит; без флага фото ЕСИА достаточно.
2. **Срок ожидания в очереди модератора** (`format.ts` + колонка «Ждёт» в `screens.tsx`): показываем не дату подачи, а сколько заявка висит; старше суток — маркер ⚠. Заявка, висящая три дня, — это заблокированный экзамен, а дата требует счёта в уме. Расхождение часов сервера и клиента даёт «только что», а не «-3 мин»: отрицательный срок читается как битые данные.
3. **Экран принятия соглашения ПЭП** (перенос из Task 3): `agreement-gate.tsx` + врезка в `ProtectedPage`. Гейт стоит **внутри** `AppShell` — навигация и выход остаются доступны, запертый без выхода пользователь хуже непринятого соглашения. Пока статус не загружен или запрос упал, контент НЕ прячем: блокировать работу из-за сбоя проверки хуже, чем пропустить.
4. **`require_photo_before_exam`** (перенос из Task 2): гейт в `assertIdentityVerificationGate` требует подтверждения именно методом `selfie_passport`; ЕСИА не проходит. Ошибка `412 identity_photo_required`.

**Deviations / открытый вопрос.** Пункт 4 реализован **частично**: ТЗ требует фото «непосредственно перед экзаменом», но не определяет «непосредственно» — минуты, часы, дни? Захват снимка на конкретную попытку и правило свежести требуют решения владельца; вынесено как **открытый вопрос №8** в [docs/TZ_ARENDNAYA_SDO_STATUS.md](docs/TZ_ARENDNAYA_SDO_STATUS.md). Реализована проверяемая часть — «подтверждение обязано быть с фото».

**Тесты:** бэкенд **2410** (295 файлов), фронт **785** (125 файлов), worker 30, контракты 7 — все зелёные; `test:isolation` и `test:security` зелёные. Миграций нет — изменения только в коде и тестах. **Замечание по окружению:** первый прогон `ci:check` упал на `@trudskill/frontend#build` с кодом **137** — это OOM-kill на шаге «Checking validity of types», а не дефект кода: на машине 16 ГБ и почти вся память была занята параллельными сессиями. Пересобрано отдельно с `--max-old-space-size=3072` — зелено. Если повторится, собирать фронт отдельным шагом, а не в общем турбо-прогоне.

### 5.206 Фаза 3, Task 5 — шов `SmsProvider` и второй канал доставки (ФТ-C1.3 / ФТ-F2)

**Ветка:** `feat/2026-07-29-tz-faza3-task5-sms-seam`. **План:** [docs/superpowers/plans/2026-07-28-tz-faza3-identifikaciya.md](docs/superpowers/plans/2026-07-28-tz-faza3-identifikaciya.md) Task 5. **Ветка A** (шов + `noop`), как рекомендовал план.

**Разведка переформулировала задачу.** «СМС-кода на экзамен» в системе НЕТ и не было: одноразовый доступ — это ссылка `/exam-auth/<32-байтный токен>` (`assessment.pre_exam_tokens`, миграция 0044), доставляемая письмом. Поэтому вторым каналом уходит ТА ЖЕ ссылка, а не выдуманный цифровой код: второй тип секрета — это вторая поверхность атаки на ровном месте.

**Вторая находка — отправлять было некуда.** Колонка `learning.learners.phone` существует с миграции 0002, но в доменном типе `Learner`, в DTO обновления и в `learnerRecipient` телефона не было вовсе. Добавлено минимально: поле в типе (JSONB-снапшот, правило 0016 — миграция не нужна), в `createLearnerExtended`/`updateLearnerExtended`, в DTO и в получателя рассылки.

**Что сделано:**

1. `apps/backend/src/infrastructure/sms-provider/`: `sms.provider.ts` (интерфейс `SmsProvider.send`, `SMS_PROVIDER_REGISTRY`, `NoopSmsProvider`, правило «`null` = провайдер спит, никогда не бросать»), `fake-sms.provider.ts` (складывает в память, идентификаторы помечены `fake-sms:`), `phone.util.ts` (нормализация к E.164).
2. `apps/backend/src/modules/communication/sms/`: репозиторий настроек (postgres + in-memory), `SmsProviderSettingsService` (дефолт — `noop`, выключено), `SmsChannelService` (резолв провайдера по тенанту + прод-предохранитель на `fake` + fail-soft отправка).
3. Миграция **0068** `communication.sms_provider_settings` (tenant_id PK, provider_code default `noop`, sender_name, enabled default false) + право `sms.configure` только для `platform_admin`/`tenant_admin`. **Проверено вживую:** вся цепочка 0001→0068 накатывается на чистую БД, повторный накат безопасен, структура и выдача прав подтверждены запросом.
4. Врезка второго канала в `ExamIdentityEmailListener` — токен, гейт и БД токенов не тронуты, меняется только транспорт.
5. Регистрация в `CommunicationModule` **фабриками** (урок вебинарного шва: примитивный параметр конструктора ломает Nest в собранном коде).

**Deviations:** (1) СМС в коде идёт перед письмом — не приоритет, а защита: падение email-диспетчера не должно отменять уже отправленную СМС, каналы независимы. (2) `normalizePhone` считает 10 цифр российским номером — допущение, оправданное тем, что тенанты российские; «+8…» в «+7…» НЕ переписывается. (3) Слушатель без email не получает ни письма, ни СМС — весь контакт разрешается через `learnerRecipient`, требующий email; так было и раньше, менять контракт получателя — отдельная задача. (4) Эндпойнта настройки нет: право заведено, UI отдельно — ровно как с `video.configure` (0063). (5) Адаптера реального оператора нет; `fake` в production принудительно опускается до `noop`.

**Открытый вопрос №4 больше не блокирует фазу:** весь код написан против шва, ответ владельца нужен только для выбора адаптера конкретного оператора (Фаза 4 вместе с биллингом).

**Тесты:** +10 (шов и нормализация номера), +9 (`SmsChannelService`), +4 (слушатель: второй канал доставляет ту же ссылку; выключенный канал не влияет на email; сломавшийся оператор не мешает письму; нет телефона — только письмо), +6 (миграция 0068), +3 (телефон в получателе).

### 5.207 Фаза 3, Task 6 — раздельные согласия на ПДн и на фото (ФТ-C3.2)

**Ветка:** `worktree-faza3-task6-soglasiya`. **План:** [docs/superpowers/plans/2026-07-28-tz-faza3-identifikaciya.md](docs/superpowers/plans/2026-07-28-tz-faza3-identifikaciya.md) Task 6.

**Что было:** единственный `consent_at` в `learning.identity_verifications` (0050) — одна галочка «согласен на всё». Отозвать согласие на фото, не отзывая согласия на обработку данных, было невозможно, хотя это разные по смыслу и последствиям вещи: фото лица — зона, граничащая с биометрией.

**Форма скопирована с ПЭП-контура `0067`:** версионируемый текст + факт с хэшем ИМЕННО ТОГО текста, который человек видел на экране. Ссылка на «согласие тенанта» через год не доказывает ничего — текст редактируется.

**Что сделано:**

1. Миграция **0069**: `learning.consent_documents` (tenant+kind+version, body_hash) и `learning.consent_facts` (learner_id, kind, granted_at, **revoked_at**, ip/user-agent) + право `consent.configure` только администрации. Перенос существующих согласий: `consent_at` → согласие на ПДн; согласие на фото — **только там, где `selfie_file_id` не пуст**, иначе мы задним числом «получили» согласие, которого человек не давал. У перенесённых фактов версия и хэш пустые: приписывать им текст значило бы сфабриковать доказательство.
2. `apps/backend/src/modules/mvp/consents/`: чистое `resolveConsentState`, репозиторий (postgres + in-memory), `ConsentService` (выдача/отзыв/статус, запись в юридический журнал ПЭП), `ConsentController` на `/consents` (тексты, своё согласие, состояние по слушателю под `identity.read`).
3. Гейт согласия на фото врезан в `createIdentityVerificationUploadIntent` и `submitIdentityVerification`; в записи появился снимок `photoConsentAt`.
4. Фронт: `features/consents/` (api + хуки) и ДВЕ галочки вместо одной на экране слушателя — с текстами центра и явным объяснением, что даёт отказ от фото; в карточке модератора — отдельная строка «Согласие на фото».

**Deviations:** (1) **Ключ факта — слушатель, а не пользователь** (в `0067` наоборот): контур идентификации весь построен вокруг `learnerId`, и у слушателя может не быть учётной записи; перенос старых согласий становится прямым. (2) **`consentAt` не заменён, а дополнен `photoConsentAt`** — его читают экран модератора, ЕСИА-ветка и выгрузки; ломать его ради симметрии значило бы чинить полсистемы в задаче про согласия. (3) **Правка текста НЕ снимает данное согласие**, а поднимает `renewalRecommended`: иначе исправленная опечатка мгновенно отозвала бы согласия у всех слушателей центра. (4) **Согласие на фото закрывает весь путь «селфи + паспорт»**, а не только загрузку селфи: интент загрузки не различает файлы, а без согласия уровень 2 недоступен целиком. (5) **Проверка передаётся функцией-гейтом, а не зависимостью конструктора** `MvpService` (он создаётся вручную в 75 тестовых файлах) — тот же приём, что с `EffectiveIdentityPolicy` в Task 1; гейт стоит ПОСЛЕ проверки владения записью, иначе по коду ошибки можно было бы прощупывать чужие заявки. (6) **Экрана редактирования текстов нет** — есть эндпойнт и право, как с `video.configure` (0063) и `sms.configure` (0068).

**Найденная тестом ошибка:** «последним» согласием при сортировке только по `granted_at` мог оказаться ОТОЗВАННЫЙ факт — отзыв и повторное согласие ложатся в одну миллисекунду. Обе реализации репозитория теперь ставят действующий факт выше отозванного.

**Грабля окружения:** `mvp.domains.http.integration.test.ts` собирает `MvpController` своим списком провайдеров — новая зависимость контроллера роняет его с `Nest can't resolve dependencies`. При добавлении сервиса в контроллер этот список надо править вручную.

**Тесты:** +9 (миграция 0069), +9 (чистое состояние согласия), +14 (`ConsentService`), +5 (связка с подтверждением личности), +4 фронт (контракт API согласий).

### 5.208 Доработка Task 6 — мостик для исторических согласий + оба согласия до загрузки

**Ветка:** `fix/2026-07-29-legacy-consent-bridge` (от `main` после #352).

**Контекст: столкновение параллельных сессий.** Task 6 (ФТ-C3.2) был одновременно сделан двумя сессиями. Раньше влили PR **#352** (ветка `worktree-faza3-task6-soglasiya`) — реализация шире: отдельные таблицы `consent_documents`/`consent_facts`, свой `ConsentController` с ключом по `learner_id` (согласие живёт вне конкретной заявки), серверное состояние галочек с отзывом из UI. Мой PR **#353** закрыт как дубль: сливать вторую реализацию того же требования и вторую миграцию с номером 0069 нельзя. Из закрытой ветки перенесено ТОЛЬКО то, чего в main нет.

**Дыра 1 — исторические согласия теряются (подтверждено фактами).** Миграция `0069` переносит старые согласия запросом `INSERT … SELECT … FROM learning.identity_verifications`. Но `git grep` по `apps/backend/src` показывает **ноль обращений** к этой таблице: записи идентификации живут в JSONB-снимке состояния (`mvp-collections.ts` → `identityVerifications`). Значит перенос переносит ноль строк, а `hasActiveConsent` читает только `consent_facts` и про историческое поле `record.consentAt` не знает. Последствие: слушатель, подавший документы до разделения согласий, оказывается «без согласия» — ему закрыты и загрузка, и повторная подача.

**Решение — ленивый перенос из настоящего источника правды.** `legacyConsentEvidence(record)` собирает доказательство из самой записи и передаётся в `PhotoConsentGate` вторым аргументом; `ConsentService.materializeLegacyConsents` создаёт факт в момент, когда согласие понадобилось. Свойства, закреплённые тестами: исходная дата согласия сохраняется (`insertFact` получил необязательный `grantedAt`); `documentVersion` пуст — текста тогда не существовало, приписать версию значило бы сфабриковать доказательство; **любой существующий факт, включая отзыв, останавливает перенос** — явный отзыв нельзя перекрыть воскрешённой галочкой; повторные обращения не плодят дубли; правило «фото только если фото реально загружено» то же, что в SQL-переносе.

**Дыра 2 — снимок принимался до согласия на обработку данных.** Перед выдачей upload-intent проверялось ТОЛЬКО согласие на фото (`assertPhotoConsent`), а согласие на ПДн — лишь на шаге submit, когда паспорт уже лежал в хранилище. Добавлен `assertIdentityConsents` (оба вида); гейт контроллера теперь зовёт его.

**Файлы:** `consents/consent.ts` (+`LegacyConsentEvidence`, `legacyConsentEvidence`, `legacyCovers`, расширенный `PhotoConsentGate`), `consents/consent.service.ts` (+`materializeLegacyConsents`, `assertIdentityConsents`), `consent.repository.ts` + обе реализации (`insertFact` принимает `grantedAt`), `mvp.service.ts` (передача доказательства в гейт), `mvp.controller.ts` (сборка гейта), новый `consents/legacy-consent-bridge.test.ts`.

**Тесты:** +15 (4 на чистую часть, 7 на перенос, включая сохранение даты, отсутствие версии текста, приоритет явного отзыва и отсутствие дублей, 3 на требование обоих согласий). Миграций нет.

### 5.209 Фаза 3, Task 7 — настраиваемый срок хранения снимков (ФТ-C3.1)

**Ветка:** `feat/2026-07-29-tz-faza3-task7-retention`. **План:** Task 7. **Решение владельца** (2026-07-29): «дать учебному центру ставить свой срок хранения».

**Точка расширения уже была готова:** `selectIdentityImagesToPurge(asOf, records, retentionDays = 90)` принимала срок параметром, но ни один вызывающий его не передавал — сканер всегда работал на умолчании.

**Где хранится настройка.** `payload.identitySettings` реквизитов тенанта (JSONB), файл `modules/tenant/tenant-identity-settings.ts` — по образцу `tenant-document-images.ts` и настроек нумераторов. Миграции нет. `TenantService.updateRequisites` сливает payload (`{...current.payload, ...patch.payload}`), поэтому соседние настройки не затираются.

**Проектные решения:**

1. **Не задано → прежние 90 дней.** Обновление не имеет права молча изменить срок удаления персональных данных.
2. **Границы 1…1095 дней.** Ноль запрещён: снимок удалялся бы сразу после решения модератора, и оспорить решение стало бы нечем. Верхняя граница есть потому, что бессрочное хранение паспортов противоречит принципу минимизации, ради которого очистка и существует.
3. **Мусор откатывается к умолчанию МОЛЧА** (строка, ноль, дробь, отрицательное, запредельное, `NaN`, не-объект) — уронить крон значило бы перестать удалять ПДн у ВСЕХ тенантов из-за опечатки у одного. По той же причине **нечитаемые реквизиты не останавливают очистку** (отдельный тест): сбой чтения настроек не должен оставить паспорта в хранилище навсегда.
4. **Решение модератора переживает удаление снимков** — закреплено тестом, как требовал план.

**API:** `GET /tenant/identity-settings` (действующий срок + флаг «работает умолчание» + границы) и `PUT /tenant/identity-settings` под правом `identity.configure` (0066). Отдельная ручка, а не правка сырого payload через `PUT /tenant/requisites`: значение проверяется, и менять его может только тот, кому доверена настройка идентификации. `null` возвращает умолчание.

**Файлы:** `modules/tenant/tenant-identity-settings.ts` (+тест), `tenant.controller.ts` (2 ручки), `mvp/identity/identity-retention-scanner.service.ts` (+`TenantService`, fail-soft чтение настройки), тест сканера расширен.

**Deviations:** (1) экрана настройки нет — только API; пачка экранов настроек (текст ПЭП, политика идентификации, тексты согласий, срок хранения) остаётся в остатке; (2) срок хранения записей прокторинга остался глобальным (env) — задача про снимки идентификации, зеркальную правку для видео молча не расширял.

**Тесты:** +13 (настройка: умолчание, границы, семь видов мусора) и +6 (сканер: срок 30 чистит раньше, умолчание не чистит, увеличенный откладывает, мусор и нечитаемые реквизиты не ломают очистку, решение модератора сохраняется).

**Структурный тест поймал реальный дефект.** `permission-guard-module-wiring.test.ts` упал на `tenant.module.ts`: `PermissionGuard` инстанцируется в модуле, которому принадлежит контроллер, и без `IamModule` приложение НЕ поднялось бы в рантайме — при зелёных типах. Исправлено импортом `IamModule` (цикла нет: IAM про тенант не знает). Урок тот же, что с `di-explicit-injection` в §5.206: вешая гвард на контроллер, проверяй импорты его модуля.

### 5.210 Фаза 3, Task 8 — проверка полноты до выгрузки в госреестр (ФТ-C4.1)

**Ветка:** `feat/2026-07-29-tz-faza3-task8-snils-readiness`. **План:** Task 8.

**Разведка изменила объём в обе стороны.** Выгрузок оказалось **пять**, а не две (ОТ/ЕИСОТ, ФРДО, ЕИСОТ-тестирование, Ростехнадзор, НМО), и у каждой УЖЕ был `*-preflight.ts`. Но СНИЛС в четырёх из пяти был **опционален**: пустое поле давало пустую ячейку, файл уходил в реестр, и человек в нём фактически не опознавался (это было задокументировано как «Known deviation #2» плана ФРДО, то есть осознанный временный компромисс).

**Явная смена принципа.** В проекте действует «частичный успех»: взять хорошие строки, показать плохие. Для ИМПОРТА он верен. Для ОТПРАВКИ В ГОСРЕЕСТР — нет: неполный файл означает, что пропущенные люди в реестре не появятся, центр видит «выгрузка сформирована», а слушатель узнаёт об этом через год. ТЗ требует блокировать — сделано, расхождение с принципом зафиксировано в комментарии кода и в плане.

**Существующий тест поймал ошибку в первой версии гейта.** Гейт блокировал выгрузку при ЛЮБОЙ ошибке, и тест «не сдавший экзамен исключается из файла, остальные экспортируются» справедливо упал. Группа, где часть людей ещё не сдала, — норма. Итоговое различение: блокируют **только пробелы в данных строки** (preflight); исключение кандидата из выгрузки (не сдал, битая связь сущности) работает как раньше, по «частичному успеху».

**Файлы:** новый `mvp/registry-readiness.ts` (+тест) — `buildReadinessReport` группирует ошибки по ЛЮДЯМ, дедуплицирует пару (поле, сообщение), сортирует по ФИО, не теряет строки без слушателя; СНИЛС обязателен в `frdo-/eisot-testing-/rostechnadzor-/nmo-preflight.ts`; `blocked` + `readiness` в пяти сервисах и пяти типах исхода; фронт — общий `features/gov-export/readiness.tsx` вместо плоского `<ul>` в пяти блоках `/gov-export`.

**Deviations:** (1) **дата рождения НЕ блокирует** — колонка добавлена 0046 без заполнения, форматы выгрузок помечены PROVISIONAL; требовать её сейчас = остановить все выгрузки ради непроверенного требования. **Открытый вопрос №12.** (2) Отдельного «сухого» эндпоинта нет: список показывается при нажатии «Сформировать», файл при этом не создаётся и в реестр ничего не уходит — критерий приёмки выполнен, отдельная ручка вынесена в остаток. (3) Валидатор СНИЛС в `shared-types` не вынесен: фронтовое зеркало править не пришлось, счётчик дрейфа не сдвинулся.

**Тесты:** +8 (ядро отчёта), +3 (ФРДО: нет СНИЛС → нет файла и поимённый список; битая контрольная сумма блокирует; без пробелов файл собирается), 6 существующих обновлены под новый контракт (4 preflight «СНИЛС опционален» → «обязателен», 2 сервисных про частичный успех).

### 5.211 Фаза 3 — срок годности подтверждения с фото (ФТ-C1.2, закрытие вопроса №8)

**Ветка:** `feat/2026-07-29-tz-faza3-photo-freshness`. **Ответ владельца 2026-07-29:** срок годности — 24 часа, снимок ОДИН на слушателя (не на каждую попытку), срок настраивается администратором.

**Где живёт настройка.** Миграция **0070** добавляет `learning.identity_policies.photo_max_age_hours` — рядом с `require_photo_before_exam` (0066), потому что это свойство ТОГО ЖЕ требования: «нужно фото» и «насколько свежее» по отдельности бессмысленны. Уровень политики, а не тенанта: у разных программ строгость разная. Проверена на живой БД: накат, повторный накат, CHECK (1…720 ч) срабатывает.

**Проектные решения:**

1. **Отсчёт от решения модератора** (`reviewedAt`), а не от подачи: пока заявку не проверили, подтверждения ещё нет.
2. **Значения «бессрочно» нет намеренно** — возможность выключить требование противоречила бы самому требованию ТЗ «непосредственно перед экзаменом». Границы 1…720 ч: меньше часа человек не успеет пройти проверку модератором, больше 30 суток — «непосредственно» перестаёт быть правдой.
3. **Мусор в настройке откатывается к умолчанию** (`normalizePhotoMaxAgeHours`), как и уровень политики: опечатка не должна ни запереть экзамен группе, ни отменить требование свежести.
4. **Расхождение часов сервера считается свежестью**: дата решения «в будущем» — рассинхронизация, а не подделка; запирать человека хуже.

**Тест поймал хрупкость.** Первая версия гейта читала `identityPolicy.photoMaxAgeHours` напрямую — политика из старого вызова без этого поля давала `NaN` и запирала экзамен при действующем подтверждении. Исправлено нормализацией на входе гейта.

**Файлы:** миграция 0070 (+тест), `identity/identity-policy.ts` (`DEFAULT/MIN/MAX_PHOTO_MAX_AGE_HOURS`, `normalizePhotoMaxAgeHours`, `isPhotoVerificationFresh`, поле в `EffectiveIdentityPolicy`), репозиторий политики (маппинг колонки), DTO контроллера (`photoMaxAgeHours` под `identity.configure`), гейт `identity_photo_expired` в `mvp.service.ts`.

**Тесты:** +16 (умолчание, настройка, 8 видов мусора и границы, свежесть на границе и за ней, отсутствие решения, битая дата, часы сервера), +2 (устаревшее подтверждение не пускает; увеличенный срок читается), +5 (миграция 0070).

### 5.212 Фаза 3 — юридический журнал esign переживает перезапуск (подготовка к Task 9)

**Ветка:** `fix/2026-07-30-durable-legal-log`.

**Дефект, найденный в Task 3 и закрытый здесь.** Таблица `esign.legal_log_entries` существует с миграции **0004** и защищена триггером `legal_log_entries_no_update` (append-only), но `EsignService.writeLegal` складывал записи **только в память** (`InMemoryEsignState.legalLogEntries`). Юридический журнал — то, на чём держится доказательная сила подписи, — не переживал перезапуск приложения. В §5.204 это было зафиксировано как отдельная задача, критичная для «личного дела слушателя» (Task 9): проверяющему нужна доказательная цепочка, а не то, что уцелело в памяти процесса.

**Что сделано.** `EsignService` получил `LegalLogWriter` (тот же, что использует ПЭП-контур Task 3) пятым аргументом конструктора; `writeLegal` теперь пишет И в память, И в БД. Конструктор менялся спокойно: сервис собирается всего в 3 местах (в отличие от `MvpService` с его 75 тестовыми файлами).

**Проектные решения:**

1. **Запись НЕ ожидается (`void`).** Журнал не должен ни задерживать, ни ронять пользовательское действие; `LegalLogWriter` сам ловит ошибку и пишет её в лог — пропавшая запись видна, но подписание не срывается. Закреплено тестом «падение записи в журнал не срывает действие».
2. **Чтение по-прежнему из памяти.** Перевод чтения на БД потребовал бы сделать асинхронными все списочные методы — отдельная задача. **Записано в остаток.**

**Проверено на живой БД:** вставка в `esign.legal_log_entries` проходит, `UPDATE` отбивается триггером («append-only»).

**Прогон поймал вторую ошибку — серьёзнее первой.** Первая версия писала `void this.legalLogWriter.write(...)` без `catch`. Все 2555 тестов при этом проходили, но в итогах стояло «Errors 1 error»: необработанное отклонение промиса. В Node это способно уронить процесс целиком — то есть журнал, который должен защищать от аварий, сам стал бы их источником. Исправлено явным `.catch` с записью в лог сервиса. **Урок: зелёные тесты ≠ зелёный прогон, смотреть на строку Errors.**

**Тесты:** +2 (событие уходит в durable-журнал в том же количестве и с теми же полями, что и в память; падение журнала не срывает действие); 4 существующих места сборки сервиса обновлены (включая канонический `business-flows.e2e.test.ts`).

### 5.213 Фаза 3, Task 9 (часть 1 из 2) — «личное дело слушателя»: доказательная цепочка (ФТ-C2)

**Ветка:** `feat/2026-07-30-tz-faza3-task9-dossier`. **Задача разделена на две части осознанно:** здесь доказательная цепочка (сборка четырёх разделов, эндпойнт, защита), PDF-рендер — отдельным PR.

**Почему разделено.** В проекте есть только DOCX→PDF (`convertDocxToPdf`, Gotenberg LibreOffice); **HTML→PDF отсутствует вовсе** (grep по `chromium` пуст). Дело — многосекционный документ, для которого HTML-шаблон уместнее DOCX. Добавление второго конвертера — самостоятельная работа с собственными рисками (таймауты, размеры, шрифты), и смешивать её с доказательной частью в одном PR неправильно.

**Разведка нашла четыре пробела в источниках** (см. отчёт в теле PR): (1) читателя `esign.legal_log_entries` не существовало вовсе — только писатель из Task 3; (2) `AuditService.list` тянет весь тенант без фильтров; (3) `listIdentityVerifications` фильтрует только по статусу; (4) истории `consent_facts` наружу нет, только последний факт. Закрыт пробел №1 (`LegalLogReader.listByActor`); остальные обойдены выборкой из состояния, потому что дело собирается по одному слушателю.

**Что сделано:** `esignature/legal-log.reader.ts` (чтение журнала из БД по актору, с лимитом — журнал растёт бесконечно); `identity/learner-dossier.ts` (чистая часть: длительность сессии, метка модератора, разбор записи журнала); `identity/learner-dossier.service.ts` (сборка четырёх разделов); `GET /learners/:id/dossier` под `learners.read`.

**Проектные решения:**

1. **Своей таблицы нет** — всё из существующих источников, как требовал план: копия доказательств разошлась бы с оригиналом.
2. **«Пусто» ≠ «не прочитали».** Недоступный журнал не обрушает дело, но раздел попадает в `unavailableSections`. Пустой список означал бы «подписей не было» — другое утверждение, и в доказательном документе путать их недопустимо.
3. **Чужой тенант → 404, не 403** (как у карточки слушателя): 403 подтвердил бы существование записи.
4. **152-ФЗ access-log** на каждое обращение, `accessedVia: 'learner_dossier'`, БЕЗ ФИО и СНИЛС в теле (закреплено тестом, который ищет их в сериализованной записи).
5. **Удалённые по сроку снимки показаны явно** — иначе проверяющий решит, что документов не было вовсе. **Отозванные документы остаются в деле** — скрыть отзыв значило бы выдать недействующее за действующее.
6. **ЕСИА-подтверждения помечаются как автоматические**, живого модератора у них не было; удалённый модератор показывается идентификатором, а не «—» (факт решения важнее его авторства).
7. **Расшифровка СНИЛС не нужна:** шифрование ПДн (`pii-crypto`) применяется только на границе снапшот-персистенса, в состоянии СНИЛС уже открыт; гейт обеспечивает право `learners.read`, а аудит его маскирует.

**Остаток (часть 2):** HTML→PDF (`/forms/chromium/convert/html` в Gotenberg) + шаблон дела + `.pdf`-эндпойнт + вкладка в карточке слушателя на фронте.

**Тесты:** +12 (чистая часть: длительность включая незавершённую/отрицательную/битую, метка модератора включая ЕСИА и сбой поиска, разбор payload с мусором) и +11 (сервис: 404 чужому тенанту, access-log без ПДн, пустое дело, только свои документы, последняя запись идентификации, удаление снимков, длительность экзамена, недоступный журнал, подписанные действия, слушатель без привязки к аккаунту).

### 5.214 Фаза 3, Task 9 (часть 2 из 2) — PDF личного дела (ФТ-C2)

**Ветка:** `feat/2026-07-30-tz-faza3-task9-dossier` (продолжение §5.213).

**Добавлен ВТОРОЙ конвертер: HTML→PDF.** В проекте был только `convertDocxToPdf` (Gotenberg LibreOffice). Дело собирается из данных, а не из заранее нарисованного бланка, поэтому HTML-шаблон уместнее DOCX: правится без бинарного файла и не требует держать Word-шаблон ради таблицы. Контракт Gotenberg: `POST /forms/chromium/convert/html`, имя файла ОБЯЗАНО быть `index.html` — Chromium ищет именно его как точку входа, любое другое имя даёт 400 (закреплено тестом). Классификация ошибок та же, что у DOCX-ветки: 4xx = проблема документа (`retryable: false`), остальное = проблема сервиса.

**Шаблон** (`identity/learner-dossier.html.ts`) — чистая функция без ввода-вывода: четыре раздела таблицами, никакого JavaScript и внешних ресурсов (страница обязана рендериться одинаково без сети — для доказательного документа это существенно), экранирование пользовательского ввода (в деле есть ФИО и причины отклонения).

**Решения:**

1. **Непрочитанный раздел печатается КРАСНЫМ предупреждением** прямо в PDF: «отсутствие записей ниже НЕ означает, что подписанных действий не было». Пустая таблица в доказательном документе — ложное утверждение.
2. **Незавершённая сессия — «не завершено», а не «0 мин»** (иначе документ утверждает, что человек мгновенно закончил).
3. **Отзыв документа виден рядом со статусом** — отозванное удостоверение не должно выглядеть действующим.
4. **Имя файла из идентификатора, без ФИО** — ПДн не должны утекать в имена файлов, логи прокси и историю загрузок браузера. `Content-Disposition: inline`: дело чаще смотрят, чем сохраняют.
5. **Рендер синхронный**, а не через очередь документов: дело собирается из готовых данных и нужно «здесь и сейчас», в отличие от удостоверений, которые печатаются пачками и терпят ожидание.

**Файлы:** `packages/docx-render/src/gotenberg-convert.ts` (+`convertHtmlToPdf`, экспорт в `index.ts`), `identity/learner-dossier.html.ts` (+тест), `composePdf` в сервисе дела, `GET /learners/:id/dossier.pdf` под `learners.read`.

**Остаток:** вкладка «Личное дело» в карточке слушателя на фронте (кнопка «Скачать PDF» ведёт на новый эндпойнт) — фронтовая работа, вынесена отдельно.

**Тесты:** +6 (конвертер: имя `index.html`, chromium-эндпойнт, 4xx/5xx/сеть/не-PDF) и +13 (шаблон: четыре раздела, объяснённые пустые разделы, предупреждение о непрочитанном разделе, удаление снимков, отзыв документа, незавершённая сессия, экранирование ФИО, отсутствие внешних ресурсов).

### 5.215 Фаза 3, Task 10 (часть 1) — проверки готовности к экзамену (ФТ-E3.2)

**Ветка:** `feat/2026-07-30-tz-faza3-task10-exam-chain`. Задача делится надвое: здесь **валидации ДО старта** (ФТ-E3.2), «одна кнопка» (результаты → протокол и удостоверения → журнал выдачи → выгрузка в реестр с возвратом номеров) — отдельным PR: она связывает четыре готовых подсистемы и прицепом делаться не должна.

**Почему проверки идут до, а не после.** Протокол, подписанный комиссией из двух человек, или удостоверение без СНИЛС — брак, который вскрывается у проверяющего через месяцы, когда пересдавать поздно. Дешевле не пустить, чем переделывать.

**Правила (`mvp/exam-readiness.ts`, чистые функции):**

1. **Комиссия ≥ 3 человек** — не произвольное число: решение принимается большинством, двое большинства не образуют.
2. **Обязателен председатель** — протокол подписывает он; комиссия без председателя не закроет группу, и это выяснилось бы при печати.
3. **Член комиссии без имени** (ни `externalFullName`, ни `userId`) — блокирует: иначе в протоколе окажется пустая строка. Внутренний пользователь без ФИО ошибкой НЕ считается — имя возьмётся из профиля.
4. **СНИЛС слушателей** — то же правило, что в проверке выгрузки (Task 8), но раньше по времени: после экзамена протокол уже подписан, и переподписывать его из-за опечатки — отдельная процедура.
5. **Проблемы комиссии и слушателей возвращаются ВМЕСТЕ**, а не по очереди: иначе методист чинит их по одной, каждый раз упираясь в новую.
6. **Комиссия не назначена программе** — тоже блокирующая проблема, а не «проверять нечего».

**Где комиссия берётся:** из `ProgramMeta.commissionId` версии курса — комиссия привязана к программе, а не к группе (одна комиссия аттестует по нескольким группам).

**API:** `GET /groups/:groupId/exam-readiness?courseId=…` под `enrollments.read` — список виден ДО назначения экзамена, а не в момент отказа при старте.

**Тесты:** +17 (комиссия из двух, отсутствие председателя, безымянный член, внутренний пользователь без ФИО, пустая комиссия; СНИЛС отсутствующий/битый/пробельный, поимённость; сводный отчёт и совместный показ проблем).

### 5.216 Фаза 3, Task 10 (часть 2) — проектное решение по «одной кнопке» (не реализовано)

**Статус: НЕ РЕАЛИЗОВАНО.** Записано, чтобы следующая сессия не искала заново направление связи модулей — оно неочевидно и уже стоило одной аварии (§5.215, круговая зависимость, вешавшая приложение при старте).

**Что требуется (ФТ-E3):** одна кнопка на цепочку «результаты → протокол + удостоверения → журнал выдачи → выгрузка в реестр», с возвратом номеров записей реестра в документы.

**Что уже готово:** `DocumentsService.closeGroup` (Фаза 1 Task 7) выпускает протокол на группу и удостоверения сдавшим, идемпотентно — повторное нажатие добивает упавшие задачи, а не выпускает второй комплект. Проверки готовности к экзамену — §5.215. Проверка полноты перед выгрузкой — §5.210.

**Где размещать кнопку — ЕДИНСТВЕННЫЙ безопасный вариант: в `MvpModule`.**

- `MvpModule` импортирует `DocumentsModule` (`mvp.module.ts:131`), значит `MvpController`/`MvpService` могут звать `DocumentsService` штатно.
- Обратное направление ЗАПРЕЩЕНО: `documents.module.ts:53` содержит явный комментарий, что импорт `MvpModule` даст цикл. То есть повесить гейт готовности на существующий `POST /admin/documents/close-group` **нельзя** — у `DocumentsController` нет и не может быть доступа к комиссиям и слушателям.
- Напоминание из §5.215: цикл не ломает сборку и не виден типам — он проявляется ЗАВИСАНИЕМ приложения при старте и ловится только интеграционным тестом по таймауту.

**Предлагаемая форма:** `POST /groups/:groupId/close` в `MvpController` → `getExamReadiness` (412 со списком, если не готово) → `documentsService.closeGroup(...)` → выгрузка в реестр. Номера реестра возвращаются в документы отдельным шагом после ответа реестра — это уже существующий контур `*-registry.service`.

### 5.217 Фаза 3, Task 10 (часть 2) — «одна кнопка»: проверки → протокол и удостоверения (ФТ-E3)

**Ветка:** `feat/2026-07-30-tz-faza3-task10-close-chain`. Реализация по проектному решению §5.216.

**Где живёт метод — на стороне `MvpService`, и это не вкусовщина.** `DocumentsService` не видит комиссии и слушателей, а импорт `MvpModule` в `DocumentsModule` дал бы цикл (явный запрет в `documents.module.ts:53`). Цикл не ломает сборку и не виден типам — он ВЕШАЕТ приложение при старте (§5.215). `MvpService` уже инжектит `DocumentsService`, поэтому цепочка собралась **без единой новой связи между модулями**.

**Что делает `closeGroupWithChecks`:** `getExamReadiness` (ФТ-E3.2) → при непустом списке 412 `exam_not_ready` С ПЕРЕЧНЕМ проблем и БЕЗ выпуска документов → иначе `documentsService.closeGroup` (протокол + удостоверения, идемпотентно) → аудит `learning.group_closed_with_checks`. Отчёт о готовности возвращается вместе с результатом: он часть доказательства, что документы выпущены на проверенных данных.

**Выгрузка в реестр в кнопку НЕ включена — осознанно.** Она уходит во внешнюю госсистему, и отменить отправку нельзя. Связать «выпустили документы» и «отправили в реестр» в одну неразрывную операцию значило бы допустить состояние, из которого нет пути назад при сбое на втором шаге. У выгрузки к тому же своя проверка полноты (ФТ-C4.1, §5.210). Остаётся отдельным действием оператора.

**API:** `POST /groups/:groupId/close` под `documents.generate` — право того, кому доверен выпуск документов, а не того, кто просто видит группу.

**Остаток по ФТ-E3:** возврат номеров записей реестра в документы после ответа реестра (существующий контур `*-registry.service`) — не сделан.

**Тесты:** +3 (незакрытая готовность останавливает выпуск и НЕ заводит ни одной задачи на документы; отказ называет причины кодом `exam_not_ready`; при готовой группе документы выпускаются одним вызовом и отчёт возвращается).

### 5.218 Фаза 3 «Идентификация» — ЗАВЕРШЕНА

**Все 10 задач плана сделаны и влиты** (кроме последних PR в ревью): §5.202–§5.217. Обновлены статус-трекер (фаза → ✅), README §2 и указатель миграций в `CLAUDE.md` (последняя — `0070_identity_photo_max_age.sql`).

**Миграции фазы:** `0066` политика идентификации, `0067` ПЭП-соглашение, `0068` СМС-настройки, `0069` раздельные согласия, `0070` срок годности фото. Все проверены накатом на живой Postgres (накат + повторный накат + пробы ограничений), не только статическим тестом SQL — `pnpm test:migrations` разбирает текст, а не применяет его.

**Что было найдено попутно и почему это важнее части задач:**

1. **Юридический журнал esign писался только в память** (§5.212) — переживал бы перезапуск. Переведён на БД.
2. **SQL-перенос старых согласий был пустым** (§5.208): миграция читала таблицу, которую код не заполняет (записи в JSONB-снимке). Слушатели, подавшие документы раньше, оказались бы «без согласия». Сделан ленивый перенос из настоящего источника.
3. **Согласие спрашивали ПОСЛЕ загрузки паспорта** (§5.207) — снимок уже лежал в хранилище.
4. **СНИЛС был опционален в 4 из 5 госвыгрузок** (§5.210): пустое поле давало пустую ячейку, человек в реестре не опознавался.
5. **Мои собственные две аварии:** необработанное отклонение промиса, способное уронить процесс (§5.212), и круговая зависимость, вешавшая приложение при старте (§5.215). Обе пойманы прогоном, обе описаны — цикл не виден типам и не ломает сборку.

**Остаток фазы (код):** возврат номеров записей реестра в документы (ФТ-E3); вкладка «Личное дело» на фронте; экраны настроек — тексты соглашения ПЭП и согласий, политика идентификации, срок хранения снимков (везде есть API, нет UI); фильтрованное чтение аудита (нужно для IP/устройства в личном деле).

**Остаток вне фазы:** бесплатный видеоадаптер (решение владельца), адаптеры СМС-операторов, доведение загрузки бланков.

**Открытый вопрос владельцу №12:** считать ли дату рождения обязательной для госвыгрузок. Сейчас НЕТ: колонка добавлена миграцией 0046 без заполнения, форматы выгрузок помечены PROVISIONAL — требование остановило бы все выгрузки.

### 5.219 Фаза 4 Task 1 (фундамент) — роль представителя заказчика и скоуп (ФТ-E5)

**Ветка:** `feat/2026-07-30-tz-faza4-counterparty-rep`. Первый срез задачи: роль, привязка к контрагенту, чистая логика скоупа. Применение скоупа в шести выборках, переделка экрана портала и тест изоляции — следующим срезом.

**Контекст (поправка к плану).** Роли представителя в системе НЕ БЫЛО (`iam.roles`: platform_admin, tenant_admin, manager, methodist, learner). Портал заказчика отдаёт полные списки центра, но утечки нет только потому, что внешний человек войти не может. **Заводить роль без скоупа означало бы включить утечку в тот же день** — поэтому роль и основание скоупа вводятся одной миграцией.

**Миграция 0071.** Колонка `iam.users.counterparty_id` (NULL у персонала), роль `counterparty_rep`, отдельное право `portal.read`.

**Проектные решения (все проверены на живой БД):**

1. **Отдельное право `portal.read`, а не `counterparties.read`.** Последнее означает «видеть справочник контрагентов центра» — ровно ту клиентскую базу, которую представитель видеть не должен.
2. **Композитный FK `(tenant_id, counterparty_id)`** — контрагент обязан быть из того же тенанта. Без tenant_id в ключе пользователя можно было бы привязать к контрагенту чужого центра, и сам механизм скоупа стал бы каналом утечки. Проверено: попытка отбивается БД.
3. **Забытая привязка → пустой экран, а не чужие данные** (безопасное поведение по умолчанию).
4. **Сущность БЕЗ контрагента представителю не видна** — группа без заказчика это внутренняя группа центра; правило «нет владельца, значит общий» превратило бы каждую незаполненную связь в дыру.
5. **Скоуп строится из личности актора, а не из параметра запроса** — идентификатор от клиента подменяется тривиально.
6. **Чужая сущность неотличима от несуществующей** (`scopeAllowsEntity` → false в обоих случаях): вызывающий отвечает «не найдено». Отказ, отличающий чужую запись от несуществующей, сам выдаёт факт её существования.

**Файлы:** миграция `0071` (+тест), `counterparty-scope.ts` (+тест), `request-context.ts` (+`counterpartyId`), `iam.types.ts`.

**Следующий срез:** скоуп в `GET /counterparties`, `/groups`, `/enrollments`, `/learners`, `/counterparties/:id(/progress-summary)`; **проверка владения при скачивании документа** (её нет вовсе — закладывать вместе с реальной отдачей файла); переделка `/counterparty-portal`; тест изоляции по контрагенту (существующие два проверяют только тенанта).

**Тесты:** +6 (миграция: композитный FK, отсутствие прав на справочники у представителя, отдельное право портала, идемпотентность) и +13 (скоуп: персонал не ограничен, представитель ограничен, чужой невиден, сущность без контрагента невидна, копия списка, неотличимость чужого от несуществующего).

### 5.220 Фаза 4 Task 1 (срез 2) — скоуп применён в выборках + тест изоляции по контрагенту (ФТ-E5)

**Ветка:** `feat/2026-07-30-tz-faza4-portal-scope-apply` (продолжение §5.219).

**Что сделано:**

1. **Привязка актора едет в `RequestContext` тем же походом в БД, что и права:** `IamService.resolveActorScope` (пользователь и так загружается при разрешении прав — привязка тем же рейсом), `PermissionGuard` ставит `counterpartyId` на каждом запросе. Старый `resolvePermissions` сохранён без изменения сигнатуры (6 внешних вызовов).
2. **Скоуп в четырёх выборках** (`listCounterparties`, `listGroups`, `listEnrollments`, `listLearners`) — необязательным параметром актора: существующие вызовы без актора не ограничены, ни один из 75 тестовых файлов не тронут.
3. **Фильтрация ДО пагинации** — иначе представитель получал бы пустые страницы с правильным total по центру, а total сам раскрывает размер клиентской базы (закреплено тестом).
4. **Сотрудники заказчика выводятся через зачисления в его группы**: прямой привязки на карточке слушателя в снимке состояния нет, а заводить второй источник правды ради скоупа значило бы получить два расходящихся ответа на «чей это сотрудник».
5. **`getCounterparty` и `/counterparties/:id/progress-summary` под гейтом**: чужой идентификатор из URL → `NotFoundException` (не 403 — отказ, отличающий чужую запись от несуществующей, сам выдаёт факт её существования).
6. **Новый `counterparty-scope.isolation.test.ts`** — третий уровень изоляции к двум существующим (те проверяют только тенанта): 9 проверок, включая непересечение двух представителей, невидимость внутренних групп и обратную совместимость вызовов без актора. Попадает в `pnpm test:isolation` по маске имени.

**Остаток задачи 1:** переделка экрана `/counterparty-portal` (право `portal.read` вместо `counterparties.read`, секции «мои сотрудники/группы/документы»); скоупированный список документов представителя (через зачисления, в `MvpService` — в модуле документов нельзя, цикл); проверка владения при скачивании — вместе с реальной отдачей файла (представителю `documents.read` не выдан, вектор закрыт ролями).

**Прогон уронил 49 тестов — и починка была выбором, а не механикой.** Гвард стал звать `resolveActorScope`, которого нет в 11 тестовых заглушках IAM. Вариант «гвард терпит отсутствие метода и работает по-старому» отвергнут: такая терпимость означает, что неполная реализация IAM ТИХО отключает скоуп представителя — fail-open. Вместо этого обновлены все 11 заглушек: `resolveActorScope` делегирует их же `resolvePermissions`, поэтому per-test переопределения прав (`mockResolvedValueOnce`) и проверки вызовов сохраняются.

**Тесты:** +9 изоляции по контрагенту (итого isolation: 21); 11 заглушек IAM дополнены.

### 5.225 Программа покрытия — порция 5 (75,5% → 76,0% бэкенда)

**Ветка:** `test/2026-07-31-coverage-uplift-5`. 10 тестов (+197 строк): `demoVariables` каталога переменных (каждый код каталога обязан иметь демо-значение — иначе предпросмотр показал бы сырой плейсхолдер; осиротевших демо-значений нет; картинки — пустые заглушки) и `outbox-publisher` (был 0%: for update skip locked — два экземпляра не заберут одно событие; сбой брокера не теряет событие — pending с экспоненциальной паузой и потолком; исчерпание попыток → failed; падение одного события не мешает пачке). 2742 теста зелёные. **Очередь порции 6:** `postgres-documents-persistence.backend` (224), `database.service` (163, мок pg.Pool), хвосты `mvp.service` (1013)/`iam.service` (230)/`auth.service` (215) адресно, `notifications.service` (109), `backfill.service` (201).

### 5.224 Программа покрытия — порция 4 (75,2% → 75,5% бэкенда)

**Ветка:** `test/2026-07-31-coverage-uplift-4`. `video.controller` (был 0%), 7 тестов (+118 строк): мусорное тело (пустое имя файла, отрицательный размер, часть без etag) отбивается ДО сервиса; валидное — делегируется под тенантом актора; list без materialId не ходит в сервис. Общий прототип-обход (как у esign) тут не годится из-за `assertValidDto` — паттерн: мок-сервис + прямые вызовы ручек с валидными/невалидными телами. 2732 теста зелёные. **Очередь порции 5:** `postgres-documents-persistence.backend` (224), `variable-catalog` (107), хвосты `mvp.service`/`iam.service`/`auth.service` адресно, `outbox-publisher` (100), `database.service` (163, нужен мок pg.Pool).

### 5.223 Программа покрытия — порция 3 (74,6% → 75,2% бэкенда)

**Ветка:** `test/2026-07-31-coverage-uplift-3`. Ещё два pg-репозитория с нулём, 14 тестов (+191 строка): `postgres-video-assets.repository` (bigint-размер строкой → Number, НУЛЕВАЯ длительность не теряется — проверка на null, не на falsy; в update «undefined = не менять, null = стереть» через пары флаг+значение, coalesce не годится) и `postgres-recertification-drafts.repository` (кроновый повтор не плодит второй черновик — on conflict возвращает существующий; истекающие первыми; решение пишется вместе с решившим). 2725 тестов зелёные. **Очередь порции 4:** `postgres-documents-persistence.backend` (224), `video.controller` (118, valid-DTO), `variable-catalog` (107), хвосты `mvp.service` (адресно по непокрытым строкам), `iam.service`/`auth.service`.

### 5.222 Программа покрытия — порция 2 (73,8% → 74,6% бэкенда)

**Ветка:** `test/2026-07-31-coverage-uplift-2`. Ещё два pg-репозитория с нулевым покрытием, 18 тестов (+286 строк): `postgres-webinars.repository` (сортировка НЕ из пользовательской строки — защита от инъекции проверена буквально; upsert посещаемости по вебхуку; поиск по provider_session_id — единственный запрос без tenant_id, вебхук снаружи тенантов не знает) и `postgres-chat.repository` (диалоги видны только участнику через join; unread растёт у всех КРОМЕ отправителя; диалог+участники одной транзакцией — иначе диалог-сирота). Все 2711 тестов зелёные. **Очередь порции 3:** `postgres-documents-persistence.backend` (224), `video.controller` (118, valid-DTO паттерн), `variable-catalog` (107), `postgres-video-assets` (96), `postgres-recertification-drafts` (95), хвосты `mvp.service`/`iam.service`/`auth.service` адресно.

### 5.221 Программа покрытия тестами — порция 1 (72,0% → 73,8% бэкенда)

**Ветка:** `test/2026-07-31-coverage-uplift`. Владелец запросил 100% покрытия; замер живым инструментированием (`@vitest/coverage-v8`, ставился временно и откачен) дал: **бэкенд 72,0% строк / 83,5% ветвлений; фронт 21,1% / 83,9%; суммарно ~51% строк**.

**Почему 100% недостижимы в один заход — три категории:**

1. **Фронт (~19 тыс. строк экранов)** не исполняется тестами по конвенции самого репозитория «No React Testing Library / no render()». 100% возможны только со сменой конвенции — решение владельца, без него честный потолок фронта по строкам низкий при высоком покрытии ветвлений.
2. **Файлы сборки модулей** (mvp.module 332, communication.module 168, payments.module 136 и т.п.) исполняются только при старте приложения.
3. **Остальное** — программа из порций: pg-репозитории (были 0%), контроллеры, хвосты `mvp.service.ts` (1013 непокрытых строк при 82,5%).

**Порция 1 (54 теста, +646 строк):** `postgres-payments.repository` (маппинг bigint→number, идемпотентность платежа, tenant_id в каждом where), `postgres-licenses.repository` (касты дат к тексту, пустой массив = «не ограничено»), `postgres-consent.repository` (исторический факт без версии текста — приписать её значило бы сфабриковать доказательство; отзыв без удаления строки), `esign.controller` (обход прототипа: все 33 ручки обязаны передавать тенант актора первым аргументом — новая ручка попадает под проверку автоматически).

**Паттерн для следующих порций:** поддельная `DatabaseService` с маршрутизацией по фрагменту SQL и записью вызовов — проверяются и параметры, и перевод snake_case→camelCase.

**Очередь порции 2 (по карте coverage-summary):** `postgres-webinars.repository` (173), `postgres-chat.repository` (143), `postgres-documents-persistence.backend` (224), `video.controller` (118, нужен valid-DTO паттерн — общий не подходит из-за `assertValidDto`), `variable-catalog.ts` (107), хвосты `mvp.service.ts`/`iam.service.ts`/`auth.service.ts` — адресно по непокрытым строкам.

**Как повторить замер:** `pnpm add -D -w @vitest/coverage-v8@3.2.4` → `cd apps/backend && npx vitest run --coverage --coverage.reporter=json-summary --no-file-parallelism` → откатить package.json/pnpm-lock.

### 5.226 Фаза 4 Task 1 (срез 3) — экран портала под `portal.read` + документы представителя (ФТ-E5)

**Ветка:** `feat/2026-07-31-tz-faza4-portal-screen` (продолжение §5.219–§5.220; закрывает «остаток задачи 1» из §5.220, кроме сознательно отложенной проверки владения при скачивании).

**Что сделано:**

1. **Три ручки `/portal/*` под отдельным правом `portal.read`** (`GET /portal/learners`, `/portal/groups`, `/portal/documents` в `mvp.controller.ts`): `learners.read`/`groups.read` означают «видеть данные по всему центру» и представителю не выдаются, поэтому старые ручки для портала не годятся — представитель с одним `portal.read` получал бы 403 на каждой. Скоуп по контрагенту применяется в сервисе; персонал (без привязки) видит всё — менеджер должен видеть то же, что и клиент, когда разбирает его обращение. HTTP-граница закреплена двумя тестами: `counterparties.read + learners.read` → 403, `portal.read` → 200.
2. **`MvpService.listPortalDocuments`** — «документы представителя» = документы зачислений в группы его контрагента (`sourceEntityType='enrollment'`). Живёт в `MvpService`, а не в модуле документов: тому неоткуда узнать про группы и зачисления (mvp → documents уже есть, обратное — цикл). Отдаётся проекция `PortalDocument` без `variablesSnapshot` (там ПДн); `status` не скрывает отзыв — показать отозванный документ действующим значило бы обмануть заказчика.
3. **Хранилище документов пагинирует по умолчанию 20 строками — скоуп фильтрует ДО пагинации:** внутрь передаётся `pageSize: MAX_SAFE_INTEGER`, иначе документ представителя, попавший за первую страницу общего хранилища, «исчезал» бы из его выдачи. Закреплено тестом с 25 чужими документами перед одним своим. Заглушка documents в isolation-тесте теперь повторяет реальную пагинацию — заглушка без неё этот регресс не поймала бы.
4. **Экран `/counterparty-portal` переписан под представителя:** право маршрута и пункта меню — `portal.read` (метка «Портал заказчика»), секции «Мои сотрудники» / «Группы обучения» / «Документы» через новые хуки `usePortal*`. Убран заголовок «обзор для персонала» и вызовы полных списков центра.
5. **Изоляция:** +4 проверки в `counterparty-scope.isolation.test.ts` (итого 13): документы двух представителей не пересекаются, скоуп до пагинации, персонал видит всё. Фронт: контракт `listPortalDocuments` (конверт + URL `/portal/documents`), маршрут открывается `portal.read` и НЕ открывается `counterparties.read`.

**Сознательно не сделано (остаток Task 1):** проверка владения при скачивании документа — закладывать вместе с реальной отдачей файла (ссылка сейчас ведёт на несуществующий контроллер, представителю `documents.read` не выдан — вектор закрыт ролями). Отмечено в плане фазы.

**Тесты:** +4 isolation (13 в файле, весь `test:isolation` — 25), +2 HTTP integration (99 в файле), +3 фронт (контракт + 2 маршрутизации). Полный `pnpm ci:check` exit 0: бэкенд **2748**, фронт **792**, воркер 30; `test:security` 24. Первый прогон падал на `eisot-testing-export.dto-validation.test.ts` таймаутом vitest-воркера (загрузка модуля под нагрузкой, не код) — файл отдельно и повторный полный прогон зелёные.

### 5.227 Фаза 4 Task 2 — единственный источник тенантов — БД (ФТ-D2.1)

**Ветка:** `feat/2026-07-31-tz-faza4-tenants-db-only` (после §5.226/PR #375).

**Что сделано:**

1. **In-memory фоллбек `tenant_demo` из `TenantService` убран целиком** (демо-тенант, демо-настройки, демо-реквизиты и демо-состав комиссии «Иванов/Петров»). Платформа сдаётся в аренду: «знать» тенанта, которого нет в базе, означало подменять арендатора демо-данными при любом сбое конфигурации. Без `DatabaseService` сервис отвечает честной 503 `tenant_store_unavailable` (fail-closed), а не выдуманными данными. В живом приложении `DatabaseService` предоставляется всегда (`InfrastructureModule`) — фоллбек работал только там, где сервис собирали руками без БД; все остальные тесты мокают `TenantService` целиком (проверено), затронут только его собственный юнит-тест.
2. **Статусы тенанта расширены до `trial | active | suspended | archived`** (`TenantStatus` в `tenant.types.ts`; раньше — свободный текст в БД и `'active'|'suspended'` в типе). Миграция `0072`: CHECK-ограничение + нормализация мусорных статусов в `suspended`, а НЕ в `active` — неизвестное состояние не должно держать тенанта работающим (ошибочно приостановленного вернёт админ платформы; ошибочно активированный — чужие данные без оплаты и договора). Нормализация идёт ДО `ADD CONSTRAINT`, иначе миграция падала бы на живой базе с мусором.
3. **`listActiveTenantIds` включает `trial`:** пробный центр реально учится и должен попадать в ночные кросс-тенантные сканы (напоминания, ретеншн); `suspended`/`archived` исключены — неоплата и офбординг останавливают рассылки.
4. **Комиссия без строк в БД — пустая, а не демо-состав:** пустая комиссия — честное состояние нового центра; состав заводится мастером онбординга (ФТ-D2.3, Task 7).

**Тесты:** `tenant.service.test.ts` переписан (1 → 9: без БД каждая ручка — 503; с БД — строка как есть включая `trial`, отсутствующий тенант — `tenant_not_found`; SQL `listActiveTenantIds` включает `trial`+`active` и не включает `suspended`/`archived`); `migrations.0072.test.ts` — 4 (CHECK ровно на четыре статуса, fail-closed нормализация, порядок UPDATE→CONSTRAINT, транзакция/идемпотентность). `pnpm test:migrations` 51. Указатель миграций в CLAUDE.md → `0072`.

### 5.228 Фаза 4 Task 3 (срез 1) — платформенная админка тенантов: API (ФТ-D2.2)

**Ветка:** `feat/2026-07-31-tz-faza4-platform-admin` (после §5.227/PR #376).

**Что сделано:**

1. **Новый модуль `platform`** (`platform-tenants.{service,controller,dto}.ts` + `platform.module.ts`, зарегистрирован в `app.module.ts`): `GET /platform/tenants` (кросс-тенантный список), `POST /platform/tenants` (создание, статус по умолчанию `trial`), `PATCH /platform/tenants/:id/status`. Это единственный контур, которому положено видеть все тенанты.
2. **Права `platform.tenants.read|write` (миграция `0073`) выданы ТОЛЬКО роли `platform_admin`.** Сид `0010` когда-то раздал tenant_admin все права скопом — повторить это здесь означало бы дать каждому арендатору админку всех остальных. HTTP-граница закреплена: полный набор «своих» прав арендатора (`tenant.read`+`counterparties.read`+`learners.read`+`iam.manage_roles`) → 403.
3. **Создание тенанта — один атомарный SQL (CTE):** тенант + клон ролей тенанта платформы + их права. Атомарность нужна, чтобы сбой между запросами не оставил тенант без ролей (в него нельзя было бы войти). **`platform_admin` не клонируется** — платформенная роль существует только у владельца платформы. Шаблон ролей — тенант АКТОРА (без зашитого `tenant_demo`). Дубль кода → 409 `tenant_code_taken`.
4. **Аудит `writeCritical`** на создание (`platform.tenant_created`, пишется в аудит НОВОГО тенанта — его журнал должен начинаться с факта создания) и смену статуса (`platform.tenant_status_changed`, old/new): suspended отключает арендатора, по журналу должно быть видно, кто и когда.
5. Без БД — та же честная 503 `tenant_store_unavailable`, что и в ФТ-D2.1 (§5.227).

**Сознательно не сделано (остаток Task 3):** вход «от имени» (impersonation) с обязательным аудитом — срез 2 (нужна выдача сессии в auth-контуре); экраны платформенной админки — срез 3.

**Тесты:** `platform-tenants.service.test.ts` 6 (список, 503 без БД, дефолт trial + клон ролей без platform_admin + аудит, 409 на дубль кода, смена статуса с old/new, 404), `platform-tenants.dto-validation.test.ts` 5 (код только `[a-z0-9-]` — он попадает в URL, статусы вне жизненного цикла отбиваются), `migrations.0073.test.ts` 3, HTTP-граница +2 (101 в файле). Полный `pnpm ci:check` exit 0: бэкенд **2775** (+16), фронт 792. По дороге дважды ловились флейки полного прогона (таймаут vitest-воркера на `eisot-testing-export.dto-validation`, 45s-таймауты `auth.controller.contract` + `mvp.domains.http` под CPU-нагрузкой) — изолированные прогоны зелёные, повторный полный — зелёный; класс сбоев описан в CLAUDE.md Gotchas.

### 5.229 Фаза 4 Task 3 (срез 2) — вход «от имени» с аудитом до выдачи сессии (ФТ-D2.2)

**Ветка:** `feat/2026-07-31-tz-faza4-impersonation` (после §5.228/PR #377).

**Что сделано:**

1. **`POST /platform/tenants/:id/impersonate`** — вход «от имени» для поддержки платформы. Отдельное право `platform.impersonate` (миграция `0074`): видеть список арендаторов и входить в их кабинеты — разные полномочия; `platform.tenants.write` НЕ открывает имперсонацию (закреплено HTTP-тестом).
2. **Аудит `writeCritical` пишется ДО выдачи сессии** (`platform.impersonation_started` в журнал ЦЕЛЕВОГО тенанта, с `platformActorId`/`platformTenantId`/IP/user-agent): сбой журнала отменяет вход. Осознанная асимметрия — падение после записи оставит след без сессии; лучше след без входа, чем вход без следа. Закреплено тестом порядка вызовов.
3. **`AuthService.issueImpersonatedSession(tenantId, userId)`** — выдаёт обычную сессию целевого пользователя (роли/права цели, обычный refresh-цикл). **TOTP цели сознательно не проходится:** личность актора уже подтверждена его собственной платформенной сессией (включая его 2FA), а второй фактор чужого пользователя поддержке недоступен по определению. Заблокированный пользователь — отказ: имперсонация не обходит блокировку.
4. **Цель по умолчанию — активный `tenant_admin` арендатора** (поддержка входит «как администратор центра»); конкретного сотрудника указывают явно в теле запроса. Нет активного администратора и цель не указана — понятная ошибка `impersonation_target_not_found`.
5. **Архивный тенант — отказ** (`tenant_archived`): офбординг замораживает кабинет даже для поддержки.

**Тесты:** `platform-impersonation.service.test.ts` 6 (порядок «аудит → сессия», сбой журнала отменяет вход, приоритет явной цели, отказ по архиву, 404, нет цели), `auth.service.test.ts` +2 (сессия с ролями цели; заблокированный — 401), `migrations.0074.test.ts` 3, HTTP-граница +2 (103 в файле). Харнес среза 1 дополнен третьим аргументом конструктора (AuthService).

### 5.230 Фаза 4 Task 3 (срез 3) — экраны платформенной админки + cookie у impersonate (ФТ-D2.2)

**Ветка:** `feat/2026-08-03-tz-faza4-platform-admin-ui` (после §5.229/PR #378). **Task 3 закрыт целиком.**

**Что сделано:**

1. **`POST /platform/tenants/:id/impersonate` теперь ставит refresh+csrf cookie, как `/auth/login`, и не возвращает `refreshToken` в теле** (`authCookie.attachRefreshAndCsrfCookies` + `toPublicTokens`). Без этого сессия «от имени» из UI жила бы только TTL access-токена (15 мин) и не переживала перезагрузку страницы, а refresh-токен светился бы в JSON — у логина он ходит только cookie.
2. **Экран `/platform/tenants`** (`features/platform-tenants/`): список арендаторов (код/название/статус), создание (валидация кода той же маской, что DTO сервера), переводы статусов, «Войти от имени» с confirm-предупреждением про аудит. Переходы статусов UI сужает до осмысленных (`nextStatusOptions`: из архива — только в приостановленные), сервер по-прежнему принимает любые валидные — это презентация, не бизнес-правило. Кнопки скрываются по правам сессии (`platform.tenants.write` / `platform.impersonate`).
3. **Переключение сессии:** `hydrateImpersonatedSession` собирает `UserSession` цели — `/auth/me` и роли запрашиваются с ЯВНЫМ `x-tenant-id` цели (дефолтный заголовок клиента указывает на тенант платформы — TenantGuard ответил бы `tenant_header_mismatch`); `sessionManager.adopt` + `adoptSession` в AuthContext делают её текущей, редирект на `/`. Возврат в платформенную админку — обычный выход и вход (осознанно: две живые сессии в одной вкладке — это две правды о «текущем пользователе»).
4. **Маршрут и меню:** `routeMeta` `/platform/tenants` под `platform.tenants.read`, пункт «Арендаторы платформы» в блоке «Настройки и система» (`navSlot: 'more'`) — у админов центров права нет, пункт скрыт.
5. **Живой прогон** (бэкенд из worktree на dev-базе): логин `platform_admin` → список → impersonate: `Set-Cookie` оба стоят, в теле только публичные поля токенов, выданный токен работает в целевом кабинете (`/auth/me` → `tenant_admin`, 75 прав).

**Тесты:** бэкенд +2 (`platform-tenants.controller.test.ts`: cookie ставятся; refreshToken/csrfToken в теле нет) → **2791**; фронт +8 (`api.contract.test.ts`: статусы = CHECK 0072, конверт, PATCH статуса, credentials у impersonate, hydrate с явным тенантом цели) → **800**. `ci:check` exit 0.

**Остаток Task 3:** нет — срезы 1–3 закрыты. **Дальше:** Task 4 — ФТ-D3.1 тема тенанта (white-label).

### 5.231 Фаза 4 Task 4 — white-label: тема тенанта, бренд в письмах и на публичной проверке (ФТ-D3.1)

**Ветка:** `feat/2026-08-03-tz-faza4-whitelabel` (после §5.230/PR #380). **Task 4 закрыт** (кроме D3.2 — поддомены, это Task 8 плана).

**Что сделано:**

1. **Хранение:** бренд (`displayName`/`logoUrl`/`brandColor`/`accentColor`) в `org.tenant_settings.payload.branding`. Чистый модуль `tenant-branding.ts`: чтение ТЕРПИМОЕ (каждое кривое поле отбрасывается независимо — мусор в payload не ломает вёрстку, требование плана), запись СТРОГАЯ (`PUT /tenant/branding` → 400 `invalid_branding` с перечнем полей; пустая строка = сброс поля). Право `tenant.branding.configure` (миграция `0075`, только platform_admin/tenant_admin); чтение `GET /tenant/branding` — любому пользователю тенанта (тема красится каждому).
2. **Тема поверх токенов ui:** пакет `ui` остаётся бренд-нейтральным — фронтовая обёртка `TenantBrandingProvider` (в providers, внутри AuthProvider) перекрывает CSS-переменные `--ui-brand-600/700`, `--ui-accent-600/700` для поддерева; ховер-оттенок считается затемнением (`darkenHexColor`), второй цвет у админа не спрашивается. Шапка: логотип + `resolveWordmark` (имя бренда → «trudskill»). Настройка — секция «Бренд центра» в `/settings` (color-пикеры, сама скрывается без права).
3. **Письма:** подпись «С уважением, учебный центр.» во всех 7 шаблонах заменена на `{{tenantName}}`; диспетчер ВСЕГДА подставляет значение (бренд → имя тенанта → «учебный центр»), потому что `renderTemplate` превращает незаполненную переменную в пустоту («С уважением, .»). `TenantService` в диспетчере — `@Optional` (тесты собирают его четырьмя аргументами), сбой чтения не валит отправку, явно переданный `tenantName` уважается. `CommunicationModule` импортирует `TenantModule`.
4. **Публичная проверка:** `PublicVerifyResult` + `issuerName`/`issuerLogoUrl`/`issuerBrandColor`; контроллер резолвит бренд по `tenantId` документа, сбой чтения бренда не валит проверку, изъятый (archived → not_found) документ центра НЕ называет. Тест «PII protection» осознанно обновлён: issuerName — имя организации, не ПДн слушателя, с ФТ-D3.1 оно публично по требованию ТЗ (tenantId по-прежнему скрыт). Страница `/verify/[token]` показывает логотип и имя центра.

**Грабли (вскрыты живым прогоном):**

- `org.tenant_settings.id` — PK БЕЗ default: INSERT без id падает not-null. В `updateSettings` тот же латентный дефект (прячется, потому что сид-строка уже существует и upsert всегда идёт веткой UPDATE). Branding-upsert пишет `id = concat('tenant_settings_', tenant_id)`.
- Обёртка `useQuery` проекта не принимает `staleTime`/`retry` (свой суженный тип `QueryOptions`).

**Живой прогон** (бэкенд из worktree, миграция 0075 применилась на старте): PUT→GET цикл с нормализацией цвета, мусорный цвет → 400, сброс пустой строкой, learner: PUT 403 / GET 200. Публичная проверка вживую не гонялась — в dev `DOCUMENTS_PERSISTENCE_DRIVER=memory`, выпущенных документов нет; состыковка покрыта юнит-тестами, живая проверка — на стенде (там postgres).

**Тесты:** бэкенд +20 (branding pure 11, controller 3, dispatcher 3, public-verify 3) → **2811**; фронт +8 (theme pure 6, api contract 2) → **808**. `ci:check` exit 0.

**Дальше:** Task 5 — ФТ-D4 тарифы, лимиты, экран «Использование».

### 5.232 Фаза 4 Task 5 — тарифы, лимиты, экран «Использование» (ФТ-D4)

**Ветка:** `feat/2026-08-04-tz-faza4-tariffs` (после §5.231/PR #381). **Task 5 закрыт.**

**Что сделано:**

1. **Сущности (миграция `0076`):** `core.plans` (лимиты: слушатели/мес, сотрудники, хранилище в байтах — null = безлимит; флаги proctoring/scorm/api/webinars в jsonb `features`) и `core.tenant_subscriptions` (одна АКТИВНАЯ подписка на тенанта — частичный unique; отменённые копятся историей). Отдельной таблицы UsageCounter НЕТ намеренно: счётчики считаются запросами по типизированным таблицам (0016) — счётчик, который можно пересчитать, не разъезжается с реальностью.
2. **Платформенные ручки** (`PlatformPlansService`/`PlatformPlansController`): GET/POST `/platform/plans`, POST `/platform/tenants/:id/plan` — под `platform.tenants.*` (тарифы = часть управления арендаторами, отдельного права нет намеренно). Назначение отменяет прежнюю подписку и пишет аудит в журнал ЦЕЛЕВОГО тенанта (`platform.plan_assigned`).
3. **`TenantUsageService` + GET `/tenant/usage`** (право `tenant.usage.read`, 0076, только администрация): активные слушатели в месяце (незавершённые зачисления + завершившие в текущем календарном месяце; отменённые не считаются), сотрудники (активные пользователи с НЕ-слушательской ролью), хранилище (переиспользован `TenantStorageService`; **лимит тарифа главнее ручного ключа** — ФТ-B1.3 оговаривал ручной лимит как временный до тарифов).
4. **Мягкая деградация (D4.2):** гейт `assertCanAddLearners` на границе API создания слушателей (`POST /learners`, `POST /learners/bulk-import`) — при исчерпанном лимите 409 `learner_limit_reached`; на путях прохождения курса проверок НЕТ — идущие группы учатся при любом использовании. Для пачки гейт стоит ДО импорта: осознанно допускаем перелёт внутри одной пачки (частичный отказ посреди Excel хуже).
5. **Экран «Использование» (`/admin/usage`)**: тариф + три метрики с прогресс-барами; предупреждения от `usageLevel`: 80% warning, 95% critical, 100% «исчерпано» с текстом мягкой деградации. **Платформенная админка**: секция «Тарифы платформы» (список+создание, ГБ вместо байтов в форме) и назначение тарифа арендатору из списка.

**Грабли:**

- pg отдаёт bigint СТРОКОЙ (`storageLimitBytes='1073741824'`) — вскрыто живым прогоном; лимиты нормализуются `normalizePlan` в сервисе.
- `mvp.domains.http.integration.test.ts` собирает НАСТОЯЩИЙ MvpController — новая зависимость контроллера требует провайдера-заглушки в этом тесте (известная грабля CLAUDE.md, воспроизвелась).

**Живой прогон** (worktree-бэкенд, миграция 0076 на живом Postgres): создание тарифа (лишнее поле → 400 whitelist), список, назначение tenant_demo, `/tenant/usage` глазами tenant_admin (тариф+счётчики: staff=4 честно посчитан из iam), learner → 403. Тестовые строки из dev-базы убраны.

**Тесты:** бэкенд +19 (plans 6, usage 6, миграция 4, HTTP-границы 3) → **2830**; фронт +13 (usage helpers/contract 5, контракты платформы) → **813**. `ci:check` exit 0.

**Дальше:** Task 6 — ФТ-D5.1 шов биллинга аренды + «счёт и акт».

### 5.233 Фаза 4 Task 6 — биллинг аренды: шов, «счёт+акт», приостановка за неоплату (ФТ-D5.1)

**Ветка:** `feat/2026-08-04-tz-faza4-billing` (после §5.232/PR #382). **Task 6 закрыт.**

**Что сделано:**

1. **Сущности (миграция `0077`):** `core.rental_invoices` (номер уникален на платформе, суммы целыми копейками с CHECK ≥ 0, период с CHECK «конец ≥ начала», статусы issued/paid/cancelled, `due_at`) + `core.plans.grace_working_days` (default 10). **D5.3 соблюдено:** ни одной ссылки на `payments` — у аренды другой плательщик, получатель и последствия неоплаты. **Grace живёт в ТАРИФЕ, а не в `tenant_settings`:** настройки тенанта правит сам арендатор через `PUT /tenant/settings` — он продлил бы себе отсрочку сам.
2. **Шов `RentalBillingProvider`** (по форме `SmsProvider`): `manual` — рабочий по умолчанию (решение вопроса №3), печатает счёт HTML → Gotenberg → PDF тем же конвертером, что личное дело (§5.213); бланк владельца НЕ нужен — у счёта нет регулируемой формы. `noop` — спящий. `yookassa` — место под второй адаптер, а не переделка модели. Сбой печати возвращает `null`: счёт уже выставлен, обязательство платить не зависит от PDF.
3. **Grace в РАБОЧИХ днях** (`addWorkingDays`/`isGraceExpired`): календарные дали бы центру со сроком в пятницу на два дня меньше. Производственный календарь РФ сознательно не подключён — праздники дают арендатору несколько ЛИШНИХ дней, ошибка в его пользу терпима, в нашу — нет. В последний день grace кабинет ещё живёт.
4. **Приостановка за неоплату:** `suspendOverdueTenants` + ежедневный `@Cron('15 3 * * *')` с advisory-локом `528_494` (раннее утро UTC — до рабочего дня в РФ). Трогает только `active`/`trial`; оплаченные счета в выборку не попадают вовсе. Каждая приостановка — `platform.tenant_suspended_for_nonpayment` в аудите с номером счёта и сроком.
5. **Ручки и UI:** `GET/POST /platform/rental-invoices`, `POST …/:id/paid` (под `platform.tenants.*`), `GET …/:id/pdf`, `GET /tenant/rental-invoices` — свои счета арендатору под `tenant.usage.read`. Секция «Счета аренды» в платформенной админке: список с подсветкой просрочки, выставление (рубли → копейки), отметка оплаты.

**Грабли (вскрыты живым прогоном):**

- **Кириллица в HTTP-заголовке валит ответ** (`ERR_INVALID_CHAR`): первая версия клала имя файла счёта в `x-invoice-document`, и счёт с номером «ЖИВОЙ-1» создавался, но ответ падал 500. Тот же класс, что кириллический realm basic-auth. Лечение: флаг `documentReady` в ТЕЛЕ + отдельная ручка PDF; в `Content-Disposition` имя ASCII + RFC 5987.
- **`toLocaleString('ru-RU')` в денежном документе** — зависит от сборки ICU (на small-icu молча даёт формат en-US «15,000.00» в рублёвом счёте) и вставляет неразрывный пробел. Группировка разрядов сделана вручную, тот же формат зеркалит фронт.

**Живой прогон** (миграция 0077 на живом Postgres, Gotenberg по IP контейнера): счёт с кириллическим номером выставлен, `documentReady: true`, PDF скачан (22 КБ, `%PDF-1.4`, встроен DejaVuSans → кириллица не превратится в кракозябры), `Content-Disposition` с RFC 5987; отметка оплаты и её идемпотентность; SQL обхода просрочки проверен на реальной схеме. Тестовые строки из dev-базы убраны.

**Тесты:** бэкенд +31 (grace-утилита 8, сервис счетов 10, печатная форма 6, миграция 5, HTTP-границы 2) → **2861**; фронт +5 (счета: формат денег, разбор рублей, просрочка) → **818**. `ci:check` exit 0.

**Дальше:** Task 7 — ФТ-D2.3 мастер онбординга учебного центра.

### 5.234 Фаза 4 Task 7 — мастер онбординга учебного центра (ФТ-D2.3)

**Ветка:** `feat/2026-08-04-tz-faza4-onboarding` (после §5.233/PR #383). **Task 7 закрыт.**

**Ключевое решение: прогресс НЕ хранится флагами, а вычисляется из реальных данных.** Флаг «шаг пройден» разъезжается с действительностью в обе стороны: администратор заполнил реквизиты обычным экраном — мастер по-прежнему их требует; лицензию удалили — мастер считает её заведённой. Здесь каждый из шести шагов спрашивает «это уже есть?». Следствие: требование плана «незавершённый мастер можно продолжить» выполняется по построению — терять нечего, состояние живёт в данных, а не в сессии; продолжение работает и после смены администратора, браузера и компьютера.

**Что сделано:**

1. **`TenantOnboardingService`** (`GET /tenant/onboarding`, право `tenant.read`): шесть шагов — реквизиты, лицензия, бренд, комиссия, шаблон, курс; `doneCount`/`nextStepId`/`ready`. Реквизиты закрыты только когда есть И название, И ИНН (пустая строка в NOT NULL-колонке — это «строку создали», а не «внесли»); бренд — по любому осмысленному элементу; лицензия — только `active`.
2. **Экран `/onboarding`**: полоса готовности, «продолжить с шага…», чек-лист со ссылками на НАСТОЯЩИЕ экраны. Мастер сознательно НЕ дублирует формы — иначе появилось бы два места ввода одних реквизитов; шаг без права показывает, какого доступа не хватает. Незакрытые шаги идут первыми: экран открывают, чтобы понять, что осталось.

**Грабли (вскрыты живым прогоном и сторожевыми тестами):**

- **Курсы и комиссии живут НЕ в `learning.courses`/`learning.commissions`,** а в снимке состояния MVP (`mvp_runtime_documents`), шаблоны — в снимке документов. Первая версия считала `count(*)` по типизированным таблицам и получала бы ноль ВСЕГДА — шаги не закрылись бы никогда. Переписано на штатные `MvpTenantRunner.runWithTenantState` и чтение снимка документов; тест это фиксирует (единственный SQL в сервисе — про лицензии).
- Сервис пришлось перенести из `TenantModule` в `MvpModule`: `DocumentsModule`/`MvpModule` уже импортируют `TenantModule`, и обратная зависимость дала бы цикл. Прецедент — `TenantUsageService` в `mvp/usage/` (§5.232).
- `DOCUMENTS_PERSISTENCE_BACKEND` добавлен в экспорты `DocumentsModule` для ЧИТАЮЩИХ потребителей: `DocumentsTenantRunner` всегда пишет снимок обратно, а подсчёту записывать нечего.
- Сторожевой тест DI (`app.module.di.test.ts`, §5.230) поймал недостающий экспорт до мерджа — ровно то, ради чего он писался.

**Живой прогон:** статус demo-центра «готово 1/6, следующий — лицензия» (реквизиты «ООО Демо Академия» подхвачены из реальных данных); после `PUT /tenant/branding` обычным экраном шаг `branding` закрылся САМ — «готово 2/6», без каких-либо отметок. Dev-база возвращена в исходное состояние.

**Тесты:** бэкенд +10 (онбординг: пустой центр, данные из других экранов, пустые реквизиты, чтение через раннеры, шаблоны без сохранения, бренд, порядок шагов, готовность, устойчивость к сбою источника, только активные лицензии) → **2871**; фронт +5 (шаги ведут на СУЩЕСТВУЮЩИЕ маршруты — сверка с `routeMeta`, процент, порядок показа, контракт) → **823**. `ci:check` exit 0.

**Дальше:** Task 8 — ФТ-D3.2 резолв тенанта по Host (код без DNS).

### 5.235 Фаза 4 Task 8 — арендатор по адресу сайта (ФТ-D3.2)

**Ветка:** `feat/2026-08-04-tz-faza4-host-resolve` (после §5.234/PR #384). **Task 8 закрыт в части КОДА;** DNS-запись и wildcard-сертификат — за владельцем (вопрос №5).

**Что сделано:**

1. **Чистый резолвер `resolveTenantHost(host, baseDomain)`** → `tenant` / `base` / `foreign`. Отдельно разобраны: порт и регистр, `www` (витрина платформы, а не арендатор с кодом «www»), локальная разработка и заход по IP, многоуровневые поддомены, маска кода — та же, что в DTO создания тенанта. **Защита от подделки:** `lms.example.ru.evil.com` и `xlms.example.ru` — чужие (проверка идёт по `.base`, а не по подстроке).
2. **`middleware.ts`:** код арендатора кладётся в cookie (НЕ HttpOnly — это подсказка клиенту, а не секрет; настоящая проверка живёт в `TenantGuard`). Чужой домен → `rewrite` на `/tenant-not-found` — **rewrite, а не redirect**: адрес остаётся в строке браузера, человек видит, по какому имени пришёл. Уход с поддомена на базовый домен стирает cookie, иначе прежняя подсказка врала бы.
3. **Публичная ручка `GET /public/tenants/by-code/:code`** — недостающее звено: из адреса приходит КОД (`demo`), а вход ждёт ИДЕНТИФИКАТОР (`tenant_demo`); без сопоставления резолв был бы украшением. Rate-limit 30/мин (ФТ-G2, `@Throttle` + обязательный `@UseGuards(ThrottlerGuard)`). **Архивный арендатор не отдаётся вовсе** (офбординг = центра больше нет, подтверждать посторонним «он тут был» незачем), приостановленный отдаётся со статусом — его слушателям нужна причина отказа. Мусорный код отвергается маской ДО обращения к базе.
4. **Клиент:** `resolveCurrentTenantId()` — cookie → идентификатор (с запоминанием на вкладку), любой сбой резолва откатывается к настройке `NEXT_PUBLIC_DEFAULT_TENANT_ID`: невозможность спросить сервер про поддомен не должна закрывать вход по основному адресу. Вход (`/auth/login`) теперь идёт в тот центр, чей адрес открыт.
5. **Настройка `NEXT_PUBLIC_TENANT_BASE_DOMAIN`** со значением по умолчанию `''`: пока домен не задан, всё работает ровно как раньше (режим одного арендатора) — **выкладка кода не ждёт DNS и сертификата**.

**Гейт изоляции сработал как задумано:** новый публичный контроллер без `TenantGuard` был отвергнут сторожевым тестом и внесён в белый список с обоснованием — ровно то, ради чего гейт писался (§5.199).

**Живой прогон:** `by-code/demo` без авторизации → `tenant_demo` (200); несуществующий → 404; попытка внедрения `' or 1=1--` → 404 (отбита маской до базы); rate-limit: 27 успешных, дальше 429. **Ключевое решение проверено сквозным сценарием:** создан центр `hosttest` → резолвится (200) → переведён в архив → 404, факт существования не раскрывается. Тестовый арендатор полностью удалён из dev-базы.

**Тесты:** бэкенд **2876** (+5: публичный резолв — код→id, архив скрыт, приостановленный со статусом, мусор до базы, параметризованный SQL) + белый список изоляции; фронт **838** (+15: резолвер 9, текущий арендатор 6). `ci:check` exit 0.

**Остаток за владельцем (вопрос №5):** DNS-запись `*.<домен>` и wildcard-сертификат; после них достаточно задать `NEXT_PUBLIC_TENANT_BASE_DOMAIN` — код уже готов.

**Дальше:** Task 9 — ФТ-E4 переобучение (правила per программа + дашборд «истекающие»).

### 5.236 Фаза 4 Task 9 — переобучение: окна 60/30/7, периодичность программы, дашборд (ФТ-E4)

**Ветка:** `feat/2026-08-04-tz-faza4-recert` (после §5.235/PR #385). **Task 9 закрыт.**

**Что сделано:**

1. **Окна напоминаний приведены к ТЗ: 90/30/7 → 60/30/7.** Расхождение тянулось с Фазы 5B. Горизонт скана (`RECERT_HORIZON_DAYS`) синхронно опущен с 90 до 60 и **связан с самым дальним окном тестом**: шире окна — документ попадает в скан, но письма не заслуживает (лишняя работа каждую ночь); уже — письмо за 60 дней никогда не уйдёт.
2. **НАХОДКА: те же окна использовал сканер лицензии САМОГО учебного центра.** Правка общей константы молча сузила бы предупреждение о просрочке лицензии — а это несопоставимо более дорогой сбой: просроченное удостоверение слушателя означает «пора на курс», отозванная лицензия останавливает выдачу документов вообще, и продлевается она месяцами. Заведена отдельная `LICENSE_EXPIRY_MILESTONES = [7, 30, 90]`; тест фиксирует, что наборы РАЗНЫЕ намеренно.
3. **Периодичность переобучения per программа с пресетами.** Поле `recertificationPeriodMonths` в данных существовало и уже определяло `validUntil` при выдаче, но **центр не мог задать его из интерфейса** — теперь оно есть в мастере курса с пресетами «3 года (ОТ, ПБ)» / «1 год (электробезопасность, медицина)» / «Бессрочно». Пустое поле = бессрочно (осмысленный вариант, не пропуск); мусор даёт понятную ошибку шага, а не молчаливое «бессрочно». **Попутно вскрыто:** в контракте фронта (`ProgramMetaPatch`) поля не было — значение из мастера потерялось бы по дороге.
4. **Дашборд «истекающие удостоверения»** (`GET /recertification/expiring`, право `recertification.read`, секция рядом с очередью переаттестации — это две стороны одной работы). **Просроченные показываются НАРАВНЕ с истекающими и первыми:** срок, вышедший вчера, — самая срочная строка, а не архив (поэтому фильтр не «между сегодня и горизонтом»). Отозванные, архивные и бессрочные исключены — продлевать нечего. Группы срочности повторяют окна напоминаний: просрочено / неделя / месяц / два месяца.

**Живой прогон:** дашборд отвечает, горизонт **60** (изменение видно вживую), сводка по группам считается; ручной скан переобучения проходит; слушатель на дашборде — **403**.

**Тесты:** бэкенд **2886** (+10: истекающие 7, окна и их разделение 3); фронт **849** (+11 (склонение дней, формулировки сроков, пресеты, разбор периодичности, контракт, три теста мастера). `ci:check` exit 0.

**Дальше:** Task 10 — ФТ-D6 библиотека курсов платформы.

### 5.237 Фаза 4 Task 10 — библиотека курсов платформы (ФТ-D6)

**Ветка:** `feat/2026-08-04-tz-faza4-library` (после §5.236/PR #386). **Task 10 закрыт.**

**Главное решение: ссылки на файлы, видео и SCORM-пакеты НЕ переносятся между центрами.** Эти объекты лежат в хранилище центра-источника и привязаны к его арендатору; скопировать ссылку значило бы дать чужому центру путь к чужому файлу — ровно та утечка, которую ловит гейт изоляции. Поэтому материал-файл приезжает ЗАГОТОВКОЙ: структура, название и правила зачёта сохранены, тип меняется на текстовый (тип «файл» без файла выглядел бы рабочим и ломался бы при открытии слушателем), в названии — «(требуется загрузить материал)». Текст и внешние ссылки переносятся целиком. Число заготовок видно в каталоге ДО копирования.

**Что сделано:**

1. **Миграция `0078`:** `core.platform_library_courses` — каталог хранит СНИМОК содержимого (`content` jsonb), а не ссылку на курс арендатора: снимок не ломается при правке или архивации источника и копируется воспроизводимо. «Подписка с обновлениями» (ТЗ, позже) ляжет поверх версионированием снимка. Право `library.publish` — только платформе.
2. **Чистые функции** `buildLibrarySnapshot` / `buildCopyPlan`: снимок берёт ПОСЛЕДНЮЮ версию курса, отбрасывает арендаторские поля меты (комиссия и бланк программы — свои у каждого центра) и не содержит ни одного идентификатора источника (закреплено тестом). При копировании занятый код курса получает суффикс: коллизия кодов ломает выдачу документов, а молча перезаписать чужой курс недопустимо.
3. **Ручки:** `GET /library/courses` и `POST /library/courses/:id/copy` — центру (право `courses.read` / `courses.write`: копия появляется в его собственных курсах, это его обычная работа); `POST/DELETE /platform/library/courses` — платформе (`library.publish`). Экран «Библиотека курсов» рядом с курсами.

**Грабли:**

- Приведение `as never` в вызовах `createModule`/`createMaterial` скрывало, что у DTO **нет поля `sortOrder`** — порядок задаёт сам сервис по очереди создания. Casts убраны, тип материала копии сужен до реально возможного (`'text' | 'external_url'`).
- В тесте один и тот же объект `Response` переиспользовался для двух вызовов — тело читается ОДИН раз, второй вызов падал на контракте конверта. Каждому вызову свой ответ.
- Сторожевой тест навигации поймал «сироту»: пункт меню, не принадлежащий ни одному блоку.

**Живой прогон:** создан курс-источник с текстовым материалом и файлом (`fileId: file_source_secret`) → опубликован в каталог → **в снимке нет ни ссылки на файл, ни идентификаторов источника**; копирование дало курс с кодом `LIB-TEST-2` (исходный не перезаписан), СВОИМ модулем, перенесённой метой (40 часов, переобучение 36 мес) и материалом-заготовкой **без ссылки на чужой файл**. Каталог и dev-база прибраны.

**Тесты:** бэкенд **2903** (+17: снимок и копия 10, миграция 5, HTTP-границы 2); фронт **854** (+5). `ci:check` exit 0.

**Дальше:** Task 11 — ФТ-D7 здоровье тенантов.

### 5.238 Фаза 4 Task 11 — здоровье арендаторов (ФТ-D7)

**Ветка:** `feat/2026-08-04-tz-faza4-health` (после §5.237/PR #387 и пакета обновлений #438–#449). **Task 11 закрыт.**

**Что сделано:** `GET /platform/health/tenants` (право `platform.tenants.read`) + секция «Здоровье арендаторов» в платформенной админке. По каждому центру: задачи выпуска документов (в работе / отказы), задания обмена, сообщения в карантине, отказавшие выгрузки в реестры, время последней выгрузки и последней активности. Отдельно — общая очередь событий платформы (`core.outbox_events` не привязана к арендатору, показана как платформенный показатель, а не размазана по центрам).

**Ключевые решения:**

1. **Это единственное место, где чтение НАМЕРЕННО идёт сквозь тенанты — и потому отдаёт ТОЛЬКО агрегаты.** Ни ФИО, ни номеров документов, ни текстов ошибок: владелец платформы должен видеть, что у центра встала очередь, но не то, что в этой очереди. Два теста это стерегут — по форме ответа и по тексту SQL (запрещены `payload`, `last_error`, `body`).
2. **Очередь сама по себе — НЕ поломка.** Задачи разбираются постоянно, «в работе 5 штук» это норма; тревога только по фактическим отказам. Иначе экран горел бы красным всегда и его перестали бы читать.
3. **Весь экран — ДВА запроса** (агрегаты через `left join lateral` + очередь платформы), а не обход тенантов по одному; закреплено тестом на число вызовов.

**Грабли:**

- **Мой недосмотр в PR #447 (ESLint 10):** `eslint-plugin-import@2.32` поддерживает ESLint максимум 9-й и на 10-м падает `sourceCode.getTokenOrCommentBefore is not a function` — но ТОЛЬКО когда правилу нужно ИСПРАВИТЬ порядок импортов, поэтому при миграции не всплыло. Всплыло здесь, на первом же новом файле. Лечение: переход на поддерживаемый форк `eslint-plugin-import-x@4.17` (заявляет ESLint ^10). Проверено намеренной поломкой порядка импортов: правило теперь сообщает об ошибке и чинит её, а не падает.
- `::text` у timestamptz отдаёт формат Postgres (`2026-08-04 21:16:20+00`), а не ISO — фронт показал бы прочерк. Заменено на `to_json(...)#>>'{}'`, проверено вживую: `2026-08-04T21:16:58.935+00:00`.

**Живой прогон:** экран отдаёт состояние demo-центра с реальной отметкой активности из журнала; в ответе только агрегатные поля; администратор центра — **403**.

**Тесты:** бэкенд **2911** (+8), фронт **862** (+8). `ci:check` exit 0.

**Дальше:** Task 12 — ФТ-G6 контур 152-ФЗ (выгрузка и удаление данных слушателя, обезличивание логов, restore-drill).

### 5.239 Фаза 4 Task 12 — контур 152-ФЗ: права субъекта персональных данных (ФТ-G6)

**Ветка:** `feat/2026-08-04-tz-faza4-152fz` (после §5.238/PR #451). **Task 12 закрыт в части кода; restore-drill — за владельцем (см. ниже).**

**Что сделано:**

1. **Выгрузка ПДн** — `GET /learners/:id/personal-data`, право `learners.pii.manage` (миграция `0079`). Машиночитаемый JSON: карточка целиком, зачисления, попытки экзаменов, выданные документы, записи идентификации и сессии прокторинга.
2. **Обезличивание по отзыву согласия** — `POST /learners/:id/personal-data/erasure`. Стирает опознающие поля карточки, снимает привязку к учётной записи, немедленно удаляет биометрию (селфи/паспорт, чанки прокторинга). Возвращает отчёт: что стёрто и что СОХРАНЕНО с основанием.
3. **Обезличивание журналов** — `redaction.util.ts` расширен: до этой правки редактировались только секреты и контакты, а ФИО, СНИЛС, дата рождения и паспорт уходили в журнал **открытым текстом**.
4. **Экран** — панель «Персональные данные (152-ФЗ)» в карточке слушателя: скрыта целиком без права, обезличивание требует набрать слово-подтверждение.

**Ключевые решения:**

1. **Обезличивание, а не удаление — и это требование закона, а не упрощение.** Обработка ПДн в удостоверениях и протоколах идёт по основанию «исполнение обязанности, установленной законодательством» (152-ФЗ ст. 6 ч. 1 п. 2), а не по согласию, поэтому отзыв согласия её не прекращает. Стереть ФИО из удостоверения значит лишить самого слушателя подтверждения пройденного обучения и сломать проверку документа по QR. Поэтому: карточка, контакты, СНИЛС, дата рождения и биометрия — стираются; факт обучения, зачисления, результаты и документы — остаются. Отчёт перечисляет и то, и другое с основанием, чтобы администратору было чем ответить заявителю.
2. **`POST .../erasure`, а не `DELETE .../personal-data`.** DELETE обещает удаление; ручка его не выполняет. Имя метода не должно врать о том, что произошло.
3. **Отдельное право `learners.pii.manage`, не `learners.write`.** Вести карточки — ежедневная работа методиста; выгружать досье целиком и стирать ПДн по заявлению субъекта — полномочие администрации. В миграции право выдано только `platform_admin` и `tenant_admin`.
4. **Биометрия отзывается сразу, не дожидаясь срока хранения (90 дней).** Снимок лица опознаёт человека сам по себе — держать его после отзыва согласия нельзя.
5. **Снимки в выгрузку НЕ вкладываются** — только метаданные и признак «файлы есть». Отдать биометрию по HTTP значило бы создать ещё одну её копию там, где раньше копии не было.
6. **В журнал пишутся ИМЕНА стёртых полей, но не значения** — иначе стёртые ПДн осели бы в аудите, то есть операция отменила бы саму себя.

**Грабли:**

- **`Enrollment` не имеет `courseId`** — слушателя зачисляют в ГРУППУ, а курсы висят на ней (`GroupCourse`). Первая версия выгрузки собиралась с `courseId`, компилятор поймал.
- **`snilsHash` в состоянии не живёт**: слепой индекс считается при записи в БД и срезается при чтении (`pii-crypto.ts`). В списке стираемых полей он всё равно оставлен — сам индекс пересчитывается из `snils`, который теперь пуст, но молчаливо уцелевший идентификатор был бы хуже лишней строки кода.
- **Компонентных тестов React в проекте нет вовсе** (ни одного `*.test.tsx`) — панель покрыта контрактными тестами API, новая практика тестирования не заводилась.

**Что НЕ сделано и почему:** **restore-drill по `docs/BACKUP_ROLLBACK.md` не проводился.** Учения затрагивают боевую базу общего сервера — без явного согласия владельца я такое не выполняю. Это единственный незакрытый пункт ФТ-G6.

**Тесты:** бэкенд +14 (`learner-pii.service.test.ts` — 10, `migrations.0079.test.ts` — 4, `redaction.util.test.ts` — +4), фронт +2.

**Дальше:** критерий приёмки эпика D (завершение Фазы 4).

### 5.240 План Фазы 5 «UX и порталы» — написан, ждёт апрува владельца

**Ветка:** `feat/2026-08-05-tz-faza5-plan` (после §5.239/PR #452). **Кода в этой сессии нет** — по протоколу ТЗ §13/§15 фаза стартует только после плана и апрува.

**План:** [`docs/superpowers/plans/2026-08-05-tz-faza5-ux-portals.md`](docs/superpowers/plans/2026-08-05-tz-faza5-ux-portals.md) — 9 задач по ЭПИКу H + остатки E. **Миграций фаза не требует** (новых прав и таблиц нет); если по ходу выяснится обратное — это повод остановиться, а не тихо добавить миграцию.

**Главный вывод разведки: трекер расходился с кодом в пяти строках из семи.** Проверено по коду до написания задач, строки трекера исправлены в этой же сессии:

1. **ФТ-F2 «СМС-seam» стоял ⬜, но сделан** — интерфейс `SmsProvider` + `SMS_PROVIDER_REGISTRY`, настройки провайдера на тенанта, `SmsChannelService` с прод-предохранителем (`fake` → `noop` в production, видно в живом журнале стенда). Открытым остаётся только вопрос №4 — какого оператора подключать, а это решение владельца.
2. **ФТ-E2 стоял 🟡 с тремя «остатками» — все три сделаны:** рандомизация (`assessment/shuffle.util.ts`, в комментарии прямо описано, что прежняя была фикцией), автосохранение с debounce, срок попытки `expiresAt` проверяется НА СЕРВЕРЕ в трёх местах.
3. **ФТ-H3 почти закрыт:** обёртки состояний в **56** файлах; экранов без них ровно два, из них одному (витрине `ui-kit`) они не нужны по смыслу.
4. **ФТ-H2 был занижен и завышен одновременно:** дашборды слушателя (`learner-home`) и tenant_admin (`/workspace`) — настоящие, с живыми данными; у методиста и заказчика их нет.

**Главный вскрытый дефект (Task 1, приоритет №1): корневая `/` — витрина из девяти плиток-ссылок без единого запроса к серверу** (151 строка, `grep useQuery|apiRequest|fetch` — пусто). Это хуже отсутствия дашборда: настоящие дашборды написаны, а точка входа уводит от них на список ссылок. Правка дешёвая — перенаправление на домашний маршрут роли, заданный **данными**, а не ветвлением в JSX.

**Прочие реальные дыры:** мобильных брейкпоинтов нет (семь `@media`, самый узкий 768px, ширины 360px из ТЗ не касались); тест-раннер молча теряет ответы (`navigator.onLine` и `beforeunload` отсутствуют — слушатель узнаёт о пропавшей сети в момент отправки); представитель заказчика видит документ в списке, но скачать не может (список под `portal.read`, скачивание под `documents.read`); маршрутов стало **99** против «94» в ТЗ — сверку блоков надо повторить.

**Открытые вопросы владельцу:** **№A** — нужен ли Telegram-бот в этой фазе (в ТЗ [P2]; предлагаю Фазу 6); **№B** — делать ли дашборд заказчика под роль, которой пока никто не пользуется (предлагаю сделать, приёмку отложить); **№C** — зафиксировать критерий «проверено на 360px» (предлагаю: без горизонтальной прокрутки + тач-зоны ≥44×44 px).

**Порядок задач:** ФТ-H1 (сверка архитектуры) стоит **последней** намеренно — группировать экраны, часть которых ещё не написана, значит делать работу дважды.

**Дальше:** апрув → Task 1 (маршрутизация ролей на существующие дашборды).

### 5.241 Фаза 5 Task 1 — каждая роль приземляется на свой экран (ФТ-H2)

**Ветка:** `feat/2026-08-05-tz-faza5-task1-role-home` (после §5.240/PR #453). **План Фазы 5 апрувнут владельцем** («ок» на §5.240) вместе с рекомендациями по трём вопросам: №A Telegram — в Фазу 6; №B дашборд заказчика — делать, приёмку отложить; №C 360px — без горизонтальной прокрутки и тач-зоны ≥44×44.

**Что сделано:** домашний маршрут роли вынесен в **данные** (`features/navigation/role-home.ts`): таблица «роль → адрес», порядок = приоритет при нескольких ролях, и резолвер, который перед перенаправлением **сверяется с картой доступа** тем же `evaluateRouteAccess`, что и обычная навигация. Корневая `/` теперь ведёт: слушателя — в кабинет, tenant_admin/platform_admin — на `/workspace`, методиста — на `/courses`, менеджера — на `/groups`, представителя заказчика — в портал. Раньше перенаправлялся ТОЛЬКО слушатель, а `manager` и `counterparty_rep` видели пустую витрину с надписью «Роль не определена».

**Главная находка — работающий баг, найденный по дороге: кабинет слушателя не открывался вовсе.** Маршрута `/learner` не было в карте доступа (`routeMeta`), а неизвестный маршрут считается `not-found`, и `ProtectedRoute` на этом делает `router.replace('/not-found')`. То есть слушатель после входа перенаправлялся в кабинет и тут же выбрасывался на «страница не найдена». Подтверждено пробным тестом до правки (`resolveRouteMeta('/learner')` → `null`, `evaluateRouteAccess` → `not-found`) и цепочкой `app/learner/page.tsx` → `ProtectedPage` → `ProtectedRoute`. Запись добавлена с правом `enrollments.read` (как у соседних страниц кабинета).

**Ключевые решения:**

1. **Таблица, а не ветвление в компоненте.** Маршрут роли — данные: их видно в обзоре, они проверяются тестом и меняются без правки разметки. Прежнее `if (roles.has('learner')) router.replace(...)` жило прямо в JSX и с каждой ролью разрасталось бы.
2. **Резолвер проверяет доступ, а не верит таблице.** Права роли меняются миграциями; перенаправление на закрытую страницу сразу после входа выглядело бы как поломка входа. Если дом недоступен — берётся дом следующей роли, а не отказ.
3. **Слушатель остался первым в таблице приоритета** — так вело себя перенаправление до правки. Менять точку приземления тем, кто одновременно учится и администрирует, в рамках этой задачи было бы отдельным решением; при необходимости меняется порядок списка и больше ничего.
4. **`/learner` поставлен ПОСЛЕ всех `/learner/*`** — совпадение ищется по префиксу и берётся первое, поэтому запись выше перехватила бы все внутренние страницы кабинета и навязала им своё право. Закреплено тестом.

**Замеченное, но НЕ тронутое (для следующего агента):** записи с параметрами (`/learner/tests/[testId]/attempt/[attemptId]`) в карте доступа мёртвые — сопоставление идёт по литералам, поэтому реальный адрес с идентификаторами матчится более коротким префиксом `/learner/tests` и получает право `assessment.tests.read` вместо `assessment.attempts.take`. Сегодня это никого не задевает (у слушателя есть оба права), но при разделении прав выстрелит. Чинить в Task 1 не стал: правка меняет доступ на боевых страницах и заслуживает своей задачи.

**Тесты:** фронт **876** (+14: 12 на резолвер и карту, 2 регрессии кабинета). `ci:check` exit 0.

**Дальше:** Task 2 — дашборд методиста.

### 5.253 Фаза 6 Task 3+4 — диск, логи, бэкапы и УЧЕНИЯ ВОССТАНОВЛЕНИЯ ПРОВЕДЕНЫ

**Ветка:** `feat/2026-08-08-faza6-task3-4-backups` (от main после вливания #469). **Миграций и новых прав нет.** Задачи 3 и 4 сделаны вместе осознанно: при забитом диске бэкап не снимется, это одна цепочка «чтобы было что восстанавливать».

**ГЛАВНОЕ: «restore-drill проведён» из ключевого результата фазы — ВЫПОЛНЕНО, и учения сразу нашли настоящую беду.**

Первый же прогон `infra/restore-drill.sh` **провалился**: копия в прежнем формате **не восстанавливается на чистом сервере**. `pg_dump` записывает в дамп команды «сделать владельцем роль X», а на новой машине такой роли нет — psql обрывается на первой же строке (`role "testuser" does not exist`). То есть копия была, а восстановиться из неё было нельзя, и выяснилось бы это в день аварии. Исправлено флагами `--no-owner --no-privileges` (объекты достаются той роли, под которой идёт восстановление). Побочная польза: кластер Postgres на стенде **общий с другими проектами**, поэтому выгрузка глобальных ролей положила бы в нашу копию чужие учётные записи с хешами паролей — этого пути мы избежали.

**Учения после правки пройдены на ЖИВОЙ копии базы стенда:** 6 схем, 150 таблиц, 80 записей о миграциях, 1 центр, 6 пользователей; **фактическое время восстановления — 8 секунд**. Боевая база при этом не открывается: читается только файл копии, восстановление идёт в одноразовый контейнер, который сносится после проверки. Именно поэтому блокер «учения затрагивают боевую базу — нужно согласие владельца», висевший с Фазы 4, снят кодом.

**Что было до этой задачи (напоминание разведки):** бэкапов не существовало вообще — в `crontab` только автообновление стендов, а `infra/backup.sh` был нацелен на прод-compose, которого на стенде нет. Фактический RPO — бесконечность.

**Task 4 — что сделано:**

1. **`infra/backup.sh` переписан.** Топология больше не зашита: способ достучаться до базы задаётся `CDOPROF_PG_EXEC` (прод — compose, стенд — `docker exec -i test-postgres`). Дамп пишется во временный файл и становится копией **только после проверки** — прежнее перенаправление создавало файл ДО запуска `pg_dump`, поэтому сбой на середине оставлял обрезанный архив, неотличимый по имени и размеру от настоящей копии. Добавлены: проверка свободного места ДО начала, `gzip -t`, контрольная сумма, отсев подозрительно маленького дампа, отметка `last-success`, чистка старого. Том MinIO тоже перестал быть зашитым (`CDOPROF_MINIO_VOLUME`) — на стенде он называется `infra_minio-data`, а не `cdoprof_minio-data`.
2. **`infra/restore-drill.sh`** — учения: проверка суммы и `gzip -t` ДО подъёма базы, одноразовый Postgres, восстановление с `ON_ERROR_STOP=1` (без него psql глотает ошибки и выходит с кодом 0 — «успешное» восстановление с половиной таблиц), проверки данных, замер RTO против предела, снос контейнера через `trap`.
3. **`infra/backup-watchdog.sh`** — сторож свежести: есть ли копия вообще, не старше ли предела (26 ч), сходится ли сумма, доходил ли бэкап до конца (`last-success`), есть ли место под следующую. Проверен вживую на трёх сценариях: свежие копии → код 0; пустой каталог → тревога и код 1; **испорченный файл → пойман по контрольной сумме и `gzip -t`**.
4. **`infra/ops-lib.sh`** — общий канал тревоги. Пусто — сообщение в stderr и ненулевой код (cron пришлёт письмо); задан `CDOPROF_ALERT_CMD` — уйдёт в канал. Недоступный канал **не роняет сам бэкап**.
5. **Дамп перед выкаткой** в `deploy.yml`: копия снимается на СТАРОМ коде, до применения миграций; неудачный дамп останавливает выкатку (катиться без точки возврата опаснее, чем не выкатиться).
6. **Копия вне сервера** — код написан (`CDOPROF_OFFSITE_CMD`), назначение подключает владелец (вопрос №C). Пока пусто, скрипт честно предупреждает в журнале.

**Task 3 — диск и логи:** ротация журналов добавлена **всем 24 сервисам** обоих compose-файлов через якорь YAML (100 МБ × 5 файлов). До этого предела не было ни у одного: json-файл рос, пока не кончится диск, а диск общий с базой, MinIO и каталогом копий — переполнение означало бы Postgres в read-only И несделанный бэкап одновременно. Проверка свободного места встроена в бэкап и сторож.

**Найдено попутно: два набора скриптов бэкапа.** Кроме `infra/*` есть `scripts/backup|restore/postgres-*.sh` по `DATABASE_URL`, и документ `docs/backup-and-restore.md` рассказывал ТОЛЬКО о них — из-за чего казалось, что эксплуатационного контура нет. Удалять не стал: это рабочий ручной инструмент разработчика. Вместо этого документ теперь честно описывает оба и разницу между ними (расписание, тревоги и учения есть только у `infra/*`).

**Тесты:** новый сторож `apps/backend/src/infrastructure/database/backup-scripts.test.ts` — **17 проверок** свойств, каждое из которых уже стоило или стоило бы данных: переносимый формат дампа, `ON_ERROR_STOP`, запись через временный файл, порядок «проверить → переименовать», отметка об успехе, одноразовость базы учений, ротация журналов у всех сервисов. Прогонять сами скрипты в тестах нельзя (нужны docker и живая база), поэтому закрепляем свойства текстом — та же house-практика, что у `dockerfile-migrations-packaging.test.ts`.

**Осталось за владельцем:** поставить три строки в `crontab` (готовы в `docs/BACKUP_ROLLBACK.md`) и решить по копии вне сервера. Пока строк в cron нет, копии по-прежнему не снимаются автоматически — код готов, расписания нет.

**Дальше:** Task 5 (метрики, честный readiness, heartbeat воркера) и Task 6 (алерты).

### 5.252 Фаза 6 Task 1 — аварийные дефекты кабинета + ЗАКРЫТА УТЕЧКА ПДн

**Ветка:** `feat/2026-08-08-faza6-task1-live-defects` (поверх ветки плана `docs/2026-08-08-faza6-plan`). **Миграций и новых прав нет.** План: `docs/superpowers/plans/2026-08-08-tz-faza6-ekspluataciya.md`, Task 1 (+ кодовая часть Task 2).

**ГЛАВНОЕ — найдено рецензентами по ходу задачи, серьёзнее всех четырёх дефектов: любой вошедший СЛУШАТЕЛЬ мог выгрузить ФИО и СНИЛС всех слушателей центра.** Раздел отчётов целиком (`reports/kpi-snapshot`, `analytics-dashboard`, `builder/entities`, `builder/preview`, `builder/export`, `builder/templates`) был закрыт правом `enrollments.read`, а оно ЕСТЬ у роли `learner` (проверено в живой базе). Конструктор отчётов отдаёт колонки «ФИО», «Фамилия», «СНИЛС» (`report-builder/report-entities.ts:20-25`) и выгружает до **50 000 строк** в XLSX (`mvp.service.ts:exportReport`). Туда же попадали `groups/:id/exam-readiness` (состав группы с проблемами по СНИЛС) и `groups/:id/progress-summary`. На фронте раздел был открыт правом `tenant.read`, а «Аналитика» и «Конструктор отчётов» — тем же `enrollments.read`, то есть пункты висели у слушателя прямо в меню.

**Как закрыто (без миграций, по живой базе, а не по догадке):** отчёты — правом `learners.read` («видеть карточки слушателей»), групповые сводки — `groups.read`. Проверка в `iam.role_permissions`: оба права есть ровно у `manager`, `tenant_admin`, `platform_admin`. **Никто доступ не теряет:** у методиста и представителя заказчика нет и `enrollments.read`, то есть сервер отказывал им и раньше. Фронт приведён в соответствие с сервером (карта доступа + пункты меню).

**Четыре дефекта §5.245:**

1. **Шторм realtime.** Соединение теперь принадлежит паре «комната + токен», а не подписчику; колбэк живёт в ref, зависимости эффекта — только `[room, token]`; отписка гасит отложенное переподключение (раньше таймер оставался и открывал поток «в никуда»). Круг разорван и со стороны данных: на переподключении клиент просит `?cursor=` вместо «повтори всё за последнюю минуту» — именно повтор и делал шторм самоподдерживающимся. Те же правки получили хуки чата и задач.
2. **F5-разлогин.** `GET /auth/csrf` добавлен в bootstrap-список `TenantGuard` (сравнение по пути без строки запроса — иначе `?next=/auth/csrf` открыл бы дыру). Это единственный маршрут во всём бэкенде, чей путь оканчивается на `csrf`.
3. **`?next=` игнорировался.** Разбор вынесен в чистый модуль `next-target.ts`.
4. **Пустой кабинет.** Новая ручка `GET /me/enrollments` (право прежнее, `enrollments.read`) сама резолвит карточку слушателя по привязке и **возвращает `courseId`** — у `Enrollment` его нет, курс висит на группе. Кабинет, плеер и отчёты переведены на неё; заодно снова сохраняется прогресс в плеере. Отбор зачислений переведён в **fail-closed**: раньше `restrictLearnerIdsForAssessmentList` возвращал «без ограничений» для пользователя БЕЗ привязки к карточке — то есть он видел все зачисления центра. Порядок теперь: внутренний вызов → без ограничений; есть bypass-право → без ограничений; иначе — только свои, а без привязки — пусто. Живая база подтвердила, что bypass есть у всех штатных ролей, поэтому регрессии у персонала нет (закреплено тестами).

**Чего стоила адверсарная рецензия (три блокера в моей же работе, все в дефекте C):**

- Защита от открытого редиректа **обходилась точечными сегментами**: `/..//evil.com` начинается с одного слэша, проходит проверку, а разбор схлопывает `..` уже ПОСЛЕ неё и возвращает `//evil.com` — готовый адрес чужого сайта. Проверять надо РЕЗУЛЬТАТ разбора; воспроизведено в node до правки.
- **38 «злых» вариантов в тесте были зелёными на дырявом коде** — ни одного случая с точечными сегментами. Ровно тот случай, когда тест хуже отсутствующего: следующий человек поверит, что тема закрыта.
- **Настоящая форма входа новый модуль не использовала вовсе:** `login-form.tsx` и страница входа по ссылке звали старую слабую проверку, пропускавшую `/\evil.com` и `/<таб>/evil.com`. Слабая проверка удалена, обе точки входа идут через строгий разбор.

**Ещё из рецензий (исправлено здесь же):** приёмочный тест §39 проверял слушателя на ВЫДУМАННОМ наборе из трёх прав — заменён на настоящий из живой базы (17 прав), и теперь он ловит утечку отчётов; изоляционный тест портала звал сервис без `actorId`, то есть проверял путь, по которому продакшен не ходит; страница уведомлений делала второй запрос на каждое событие; остался экспортированный сломанный хук `useLearnerEnrollmentForCourse` (заряженные грабли — удалён); `ProtectedRoute` терял строку запроса в `?next=` (списки с фильтрами теряли фильтры).

**Кодовая часть Task 2 (CI):** каждой джобе поставлен `timeout-minutes` (их отсутствие и жгло по 1–4 часа), добавлены `contracts:lint`/`contracts:typecheck` до дословного совпадения с `ci:check`, убран четырёхкратный перепрогон пересекающихся наборов; в `deploy.yml` согласован `command_timeout` SSH-действия (его умолчание 10 минут наступало раньше 30-минутного потолка джобы). **Actions в репозитории по-прежнему выключены — это шаг владельца (вопрос №A).** Ветка `main` не защищена (branch protection недоступен на текущем тарифе), поэтому переименование джоб ничего не блокирует.

**Тесты:** бэкенд **3000** (353 файла), фронт **959** (145 файлов), typecheck 13/13, `ci:check` зелёный. Новых прав и миграций нет.

**Вопрос владельцу, поднятый этой задачей:** нужен ли методисту доступ к отчётам? Сейчас интерфейс говорит то же, что и сервер, — нет. Раньше страница ему открывалась, но каждый запрос отвечал отказом. Выдать доступ = выдать право миграцией, это решение продукта.

**Дальше:** Task 3 (диск и логи) и Task 4 (бэкапы и учения восстановления) — по плану они следующие по «что сломается раньше».

### 5.251 План Фазы 6 «Эксплуатация» — написан, ждёт апрува владельца

**Ветка:** `docs/2026-08-08-faza6-plan`. **Кода нет и не будет до апрува** (правило ТЗ §13/§15). Файл: `docs/superpowers/plans/2026-08-08-tz-faza6-ekspluataciya.md`, 11 задач.

**Как делалась разведка.** Урок Фазы 5 («трекер врал в пяти строках») применён заранее: 8 параллельных агентов сверяли каждое утверждение трекера с кодом, спорные вердикты перепроверял адверсарный агент, полноту объёма — отдельный критик. Плюс я проверял живой стенд руками. Перепроверка окупилась дважды: вердикт «ЕСИА уже сделана» был **опровергнут** (шов есть, боевой адаптер не работает), а вердикт по дефектам §5.245 — **подтверждён и усилен**.

**Три находки, которых не было ни в одной строке трекера:**

1. **Бэкапов НЕ СУЩЕСТВУЕТ.** В `crontab` сервера только автообновление пяти стендов. `infra/backup.sh` написан под `infra/docker-compose.prod.yml`, а стенд живёт иначе: systemd-сервисы + dev-compose + **общий на все проекты контейнер `test-postgres`** — скрипт бы там не отработал. При RPO 24 ч по ТЗ фактический RPO — бесконечность; учебные документы и ПДн существуют в одном экземпляре. Ротации docker-логов тоже нет ни у одного из 13 сервисов, а диск делят Postgres, MinIO (видео) и ClamAV.
2. **GitHub Actions ВЫКЛЮЧЕН на уровне репозитория** (`gh api .../actions/permissions` → `enabled:false`). Последний прогон 27.05.2026, все 8 джоб отменены разом. 2,5 месяца зелёным PR делал только мой локальный `ci:check`. Причина видна в длительностях: прогоны шли по 1–4 часа при отсутствии `timeout-minutes`. При этом трекер утверждал, что «`test:isolation` нет» — он есть (31 тест) и уже вписан в CI-конфиг.
3. **`/metrics` завёрнут в конверт API** (`{"data":"# HELP ..."}`) — Prometheus такое не разбирает; проверено curl'ом на стенде. Собирать метрики всё равно некому: ни Prometheus, ни Grafana, ни Alertmanager на сервере нет.

**Трекер занижал по очередям:** backoff, retry-очередь с TTL, `jobs.dead-letter` и poison-сообщения в воркере **уже написаны**. Но карантин никто не читает (ни консьюмера, ни таблицы, ни экрана), «Повторить» у задачи документа не публикует сообщение (`documents.controller.ts:502`), а экран «Здоровье арендаторов» и `/health/ready` считают по четырём таблицам, в которые приложение никогда не пишет — то есть показывают нули и не покраснеют никогда.

**Дефекты §5.245 живы все четыре и хуже записанного:** шторм realtime самоподдерживается (клиент просит повтор событий за минуту, сервер отдаёт, событие вызывает новый рендер и новую подписку); подстановка IAM-id вместо реестрового ломает не только «Мои курсы», но и сохранение прогресса в плеере и отчёты. **Найдено сверх того:** отбор зачислений отказывает В ОТКРЫТУЮ — `restrictLearnerIdsForAssessmentList` возвращает «ограничений нет» для пользователя без привязки к карточке слушателя, поэтому чинить пустой кабинет на фронте нельзя, нужна серверная ручка `/me/enrollments`.

**Критик полноты добавил шесть областей, которых не смотрел никто:** письма не повторяются и их никто не видит (ручка `GET /email-deliveries` есть, фронта нет); `iam.sessions`/`magic_link_tokens`/аудит без чистки; пять `@Cron`-планировщиков без отметок «отработал»; миграции на старте без `pg_advisory_lock`; нет ограничителя частоты и блокировки после неудачных входов.

**Главное решение плана: «restore-drill проведён» закрывается КОДОМ** — восстановлением свежего дампа в одноразовую БД с замером времени. Это снимает блокер, висевший с Фазы 4 («учения затрагивают боевую базу — нужно согласие владельца»).

**Что критик предложил НЕ брать (и я согласился):** Sentry (ПДн в стек-трейсах + трансграничка), стек Prometheus+Grafana, self-hosted runner, боевую интеграцию ЕСИА, офлайн-режим PWA, WAL-архивирование, включение outbox. Из блока ЕСИА в фазу взята ровно одна вещь — запрет `ESIA_PROVIDER='mock'` в production (сейчас с ним можно войти под СНИЛС любого зачисленного слушателя).

**Порядок задач — по «что сломается у живого центра раньше всего»:** аварийные дефекты кабинета → CI → диск/логи → бэкапы и учения → метрики и heartbeat → алерты → карантин и починка задач → экран «Эксплуатация» → чистка таблиц → нагрузка по замерам → PWA-минимум и ЕСИА.

**Вопросы владельцу (блокируют старт):** №A включить Actions; №B канал алертов (рекомендую Telegram только для эксплуатации, полноценный ФТ-F3 — за пределами фазы); №C offsite-хранилище и шифрование дампа; №D подтвердить RPO 24 ч / RTO 4 ч; №E ЕСИА — только исследование?; №F Sentry — предлагаю не брать.

**Дальше:** апрув → Task 1 (аварийные дефекты кабинета).

### 5.250 Фаза 5 Task 9 — вебинары: фиксация посещения (ФТ-F4) + ЗАКРЫТИЕ ФАЗЫ 5

**Ветка:** `feat/2026-08-08-faza5-task9-webinar-attendance` (от main после вливания #466). **Бэкенд + фронт; миграций и новых прав нет. Последняя задача фазы.**

**Что сделано (Task 9):**

1. **Отметка посещения:** `POST /webinars/:id/join` под `webinars.attend` (то же право, что «мои вебинары»). Актор сопоставляется с участником в сервисе (`learnerId`/`userId` — как в `listMine`); не участнику — 404 (чужой вебинар неотличим от несуществующего). **Идемпотентно:** `joinedAt` ставится один раз; точный `durationSeconds` от вебхука площадки (если придёт) не затирается. Фронт: кнопка «Подключиться» сначала отмечает, ПОТОМ открывает комнату — закрытая вкладка не съедает факт посещения (а с ним и часы).
2. **Журнал часов группы:** `WebinarsService.groupAttendanceSeconds` → у `LearningHoursService` новая зависимость (CommunicationModule уже экспортировал сервис, MvpModule уже импортировал модуль — циклов нет). Посещённый вебинар даёт плановую длительность (точную от вебхука — предпочтительнее), неотмеченный приглашённый не даёт ничего — ровно acceptance. Колонка «Вебинары» на экране журнала И в CSV-выгрузке (инспекторский файл обязан совпадать с экраном). В формуле часов вебинары СКЛАДЫВАЮТСЯ с материалами (это отдельная активность), в отличие от видео (которое есть материал и берётся максимумом).
3. Глубокая интеграция с площадкой — [P2], вне фазы (примечание плана); ручная отметка и вебхучная фиксация сосуществуют.

**Тесты Task 9:** +6 в `webinars.service.test.ts` (отметка/идемпотентность/404/часы группы/вебхук предпочтительнее/чужая группа), +1 в журнале (`посещённый виден, неотмеченный нет`), +2 обновлённых формата CSV, +1 граница прав в `mvp.http.integration.test.ts` (403 с `webinars.read` — «видеть» не значит «отмечаться»; 201 с `webinars.attend`), +1 контракт фронта.

**ЗАКРЫТИЕ ФАЗЫ 5 (все 9 задач + завершение):**

- **Прогоны 2026-08-08:** `pnpm ci:check` — 9/9 зелёный (первый прогон поймал 2 lint-ошибки порядка импортов — исправлены); `test:security` 24, `test:migrations` 51, `test:isolation` 31 — зелёные. Бэкенд ~2989 тестов, фронт 897.
- **Критерий приёмки ЭПИКа H:** блоков навигации 10 (согласованы владельцем, сверка сторожем — Task 8); каждая роль приземляется на свой дашборд (Task 1–2); кабинет слушателя пройден на 360px вживую (Task 4).
- **Трекер добит:** ФТ-H5 и ФТ-F4 → ✅ (строки отставали от Task 3/9), строка Фазы 5 → «закрыта». Миграций в фазе не было — указатель `0079` в CLAUDE.md верен.
- **Вне фазы (для следующего планирования):** дефекты §5.245 (шторм realtime, пустой кабинет привязанного слушателя, F5-разлогин, игнор `?next=`) — внеочередные кандидаты; дашборд заказчика — приёмка отложена до живого представителя (№B); Telegram-бот → Фаза 6 (№A); отдача файла `/files/:id/download` — общесистемная заглушка (§5.247).

**Дальше:** план Фазы 6 «Эксплуатация» (по дорожной карте ТЗ §13) — писать план и получать апрув владельца ДО кода; плюс решить судьбу внеочередных дефектов §5.245.

### 5.249 Фаза 5 Task 8 — сверка информационной архитектуры (ФТ-H1)

**Ветка:** `feat/2026-08-07-faza5-task8-ia-audit` (от main после вливания #465). **Только фронт (навигация + сторож), URL не менялись.**

**Пересчёт:** маршрутов **100** (`page.tsx` в `app/`), блоков ИА **10** (структура согласована владельцем в Фазе 2; «8–9» из ТЗ считаем уточнённым — перекраивать согласованное ради числа не стал). Сверка закреплена ТЕСТОМ `src/e2e/ia-architecture.e2e.test.ts` (7 инвариантов), а не документом в `docs/` — документ протух бы к следующей фазе, тест протухнуть не может.

**Найдено и исправлено:**

1. **Две недостижимые страницы:** `/forms` (шаблоны анкет) и `/module-empty` были ВНЕ карты доступа (`routeMeta`) — `ProtectedPage` выбрасывала любого посетителя в not-found. Тот же класс бага, что у `/learner` в Task 1 (§5.241). Добавлены записи (права — как у соседних админ-стабов).
2. **Три публичные страницы вне карты:** `/verify/[token]` (проверка подлинности по QR), `/exam-auth/[token]`, `/tenant-not-found` — работали только потому, что не завёрнуты в `ProtectedPage`. Теперь карта знает их как `public: true`.
3. **Блок «Моё обучение» ссылался в пустоту:** `/learner` был в hrefs блока, но пункта меню не существовало — в кабинет нельзя было вернуться из сайдбара (это же объясняет странное поведение клика по заголовку блока, замеченное в Task 4). Добавлен пункт «Мой кабинет» (`enrollments.read`, как в карте).
4. **Заглушки `/mailings`, `/crm/deals`, `/forms` скрыты из меню ОСОЗНАННО** — прошлое решение, уже закреплённое в `helpers.test.ts` («страница доступна по прямой ссылке, сырое в сайдбар не выносим»). Моя первая версия добавила их в меню и сломала тот тест — решение уважено: откат, и в сторожевой сверке они объявлены ЯВНЫМ списком `HIDDEN_STUB_ROUTES`. Разница между «скрыт решением» и «сирота-недосмотр» теперь видна в коде.

**Инварианты сторожа:** каждый маршрут знаком карте доступа; каждый пункт меню ведёт на существующую страницу; каждый пункт блока существует в меню; каждый маршрут принадлежит ровно одному блоку (правило — самое длинное совпадение, как в самой карте: `/learner/documents` — это «Документы», а не префикс «Моё обучение») или объявлен служебным/скрытой заглушкой; списки исключений не протухают (запись без маршрута или накрытая блоком валит тест).

**Тесты:** фронт **896** (+7). URL/RBAC не менялись: правки только в `routeMeta` (аддитивные записи), `navigationModel` (+1 пункт) и новом тесте.

**Дальше:** Task 9 — вебинары: фиксация посещения (ФТ-F4) — последняя задача фазы.

### 5.248 Фаза 5 Task 7 — экзамен → протокол → документы → реестр одной цепочкой (ФТ-E3)

**Ветка:** `feat/2026-08-07-faza5-task7-close-group-chain` (от main после вливания #464). **Бэкенд + кнопка на экране закрытия группы; миграций и новых прав нет.**

**Что сделано:** `POST /groups/:groupId/close-chain` → `CloseGroupChainService` — оркестровка ПОВЕРХ готовых шагов, без их переписывания (они в бою и работают по отдельности): проверка готовности (ФТ-E3.2) → отбор сдавших → `DocumentsService.closeGroup` (протокол + удостоверения) → `OtRegistryService.exportOtRegistry` (строки выгрузки, частичный успех по строкам).

**Ключевые решения:**

1. **Частичный успех по слушателям, «всё или ничего» — только по группе.** Слушатель отсеивается поимённо с причиной (`enrollment_not_completed` / `exam_result_missing` / `exam_not_passed` / `learner_issue` из отчёта готовности — например, СНИЛС) и не отменяет выпуск остальным. Проблемы уровня группы (комиссия меньше трёх, без председателя, программа) валят цепочку целиком 412: протокол один на всех, и печатать его с неполной комиссией — брак.
2. **Список зачислений клиент НЕ передаёт** — цепочка сама отбирает по результатам экзамена. В этом её отличие от «закрыть группу» (ФТ-A5), где состав вводит оператор.
3. **Идемпотентность двухслойная.** Ключ цепочки: повтор с тем же ключом возвращает прежний отчёт (`cached: true`) и НЕ создаёт вторую выгрузку; хранение — новая коллекция `closeGroupChainIdempotency` (зарегистрирована в `mvp-collections.ts` — иначе пропала бы между запросами, известная грабля). Документы дополнительно защищены детерминированными ключами `close-group:<group>:…` самого `closeGroup` — второй комплект не выйдет даже с новым ключом.
4. **Права — ОБА сразу:** `documents.generate` + `regulatory.export.write` (цепочка и выпускает документы, и создаёт выгрузку). Одного права «закрыть группу» мало осознанно.
5. **Отдельный контроллер** `CloseGroupChainController`: не вешаем зависимость на `MvpController` (его собирает доменный HTTP-тест — каждая новая зависимость там ломает сборку, грабля §5.242/§5.244).
6. **Пустой отбор — отчёт, а не ошибка**, и выгрузка не создаётся: файл без строк — мусор в журнале выгрузок.
7. **UI:** на экране закрытия группы — блок «Цепочка» (ID курса + кнопка); ключ идемпотентности генерируется на клиенте и живёт, пока не изменились входные поля: повторный клик = тот же ключ = прежний отчёт. Отчёт: дошло/отсеяны поимённо/ошибки строк реестра.

**Известный шов (не скрываю):** строки реестра ищут номер протокола в документах ЗАЧИСЛЕНИЯ, а `closeGroup` выпускает протокол уровня ГРУППЫ, и файлы рождаются асинхронно (очередь → worker). Пока протокол не materialized, строки честно падают предполётной проверкой «Номер протокола отсутствует» — ровно как в ручном режиме выгрузки. Это существующее поведение шагов; чинить его в оркестровке значило бы переписывать шаги (план это явно запрещает).

**Тесты:** `close-group-chain.test.ts` — 4 (чистый отбор кандидатов), `close-group-chain.service.test.ts` — 6 (склейка: порядок шагов, 412 на комиссии, отсев СНИЛС, идемпотентность повтора, аудит), +2 HTTP-границы (403 с одним правом / 201 с обоими; файл 114), +1 контракт фронта (без `enrollmentIds` в теле, с ключом). Полный бэкенд зелёный, фронт 889, typecheck 13/13.

**Дальше:** Task 8 — сверка информационной архитектуры (ФТ-H1).

### 5.247 Фаза 5 Task 6 — представитель заказчика скачивает документ своего сотрудника (ФТ-E5)

**Ветка:** `feat/2026-08-07-faza5-task6-portal-document-download` (от main после вливания #463). **Только бэкенд, миграций нет, новых прав нет.**

**Разрыв, который закрывался:** список документов представитель видел через `/portal/documents` под `portal.read`, а скачивание жило только в `documents/:id/download` под `documents.read` — правом «видеть документы всего центра», которое представителю не выдаётся (и выдавать нельзя).

**Что сделано:** `GET /portal/documents/:id/download` под тем же `portal.read` + `MvpService.getPortalDocumentDownload` с проверкой владения.

1. **Владение выводится так же, как в списке портала:** документ выпущен по зачислению (`sourceEntityType='enrollment'`) в группу контрагента актора. Один вывод «чей это сотрудник» на список и скачивание — два расходящихся ответа недопустимы.
2. **Чужой, несуществующий и «не по зачислению» документ неразличимы — единый 404** (`not_found`): 403 или разные тексты подтвердили бы факт существования записи. Свой документ без файла — тоже 404, но с кодом `document_file_missing` (владельцу можно объяснить причину, факт существования он и так знает).
3. **Персонал (актор без привязки к контрагенту) не ограничен** — менеджер должен уметь скачать то же, что и клиент, когда разбирает его обращение; прежний штатный путь не менялся.
4. Ответ — `{ downloadUrl }` той же формы, что у штатного `documents/:id/download` (парность с персоналом).

**Оговорка (важно):** сам маршрут `/files/:id/download` — общесистемная ЗАГЛУШКА для всех ролей (комментарий в `listEnrollmentDocuments`: «реальный stream PDF появится, когда подключится document generation pipeline»; фронт слушателя показывает stub-сообщение). Task 6 — про слой ПРАВ и владения; отдача самого файла — известный отдельный остаток, не специфичный порталу.

**Тесты:** +6 в `counterparty-scope.isolation.test.ts` (свой → ссылка; чужой → 404 анти-IDOR; несуществующий → 404; не-зачисленческий → 404; без файла → 404; персонал → работает), stub `DocumentsService.getDocument` повторяет `must()`. +2 в `mvp.http.integration.test.ts` (403 с `documents.read` — право «про весь центр» не открывает портал; 200 с `portal.read`). Изоляционный файл 19, HTTP-границы 112, полный `pnpm test:backend` зелёный, typecheck 13/13.

**Дальше:** Task 7 — экзамен → протокол → реестр одной цепочкой (ФТ-E3). Напоминание: дефекты §5.245 (шторм realtime, пустой кабинет слушателя) всё ещё ждут внеочередных задач.

### 5.246 Фаза 5 Task 5 — единые состояния закреплены сторожем (ФТ-H3)

**Ветка:** `feat/2026-08-07-faza5-task5-unified-states` (от main после вливания #462). **Только фронт, миграций нет.**

**Главное открытие: чинить оказалось нечего.** Трекер называл два экрана без единых состояний — `learners-list-screen.tsx` и витрину `ui-kit`. Экран слушателей УЖЕ переведён в Фазе 4 (PR #303: `ListPage` из `@trudskill/ui`, внутри — `AsyncSection` с загрузкой/пустотой/ошибкой); замер разведки искал импорты из `state-wrappers` и не считал `ListPage` за обёртку. Витрина показывает состояния как экспонаты — правило к ней неприменимо по смыслу (и формально она его тоже проходит). Свежий скан: **46 файлов-экранов в `features/*`, нарушителей 0.**

**Что сделано:** сторожевой тест `apps/frontend/src/e2e/unified-states.e2e.test.ts` — правило закреплено тестом, а не договорённостью (ровно формулировка acceptance):

- экран с данными (`isLoading`/`isPending`/`useQuery`) обязан использовать общие обёртки (`AsyncSection`/`ListPage`/`LoadingState`/`SectionError`/`SectionEmpty`/`ListSkeleton`);
- гранулярность — файл (осознанная грубость: сторож ловит НОВЫЙ экран, написанный целиком мимо обёрток; один плохой экран внутри `screens.tsx` монолита файл не завалит);
- витрина `ui-kit` — явное исключение списком, с объяснением;
- сторож самого сканера: экранов должно быть >40 (иначе сломался поиск, а не наступило счастье);
- сканер проверен и на синтетике (юнит внутри теста), и подложным файлом-нарушителем — поймал по имени.

Пути — через `import.meta.url`, не `process.cwd()` (грабля из CLAUDE.md про разный cwd).

**Тесты:** фронт **888** (+2). ESLint нового файла чистый.

**Дальше:** Task 6 — представитель заказчика скачивает документ своего сотрудника (ФТ-E5). Напоминание из §5.245: дефекты «шторм realtime» и «пустой кабинет слушателя» ждут внеочередных задач.

### 5.257 Решение владельца по ЕСИА: регистрируемся как ПЛАТФОРМА

**Владелец ответил на главный вопрос исследования** (`docs/superpowers/specs/2026-08-09-esia-issledovanie.md`)
и делегировал решение деталей. Зафиксировано: **одна интеграция на всех арендаторов**, а не
по регистрации на каждый учебный центр.

**Почему так.** Данные слушателей всех центров и так живут в одной системе — отдельная
регистрация на центр противоречила бы устройству продукта. Плюс для арендатора это не
галочка, а регистрация ИС, сертификат и аттестация: вариант «каждый сам» на практике означает
«входа через Госуслуги не будет ни у кого, кроме нас». И это товар: «вход из коробки» —
довод при продаже аренды.

**Три последствия, записанные как требования к архитектуре (заложить сразу):**

1. **Свой вход для отдельного центра — предусмотреть, но не делать.** По умолчанию общий
   вход платформы; в настройках центра — возможность подставить свои реквизиты. Сейчас это
   несколько полей, потом — переделка.
2. **Возврат приходит на адрес ПЛАТФОРМЫ**, а кабинеты живут на поддоменах: система
   переправляет человека в его центр, перенося одноразовый параметр состояния. Проверка
   адреса возврата остаётся строгой — только известные поддомены своих арендаторов.
3. **Госуслуги возвращают человека, а не его центр.** Ищем по СНИЛС: найден в одном —
   пускаем; в нескольких — **спрашиваем, в какой**; нигде — вход не даём и объясняем, что
   Госуслуги подтверждают личность, но не зачисляют на обучение.

**За пределами кода** (записано в документ): поручение на обработку ПДн в договоре аренды и
согласование формулировки заявки с теми, кто ведёт регистрацию и аттестацию.

**Кода не писали намеренно.** До доступа к тестовому контуру и сертификата боевую часть
проверить нечем — заглушка проверяет только нашу половину.

### 5.256 Оснастка замера §12.4 (пакет документов на 25 человек)

**Зачем.** §12.4 — единственное число ТЗ, которое ни разу не измеряли, в отличие от §12.1
(три захода оптимизации и живые прогоны). Причина не в лени: замер требует полностью
настроенного курса, а не просто данных.

**Разведка.** В демо-центре стенда есть программы (2), группа, комиссия — но **нет набора
документов курса** (`courseDocumentSets`). Выпускать нечего, поэтому число сегодня получить
нельзя, и в отчёте это написано прямо, а не спрятано.

**Что сделано.** `infra/load/measure-document-package.sh` — замер одной командой, как только
курс будет готов. Меряет то, что чувствует человек: не «ручка ответила», а время до момента,
когда ВСЕ задачи документов группы завершились. Перелёт за 2 минуты даёт ненулевой код
возврата — замер должен краснеть, а не сообщать «ну почти». Если подготовки не хватает,
скрипт печатает код отказа и отсылает к перечню требований, а не молчит и не врёт нулём.

**Что нужно подготовить** (требования продукта, не скрипта): программа с опубликованной
версией, набор документов с шаблонами и нумерацией, комиссия, действующая лицензия, группа
из 25 слушателей с завершёнными зачислениями.

**Проверка.** `bash -n` + холостой прогон: скрипт корректно отказался и объяснил причину.
Кода приложения не менялось.

### 5.255 Несколько экземпляров бэкенда за прокси (§12.1)

**Основание — замер §5.254:** под нагрузкой в 50 сессий бэкенд занимает 94% ОДНОГО ядра при
восьми на машине. Упирались не в базу и не в код, а в единственный процесс Node.

**Что сделано.** Прод-стек научился работать в несколько копий бэкенда:

- `infra/Caddyfile`: `reverse_proxy` с **динамическим** поиском экземпляров (`dynamic a`).
  Со статическим адресом Caddy разрешает имя ОДИН раз при старте — добавленные позже копии
  не получили бы ни одного запроса, и масштабирование оказалось бы бутафорией. Плюс
  раскладка по наименее занятому (`least_conn`) и вывод неотвечающего из ротации.
- `infra/docker-compose.prod.yml`: описано, как запускать
  (`up -d --scale backend=4`), и почему порт бэкенда наружу НЕ публикуется — иначе вторая
  копия не поднимется, порт занят.

**Почему это безопасно именно сейчас.** Фаза 6 Task 9 закрыла миграции блокировкой уровня
СЕАНСА, а все планировщики (включая реапер и чистку) берут свои блокировки. Без этого вторая
копия накатила бы миграции повторно и задвоила ночные задачи. Тогда это выглядело уборкой —
оказалось предусловием.

**Проверка.** `pnpm ci:check` зелёный; пять сторожевых тестов на конфигурацию: динамический
поиск экземпляров, раскладка по загрузке, вывод неотвечающего, отсутствие публикации порта,
отсутствие фиксированного имени контейнера. Compose разобран yaml-парсером.

**Чего НЕ сделано и почему.** Живой замер «до/после» на нескольких копиях не снят: на стенде
бэкенд запущен через systemd одним процессом, а не прод-стеком с Caddy. Проверять
масштабирование надо там, где оно будет работать, — на прод-стеке при выкатке. Ожидание по
замеру: узкое место — одно ядро из восьми, поэтому запас есть; но это ожидание, а не
измеренный факт, и в отчёте так и написано.

### 5.254 Найдено настоящее узкое место §12.1: бэкенд — один процесс на восьмиядерной машине

**Что сделано.** Не правка кода, а замер: после трёх заходов оптимизации требование §12.1 на
50 сессиях всё ещё не бралось (0,336–0,378 с против 0,3 с), и надо было понять — во что
именно упираемся, прежде чем переписывать сервисы.

**Находка.** Под нагрузкой в 50 сессий процесс бэкенда занимает **94% одного ядра**
(мгновенный замер `top`, два подряд: 94,1% и 94,5%), при том что на машине **восемь ядер**.
Упираемся не в базу и не в код: Node выполняет запросы по очереди в одном потоке, и
59 запросов в секунду × ~16 мс работы дают ровно это ядро. Остальные семь простаивают.

**Следующий шаг стал другим.** Раньше в планах стояло постраничное чтение списков из базы —
переписывание сервисов. Замер говорит начать с более дешёвого: **несколько экземпляров
бэкенда за обратным прокси**, кода это не трогает вовсе. И это стало безопасным именно
сейчас: Фаза 6 Task 9 закрыла миграции блокировкой уровня сеанса, а планировщики берут свои
блокировки — второй экземпляр не накатит миграции повторно и не задвоит ночные задачи.

**Две ловушки замера, записаны в отчёт, чтобы на них не попался следующий:**

1. `ps -o pcpu` показывает **среднее за всю жизнь процесса**, а не текущую загрузку: на том
   же прогоне он дал 37% вместо 94%. Мгновенную загрузку берём вторым замером `top`.
2. Токен живёт 15 минут. Прогон с протухшим токеном показал «p95 = 9 мс и 86 запросов в
   секунду» — и это были **100% отказов**, отбитых на входе. Первый мой прогон был именно
   таким; поймал проверкой `checks` и `http_req_failed`, а не глазами.

**Файлы:** `docs/LOAD_TEST_RESULTS.md` (раздел «Где узкое место сейчас» + порядок дальнейших
шагов). Кода не менялось — менять было нечего, менять надо разворачивание.

### 5.253 Ленивая раскладка состояния — §12.1 почти взят и на 50 сессиях

**По плану** `docs/superpowers/plans/2026-08-09-lenivoe-chtenie-sostoyaniya.md` (Task 1–3).

**Что было не так.** Состояние центра читается одним запросом (3 мс — дёшево), но потом
полторы тысячи записей раскладывались по полусотне коллекций с расшифровкой ПДн всех
слушателей — на КАЖДЫЙ запрос. При этом обычный показ списка трогает одну-две коллекции:
списку слушателей не нужны ни история статусов зачислений (500 записей), ни кэши
идемпотентности, ни сорок остальных.

**Что сделано.** Сырые строки кладутся в состояние как есть, а раскладываются по первому
обращению — и только те, к которым обратились. Отпечаток снимается по коллекциям в момент
раскладки, поэтому сравнивается только тронутое (раньше хешировалось всё состояние дважды за
запрос — 7,4 мс). В базу пишутся только изменившиеся коллекции.

**Ни один сервис не переписан** — они как читали `state.learners`, так и читают. Коллекции
стали свойствами с ленивым чтением; ссылка на массив стабильна, `push`/`splice` работают как
раньше.

**Числа (тот же нагрузочный тенант, 500 слушателей):**

| Одновременных сессий | Было    | Стало       | Требование |
| -------------------- | ------- | ----------- | ---------- |
| 20                   | 0,152 с | **0,042 с** | 0,3 с ✅   |
| 50                   | 0,79 с  | **0,378 с** | 0,3 с ❌   |

Одиночный запрос 0,035 → 0,020 с. Пропускная способность 45 → 59 запросов в секунду.
Итого от начала работ: p95 при 50 сессиях 30,25 с → 0,378 с (в 80 раз), пропускная 1,4 → 59.

**Что поймал существующий тест.** Первая версия правки сломала перешифровку старых строк с
незашифрованными ПДн: в памяти они выглядят как расшифрованные, по отпечатку сходили за «не
менялись» — и остались бы открытыми навсегда. Такая коллекция теперь помечается к записи
явно. Это нашёл тест, а не ревью.

**Проверка.** Полный `pnpm test:backend` — **3098 тестов, все зелёные**; `pnpm ci:check`
зелёный; шесть прогонов k6 на живой базе стенда, ошибок ноль во всех. Замеры сняты отдельным
экземпляром бэкенда (порт 3021) — рабочий стенд не трогался.

**Что осталось.** До требования на верхней границе 26%. Следующий шаг назван по замеру:
постраничное чтение списков прямо из базы — сейчас показ первых 50 слушателей всё ещё
поднимает в память все 500. Это переписывание сервисов, отдельное решение.

**Оговорка про условия замера:** стенд делит машину с пятью другими проектами, загрузка
процессора на старте прогона была около 4 из 8. На выделенной машине числа будут лучше, но
проверять это надо замером.

**Файлы:** `apps/backend/src/modules/mvp/infrastructure/{in-memory-mvp.state.ts,postgres-mvp-persistence.backend.ts,lazy-state.test.ts}`,
`docs/LOAD_TEST_RESULTS.md`, план.

### 5.252 Чтение состояния тенанта одним запросом — §12.1 взят на 20 сессиях

**Задача, назначенная по цифрам Task 10.** Требование §12.1 («p95 API списков < 300 мс»)
не выполнялось; замер показал, куда уходит время.

**Что нашли.** Загрузка состояния шла **циклом по коллекциям**: на каждую свой `select`.
Коллекций около пятидесяти — то есть полсотни обращений к базе на КАЖДЫЙ запрос
пользователя, включая простой показ списка. При этом всё состояние центра с 500 слушателями
читается **одним** запросом за 2,8 мс.

**Что сделано.** Один `select` на весь тенант, группировка по коллекциям в памяти.
Неизвестные коллекции (остатки прежних версий) молча пропускаются — раньше их просто не
запрашивали.

**Числа (тот же нагрузочный тенант, 500 слушателей):**

| Замер              | Исходно | После Task 10 | Сейчас         | Требование |
| ------------------ | ------- | ------------- | -------------- | ---------- |
| один запрос        | 0,67 с  | 0,060 с       | **0,035 с**    | —          |
| p95 при 50 сессиях | 30,25 с | 2,32 с        | **0,79 с**     | 0,3 с      |
| p95 при 20 сессиях | —       | 0,485 с       | **0,152 с** ✅ | 0,3 с      |
| запросов в секунду | 1,4     | 21            | **45**         | —          |

**Требование §12.1 ВЫПОЛНЕНО на нижней границе диапазона (20 сессий) и пока НЕ выполнено на
верхней (50).** Разрыв со стократного сократился до 2,6-кратного.

**Проверено, а не предположено:** расшифровка ПДн (AES) стоит микросекунды на запись и
главным расходом не является — гипотезу проверили, прежде чем что-то менять.

**Что осталось.** Чтобы взять верхнюю границу, нужно перестать загружать состояние центра
целиком: читать списки постранично прямо из базы вместо среза массива в памяти. Это уже
переделка ядра, а не точечная правка.

**Файлы:** `apps/backend/src/modules/mvp/infrastructure/postgres-mvp-persistence.backend.ts`
(+ подделка базы в его тесте — она отвечала на прежнюю форму запроса), `docs/LOAD_TEST_RESULTS.md`.

**Проверка.** `pnpm ci:check` зелёный; четыре прогона k6 на живой базе стенда, замеры сняты
отдельным экземпляром бэкенда (порт 3021) — рабочий стенд не трогался.

### 5.251 Фаза 6 Task 11 — PWA-минимум и закрытая дыра ЕСИА (ФТ-H6) — ФАЗА 6 ЗАКРЫТА ПО КОДУ

**Что было не так.**

1. **Ответы API попадали в кэш браузера**, который переживает выход из системы. На общем
   компьютере учебного класса — самый обычный случай для центра — следующий человек открыл
   бы страницу и увидел списки, ФИО и оценки предыдущего. Это утечка ПДн, а не косметика.
2. **Страница сама перезагружалась при возврате сети** (поведение Serwist по умолчанию).
   У слушателя моргнул Wi-Fi посреди экзамена — попытка перезагрузилась вместе с
   несохранёнными ответами.
3. **При обрыве связи** человек видел стандартную ошибку браузера и не понимал, сломалась
   система или пропал интернет.
4. **`ESIA_PROVIDER='mock'` НЕ был запрещён в production.** Заглушка пускает в систему
   любого, кто назовёт СНИЛС, — а СНИЛС есть в приказах и договорах. То есть в бою это был
   вход под чужой учётной записью.

**Что сделано.**

- Правило «ответы API НЕ кэшируются» стоит **первым** в списке правил (правила проверяются
  по порядку; после кэширующего до него уже не дошла бы очередь) и покрывает и свой путь
  `/api/`, и весь чужой origin — бэкенд с realtime стоят на отдельных адресах.
- Выход чистит кэш **двумя путями**: сама страница и команда service worker'у (он умеет
  стереть и предзагруженную оболочку приложения). Ошибки уборки глушатся намеренно:
  невозможность почистить кэш не должна мешать человеку выйти.
- `reloadOnOnline: false` — страница больше не перезагружается сама.
- Страница «нет интернета», которая честно объясняет, что с системой всё в порядке, и
  предупреждает, что сама не обновится (иначе слушатель будет ждать и решит, что зависло).
- `ESIA_PROVIDER=mock` в production останавливает старт — по образцу поддельного подписанта
  выгрузок. В staging остаётся: там владелец смотрит контур до подключения боевого.
- Исследование ЕСИА оформлено документом с чек-листом владельцу:
  `docs/superpowers/specs/2026-08-09-esia-issledovanie.md`. Главный вопрос там — чья это
  информационная система (центра или платформы): от ответа зависит, одна интеграция на всех
  арендаторов или по одной на каждого, и решить это дешевле до кода, чем после.

**Файлы:** `apps/frontend/src/app/sw.ts`, `apps/frontend/next.config.ts`,
`apps/frontend/src/features/auth/context.tsx`, `apps/frontend/app/offline/page.tsx`,
`apps/backend/src/env.schema.ts` + тесты (`pwa-safety.e2e.test.ts` 11, `env.test.ts` +2).

**Проверка.** `pnpm ci:check` зелёный. Свойства закреплены сторожами по исходникам: дом не
монтирует React и не поднимает service worker в тестах, поэтому проверяется порядок правил
кэширования, наличие очистки при выходе и выключенная автоперезагрузка.

**Замечание по плану.** `apple-touch-icon` отдельно не добавлялся: он уже объявлен через
`appleWebApp` в разметке приложения — проверено перед правкой.

**Этим Фаза 6 «Эксплуатация» закрыта по коду: 11 задач из 11** (Task 2 был поглощён Task 1).
Что осталось владельцу — см. README §2.

План: `docs/superpowers/plans/2026-08-08-tz-faza6-ekspluataciya.md` (Task 11).

### 5.250 Фаза 6 Task 10 — нагрузка по §12: числа вместо ощущений (ФТ-I3)

**Что сделано.** Оснастка (`infra/load/seed-load-tenant.sh` + `infra/load/k6-pilot.js`),
отдельный тенант `load-pilot` с 500 слушателями, залитыми обычным массовым импортом, и
настоящие прогоны на 20 и 50 одновременных сессиях. Полные числа —
[docs/LOAD_TEST_RESULTS.md](docs/LOAD_TEST_RESULTS.md).

**Главная находка.** Обычное **чтение** списка переписывало всё состояние центра: состояние
сохранялось в конце КАЖДОГО запроса, включая тот, который ничего не менял, и вставка шла
**по одной строке** — больше тысячи обращений к базе на один показ страницы при 500
слушателях. Первый замер: **p95 = 30,25 с** при требовании §12.1 в 300 мс, пропускная
способность 1,4 запроса в секунду.

**Две точечные правки** (`postgres-mvp-persistence.backend.ts`):

1. Не сохранять, если ничего не менялось: при загрузке снимается отпечаток состояния, в
   конце запроса сравнивается. Отпечаток считается по ОТКРЫТЫМ значениям в памяти —
   шифрование ПДн даёт каждый раз разный шифртекст, сравнивать его бессмысленно.
2. Вставка пачками по 500 строк вместо построчной.

**Итог правок:** одиночный запрос 0,67 с → 0,060 с (×11); p95 при 50 сессиях 30,25 с →
2,32 с (×13); пропускная способность 1,4 → 21 запрос/с (×15); ошибок ноль в обоих прогонах.

**Требование §12.1 всё ещё НЕ выполнено** — и это заявлено прямо, а не сглажено: p95 = 2,32 с
при 50 сессиях и 0,485 с при 20 (требование 0,3 с). Остаток объяснён замером: каждый запрос
по-прежнему загружает состояние центра целиком (демо с 2 слушателями — 21 мс, нагрузочный с
500 — 60 мс на одном коде). **Решение по цифрам:** тяжёлая переделка чтения нужна и выносится
отдельной задачей (читать только нужные коллекции, ленивая расшифровка ПДн, постраничное
чтение в SQL).

**Чего замер не покрыл.** §12.4 (пакет документов на 25 человек ≤ 2 мин) не измерен: нужен
полностью настроенный курс с шаблонами, комиссией и лицензией, которого в нагрузочном
тенанте нет. Сказано в отчёте прямо. Косвенный ориентир: массовый импорт и зачисление 500
слушателей одним запросом — 1,7 с.

**Отклонение от плана.** План предполагал дешёвые правки «индекс под QR-проверку и интервал
heartbeat видео». Замер показал, что узкое место совсем в другом месте, и правки сделаны там,
где болит.

**Грабли прогона.** Массовый импорт отверг все 500 строк из-за цифр в ФИО (проверка требует
чистую кириллицу) — генератор имён переписан на буквенные суффиксы. У нового тенанта нет ни
одного пользователя: `POST /platform/tenants` создаёт только сам тенант, поэтому
администратор нагрузочного стенда заводится в базе напрямую (это стендовая оснастка, не
продуктовый путь). Замеры «после» сняты на отдельном экземпляре бэкенда (порт 3021) против
той же базы — рабочий стенд не трогался.

План: `docs/superpowers/plans/2026-08-08-tz-faza6-ekspluataciya.md` (Task 10).

### 5.249 Фаза 6 Task 9 — чистка таблиц и безопасный старт (ФТ-I4)

**Что было не так (проверено на живой базе стенда).**

1. **Четыре таблицы росли без единой чистки.** На стенде уже лежало 117 сессий, из них
   15 просроченных и 20 отозванных — и ни одна никогда не удалялась. Диск общий с базой,
   MinIO и каталогом копий: переполнение означает и остановку базы, и несостоявшуюся
   ночную копию одновременно.
2. **Журнал аудита читался ЦЕЛИКОМ.** Запрос `select ... where tenant_id = $1 order by
created_at desc` без предела, а фильтры (действие, актор, даты) применялись уже **в
   памяти контроллера**. То есть поиск по одному действию всё равно вытаскивал весь журнал
   центра — сотни тысяч строк на работающем центре.
3. **Миграции накатывались без блокировки.** При одновременном старте двух экземпляров оба
   читали список применённых, оба видели одну и ту же новую миграцию и оба начинали её
   применять: второй падал на «таблица уже существует» и уходил в цикл перезапусков, а
   миграция без `IF NOT EXISTS` могла оборваться на середине.

**Что сделано.**

- Планировщик `retention-sweeper` (седьмой; сразу с отметкой «отработал» из Task 6):
  сессии 30 дней, ссылки входа 7, отметки обработанных сообщений 14. Удаление **порциями
  по 5000** — один большой `delete` держал бы блокировки минутами на живой работе центра.
  Своя блокировка, чтобы чистил только один экземпляр; снимается даже при ошибке.
- **Журнал аудита по умолчанию НЕ чистится** (`AUDIT_RETENTION_DAYS=0` = хранить вечно).
  Срок хранения журнала — решение владельца, а не разработчика: он нужен для проверок и
  разбирательств.
- Срок хранения отметок обработанных сообщений выбран **заведомо больше окна повторов**
  (десять попыток с задержкой до пяти минут): удалить отметку раньше времени значит
  разрешить повторную обработку старого сообщения, то есть выпустить второе удостоверение.
- Журнал аудита: `listPage` с фильтрами и пределом **в SQL**, предел ограничен сверху 500
  (запрос `?limit=1000000` не должен возвращать прежнее поведение). Ответ дополнен `total`,
  `limit`, `offset`; режим без базы фильтрует тем же правилом, чтобы поведение не разъезжалось.
- Миграции — под `pg_advisory_lock` уровня **СЕАНСА** на выделенном соединении.
  Транзакционная блокировка не годится: она снялась бы на первом же COMMIT, то есть после
  первой миграции, и второй экземпляр влез бы в середину.

**Файлы:** `apps/backend/src/modules/platform/{retention-sweeper.service.ts,platform.module.ts}`,
`apps/backend/src/modules/audit/{audit.service.ts,audit.controller.ts}`,
`apps/backend/src/infrastructure/database/database.service.ts`, `apps/backend/src/env.schema.ts`,
`.env.example` + тесты (`retention-sweeper.service.test.ts` 10, `migrations-lock.test.ts` 4,
`audit-pagination.test.ts` 10).

**Проверка.** `pnpm ci:check` зелёный. Порционное удаление и отбор сессий проверены на живой
базе стенда (с предохранителем, чтобы ничего не удалить): синтаксис `delete ... where ctid in
(select ... limit N)` работает, под срок 30 дней сейчас не попадает ни одна строка.

**Отклонение от плана.** План говорил про пагинацию журнала; разведка показала, что беда
шире — фильтры тоже применялись в памяти. Перенесены в SQL вместе с пределом.

План: `docs/superpowers/plans/2026-08-08-tz-faza6-ekspluataciya.md` (Task 9).

### 5.248 Фаза 6 Task 8 — экран «Эксплуатация»: центр чинит себя сам (ФТ-I2)

**Задача.** Дать администратору центра увидеть и починить то, из-за чего он звонил
разработчику. Почти всё для этого уже было на бэкенде — не хватало того, через что на это
смотрит человек.

**Что сделано.**

- Раздел `/admin/operations` с тремя вкладками — по трём вопросам, с которыми звонят:
  «где документ?» (задачи выпуска), «совсем пропало?» (карантин из Task 7), «почему не
  пришло?» (журнал писем). Кнопки: «Повторить», «Вернуть в работу», «Отбросить»,
  «Отправить повторно».
- **Новая ручка `POST /email-deliveries/:id/resend`** (`notifications.write`): повтора письма
  не существовало вовсе — администратор видел строку `failed` и мог только позвонить.
- Миграция **0081**: у журнала писем появились `body` и `resent_from_id`.

**Главное решение — почему понадобилась колонка `body`.** В журнале хранилась только ТЕМА
письма. Собрать письмо заново нельзя: шаблон, подпись центра, срок действия удостоверения
с тех пор могли измениться, и слушателю ушло бы **другое** письмо под видом повтора.
Поэтому храним отправленный текст и повторяем именно его; у писем, отправленных до этой
правки, тела нет — повтор для них честно недоступен, вместо тихой отправки чего-то другого.
По той же причине **не переносится `dedupKey`**: он означает «это уведомление уже
отправляли, второй раз не надо» — ровно то, что человек сейчас делает осознанно, кнопкой.
С ним повтор молча пропустили бы.

**Файлы:** `apps/backend/migrations/0081_communication_email_body_and_resend.sql`,
`apps/backend/src/modules/communication/{email-resend.service.ts,email-notifications.controller.ts,communication.module.ts,email-deliveries.repository.ts,postgres-email-deliveries.repository.ts,in-memory-email-deliveries.state.ts,notification-dispatcher.service.ts}`,
`apps/frontend/src/features/operations/*` (новый раздел), `apps/frontend/app/admin/operations/page.tsx`,
`apps/frontend/src/features/navigation/{model.ts,nav-groups.ts}`, тесты
(`email-resend.service.test.ts` 8, `api.contract.test.ts` 5, `admin-operations.e2e.test.ts` 6).

**Проверка.** `pnpm ci:check` зелёный. Миграция 0081 применена на живой базе стенда.
**360px (ФТ-H4)** закреплён тестом: все три таблицы строятся через `DataTable` (своя
разметка потеряла бы карточный режим на телефоне), у каждой колонки есть заголовок — из него
берётся подпись карточки, вкладки переносятся по строкам.

**Что поймали сторожа.** Сторож информационной архитектуры из Фазы 5 сразу отверг новый
маршрут как «сироту» — пришлось приписать его к блоку «Настройки и система». Ровно для
этого он и писался.

План: `docs/superpowers/plans/2026-08-08-tz-faza6-ekspluataciya.md` (Task 8).

### 5.247 Фаза 6 Task 7 — карантин упавших задач и починка зависших (ФТ-I1)

**Задача.** Сделать так, чтобы неудавшийся выпуск документа переставал пропадать молча.

**Что было не так (проверено на живой базе стенда).**

1. **Очередь `jobs.dead-letter` наполнялась с Фазы 0, но читать её было НЕКОМУ** — ни
   консьюмера, ни таблицы, ни экрана. Сообщение, которое воркер не смог обработать за
   десять попыток, оставалось в брокере. Слушатель ждал удостоверение, которое никто уже
   не выпустит, и узнавали об этом по звонку.
2. **«Повторить» у задачи документа НИЧЕГО не перезапускало**: обработчик менял статус на
   `queued` и на этом заканчивался — сообщение в очередь не уходило. Задача висела «в
   очереди» вечно, а человек был уверен, что перезапустил её.
3. **Зависшую задачу никто не возвращал.** Если воркер умирал с сообщением в руках, задача
   навсегда оставалась `running`: сообщение уже забрано, повторить некому.
4. **Экран «Здоровье арендаторов» читал ЧЕТЫРЕ таблицы, в которые приложение никогда не
   пишет** (`documents.document_tasks`, `integrations.sync_jobs`, `integrations.dead_letters`,
   `integration.export_tasks` — по 0 строк на работающем стенде, и ни одного `insert` в
   коде). Экран показывал нули независимо от происходящего, то есть выглядел исправным
   всегда.
5. **Чтение заголовков могло уронить весь консьюмер.** `extractRetryCount` обращался к
   `message.properties.headers['x-retry-count']` напрямую, а вызов стоял ВНЕ `try`.
   Сообщение без заголовков (чужой издатель, ручная переотправка из админки RabbitMQ)
   роняло не документ, а разбор очереди целиком.

**Что сделано.**

- Миграция **0080** `documents.job_quarantine` + права `operations.quarantine.read/write`
  (только администрации: разбирать застрявшие выпуски — не работа методиста). `tenant_id`
  намеренно NULLABLE и без внешнего ключа: в карантин попадает и мусор с несуществующим
  тенантом, и именно его нельзя терять.
- Консьюмер `jobs.dead-letter` в воркере: каждое сообщение записывается в карантин.
  Повторное падение того же `messageId` обновляет строку, а не плодит дубли. Не удалось
  записать — сообщение возвращается в очередь (потерять хуже, чем разобрать позже).
- Ручки `GET /job-quarantine`, `POST /job-quarantine/:id/republish`, `.../discard`.
  Переотправка обнуляет счётчик попыток (причину чинят ДО возврата в работу), неразбираемое
  тело переотправить нельзя — честный отказ вместо публикации в никуда. Чужая запись —
  404, а не 403.
- «Повторить» теперь публикует настоящий job.
- Реапер `stuck-document-tasks-reaper` (шестой планировщик, с отметкой «отработал» из
  Task 6): раз в 5 минут возвращает в очередь задачи, висящие в `running` дольше
  `DOCUMENT_TASK_STUCK_MINUTES` (15), и заново их публикует. Счётчик `reviveCount` в данных
  показывает задачу, которую «чинят» по кругу.
- Экран здоровья читает реальные источники: `documents.runtime_documents` и карантин.
- Политика повторов вынесена в `apps/worker/src/retry-policy.ts` и покрыта тестами;
  чтение заголовков больше не бросает никогда.

**Файлы:** `apps/backend/migrations/0080_ops_job_quarantine.sql`,
`apps/backend/src/modules/documents/{job-quarantine.service.ts,stuck-tasks-reaper.service.ts,documents.controller.ts,documents.module.ts}`,
`apps/backend/src/modules/platform/platform-health.service.ts`, `apps/backend/src/env.schema.ts`,
`apps/worker/src/{retry-policy.ts,quarantine-store.ts,main.ts}` + тесты
(`retry-policy.test.ts` 11, `quarantine-store.test.ts` 4, `job-quarantine.service.test.ts` 10,
`stuck-tasks-reaper.service.test.ts` 6, `migrations.0080.test.ts` 7, +3 в
`documents.http.integration.test.ts`).

**Проверка.** `pnpm ci:check` зелёный. Миграция дважды прогнана на живой базе стенда —
идемпотентна. SQL реапера проверен там же на подставных данных: задача, висящая 40 минут,
вернулась в очередь со снятой отметкой начала, свежая осталась нетронутой. Upsert карантина
проверен на живой базе: повторная запись того же `messageId` обновила строку, а не создала
вторую.

**Отклонения от плана.** Порог зависания взят предложенный (15 минут). Реапер стал шестым
планировщиком, поэтому сразу получил отметку «отработал» — иначе он сам был бы невидимкой,
ровно как те пять до Task 6.

План: `docs/superpowers/plans/2026-08-08-tz-faza6-ekspluataciya.md` (Task 7).

### 5.246 Фаза 6 Task 5+6 — систему стало видно: метрики, живость воркера, шесть тревог (ФТ-I1/I2)

**Задача.** Закрыть «наблюдаемость» из плана Фазы 6: снимать метрики любым сборщиком,
краснеть готовностью при забитой очереди, видеть молчащий воркер и получать сигнал по
каждой из аварий, из-за которых центр встаёт.

**Что было не так (проверено на живом стенде, не по документам).**

1. `GET /api/v1/metrics` отдавался **внутри конверта API** — то есть Prometheus получал
   JSON с текстом внутри и не мог его разобрать. Метрики физически нельзя было собрать.
2. Ручка метрик была **открыта без токена**: наружу торчали пути, коды ответов и объёмы.
3. Вместо перцентилей отдавались **средние** — по среднему не видно, что каждый двадцатый
   слушатель ждёт ответа десять секунд.
4. В метки метрик уходили `tenantId`/`userId` — так собиратель метрик взрывается по памяти
   (каждый новый пользователь = новый ряд), и это ещё и утечка идентификаторов.
5. `/health/ready` считал очередь **по таблицам, в которые приложение не пишет** — проверка
   всегда была зелёной.
6. Воркер был **единственным сервисом без проверки живости**: не поднимал порт, не оставлял
   отметок, в `docker-compose.prod.yml` у него не было `healthcheck`. Умерший воркер
   выглядел ровно как живой — очередь копилась, узнавали по звонку «где удостоверение».
7. Пять ночных планировщиков ловят свои ошибки внутрь журнала. Планировщик, который
   перестал запускаться, был **неотличим** от планировщика, которому нечего делать.
8. Смотреть во всё это было **некому**: сборщика на сервере нет, тревог не существовало.

**Что сделано.**

- Конверт API больше не оборачивает ответ, если обработчик сам объявил `content-type`
  не-JSON (`response-envelope.interceptor.ts`). Метрики снимаются любым сборщиком.
- `MetricsService`: перцентили 0.5/0.95/0.99 вместо средних; метки высокой кардинальности
  (`tenant_id`, `user_id`, `learner_id`, …) вырезаются на входе; агрегат размера карантина.
- `MetricsTokenGuard` + `METRICS_TOKEN` в схеме окружения — в проде **обязателен**
  (бэкенд не стартует без него), сравнение постоянное по времени.
- Готовность считает по реальным местам хранения (`documents.runtime_documents`,
  `core.outbox_events`), статусы сверены с живым CHECK-ограничением на стенде.
- Воркер: `health-server.ts` — `/healthz` (200 жив / 503 завис) и `/metrics` со счётчиками
  по исходам. В `docker-compose.prod.yml` добавлен `healthcheck`.
  **Отдельная находка при самопроверке:** первая версия обновляла отметку только при
  обработке сообщения — то есть ночью, когда очередь пуста, исправный воркер отчитался бы
  «завис», и docker принялся бы перезапускать его по кругу. Починено отдельным «тиканьем»
  раз в минуту, пока живо соединение с очередью (`startIdleTicker`, два теста на это:
  десять минут простоя — жив; потеря связи — не жив).
- Отметки планировщиков (`common/metrics/scheduler-heartbeat.ts`): каждый из пяти прогонов
  пишет «отработал», наружу уходит возраст последнего успеха и признак просрочки.
  Сделано модулем, а не сервисом Nest, — чтобы не менять конструкторы и не переписывать
  юнит-тесты пяти планировщиков ради одной строчки учёта.
- `infra/ops-alerts.sh` — семь сигналов (бэкенд, воркер, очередь, планировщики, свежесть
  копии, диск, всплеск 5xx). Молчит, пока всё в порядке; о беде сообщает ненулевым кодом
  возврата. Всплеск 5xx считается по приросту между запусками, а не по общему счётчику —
  иначе «сломалось сейчас» неотличимо от «сломалось месяц назад».

**Файлы:** `apps/backend/src/common/interceptors/response-envelope.interceptor.ts`,
`apps/backend/src/common/metrics/{metrics.service.ts,metrics.controller.ts,metrics-token.guard.ts,metrics-token.guard.test.ts,scheduler-heartbeat.ts,scheduler-heartbeat.test.ts}`,
`apps/backend/src/env.schema.ts`, `apps/backend/src/modules/health/health.controller.ts`,
`apps/backend/src/infrastructure/database/database.service.ts`,
`apps/backend/src/modules/integrations/services/integration-orchestrator.service.ts`,
пять `*.scheduler.service.ts`, `apps/worker/src/{health-server.ts,health-server.test.ts,main.ts,env.ts}`,
`infra/{ops-alerts.sh,docker-compose.prod.yml}`, `apps/backend/src/infrastructure/database/backup-scripts.test.ts`,
`docs/BACKUP_ROLLBACK.md`.

**Проверка.** `pnpm ci:check` зелёный. Каждый из семи сигналов проверен **искусственной
поломкой**: бэкенд на несуществующем порту, каталог копий без файлов, порог диска 1%,
подставная выдача метрик (очередь 137, просроченный планировщик, скачок 5xx +108). Отдельно —
настоящая находка: на живом стенде тревога сразу поймала, что воркер не отвечает.

**Отклонения от плана.** В плане было пять сигналов — стало семь: добавлены «бэкенд не
готов» и «планировщик молчит» (иначе отметки планировщиков некому читать).
Готовность намеренно **не** краснеет на глубину очереди:
перезапуск контейнера очередь не разгребает, а вывод сервиса из-под нагрузки сделает хуже.
Глубина ушла в метрику, будит людей скрипт тревог. Метрика `queue_lag_ms` не заведена:
в очереди документов нет отметки времени постановки — это часть Task 7.

**Что осталось владельцу.** Поставить строку `*/5 * * * * infra/ops-alerts.sh` в cron
(и три строки копий из §«Что нужно сделать один раз» — **копии на стенде до сих пор не
снимаются**), задать `METRICS_TOKEN` в `.env.production` перед следующим деплоем.

План: `docs/superpowers/plans/2026-08-08-tz-faza6-ekspluataciya.md` (Task 5, Task 6).

### 5.245 Фаза 5 Task 4 — кабинет слушателя на 360px (ФТ-H4)

**Ветка:** `feat/2026-08-06-faza5-task4-cabinet-360px` (после §5.244). **Только фронт и пакет `ui`, миграций нет.**

**Что сделано:** телефонный брейкпоинт `@media (max-width: 480px)` (до этого самый узкий был 768px):

1. **Таблицы → карточки.** `DataTable` проставляет каждой ячейке `data-label` из заголовка колонки (колонка без заголовка — без подписи); на ≤480px шапка таблицы скрывается, строка становится карточкой, подпись рисуется через `content: attr(data-label)`, горизонтальная прокрутка обёртки отключается, «закреплённая первая колонка» сбрасывается. Самодельная разметка вместо `DataTable` карточный режим потеряет — правило закреплено в `CLAUDE.md`.
2. **Тач-зоны 44px (решение владельца №C):** кнопки и поля ввода 40→44px на телефоне; пункты оглавления курса (`.course-toc__material`) и заголовки модулей — min-height 44px; кнопки «Назад/Далее» теста растягиваются на пол-экрана.
3. **Каркас (`app-shell.tsx`):** у шапки снята фиксированная высота 64px — при переносе строк на 360px «Выйти» и имя наезжали на заголовок страницы; крошки перестали быть nowrap (уезжали за 381px — единственный настоящий горизонтальный скролл); пункты бокового меню — 44px. **Грабля styled-jsx: scoped-стили НЕ попадают на `next/link`** (`<Link className="app-shell__link">` рендерится без jsx-класса), поэтому мобильное правило — через `:global(...)`. Это же значит, что ВСЕ прежние стили `.app-shell__link`, `.app-shell__crumb-link`, `.app-shell__notif-link` в styled-jsx мёртвые с рождения — меню всегда выглядело «голыми ссылками». Чинить глобально не стал: смена вида десктоп-меню — не задача про 360px.

**Сторожевые тесты:** `packages/ui/src/styles/phone-breakpoint.test.ts` (брейкпоинт есть, карточный режим есть, 44px есть) + `packages/ui/src/components/table/data-label.test.tsx` (обход дерева элементов без DOM-рендера — react-dom в пакете нет намеренно).

**Приёмка вживую** (прод-сборка воркtree `next build --webpack` + локальный прокси одного origin к бэкенду стенда :3011, окно 360×740): все четыре экрана — дом `/learner`, плеер курса, тест-раннер (вопрос + 3 варианта), «Мои документы» — `scrollWidth === 360`, элементов шире экрана нет, целей ниже 44px нет (варианты ответа 74px, кнопки теста 44px, пункты меню 44px). Таблица `/learners` в карточном режиме проверена и вычисленными стилями, и снимком. Демо-данные созданы по официальным API: слушатель ↔ `u_learner`, курс с версией (паспорт программы + комиссия + лицензия — без них версия не публикуется), группа, зачисление, тест на 3 вопроса.

**Дефекты, ВСКРЫТЫЕ прогоном и НЕ починенные здесь (каждому — своя задача, по важности):**

1. **Шторм переподписок realtime.** `useNotificationsRealtime` зависит от `onRefresh`, а `AppShell` передаёт новую стрелку каждый рендер → эффект пересоздаёт EventSource на КАЖДУЮ перерисовку. Итог: тысячи подключений к realtime от каждой открытой вкладки (на стенде — прямо сейчас), при недоступном realtime — `ERR_INSUFFICIENT_RESOURCES`, «Maximum update depth exceeded», зависшие вкладки; списковые экраны кабинета мигают «Загрузка…»↔контент и не дают снять стабильный скриншот.
2. **Кабинет слушателя пуст у привязанных слушателей (ФТ-H2).** `use-learner-home-data` фильтрует зачисления по `learner_id = IAM id` (`u_learner`), а в зачислениях лежит РЕЕСТРОВЫЙ id (`learner_bqsqu4nt`) → «Мои курсы» и «следующий шаг» всегда пустые. Вдобавок `Enrollment` не несёт `courseId` (зачисление в группу). Правильное лечение — `GET /me/enrollments` по образцу `/me/tests` (сервер уже умеет резолвить привязку), а не костыль на фронте.
3. **F5 разлогинивает.** `GET /auth/csrf` не входит в bootstrap-список `TenantGuard` → 401 без bearer → восстановление сессии падает всегда. Доказано шимом в прокси: если ручка отвечает (эхо csrf-cookie, как и задумано контроллером), сессия переживает перезагрузку.
4. **Вход игнорирует `?next=`** — после логина всегда `/`, глубокие ссылки в кабинет не доводят.

**Грабли прогона для следующих сессий:** Next 16 dev блокирует «чужой» origin — ходить на прокси по `localhost`, не по `127.0.0.1`; в dev-режиме StrictMode запускает восстановление сессии дважды и второй запрос сжигает ротированный refresh-токен — живые проверки сессии делать на прод-сборке; realtime стенда слушает `:3012`, magic-link при выключенной почте печатается в `journalctl -u lms-backend`.

**Тесты:** пакет `ui` **78** (+8), фронт **886**, `pnpm typecheck` 13/13, `next build --webpack` зелёный.

**Дальше:** Task 5 — добить единые состояния (ФТ-H3); отдельно поставить задачи на дефекты 1–2 (шторм realtime и пустой кабинет) — они бьют по живым слушателям сильнее любой вёрстки.

### 5.244 Фаза 5 Task 3 — тест-раннер перестаёт молча терять ответы (ФТ-H5)

**Ветка:** `feat/2026-08-05-tz-faza5-task3-test-runner` (после §5.243). **Только фронт, миграций нет.**

**Что сделано:** постоянный индикатор сохранности ответов на экране прохождения теста, предупреждение браузера при уходе со страницы с несохранённым ответом, тач-зона варианта ответа доведена до 44px.

**Дефект, найденный по ходу и более важный, чем сама задача: автосохранение НИКОГДА не снимало пометку «изменено».** `dirtyRef` пополнялся при каждом ответе, а очищался только в `flushDraft` (переход между вопросами и отправка). То есть счётчик несохранённых рос до числа отвеченных вопросов, и любой индикатор поверх него врал бы. Исправлено: пометка снимается по УСПЕХУ автосохранения и возвращается по неудаче `flushDraft`. Если человек изменил ответ, пока шёл запрос, пометка остаётся — сравнение черновика **по ссылке** (`setDrafts` создаёт новый объект на каждое изменение), иначе более свежий ответ считался бы сохранённым.

**Ключевые решения:**

1. **Состояние связи — чистая функция** в `connection.ts` от четырёх признаков (онлайн, число несохранённых, идёт ли запрос, текст последней ошибки). Компонентных тестов React в проекте нет вовсе, поэтому логика внутри JSX осталась бы непроверенной; вынесенная — покрыта 9 тестами, включая перебор всех сочетаний.
2. **Порядок проверок = порядок опасности.** Отсутствие сети важнее неудачи сохранения: иначе человек прочтёт «ошибка сервера» и решит, что дело в системе, а не в связи.
3. **Нет сети, но всё сохранено — предупреждение, а не тревога.** Пугать посреди экзамена, когда терять нечего, вредно: слушатель бросит отвечать и пойдёт чинить интернет.
4. **Прошлая ошибка при сохранённых ответах не показывается** — «была ошибка» рядом с «всё сохранено» только путает: ответ в итоге дошёл.
5. **Индикатор виден ВСЕГДА, в том числе спокойный.** Плашка, появляющаяся только при беде, сама читается как новая беда; постоянная — как приборная панель, где сразу видно норму.
6. **`beforeunload` вешается ТОЛЬКО когда есть несохранённое.** Постоянный обработчик мешает обычному выходу и отключает восстановление вкладки браузером. Текст задать нельзя — браузер показывает своё окно; управляем только фактом вопроса.
7. **`navigator.onLine` читается в эффекте, а не при первом рендере** — на сервере `navigator` не существует, и гидратация разошлась бы.
8. **44px заданы явно (`min-height`), а не выведены из отступов** — прежние `padding: 12px` давали ~43px на одну строку текста, и любая правка шрифта снова уводила бы размер.

**Тесты:** фронт **886** (+9 на состояние связи), пакет `ui` +2 сторожевых на тач-зоны.

**Дальше:** Task 4 — кабинет слушателя на 360px (брейкпоинтов уже нет).

### 5.243 Переход на pnpm 11.20.0 (PR бота #428 расшит)

**Ветка:** `chore/2026-08-05-pnpm-11`. Задача была поставлена как «устрани конфликты вливания `renovate/pnpm-11.x`». **Git-конфликтов не было вовсе** — GitHub помечал PR как `MERGEABLE/UNSTABLE`, то есть спотыкался не на слиянии, а на проверках. Настоящих препятствий оказалось два, оба вскрыты прогоном, а не чтением.

**Препятствие 1 — установка падала без терминала.** `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`: pnpm 11 переспрашивает перед сносом `node_modules` (после pnpm 9 раскладка другая), а без TTY просто отказывается работать. **Это ровно наш случай:** установки идут из CI и из cron автообновления стенда, подтвердить там некому — без правки обновление стенда упало бы и откатилось. Решение: `confirmModulesPurge: false` в `pnpm-workspace.yaml` (настройку называет сам текст ошибки).

**Препятствие 2 — установочные скрипты зависимостей.** pnpm 11 не выполняет их по умолчанию и делает неразрешённый скрипт **ошибкой** установки (`ERR_PNPM_IGNORED_BUILDS`), а не предупреждением — защита от цепочек поставок. В `pnpm-workspace.yaml` уже лежала заготовка `allowBuilds` с плейсхолдерами «set this to true or false», которую никто не заполнил (под pnpm 9 она была инертна). Заполнено осознанно: `esbuild` и `unrs-resolver` — **true** (нативные бинарники, без них не собирается ничего и не работает проверка импортов); `@nestjs/core` (баннер о пожертвовании), `cpu-features`, `ssh2` (транзитивные из testcontainers, работают и без нативных ускорителей), `protobufjs` — **false**.

**Что проверено вживую:**

1. `pnpm install --frozen-lockfile` под pnpm 11 — exit 0, **lock-файл не переписан** (формат pnpm 9 принимается как есть, никакой миграции). Сообщение «Lockfile passes supply-chain policies» — новая проверка pnpm 11 — проходит.
2. **Полный `ci:check` под pnpm 11 — exit 0**: бэкенд 2951, фронт 877; плюс `test:migrations` 51, `test:isolation` 25, `test:security` 24.
3. **Сценарий стенда воспроизведён целиком**: зависимости под pnpm 9 → прилетает обновление до 11 → установка из cron без терминала. Exit 0, снос подтверждения не требует.
4. **Стенд не сломается:** его скрипт зовёт `pnpm` из nvm (9.15.9), а тот по полю `packageManager` сам скачивает и запускает 11.20.0 — руками на сервере ничего обновлять не нужно. Проверено: `pnpm --version` в проекте печатает `11.20.0`.

**Честная оговорка:** первичный отказ по TTY я наблюдал до правки, но после добавления `confirmModulesPurge: false` воспроизвести его повторно не смог — `node_modules` уже были в раскладке pnpm 11, и путь сноса не запускался даже принудительной переустановкой. То есть настройка стоит там, где её предписывает сам pnpm, и все последующие установки без терминала проходят чисто, но «сломалось → починилось» на одном и том же состоянии я не показал.

**Изменено:** `package.json` (`packageManager`), `.github/workflows/ci.yml` (6 мест), `pnpm-workspace.yaml` (две настройки), `CLAUDE.md` (версия + раздел граблей pnpm 11).

### 5.242 Фаза 5 Task 2 — дашборд методиста (ФТ-H2)

**Ветка:** `feat/2026-08-05-tz-faza5-task2-methodist-dashboard` (после §5.241/PR #454). **Миграций нет, новых прав нет.**

**Что сделано:** `GET /dashboards/methodist` (право `groups.read`) + экран `/methodist` + пункт навигации в блоке «Обзор». Четыре раздела по убыванию срочности: **просрочено** (срок вышел, обучение не завершено), **ближайшие сроки** (горизонт 14 дней), **ждут проверки**, **программы без опубликованного итогового экзамена**. Домашний маршрут методиста переведён с `/courses` на `/methodist`.

**Главное ограничение, вскрытое разведкой: понятия «МОЯ группа» в системе нет.** У `learning.groups` только код, имя и необязательный заказчик — ни куратора, ни ответственного методиста. План задачи был написан со словами «мои группы»; заводить ради этого поле — миграция плюс продуктовые решения (кто назначает ответственного, обязателен ли он, что делать с уже существующими группами), а фаза объявлена безмиграционной. **Поэтому дашборд отвечает на вопрос «где сейчас горит по обучению» в масштабе центра** — ровно то, что просит ТЗ («методист — группы и дедлайны»), и ровно то, что методист и так видит по `groups.read`. Персональная привязка групп — кандидат в отдельную задачу, если владелец её захочет.

**Ключевые решения:**

1. **Ничего не предпосчитывается.** Счётчики пришлось бы пересчитывать при каждом зачислении, переносе срока и публикации теста, и они разъехались бы с действительностью при первом пропущенном событии. Дашборд, который врёт, хуже отсутствующего.
2. **Очередь проверки НЕ считается заново** — переиспользуется `aggregateReviewerQueue`, которым живёт сам экран проверки. Два независимых подсчёта «непроверенных работ» неизбежно разошлись бы, и методист не понимал бы, какому числу верить.
3. **Просроченные не дублируются в «ближайших»** — иначе одно и то же дело считалось бы дважды и завышало объём работы вдвое.
4. **Зачисление без плановой даты дедлайном не становится.** Пустой срок — это ненастроенное зачисление, а не «бессрочное»; придумывать дату за методиста нельзя.
5. **Тест модуля не считается итоговым экзаменом** (итоговый — тот, у которого не задан `moduleId`, и он опубликован). Если считать промежуточный тест экзаменом, пробел исчезнет с экрана, а слушатели упрутся в него вживую.
6. **Пустой раздел показывается явно** («просрочек нет»), а не скрывается: исчезнувший блок читается как «не загрузилось».
7. **Вся арифметика — чистая функция от снимка и даты `asOf`**: дашборд, который нельзя проверить тестом на конкретную дату, начинает врать незаметно.

**Грабли:**

- **Ожидаемая, но неочевидная разница видов (проверена живым посевом курса):** у кого есть `groups.read`, раздел «программы без экзамена» считается **по группам** — курс, не привязанный ни к одной группе, туда НЕ попадает (никто его не проходит, гореть нечему). У методиста прав на группы нет, поэтому он видит **все** свои недоделанные программы. Итог: администратор видит по этому разделу МЕНЬШЕ методиста, и это не баг. Живой прогон: методист — 1 пробел, tenant_admin — 0, курс тот же.
- Сторожевой тест `nav-groups.test.ts` поймал новый пункт меню, не приписанный ни к одному из 10 блоков навигации, — ровно то, ради чего он и написан. Пункт отнесён в «Обзор» к `/workspace`.
- Доменный HTTP-тест снова потребовал регистрации нового сервиса контроллера (третий раз подряд: Task 5 Фазы 4, Task 12, теперь этот). Для проверки 403 добавлен отдельный актор `u_domain_http_no_groups` с полным набором прав МИНУС `groups.read` — так граница проверяется, не ломая остальные сценарии.

**САМОЕ ВАЖНОЕ — ошибку поймал живой прогон, а не тесты: у методиста НЕТ прав `groups.read` и `enrollments.read`.** Первая версия закрыла ручку правом `groups.read` — то есть ровно от того, для кого дашборд написан (живой прогон: методист → **403**). Проверено по боевой базе: у роли `methodist` 43 права, и среди них нет ни одного на группы или зачисления. **Это расхождение самого ТЗ с ролевой моделью:** ТЗ говорит «методист — группы и дедлайны», а в системе группами и сроками ведает `manager` (`groups.*`, `enrollments.*`), методист же отвечает за содержание — курсы, материалы, тесты, вопросы, документы.

**ВТОРАЯ ошибка, вскрытая тем же живым прогоном — и опаснее первой.** Промежуточная версия гейтила сроки правом `enrollments.read`. Но оно есть **и у слушателя** — оно разрешает видеть СВОИ зачисления, а не чужие. То есть слушатель получал бы сроки всех групп центра. На стенде данных нет, поэтому утечки не произошло, но на живом тенанте произошла бы. Прогон это показал прямо: слушатель → 200 с незакрытым разделом сроков.

**Итоговое устройство (после обеих правок):** ручка под `courses.read` (самое широкое из нужных хоть одному разделу), а решение принимает сервис по правам актора:

| Раздел               | Право                       | Кто получает                      |
| -------------------- | --------------------------- | --------------------------------- |
| Сроки и группы       | `groups.read`               | менеджер, администрация           |
| Пробелы в программах | `courses.write`             | методист, администрация           |
| Очередь проверки     | `assessment.reviews.review` | методист, менеджер, администрация |

Сроки — по `groups.read`, а не `enrollments.read`; пробелы — по `courses.write`, а не `courses.read` (читать курсы может и слушатель, а «в какой программе не доделан экзамен» — внутренняя методическая кухня). Без права на группы пробелы считаются **по курсам, без названий групп**: иначе состав обучения утёк бы. **Если не положен ни один раздел — честный 403, а не пустая сводка:** пустышка пустила бы слушателя на страницу персонала. Скрытые разделы перечисляются в `hiddenSections` и показываются как «нет доступа», а не исчезают.

**Вывод для следующих агентов: наборы прав брать из `iam.role_permissions` живой базы, а не из названия роли и не из ТЗ.** Обе ошибки этой задачи — ровно от того, что права были додуманы.

Альтернатива «дать методисту `groups.read`» отвергнута: это расширение полномочий роли миграцией ради удобства экрана — решение владельца, а не деталь дашборда.

**Тесты:** бэкенд **2951** (+22: 11 на сборку, 6 на гейтинг разделов по правам, 3 на HTTP-границу), фронт **877**. `ci:check` exit 0.

**Дальше:** Task 3 — тест-раннер перестаёт терять ответы молча (индикатор соединения + подтверждение ухода со страницы).

### 5.258 ТЗ по редизайну интерфейса внесено в репозиторий (Фаза 0)

**Дата:** 2026-08-11. **Кода нет** — сессия документационная, `pnpm ci:check` не затрагивается.

**Что сделано.** Дельта-ТЗ по редизайну интерфейса (аудит от 2026-08-11, приоритетная роль — администратор
учебного центра) положено в `docs/TZ_UI_REDESIGN_TRUDSKILL.md` и встроено в иерархию SSOT. Заведён живой
трекер `docs/TZ_UI_REDESIGN_STATUS.md` по образцу трекера «Арендной СДО».

**Главное архитектурное решение сессии: у репозитория теперь ДВА действующих дельта-ТЗ**, и они
разделены **предметом**, а не приоритетом:

| ТЗ                                 | Предмет                                     | Приоритет при конфликте |
| ---------------------------------- | ------------------------------------------- | ----------------------- |
| `TZ_TRUDSKILL_ARENDNAYA_SDO.md`    | поведение, функции, права                   | по поведению            |
| `docs/TZ_UI_REDESIGN_TRUDSKILL.md` | представление (ИА, вид, компоненты, тексты) | по представлению        |

Из-за этого фраза **«продолжай по ТЗ» стала двусмысленной** — заведено правило маршрутизации
(`DOCUMENTATION_MAP.md#tz-routing`): по ключевым словам, иначе по предмету задачи, а если задачи нет —
**спросить владельца одним сообщением, а не выбирать молча**. Цена молчаливого выбора здесь — целая фаза
работы не в ту сторону.

**Протокол сверки логики с ТЗ** записан в `CLAUDE.md` (новый раздел): когда сверять, четыре класса
расхождений (дефект логики / дефект UX / дрейф / слепая зона) с разным действием по каждому, куда
записывать и — главное — **границы**: сверка не даёт права править исторические миграции, контракты,
RBAC и URL, ослаблять сторожей или молча расширять задачу.

**Журнал расхождений «код ↔ ТЗ»** заведён и заполнен 11 записями из аудита ТЗ. Три выборочно
переподтверждены по коду (остальные приняты из аудита как есть и помечены источником):

1. Маршрутов ровно **102**, `navSlot: 'more'` ровно **54** — цифры аудита сходятся.
2. `getNavigationView` **написана и покрыта тестом** (`helpers.ts:29`), а `app-shell.tsx:31` берёт
   `getGroupedNavigation`. То есть механизм сокращения меню готов и просто не подключён — Фаза 1 это
   одна строка, а не новая работа.
3. Вызовов подтверждения **9, а не 7**: семь пишутся `window.confirm`, два (`mvp/screens.tsx:2820,2826`) —
   голым `confirm(`. **Сторож по строке `window.confirm` их не поймает** — записано в трекер, чтобы
   будущий `CMP-006` не отчитался о полной замене на неполном шаблоне поиска.

**Развилок владельца — шесть**, все с принятым решением по умолчанию; работу они **не блокируют**.
Отдельно вне списка ТЗ: нужен реальный почтовый домен взамен `no-reply@cdoprof.local` (`BR-032`).

**Замечено и не тронуто:** README §2 называл текущим `§5.253`, тогда как handoff уже дошёл до `§5.257` —
блок состояния отстал на четыре записи. Поправлено только добавлением своей записи; сверку остальных
четырёх оставляю их авторам.

**Файлы:** `docs/TZ_UI_REDESIGN_TRUDSKILL.md` (новый), `docs/TZ_UI_REDESIGN_STATUS.md` (новый),
`docs/DOCUMENTATION_MAP.md`, `README.md`, `AGENTS.md`, `CLAUDE.md`, `LMS_AGENT_HANDOFF.md`.

**Дальше:** Фаза 1 «Навигация и оболочка» — план в `docs/superpowers/plans/` + апрув владельца перед кодом.

### 5.259 Фаза 1 редизайна: меню администратора с 70 пунктов до 7

**Дата:** 2026-08-12. **Ветка:** `claude/trusting-heyrovsky-2845b3`. **План:**
`docs/superpowers/plans/2026-08-11-tz-ui-faza1-navigaciya-i-obolochka.md` (апрувнут владельцем).

**Что увидит администратор.** После входа в сайдбаре семь пунктов своей роли вместо семидесяти
в десяти раскрывающихся блоках. Всё остальное — под пунктом «Ещё», сгруппированное по тем же
десяти блокам ИА, плюс палитра `Ctrl+K`. При первом входе однократная подсказка, куда всё уехало.

**Ключевой факт: работа была уже сделана до этой фазы и просто не подключена.** `getNavigationView`
написана и покрыта тестом, 54 пункта размечены `navSlot: 'more'`, короткие меню ролей объявлены —
не хватало одной строки в `app-shell.tsx:31`, которая всё это вызовет. Поэтому фаза дешёвая.

**Разбиение маршрутов НЕ тронуто.** `ia-architecture.e2e.test.ts` зелёный без единой правки:
10 блоков остаются полным разбиением 102 маршрутов, изменился только слой видимости.

**Четыре расхождения, вскрытые разведкой (журнал ТЗ, записи 12–16):**

1. ТЗ §4.8 считало, что `navigation-shell.e2e.test.ts` стережёт структуру сайдбара. Это были
   13 строк смоук-импорта: **у каркаса не было ни одного инварианта**. Переписан на 8, из них
   два несущих — «у администратора ≤7 пунктов» (GOAL-1) и «main + more покрывают ВСЕ видимые
   пункты» (GOAL-5, ни один раздел не потерян). Добавлен сторож самой метрики: если пунктов у
   роли станет ≤7, первая проверка начнёт проходить по построению и перестанет что-либо значить.
2. `token-discipline.test.ts` проверял только радиусы. Один и тот же `rgba(15,23,42,0.45)` жил в
   трёх местах пакета, переезд CSS каркаса добавил бы четвёртое. Введён токен `--ui-overlay`
   (в тёмной теме плотнее — под ним тёмный фон) и сторож заливок.
3. Роль `manager` есть в системе и в ТЗ, а blueprint'а не было — короткого меню у неё не
   существовало вовсе.
4. **Порядок ролей в `roleBlueprints` оказался значимым и никем не охраняемым.**
   `getSessionRoleBlueprints` фильтрует массив и сохраняет порядок объявления, меню берётся у
   первой. `tenant_admin` стоял четвёртым: администратор, которому выдали ещё и роль
   преподавателя, получал меню преподавателя. Пока меню было общим на 70 пунктов, это ничего не
   меняло; после сокращения до семи стало бы потерей разделов. Порядок задан от полной роли к
   узкой и закреплён тестом. Найдено не чтением кода, а попыткой написать тест на IA-014.

**Два блокера окружения, к фазе отношения не имеющие (записи 17–18, отдельный PR #490):**

- **`pnpm lint` не работал ни в одном из 9 пакетов, а значит и весь `ci:check`.** Корневой
  `eslint.config.mjs:1` импортирует `@next/eslint-plugin-next`, не объявленный в зависимостях; он
  приезжал транзитивно и был виден за счёт подъёма пакетов. #447 добавил прямой импорт, #460
  перевёл на pnpm 11 со строгой раскладкой, Actions выключены с 27.05 — сообщить было некому.
  Записи прошлых сессий «ci:check exit 0» не ложь: они прогонялись в копиях со старым, ещё
  поднятым `node_modules`. При включении Actions CI покраснел бы на первом прогоне.
- `.prettierignore` не исключал лок-файлы: первый же коммит с `pnpm-lock.yaml` дал **6420 строк**
  переформатирования машинного файла.

**Оставлено открытым осознанно (записи 19–20):** литеральные цвета ещё двух классов — тени и
белое на цветном (18 вхождений); отсутствие `apps/frontend/.env.local` в свежей копии, без
которого `next build` падает на валидации `NEXT_PUBLIC_*`. Первое — чужой рефакторинг, второе —
недостающий шаг настройки, оба вне рамок фазы.

**Отклонения от плана:** порядок задач 4 и 5 переставлен (токен должен появиться раньше переезда
CSS, иначе промежуточный коммит красный); сторож цвета сужен до заливок; тест подсказки написан
на подставном хранилище, а не на `window.localStorage` (в проекте нет jsdom); слой `shell.ts`
вместо дописки в `layout.ts` — согласовано с владельцем до начала.

**Файлы (14):** `features/navigation/{role-blueprints.ts,role-blueprints.test.ts,nav-groups.ts,nav-groups.test.ts}`,
`widgets/shell/{app-shell.tsx,command-palette.tsx,nav-hint.tsx,nav-hint-storage.ts,nav-hint-storage.test.ts}`,
`e2e/navigation-shell.e2e.test.ts`, `packages/ui/src/styles/{shell.ts,index.ts,token-discipline.test.ts,smoke-visual.test.tsx,modal.ts,foundation.ts}`,
`packages/ui/src/tokens/{index.ts,base-vars.test.ts}`, `docs/FRONTEND_UX_GOVERNANCE.md`.

**Размеры:** `app-shell.tsx` 572 → 284 строки, `command-palette.tsx` 192 → 116; 364 строки CSS
переехали в пакет.

**Тесты:** пакет ui 24 файла / 82 теста; фронт навигация+e2e+widgets 41 файл / 326 тестов;
typecheck 13/13; `pnpm lint` 9/9. Миграций нет, URL не менялись, контракты не менялись.

**Дальше:** Фаза 2 «Эталонный реестр и карточка» — `/learners` и `/learners/[id]` как образцы для
остальных экранов; обязателен замер p95 до и после (`MET-003`, §12.1 «Арендной СДО» не выполнено).

### 5.260 Фаза 1: добивка после дубля — сторож styled-jsx на всё дерево

**Дата:** 2026-08-12. **Ветка:** `worktree-ui-redesign-faza1-navigation` (PR #492).

**Что произошло.** Фазу 1 параллельно делали **две сессии**: PR #491 влит в `main` 2026-08-11 в 22:04,
эта ветка была открыта тем же вечером. Реализации совпали по существу — обе подключили
`getNavigationView`, переписали `primaryNav`, вынесли CSS каркаса под сторожей. Это ровно риск №11
из трекера «Арендной СДО» (там же Task 6 Фазы 3 был сделан дважды).

**Как разрешено.** Влитая работа принята каноном: при слиянии `main` все 13 конфликтных файлов взяты
её версией, дублирующие файлы этой ветки удалены (`nav-hint.ts`/`nav-hint.test.ts` — в `main` лучше
названный `nav-hint-storage.ts` с ключом под новый бренд; свой план фазы; свой слой CSS в `layout.ts` —
в `main` он отдельным `shell.ts`, что чище). От ветки осталось только то, чего в `main` нет.

**Что осталось полезного:**

1. **`styled-jsx-ban.e2e.test.ts`** — сторож `UI-022` обходит **всё дерево** `apps/frontend` с явным
   списком исключений. Версия в `main` проверяет два файла оболочки по именам, то есть `<style jsx>`
   в любом новом компоненте прошёл бы незамеченным (запись 22 журнала).
2. **Тесты состава меню** в `helpers.test.ts` (потолок 7, первый пункт — оперативная панель, ежедневные
   разделы на виду, ничего не теряется между `main` и «Ещё») и проверка пути роли в `lms-role-flows`.
   Проверяют тот же инвариант на уровне чистых функций — 29 тестов зелёные против кода из `main`.
3. **Запись 21 журнала:** роли **`teacher` нет ни в одной живой базе** (`iam.roles` в базах разработки
   и стенда — `counterparty_rep`, `learner`, `manager`, `methodist`, `platform_admin`, `tenant_admin`)
   и нет в бэкенде, хотя она описана и в коде фронта, и в ТЗ §4.4. Обратный случай — `counterparty_rep`
   есть в базе, а blueprint отсутствует. Нужно решение владельца: роль планируется или запись мёртвая.

**Что намеренно НЕ возвращено:** токены `--ui-sidebar-width` / `--ui-sidebar-drawer-width` /
`--ui-topbar-height` вместо чисел `260px`/`300px`/`64px` в `shell.ts`. В проекте есть принятая практика
(комментарий в `layout.ts` про `320px`): структурные величины остаются числами, токенизируются только
spacing и radius. Тащить свой подход в чужой свежий код без решения владельца — не тот случай.

**Тесты после слияния:** фронт 1012 (151 файл), `@trudskill/ui` 84 (24 файла), typecheck 13/13.

**Попутно: `main` оказался красным, и это не заметили при вливании #491.** CI на самом `main`
(прогон `31540810892`) валит две джобы, и обе — не про Фазу 1:

1. **`turbo.json`: `test` зависел от `^test`, но не от `^build`.** Тесты пакетов импортируют соседей
   по имени пакета (`@trudskill/shared-types`, `@trudskill/docx-render`), те резолвятся через
   `exports` → `dist`. Без сборки зависимостей vitest падает «Failed to resolve entry for package».
   Локально это маскировалось ранее собранным `dist` — поэтому у всех «зелено», а в CI красно.
   Исправлено `dependsOn: ["^test", "^build"]`. **Проверено с нуля:** `rm -rf packages/*/dist` →
   turbo сам собирает зависимости → 84 теста `ui` зелёные, ошибки резолва нет.
   ⚠️ Грабля: комментарий `"//"` в `turbo.json` **не допускается** — turbo падает с
   `Found an unknown key`. Пояснение живёт здесь, а не в конфиге.
2. **Сборка падала на пререндере `/audit`:** витрина валидирует `NEXT_PUBLIC_*` схемой Zod, а
   `.env.local` в gitignore. В журнале трекера это уже было записью 20 с пометкой «не дефект кода» —
   на деле именно из-за неё красная сборка. В шаг `Build` рабочего процесса добавлены значения-заглушки.

Обе починки — в этой ветке, записи 23 и 24 журнала расхождений.

**Дальше вскрылось то, что важнее самой фазы: собранный бэкенд не запускался вообще.** Как только
две джобы выше позеленели, впервые за долгое время стартовала джоба `Backend image smoke test` —
и вскрыла четыре поломки подряд (записи 25–26 журнала):

1. **`Dockerfile` не знал про `docx-render`.** Пакет добавлен в Фазе 1 «Документы» и импортируется
   бэкендом, но его нет ни в списке копируемых манифестов, ни в цепочке сборки → `TS6305`.
2. **В финальный слой копировались только корневые `node_modules`.** pnpm держит зависимости
   приложения в `apps/backend/node_modules` (симлинки в хранилище `.pnpm`), поэтому образ собирался,
   но падал на старте: `Cannot find package 'reflect-metadata'`.
3. **Набор переменных smoke-джобы отстал от кода на шесть значений** (`DEPLOYMENT_PROFILE`,
   `MVP_PERSISTENCE_DRIVER`, `DOCUMENTS_PERSISTENCE_DRIVER`, `SCORM_CONTENT_TOKEN_SECRET`,
   `ESIA_STATE_SECRET`, `METRICS_TOKEN`, плюс `INTEGRATION_CRYPTO_KEYS` с ключом ровно на 32 байта).
4. **`VideoProviderResolver` объявлен классом при примитиве в конструкторе** — Nest в собранном виде
   ищет `String` и падает. Тот же дефект чинили у вебинарного и платёжного резолверов (§5.187);
   видео-резолвер Фазы 2 его повторил, а сторож `di-explicit-injection` не поймал, потому что файла
   не было в списке `FACTORY_INSTANTIATED`. Переведён на фабрику, файл в список внесён.

**Проверено вживую, а не по логам CI:** образ собран локально, запущен с тем же набором переменных,
что в джобе, `GET /api/v1/health/live` → **200**.

**Попутно — отдельный дефект логики (запись 26): `z.coerce.boolean()` читает строку `"false"` как
`true`.** Четыре флага делали обратное написанному: `ALLOW_IN_MEMORY_STATE` (состояние в памяти вместо
базы), `LMS_DUAL_WRITE_ENABLED`, `DOCUMENTS_DUAL_WRITE_ENABLED`, `OUTBOX_PUBLISHER_ENABLED`
(публикатор нельзя было выключить). В `env.schema.ts` про ловушку знали — у `ANTIVIRUS_ENABLED`
и ещё десяти флагов стоит правильный разбор с комментарием-предупреждением, эти четыре пропустили.
Заведён общий `booleanFromEnv`, добавлены тесты на `"false"`/`"true"` и сторож, запрещающий
объявлять поля схемы через приведение к булеву.

**Дальше:** Фаза 2 без изменений. **Урок для протокола:** проверки `gh pr list` перед стартом мало —
параллельная ветка может открыться позже. Стоит объявлять фазу в трекере при старте, а не по завершении.
**Второй урок:** зелёный локальный `ci:check` ≠ зелёный CI. Локально собранный `dist` и созданный руками
`.env.local` маскируют обе поломки выше.

### 5.261 Фаза 2 редизайна — эталонный реестр и карточка (ЗАКРЫТА)

**Дата:** 2026-08-12. **Ветка:** `worktree-ui-redesign-faza2-learners`.
**ТЗ:** редизайн, Фаза 2 (`CMP-001`, `CMP-002`, `CMP-003`, `CMP-010`, `CMP-011`, `CMP-014`, `IA-001`, `MET-003`).
План — `docs/superpowers/plans/2026-08-12-tz-ui-faza2-etalonnyy-reestr.md`.

**Первым делом — объявление занятости.** Урок §5.260 применён сразу: строка Фазы 2 в трекере переведена
в «в работе» с именем ветки **до** написания кода и запушена отдельным коммитом. Параллельная сессия
теперь видит занятость до того, как напишет свою реализацию.

**Шесть компонентов в `@trudskill/ui`** (все дополнения к существующим — обратно совместимы, иначе
разом сломались бы 30 экранов, которые ими пользуются):

1. **`CMP-001`** — выделение строк, действия строки, плотность. Логика выделения вынесена в чистые
   функции `table/selection.ts` (9 тестов): выделение хранится ключами и **переживает смену страницы**,
   «выделить все» не сбрасывает выбранное на других страницах, пустая таблица не считается выделенной.
   Грабля: ячейки собираются одним списком, а не тернарниками с `null` — иначе структура разметки
   меняется даже при выключенных опциях, и сторож `foundation.test.tsx` это ловит (поймал).
2. **`CMP-002`** — `visibleColumnKeys` у таблицы + `ColumnPicker` в панель фильтров. Правила
   консервативные: первая колонка не скрывается, порча сохранённого набора = «показать все»,
   а не пустой реестр.
3. **`CMP-003`** — `primary`/`secondary`/`activeCount`/`onReset`/`extra` у `FilterBar`. Счётчик активных
   скрытых фильтров — обязательный сигнал: свёрнутые фильтры без него означают короткий список
   без объяснения причины.
4. **`CMP-010`** — `DetailDrawer`. Ловушка фокуса, `Esc` и блокировка прокрутки **вынесены из `Modal`**
   в общий `components/overlay/focus.ts`, и `Modal` переведён на него же: две копии одной механики
   неизбежно разъезжаются — именно так в приложении завелись пять независимых дроверов.
5. **`CMP-011`** — `BulkActionBar`. Частичный успех реализован как обязательное состояние: отказы
   выводятся **поимённо с причиной**, а не сводкой «12 из 15».
6. **`CMP-014`** — `EmptyState.action`. Дефолт «Нет данных» заменён на «Пока пусто» (`TXT-005` эту
   формулировку запрещает); сторож `states.test.tsx` переписан с проверки конкретной строки на
   проверку самого правила — это ужесточение, а не ослабление.

**Применение на `/learners`:** карточка открывается панелью рядом со списком вместо модалки поверх
экрана; массовое архивирование идёт по одному через существующую ручку `updateProfile`
(**контракт API не менялся** — это ограничение фазы) и возвращает поимённый итог; пустое состояние
объясняет, что за раздел и что сделать первым.

**`IA-001`:** сторож единых состояний расширен с `src/features/*screen*.tsx` (~46 файлов) на `app/**`
и **все** `.tsx` в `features/` — 150+ файлов. Вскрылось 9 нарушителей: карточка слушателя починена
переездом на `DetailDrawer`, остальные 8 внесены в **явный список исключений с указанием фазы**
(четыре дровера и модалка — Фаза 4, карточка дашборда слушателя — Фаза 6). Список — очередь, а не
разрешение; продублирован в журнал расхождений (запись 27).

**`MET-003`:** p95 списка на стенде — **15,8 мс**, медиана 10,9 мс (20 запросов). Оговорка: фаза
меняла только интерфейс, серверная часть не тронута, поэтому «до» и «после» по API совпадают
по построению; замер UI в браузере возможен только после вливания — стенд собирается из `main`.

**Найдено попутно (записи 28–29 журнала):** колонка «Подразделение» показывает **сырой идентификатор**
`ou_…` как значение — и на `/learners`, и в карточке `mvp/screens.tsx:467`; справочника названий на
фронте нет вовсе. В фазе колонка скрыта по умолчанию, показать название нельзя без новой ручки API —
**нужно решение владельца**. Плюс «Нет данных для графика» на экране аналитики (Фаза 4).

**Тесты:** `@trudskill/ui` 118 (было 93), фронт 1012, typecheck 13/13.

**Дальше:** Фаза 3 «Стартовый экран администратора» — `/workspace` с пяти блоков до трёх, `CMP-013`
(`AttentionWidget`), `CMP-004` (`StatCard` с трендом), убрать колонку «Маршрут» с сырым URL.

### 5.262 Фаза 3 редизайна — стартовый экран администратора (ЗАКРЫТА)

**Дата:** 2026-08-12. **Ветка:** `worktree-ui-redesign-faza3-workspace`.
**ТЗ:** редизайн, Фаза 3 (`IA-016`, `IA-016.1`, `IA-016.2`, `IA-016.3`, `CMP-004`, `CMP-013`).
Фаза объявлена занятой в трекере **до кода** — правило, введённое после дубля Фазы 1.

**Было:** пять блоков подряд, три таблицы, в каждой колонка «Маршрут» с сырым адресом страницы,
первичное действие «Обновить», англицизмы в интерфейсе («Задачи inbox», «Все severity»,
«Загружаем workspace…»). Экран перечислял всё, что знает, вместо ответа «что горит».

**Стало — три зоны:**

1. **Сводка** — три `StatCard`. Каждая карточка ведёт туда, где с этим работают: показатель
   без перехода оставляет вопрос «а дальше что». В `CMP-004` **`direction` и `tone` разделены
   намеренно**: рост числа блокеров — это стрелка вверх и одновременно плохая новость; слить их
   в одно поле значит покрасить тревожный рост зелёным.
2. **«Разобрать»** — одна очередь вместо трёх таблиц (`CMP-013`). Блокеры и просроченные задачи
   сводятся в общий список по убыванию срочности: пока они лежат отдельно, приоритет между ними
   расставляет сам администратор — ровно та работа, которую панель должна с него снять. Сортировка
   и определение просрочки — чистые функции (`attention.ts`, 7 тестов), сборка очереди —
   `features/workspace/attention.ts` (6 тестов). Задачи «открыта» и «в работе» в очередь не идут:
   очередь — это то, что горит, а не всё подряд.
3. **Ниже сгиба** — сценарий роли, полные списки задач и блокеров, виджеты бывшего кокпита.

**`IA-016.1`:** колонка «Маршрут» удалена из всех трёх таблиц — адрес страницы это не данные;
название строки ведёт туда же, куда вёл сырой URL.
**`IA-016.2`:** «Обновить» стало вторичной кнопкой. Первичного действия у панели наблюдения нет
вовсе — бюджет требует «не более одного», а не «ровно одно».

**⚠️ `IA-016.3` — меняет поведение (ТЗ §4.9), владелец предупреждён до реализации:**
`/admin/cockpit` → `redirect('/workspace')`. Оба экрана отвечали на один вопрос «что сейчас
происходит», и человеку приходилось помнить, что где. Адрес сохранён редиректом, чтобы закладки
не приводили в никуда; виджеты `RoleWidgetGrid` переехали в нижнюю зону панели.

**Тексты (`TXT-001`, `TXT-006`):** «Задачи inbox» → «Задачи», «Все severity» → «Любая критичность»,
«Загружаем workspace…» → «Загружаем оперативную панель…», статусы и критичность выводятся словами,
а не кодами (`open`, `high`).

**Тесты:** `@trudskill/ui` 128 (было 118), фронт 1018, typecheck 13/13.

**Дальше:** Фаза 4 «Админские экраны волнами» — 4 PR по волнам §8.1, внутри `IA-018` (сборка
настроек), `IA-017` (редиректы дублей), `CMP-006` (замена `window.confirm` — ⚠️ **9 вызовов,
из них 2 голым `confirm(`**, поиск только по `window.confirm` их не найдёт), разбиение
`features/mvp/screens.tsx` по плану §8.3.

### 5.263 Фаза 4, срез 1 — браузерные окна и дубли адресов (ЗАКРЫТ)

**Дата:** 2026-08-12. **Ветка:** `worktree-ui-redesign-faza4-srez1`.
**ТЗ:** редизайн, Фаза 4 (`CMP-006`, `CMP-005` частично, `IA-017` частично).

Фаза 4 по ТЗ — четыре PR по волнам экранов. Этот срез взял **сквозные правила**: они конечны,
затрагивают все экраны сразу и не требуют переписывания 766-строчного `/documents`.

**`CMP-006`: заменены все 9 браузерных подтверждений.** Ключевое — **два из них написаны голой
формой вызова, без префикса `window`** (`mvp/screens.tsx`, экран комиссии). Поиск по строке
«window.confirm», которым пользовался аудит ТЗ, их не находил; в трекере это уже стояло записью 9
как предупреждение, и оно подтвердилось.

**Механика вынесена в хук `useConfirmDialog`** (`packages/ui/src/components/dialogs/use-confirm.tsx`):
замена вручную на семи экранах означала бы одно и то же состояние, написанное семь раз. Вызов
остаётся таким же коротким, как `confirm`, но рисует диалог приложения.

**В хук добавлено необязательное поле ввода** — оно заменило `window.prompt` в очереди
переаттестации, где на одно действие открывалось **два окна браузера подряд** (подтверждение,
затем запрос причины). Причина отклонения не потерялась, она теперь поле в том же диалоге.

**`CMP-005` частично:** `tone: 'danger'` — опасная кнопка отличается от обычной. В браузерном
`confirm()` обе кнопки выглядели одинаково, и «Удалить» ничем не отличалось от «Сохранить».

**Сторож `browser-dialogs-ban.e2e.test.ts`** ловит **обе формы вызова** (`window.confirm` и голый
`confirm`) плюс `prompt` и `alert`, и отдельным тестом проверяет сам сканер — именно на голой форме
промахнулся прошлый поиск. Свои функции (`confirmPayment`, `onConfirm`) под запрет не попадают.

**Найдено сторожем сверх аудита (запись 30 журнала):** два `window.alert` в заглушках скачивания на
экранах слушателя — `alert` в ТЗ не считал никто. Внесены в явный список исключений: экраны
слушателя переписываются в Фазе 6, чинить их сейчас — править то, что через фазу уедет целиком.

**`IA-017` частично:** `/admin/learners` рендерил ТОТ ЖЕ экран, что и `/learners` — два адреса на
один реестр. Теперь редирект (⚠️ меняет поведение, §4.9; адрес сохранён, ссылки живут).

**Тесты:** фронт 1020 (было 1018, +2 сторожа), `@trudskill/ui` 128, typecheck 13/13.

**Дальше — срез 2 Фазы 4:** волна 1 экранов по §8.2 (`/groups` + карточка, `/admin/issuance-journal`,
`/admin/bulk-enrollments`) и **разбиение `/documents` (766 строк) ДО редизайна** — по правилу
`SCR-001` перенос «как есть» и редизайн не совмещаются в одном коммите. Затем `IA-018` (сборка
настроек в один экран с якорями).

### 5.264 Фаза 4, срез 2 — разбиение монолитов волны 1 (ЗАКРЫТ)

**Дата:** 2026-08-13. **Ветка:** `worktree-ui-redesign-faza4-srez2`.
**ТЗ:** редизайн, Фаза 4, §8.2–§8.3, правило `SCR-001` (перенос «как есть», диф читается как
перемещение; редизайн перенесённого — отдельный срез).

**Что переехало:**

1. **`/documents` — крупнейший файл приложения (766 строк)** — из `app/documents/page.tsx`
   в `features/documents/documents-screen.tsx`. `page.tsx` стал обёрткой на **14 строк**
   (критерий §8.2 «≤20 строк» выполнен), и экран **впервые попал под расширенный сторож
   единых состояний** (`IA-001` сканирует `features/**`; `app/**` он тоже сканирует, но цель
   разбиения — чтобы дальше секции жили отдельными файлами фичи). Изменения при переносе —
   только пути импортов и снятие обёртки `ProtectedPage` (осталась в `page.tsx`).
2. **`LearnerDetailsScreen`** → `features/learners/learner-detail-screen.tsx` (§8.3, порядок 1).
3. **`GroupsPageScreen`, `GroupCreateScreen`, `GroupDetailsScreen`** → `features/groups/`
   (§8.3, порядок 2). Обновлены четыре страницы `app/**`, других импортёров не было
   (проверено grep, e2e-тесты монолит напрямую не импортируют).
4. **Разделяемые мелочи монолита** (`PaginationControls`, `readApiMessage`, `ProgressBar`,
   `MutationError`) — в `features/mvp/screen-helpers.tsx`: это общий слой по §8.3
   («хуки и общее остаются в `features/mvp/` до отъезда последнего экрана»). Вынесены,
   а не продублированы: используются и оставшимися экранами (25 вхождений), и переехавшими.

**Монолит `mvp/screens.tsx`: 3019 → 2606 строк.** Поведение не менялось нигде.

**Оговорка про состояние `/documents`:** экран остался одним компонентом — его состояние
переплетено (общий `actionError`, один выбор шаблона на три секции). Раскладка на секции
с раздельным состоянием — это уже редизайн, и по `SCR-001` она делается следующим срезом,
а не под видом переноса.

**Тесты:** фронт 1020 (все прежние, ни один не правился — перенос их не задел), typecheck 13/13.

**Дальше — срез 3 Фазы 4:** редизайн вынесенных экранов волны 1 (`/groups` → `ListPage`
с выделением и «Закрыть группы», карточка группы → `DetailLayout` с единственным первичным
действием, `/admin/issuance-journal` → `DetailDrawer`, `/admin/bulk-enrollments` — частичный
успех поимённо), затем `IA-018` (сборка настроек).

### 5.265 Фаза 4, срез 3 — редизайн экранов волны 1 (ЗАКРЫТ)

**Дата:** 2026-08-13. **Ветка:** `worktree-ui-redesign-faza4-srez3`.
**ТЗ:** редизайн, Фаза 4, §8.2 (`TPL-001`, `TPL-002`, `CMP-010`, `CMP-014`, `UI-007`, `TXT-006`).

**Карточка группы — главное изменение среза.** Первичным действием было «Сгенерировать приказ»
(частная операция), а **закрытие группы вообще жило на другом экране** — в журнале выдачи, где
администратор вписывал идентификатор группы руками, скопировав его из адресной строки. Теперь:

- `DetailLayout`: слева работа с группой, справа сводка (`KeyValueList` + прогресс), на 1024px
  боковая колонка уходит вниз сама;
- **«Закрыть группу» — единственное первичное действие** (`UI-007`), открывает `DetailDrawer`
  с уже подставленной группой. `JOB-A3` («закрыть группу и выдать документы») — два клика
  от оперативной панели, как требует ТЗ §3.1;
- «Сгенерировать приказ» и прочее — вторичные.

**Секция закрытия переиспользована, а не продублирована:** `CloseGroupSection` получила
необязательный проп `groupId`; когда он задан, поле ввода не показывается. Без пропа поведение
прежнее — журнал выдачи, где секция живёт с Фазы 1, не тронут.

**Реестр групп (`TPL-001`):** был маркированный список ссылок `<ul><li>` — ни статуса, ни кода,
ни действия, а пустое состояние сообщало «Нет групп» (формулировка запрещена `TXT-005`). Стало:
таблица со статусом, действие строки, пустой экран, который объясняет, что такое группа и
предлагает создать первую.

**Отзыв/перевыпуск документа (`CMP-010`):** своя разметка модалки (`ui-modal*`, восьмая
реализация «посмотреть/поправить объект») → `DetailDrawer`. Ловушка фокуса, `Esc` и
подтверждение при закрытии с несохранённой причиной пришли из общего слоя; журнал остаётся
виден — причину аннулирования пишут, глядя на строку документа.

**`AsyncSection` научился `emptyAction`** (`CMP-014`) — иначе каждый экран рисовал бы своё пустое
состояние в обход общей цепочки. Дополнение обратно совместимо, +2 теста.

**`TXT-006`:** статусы зачислений в карточке группы выводятся словами («Учится», «Завершил»),
а не кодами `active`/`completed`.

**Записано в журнал расхождений (запись 31):** ТЗ §8.2 требует у реестра групп выделение строк
и массовое «Закрыть группы», но **массовой операции в API нет** — закрытие требует выбора
шаблонов протокола и удостоверения и идёт по одной группе. Чекбоксы, за которыми нет операции,
я не ставил: это обман интерфейса. Нужна массовая ручка либо решение владельца, что закрытие
остаётся поштучным.

**Тесты:** фронт 1020, `@trudskill/ui` 130 (+2), typecheck 13/13.

**Дальше — срез 4 Фазы 4:** `IA-018` (сборка настроек в один экран с якорями + редиректы трёх
`*/settings`), `/admin/bulk-enrollments` (частичный успех поимённо), затем волны 2–4 экранов.

### 5.266 Фаза 4, срез 4 — сборка настроек (ЗАКРЫТ)

**Дата:** 2026-08-13. **Ветка:** `worktree-ui-redesign-faza4-srez4`. **ТЗ:** `IA-018`, §4.7.

**Было:** блок «Настройки и система» — **14 пунктов меню** при бюджете ≤7. Нужную настройку
искали перебором, а сам `/settings` показывал только профиль, тему и бренд — то есть личные
параметры, а не настройки центра.

**Стало:** `/settings` — единый вход. Наверху оглавление плитками, у каждой подсказка «что
здесь настраивают» (не голый список названий — иначе разделы открывают наугад). Ниже —
встроенные секции.

**Что встроено, а что осталось отдельным маршрутом.** Встроены только три коротких блока —
платёжный провайдер, адреса для копий писем, площадка вебинаров: у каждого по три-четыре поля,
и отдельный пункт меню под них не окупался. Их прежние адреса стали редиректами на якоря
(`/settings#payments`, `#notifications`, `#webinars`) — ⚠️ **меняет поведение (§4.9), владелец
предупреждён до реализации**; сохранённые ссылки работают.

Крупные разделы — лицензии, потребление, эксплуатация, интеграции, журнал обмена, телефония,
реквизиты центра, пользователи, платформа — **остались своими маршрутами** и попали в оглавление
ссылками. ТЗ §4.7 это прямо предписывает: «экраны не сливаются в один файл, иначе получится
второй `mvp/screens.tsx`».

**Как выделены секции:** в каждом из трёх экранов появился экспорт секции (тело без
`PageContainer`/`PageHeader`), а прежний экран стал обёрткой над ней — дублирования разметки нет,
и сторожа `payments-settings.e2e` / `webinars.e2e`, которые проверяют существование экранов,
остались зелёными.

**Права разделов берутся из `navigationModel`** (`features/settings/sections.ts`), а не выписаны
заново: два независимых списка прав на одни и те же маршруты разошлись бы при первой правке RBAC.
Раздел без прав не показывается — ссылка, ведущая на «нет доступа», это не оглавление, а ловушка.

**Тесты:** +7 на оглавление (в т.ч. «каждая ссылка ведёт на существующий маршрут навигации» —
ловит опечатку в адресе, и «раздел без прав скрыт»). Фронт 1027, `@trudskill/ui` 130, typecheck 13/13.

**Дальше — срез 5 Фазы 4:** волны 2–4 экранов по §8.1 (`/assessment`, `/admin/tests`,
`/admin/clients`, `/courses` и др.), `/admin/bulk-enrollments` (частичный успех поимённо),
разбиение монолита §8.3 порядки 4–9. Затем Фаза 5 «Тёмная тема».

### 5.267 Фаза 4, срез 5 — мастера волны 1 (ЗАКРЫТ)

**Дата:** 2026-08-13. **Ветка:** `worktree-ui-redesign-faza4-srez5`. **ТЗ:** `TPL-004` §7.4,
волна 1 §8.2, `CMP-011`.

**Зачисление списком (`/admin/bulk-enrollments`).**

_Было:_ четыре пронумерованных блока, открытых одновременно. Кнопку «Загрузить N валидных строк»
можно было нажать, не выбрав группу, — она просто оставалась серой, не объясняя почему.

_Стало:_ три шага (`Файл` → `Проверка` → `Результат`), на каждом **одно** первичное действие,
называющее результат: «Далее: проверка» → «Зачислить 12 в группу «ОТ-03-26»» → «Открыть группу».
Файл, разобранный без ошибок, сам переводит на второй шаг.

**Главная правка — отчёт перестал терять людей.** Итог считался от ответа сервера, а на сервер
уходили только валидные строки: в предпросмотре человек видел «ошибок 2», а после загрузки —
восемь успешных и ни слова про остальных двоих. Теперь итог считается **от файла**
(`features/bulk-enrollments/outcome.ts`): локальные и серверные отказы идут одним списком
**поимённо с причиной** («Петров Пётр (строка 3) — СНИЛС не проходит проверку»). «Уже был
зачислен» отнесён к успеху, а не к отказам: повторная загрузка того же файла не должна выглядеть
как поломка. Отказ без текста причины больше не показывает человеку код ошибки.

Убран сырой идентификатор учётки (`(учётка 5f3c…)`) — имя стало ссылкой на карточку слушателя.

**Форма создания группы (`/groups/new`).** Экран назывался «Мастер создания группы», хотя мастера
в нём нет — это два поля. Переведён на композицию формы пакета (одна колонка, ширина из нового
токена `--ui-form-max: 720px`), подписи получили подсказки («Так группу будут искать в реестре»,
«Метка для документов и выгрузок»), кнопка называет результат — «Создать группу», рядом «Отмена».

**В пакет `@trudskill/ui` добавлено два компонента:**

1. `WizardSteps` — шаги мастера. Разметку степпера в приложении уже дважды скопировали по экранам
   (`course-wizard`, `mvp/screens`); третья копия не заводилась. Назад вернуться можно, вперёд
   перепрыгнуть нельзя. На 360px полоса шагов заменяется строкой «Шаг 2 из 3: Проверка»
   (требование §7.4) — правило закреплено в стороже `phone-breakpoint`.
2. `OperationOutcome` — итог операции. Список отказов жил внутри `BulkActionBar`; экрану импорта
   пришлось бы его повторить, с риском «здесь поимённо, а здесь числом». Теперь разметка одна,
   `BulkActionBar` использует её же.

**Вскрыто попутно (журнал расхождений, записи 32–38).** Цвет статусов в предпросмотре брался из
`--ui-success-700` и `--ui-error-700` — **таких переменных в палитре нет**, браузер молча
подставлял литералы `green`/`red` мимо палитры и мимо контраста тёмной темы. Сторож дисциплины
токенов ловит радиусы и заливки, но не ссылку на несуществующую переменную — кандидат в Фазу 5.

**⚠️ Волна 1 всё ещё НЕ закрыта** (запись 38): карточка слушателя — «эталон карточки» по ТЗ —
показывает `ID: <uuid>` строкой, «Связанный IAM user», «Курс (id)» и статусы кодами;
`/documents` (763 строки) остался одним компонентом без `TPL-001`; журнал выдачи не переехал
на `ListPage`.

**Тесты:** `@trudskill/ui` 144 (+14), фронт 1035 (+8), typecheck чист, eslint 0.
`pnpm ci:check` — exit 0.

**⚠️ CI на GitHub выключен владельцем 2026-08-13** до восстановления лимитов (следующий месяц),
поэтому проверки на PR не приходят: вердикт даёт локальный `pnpm ci:check`. Включить обратно —
`gh api -X PUT repos/aiprocadm/trudskill/actions/permissions -F enabled=true` (именно `-F`:
`-f` шлёт строку и падает с 422).

**Дальше — срез 6 Фазы 4:** хвост волны 1 — карточка слушателя под `TPL-002` (`DetailLayout` +
`KeyValueList`, названия вместо идентификаторов), `/documents` под `TPL-001`, журнал выдачи на
`ListPage`. Затем волна 2: `/assessment` (§8.3 порядок 4), `/admin/tests`, `/reports`.

### 5.268 Фаза 4, срез 6 — хвост волны 1: карточка слушателя и книга выдачи (ЗАКРЫТ)

**Дата:** 2026-08-13. **Ветка:** `worktree-ui-redesign-faza4-srez6`. **ТЗ:** `TPL-002`, `TPL-001`,
`CMP-003`, `TXT-006`, волна 1 §8.2.

**Карточка слушателя — по ТЗ это «эталон карточки», а она печатала коды.**

_Было:_ заголовок «Карточка слушателя» — одинаковый для всех людей; строка `ID: 3f7a…`; подпись
«Код (learnerNo)»; «Связанный IAM user» с идентификатором; в зачислениях — «Курс (id)» и «Группа»
кодами, статус кодом (`active`), дата машинной строкой. Ни одно из этих значений администратору
ничего не сообщает.

_Стало:_ заголовок — имя человека; раскладка `DetailLayout`, справа сводка `KeyValueList`
(состояние, личный номер, почта, **«Вход в кабинет: открыт / не открыт»** вместо идентификатора
учётки, дата заведения). В зачислениях — название курса, название группы ссылкой на её карточку,
состояние словом, дата по-русски.

Названия курса и группы берутся **из справочников по идентификаторам**: ручки, отдающей зачисления
сразу с названиями, в контракте нет, а контракт в фазах редизайна не меняется (ТЗ §14.1). Если
названия в справочнике не нашлось — прочерк, а не код.

**Книга выдачи — на каркас реестра.**

- `ListPage` вместо самодельных карточек, пагинации и состояний.
- Видимых фильтров три (бюджет §13.2); восемь галочек «виды документов» уехали под «Ещё фильтры»
  со счётчиком заданных (`CMP-003`).
- **В фильтре состояния были коды** `generated` / `final` / `archived` — стали «Подготовлен»,
  «Выдан», «В архиве» (`TXT-006`). Сторож `labels.test.ts` не пропустит подпись латиницей.
- Действия строки («Аннулировать», «Перевыпустить») — через `rowActions` таблицы, а не двумя
  кнопками внутри данных.
- Пустой экран объясняет, откуда документы берутся; при заданном отборе предлагает его снять
  (`TPL-006`).
- **Форма закрытия группы больше не висит развёрнутой под реестром** — чужая форма посреди книги
  выдачи, с полем «идентификатор группы» руками. Она открывается панелью по кнопке; **путь не
  удалён**, закрытие по-прежнему доступно с этого экрана (журнал, запись 41).

**Дедупликация вместо третьей копии.** Словарь статусов зачисления лежал в двух файлах
(`mvp/screens.tsx` и карточка группы); карточке слушателя он нужен третьим — вынесен в общий слой
`mvp/screen-helpers.tsx` вместе с человеческим форматом даты. Копию в монолите не трогал: она
описывает зачисление другими словами («активно» против «Учится») и живёт на экране волны 2 —
свести оба словаря в один нужно при его редизайне (запись 40).

**`ListPage` научился двум вещам** (обратно совместимо): передавать действие в пустой экран
(`emptyAction`) и действия строки (`rowActions`).

**⚠️ Волна 1 всё ещё не закрыта — остался `/documents`.** Это не «ещё один экран»: 763 строки,
двадцать переменных состояния и фактически **три экрана в одном файле** — реестр шаблонов; версия
шаблона с переменными и привязками; генерация и задачи. Идёт отдельным срезом 7.

**Тесты:** `@trudskill/ui` 147 (+3), фронт 1044 (+9), typecheck чист, eslint 0.
`pnpm ci:check` — exit 0 после сноса `packages/*/dist`.

**Дальше — срез 7 Фазы 4:** `/documents` под `TPL-001` (сначала разделение на три экрана переносом
«как есть» по `SCR-001`, потом редизайн). Затем волна 2 §8.1.

### 5.269 Фаза 4, срез 7 — экран документов под TPL-001. ВОЛНА 1 ЗАКРЫТА

**Дата:** 2026-08-13. **Ветка:** `worktree-ui-redesign-faza4-srez7`. **ТЗ:** `TPL-001`, `SCR-001`,
`TXT-004`, `TXT-006`, волна 1 §8.2, план разбиения §8.3.

Два коммита, как требует `SCR-001`: сначала перенос (диф читается как перемещение), потом редизайн.

**Коммит 1 — перенос «как есть».** 763 строки и 20 переменных состояния разложены:
обращения к серверу → `api.ts` (девять раз подряд собирался один и тот же блок заголовков
авторизации прямо в разметке), запросы → `hooks.ts`, три секции — по своим файлам.
Сторож единых состояний (`IA-001`) сразу поймал промежуточное состояние: файл с данными
остался без общих обёрток. Это он и должен ловить — обработка общей ошибки поднята на экран,
а не добавлено исключение.

**Коммит 2 — редизайн.**

_Порядок работы был вывернут наизнанку._ Реестр шаблонов сверху; блок «Версия шаблона,
переменные и привязки» посреди страницы с надписью «Сначала выберите шаблон в блоке генерации»;
сам выбор — в выпадающем списке ещё ниже. То есть настройка отсылала человека вниз, к другому
блоку. Теперь шаблон выбирается кликом по своей строке, а настройка и выпуск открываются
панелями рядом.

_Найден дефект логики (журнал, запись 42)._ **Вид выпускаемого документа брался из формы
создания шаблона**, а не из самого шаблона: выбрал в той форме «Протокол» — и выпуск по
шаблону удостоверения уходил на сервер с `documentType: protocol`. Форма и выпуск — разные
блоки страницы, связь между ними человеку не видна вовсе. Теперь вид берётся у выбранного
шаблона и показан словами в панели выпуска.

_Идентификаторы руками._ Объект выпуска вводился в поле с подсказкой `entity_id`, привязки —
в поля `groupId` / `courseId` / `directionId`. Теперь курс, группа, слушатель и зачисление
(внутри выбранной группы) выбираются по названию из справочников. Выпуск списком по-прежнему
принимает идентификаторы построчно — множественный выбор в этот срез не входил (запись 45).

_Задачи выпуска._ Кнопка «Детали» выводила задачу как **JSON прямо на страницу**; колонка
называлась «Task ID»; состояния (`queued`, `running`, `failed`) и даты — кодами и машинными
строками. Теперь: панель с полями по-русски, ошибка отдельной плашкой, технический
идентификатор под спойлером (`TXT-004`). Состояния подтверждены по коду сервера, а не угаданы.

_Прочее._ Состояния шаблонов рисовались строкой бейджей ПОД таблицей — кружки, не привязанные
ни к одной строке (запись 43); стали колонкой. Первичное действие «Обновить» заменено на
«Создать шаблон» (`UI-007`). Тексты: «плейсхолдеры» → «метки бланка», категории переменных без
латиницы в скобках, «Организация (tenant)» → «Учебный центр». Поле «тип значения» с подсказкой
`string` убрано — все существующие метки текстовые.

_Дедупликация._ Список видов документов жил в справочнике книги выдачи И восемью `<option>`
в разметке экрана шаблонов. Сведён в `features/documents/document-types.ts`, книга выдачи
берёт его реэкспортом — её тесты не правились.

**Волна 1 §8.2 закрыта полностью:** `/workspace`, `/learners` (+карточка), `/groups` (+карточка,
+создание), `/documents`, `/admin/issuance-journal`, `/admin/bulk-enrollments`.

**Тесты:** фронт 1051 (+7), `@trudskill/ui` 147, бэкенд 3121, typecheck чист, eslint 0.
`pnpm ci:check` — exit 0 после сноса `packages/*/dist`.

**Дальше — срез 8 Фазы 4: волна 2** §8.1 — `/assessment` (§8.3 порядок 4, `AssessmentDashboardScreen`
на 434 строки), `/admin/tests`, `/admin/assignments`, `/admin/question-banks`, `/reports`,
`/admin/analytics`. Там же чинятся записи 39 и 40 журнала (выпадающий список зачислений
идентификаторами; два разных словаря статусов).

### 5.270 Фаза 4, срез 8 — экран оценивания, начало волны 2 (ЗАКРЫТ)

**Дата:** 2026-08-13. **Ветка:** `worktree-ui-redesign-faza4-srez8`. **ТЗ:** волна 2 §8.1,
§8.3 порядок 4, `SCR-001`, `TXT-006`, §13.2 (бюджет блоков).

Два коммита: перенос (§8.3 порядок 4 — 424 строки из `mvp/screens.tsx`; монолит 2596 → 2153),
затем редизайн. Попутно `toTableRows` переехал в общий слой — он понадобился вынесенному экрану.

**Девять блоков подряд при бюджете «≤3 до сгиба».** Фильтры, банки вопросов, тесты, назначенные
задания, сценарий сдачи, попытки, результаты экзаменов, очередь проверок, завершение проверок,
история. Три из них — банки, тесты и задания — **повторяли содержимое своих же экранов**
(`/admin/question-banks`, `/admin/tests`, `/admin/assignments`) таблицами только для чтения.
Убраны, вместо них ссылка в шапке. ⚠️ Данные больше не дублируются на этом экране; доступ к ним
сохранён своими маршрутами.

**На экране не было ни одной фамилии.** Слушатель, тест, задание и зачисление показывались
идентификаторами: колонки «Submission ID» и «Review ID», `<code>3f7a…</code>` в ячейке слушателя,
а в сценарии сдачи зачисление выбиралось из списка, подписанного идентификаторами (журнал,
запись 39). Теперь везде фамилия и имя, названия теста и задания, а фамилия — ссылка на карточку,
если у роли есть право видеть чужих слушателей (проверка права сохранена, не ослаблена).

**Тексты, написанные для разработчика.** Пояснение под ячейкой гласило: «Отметить за слушателя:
запуск попытки / субмиты с learnerId этого зачисления (IAM: learners.act_as)». Заменено на
человеческое объяснение, что действие выполняется по поручению и помечается в журнале.
Результат попытки печатался как `score=8/10, passed=да` — стал «Зачёт: 8 из 10 баллов»
(сторож проверяет, что в тексте итога нет ни латиницы, ни знака «равно»).

**Прочее.** Фильтр «Фильтр по group_id» (текстовое поле под идентификатор) → выбор группы по
названию. Состояния попыток и проверок — словами. Шаги сценария сдачи переведены на общий
`WizardSteps` (журнал, запись 36; осталась одна копия — мастер курсов, волна 3). Действия
проверок ушли в колонку действий строки.

**Закрыты записи журнала 39 и 40.** Запись 40 закрылась сама: дублирующий словарь статусов
уехал из монолита вместе с экраном.

**Тесты:** фронт 1057 (+6), `@trudskill/ui` 147, бэкенд 3121, typecheck чист, eslint 0.
`pnpm ci:check` — exit 0 после сноса `packages/*/dist`.

**Дальше — срез 9 Фазы 4:** остаток волны 2 — `/admin/tests` (+`[id]`), `/admin/assignments`
(+`[id]`), `/admin/question-banks` (+`[id]`), `/reports`, `/admin/analytics`.

### 5.271 Фаза 4, срез 9 — волна 2 закрыта (ЗАКРЫТ)

**Дата:** 2026-08-13. **Ветка:** `worktree-ui-redesign-faza4-srez9`. **ТЗ:** волна 2 §8.1,
`TPL-001`, `CMP-014`, `TXT-005`.

**Три реестра оценивания.** `/admin/tests`, `/admin/assignments`, `/admin/question-banks`
переведены на каркас `ListPage`. Во всех трёх **колонка «Курс» показывала идентификатор**
вместо названия. Форма создания теста стояла постоянным блоком над списком и просила «ID курса»
текстом — стала первичным действием в шапке и панелью, где курс выбирается по названию. Пустые
экраны объясняют, что такое тест, задание и банк вопросов, и дают первое действие (`CMP-014`):
раньше было «Тестов нет. Создайте первый тест выше» — с отсылкой к форме, которой больше нет.

Тексты: «Ревью» → «Как проверяется» («Проверяет преподаватель» / «Проверяется автоматически»),
«Макс балл» → «Максимальный балл», «Статус» → «Состояние».

**Отчёты и аналитика.** Поля `course_id`, `group_id`, `client_id` заменены выбором по названию.
На графике убрана запрещённая `TXT-005` формулировка «Нет данных для графика» — теперь график
говорит, что за выбранный период считать нечего, и предлагает расширить период (журнал,
запись 29 — висела с 12.08).

**Системная находка (журнал, запись 47).** Сплошной поиск показал, что «вставьте идентификатор» —
не свойство отдельных экранов, а **19 полей в 8 файлах**. Места волн 1–2 исправлены; остальные
шесть внесены в новый сторож `id-input-ban.e2e.test.ts` **очередью с указанием волны**. Сторож
устроен как `unified-states`: список — это очередь, а не разрешение; он падает и на новом
нарушителе, и на устаревшей записи (место исправили, а из списка не убрали).

Общий выбор курса вынесен в `features/courses/course-picker.tsx` — папка заведена заранее под
§8.3 порядок 5 (экраны курсов переезжают туда в волне 3). Им пользуются шесть мест.

**Тесты:** фронт 1060 (+3), `@trudskill/ui` 147, бэкенд 3121, typecheck чист, eslint 0.
`pnpm ci:check` — exit 0 после сноса `packages/*/dist`.

**Дальше — срез 10 Фазы 4: волна 3** §8.1 — `/admin/clients` (+`[id]`), `/admin/orders`,
`/counterparties` (+`[id]`), `/admin/commissions` (+`[id]`), `/admin/recertification`,
`/courses` (+`[id]`, `/new`), `/gov-export`, `/registry`. Там же §8.3 порядки 5–7 (курсы,
контрагенты, комиссии) и очередь сторожа `id-input-ban` по волне 3.

### 5.272 Фаза 4, срез 10 — курсы, начало волны 3 (ЗАКРЫТ)

**Дата:** 2026-08-13. **Ветка:** `worktree-ui-redesign-faza4-srez10`. **ТЗ:** волна 3 §8.1,
§8.3 порядок 5, `SCR-001`, `TPL-001`, `CMP-014`, `TXT-006`.

Два коммита: перенос, затем редизайн.

**Монолит: 2153 → 1095 строк.** Экраны курсов уехали в `features/courses/courses-screens.tsx`
(папка была заведена в срезе 9 под общий выбор курса). Общие `RegistryControls` и
`STATUS_OPTIONS` подняты в общий слой — ими пользуются и оставшиеся экраны монолита.

**Найден мёртвый экран.** `CourseCreateScreen` — 212 строк, на которые **не ссылался никто**:
`/courses/new` открывает `features/course-wizard/screens.tsx`, настоящий мастер из пяти шагов
с черновиком (сделан в §5.200). Старый экран остался в монолите после той замены и с тех пор был
недостижим. Удалён, а не перенесён: перенос мёртвого кода в новую папку закрепил бы его навсегда.

⚠️ **Ловушка при вырезании блока.** Диапазон «старого экрана» из плана §8.3 содержал ещё две
секции карточки курса (`ProgramMetaSection`, `DocumentSetSection`) и четыре справочника — виды
обучения, категории слушателей, формы обучения и формы итоговой аттестации. Первое вырезание
унесло их вместе с мёртвым экраном, и сборка упала на неизвестных именах. **Границы блока
проверять по определениям в коде, а не по номерам строк из документа** — номера в §8.3 сняты
на дату аудита и с тех пор уехали.

**Редизайн реестра `/courses`:**

- Список `<ul>` со ссылками → таблица на `ListPage` (код курса, дата изменения, состояние).
- Отбор по состоянию показывал **коды**: `active`, `blocked`, `draft`, `published` и ещё пять —
  это общий `RegistryControls` монолита, он печатает значения как есть (журнал, запись 49;
  остальные реестры на нём же — их волны впереди). Курсы получили список словами.
- Пустой экран объясняет, что такое курс, и даёт первое действие (`CMP-014`).
- Надпись «Недостаточно прав для создания курса» убрана: без права кнопка просто не показывается,
  а не сообщает человеку о запрете.

**Тесты:** фронт 1060, `@trudskill/ui` 147, бэкенд 3121, typecheck чист, eslint 0.
`pnpm ci:check` — exit 0 после сноса `packages/*/dist`.

**Дальше — срез 11 Фазы 4:** остаток волны 3 — карточка курса (`TPL-002`), `/counterparties`
и `/admin/clients` (§8.3 порядок 6), `/admin/commissions` (порядок 7), `/admin/orders`,
`/admin/recertification`, `/gov-export`, `/registry`.

### 5.273 Фаза 4, срез 11 — заказчики и комиссии (ЗАКРЫТ)

**Дата:** 2026-08-13. **Ветка:** `worktree-ui-redesign-faza4-srez11`. **ТЗ:** волна 3 §8.1,
§8.3 порядки 6 и 7, `SCR-001`, `TPL-001`, `TPL-002`, `CMP-014`, `UI-007`.

Два коммита: перенос, затем редизайн.

**Монолит: 1092 → 597 строк.** Контрагенты уехали в `features/counterparties/`, комиссии —
в `features/commissions/`. В монолите остались пользователи, направления и экраны слушателя
(порядки 8–10).

**Заказчики обучения (`/counterparties`).** Реестр был вертикальной стопкой ссылок вида
«Название (код)»: ни состояния, ни даты, ни возможности сравнить. Стал таблицей на `ListPage`
с состоянием и датой изменения; отбор по состоянию — словами вместо кодов общего
`RegistryControls` (журнал, запись 49).

Карточка называлась «Карточка контрагента» — одинаково для всех организаций — и показывала из
данных **только код**. Теперь заголовок это название организации, справа сводка `KeyValueList`
(`TPL-002`), а пустой блок контактов объясняет, что там появится, вместо «Контактные данные пока
не заполнены».

**Аттестационные комиссии (`/admin/commissions`).** Форма создания стояла постоянным блоком
**под** таблицей, а пустой экран отправлял к ней словами «Создайте первую комиссию ниже». Стало:
первичное действие в шапке, форма в панели, пустой экран объясняет, зачем комиссия нужна —
без неё не выпускаются протоколы и удостоверения. Убраны кнопка «Обновить» рядом с отбором
(`UI-007`: обновление не действие) и колонка-пустышка со ссылкой «Открыть» — ссылка переехала
на название. Отбор: «Активные»/«Архивные» → «Действующие»/«В архиве».

**Тесты:** фронт 1060, `@trudskill/ui` 147, бэкенд 3121, typecheck чист, eslint 0.
`pnpm ci:check` — exit 0 после сноса `packages/*/dist`.

**Дальше — срез 12 Фазы 4:** остаток волны 3 — карточка курса (`TPL-002`), `/admin/clients`,
`/admin/orders`, `/admin/recertification`, `/gov-export`, `/registry`. Затем волна 4 и §8.3
порядки 8–9 (пользователи, направления).

### 5.274 Фаза 4, срез 12 — выгрузки в государственные реестры (ЗАКРЫТ)

**Дата:** 2026-08-13. **Ветка:** `worktree-ui-redesign-faza4-srez12` (поверх среза 11, PR #505
ещё не влит). **ТЗ:** волна 3 §8.1, `IA-001`, `SCR-001`, §13.2, `TXT-006`.

Два коммита: перенос, затем редизайн.

**Экран на 759 строк лежал прямо в `app/gov-export/page.tsx`** — нарушение `IA-001` (страница
должна быть тонкой). Вынесен в `features/gov-export/gov-export-screen.tsx`, страница стала
обёрткой на 10 строк.

**Двенадцать блоков подряд** при бюджете «≤3 до сгиба»: мастер формирования пакета, история
задач, журнал проверок и **пять ведомств** — Минтруд (ОТ), ФИС ФРДО, ЕИСОТ, Ростехнадзор,
Минздрав-НМО, — у каждого своя форма и своя вложенная история. Чтобы подать в нужный реестр,
человек листал страницу. Теперь ведомство выбирается списком, и виден только его блок.

**Найдено поле, куда просили вписать JSON.** В «мастере формирования пакета» стоял ввод с
подсказкой `{"groupId":"g1"}` — администратор учебного центра должен был набрать фигурные скобки
и кавычки руками. Отбор всегда сводился к группе: теперь она выбирается по названию, а строка
запроса собирается сама.

Ещё четыре поля «ID группы (необязательно)» и «ID клиента (необязательно)» заменены выбором по
названию. Для этого заведён `features/groups/group-picker.tsx` (`GroupSelect`, `ClientSelect`) —
парный к `features/courses/course-picker.tsx` из среза 9.

**Коды вместо слов.** В истории задач: колонка «Task ID» убрана, `frdo` / `learners` / `queued`
стали «ФИС ФРДО» / «Слушатели» / «В очереди». В журнале обмена: «Сущность» → «Что отправляли»,
«HTTP» → «Ответ сервиса», состояние словами.

**Сторож `id-input-ban` отработал дважды за один срез:** сначала поймал переезд файла (запись
очереди указывала на старый путь — «список врёт»), потом подтвердил исправление. Запись убрана,
в очереди осталось пять файлов.

**Тесты:** фронт 1060, `@trudskill/ui` 147, бэкенд 3121, typecheck чист, eslint 0.
`pnpm ci:check` — exit 0 после сноса `packages/*/dist`.

**Дальше — срез 13 Фазы 4:** остаток волны 3 — карточка курса (`TPL-002`), `/registry`,
`/admin/orders`, `/admin/recertification`, `/admin/clients`. Затем волна 4 и §8.3 порядки 8–9.

### 5.275 Фаза 4, срез 13 — дубли в меню (ЗАКРЫТ)

**Дата:** 2026-08-13. **Ветка:** `worktree-ui-redesign-faza4-srez13`. **ТЗ:** `IA-017`, волна 3 §8.1.

Срез начинался с `/registry`, но сверка вскрыла системный недочёт **прошлых собственных срезов**,
и он стал главной работой.

**Шесть пунктов меню вели на перенаправления.** Срезы 1, 3 и 4 убирали дубли экранов, превращая
адреса в редиректы: `/admin/learners` → `/learners`, `/admin/cockpit` → `/workspace`, три адреса
настроек провайдеров → якоря `/settings`. Адреса сохранялись ради закладок — **а пункты меню
остались**. То есть дубль убрали из адресной строки, но не с глаз: человек по-прежнему видел
«Слушатели» и «Ученики», ведущие в один реестр.

Пункты убраны, адреса сохранены. Заведён сторож `nav-redirect-targets.e2e.test.ts`: список
страниц-перенаправлений **вычисляется по коду**, а не выписан руками, поэтому не протухнет —
новый редирект без чистки меню уронит прогон. Сторож `ia-architecture` получил категорию
маршрутов-редиректов (у них не должно быть ни блока ИА, ни пункта меню) с той же вычисляемой
проверкой.

**`/registry` — второй, более бедный вход в журнал действий.** Читал тот же `/audit/events`,
что и `/audit`, но без фильтров и с колонками «Действие», «Сущность», «ID», где значениями стояли
коды и идентификатор. Отдельно: маршрут обещал доступ по `tenant.read`, тогда как серверная ручка
требует `auth.manage_sessions`. **Данные не утекали** — сервер отказывал, — но раздел висел в меню
у ролей, которым всегда отвечал ошибкой. Стал редиректом на `/audit`, право маршрута выровнено.

**Пункт «SCORM»** переименован в «Учебные пакеты (SCORM)»: имя отраслевого стандарта само по себе
администратору учебного центра ничего не говорит. Сторож подписей меню переписан с «нет латиницы»
на «подпись содержит русские слова» — имя стандарта в скобках допустимо.

**Ложная тревога, проверенная по миграциям (журнал, запись 53).** После переезда настроек оплаты
внутрь `/settings` казалось, что роль с `payments.configure` без права на роли теряет путь к
настройке. Проверка: `payments.configure` выдаётся только `platform_admin` и `tenant_admin`
(миграция 0056), а админ центра получает ВСЕ права (0010) — живой роли без пути нет. **Доступ не
ослаблялся**; вместо этого поправлен тест, где сессия состояла из одного права в вакууме. Правило
CLAUDE.md «права брать из базы, а не из названия роли» сработало против ложной тревоги.

⚠️ **Грабля при написании сторожа:** последовательность `*` + `/` внутри блочного комментария
закрывает комментарий досрочно — сборка теста падала на «Expected ";"». Писать пути настроек
в комментариях словами.

**Тесты:** фронт 1065 (+5), `@trudskill/ui` 147, бэкенд 3121, typecheck чист, eslint 0.
`pnpm ci:check` — exit 0.

**Дальше — срез 14 Фазы 4:** остаток волны 3 — карточка курса (`TPL-002`), `/admin/orders`,
`/admin/recertification`, `/admin/clients`. Затем волна 4 и §8.3 порядки 8–9.

### 5.276 Фаза 4, срез 14 — карточка курса и реестр компаний (ЗАКРЫТ)

**Дата:** 2026-08-13. **Ветка:** `worktree-ui-redesign-faza4-srez14`. **ТЗ:** волна 3 §8.1,
`TPL-001`, `TPL-002`, `TXT-006`, `UI-007`.

**Карточка курса — `TPL-002`.** Заголовок — название курса, одно первичное действие
«Опубликовать курс» в шапке (архивирование рядом вторичным), версии, модули и материалы —
таблицами вместо списков строк.

**С экрана убрано имя поля базы (журнал, запись 54).** Материалы выводились как
«1. Инструктаж **[text] min_view_seconds=60**»: вид материала кодом в квадратных скобках,
минимальное время просмотра — машинным именем колонки со значением в секундах. Теперь вид
словом («Внешняя ссылка», «Пакет SCORM»), время по-человечески («1 мин», «2 мин 30 с»), а ноль
означает «без ограничения» — так задаются пакеты SCORM, где время считает сам пакет.

**Условие публикации перечисляется поимённо (запись 55).** Было одной фразой «Для публикации
курса требуется минимум 1 версия, 1 модуль и 1 материал» — из неё неясно, чего не хватает
ЭТОМУ курсу. Теперь отдельный блок со списком ровно недостающего, и только пока курс не готов.

**Реестр компаний** переведён на `ListPage`, «Email» → «Почта», пустой экран объясняет, кто такая
компания-заказчик, и даёт первое действие.

**⚠️ Найден дубль сущности — нужно решение владельца (журнал, запись 56).**
`/counterparties` («Заказчики обучения») и `/admin/clients` («Компании») **читают одну и ту же
ручку `/counterparties`** и оба висят в меню. Версия `/admin/clients` богаче: ИНН, контакты,
карточка, сводка обучения; версия `/counterparties` беднее. ТЗ §8.1 перечисляет оба маршрута в
волне 3, не отмечая дублирования.

Молча сливать не стал: выбор, какой экран оставить и как называть сущность («заказчик» или
«компания»), — это терминология продукта, а не вёрстка. Пока оба приведены к общему каркасу.

**Тесты:** фронт 1074 (+9), `@trudskill/ui` 147, бэкенд 3121, typecheck чист, eslint 0.
`pnpm ci:check` — exit 0.

**Дальше — срез 15 Фазы 4:** хвост волны 3 — `/admin/orders`, `/admin/recertification`.
Затем волна 4 (`/users`, `/audit`, `/integrations`, `/admin/licenses`, `/admin/usage`,
`/admin/operations`, `/admin/proctoring-recordings`, `/admin/identity-verifications`,
`/admin/reports/builder`, `/platform/tenants`) и §8.3 порядки 8–9.

### 5.277 Фаза 4, срез 15 — дубль сущности сведён (ЗАКРЫТ)

**Дата:** 2026-08-14. **Ветка:** `worktree-ui-redesign-faza4-srez15`. **ТЗ:** `IA-017`, §4.9.
**Решение владельца от 2026-08-14.**

Срез 14 нашёл, что `/counterparties` («Заказчики обучения») и `/admin/clients` («Компании») —
**два экрана одной сущности**: одна ручка `/counterparties`, два пункта меню. Вопрос был вынесен
владельцу, потому что выбор экрана и термина — терминология продукта, а не вёрстка.

**Владелец выбрал «Компании»** (`/admin/clients`): там ИНН, контакты, карточка и сводка обучения.

Сделано:

- `/counterparties` → перенаправление на `/admin/clients`;
- `/counterparties/[id]` → перенаправление на `/admin/clients/[id]` — **идентификатор тот же**,
  сущность одна, поэтому сохранённая ссылка открывает ту же организацию на оставшемся экране;
- экран-дубль `features/counterparties/counterparties-screens.tsx` удалён, а не оставлен мёртвым
  (та же логика, что с `CourseCreateScreen` в срезе 10);
- пункт меню «Заказчики обучения» убран, ссылка в блоке ИА снята;
- короткое меню роли «менеджер» (`role-blueprints.ts`) вело на исчезнувший пункт — переключено
  на «Компании», тест роли обновлён под решение владельца.

Сторожа `nav-redirect-targets` и `ia-architecture`, заведённые в срезе 13, подтвердили: новый
редирект не остался ни в меню, ни в блоке — то есть механика, добавленная тогда, отработала на
первом же реальном случае.

**Тесты:** фронт 1074, `@trudskill/ui` 147, бэкенд 3121, typecheck чист, eslint 0.
`pnpm ci:check` — exit 0.

**Дальше — срез 16 Фазы 4:** хвост волны 3 — `/admin/orders`, `/admin/recertification`.
Затем волна 4 и §8.3 порядки 8–9.

### 5.278 Фаза 4, срез 16 — заказы и переаттестация. ВОЛНА 3 ЗАКРЫТА

**Дата:** 2026-08-14. **Ветка:** `worktree-ui-redesign-faza4-srez16`. **ТЗ:** волна 3 §8.1,
`TPL-001`, `TXT-003`, `CMP-014`.

**Экран заказов (`/admin/orders`).**

_Кнопка переименовывалась по ходу сценария_ — «+ Новый заказ» ↔ «Скрыть форму». `TXT-003` это
прямо запрещает: действие называется одинаково всегда. Плюс форма открывалась на самой странице и
сдвигала список. Теперь «Создать заказ» в шапке и форма в панели.

_Три поля просили идентификаторы_: «UUID слушателя или контрагента» у плательщика, «ID группы» и
«ID слушателя» в каждой позиции заказа. Заменены выбором по имени. Для этого заведён
`features/learners/learner-picker.tsx` — третий из пары к подборщикам курса (срез 9) и группы
(срез 12).

_Покупатель в таблице_ показывался как «Слушатель: 3f7a…», а колонка называлась «ID заказа».
Теперь имя человека или название компании; заказ опознаётся по покупателю, а не по идентификатору.
Подтверждения оплаты и отмены тоже называют покупателя: «Заказ покупателя «Иванов Иван» будет
отменён» вместо строки с идентификатором.

**Очередь переаттестации (`/admin/recertification`)** переведена на `ListPage`: действия строки
вместо кнопок в ячейке, отбор в общей панели фильтров, «Статус» → «Состояние», пустой экран
объясняет, откуда берутся записи. Первичное действие «Проверить сроки» получило вид первичного.

**Очередь сторожа `id-input-ban` сократилась с 19 мест до 4.** Остались: журнал действий
(поиск по идентификатору записи), материалы (отбор по модулю), закрытие группы и добавление
слушателя в группу — все волны 1 и 4.

**Слепая зона сторожа единых состояний (журнал, запись 59).** Его признак «файл с данными» —
слово `isLoading`; подборщики курса и группы используют `loading` и проходили молча. Правило к
ним и не должно применяться (это поля формы, а не экраны), но проходили они по случайности имени
переменной. Все четыре подборщика внесены в список исключений явно, с объяснением.

**Тесты:** фронт 1074, `@trudskill/ui` 147, бэкенд 3121, typecheck чист, eslint 0.
`pnpm ci:check` — exit 0.

**Дальше — срез 17 Фазы 4: волна 4** §8.1 — `/users` (+`[id]`), `/audit`, `/integrations`,
`/admin/licenses`, `/admin/usage`, `/admin/operations`, `/admin/proctoring-recordings`,
`/admin/identity-verifications`, `/admin/reports/builder`, `/platform/tenants`.
Там же §8.3 порядки 8–9 (пользователи, направления) — последние экраны монолита.

### 5.279 Фаза 4, срез 17 — пользователи и направления (ЗАКРЫТ)

**Дата:** 2026-08-14. **Ветка:** `worktree-ui-redesign-faza4-srez17`. **ТЗ:** волна 4 §8.1,
§8.3 порядки 8–9, `SCR-001`, `TPL-001`, `CMP-014`.

**План разбиения §8.3 пройден.** Порядки 8 и 9 — последние: `mvp/screens.tsx` прошёл путь
**3019 → 314 строк**. В нём остались только экраны слушателя и преподавателя
(`LearnerCoursesScreen`, `LearnerCourseDetailsScreen`, `StudentDashboardScreen`,
`TeacherGradingCenterScreen`, `AdminCockpitScreen`) — это порядок 10, волна 6.

Скелет списка (`ListSkeleton`) и панель фильтров переехали в общий слой `mvp/screen-helpers.tsx`,
а не продублировались: после выноса пользователей скелет понадобился и там, и в монолите.

**Реестр пользователей выводил каждого ДВАЖДЫ (журнал, запись 60).** Сначала таблица «ФИО /
Логин / Статус», а под ней — список ссылок «Открыть карточку Иванов И.» с бейджем состояния.
Двадцать сотрудников занимали сорок строк, причём карточка открывалась **только из нижнего
дубля**: имя в таблице ссылкой не было. Теперь одна таблица, имя — ссылка.

Пометка «Только просмотр» повторялась у каждой строки (запись 61) — сообщение о правах,
размноженное по числу пользователей. Стала одной строкой в шапке экрана.

Отбор по состоянию показывал коды; заголовок «Пользователи» → «Люди и доступ» — как в оглавлении
настроек, чтобы раздел назывался одинаково в двух местах.

**Реестр направлений (запись 62)** был списком `<ul>` из одних названий: ни кода, ни объяснения,
что такое направление, а пустого состояния не было вовсе — при отсутствии данных показывалась
пустая рамка. Стал таблицей с кодом и пустым экраном, который объясняет назначение раздела.

**Тесты:** фронт 1074, `@trudskill/ui` 147, бэкенд 3121, typecheck чист, eslint 0.
`pnpm ci:check` — exit 0.

**Дальше — срез 18 Фазы 4:** остаток волны 4 — `/audit`, `/integrations`, `/admin/licenses`,
`/admin/usage`, `/admin/operations`, `/admin/proctoring-recordings`,
`/admin/identity-verifications`, `/admin/reports/builder`, `/platform/tenants`.

### 5.280 Фаза 4, срез 18 — журнал действий (ЗАКРЫТ)

**Дата:** 2026-08-15. **Ветка:** `worktree-ui-redesign-faza4-srez18`. **ТЗ:** волна 4 §8.1,
`IA-001`, `TPL-001`, `TXT-004`, `TXT-006`, `UI-007`.

Экран лежал прямо в `app/audit/page.tsx` (152 строки) — вынесен в `features/audit/`.

**Найдены ссылки-обманки (журнал, запись 63).** Под таблицей выводились пять ссылок вида
«Детали события `<идентификатор>`», которые вели на **`/workspace`**: обещали подробности
события, открывали рабочий стол. Убраны — ссылка, ведущая не туда, хуже отсутствующей.

**Экран говорил по-английски (запись 64).** Колонки «Actor», «Action», «Entity», «Entity ID»;
значения — коды вида `learning.learner_created` и идентификаторы; подзаголовок «Журнал действий
с фильтрами по actor/entity/action»; пять полей отбора с подсказками `actor`, `entity type`,
`action`, `entity id`, `request id`.

Стало: «Когда / Кто / Что произошло / Над чем». Код действия разбирается по образцу
`раздел.объект_действие` в человеческую фразу — словарь на все действия завести нельзя (их
десятки и прибавляются), поэтому разбор идёт по частям, а незнакомая часть показывается как есть.

⚠️ **Глагол согласуется с родом объекта.** Первый вариант выдавал «Попытка теста начат» и
«Комиссия заведён» — интерфейс на ломаном русском ничем не лучше кода. Каждый глагол хранится
тремя формами: правилом русский язык здесь не берётся. Разбор идёт от самого длинного имени
объекта, иначе `question_bank_created` читалось бы как «вопрос», а не «банк вопросов».

**Отбор.** Видимых фильтров три (что искать, период с/по), технические идентификаторы объекта и
запроса уехали под «Ещё фильтры» с пояснением, когда они нужны (`TXT-004`: они для разбора
обращения в поддержку, а не для повседневной работы).

**Журнал грузится при открытии.** Раньше экран открывался пустым и ждал нажатия «Обновить» —
она же была первичным действием (`UI-007` это запрещает).

**Тесты:** фронт 1081 (+7), `@trudskill/ui` 147, бэкенд 3121, typecheck чист, eslint 0.
`pnpm ci:check` — exit 0.

⚠️ **Грабля:** комментарий `eslint-disable-next-line react-hooks/exhaustive-deps` роняет линт —
этого правила в конфигурации репозитория нет, а отключение несуществующего правила считается
ошибкой. Пояснение к зависимостям писать обычным комментарием.

**Дальше — срез 19 Фазы 4:** остаток волны 4 — `/integrations`, `/admin/licenses`,
`/admin/usage`, `/admin/operations`, `/admin/proctoring-recordings`,
`/admin/identity-verifications`, `/admin/reports/builder`, `/platform/tenants`.

### 5.281 Фаза 4, срез 19 — обмен данными и английские заголовки (ЗАКРЫТ)

**Дата:** 2026-08-15. **Ветка:** `worktree-ui-redesign-faza4-srez19`. **ТЗ:** волна 4 §8.1,
`TXT-006`.

**Экран `/integrations` был самым англоязычным из оставшихся.** Колонки «Name», «Status»,
«Secret», «Provider», «Type», «Creds», «Active creds», «Last sync», «Last sync at»; пустое
состояние «Нет credentials»; раздел назывался «Подключения тенанта» — слово «тенант»
администратору учебного центра не говорит ничего.

Стал «Обменом данными»: «Доступные системы», «Подключения вашего центра», «Ключ доступа»,
«Состояние обмена». Виды систем («Обмен курсами», «Государственный реестр») и состояния
подключений — словами; подсказка про ключ объясняет, что после сохранения его нельзя прочитать
целиком.

**Сплошная проверка показала, что беда шире одного экрана (журнал, запись 67).** Нашлись:

- **13 заголовков виджетов** на стартовых экранах слушателя и преподавателя — английские
  **при русских пояснениях прямо под ними**: «Continue learning», «Deadlines», «At risk learners»,
  «Audit health». Экраны относятся к волне 6, но заголовок — это данные в массиве, правка на
  одну строку каждая; оставлять их перед слушателем ещё на фазу не было причин;
- «Session ID» в карточке сотрудника;
- **пять колонок «ID» в историях выгрузок** — мой собственный недосмотр среза 12: тогда я
  поправил историю задач, но не пять таблиц ведомств;
- «Email» в предпросмотре импорта и портале заказчика, «Actor», «Entity», «HTTP»,
  «Assignment ID» — в подписании и прокторинге.

**Сторож `latin-titles-ban.e2e.test.ts`.** Заголовок обязан содержать кириллицу. Имена форматов
и стандартов (SCORM, PDF, CSV, XML) и название продукта разрешены явным списком — их не
переводят, но они не могут составлять всю подпись целиком: «Учебные пакеты (SCORM)» проходит,
голое «SCORM» — нет.

**Тесты:** фронт 1083 (+2), `@trudskill/ui` 147, бэкенд 3121, typecheck чист, eslint 0.
`pnpm ci:check` — exit 0.

**Дальше — срез 20 Фазы 4:** остаток волны 4 — `/admin/licenses`, `/admin/usage`,
`/admin/operations`, `/admin/proctoring-recordings`, `/admin/identity-verifications`,
`/admin/reports/builder`, `/platform/tenants`.

### 5.282 Фаза 4, срез 20 — одно слово для одного понятия (ЗАКРЫТ)

**Дата:** 2026-08-15. **Ветка:** `worktree-ui-redesign-faza4-srez20`. **ТЗ:** волна 4 §8.1,
`TXT-003` (по смыслу), макет §7.1.

**Разнобой в терминологии — мой собственный.** Сверка перед правкой экранов волны 4 показала,
что состояние сущности подписано двумя словами сразу: **39 мест «Статус», 32 — «Состояние»**.
Проверка источника: в макете шаблона реестра ТЗ (§7.1) стоят «[Статус ▾]» и колонка «Статус».
То есть канон задан, а «Состояние» ввёл я сам в срезах 6–19, переделывая экраны и не сверившись
с макетом.

Сведено к слову ТЗ в **19 файлах**. Составные названия разделов («Состояние обмена», «Состояние
очередей», «Состояние журнала действий») оставлены: это имена блоков, а не подпись поля статуса.

**Сторож `one-word-per-thing.e2e.test.ts`** держит одно слово. В нём есть проверка, что канонное
слово в приложении действительно встречается, — иначе тест был бы зелёным просто потому, что
подписей не осталось вовсе.

**Попутно (журнал, запись 69):** колонка «Задача» на экране эксплуатации показывала
«certificate · 3f7a-…» — вид документа кодом плюс идентификатор задачи. Стала «Что выпускалось»
с видом документа словом; справочник видов взят общий, заведённый в срезе 7.

**Тесты:** фронт 1086 (+3), `@trudskill/ui` 147, бэкенд 3121, typecheck чист, eslint 0.
`pnpm ci:check` — exit 0.

**Дальше — срез 21 Фазы 4:** остаток волны 4 — `/admin/licenses`, `/admin/usage`,
`/admin/proctoring-recordings`, `/admin/identity-verifications`, `/admin/reports/builder`,
`/platform/tenants`.

### 5.283 Фаза 4, срез 21 — пустой экран объясняет себя (ЗАКРЫТ)

**Дата:** 2026-08-16. **Ветка:** `worktree-ui-redesign-faza4-srez21`. **ТЗ:** волна 4 §8.1,
`TPL-006`, `CMP-014`, `TXT-005`; попутно `ФТ-H3`.

**Что нашла сверка.** Сплошная проверка пустых состояний: **59 из 102 не объясняли ничего** —
одна строка «Записей нет», «Задачи не найдены», «Арендаторов пока нет». Это ровно то, что
`TPL-006` запрещает: человек видит пустоту и без подписи, ему нужно знать, что это за раздел,
зачем он и что сделать первым. Компонент `EmptyState` умеет `hint` и `action` с Фазы 2 — их
просто не передавали.

**Сделано.** Пояснение добавлено **46 состояниям** административной части (30 файлов):
«Арендатор — учебный центр, работающий на платформе. Его заводят при подключении по договору»,
«Сеанс появляется, когда человек входит в систему. Здесь его можно завершить принудительно»,
«Метки пишутся в фигурных скобках, например {ФИО}. Проверьте написание в файле».

**Сторож `empty-states-explain.e2e.test.ts`** — очередь, а не разрешение: падает на новом
молчащем пустом состоянии, требует у каждой известной записи пометку волны и отдельно проверяет,
что пояснения в приложении действительно расставлены (иначе «зелено, потому что пустых состояний
не осталось вовсе»). В очереди 6 экранов кабинетов слушателя и методиста — волна 6, там же
доразбирается остаток `mvp/screens.tsx` (§8.3 порядок 10).

**Слепая зона всех сторожей (журнал, запись 71).** При первом прогоне из корня репозитория упали
**семь** сторожей сразу. Причина не в правках: они считали пути от текущего каталога
(`ROOTS = ['src/features', 'app']`, `process.cwd()`), а у набора два штатных способа запуска с
разным каталогом — `pnpm test:frontend` из корня и `pnpm --filter … exec vitest` из
`apps/frontend`. При первом способе сторож либо падал на несуществующем каталоге, либо обходил
**весь монорепозиторий** и ловил чужие файлы. То есть проверка зависела от того, кто как её
запустил. Та же грабля описана в `CLAUDE.md` для бэкенда. Заведён общий
`src/e2e/app-root.ts` — корень приложения считается от файла теста; семь сторожей переведены
на него, оба способа запуска дают одинаковый результат. Проверено подсадным нарушителем: сторож
называет файл поимённо.

**Ещё две находки (журнал, записи 72–73):** «Загружаем список групп…» на экране массового
зачисления рисовалось разметкой пустоты вместо загрузки (заменено на `LoadingState`);
подзаголовок экрана реквизитов центра гласил «Чтение из API tenant/me, tenant/settings,
tenant/requisites» — сырые адреса ручек как значение на экране администратора.

**Тесты:** фронт **1090** (+4), `@trudskill/ui` 147, бэкенд 3121, typecheck чист, eslint 0.
`pnpm ci:check` — **exit 0** (пакеты пересобраны с нуля).

**Дальше — срез 22 Фазы 4:** остаток волны 4 — `/admin/licenses`, `/admin/usage`,
`/admin/proctoring-recordings`, `/admin/identity-verifications`, `/admin/reports/builder`,
`/platform/tenants`.

### 5.284 Фаза 4, срез 22 — лицензии и использование; одна полоса заполнения (ЗАКРЫТ)

**Дата:** 2026-08-16. **Ветка:** `worktree-ui-redesign-faza4-srez22`. **ТЗ:** волна 4 §8.1,
`TPL-001`, `UI-007`, `CMP-*` (компонент из пакета), `TXT-006`.

**Реестр лицензий.** Форма из шести полей висела развёрнутой под таблицей: экран отвечал
«заполни меня» вместо «вот твои лицензии», а первичного действия глазом было не найти —
единственная кнопка «Добавить лицензию» пряталась в конце формы. Теперь она первичное действие
в шапке, форма открывается панелью и предупреждает при закрытии с введёнными данными. Таблица
переведена на `ListPage` с действиями строки; колонка «№» с порядковым номером строки убрана
(она ничего не значила и занимала место в бюджете колонок), «Тип» → «Вид», даты выводятся
по-русски общим `formatDate` вместо сырых `2024-05-12`. Подтверждение отзыва называет номер и
вид лицензии, а не просто «Отзыв нельзя отменить».

**Экран использования.** Убран код тарифа как значение — было «Базовый (basic_2024)».
«(безлимит)» → «(без ограничения)». Добавлено пустое состояние: экран молчал, если данные о
тарифе ещё не пришли.

**Главная находка — полоса заполнения нарисована в коде ВОСЕМЬ раз.** Шесть через голый
`<progress>` и две собраны вручную блоками с инлайновыми цветами прямо в разметке экрана.
Выглядели по-разному, а тон (зелёный / жёлтый / красный) знала только одна. Инлайновые цвета
вдобавок невидимы сторожу дисциплины токенов: он читает строку стилей пакета, а не разметку
экранов — та же слепая зона, что у styled-jsx.

Заведён `ProgressBar` в `@trudskill/ui`. **`tone` отделён от `value` намеренно:** 90% прогресса
по курсу — это хорошо, 90% расхода лимита — тревога; считать цвет из числа значило бы красить
один из этих случаев неверно. Значения вне 0…100 подрезаются — доля больше 100 приходит при
перерасходе лимита, и полоса не должна вылезать за свои границы.

Сведены 4 места (использование, карточка группы, онбординг, заглушка раздела); 4 экрана кабинета
слушателя — очередь волны 6 под сторожем `one-progress-bar.e2e.test.ts` с проверкой, что общая
полоса действительно применяется (иначе «зелено, потому что полос не осталось вовсе»).

**Тесты:** фронт **1094** (+4), `@trudskill/ui` **153** (+6), бэкенд 3121, typecheck чист,
eslint 0. `pnpm ci:check` — **exit 0** (пакеты пересобраны с нуля).

**Дальше — срез 23 Фазы 4:** очереди проверки — `/admin/proctoring-recordings` и
`/admin/identity-verifications` (по 460–490 строк каждая). Затем срез 24 — конструктор отчётов
и арендаторы платформы.

### 5.285 Фаза 4, срез 23 — очереди проверки (ЗАКРЫТ)

**Дата:** 2026-08-16. **Ветка:** `worktree-ui-redesign-faza4-srez23`. **ТЗ:** волна 4 §8.1,
`TPL-001`, `TPL-002`, `CMP-001`, `CMP-003`, `TXT-003`, `TXT-004`, `TXT-006`.

**Обе очереди по одному образцу.** Отбор был сделан кнопками с ручной подсветкой через класс
`ui-subheading` (он про размер шрифта, а не про выбранность) — заменён полем в панели фильтров.
Ссылка «Открыть» жила в безымянной колонке — стала действием строки. Статусы выводились текстом —
стали чипами. Пустые состояния объясняют, откуда берутся заявки и записи.

**Дефект UX: заявку на подтверждение личности можно было отклонить молча.** Причина не
требовалась ни сервером (`rejectionReason?`), ни формой — слушатель видел «Отклонена» без
единого слова о том, что переснять, и звонил в центр. Теперь без причины кнопка «Отклонить
заявку» недоступна, а подсказка объясняет, что слушатель эту причину увидит. **Контракт API не
менялся** — правило введено на форме.

**Дрейф терминологии (`TXT-003`).** Один и тот же раздел назывался «Подтверждение личности» у
слушателя и «Идентификация» / «Идентификация личности» у администратора. Плюс «Записи
прокторинга» — жаргон, которого администратор учебного центра не знает. Сведено: «Подтверждение
личности» везде, «Видеозаписи экзаменов» вместо прокторинга. **URL не менялись.**

**Карточка видеозаписи.** Было «Попытка: 3f7a-… (in_progress)» — идентификатор как значение
плюс код состояния в скобках. Стало «Экзамен: Сдаёт» по общему словарю `ATTEMPT_STATUS_LABELS`
(третью копию словаря не заводил). Кнопка «Собрать и воспроизвести (12 фрагм.)» → «Посмотреть
запись», а ход загрузки — полосой из среза 22 вместо цифр в подписи кнопки: запись весит сотни
мегабайт, и без полосы ожидание выглядит как зависший экран.

**Слепая зона собственного сторожа (журнал, запись 81).** Сторож пустых состояний из среза 21
видел только тег `SectionEmpty` и пропускал второй способ — свойство `emptyMessage` у `ListPage`
и `DataTable`. Экран, переведённый на композицию без пояснения, проходил молча; нашлось прямо
при переводе этих очередей — три места на оперативной панели. Вдобавок `DataTable` вовсе **не
умела** пояснение. Сторож расширен на оба способа (проверено подсадным нарушителем), `DataTable`
получила `emptyHint`, оперативная панель дополнена.

**Тесты:** фронт 1094, `@trudskill/ui` **154** (+1), бэкенд 3121, typecheck чист, eslint 0.
`pnpm ci:check` — **exit 0** (пакеты пересобраны с нуля).

**Дальше — срез 24 Фазы 4:** конструктор отчётов `/admin/reports/builder` и арендаторы
платформы `/platform/tenants` — последние экраны волны 4.

### 5.286 Фаза 4, срез 24 — конструктор отчётов и платформа. ВОЛНА 4 ЗАКРЫТА (ЗАКРЫТ)

**Дата:** 2026-08-16. **Ветка:** `worktree-ui-redesign-faza4-srez24`. **ТЗ:** волна 4 §8.1
(последний срез волны), `CMP-001`, `TXT-002`, `TXT-006`.

**Конструктор отчётов говорил по-программистски.** «Сущность», «Поля», «Фильтры», «Превью»,
«Скачать XLSX», а рядом с названием шаблона стоял код набора данных — «Отчёт по ОТ (learners)».
Стало: «О чём отчёт», «Столбцы отчёта», «Условия отбора», «Показать пример строк», «Скачать в
Excel». Шаблоны выводились списком с двумя кнопками у каждого — стали таблицей с действиями
строки и колонкой «О чём» словом.

**Главная находка: одна запись выводится дважды — сразу на ЧЕТЫРЁХ экранах.** Арендаторы
платформы, счета аренды, библиотека программ, сделки. Везде одинаково: таблица, а под ней
второй проход по тем же данным строками с кнопками; действие открывалось только из нижнего
дубля. В срезе 17 это нашлось в реестре пользователей и было сочтено единичным случаем —
оказалось приёмом, повторённым пять раз.

**Худший случай — сделки.** Нижний список не называл сделку вообще: только стадия и три кнопки
(«В предложение», «Успех», «Отказ»). Понять, какая строка чья, можно было лишь по порядку —
одна оплошность и переведена чужая сделка. Плюс колонка «Группа» показывала идентификатор.

Всё переведено на `rowActions`. Заведён сторож `no-row-duplicate-actions.e2e.test.ts` с **пустой
очередью**: беда вычищена целиком, а не отложена.

**Попутно:** кнопки перехода состояния подписывались стрелкой («→ Приостановлен») — стали
называть действие («Приостановить центр», «Включить работу центра»), приостановка и закрытие
помечены опасными. В библиотеке программ вместо кнопки писалось «нужен доступ «courses.write»» —
код права как значение; заменено объяснением, к кому обращаться. Тарифы платформы выводились
списком с кодом в скобках — стали таблицей.

**Чего НЕ сделал сознательно:** не добавил колонку «Тариф» в список арендаторов. Назначение
тарифа делается на этом же экране, но в ответе сервера (`PlatformTenantDto`) поля тарифа нет —
выдумывать данные нельзя. Записано открытым расхождением (журнал, запись 87): требует
расширения ответа сервера, это ФТ по поведению.

**Тесты:** фронт **1097** (+3), `@trudskill/ui` 154, бэкенд 3121, typecheck чист, eslint 0.
`pnpm ci:check` — **exit 0** (пакеты пересобраны с нуля).

**Дальше:** Фаза 5 «Тёмная тема» (`UI-001`, `UI-005`, `UI-006`, `UI-026`) — контрасты тёмной
темы не проверялись никогда, измерять с нуля. Затем Фаза 6 (кабинеты слушателя и преподавателя,
там же волна 6 и остаток монолита §8.3 порядок 10), Фазы 7–8 — ребрендинг.

### 5.287 Фаза 4, срез 25 — внутренние названия и англицизмы в заголовках (ЗАКРЫТ)

**Дата:** 2026-08-16. **Ветка:** `worktree-ui-redesign-faza4-srez25`. **ТЗ:** `TXT-006`,
правило продукта «ни одного англицизма как значения».

**Слепая зона сторожа из среза 19.** Он проверял подписи в ДАННЫХ (`title: '…'` в объектах
колонок и меню) и не смотрел на заголовки в РАЗМЕТКЕ (`title="…"` у карточек и страниц).

Из-за этого на экранах остались:

- **«Нормативные параметры программы (Pillar A)»** и **«Выходные документы курса (пакет,
  Pillar A)»**, **«Действия проверки — Plan C»** — наши рабочие обозначения этапов разработки,
  показанные администратору учебного центра. Он о них знать не может в принципе;
- «CRM · Сделки», «Панель LMS», «KPI обучения», «Push-уведомления», «Бренд центра
  (white-label)», «Реестр заявок и workflow согласования», «Шаблоны форм ввода для операций
  LMS», «Облачная АТС… интеграция с CRM».

Всё переписано по-русски: «Документы по окончании курса», «Сделки», «Главная», «Показатели
обучения», «Уведомления на телефон и компьютер», «Оформление под ваш центр», «Заявки на
электронную подпись и ход их согласования».

**Сторож расширен и работает строже.** Для разметки латинское слово ловится **внутри** русской
фразы — именно так эти подписи и выглядели: кириллица рядом была, а слово оставалось
непонятным. Разрешён короткий список названий форматов и внешних систем (SCORM, PDF, CSV, XML,
XLSX, DOCX, Excel) плюс название продукта. Витрина компонентов `ui-kit` — единственное
исключение: это экран для разработчика, там названия компонентов пакета и есть содержание.
Проверено подсадным нарушителем.

**Тесты:** фронт **1098** (+1), `@trudskill/ui` 154, бэкенд 3121, typecheck чист, eslint 0.
`pnpm ci:check` — **exit 0** (пакеты пересобраны с нуля).

**Дальше:** Фаза 5 «Тёмная тема».

### 5.288 Сторож styled-jsx перестал падать на Windows (ЗАКРЫТ)

**Дата:** 2026-08-16. **Ветка:** `claude/focused-bohr-001278`. **ТЗ:** `UI-022` (журнал
расхождений, запись 90). Вне очереди срезов — почина сторожа, а не экрана.

**Что было.** `styled-jsx-ban.e2e.test.ts` падал на локальном прогоне **всегда**:

```
AssertionError: expected [ 'app\learning\calendar\page.tsx' ] to deeply equal []
```

Относительный путь считался как `entry.file.slice(root.length + 1)` — это обрезание префикса,
а не перевод в POSIX-путь. `join` на Windows склеивает через `\`, список `ALLOWED` записан через
`/`, совпадения не происходит. Важно, что ломался не один файл: **список исключений переставал
работать целиком** — любое допущенное исключение считалось нарушением.

Цена этого выше, чем «красный тест»: GitHub Actions выключены владельцем, значит вердикт даёт
только локальный прогон. Сторож, красный при любом состоянии кода, не отличает нарушение от
шума — его закономерно перестают читать, а потом ослабляют.

**Сделано.** Путь приводится к `relative(APP_ROOT, file).replace(/\\/g, '/')` — ровно та форма,
что уже у `empty-states-explain`, `id-input-ban`, `latin-titles-ban`, `one-word-per-thing`,
`unified-states` (у `nav-redirect-targets` эквивалент через `split(sep).join('/')`). Идиома в
папке теперь одна.

Добавлена вторая проверка — **список исключений не содержит несуществующих записей**. Без неё
промах в записи (разделители, переезд файла, регистр) снова остался бы немым: список молча
перестал бы кого-либо разрешать. Она же доказывает, что обходчик действительно находит
календарь, а не «зелено, потому что ничего не просканировано».

**Проверка остальных сторожей.** Все 9 файлов `src/e2e/*`, обходящих файловую систему, прочитаны:
разделители нормализованы везде, кроме исправленного; `browser-dialogs-ban` использует тот же
`slice`, но с `.replace(/\\/g, '/')` — корректно; `ia-architecture` собирает маршруты
конкатенацией через `/` и от разделителей не зависит. После слияния проверены и двое новых
сторожей из среза 22 (`no-row-duplicate-actions`, `one-progress-bar`) — оба написаны в правильной
форме.

**Слияние со срезами 22–25 (`origin/main`, PR #516).** Конфликты — только в трёх документах, кода
не касались. Все три одного рода: две ветки дописали запись в один и тот же список.

- `LMS_AGENT_HANDOFF.md` и `README.md` — обе стороны заняли номер **§5.284**. Номер оставлен за
  срезом 22 (он уже в `main`, на него ссылаются его же README и статус), эта запись стала
  **§5.288** — следующей за §5.287.
- `docs/TZ_UI_REDESIGN_STATUS.md` — **git слил таблицу журнала без конфликта и получил два номера
  74**: обе ветки добавили строку с одинаковым ключом, а для git первая колонка — обычный текст.
  Молчаливое слияние здесь опаснее конфликта: сам он не сообщает, что список сломан. Эта строка
  перенумерована в **90**, проверено, что дублей номеров в журнале не осталось.

**Файлы:** `apps/frontend/src/e2e/styled-jsx-ban.e2e.test.ts`,
`docs/TZ_UI_REDESIGN_STATUS.md`, `LMS_AGENT_HANDOFF.md`, `README.md`.

**Тесты после слияния:** `src/e2e` — **41 файл / 281 тест**, фронт **168 файлов / 1099 тестов**,
`@trudskill/ui` 154 (пакет пересобран), typecheck по монорепозиторию 13/13, eslint по файлу 0.
Бэкенд не затронут.

### 5.289 Фаза 5, срез 1 — контрасты измерены, брендирование починено (ЗАКРЫТ)

**Дата:** 2026-08-16. **Ветка:** `worktree-ui-redesign-faza5-srez1`. **ТЗ:** `UI-001`, `UI-005`,
`UI-006`.

**`UI-001`: контрасты измеряются, а не декларируются.** Числа светлой темы стояли в
комментариях `tokens/index.ts` и никем не перепроверялись; тёмная не проверялась ни разу.
Комментарий не падает, когда цвет правят, — «проверено на AA» тихо превращается в «когда-то
было проверено».

Заведена своя чистая функция расчёта по WCAG 2.2 (`tokens/contrast.ts`) — не библиотека,
`RISK-002` запрещает вводить новые. Прогон `contrast-audit.test.ts` меряет **23 пары «что на
чём» × 2 темы = 49 измерений**. Список пар записан руками сознательно: контраст есть только у
пары, а какие пары бывают — задаёт вёрстка. Значит, пара это утверждение «мы рисуем ЭТО на ЭТОМ»,
и оно должно быть явным.

**Измерение сразу нашло два дефекта.**

1. **Граница поля ввода — 1.23:1 на белом** (в тёмной теме 1.40:1) при норме WCAG 1.4.11 в 3:1.
   У поля ввода граница это единственный признак, что сюда можно писать; человек со слабым
   зрением его не различал. Заведён `--ui-border-strong` (светлая `#7c8aa0` — 3.50:1, тёмная
   `#6b7891` — 3.84:1) для полей и кнопок. Разделители карточек и строк таблицы остались на
   прежнем `--ui-border`: там граница не несёт роли «это элемент управления», а тёмная линия
   между каждой парой строк превратила бы таблицу в решётку. Это разделение ролей, а не поблажка.

2. **`UI-005`: центр с тёмным фирменным цветом не мог прочитать собственную первичную кнопку.**
   `brandingToThemeVars` перекрывал акцент, но не `--ui-on-accent` — тот оставался тёмным
   `#0f172a`, потому что правило выведено для светлого коралла. Тёмно-синий акцент давал 1.72:1.
   Теперь текст выбирается по измеренному контрасту. 7 граничных случаев в тестах, включая точку
   перелома: на `#808080` выигрывает ещё тёмный текст (4.52:1 против 3.95:1), и лишь около
   `#767676` выбор переворачивается на белый. Точка лежит не на «половине шкалы» — так работает
   гамма-коррекция яркости.

**Попутно: есть цвета, на которых не читается НИКАКОЙ текст.** Средние по яркости дают меньше
4.5:1 и с тёмным, и с белым — популярный фиолетовый `#8b5cf6` даёт 4.23:1. Форма брендирования
теперь предупреждает числом и советом («возьмите заметно темнее или светлее»), но **не
запрещает**: это фирменный цвет центра, выбор за его владельцем.

**`UI-006` зафиксирован тестом, а не только словами:** `brandingToThemeVars` не отдаёт ни одной
`--ui-nav-*` даже при ярко-жёлтом фирменном цвете. Боковое меню остаётся тёмной поверхностью с
гарантированным контрастом. ТЗ прямо просит зафиксировать это решение письменно, чтобы следующий
заход не «дочинил» его как недоделку — тест надёжнее комментария.

**Тесты:** фронт **1107** (+9), `@trudskill/ui` **203** (+49), бэкенд 3121, typecheck чист,
eslint 0. `pnpm ci:check` — **exit 0** (пакеты пересобраны с нуля).

**Дальше — срез 2 Фазы 5:** `UI-026` — переключатель темы живёт только в настройках, по ТЗ он
нужен в меню пользователя в шапке; плюс визуальный прогон волн 1–2 в тёмной теме.

### 5.290 Фаза 5, срез 2 — переключатель темы в шапке; идентификаторы как значения (ЗАКРЫТ)

**Дата:** 2026-08-16. **Ветка:** `worktree-ui-redesign-faza5-srez2`. **ТЗ:** `UI-026`, правило
продукта «ни одного идентификатора как значения».

**`UI-026`: переключатель оформления переехал в шапку.** Он жил только на экране настроек:
человек, которому прямо сейчас слишком ярко или слишком темно, должен был вспомнить про
существование настроек и дойти туда. Тема — это как громкость: её меняют по ходу работы, а не
«настраивают однажды».

Взят список из трёх состояний, а не кнопка-переключатель по кругу. Кнопка требует догадки, что
будет следующим нажатием, и не показывает текущее состояние словом — правило продукта
«предсказуемо важнее красиво». Инвариант закреплён в стороже каркаса.

**Попутно вскрылась вторая половина правила про идентификаторы.** Сторож `id-input-ban` (срез 9)
ловит случай, когда идентификатор **просят ввести**. Обратную сторону — когда его **показывают
значением** — не проверял никто. Нашлось четыре места:

1. **Список зачисленных в группу состоял из идентификаторов вместо фамилий** — самое грубое:
   понять, кто учится в группе, по такому списку нельзя. Заведён общий справочник
   `useLearnerNames` (пара к `useCourseNames` из среза 9).
2. **Идентификатор арендатора висел в шапке на каждом экране** с подписью «Тенант» — сырое
   машинное значение плюс слово, которого администратор центра не знает. И это был дубль:
   название центра уже стоит слева в шапке.
3. **Карточка сотрудника**: поле «Организация» показывало тот же идентификатор → «Учебный
   центр» с названием.
4. **Список видеозаписей** опознавался по коду записи → размер и длительность («12,4 МБ ·
   5 мин 30 с»). Имени файла сервер не присылает — **не выдумывал**, взял существующие поля.

Заведён сторож `raw-id-values-ban.e2e.test.ts` на узкий однозначный случай: идентификатор как
единственное содержимое узла разметки. Ключи (`key={item.id}`), обработчики и адреса он не
трогает — там идентификатор на своём месте; это проверено отдельным тестом самого сканера,
иначе правило легко «починить», сузив выражение до пустоты.

**Тесты:** фронт 1113, `@trudskill/ui` 203, бэкенд 3121, typecheck чист, eslint 0.
`pnpm ci:check` — **exit 0** (пакеты пересобраны с нуля).

**Дальше:** визуальный прогон волн 1–2 в тёмной теме — последнее по Фазе 5. Затем Фаза 6:
кабинеты слушателя и преподавателя, там же волна 6, остаток монолита (§8.3 порядок 10) и все
накопленные очереди сторожей.

### 5.291 Фаза 5, срез 3 — визуальный прогон волн 1–2 в тёмной теме; ФАЗА 5 ЗАКРЫТА (ЗАКРЫТ)

**Дата:** 2026-08-17. **PR #526.** Последний пункт фазы 5: все маршруты волн 1–2 пройдены
в браузере на живом стенде (вход администратором, тёмная тема переключателем из среза 2).

**Главное — дефект логики: шим useQuery уходил в вечный цикл запросов.** `refetch` был
завязан на идентичность объекта опций, который каждый экран создаёт заново на каждом
рендере → эффект монтирования перезапускался после каждого рендера: запрос → setState →
рендер → новый `refetch` → снова запрос. Живьём: шесть ручек оболочки (`workspace/summary`,
`tasks/inbox`, `blockers`, `notifications`, `esignature/status`, `tenant/branding`)
опрашивались ~2 раза в секунду каждая (~1400 повторов за десять минут наблюдения),
`/workspace` вечно висел в скелетоне, в консоли «Maximum update depth exceeded».
Починено ref-паттерном: `refetch` стабилен, свежие опции читаются в момент вызова.
Сторож `src/lib/query/react-query-shim.loop-guard.test.ts` поднимает мини-рантайм хуков
с честной семантикой deps (RTL в репозитории нет — RISK-002) и падает на прежнем коде —
проверено подсадным нарушителем.

**Регрессия программы: `/learners` так и не был переключён на эталонный реестр Фазы 2.**
PR #493 построил `LearnersListScreen`, но его не импортировал никто — маршрут отдавал
дореформенный экран (каждый человек дважды: таблица + список ссылок; статус кодом
`active`). Маршрут переключён, страница — тонкая обёртка по §8.2. Урок: приёмка экрана
обязана открывать МАРШРУТ в браузере, а не файл экрана в редакторе.

**Тёмная тема:** ссылки без класса рисовались браузерным синим `#0000EE` (~1.1:1 на тёмных
поверхностях) → правило `a:not([class])` в тон `.ui-link`; дорожка прогресса из
`--ui-neutral-100` (в тёмной палитре почти белый — пустая полоса выглядела заполненной) →
`--ui-surface-muted`; график аналитики ссылался на несуществующие `var(--color-*)` →
токены `--ui-*` (найдено статически — «ловушка палитры» сработала ровно как предсказано).

**Сырые значения и тексты:** `[object Object]` в ячейке `DataTable` (React-элемент без
`render`); `Курс course_…` в подзаголовках карточек теста и задания → названия курсов;
крошки не знали родной формат id (`learner_…` печатался сырым) и показывали служебный
сегмент `admin`; карточка слушателя — «ученик» → «слушатель», «Код (learnerNo)» → «Личный
номер», статусы и даты словами; «Срок» задач `/workspace` — ISO → `formatDate`;
«Prev/Next» → «Назад/Вперёд»; «Drop-off» → «Забросили обучение»; три коралловые кнопки
на карточке теста → одно первичное «Опубликовать» (UI-003). Сторож латиницы расширен на
`label:` (тут же поймал два «Email») + исключения применены и к проверке данных.

**Очередь (запись 107 журнала):** 9 нативных `input type="file"` с английским
«Choose File» в 8 файлах — нужна общая компонента (Фаза 6); два коралла на `/documents`;
длинные крошки наезжают на поиск; фолбэки `Курс ${id}` в экранах волны 6.

**Стенд для прогона:** worktree, backend :3001 + frontend :3005 (`next dev --webpack` —
без флага Turbopack отказывается стартовать из-за webpack-конфига), демо-данные посеяны
через API (слушатели/курс/группа/тест/задание/зачисления), CORS_ORIGIN в env бэкенда
переставлен на :3005. Сервис realtime (:3002) не поднимался — его env-файла нет и на
основном стенде; шум `ERR_CONNECTION_REFUSED` в консоли не связан с правками.

**Тесты:** фронт **1117** (170 файлов), `@trudskill/ui` **203** (34 файла); полный
`pnpm ci:check` после `rm -rf packages/*/dist` — **exit 0** (первый прогон поймал
3 ошибки import-x/order в моих же файлах — починены `eslint --fix`). Светлая тема
сверена после правок: вид не изменился (surface-muted и neutral-100 в светлой палитре
совпадают побитово).

### 5.298 Фаза 6, срез 7 — очередь unified-states закрыта (ЗАКРЫТ)

**Дата:** 2026-08-18. **PR #533.** Долг, висевший с фазы 2: «четыре дровера и модалка
ждут переезда на DetailDrawer».

**Пять самодельных панелей → общий `DetailDrawer`:** дроверы задания, банка вопросов,
вопроса (assessment-admin) и компании (clients, был на пакетном `Dialog` — без состояний)
+ модалка «Сгенерировать приказ» (group-orders, рукописный `ui-modal`). Единые состояния,
ловушка фокуса и Esc — из общего слоя. В исключениях сторожа `unified-states` остались
только обоснованные не-экраны (витрина, 4 подборщика, бренд-провайдер, прячущаяся
карточка документов) — каждый с объяснением. **Шестая закрытая очередь фазы 6.**

**Попутно (запись 113):** «ID модуля (опционально)» текстом в дровере задания — слово
«ID» стояло в label, а сторож `id-input-ban` смотрит placeholder; заменено выбором модуля
по названию («Весь курс» по умолчанию). Термины: «Учеников» → «Слушателей» в модалке
приказа, «Email» → «Почта» в форме компании, «Требуется ревью» → «проверка
преподавателем» (дровер + карточка задания).

**Тесты:** сторожа **286**, фронт **1117**, typecheck чистый; полный `pnpm ci:check`
после `rm -rf packages/*/dist` — **exit 0**. Живьём: дровер «Создание задания»,
тёмная тема.

### 5.297 Фаза 6, срез 6 — очередь id-input-ban закрыта (ЗАКРЫТ)

**Дата:** 2026-08-18. **PR #532.** Последние три места из сплошного поиска среза 9
(19 полей «вставьте идентификатор») + одно, которое сторож не видел.

**Закрытие группы** (`features/close-group/screens.tsx`) — самая тяжёлая форма: группа
и курс — селектами по названию, шаблоны протокола/удостоверения — по имени из
`useDocumentTemplates` (фильтр по `templateType`), а textarea «ID записей сдавших через
пробел или запятую» → **список зачислений группы с фамилиями и флажками** (+ «Отметить
всех/Снять отметки»; зачисления грузятся `useEnrollments({group_id})`, пока группа
не выбрана — запрос сжат до одной строки). **Добавление слушателя в группу** —
`LearnerSelect` вместо «ID слушателя». **Материалы** — отбор по названию модуля
(`useModules()` без параметра отдаёт все модули центра), колонки словами
(`materialTypeLabel`, `viewTimeLabel`), модуль — названием.

**Слепая зона сторожа (запись 112):** поле привязки видео с `placeholder="mat_..."`
проходило мимо регулярки — в образце нет слова «ID». Поле заменено выбором материала
по названию (`useMaterials()`), регулярка расширена на родной формат (`prefix_…` /
`prefix_\.\.\.`), расширение проверено подсадным нарушителем. Чипы зачислений в карточке
группы — цвет по коду + слово подписью.

**Очередь `id-input-ban` пуста** — пятая пустая очередь фазы 6.

**Тесты:** сторожа **286**, фронт **1117**, typecheck чистый; полный `pnpm ci:check` после
`rm -rf packages/*/dist` — **exit 0** (первый прогон — 1 import-x/order, та же грабля
`@tanstack` раньше `@trudskill`). Живьём в тёмной теме: карточка группы, панель
«Закрыть группу», материалы, привязка видео.

### 5.296 Фаза 6, срез 5 — компонента выбора файла; браузерных окон не осталось (ЗАКРЫТ)

**Дата:** 2026-08-17. **PR #531.**

**`FilePicker` в пакете `@trudskill/ui`:** нативный `input type="file"` рисует браузерную
надпись «Choose File / No file chosen», которая не переводится, — в русском интерфейсе
жили девять английских кнопок (запись 107). В компоненте настоящий input визуально скрыт,
но остаётся в фокусном порядке (клавиатура/скринридер работают, фокус подсвечивает кнопку
через `:focus-within`, недоступность — через `:disabled ~`); глазами — кнопка пакета
и имя файла по-русски. Переведены все девять мест в восьми файлах (зачисление списком,
бланки шаблонов, подпись/печать центра ×2, подтверждение личности ×2, SCORM, практические
работы, видео, ответы ведомств); ref-схемы (шаблоны, SCORM) переведены на состояние.
`grep 'type="file"'` по фронтенду — ноль совпадений.

**Браузерных окон в интерфейсе больше нет (CMP-006 добит):** два последних `alert`
(заглушки «скачивание пока недоступно» на экранах слушателя) заменены выключенными
кнопками с пояснением; список исключений `browser-dialogs-ban` пуст (в начале фазы 4
браузерных окон было 11).

**Попутно (список документов слушателя):** ЧЕТВЁРТАЯ копия словаря видов документов
сведена в `mvp/screen-helpers` (третью убрал срез 2), даты по-русски, сырой id в списке
аннулированных заменён словами.

**Тесты:** ui **213** (у компоненты 4 своих), фронт **1117**; полный `pnpm ci:check`
после `rm -rf packages/*/dist` — **exit 0**. Живьём: «Зачисление списком», тёмная тема.

### 5.295 Фаза 6, срез 4 — методист, календарь (UI-021), портал заказчика (ЗАКРЫТ)

**Дата:** 2026-08-17. **PR #530.** Два коммита по SCR-001.

**Закрыты две очереди сторожей:** `styled-jsx-ban` — календарь был последним styled-jsx
во фронтенде, стили переехали в `packages/ui/src/styles/calendar.ts` (хардкоды заменены
токенами; `UI-021` ✅ целиком), список исключений пуст; `empty-states-explain` — все
восемь пустых состояний методиста получили пояснения, очередь пуста.

**Календарь:** экран из `page.tsx` → `features/learning-calendar/`; **в ячейках были
обрезанные идентификаторы слушателей** («3f7a8b12…») → фамилии через `useLearnerNames`.
Справочник гейтится правом `learners.read` — живая проверка ПОД СЛУШАТЕЛЕМ поймала тосты
«Permission denied» (у роли нет права на список слушателей), гейт добавлен до слияния:
`useLearnersList`/`useLearnerNames` получили опции `{ enabled, silent }`. Подзаголовок
содержал имя поля базы («planned_end_at») → слова. Статусы словами, тексты по канону.

**Портал заказчика:** вынесен из `page.tsx` (IA-001); статусы трёх таблиц были кодами
`active`/`draft` → чипы со словами; даты ISO → `formatDate`; «Загрузка...» → «Загружаем…».

**Дрейф двух словарей статусов документов** (запись 111): чип пакета говорил
`generated` = «Выдан», канон книги выдачи — «Подготовлен», а `final` в чипе отсутствовал.
Сведён к канону. Чипы зачислений («Мои курсы», главная): цвет по коду + слово подписью.

**Тесты:** ui **209**, фронт **1117**, полный `pnpm ci:check` после `rm -rf packages/*/dist`
— **exit 0**. Живьём: календарь под слушателем (без тостов), методист под методистом
(реальные данные, тёмная тема). Портал живьём не открыт — в демо-базе нет пользователя
с ролью представителя заказчика.

### 5.294 Фаза 6, срез 3 — прохождение теста и просмотр курса; очередь полос закрыта (ЗАКРЫТ)

**Дата:** 2026-08-17. **PR #529.**

**Очередь сторожа `one-progress-bar` ПУСТА.** Последние две самодельные полосы — голый
`<progress>` по вопросам в `test-attempt-screen` и полоса с процентом в
`course-viewer-screen` — переведены на общую `ProgressBar`. Все восемь самодельных полос
из сверки перед срезом 22 закрыты; сторож остаётся ловить новые (плюс проверка «общая
полоса действительно используется» — ≥4 экранов).

**Просмотр курса:** фолбэк заголовка «Курс course_…» больше не показывает сырой
идентификатор (закрыты все фолбэки из записи 107); мёртвые CSS-правила старой полосы
(`__row`/`__value`/`__caption`) удалены из `course-viewer.ts`.

**Тест-плеер:** пустые состояния «Моих тестов» и «Результата теста» объясняют, откуда
берутся тесты и когда появляется результат (сняты 2 позиции `empty-states-explain`;
в очереди остался один `methodist-home`).

**Тесты:** сторожа `src/e2e` **286**, фронт **1117**, полный `pnpm ci:check` после
`rm -rf packages/*/dist` — **exit 0** (первый прогон поймал 1 import-x/order).
Живьём: «Мои тесты» (новое пустое состояние) и курс «Охрана труда для руководителей»
под логином слушателя, тёмная тема.

### 5.293 Фаза 6, срез 2 — главная слушателя и hero по UI-010 (ЗАКРЫТ)

**Дата:** 2026-08-17. **PR #528.**

**Hero «Следующий шаг» (`UI-009`/`UI-010`):** сохранён, декор снят — индиго-градиент →
плоская подложка в тон `--ui-surface-accent`, бренд-акцент на заголовке
(`.ui-hero__title` → `--ui-brand-700`), декоративная «печать» (conic-gradient с маской)
и eyebrow удалены, тень `--ui-shadow-strong` → `--ui-shadow`, hover CTA берёт
`--ui-accent-700`. Из переменных `--ui-hero-*` остались пять. **Фон героя впервые стал
измеримым** — в `contrast-audit` добавлены пары текст/пояснение/бренд-заголовок на фоне
героя ×2 темы (6.7–15.9:1, посчитано до фиксации). Мёртвое правило `.ui-wordmark__accent`
(последний потребитель eyebrow, не рендерится никем) удалено.

**Главная слушателя:** «Мои курсы» — статус словами, `ProgressBar` вместо голого
`<progress>`, пустое состояние с подсказкой, фолбэк «Курс course_…» убран.
**«Недавно выданные документы» держали ТРЕТЬЮ копию словаря видов документов, уже
разъехавшуюся** («Свидетельство» ≠ «Свидетельство об аттестации», запись 110 журнала) —
сведена в `mvp/screen-helpers`; дата документа форматируется по-русски. Подзаголовок
«Главный экран ученика» → «Ваше обучение: следующий шаг, курсы и документы».
Пустое состояние «Выданные документы» админской карточки слушателя получило подсказку.
Очереди сторожей: сняты 3 позиции (`one-progress-bar` ×1, `empty-states-explain` ×2).

**Тесты:** ui **209** (аудит вырос на 6 измерений), фронт **1117**; полный `pnpm ci:check`
после `rm -rf packages/*/dist` — **exit 0**. Живьём: `/learner` под логином `learner`
в обеих темах; активное состояние героя проверено инъекцией разметки (у демо-слушателя
нет зачислений).

### 5.292 Фаза 6, срез 1 — план разбиения §8.3 завершён; редизайн «Моих курсов» (ЗАКРЫТ)

**Дата:** 2026-08-17. **PR #527.** Два коммита по SCR-001 (перенос отдельно от редизайна).

**Перенос (порядок 10 — последний): монолит `features/mvp/screens.tsx` удалён полностью**
(3 019 строк на старте программы → 0). Курсы слушателя → `features/learner-courses/screens.tsx`,
сетка виджетов по ролям + `StudentDashboardScreen`/`TeacherGradingCenterScreen`/`AdminCockpitScreen`
→ `features/role-dashboards/role-widgets.tsx`. Общий слой (hooks.ts, screen-helpers.tsx, types)
остался в `features/mvp/` — как предписывают границы §8.3. Пять точек импорта переведены
(4 страницы + `/workspace`). Очереди сторожей `one-progress-bar` и `empty-states-explain`
сами упали на переезде файла — записи переведены на новые пути.

**Редизайн «Моих курсов» (`/learner/courses`):** слушатель видел «Назначение enrollment_x…»
вместо названия курса у своих документов; статус зачисления кодом `active` в чипе; вид
документа `(certificate)`; подсказка пустого списка языком администратора («проверьте
привязку шаблона»). Всё заменено словами; `DOCUMENT_TYPE_LABELS` переехал из
learner-pdf-card в `mvp/screen-helpers` (третья копия не заведена); голый `<progress>` →
`ProgressBar` из пакета; фолбэк «Курс course_…» больше не показывает сырой id. Сняты две
позиции очередей (`one-progress-bar`, `empty-states-explain`) — сторожа это проверяют.

**Открыто (запись 109 журнала):** `/student/dashboard` — «Главная **учащегося**»
(термин-дрейф + возможный дубль `/learner»), `/teacher/grading-center` — роль `teacher`
отсутствует в живых базах (запись 21). Перенесены «как есть»; решение — следующие срезы.

**Тесты:** фронт **1117** (170 файлов), сторожа `src/e2e` **286**, typecheck чистый; полный
`pnpm ci:check` после `rm -rf packages/*/dist` — **exit 0** (первый прогон поймал 1 ошибку
import-x/order). Живьём: вход слушателем `learner`, `/learner/courses` в обеих темах,
виджеты «Панели администратора» на `/workspace` после переезда.

## 6. Files Changed

| File                                                                                 | Change Type        | Purpose                                                                                                                        |
| ------------------------------------------------------------------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `apps/backend/src/modules/iam/permission.guard.test.ts`                              | modified           | Дополнительные authz regression unit tests                                                                                     |
| `apps/backend/src/modules/mvp/mvp.http.integration.test.ts`                          | created            | HTTP integration regression для LMS permission/session boundaries                                                              |
| `apps/backend/src/modules/mvp/mvp.service.ts`                                        | modified           | Защита progress update: enrollment должен быть связан с course через group-course                                              |
| `apps/backend/src/modules/mvp/mvp.service.test.ts`                                   | modified           | Regression coverage доменных проверок progress/submissions/attempts/reviews + lifecycle/score (включая отрицательные значения) |
| `apps/backend/src/modules/mvp/mvp.concurrency.test.ts`                               | modified           | Актуализация concurrency regression под новые domain invariants                                                                |
| `apps/backend/vitest.config.ts`                                                      | modified           | Увеличены test/hook timeout для стабильного backend CI прогона                                                                 |
| `SDOPROF_TZ_FINAL.md`                                                                | created            | Финальное структурированное ТЗ LMS/СДО Проф                                                                                    |
| `LMS_AGENT_HANDOFF.md`                                                               | recreated/modified | Актуальный handoff по текущему состоянию                                                                                       |
| `apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts`                  | created            | HTTP integration: доменные инварианты submissions / attempts / reviews + score bounds                                          |
| `apps/backend/src/modules/mvp/infrastructure/mvp-request-persistence.interceptor.ts` | modified           | Явный `@Inject(TenantSerialGateway)` для корректного DI                                                                        |
| `apps/backend/src/modules/mvp/mvp.types.ts`                                          | modified           | `Learner.linkedIamUserId?: string`                                                                                             |
| `apps/backend/src/modules/mvp/mvp.dto.ts`                                            | modified           | Опциональные `linkedIamUserId` в simple registry requests                                                                      |
| `apps/backend/src/modules/mvp/mvp.controller.ts`                                     | modified           | Прокидка `{ actorId, permissions }` в list/get attempts, submissions, exam-results                                             |
| `apps/backend/src/modules/mvp/mvp.service.ts`                                        | modified           | Bypass чтения по `assessment.read.cross_learner`; анти-IDOR мутаций + scoped read                                              |
| `apps/backend/src/modules/mvp/mvp.service.test.ts`                                   | modified           | linkedIam GET/list + bypass по permission                                                                                      |
| `apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts`                  | modified           | mock `resolvePermissions` по `userId`; cross_learner только staff sub                                                          |
| `apps/backend/src/modules/iam/permission.guard.ts`                                   | modified           | `requestContext.permissions := resolved`                                                                                       |
| `apps/backend/migrations/0025_assessment_read_cross_learner_permission.sql`          | created            | Permission + role_permissions для staff ролей                                                                                  |
| `apps/frontend/src/lib/auth/permission-map.ts`                                       | modified           | Staff: `assessment.read.cross_learner`, `learners.act_as`                                                                      |
| `apps/backend/migrations/0026_learners_act_as_permission.sql`                        | created            | `learners.act_as` + staff `role_permissions`                                                                                   |

## 7. Database / Schema / Migration Changes

- **`0025`**: `assessment.read.cross_learner` — см. §5.15.
- **`0026`**: `learners.act_as` и привязка к тем же staff-ролям в `tenant_demo`.
- **`0027`**: `audit.audit_log.metadata jsonb NULL` — см. §5.17.
- Прогон миграций обязателен для выдачи прав и новой колонки audit в PostgreSQL.

## 8. API Changes

- Пути/методов смены нет.
- Расширены **необязательные** поля JSON для записи learner: `linkedIamUserId` (camelCase).
- **`POST /assignment-submissions`** и **`POST /attempts/start`**: **`learnerId` обязателен и должен совпадать с фактическим слушателем зачисления** (`400 validation_error` при нарушении). Ранее клиент мог опускать или подменять без проверки.
- Исправление работы пайплайна persistence: корректная сериализация по tenant через `TenantSerialGateway` в `MvpRequestPersistenceInterceptor` (устранены потенциальные **500 Internal** при успешном auth/permission path).
- Изменено runtime поведение endpoint-ов:
  - `PATCH /progress/materials/:materialId`:
  - теперь update прогресса отклоняется, если enrollment не связан с курсом материала через `group_courses`.
  - код ошибки: `domain_rule_violation` (HTTP 412 через `PreconditionFailedException`).
  - `POST /assignment-submissions`:
  - submission отклоняется, если enrollment не связан с course задания через `group_courses`.
  - код ошибки: `domain_rule_violation` (HTTP 412 через `PreconditionFailedException`).
  - `POST /attempts/start`:
  - attempt start отклоняется, если enrollment не связан с course теста через `group_courses`.
  - код ошибки: `domain_rule_violation` (HTTP 412 через `PreconditionFailedException`).
  - `POST /assignment-reviews`:
  - review отклоняется для draft submission (`domain_rule_violation`, HTTP 412);
  - дубликат review для того же submission отклоняется (`conflict`, HTTP 409).
  - `PATCH /assignment-reviews/:id`:
  - completed review отклоняется как read-only (`domain_rule_violation`, HTTP 412).
  - `POST /assignment-reviews/:id/complete`:
  - повторный complete отклоняется (`domain_rule_violation`, HTTP 412);
  - complete разрешён только для `in_review`.
  - Если у слушателя задан **`linkedIamUserId`**, мутации **прогресса / черновых субмиссий / сабмита субмиссии / ответов в попытке / сабмита попытки** от другого **`JWT.sub`** возвращают **`403`** `forbidden`, **если у актора нет** **`learners.act_as`** (миграция `0026`; иначе — разрешено при сохранении `learnerId`/enrollment/group-course).
  - **Чтение** при **`linkedIamUserId`**: обход только с **`assessment.read.cross_learner`** или **`learners.act_as`** (списки/GET assessment — см. §5.15–5.16).

| Method | Path                               | Change                                                                                       | Auth Required | Roles                           |
| ------ | ---------------------------------- | -------------------------------------------------------------------------------------------- | ------------- | ------------------------------- |
| PATCH  | `/progress/materials/:materialId`  | Добавлена проверка связи enrollment-group-course; несвязанный enrollment отклоняется         | yes           | `progress.recalculate`          |
| POST   | `/assignment-submissions`          | Добавлена проверка связи enrollment-group-course задания; несвязанный enrollment отклоняется | yes           | `assessment.submissions.submit` |
| POST   | `/attempts/start`                  | Добавлена проверка связи enrollment-group-course теста; несвязанный enrollment отклоняется   | yes           | `assessment.attempts.take`      |
| POST   | `/assignment-reviews`              | Добавлены проверки статуса submission и уникальности review по submission                    | yes           | `assessment.reviews.review`     |
| PATCH  | `/assignment-reviews/:id`          | Completed review переведён в read-only режим                                                 | yes           | `assessment.reviews.review`     |
| POST   | `/assignment-reviews/:id/complete` | Добавлены lifecycle проверки `in_review -> completed`, повторный complete запрещён           | yes           | `assessment.reviews.review`     |

## 9. Frontend / UI Changes

- **`permission-map`** (dev/эвристика ролей): staff-роли дополнены **`learners.act_as`** для согласованности с backend seed.
- В рамках `ci:check` подтверждён успешный `next build`.
- Страница **`/assessment`**: действия для слушателя (ссылка в реестр / подсказка делегирования) условно по **`assessment.read.cross_learner`** и **`learners.act_as`**; см. §5.19.

## 10. Auth / Permissions Notes

- Auth опирается на backend `PermissionGuard` + session activity checks.
- Roles/permissions резолвятся через IAM.
- Protected routes проверяются на backend через permissions.
- В этой итерации усилены:
  - guard-level unit regression;
  - HTTP integration regression на `mvp` LMS permission boundaries;
  - HTTP regression доменных инвариантов assessment (`mvp.domains.http.integration.test.ts`).
  - HTTP + unit: связка **`linkedIamUserId`** против чужого JWT; HTTP `PATCH progress` без группа↔курс.
- **Оставшиеся риски / не закрыто этой веткой работ** (не путать с закрытыми в §5.15–5.17: там уже есть **`assessment.read.cross_learner`**, **`learners.act_as`**, аудит **`metadata.delegated`**):
  - изоляция **cross-tenant**: unit-регрессии **MVP** §5.24, **documents** §5.25, **e-sign** §5.26, **integrations** §5.27, **communication** §5.28, **audit** §5.31; **`Provider`** без tenant — по дизайну; IAM SQL уже с `tenant_id`;
  - политика **JWT vs заголовки**: частично закрыто в §5.23 (`x-tenant-id` vs JWT, проброс `HttpException`); остальное — [docs/security-remediation-roadmap.md](docs/security-remediation-roadmap.md);
  - ручной смок по ролям; отсутствие полного исходного ТЗ заказчика (§13 Issue 0).

## 11. Validation / Error Handling

- **`createAppValidationPipe()`**: глобальный Nest pipe — **`whitelist: true`**, **`forbidNonWhitelisted: true`**, ответ ошибок класса **`BadRequest`** с **`code: 'validation_error'`** (согласование prod и HTTP harness).
- Class-validator-классы для части **`mvp.dto`**: см. §5.18 (`UpdateMaterialProgressRequest`, попытки, субмиссии, `CreateSimpleRegistryRequest`).
- Добавлена новая backend domain validation в `MvpService.upsertMaterialProgress()`:
  - enrollment должен быть связан с course материала через `group_courses`.
- Добавлена backend domain validation в `MvpService.createAssignmentSubmission()`:
  - enrollment должен быть связан с course задания через `group_courses`.
- Добавлена backend domain validation в `MvpService.startAttempt()`:
  - enrollment должен быть связан с course теста через `group_courses`.
- Добавлена backend domain validation в `MvpService.createAssignmentReview()`:
  - review разрешён только для `submitted/under_review` submission;
  - дубликат review для submission запрещён.
- Добавлены backend lifecycle validations:
  - `MvpService.updateAssignmentReview()` запрещает изменения completed review;
  - `MvpService.completeAssignmentReview()` запрещает повторный complete и complete вне статуса `in_review`.
- Error envelope поведение проверено в HTTP integration тестах (`auth_required`, `permission_denied`, `session_inactive`).
- Дополнительно на HTTP уровне зафиксированы коды **`domain_rule_violation`** (412) и **`validation_error`** (400) для assessment/review цепочки в `mvp.domains.http.integration.test.ts`; **`forbidden`** (403) для IDOR при `linkedIamUserId`; обязательный **`learnerId`** на создании субмишена через `BadRequest`.
- Для слушателя: опционально `linkedIamUserId` при создании/обновлении записи в `learners` (общий контракт `CreateSimpleRegistryRequest`/`Update`).

## 12. Tests / Checks Run

| Command                                                                                                                                                                   | Result | Notes                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------- |
| `pnpm exec eslint apps/backend/src/modules/iam/permission.guard.test.ts`                                                                                                  | passed | Линт guard unit test                                                                                       |
| `pnpm exec vitest run apps/backend/src/modules/iam/permission.guard.test.ts`                                                                                              | passed | 1 file / 4 tests                                                                                           |
| `pnpm exec eslint apps/backend/src/modules/mvp/mvp.http.integration.test.ts`                                                                                              | passed | Линт нового integration test файла                                                                         |
| `pnpm exec vitest run apps/backend/src/modules/mvp/mvp.http.integration.test.ts` (первый запуск)                                                                          | failed | Ошибка реализации тестового guard, исправлена в этой итерации                                              |
| `pnpm exec vitest run apps/backend/src/modules/mvp/mvp.http.integration.test.ts` (финальный)                                                                              | passed | 1 file / 4 tests                                                                                           |
| `pnpm -s ci:check` (первый запуск в этой сессии)                                                                                                                          | failed | Backend test stage: `Hook timed out in 30000ms` в нескольких integration/contract suite                    |
| `pnpm --filter @cdoprof/backend test`                                                                                                                                     | passed | После настройки timeout: 49 files / 180 tests                                                              |
| `pnpm -s ci:check` (повторный запуск после фикса)                                                                                                                         | passed | Полный monorepo quality gate зелёный                                                                       |
| `pnpm exec vitest run apps/backend/src/modules/mvp/mvp.service.test.ts` (после domain-фикса, первый прогон)                                                               | failed | Неверная правка теста (ошибочная вставка), исправлено в этой итерации                                      |
| `pnpm exec vitest run apps/backend/src/modules/mvp/mvp.service.test.ts` (повторный)                                                                                       | passed | 1 file / 16 tests                                                                                          |
| `pnpm exec eslint apps/backend/src/modules/mvp/mvp.service.ts apps/backend/src/modules/mvp/mvp.service.test.ts`                                                           | passed | Линт доменного фикса и тестов                                                                              |
| `pnpm --filter @cdoprof/backend test && pnpm -s ci:check`                                                                                                                 | passed | Финальный полный прогон backend + monorepo quality gates                                                   |
| `pnpm exec vitest run apps/backend/src/modules/mvp/mvp.service.test.ts` (после assignment-фикса)                                                                          | passed | 1 file / 17 tests                                                                                          |
| `pnpm --filter @cdoprof/backend test && pnpm -s ci:check` (после assignment-фикса)                                                                                        | passed | Повторный полный прогон зелёный                                                                            |
| `pnpm --filter @cdoprof/backend test && pnpm -s ci:check` (после attempt-фикса, первый прогон)                                                                            | failed | Упал `mvp.concurrency.test.ts` (тест не учитывал новый domain linkage), исправлено в этой итерации         |
| `pnpm exec vitest run apps/backend/src/modules/mvp/mvp.concurrency.test.ts apps/backend/src/modules/mvp/mvp.service.test.ts`                                              | passed | 2 files / 20 tests                                                                                         |
| `pnpm --filter @cdoprof/backend test && pnpm -s ci:check` (финальный прогон)                                                                                              | passed | Полный backend + monorepo quality gate зелёный                                                             |
| `pnpm exec vitest run apps/backend/src/modules/mvp/mvp.service.test.ts apps/backend/src/modules/mvp/mvp.concurrency.test.ts` (после review-фикса)                         | passed | 2 files / 21 tests                                                                                         |
| `pnpm --filter @cdoprof/backend test && pnpm -s ci:check` (после review-фикса)                                                                                            | passed | Повторный полный прогон зелёный                                                                            |
| `pnpm exec vitest run apps/backend/src/modules/mvp/mvp.service.test.ts apps/backend/src/modules/mvp/mvp.concurrency.test.ts` (после lifecycle lock)                       | passed | 2 files / 22 tests                                                                                         |
| `pnpm --filter @cdoprof/backend test && pnpm -s ci:check` (после lifecycle lock)                                                                                          | passed | Финальный полный прогон зелёный                                                                            |
| `Создание/обновление документации: SDOPROF_TZ_FINAL.md, LMS_AGENT_HANDOFF.md`                                                                                             | passed | Документационная итерация, без изменения runtime-кода                                                      |
| `pnpm exec vitest run apps/backend/src/modules/mvp/mvp.service.test.ts apps/backend/src/modules/mvp/mvp.concurrency.test.ts` (после score-валидации, первый прогон)       | failed | Обновлённая доменная валидация выявила старые тестовые фикстуры без `maxScore`; исправлено в этой итерации |
| `pnpm exec vitest run apps/backend/src/modules/mvp/mvp.service.test.ts apps/backend/src/modules/mvp/mvp.concurrency.test.ts` (повторный прогон)                           | passed | 2 files / 23 tests                                                                                         |
| `pnpm --filter @cdoprof/backend test && pnpm -s ci:check` (после score-валидации)                                                                                         | passed | Финальный полный прогон зелёный                                                                            |
| `pnpm exec vitest run apps/backend/src/modules/mvp/mvp.service.test.ts apps/backend/src/modules/mvp/mvp.concurrency.test.ts` (после расширения negative-score regression) | passed | 2 files / 23 tests                                                                                         |
| `pnpm --filter @cdoprof/backend test && pnpm -s ci:check` (после расширения negative-score regression)                                                                    | passed | Повторный полный прогон зелёный                                                                            |
| `pnpm exec vitest run apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts`                                                                                  | passed | 3 HTTP-теста реального `MvpController` + memory persistence                                                |
| `pnpm --filter @cdoprof/backend test` (после 5.13)                                                                                                                        | passed | 50 files / 189 tests (+3 к прошлому отчёту 180 — пересчитано по актуальному прогону)                       |
| `pnpm -s ci:check` (после 5.13)                                                                                                                                           | passed | Полный monorepo quality gate зелёный (~74s)                                                                |
| `pnpm --filter @cdoprof/backend test && pnpm -s ci:check` (после 5.14 анти-IDOR)                                                                                          | passed | 193 тестов; включая расширенный `mvp.domains.http.integration`                                             |
| `pnpm --filter @cdoprof/backend test && pnpm -s ci:check` (после 5.15 read/list IDOR)                                                                                     | passed | 193 тестов; `mvp.domains.http` + unit read-scope                                                           |
| `pnpm --filter @cdoprof/backend test` (после 5.16 `learners.act_as`)                                                                                                      | passed | 195 тестов (+ unit + HTTP act-as delegation)                                                               |
| `pnpm exec vitest run apps/backend/src/common/guards/tenant.guard.test.ts apps/backend/src/modules/iam/auth.http-regression.e2e.test.ts` (после 5.23)                     | passed | JWT vs `x-tenant-id`, IAM HTTP regression                                                                  |
| `pnpm -s ci:check` (после 5.23 TenantGuard)                                                                                                                               | passed | Полный monorepo quality gate зелёный                                                                       |
| `pnpm -s ci:check` (после 5.24 cross-tenant `getById`)                                                                                                                    | passed | Полный monorepo quality gate зелёный                                                                       |
| `pnpm -s ci:check` (после 5.25 documents `must` regression)                                                                                                               | passed | Полный monorepo quality gate зелёный                                                                       |
| `pnpm -s ci:check` (после 5.26 esign `must` regression)                                                                                                                   | passed | Полный monorepo quality gate зелёный                                                                       |
| `pnpm -s ci:check` (после 5.27 integrations `getTask` regression)                                                                                                         | passed | Полный monorepo quality gate зелёный                                                                       |
| `pnpm exec vitest run apps/backend/src/modules/communication/communication.service.test.ts`                                                                               | passed | 6 tests, tenant collision regression для notifications/webinars/chat                                       |
| `pnpm -s ci:check` (после 5.28 communication tenant regression)                                                                                                           | passed | Полный monorepo quality gate зелёный                                                                       |
| `pnpm -s ci:check` (после 5.29 LAUNCH_RUNBOOK smoke-таблица)                                                                                                              | passed | Документация; полный quality gate зелёный                                                                  |
| `pnpm -s ci:check` (после 5.30 README integration links)                                                                                                                  | passed | Документация; полный quality gate зелёный                                                                  |
| `pnpm -s ci:check` (после 5.31 AuditService.list tenant hardening)                                                                                                        | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.32 BL-001 createUser audit contract)                                                                                                          | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.33 IAM P0.3 updateUser/roles contract)                                                                                                        | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.34 legacy password rehash on login)                                                                                                           | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.35 audit iam.password_rehashed)                                                                                                               | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.36 audit contract + roadmap §6 + health live)                                                                                                 | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.37 roadmap §7 integrations crypto docs + credential leak test)                                                                                | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.38 learners `[id]` UI + runbook)                                                                                                              | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.39 workspaceApi + roadmap §4–5)                                                                                                               | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.40 workspace HTTP tenant regression)                                                                                                          | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.41 health live HTTP integration)                                                                                                              | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.42 health ready HTTP integration)                                                                                                             | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.43 health ready 503 HTTP integration)                                                                                                         | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.44 `MvpBulkEnqueueService` unit)                                                                                                              | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.45 BL-003 queued bulk HTTP regressions)                                                                                                       | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.46 MVP DTO validation regressions)                                                                                                            | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.47 BL-007 listener regressions)                                                                                                               | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.48 BL-008 KPI snapshot HTTP regressions)                                                                                                      | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.49 BL-008 KPI breakdown flag `=1`)                                                                                                            | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.50 BL-008 KPI breakdown flag `=0`)                                                                                                            | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.51 BL-003 invalid deliveryMode HTTP regression)                                                                                               | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.52 BL-007 listener tenant isolation regression)                                                                                               | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.53 BL-003 uppercase deliveryMode regression)                                                                                                  | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.54 health HTTP hook-timeout stabilization)                                                                                                    | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.55 BL-003 default deliveryMode regression)                                                                                                    | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.56 BL-003 spaced deliveryMode regression)                                                                                                     | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.57 BL-008 mixed-case KPI breakdown flag regression)                                                                                           | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.58 BL-003 internal worker HTTP + `@Inject(MvpService)`)                                                                                       | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.59 BL-003 worker bulk callback unit + вынос из `main`)                                                                                        | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.60 BL-005 attempt limit HTTP regression)                                                                                                      | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.61 BL-006 duplicate assignment review HTTP regression)                                                                                        | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.62 BL-006 duplicate complete assignment review HTTP regression)                                                                               | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.63 BL-006 PATCH completed review read-only HTTP regression)                                                                                   | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.64 BL-006 PATCH submitted assignment submission HTTP regression)                                                                              | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.65 BL-010 assignment submission PATCH/submit intruder JWT HTTP regression)                                                                    | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.66 BL-010 assignment-submissions list learner scope HTTP regression)                                                                          | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.67 audit correlation_id в IAM + `AuditWritePayload`)                                                                                          | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.68 correlation_id в audit: documents/MVP/e-sign/integrations)                                                                                 | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.69 enrollment_completed trace → certificate listener + BL-007 flow test)                                                                      | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.70 documents generate/batch `RequestContext` + idempotency key)                                                                               | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.71 documents HTTP regress `documents.generate` на batch)                                                                                      | passed | Полный quality gate зелёный                                                                                |
| `pnpm --filter @cdoprof/backend exec vitest run .../documents.http.integration.test.ts` + `pnpm -s ci:check` (после 5.72 single generate)                                 | passed | Регресс **403/201** для **`POST …/documents/generate`**; полный monorepo gate                              |
| `pnpm -s ci:check` (после 5.73 esign HTTP submit vs write boundary)                                                                                                       | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.74 esign HTTP start-review / `esign.applications.review`)                                                                                     | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.75 esign HTTP participants/sign / `esign.participants.sign`)                                                                                  | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.76 esign HTTP GET legal-log / `esign.legal.read`)                                                                                             | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.77 esign HTTP GET processes / `esign.processes.read`)                                                                                         | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.78 esign HTTP GET application-files / `esign.applications.read`)                                                                              | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.79 esign HTTP POST application-files / `esign.applications.write`)                                                                            | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.80 esign HTTP POST application-files verify / `esign.applications.review`)                                                                    | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.81 esign HTTP POST application-files reject / `esign.applications.review`)                                                                    | passed | Полный quality gate зелёный                                                                                |
| `pnpm -s ci:check` (после 5.82 esign HTTP approve/reject application + DELETE application-file)                                                                           | passed | Регресс **BL-010** e-sign; полный quality gate зелёный                                                     |
| `pnpm -s ci:check` (после 5.83 esign HTTP processes POST/start + participant skip/mark-viewed)                                                                            | passed | Регресс **BL-010** e-sign **processes.write** / **participants.sign**; полный gate зелёный                 |
| `pnpm -s ci:check` (после 5.84 integrations HTTP PATCH + позитивные GET/POST sync)                                                                                        | passed | Регресс **BL-010** integrations harness **read/write**; полный gate зелёный                                |
| `pnpm -s ci:check` (после 5.85 documents HTTP guard PATCH PUT DELETE → write + regress templates/:id)                                                                     | passed | Регресс **BL-010** documents harness; полный gate зелёный                                                  |
| `pnpm -s ci:check` (после 5.86 integrations HTTP PUT DELETE → write + regress providers/:id)                                                                              | passed | Регресс **BL-010** integrations harness; полный gate зелёный                                               |
| `pnpm -s ci:check` (после 5.87 esign PATCH applications/participants + POST reuse-check)                                                                                  | passed | Регресс **BL-010** e-sign harness; полный gate зелёный                                                     |
| `pnpm -s ci:check` (после 5.88 esign POST participants/invite/cancel/events/legal-log entry)                                                                              | passed | Регресс **BL-010** e-sign harness parity с **`EsignController`**; полный gate зелёный                      |
| `pnpm -s ci:check` (после 5.89 esign GET parity: processes/:id, participants, application-files/:id, events/:id)                                                          | passed | Регресс **BL-010** e-sign object-level GET permission boundaries; полный gate зелёный                      |

## 13. Known Issues

### Issue 0: Внешний эталонный документ заказчика (не в репозитории)

- Severity: medium (не блокирует пилот и приёмку в объёме [SDOPROF_TZ_FINAL.md](SDOPROF_TZ_FINAL.md) [§47](SDOPROF_TZ_FINAL.md#47-приложение-б-фиксация-границ-пилота-must--вне-scope))
- Area: docs/product
- Description: отдельный файл «исходного ТЗ заказчика» (DOCX/PDF и т.п.) в репозиторий может **не входить**; продуктовый каркас консолидирован в **SDOPROF_TZ_FINAL.md** (см. v1.6+ и [§44.1](SDOPROF_TZ_FINAL.md#441-исходное-тз-заказчика)). Эталон заказчика нужен для **матрицы расхождений** в [docs/TZ_MVP_TRACEABILITY.md](docs/TZ_MVP_TRACEABILITY.md) (блок **MVP-TZ-01**), а не для расширения пилота без протокола.
- Evidence: исторически в сессии использовался placeholder вместо вложения; в ТЗ зафиксирована иерархия источников правды.
- Suggested fix: при появлении документа от заказчика — заполнить строки MVP-TZ-01 и при необходимости протокол к **§47**; не трактовать отсутствие внешнего файла как «дыру» в обязательном scope пилота.

### Issue 2: Длительные backend integration тесты при ограниченных ресурсах CI

- Severity: low
- Area: backend/tests
- Description: даже после фикса таймаутов и отключения file-parallelism backend integration/contract suite остаётся заметным по времени.
- Evidence: множественные bootstrap Nest приложения в монорепо `turbo` + Vitest.
- Suggested fix: по мере возможности уменьшать дублирование bootstrap и выносить тяжёлые кейсы в облегчённые harness без полного приложения там, где достаточно unit.

### Issue 3: ✅ RESOLVED (2026-06-06, §5.108) — полное Nest-приложение не стартовало (DI-«deadlock»)

- Severity: была **high** (блокировала `pnpm dev:web` / `pnpm --filter @cdoprof/backend dev`); НЕ влияла на юнит/стаб-тесты.
- **Истинная первопричина (гипотеза про цикл провайдеров оказалась ЛОЖНОЙ):** dev-runtime `tsx` (esbuild) **не эмитит `emitDecoratorMetadata`** (`Reflect.getMetadata('design:paramtypes', X) === undefined`). Поэтому конструкторные параметры, инжектируемые **по типу** (`private readonly x: FooService` без `@Inject`), резолвятся в undefined-токен, и инжектор Nest **виснет** на «осиротевшем промисе» внутри `NestFactory.create()` (видно как `beforeExit code=0`, только таймер в `getActiveResourcesInfo`). Первый модуль с type-based DI в порядке загрузки — `FilesModule` (`FilesService` инжектит `DatabaseService`/`AuditService` без `@Inject`); локализовано **бисекцией кумулятивных префиксов модулей**. Прод не затронут: Dockerfile запускает **компилированный** `node dist/main.js`, а `tsc` метаданные эмитит.
- **Fix (§5.108):**
  1. **Все 29 type-based инъекций в 23 файлах → явный `@Inject(Token)`** (codemod), плюс перевод нужных типов из `import type` в value-import (для `@Inject` нужен runtime-значение). Конвенция «всегда `@Inject`» уже доминировала в IAM/Infrastructure-модулях; `tsx` сохранён (переключение рантайма потребовало бы переписать ~78 extensionless-импортов в packages — `moduleResolution: Bundler`).
  2. **`CommunicationModule`** теперь импортирует `IamModule` (его `EmailNotificationsController` под `@UseGuards(PermissionGuard)` требует `IamService`/`AuthService`) — был отдельный первый DI-барьер.
  3. **Regression-guard** [`apps/backend/src/common/di-explicit-injection.test.ts`](apps/backend/src/common/di-explicit-injection.test.ts) — статически падает, если в backend-провайдерах/контроллерах снова появится type-based инъекция (boot-тест под vitest/esbuild не годится — та же проблема метаданных; и DB/Cyrillic-краши).
- Проверено: все 17 модулей бутятся (бисекция), реальный `pnpm dev:web` (миграции включены) → `Nest application successfully started`, health 200, логин end-to-end (login → /auth/me → /users/:id/roles → /workspace/summary, все 200). `typecheck` 8/8, ESLint clean, guard-тест зелёный.

### Issue 4: Цепочка миграций не накатывается на чистую БД — ✅ РЕШЕНО (2026-06-20, §5.135)

- **Статус (2026-06-20, §5.135): РЕШЕНО.** Выбран вариант edit-in-place (а не consolidated-baseline — безопасно, т.к. БД нигде не развёрнута). Полная цепочка `0001→latest` (56 файлов) теперь накатывается на свежий Postgres из коробки; охраняется постоянным full-chain testcontainers-тестом [migration-bootstrap.full-chain.test.ts](apps/backend/src/infrastructure/database/migration-bootstrap.full-chain.test.ts) (apply-all + все схемы + идемпотентный повтор). Эмпирически найдено и исправлено **6** поломок: 0003 (избыточный re-drop `files_tenant_id_id_uniq`), 0004 (композитные `(tenant_id,id)` uniques на esign-таблицах), 0015 (неквалифицированные `COMMENT ON INDEX`), 0016 (3 осиротевших `COMMENT ON COLUMN payload`), 0032 (`template_type`→`document_type` + восстановление колонки `category_code`), 0036 (`mvp.learners`→`learning.learners`). **Внимание:** правка исторических файлов меняет их checksum'ы → локальную hand-patched dev-БД нужно **пересоздать** с нуля (теперь это работает: `runMigrations` накатит всю цепочку начисто). Спека/план: `docs/superpowers/{specs,plans}/2026-06-20-migration-chain-fresh-bootstrap*`.
- **Исторический контекст (2026-06-06, §5.108):** пункт 3 (`DB_MIGRATIONS_ENABLED`) **ИСПРАВЛЕН** (env.schema → safe `union+transform`). Пункты 1–2 (FK-before-unique в 0003/0004/…) тогда оставались — нужен был consolidated-baseline (см. ниже); закрыты edit-in-place'ом выше. Для локального dev развёрнут обходной путь: применены только FK-safe runtime-миграции `0001/0002/0010/0019/0027/0028` (IAM/audit/base — домен работает на in-memory-драйверах), а **все 48** записаны в `core.schema_migrations` с оригинальными checksum'ами → `runMigrations` при включённых миграциях их пропускает (`pnpm dev:web` бутится без правок). Воспроизведение dev-БД: применить эти 6 миграций к свежей `cdoprof` + записать все checksum'ы + сид RBAC (62 права админам, learner).
- Severity: **high** (блокирует первичный бутстрап реляционной БД «с нуля» из коробки; in-memory-домен + обходной dev-DB маскируют)
- Area: backend/migrations + env-schema
- Description:
  1. **`migrations/0003_mvp_domain_integrity_hardening.sql`**: первый блок (строки 9–11) создаёт на `storage.files` constraint `files_tenant_id_id_uniq`; далее в той же миграции FK (строки 91/242/288) ссылаются на `storage.files(tenant_id, id)`; второй блок (строки 311–313) **повторно дропает** `files_tenant_id_id_uniq` → Postgres: `cannot drop constraint files_tenant_id_id_uniq ... because other objects depend on it`. Второй drop избыточен (constraint уже создан первым блоком).
  2. **`migrations/0004_mvp_esign_domain.sql`**: FK ссылается на `esign_applications` без подходящего unique → `there is no unique constraint matching given keys for referenced table "esign_applications"`.
  3. **`DB_MIGRATIONS_ENABLED: z.coerce.boolean()`** в [apps/backend/src/env.schema.ts:74](apps/backend/src/env.schema.ts) — `Boolean("false") === true`, поэтому флаг нельзя выключить значением `false` (только пустой строкой/unset). В этом же файле уже есть защита для `ANTIVIRUS_ENABLED`/`NOTIFICATIONS_EMAIL_ENABLED` (custom `union+transform`) — `DB_MIGRATIONS_ENABLED` её не получил.
- Evidence: команда уже знает про (1) — комментарий [apps/backend/src/testing/with-test-db.ts:56-61](apps/backend/src/testing/with-test-db.ts) («0003 дважды дропает один constraint, что ломается на свежей БД»); тесты накатывают только минимальные подмножества миграций. Сессия 2026-06-06: полный `runMigrations` на свежей `cdoprof` падает на 0003, после in-memory-патча — на 0004.
- Suggested fix (остаток): паттерн «FK на `(tenant_id, id)` до создания соответствующего UNIQUE» пронизывает hardening-миграции (0003/0004/…), forward-fix отдельными миграциями невозможен (цепочка падает посередине, до новой миграции дело не доходит). Правильное решение — **consolidated baseline-schema** для свежего бутстрапа (или дамп схемы из полностью применённой dev-БД), исторические файлы НЕ править (checksum-guard). Затем CI-тест, накатывающий 0001→latest на свежий testcontainer. ~~(3) `z.coerce.boolean()`~~ — **сделано** (§5.108).

### Issue 5: `di-explicit-injection.test.ts` красный на ветке — ✅ RESOLVED §5.138 (починка guard'а вскрыла 2 реальных DI-бага)

- Severity: **low** (приложение бутилось; не блокировало пилот). Обнаружено при §5.137, правкой §5.137 НЕ вызвано. **Закрыто в §5.138.**
- Area: backend/tests (static DI-guard) + `modules/integrations`
- Description: статический сканер [di-explicit-injection.test.ts](apps/backend/src/common/di-explicit-injection.test.ts) (Issue 3) флагал 4 «офендера», которые оказались **ложными срабатываниями** наивного парсера «первый `constructor(` в файле»: `infrastructure/esia/esia-oidc.provider.ts` (`cfg: EsiaOidcConfig`) и `mock-esia.provider.ts` (`defaultIdentity: ...`, параметр со значением по умолчанию) — фабричные провайдеры без `@Injectable()`; `payments.state-machine.ts` ×2 (`from`/`to: OrderStatus`) — конструктор класса-ошибки `InvalidOrderTransitionError extends Error`, не DI.
- Fix (§5.138, вариант (b)): сканер переписан так, чтобы брать конструкторы **только классов с `@Injectable()`/`@Controller()`** (именно их Nest создаёт через DI), а не «первую попавшуюся скобку». Это убрало 4 ложных срабатывания **и одновременно вскрыло 2 настоящих бага**, которые старый «первый-конструктор» парсер пропускал: в `integrations.controller.ts` второй и третий контроллеры (`ExportsController`, `SyncLogsController`) инъектировали `IntegrationOrchestratorService` **по типу без `@Inject`** → латентный orphaned-promise deadlock под `tsx`/esbuild (в проде с `tsc`-метаданными грузилось). Добавлен `@Inject(IntegrationOrchestratorService)` в оба (паттерн `IntegrationsController`).
- Evidence: после фикса изолированный прогон guard'а зелёный; полный backend (батчами, кроме Cyrillic-краш `mvp.domains.http.integration`) зелёный; typecheck 8/8, ESLint clean.

## 14. Recommended Next Steps

### Critical

1. Сохранять `pnpm -s ci:check` обязательным финальным шагом каждой инженерной итерации.
2. Любые новые auth/security регрессии чинить до feature-работ.
3. При поступлении от заказчика: приложить эталонный документ и обновить **MVP-TZ-01** в [docs/TZ_MVP_TRACEABILITY.md](docs/TZ_MVP_TRACEABILITY.md); границы пилота меняются только протоколом к **§47** `SDOPROF_TZ_FINAL.md` ([§44.1](SDOPROF_TZ_FINAL.md#441-исходное-тз-заказчика)).

### High

1. Миграции: прогон **`0027_audit_log_metadata`** на всех окружениях перед деплоем с новым insert в **`audit.audit_log`**.
2. При появлении новых MVP-эндпоинтов: сразу добавлять DTO-класс и **`assertValidDto`** (см. §5.21).
3. Карточка слушателя в UI: **`/learners/[id]`** (сделано §5.38).

### Medium

1. Минимальный manual smoke по ролям: таблица в **`docs/LAUNCH_RUNBOOK.md`** (см. §5.29 в этом handoff).
2. Синхронизация README с integration coverage: указатель HTTP integration в **`README.md`** (§5.30).

### Low

1. Дальнейшая оптимизация backend test bootstrap после §5.20 (forks последовательно — trade-off времени пайплайна).

## 15. Suggested Next Agent Prompt

«По `SDOPROF_TZ_FINAL.md` / security roadmap: cross-tenant и JWT vs заголовки; прогон миграции **`0027`** на целевых средах; при чтении аудита из UI — типы из **`@cdoprof/api-contracts`** (`AuditLogRecordContract`). При появлении эталона заказчика — блок **MVP-TZ-01** в `TZ_MVP_TRACEABILITY.md` (§13 Issue 0). Финал итерации: **`pnpm -s ci:check`**.»

## 16. Important Context / Assumptions

- Проект стабильно собирается и тестируется в текущем локальном окружении (`pnpm` monorepo).
- В IAM добавлены permissions **`assessment.read.cross_learner`** (0025), **`learners.act_as`** (0026); staff-роли в seed получают их автоматически после миграций.
- Изменения затронули `mvp` security (linkedIamUserId / learnerId consistency) и расширенный HTTP regression suite.
- Консолидированное ТЗ — `SDOPROF_TZ_FINAL.md` (в т.ч. §44.1: внешний эталон заказчика не расширяет пилот без протокола); внешний DOCX/PDF при наличии — только матрица расхождений в `TZ_MVP_TRACEABILITY.md`.
- `ci:check` используется как основной индикатор готовности итерации.

## 17. Environment Variables

| Variable                   | Required                | Purpose                             | Notes                             |
| -------------------------- | ----------------------- | ----------------------------------- | --------------------------------- |
| `DATABASE_URL`             | yes (backend runtime)   | PostgreSQL connection               | value not included                |
| `DB_MIGRATIONS_ENABLED`    | optional                | Enable migrations on startup        | boolean-like                      |
| `NEXT_PUBLIC_API_BASE_URL` | yes (frontend)          | Backend API URL                     | public env                        |
| `NEXT_PUBLIC_REALTIME_URL` | yes (frontend realtime) | Realtime endpoint URL               | public env                        |
| `PUBLIC_BASE_URL`          | optional/tests          | Base URL in tests/helpers           | no secrets                        |
| `WORKER_CALLBACK_SECRET`   | optional                | Защита `POST .../internal/worker/*` | Должен совпадать с токеном worker |
| `WORKER_CALLBACK_TOKEN`    | optional (worker)       | Заголовок к backend internal API    | См. `apps/worker/.env.example`    |

## 18. How To Run Locally

1. `pnpm install`
2. Создать `.env` из `.env.example` (и app-specific env templates при необходимости)
3. (Опционально) поднять инфраструктуру: `docker compose -f infra/docker-compose.yml up -d`
4. Запустить dev: `pnpm dev` или `pnpm dev:web`
5. Проверить качество: `pnpm -s lint && pnpm -s typecheck && pnpm -s build && pnpm -s ci:check`

## 19. How To Continue Development

- Начать с [docs/DOCUMENTATION_MAP.md](docs/DOCUMENTATION_MAP.md#agent-handoff-protocol), затем `README.md` (AI Agent State) и этот `LMS_AGENT_HANDOFF.md`.
- Backend приоритет: `apps/backend/src/modules/iam`, `apps/backend/src/modules/mvp`.
- Frontend приоритет: `apps/frontend/app/learner/*`, `apps/frontend/app/courses*`, `apps/frontend/src/features/auth`.
- После каждого изменения запускать минимум `lint + typecheck`, перед завершением — `ci:check`.
- Избегать разрушительных DB/API/auth изменений без миграций, тестов и документации.

## 20. Final Status

- **Актуальный срез (2026-08-18, §5.298, PR #533): фаза 6 — срезы 1–7; ШЕСТЬ очередей сторожей закрыты** (полосы, пустые состояния, styled-jsx, браузерные окна, поля-идентификаторы, единые состояния). Открыто по фазе 6: судьба `/student/dashboard` и `/teacher/grading-center` (запись 109 — нужно слово владельца), мелкие хвосты записи 107 (два коралла на `/documents`, наезд крошек). После них — фазы 7–8 (ребрендинг).
- Предыдущий (§5.291, PR #526): **фаза 5 редизайна закрыта целиком** (контрасты + переключатель + визуальный прогон волн 1–2 в тёмной теме). Попутно починены вечный цикл запросов в шиме useQuery и маршрут `/learners`, не переключённый на эталонный реестр Фазы 2. Дальше по ТЗ редизайна — Фаза 6 (кабинеты слушателя/преподавателя + накопленные очереди сторожей: `empty-states-explain`, `one-progress-bar`, `id-input-ban`, `browser-dialogs-ban`, `unified-states`, компонента выбора файла), затем 7–8 ребрендинг. CI на GitHub выключен до восстановления лимитов — вердикт даёт локальный `pnpm ci:check`.
- Build status: последний прогон после §5.89 — `pnpm -s ci:check` зелёный.
- Backend: аудит делегирования (`metadata`), HTTP IDOR для **GET attempts / exam-results by enrollment**, class-validator MVP + общий **`createAppValidationPipe`**, frontend guard по **`cross_learner` / `learners.act_as`**, корневой Vitest **`test.projects`** и последовательный прогон backend-тестов.
- Итерация «план к ТЗ/запуску»: добавлены **`POST /enrollments/bulk`** с идемпотентностью в коллекции snapshot **`bulkEnrollmentIdempotency`**, **`GET /reports/kpi-snapshot`**, **`GET /enrollments/:id/certificates`** с проверкой `linkedIamUserId`; UI — KPI на **`/reports`**, сертификаты слушателя в **`LearnerCoursesScreen`**; эксплуатационные заготовки **`docs/LAUNCH_RUNBOOK.md`**, **`docs/BACKUP_ROLLBACK.md`**, трассировка **`docs/TZ_MVP_TRACEABILITY.md`**, NFR-снимок **`docs/NFR_LAUNCH_V1.md`**; доп. контракты в **`packages/api-contracts/src/domains/mvp-metrics/contracts.ts`**.
- Бэклог «полный MVP»: **очередь bulk** — `deliveryMode: queued` публикует в RabbitMQ, **worker** вызывает **`POST /api/v1/internal/worker/mvp/bulk-enrollments`** (`WORKER_CALLBACK_SECRET` / `WORKER_CALLBACK_TOKEN`); **organizationUnitId** у learner и массовые назначения по подразделению; **KPI drill-down** — query `include_enrollment_breakdown=1`; аудит **`iam.user_created`**; регресс **BL-007** listener; class-validator **`CreateModuleRequest`/`CreateMaterialRequest`**; см. **`docs/security-remediation-roadmap.md`** (статус JWT vs заголовки).
- Next best action: (1) прогон миграций **`0027`** на всех окружениях перед релизом; (2) security roadmap: оставшиеся P0/P1 или **manual smoke** по ролям; (3) при пилоте с очередью — проверить пары секретов и потребление `documents.generation`; (4) при поступлении эталона заказчика — **MVP-TZ-01** / протокол к §47 (Issue 0).
- Закрыто в §5.21: все текущие MVP **`@Body`** в **`MvpController`** проходят **`assertValidDto`**; контракты чтения аудита — **`packages/api-contracts/src/domains/audit.ts`**.
- Закрыто в §5.23: **`x-tenant-id`** при Bearer не может расходиться с JWT **`tenant_id`**; **`TenantGuard`** не маскирует **`HttpException`** под **`invalid_token`**.
- Закрыто в §5.24: MVP **`getById`** строго по **`tenantId`**; unit + HTTP регресс cross-tenant для курса.
- Закрыто в §5.25: **documents** — регресс на tenant-scoped **`must`** для шаблонов.
- Закрыто в §5.26: **e-sign** — регресс на tenant-scoped **`must`** для заявок.
- Закрыто в §5.27: **integrations** — регресс на tenant-scoped **`getTask`** для export-task.
- Закрыто в §5.28: **communication** — регресс на tenant-scoped **`get` / `getDialog`** при коллизии `id` между tenant.
- Закрыто в §5.29: **LAUNCH_RUNBOOK** — минимальный **smoke по ролям** (таблица маршрутов и проверок после деплоя).
- Закрыто в §5.30: **README** — перечень **backend HTTP integration** регрессий рядом с каноническим E2E.
- Закрыто в §5.31: **audit** — **`AuditService.list`** без пустого tenant; строгий SQL-фильтр.
- Закрыто в §5.32: **BL-001** — контракт-тест на **`iam.user_created`** при **`createUser`**; roadmap задача **1** — зафиксировано отсутствие чтения **`x-user-id`** в production identity path.
- Закрыто в §5.33: roadmap **P0.3** — контракт **`updateUser`** / **`userRoles`** / **`setRoles`** без утечек хэшей и секретов сессии.
- Закрыто в §5.34: roadmap **P0.2** (часть) — **rehash on login** legacy **SHA-256(seed)** → **scrypt**; **`upgradePasswordHash`** в **`IamService`**.
- Закрыто в §5.35: **BL-001** — аудит **`iam.password_rehashed`** при миграции пароля на **scrypt**.
- Закрыто в §5.36: **BL-010** — тип **`AuditLogPasswordRehashedMetadata`**; roadmap **§6** — зафиксировано выполнение критериев на MVP (cookie refresh, localStorage без токенов); **liveness** — unit-регресс **`live`**.
- Закрыто в §5.37: roadmap **P0.7 / §7** — задокументировано **шифрование секретов интеграций** (реализация + env); регресс на отсутствие **`enc:`** в публичном credential DTO.
- Закрыто в §5.38: **UI карточка слушателя** `/learners/[id]` (**`LearnerDetailsScreen`**), ссылки из реестра; smoke — **LAUNCH_RUNBOOK**.
- Закрыто в §5.39: roadmap **P0 §4–5** — **`workspaceApi`**; единый путь доменных вызовов через **`apiRequest`** (оперативная панель).
- Закрыто в §5.40: **BL-010** — HTTP regress **workspace** по tenant JWT + **`tenant_header_mismatch`**; roadmap **§10** статус дополнен.
- Закрыто в §5.41: **`GET /health/live`** HTTP + envelope (**SDOPROF §36** liveness контур); см. **`health.http.integration.test.ts`**.
- Закрыто в §5.42: **`GET /health/ready`** HTTP + envelope при успешных проверках зависимостей (моки); см. **`health.http.integration.test.ts`**.
- Закрыто в §5.43: **`GET /health/ready`** при отказе миграций (**503**, **`readiness_failed`**, **`error` + `meta`**); liveness независим (**200**).
- Закрыто в §5.44: **BL-003** — unit-регресс публикации bulk job в RabbitMQ (**`MvpBulkEnqueueService`**); см. **`mvp-bulk-enqueue.service.test.ts`**.
- Закрыто в §5.45: **BL-003** — HTTP-регрессии `POST /enrollments/bulk` для `deliveryMode: queued` и duplicate `idempotencyKey` (без повторной публикации).
- Закрыто в §5.46: **BL-010** — class-validator регрессии для **`CreateModuleRequest`** / **`CreateMaterialRequest`** в **`mvp.dto-validation.test.ts`**.
- Закрыто в §5.47: **BL-007** — listener регрессии: duplicate completion event идемпотентен, failure path пишет аудит **`documents.enrollment_certificate_failed`**.
- Закрыто в §5.48: **BL-008** — HTTP-регресс `GET /reports/kpi-snapshot` для `include_enrollment_breakdown=true` и default ответа без breakdown.
- Закрыто в §5.49: **BL-008** — HTTP-регресс `GET /reports/kpi-snapshot` для `include_enrollment_breakdown=1` (числовой флаг).
- Закрыто в §5.50: **BL-008** — HTTP-регресс `GET /reports/kpi-snapshot` для `include_enrollment_breakdown=0` (breakdown не возвращается).
- Закрыто в §5.51: **BL-003** — HTTP-регресс валидации `deliveryMode` (`async` → `400 validation_error`, без enqueue).
- Закрыто в §5.52: **BL-007** — listener регресс tenant isolation (binding другого tenant не приводит к генерации сертификата).
- Закрыто в §5.53: **BL-003** — HTTP-регресс строгой валидации `deliveryMode='QUEUED'` (`400 validation_error`, без enqueue).
- Закрыто в §5.54: **BL-010** — стабилизация `health.http.integration.test.ts` (beforeAll timeout `60_000`) для надёжного полного `ci:check`.
- Закрыто в §5.55: **BL-003** — HTTP-регресс default поведения bulk без `deliveryMode` (immediate path, без enqueue).
- Закрыто в §5.56: **BL-003** — HTTP-регресс строгой валидации `deliveryMode=' queued '` (`400 validation_error`, без enqueue).
- Закрыто в §5.57: **BL-008** — HTTP-регресс для mixed-case `include_enrollment_breakdown=TrUe` (breakdown не возвращается).
- Закрыто в §5.58: **BL-003** — HTTP-регресс worker callback `POST …/internal/worker/mvp/bulk-enrollments` + явный `@Inject(MvpService)` в internal controller.
- Закрыто в §5.59: **BL-003** — модуль **`apps/worker`** `bulk-enrollment-callback.ts` + unit regress (`bulk-enrollment-callback.test.ts`): контракт URL/headers/body и non-retry vs retry по HTTP-коду.
- Закрыто в §5.60: **BL-005** — HTTP-регресс лимита попыток (`attempt_limit_reached` после исчерпания **`attemptLimit`**).
- Закрыто в §5.61: **BL-006** — HTTP-регресс запрета второго **`assignment-reviews`** на один **`submissionId`** (**409 conflict**).
- Закрыто в §5.62: **BL-006** — HTTP-регресс запрета второго **`assignment-reviews/:id/complete`** для уже **`completed`** (**412 domain_rule_violation**).
- Закрыто в §5.63: **BL-006** — в том же HTTP-сценарии регресс **`PATCH /assignment-reviews/:id`** после **`completed`** (**412**, read-only).
- Закрыто в §5.64: **BL-006** — HTTP-регресс **`PATCH /assignment-submissions/:id`** после **`submit`** (**412** **`submission_terminal`**, сдача не редактируется).
- Закрыто в §5.65: **BL-010** — тот же HTTP-сценарий с **`linkedIamUserId`**: чужой JWT — **403** на **`PATCH`** и **`submit`** чужой субмиссии (ранее — создание и **GET**).
- Закрыто в §5.66: **BL-010** — **`GET /assignment-submissions`** (list): два разных **`linkedIamUserId`** — каждый JWT видит только свои строки (**`restrictLearnerIdsForAssessmentList`**).
- Закрыто в §5.67: roadmap **§10** — **`metadata.correlation_id`** в IAM-аудите для связки с HTTP-логами (**`RequestObservabilityInterceptor`** / заголовок **`x-correlation-id`**).
- Закрыто в §5.68: **`metadata.correlation_id`** в аудите **documents / MVP / e-sign / integrations** (HTTP-контуры); слушатель сертификатов по событию — без **`RequestContext`** до §5.69.
- Закрыто в §5.69: **`learning.enrollment_completed`** несёт **`requestId`/`correlationId`** из **`changeEnrollmentStatus`**; слушатель сертификатов пробрасывает в аудит задачи и **`generateDocument`**.
- Закрыто в §5.70: **`POST /documents/generate/batch`** сохраняет **`requestId`/`correlationId`** на задачах генерации (как одиночный **`generate`**).
- Закрыто в §5.71: HTTP integration — граница разрешения **`documents.generate`** для пакетной генерации (отдельно от **`documents.write`**).
- Закрыто в §5.72: HTTP integration — та же граница **`documents.generate`** для одиночной **`POST …/documents/generate`**.
- Закрыто в §5.73: HTTP integration — e-sign **`POST …/applications/:id/submit`** требует **`esign.applications.submit`**, отдельно от **`esign.applications.write`**.
- Закрыто в §5.74: HTTP integration — e-sign **`POST …/applications/:id/start-review`** требует **`esign.applications.review`** (не удовлетворяется одним только **submit+write**).
- Закрыто в §5.75: HTTP integration — e-sign **`POST …/participants/:id/sign`** требует **`esign.participants.sign`**, а не только **`esign.processes.write`**.
- Закрыто в §5.76: HTTP integration — e-sign **`GET …/legal-log`** (и симметрично путь **`…/legal-log/:id`** в guard) требует **`esign.legal.read`**, отдельно от **`esign.applications.read`**.
- Закрыто в §5.77: HTTP integration — **`GET`** по контуру процессов (в harness — **`GET …/processes`**; в guard также **`…/events`**, **`GET …/participants`**) отделён от заявок: **`esign.processes.read`**, без **`esign.applications.read`**.
- Закрыто в §5.78: HTTP integration — **`GET …/application-files`** требует **`esign.applications.read`**; одного **`esign.processes.read`** недостаточно.
- Закрыто в §5.79: HTTP integration — **`POST …/application-files`** требует **`esign.applications.write`**, не только **`esign.applications.read`**.
- Закрыто в §5.80: HTTP integration — **`POST …/application-files/:id/verify`** требует **`esign.applications.review`**, не только **read+write** на заявках.
- Закрыто в §5.81: HTTP integration — **`POST …/application-files/:id/reject`** тот же контур **`esign.applications.review`** (общий паттерн в guard с verify).
- Закрыто в §5.82: HTTP integration — **`POST …/applications/:id/approve`** и **`POST …/applications/:id/reject`** требуют **`esign.applications.review`** (не **submit+write**); **`DELETE …/application-files/:id`** требует **`esign.applications.write`**.
- Закрыто в §5.83: HTTP integration — **`POST …/processes`** и **`POST …/processes/:id/(start|cancel)`** (в harness — **start**) — **`esign.processes.write`**; **`POST …/participants/:id/skip`** — **`esign.processes.write`**, не **`participants.sign`**; **`POST …/participants/:id/(sign|mark-viewed|reject)`** — **`esign.participants.sign`**.
- Закрыто в §5.84: HTTP integration — **integrations** harness: **`PATCH`** мутации к **`integrations.write`** (регресс от модели «только **POST** = write»); позитивные **GET**/**POST sync** с envelope.
- Закрыто в §5.85: HTTP integration — **documents** harness: **PATCH**/ **PUT**/ **DELETE** требуют **`documents.write`**; регресс **templates/:id**.
- Закрыто в §5.86: HTTP integration — **integrations** harness: **PUT**/ **DELETE** → **`integrations.write`** (до правки ошибочно **read**); регресс **providers/:id**.
- Закрыто в §5.87: HTTP integration — **e-sign**: **PATCH …/applications/:id** — **`esign.applications.write`**; **POST …/reuse-check** — **`esign.applications.read`**; **PATCH …/participants/:id** — **`esign.processes.write`**.
- Закрыто в §5.88: HTTP integration — **e-sign**: **POST …/participants** и **POST …/participants/:id/invite** — **`esign.processes.write`** (закрыт «дырявый» harness без **`required`**); регресс **POST …/processes/:id/cancel**, **POST …/participants/:id/reject** (**sign**), **GET …/events** (**processes.read**); **GET …/applications/:id**, **GET …/legal-log/:id**; стабы read по **application-files/:id**, **processes/:id**, **participants**, **events/:id**.
- Закрыто в §5.89: HTTP integration — **e-sign GET parity**: object-level **`GET …/processes/:id`**, **`GET …/participants`**, **`GET …/application-files/:id`** получили отдельные **403/200** регрессии; добавлены success-кейсы для **`GET …/processes/:id/status`** и **`GET …/events/:id`**.

## 21. Новые MVP API (быстрый справочник)

| Method | Path                                    | Permission                | Назначение                                                                     |
| ------ | --------------------------------------- | ------------------------- | ------------------------------------------------------------------------------ |
| POST   | `/enrollments/bulk`                     | `enrollments.write`       | BL-003: sync или `deliveryMode: queued`; org unit см. **`organizationUnitId`** |
| POST   | `/internal/worker/mvp/bulk-enrollments` | `x-worker-callback-token` | Только worker: завершение queued bulk                                          |
| GET    | `/reports/kpi-snapshot`                 | `enrollments.read`        | BL-008 KPI; опционально `include_enrollment_breakdown=1`                       |
| GET    | `/enrollments/:id/certificates`         | `enrollments.read`        | BL-007 выдача ссылок на сертификаты по завершении                              |
