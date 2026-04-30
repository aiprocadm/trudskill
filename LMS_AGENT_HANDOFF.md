# LMS Agent Handoff

## 1. Current Date / Session

- Date: 2026-04-30 (UTC+3)
- Agent: Codex (GPT-5.3)
- Repository: `D:/Создание LMS/Cursor LMS/cdoprof-`
- Branch, if known: `main`
- Commit hash before work, if available: `3904be9536a71dd6acc5f94f21f91c10842c8cea`
- Commit hash after work, if available: `3904be9536a71dd6acc5f94f21f91c10842c8cea` (commit не создавался)

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
- `infra` — docker-compose и инфраструктурный слой
- `README.md` — проектный контекст

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

## 6. Files Changed

| File                                                        | Change Type        | Purpose                                                                                                                        |
| ----------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `apps/backend/src/modules/iam/permission.guard.test.ts`     | modified           | Дополнительные authz regression unit tests                                                                                     |
| `apps/backend/src/modules/mvp/mvp.http.integration.test.ts` | created            | HTTP integration regression для LMS permission/session boundaries                                                              |
| `apps/backend/src/modules/mvp/mvp.service.ts`               | modified           | Защита progress update: enrollment должен быть связан с course через group-course                                              |
| `apps/backend/src/modules/mvp/mvp.service.test.ts`          | modified           | Regression coverage доменных проверок progress/submissions/attempts/reviews + lifecycle/score (включая отрицательные значения) |
| `apps/backend/src/modules/mvp/mvp.concurrency.test.ts`      | modified           | Актуализация concurrency regression под новые domain invariants                                                                |
| `apps/backend/vitest.config.ts`                             | modified           | Увеличены test/hook timeout для стабильного backend CI прогона                                                                 |
| `SDOPROF_TZ_FINAL.md`                                       | created            | Финальное структурированное ТЗ LMS/СДО Проф                                                                                    |
| `LMS_AGENT_HANDOFF.md`                                      | recreated/modified | Актуальный handoff по текущему состоянию                                                                                       |

## 7. Database / Schema / Migration Changes

- БД/схема/миграции в этой итерации не менялись.
- Миграции не создавались и не выполнялись.
- Рисков данных и backward compatibility рисков от изменений нет.

## 8. API Changes

- Пути/методы API не менялись.
- Новых request/response контрактов не добавлено.
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

| Method | Path                               | Change                                                                                       | Auth Required | Roles                           |
| ------ | ---------------------------------- | -------------------------------------------------------------------------------------------- | ------------- | ------------------------------- |
| PATCH  | `/progress/materials/:materialId`  | Добавлена проверка связи enrollment-group-course; несвязанный enrollment отклоняется         | yes           | `progress.recalculate`          |
| POST   | `/assignment-submissions`          | Добавлена проверка связи enrollment-group-course задания; несвязанный enrollment отклоняется | yes           | `assessment.submissions.submit` |
| POST   | `/attempts/start`                  | Добавлена проверка связи enrollment-group-course теста; несвязанный enrollment отклоняется   | yes           | `assessment.attempts.take`      |
| POST   | `/assignment-reviews`              | Добавлены проверки статуса submission и уникальности review по submission                    | yes           | `assessment.reviews.review`     |
| PATCH  | `/assignment-reviews/:id`          | Completed review переведён в read-only режим                                                 | yes           | `assessment.reviews.review`     |
| POST   | `/assignment-reviews/:id/complete` | Добавлены lifecycle проверки `in_review -> completed`, повторный complete запрещён           | yes           | `assessment.reviews.review`     |

## 9. Frontend / UI Changes

- Frontend-код не менялся.
- В рамках `ci:check` подтверждён успешный `next build`.
- Ролевые UI решения и маршруты не изменялись.

## 10. Auth / Permissions Notes

- Auth опирается на backend `PermissionGuard` + session activity checks.
- Roles/permissions резолвятся через IAM.
- Protected routes проверяются на backend через permissions.
- В этой итерации усилены:
  - guard-level unit regression;
  - HTTP integration regression на `mvp` LMS permission boundaries.
- Оставшийся security gap: полезно добавить object-level IDOR integration coverage для course/progress сущностей с реальными state transitions.

## 11. Validation / Error Handling

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
- Формат ошибок API не менялся; добавлен ещё один сценарий `domain_rule_violation`.

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

## 13. Known Issues

### Issue 0: Отсутствует исходный эталонный текст ТЗ в сессии

- Severity: high
- Area: docs/product
- Description: пользователь запросил объединение с исходным ТЗ, но в сообщении передан placeholder без фактического текста.
- Evidence: `<<<ВСТАВИТЬ СЮДА СУЩЕСТВУЮЩЕЕ ТЗ ДЛЯ СДО ПРОФ>>>`.
- Suggested fix: предоставить полный исходный текст ТЗ для точной трассировки «взято/изменено/добавлено» без допущений.

### Issue 1: Неполное HTTP-level object access/validation покрытие для assessment ownership

- Severity: medium
- Area: backend/auth/tests
- Description: ownership/lifecycle/score validations защищены на service-level, но аналогичные проверки не полностью покрыты HTTP integration suite.
- Evidence: новые проверки добавлены в runtime и unit/regression tests; dedicated HTTP integration coverage для assessment ownership/lifecycle/score частично отсутствует.
- Suggested fix: добавить HTTP integration кейсы на доступ к чужим attempt/submission/review данным.

