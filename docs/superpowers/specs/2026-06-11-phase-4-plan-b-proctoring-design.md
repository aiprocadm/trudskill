# Phase 4 Plan B — Прокторинг: запись видео итогового теста (design)

**Дата:** 2026-06-11
**Статус:** утверждён (автономная сессия; владелец делегирует дефолты — см. §10 единственный owner-confirmable пункт)
**Источники:** roadmap [2026-05-21-cdoprof-v1-roadmap.md](../plans/2026-05-21-cdoprof-v1-roadmap.md) Phase 4 (строки 187–211, открытый вопрос №6 строка 491); Plan A spec [2026-06-10-phase-4-plan-a-identity-verification-design.md](2026-06-10-phase-4-plan-a-identity-verification-design.md) §9 (явный дефер прокторинга в Plan B).

## 1. Goal

Итоговый тест (финальный экзамен) опционально записывается на видео с веб-камеры ученика. Запись хранится в S3/MinIO, автоудаляется по сроку, доступна админу для просмотра. Включается per-program (group-course) и per-student (enrollment override).

Требования roadmap Phase 4, закрываемые этим планом:

| №   | Требование                                     | Решение                                                                                             |
| --- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1   | Запись видео во время итогового теста          | MediaRecorder (webcam video+audio) на клиенте                                                       |
| 2   | UI согласия на видеозапись (152-ФЗ)            | consent-чекбокс на интерстициале перед стартом, `consentAt` в БД, аудит                             |
| 3   | Запись на стороне клиента + загрузка на сервер | чанки webm по 30 с → presigned PUT (files-слой)                                                     |
| 4   | Хранение в S3 + метаданные в БД                | files-слой Plan A + MVP-коллекция `proctoringRecordings` + таблица `learning.proctoring_recordings` |
| 5   | Cron-задача автоудаления по сроку              | dormant retention-cron, зеркало identity-retention                                                  |
| 6   | UI просмотра записи в админке                  | `/admin/proctoring-recordings` (+detail с плеером)                                                  |
| 7   | Per-student переключатель в админке            | `GroupCourse.requiresProctoring` + `Enrollment.proctoringOverride`                                  |

## 2. Locked decisions

1. **Технология записи = браузерный `MediaRecorder`** (webcam, video+audio, `video/webm;codecs=vp8,opus` с фолбэком на дефолт браузера). Никакого медиасервера: запись «на полку», live-наблюдение оператором не требуется (отложено вместе с видео-идентификацией). Чанки одной сессии MediaRecorder валидно конкатенируются (заголовок контейнера в первом чанке).
2. **Чанк-аплоад, 30-секундный timeslice.** Каждый чанк ≤ 10 MB (существующий `SUBMISSION_MAX_BYTES`; 30 с при типичных битрейтах ≈ 1–4 MB). Загрузка последовательной очередью через `createUploadIntent(keyPrefix: 'proctoring', mimeAllowlist: {video/webm, video/mp4})` → PUT на presigned URL. `video/mp4` в allowlist — фолбэк Safari.
3. **Сбой аплоада не прерывает экзамен** (partial-success): фронт ретраит чанк один раз, при повторном сбое пропускает и продолжает; админ в detail видит разрывы нумерации. Попытка теста никогда не инвалидируется из-за проблем записи.
4. **Гейт = 5-й assert в `startAttempt`**: `assertProctoringGate` после `assertIdentityVerificationGate` → `PreconditionFailedException { code: 'proctoring_required', message: 'Video recording must be active before starting this exam' }` (412). Сообщение намеренно не пересекается с регексами Wave 1 pre-exam-auth и identity-интерстициала.
5. **Порядок старта**: сессия записи создаётся ДО попытки (`POST /proctoring-recordings`, требует `consent: true`, проверяет что прокторинг действительно требуется для этого learner+group+course); гейт пропускает при наличии активной записи (`status: 'recording'`) этого ученика для этого group+course; `startAttempt` линкует `recording.attemptId = attempt.id`.
6. **Эффективное требование прокторинга** = `enrollment.proctoringOverride ?? ('require'|'exempt' из groupCourse.requiresProctoring)`. Override выставляет админ (`learners.write`).
7. **Завершение**: фронт по завершению попытки останавливает рекордер, грузит хвостовой чанк, вызывает `POST /:id/complete` → `status: 'completed'`, `completedAt`. Брошенные сессии (краш браузера) остаются `'recording'` — retention-cron считает срок от `completedAt ?? startedAt`, отдельного «reaper» нет (YAGNI).
8. **Resume после refresh**: `GET /proctoring-recordings/active?groupId&courseId` возвращает активную сессию + максимальный загруженный `sequence`; фронт продолжает с `max+1` (старый MediaRecorder умер — новый сегмент начинается с нового заголовка webm; плеер склеивает по порядку, разрыв допустим и виден админу).
9. **Retention = 365 дней** после `completedAt ?? startedAt` (дефолт roadmap «1 год»; ⚠️ единственный owner-confirmable пункт, §10). Dormant: `PROCTORING_VIDEO_RETENTION_ENABLED=false`, `PROCTORING_RETENTION_CRON_SCHEDULE='0 5 * * *'` (UTC), advisory-lock **528_493**, cross-tenant через **write-режим** `MvpTenantRunner.runWithTenantStateAndSave` (урок CRITICAL Plan A — read-only теряет штампы). Удаляются файлы-чанки (`filesService.deleteFile`), штампуется `purgedAt`; сама запись-метаданные (кто, когда, согласие, attemptId) живёт бессрочно.
10. **Просмотр админом**: detail-эндпоинт отдаёт упорядоченный список presigned GET URL чистых чанков; плеер на клиенте скачивает их, склеивает в Blob → `URL.createObjectURL` → `<video>`. Заражённые (AV `infected`) чанки исключаются с предупреждением (graceful degradation, зеркало Plan A `selfieFileError`); `pending`/`error` при выключенном AV следуют семантике files-слоя.
11. **Права**: `proctoring.submit` (learner — своя сессия), `proctoring.read` (admin/methodist — очередь, detail, playback). Review-решений нет — запись является доказательством, а не объектом approve/reject.
12. **Миграция 0051**: `learning.proctoring_recordings` + `learning.group_courses.requires_proctoring` + `learning.enrollments.proctoring_override` + права и role-grants (учитель/методист → read; learner → submit; admin → оба). Зеркало 0050.

