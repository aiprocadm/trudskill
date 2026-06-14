# LMS Agent Handoff

> **Связка с другими агентами:** порядок «продолжай по ТЗ» и что обновлять после сессии — [docs/DOCUMENTATION_MAP.md — протокол передачи](docs/DOCUMENTATION_MAP.md#agent-handoff-protocol). Краткое операционное состояние дублируйте в [README.md](README.md) (блок **AI Agent State**).

## 1. Current Date / Session

- Date: 2026-05-07 (UTC+3)
- Agent: Cursor Agent (Composer)
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

### Issue 4: Цепочка миграций не накатывается на чистую БД (часть — `DB_MIGRATIONS_ENABLED` — ✅ исправлена)

- **Статус (2026-06-06, §5.108):** пункт 3 (`DB_MIGRATIONS_ENABLED`) **ИСПРАВЛЕН** (env.schema → safe `union+transform`). Пункты 1–2 (FK-before-unique в 0003/0004/…) **остаются** — нужен consolidated-baseline (см. ниже). Для локального dev развёрнут обходной путь: применены только FK-safe runtime-миграции `0001/0002/0010/0019/0027/0028` (IAM/audit/base — домен работает на in-memory-драйверах), а **все 48** записаны в `core.schema_migrations` с оригинальными checksum'ами → `runMigrations` при включённых миграциях их пропускает (`pnpm dev:web` бутится без правок). Воспроизведение dev-БД: применить эти 6 миграций к свежей `cdoprof` + записать все checksum'ы + сид RBAC (62 права админам, learner).
- Severity: **high** (блокирует первичный бутстрап реляционной БД «с нуля» из коробки; in-memory-домен + обходной dev-DB маскируют)
- Area: backend/migrations + env-schema
- Description:
  1. **`migrations/0003_mvp_domain_integrity_hardening.sql`**: первый блок (строки 9–11) создаёт на `storage.files` constraint `files_tenant_id_id_uniq`; далее в той же миграции FK (строки 91/242/288) ссылаются на `storage.files(tenant_id, id)`; второй блок (строки 311–313) **повторно дропает** `files_tenant_id_id_uniq` → Postgres: `cannot drop constraint files_tenant_id_id_uniq ... because other objects depend on it`. Второй drop избыточен (constraint уже создан первым блоком).
  2. **`migrations/0004_mvp_esign_domain.sql`**: FK ссылается на `esign_applications` без подходящего unique → `there is no unique constraint matching given keys for referenced table "esign_applications"`.
  3. **`DB_MIGRATIONS_ENABLED: z.coerce.boolean()`** в [apps/backend/src/env.schema.ts:74](apps/backend/src/env.schema.ts) — `Boolean("false") === true`, поэтому флаг нельзя выключить значением `false` (только пустой строкой/unset). В этом же файле уже есть защита для `ANTIVIRUS_ENABLED`/`NOTIFICATIONS_EMAIL_ENABLED` (custom `union+transform`) — `DB_MIGRATIONS_ENABLED` её не получил.
- Evidence: команда уже знает про (1) — комментарий [apps/backend/src/testing/with-test-db.ts:56-61](apps/backend/src/testing/with-test-db.ts) («0003 дважды дропает один constraint, что ломается на свежей БД»); тесты накатывают только минимальные подмножества миграций. Сессия 2026-06-06: полный `runMigrations` на свежей `cdoprof` падает на 0003, после in-memory-патча — на 0004.
- Suggested fix (остаток): паттерн «FK на `(tenant_id, id)` до создания соответствующего UNIQUE» пронизывает hardening-миграции (0003/0004/…), forward-fix отдельными миграциями невозможен (цепочка падает посередине, до новой миграции дело не доходит). Правильное решение — **consolidated baseline-schema** для свежего бутстрапа (или дамп схемы из полностью применённой dev-БД), исторические файлы НЕ править (checksum-guard). Затем CI-тест, накатывающий 0001→latest на свежий testcontainer. ~~(3) `z.coerce.boolean()`~~ — **сделано** (§5.108).

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