### Issue 2: Длительные backend integration тесты при ограниченных ресурсах CI

- Severity: low
- Area: backend/tests
- Description: даже после фикса таймаутов backend contract/integration тесты остаются относительно тяжёлыми и чувствительными к деградации среды.
- Evidence: длительность backend тестов ~25s+ с множеством поднятий Nest app.
- Suggested fix: по мере возможности уменьшать дублирование bootstrap логики и частично переводить suite на более лёгкие тестовые harness.

### Issue 3: Предупреждение о deprecated Vitest workspace config

- Severity: low
- Area: tests/docs
- Description: при запуске тестов выводится deprecation warning.
- Evidence: `The workspace file is deprecated... use test.projects`.
- Suggested fix: мигрировать конфиг Vitest на `test.projects` в root config.

## 14. Recommended Next Steps

### Critical

1. Сохранять `pnpm -s ci:check` обязательным финальным шагом каждой инженерной итерации.
2. Любые новые auth/security регрессии чинить до feature-работ.
3. Получить и приложить исходный полный текст ТЗ СДО Проф для финальной валидации `SDOPROF_TZ_FINAL.md`.

### High

1. Добавить object-level/IDOR HTTP integration tests для `mvp` (attempts/submissions/reviews + расширить progress/assignment/attempt/review linkage, lifecycle и score validation checks до HTTP-level).
2. Проверить согласованность backend authz и frontend role-based скрытия действий в ключевых LMS экранах.

### Medium

1. Добавить минимальный manual smoke checklist по основным LMS маршрутам (learner/teacher/admin).
2. Синхронизировать README/документацию с новым integration coverage.

### Low

1. Убрать deprecation warning в Vitest конфигурации.
2. Оптимизировать backend test bootstrap для снижения времени прогонов.

## 15. Suggested Next Agent Prompt

«Сверь `SDOPROF_TZ_FINAL.md` с фактическим исходным ТЗ СДО Проф (после предоставления полного текста), подготовь матрицу трассировки требований (исходное → финальное), затем закрой оставшиеся backend HTTP integration gaps по ownership/lifecycle/score validation (`attempts`, `assignment-submissions`, `assignment-reviews`) и прогони `pnpm --filter @cdoprof/backend test` + `pnpm -s ci:check`.»

## 16. Important Context / Assumptions

- Проект стабильно собирается и тестируется в текущем локальном окружении (`pnpm` monorepo).
- Ролевая модель и permission naming не менялись.
- Изменения затронули test-конфигурацию и одну runtime domain-проверку в `mvp` progress flow.
- Для ветки подготовки ТЗ использован контекст репозитория (`README.md`, `LMS_AGENT_HANDOFF.md`, структура модулей), так как исходное ТЗ в сессии не предоставлено.
- `ci:check` используется как основной индикатор готовности итерации.

## 17. Environment Variables

| Variable                   | Required                | Purpose                      | Notes              |
| -------------------------- | ----------------------- | ---------------------------- | ------------------ |
| `DATABASE_URL`             | yes (backend runtime)   | PostgreSQL connection        | value not included |
| `DB_MIGRATIONS_ENABLED`    | optional                | Enable migrations on startup | boolean-like       |
| `NEXT_PUBLIC_API_BASE_URL` | yes (frontend)          | Backend API URL              | public env         |
| `NEXT_PUBLIC_REALTIME_URL` | yes (frontend realtime) | Realtime endpoint URL        | public env         |
| `PUBLIC_BASE_URL`          | optional/tests          | Base URL in tests/helpers    | no secrets         |

## 18. How To Run Locally

1. `pnpm install`
2. Создать `.env` из `.env.example` (и app-specific env templates при необходимости)
3. (Опционально) поднять инфраструктуру: `docker compose -f infra/docker-compose.yml up -d`
4. Запустить dev: `pnpm dev` или `pnpm dev:web`
5. Проверить качество: `pnpm -s lint && pnpm -s typecheck && pnpm -s build && pnpm -s ci:check`

## 19. How To Continue Development

- Начать с `README.md` и этого `LMS_AGENT_HANDOFF.md`.
- Backend приоритет: `apps/backend/src/modules/iam`, `apps/backend/src/modules/mvp`.
- Frontend приоритет: `apps/frontend/app/learner/*`, `apps/frontend/app/courses*`, `apps/frontend/src/features/auth`.
- После каждого изменения запускать минимум `lint + typecheck`, перед завершением — `ci:check`.
- Избегать разрушительных DB/API/auth изменений без миграций, тестов и документации.

## 20. Final Status

- Build status: passed (финальный `pnpm -s ci:check`)
- Test status: passed (включая новые domain regressions в `mvp.service` для progress, assignment submissions, attempts, reviews, review lifecycle lock и score validation)
- Main LMS flows status: стабильный baseline по текущим automated quality gates
- Production readiness: staging-ready baseline; progress/assignment submission/attempt/review flows стали строже по доменной целостности, lifecycle-ограничениям и корректности score
- Next best action: (1) подтвердить `SDOPROF_TZ_FINAL.md` на основе исходного полного ТЗ; (2) расширить object-level HTTP integration coverage на assessment/enrollment ownership сценарии
