# LMS Agent Handoff

> **Связка с другими агентами:** порядок «продолжай по ТЗ» и что обновлять после сессии — [docs/DOCUMENTATION_MAP.md — протокол передачи](docs/DOCUMENTATION_MAP.md#agent-handoff-protocol). Краткое операционное состояние дублируйте в [README.md](README.md) (блок **AI Agent State**).

## 1. Current Date / Session

- Date: 2026-05-05 (UTC+3)
- Agent: Cursor Agent (Composer)
- Repository: `D:/Создание LMS/Cursor LMS/cdoprof-`
- Branch, if known: `main`
- Commit hash before work, if available: `8157adc74c9fadba6f076bcfa0e2e84f93394b1d` (базовый HEAD; при появлении коммита после правок — дополнить вручную)
- Commit hash after work, if available: не создавался в git; последняя проверка на рабочей копии после правок

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

## 14. Recommended Next Steps

### Critical

1. Сохранять `pnpm -s ci:check` обязательным финальным шагом каждой инженерной итерации.
2. Любые новые auth/security регрессии чинить до feature-работ.
3. При поступлении от заказчика: приложить эталонный документ и обновить **MVP-TZ-01** в [docs/TZ_MVP_TRACEABILITY.md](docs/TZ_MVP_TRACEABILITY.md); границы пилота меняются только протоколом к **§47** `SDOPROF_TZ_FINAL.md` ([§44.1](SDOPROF_TZ_FINAL.md#441-исходное-тз-заказчика)).

### High

1. Миграции: прогон **`0027_audit_log_metadata`** на всех окружениях перед деплоем с новым insert в **`audit.audit_log`**.
2. При появлении новых MVP-эндпоинтов: сразу добавлять DTO-класс и **`assertValidDto`** (см. §5.21).
3. По желанию: отдельная карточка слушателя в UI (deeplink `/learners/:id`) вместо ссылки на общий реестр.

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

- Build status: после правок этого плана выполните `pnpm -s ci:check`.
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

## 21. Новые MVP API (быстрый справочник)

| Method | Path                                    | Permission                | Назначение                                                                     |
| ------ | --------------------------------------- | ------------------------- | ------------------------------------------------------------------------------ |
| POST   | `/enrollments/bulk`                     | `enrollments.write`       | BL-003: sync или `deliveryMode: queued`; org unit см. **`organizationUnitId`** |
| POST   | `/internal/worker/mvp/bulk-enrollments` | `x-worker-callback-token` | Только worker: завершение queued bulk                                          |
| GET    | `/reports/kpi-snapshot`                 | `enrollments.read`        | BL-008 KPI; опционально `include_enrollment_breakdown=1`                       |
| GET    | `/enrollments/:id/certificates`         | `enrollments.read`        | BL-007 выдача ссылок на сертификаты по завершении                              |