## 3. Data model

```ts
type ProctoringRecordingStatus = 'recording' | 'completed';

interface ProctoringChunk {
  sequence: number; // 0-based, монотонно от клиента
  fileId: string; // files-слой (storage.files)
  uploadedIntentAt: string;
}

interface ProctoringRecording extends BaseEntity {
  learnerId: string;
  groupId: string;
  courseId: string;
  attemptId?: string; // линкуется в startAttempt
  consentAt: string; // 152-ФЗ
  startedAt: string;
  completedAt?: string;
  chunks: ProctoringChunk[];
  purgedAt?: string; // штамп retention-cron
}
```

MVP-коллекция `proctoringRecordings` — **обязательно регистрируется в `mvp-collections.ts`** (иначе теряется между запросами). Postgres-зеркало в `learning.proctoring_recordings` по образцу `identity_verifications` (adapter + backend).

`GroupCourse.requiresProctoring?: boolean` (дефолт false) — writable через те же Create/Update GroupCourse DTO, что и `requiresIdentityVerification`.
`Enrollment.proctoringOverride?: 'require' | 'exempt'` — null = наследование от group-course.

## 4. API (7 эндпоинтов, MvpController)

| Метод/путь                                            | Права               | Назначение                                                                                                                                                                                              |
| ----------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------- |
| `POST /proctoring-recordings`                         | `proctoring.submit` | старт сессии: `{ groupId, courseId, consent: true }` → запись `recording`; 400 если прокторинг не требуется или consent ≠ true; 409 если активная сессия уже есть (возврат её id — идемпотентный reuse) |
| `POST /proctoring-recordings/:id/chunk-upload-intent` | `proctoring.submit` | `{ sequence, fileName, mimeType, sizeBytes }` → presigned PUT + регистрация чанка; только своя сессия, только `recording`                                                                               |
| `POST /proctoring-recordings/:id/complete`            | `proctoring.submit` | стоп: `completedAt`, идемпотентно                                                                                                                                                                       |
| `GET /proctoring-recordings/active?groupId&courseId`  | `proctoring.submit` | активная сессия текущего ученика + `nextSequence` (resume)                                                                                                                                              |
| `GET /proctoring-recordings`                          | `proctoring.read`   | админ-список с обогащением (learnerName, courseTitle, attempt status), фильтр `?status=`                                                                                                                |
| `GET /proctoring-recordings/:id`                      | `proctoring.read`   | detail + playback: упорядоченные presigned GET чистых чанков + `chunkIssues[]` (infected/gaps)                                                                                                          |
| `PATCH /enrollments/:id/proctoring-override`          | `learners.write`    | `{ override: 'require'                                                                                                                                                                                  | 'exempt' | null }` — per-student переключатель |

