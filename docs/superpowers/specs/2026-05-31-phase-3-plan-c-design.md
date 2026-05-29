# Phase 3 Plan C — Manual review + practical submissions: дизайн

| Поле            | Значение                                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------------------------- |
| Дата создания   | 2026-05-31                                                                                                    |
| Автор           | Brainstorming session (владелец учебного центра + Claude)                                                     |
| Статус          | Утверждён владельцем (design approved 2026-05-31)                                                             |
| Релиз           | V1 (пилотный)                                                                                                 |
| Зонтичная спека | [2026-05-30-phase-3-assessment-design.md](2026-05-30-phase-3-assessment-design.md) §5 «Plan C scope (sketch)» |
| Следующий шаг   | План реализации Plan C (`superpowers:writing-plans`)                                                          |

> **Назначение.** Уточнить набросок §5 зонтичной Phase 3 спеки до утверждённого дизайна перед написанием TDD-плана. Документ фиксирует (1) реальное состояние кода (что **уже есть** vs что **строим**), (2) утверждённое решение по загрузке файлов, (3) ручную проверку эссе в попытках, (4) цикл возврата на доработку. Не дублирует зонтичную спеку — опирается на §5 и расширяет её.

---

## 1. Реальность кода: что уже есть vs что строим

Plan C — **не greenfield**. Цикл проверки практических заданий на бэкенде уже построен и закалён (Pillar A hardening, §5.15-5.18 в [LMS_AGENT_HANDOFF.md](../../../LMS_AGENT_HANDOFF.md)). Это сильно сужает backend-объём Plan C — основная масса работы во фронтенде.

### 1.1 Уже есть (переиспользуем как есть)

| Возможность                                                                    | Реализация ([mvp.service.ts](../../../apps/backend/src/modules/mvp/mvp.service.ts) / [mvp.controller.ts](../../../apps/backend/src/modules/mvp/mvp.controller.ts)) | Permission                        |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| Создать сдачу (draft, принимает `answerText`+`fileId`)                         | `createAssignmentSubmission` / `POST /assignment-submissions`                                                                                                      | `assessment.submissions.submit`   |
| Редактировать draft (блок после submit)                                        | `updateAssignmentSubmission` / `PATCH /assignment-submissions/:id`                                                                                                 | `assessment.submissions.submit`   |
| Отправить (`draft → submitted`, идемпотентно, audit)                           | `submitAssignmentSubmission` / `POST /assignment-submissions/:id/submit`                                                                                           | `assessment.submissions.submit`   |
| Список/деталь сдач (cross-learner read gating)                                 | `listAssignmentSubmissions` / `getAssignmentSubmission`                                                                                                            | `assessment.submissions.submit`\* |
| Взять в проверку (`submitted → under_review`, lock one-review)                 | `createAssignmentReview` / `POST /assignment-reviews`                                                                                                              | `assessment.reviews.review`       |
| Править оценку/комментарий до завершения                                       | `updateAssignmentReview` / `PATCH /assignment-reviews/:id`                                                                                                         | `assessment.reviews.review`       |
| Завершить (`in_review → completed`, submission → `reviewed`, lock re-complete) | `completeAssignmentReview` / `POST /assignment-reviews/:id/complete`                                                                                               | `assessment.reviews.review`       |
| Очередь ревьюера (read-only aggregator)                                        | `aggregateReviewerQueue` ([reviewer-queue.service.ts](../../../apps/backend/src/modules/mvp/reviewer-queue.service.ts)) / `GET /reviewer/queue`                    | `assessment.reviews.review`       |
| Попытки + автогрейд (single/multi/number/text; essay abstains)                 | Plan B `submitAttempt` + `assessment-autograde.service.ts`                                                                                                         | `assessment.attempts.*`           |

\* Чтение сдач staff'ом проходит через `assessment.read.cross_learner` (Pillar A) — учтено в `restrictLearnerIdsForAssessmentList` / `assertAssessmentReadAllowedForLearner`.

### 1.2 Строим в Plan C