Аудит — только значимые мутации: `learning.proctoring_started`, `.proctoring_completed`, `.proctoring_override_set`, `.proctoring_video_purged` (per-chunk событий нет — см. §8).

## 5. Frontend

- **Feature-модуль** `src/features/proctoring/`: `types.ts`, `api.ts`, `hooks.ts`, `recorder.ts`, `screens.tsx`, `format.ts` + тесты (`api.contract.test.ts`, `recorder.test.ts`, `format.test.ts`).
- **`recorder.ts` — чистая state-machine** (idle → acquiring → recording → uploading-tail → completed | error) поверх инжектируемых `getUserMedia`/`MediaRecorder`/upload-функций — юнит-тестируется без браузера (конвенция: no React render tests).
- **Интерстициал в test-player** (`tests-list-screen.tsx`): регекс `/proctoring_required/` на ошибке старта → экран согласия: предпросмотр камеры, 152-ФЗ чекбокс, кнопка «Начать запись и экзамен» → старт сессии → MediaRecorder → повторный старт попытки. Индикатор записи (`● REC`) на время теста; стоп + complete после сабмита попытки.
- **Админ**: `/admin/proctoring-recordings` (список, `proctoring.read`) + `/admin/proctoring-recordings/[id]` (detail: метаданные, согласие, попытка, плеер со склейкой Blob, предупреждения о разрывах/инфицированных чанках). Навигация — data-driven `navigation/model.ts` + `ProtectedPage`.
- **Существующая страница `/proctoring`** (стаб integrations-sync внешнего провайдера) — не трогаем; наши маршруты под `/admin/proctoring-recordings`.

## 6. Testing

Конвенционное трио + специфика:

- `proctoring.service.test.ts` (backend unit): lifecycle, эффективное требование (override-матрица), гейт (412 + не-пересечение сообщений), идемпотентный reuse активной сессии, линковка attemptId, complete.
- `mvp.dto-validation.test.ts` (+): новые DTO.
- `mvp.http.integration.test.ts` (+): permission boundary 7 эндпоинтов (stub-controller паттерн).
- `proctoring-retention.test.ts` + scanner/scheduler тесты — зеркало identity-retention (selection-функция чистая, write-режим runner, advisory lock).
- Frontend: `recorder.test.ts` (state-machine с мок-MediaRecorder: чанк-очередь, ретрай, resume c nextSequence), `api.contract.test.ts`, `proctoring.e2e.test.ts` (routing/permissions/смоук), правка `tests-list-screen` тестов.
- Миграционный тест 0051 в существующем наборе `test:migrations`.

## 7. Error handling

- Камера недоступна/запрещена → ученик видит понятное сообщение; экзамен НЕ стартует, пока прокторинг требуется (это и есть смысл гейта). Админ может выставить `exempt` per-student.
- Сбой PUT чанка → 1 ретрай → пропуск (см. §2.3); сбой `complete` → ретрай при следующем рендере (идемпотентен).
- 423/AV на чанке при просмотре → чанк исключён из склейки, warning в detail.
- Retention: ошибка удаления одного файла не штампует `purgedAt` (ретрай следующим прогоном) — зеркало Plan A.

## 8. Из аудита исключены

per-chunk события (30-секундный экзаменный поток дал бы сотни записей на попытку) — только start/complete/override/purge.

## 9. Out of scope (explicit)

Live-наблюдение оператора в реальном времени; запись экрана (screen-share); автоматический face-match; синхронизация таймлайна видео с ответами; MSE/HLS-стриминг; внешние proctoring-провайдеры (адаптер `proctoring.adapter.ts` и страница `/proctoring` не трогаются); push-уведомления; ЕСИА.

## 10. Owner-confirmable (один пункт)

**Срок хранения видео = 365 дней** (дефолт roadmap; открытый вопрос №6). Изменяется константой `PROCTORING_VIDEO_RETENTION_DAYS` + env не требуется (cron всё равно dormant до явного `PROCTORING_VIDEO_RETENTION_ENABLED=true` — к этому моменту владелец подтвердит срок).