| Gap                                                                  | Слой                 | Раздел этого дизайна |
| -------------------------------------------------------------------- | -------------------- | -------------------- |
| Загрузка файла учеником (нет binary-пути; `fileId` — латентное поле) | Backend + infra + FE | §2                   |
| Ручная проверка эссе в попытках (`completeAttemptReview`)            | Backend + FE         | §3                   |
| Возврат сдачи на доработку (`under_review → returned`)               | Backend + FE         | §4                   |
| Learner UI сдачи практических заданий (текст + файл)                 | Frontend             | §5                   |
| Reviewer UI с активными действиями (вместо skeleton'а Plan A)        | Frontend             | §5                   |

---

## 2. Загрузка файлов — presigned direct-to-MinIO (утверждено)

### 2.1 Состояние инфраструктуры

- `@aws-sdk/client-s3` **и** `@aws-sdk/s3-request-presigner` уже в зависимостях бэкенда → presigned URL **без новых пакетов**.
- [S3StorageClient](../../../apps/backend/src/infrastructure/storage/s3-storage.client.ts) сейчас реализует только `ping()`. Добавляем put/get через presigner.
- [FilesService.register()](../../../apps/backend/src/modules/files/files.service.ts) пишет метаданные в `storage.files` (`antivirus_status='pending'`), но не кладёт объект. `storage.file_links` уже есть.
- Env: `S3_ENDPOINT`, `S3_BUCKET=cdoprof-dev`, `S3_ACCESS_KEY/SECRET`, path-style.

### 2.2 Поток (presigned PUT)

1. **Intent:** `POST /assignment-submissions/:id/upload-url` (learner, `assessment.submissions.submit`) — валидирует владение сдачей (actor↔learner IAM link) + статус сдачи editable (`draft`/`returned`) + объявленные `contentType` (MIME allowlist) и `sizeBytes` (cap). Генерирует `storageKey`, регистрирует `storage.files` (AV `pending`), возвращает `{ fileId, uploadUrl, expiresInSeconds }`.
2. **Upload:** браузер делает `PUT` напрямую в MinIO по `uploadUrl` (Content-Type зафиксирован в подписи).
3. **Attach:** браузер вызывает `PATCH /assignment-submissions/:id` с `{ fileId }` (уже поддержано `updateAssignmentSubmission`).
4. **Download:** `GET /assignment-submissions/:id/file-url` (read-scoped как `getAssignmentSubmission`: владелец-ученик ИЛИ staff с cross-learner read) → presigned **GET** URL.

### 2.3 Решения и границы

- **Почему presigned, не backend-proxy:** ноль новых зависимостей (presigner уже есть), бэкенд не стримит крупные бинарники через Node, стандартный S3-паттерн. Альтернатива (multipart-proxy через Multer) отклонена для пилота — новые пакеты + тюнинг body-limit.
- **MIME allowlist:** `application/pdf`, `image/png`, `image/jpeg`, `application/msword`, `application/vnd.openxmlformats-officedocument.*`. **Size cap:** константа (по умолчанию 10 MB) — выносится в env.
- **⚠️ Антивирус не подключён в V1.** Файлы остаются `antivirus_status='pending'`; скачивание разрешено. Митигация: MIME allowlist + size cap. **AV-скан как gate перед download — V1.1** (см. §7).
- **Операционка:** MinIO нужен CORS-rule, разрешающий `PUT` с origin фронтенда — отдельная setup-задача в плане (документируется, не блокирует in-memory тесты).
- **Тестируемость:** presigner оборачивается в узкий интерфейс `StorageClient.createPresignedUpload/Download`; в unit-тестах мокается (детерминированный fake URL), без реального сетевого I/O.

---

## 3. Ручная проверка эссе в попытках — `completeAttemptReview`

Plan B автогрейдер **воздерживается** на `essay` (`{ score: 0, autoGraded: false }`) — это «pending attempts» сторона очереди ревьюера.

- **Метод:** `completeAttemptReview(tenantId, actorId, attemptId, { answerScores: { questionId, score }[], reviewComment? }, ctx)`.
- **Guards:** `attempt.status === 'submitted'`; каждый `score` ∈ `[0, question.score]`; `questionId` принадлежит попытке и его ответ `autoGraded === false` (нельзя переопределять авто-оценённые в V1).
- **Эффект:** проставляет `answer.score` для эссе-ответов; пересчитывает `attempt.score = Σ answer.score`; пересчитывает `attempt.passed` против `test.rules.passingScore`; обновляет/создаёт `ExamResult` (best attempt); переводит `attempt.status` из `submitted` в терминальный проверенный статус (точное значение сверяется с `TestAttempt` status enum при планировании); пишет audit `assessment.attempt_review_completed`.
- **Endpoint:** `POST /attempts/:id/complete-review` (`assessment.reviews.review`).
- **Очередь:** после завершения попытка уходит из `pendingAttempts` (фильтр `status==='submitted'`).

---

## 4. Возврат на доработку — `returnAssignmentSubmission`

- **Метод:** `returnAssignmentSubmission(tenantId, actorId, submissionId, { comment }, ctx)`.
- **Guards:** сдача в `under_review` (есть активное `in_review` ревью).
- **Эффект:** `submission.status → 'returned'`; фидбэк сохраняется (в `review.comment`); активное ревью сбрасывается так, чтобы после повторной отправки можно было создать новое ревью (точная механика reset — в плане; статус-enum `returned` уже есть). Audit `assessment.assignment_submission_returned`.
- **Endpoint:** `POST /assignment-submissions/:id/return` (`assessment.reviews.review`).
- **Цикл:** ученик правит `returned`-сдачу (`updateAssignmentSubmission` уже разрешает: блок только для `submitted/under_review/reviewed/rejected`) → `submitAssignmentSubmission` (`returned → submitted`) → новый проход ревью.

---

## 5. Frontend (основная масса работы)

**Learner — `apps/frontend/src/features/practical-submissions/`** (`types/api/hooks/format` + screens):

- Список доступных заданий ученика (из enrollments → group courses → assignments) со статусом сдачи.
- Экран сдачи: текстовый ответ + загрузка файла (presigned поток §2.2) + submit; для `returned` — показ фидбэка ревьюера + повторная отправка.
- Просмотр результата (оценка/комментарий/статус).
- Route: `app/learner/assignments/page.tsx`, `app/learner/assignments/[id]/submit/page.tsx`.

**Reviewer — `apps/frontend/src/features/reviewer-actions/`** (расширяет Plan A `reviewer-queue-screen`):

- Активная очередь: pending attempts (эссе-проверка) + pending submissions.
- Действия по сдаче: взять в проверку → оценка/комментарий → завершить **или** вернуть.
- Действия по попытке: проставить баллы за эссе-вопросы → завершить проверку.
- Route: апгрейд `app/teacher/review/page.tsx` (из skeleton'а в активный).

**Navigation + permissions:**

- Запись в [navigation/model.ts](../../../apps/frontend/src/features/navigation/model.ts): «Мои задания» (learner) под `assessment.assignments.read`.
- [permission-map.ts](../../../apps/frontend/src/lib/auth/permission-map.ts): у learner уже есть `assessment.submissions.submit` + `assessment.assignments.read` (Plan B sync) — сверить.

---

## 6. Testing strategy

**Backend:**

- `*.service.test.ts` — `completeAttemptReview` (пересчёт score/passed/ExamResult, guard'ы, анти-IDOR), `returnAssignmentSubmission` (цикл return→edit→resubmit), presigned intent (мок `StorageClient`, MIME/size валидация, anti-IDOR владения сдачей).
- `*.dto-validation.test.ts` — новые DTO (`upload-url`, `complete-attempt-review`, `return-submission`).
- `test-player`-style HTTP integration (стаб-контроллер, **не** трогать 2400-строчный `mvp.domains.http.integration.test.ts`) — permission boundary каждого нового endpoint (`auth_required` / `permission_denied` / success envelope).

**Frontend:**

- `practical-submissions/api.contract.test.ts` + `reviewer-actions/api.contract.test.ts` — envelope unwrap + URL/method/body.
- `format.test.ts` — статус-лейблы, форматтеры.
- `e2e/phase-3-plan-c-review.e2e.test.ts` — routing + nav + dynamic-import smoke (зеркало `learner-test-player.e2e.test.ts`).

**Регресс:** §39 canonical (`business-flows.e2e.test.ts`, `lms-role-flows.e2e.test.ts`) — без регрессий. Quality gate: `pnpm -s ci:check` (Cyrillic fallback на isolated backend runs — CLAUDE.md Gotchas).

---

## 7. Cadence + V1.1 deferrals

**Cadence** — стэкнутые PR (как Plan A/B):

1. **Doc-only:** этот дизайн + Plan C TDD-план (ветка `feat/2026-05-31-phase-3-plan-c-manual-review`).
2. **Backend:** миграция 0042 (additive parity: review-поля попытки + при необходимости return-comment) + storage presigned + `completeAttemptReview` + `returnAssignmentSubmission` + DTO + endpoints + tests.
3. **Frontend:** обе feature-папки + screens + routes + nav + e2e.
4. **Closeout:** closeout E2E + `LMS_AGENT_HANDOFF.md` §5.95 + README §2 sync.

**Отложено в V1.1:**

- **Антивирус-скан** загруженных файлов как gate перед download (сейчас `pending`, скан не подключён).
- Partial credit для multi-choice.
- Файлы как ответ на эссе-вопросы попытки (Plan C — только assignment-файлы).
- Расширенный reject-workflow сверх return-on-revision.
- Относительный `numericTolerance`.

---

## 8. Acceptance gates (Plan C)

- [ ] Round-trip практической работы: learner создаёт сдачу (текст + файл) → submit → reviewer берёт в проверку → оценка+комментарий → complete (submission `reviewed`); отдельный путь: reviewer → return → learner правит → resubmit → новый review.
- [ ] Round-trip ручной проверки эссе: published test с эссе-вопросом → learner submit (essay = provisional 0) → reviewer `complete-review` с баллом → `attempt.score`/`passed`/`ExamResult` пересчитаны; попытка уходит из очереди.
- [ ] Presigned upload: intent валидирует MIME/size/владение; download scoped к read-доступу сдачи; `StorageClient` мокается в тестах.
- [ ] Все новые endpoints под корректными permissions (`submissions.submit` / `reviews.review`); анти-IDOR по tenant + learner link.
- [ ] `/teacher/review` показывает активные действия; learner видит «Мои задания».
- [ ] `pnpm -s ci:check` зелёный; §39 canonical без регрессий.
- [ ] `LMS_AGENT_HANDOFF.md` §5.95 + README §2 обновлены.

---

## 9. Открытые вопросы

Блокирующих нет. Уточняется при планировании (чтение кода):

- Точное терминальное значение `TestAttempt.status` после `completeAttemptReview` (`reviewed` vs существующий graded-статус).
- Механика reset активного ревью при `return` (delete vs reopen), чтобы повторная отправка допускала новое ревью без нарушения one-review-lock.
- Нужна ли денормализация `fileName`/`fileSize` на сдаче для UI, или достаточно `storage.files` lookup.
