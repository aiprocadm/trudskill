# Волна 1 — Учебно-экзаменационное соответствие (дизайн)

| Поле                | Значение                                                                                                                                                                |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Дата                | 2026-05-30                                                                                                                                                              |
| Статус              | Черновик на ревью владельца                                                                                                                                             |
| Родитель            | [Дорожная карта паритета](2026-05-30-legacy-parity-roadmap.md) → Волна 1                                                                                                |
| Источник требований | FAQ инкумбента §5 (модульность), §7 (время на изучение), §9 (аутентификация перед экзаменом, Приказ Минобрнауки №816)                                                   |
| ТЗ                  | §11/§13 (модули/контроль), §14 (экзамены/аттестация)                                                                                                                    |
| Затрагивает         | `apps/backend/src/modules/mvp/` (gate в `startAttempt`), `apps/backend/src/modules/iam/` (паттерн токена), `apps/frontend/src/features/course-viewer/` + `test-player/` |

---

## 1. Что делаем и зачем

Три функции, без которых дистанционное обучение не соответствует требованиям и теряет паритет со старой платформой:

- **(A) Модульность с последовательным прохождением** — следующий модуль (и итоговый экзамен) недоступны, пока не сдан промежуточный тест предыдущего модуля. Есть переключатель «модуль необязателен → свободный переход».
- **(B) Время на изучение материала** — пока не истёк счётчик минимального времени на материалах модуля, тренировка и экзамен закрыты; показываем обратный отсчёт.
- **(C) Аутентификация перед экзаменом (Приказ Минобрнауки №816)** — если группа требует, перед стартом экзамена слушатель подтверждает личность по ссылке из письма; факт фиксируется в попытке и карточке слушателя.

**Ключевая находка анализа кода:** все три — это, по сути, **гейты на входе в экзамен** (`MvpService.startAttempt`, `mvp.service.ts:2728`) плюс отражение в UI курса. Инфраструктура в основном есть → объём работы это «проводка + несколько полей модели», а не greenfield.

---

## 2. Текущее состояние (факты из кода)

| Что                                                                                                       | Состояние                                                     | Где                                                                          |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `CourseModuleEntity.minViewSeconds`, `isRequired`                                                         | есть                                                          | `mvp.types.ts:63-69`                                                         |
| `Material.minViewSeconds`, `isRequired`                                                                   | есть                                                          | `mvp.types.ts:71-79`                                                         |
| `TestEntity.courseId`, `rules{attemptLimit,dailyResetEnabled,passingScore,...}`                           | есть; **`moduleId` НЕТ**                                      | `mvp.types.ts:276-285`                                                       |
| `Assignment.moduleId?`                                                                                    | есть (паттерн для зеркалирования)                             | `mvp.types.ts:394`                                                           |
| `MaterialProgress / ModuleProgress / CourseProgress` (`studiedSeconds`, `requiredSeconds`, `status`)      | есть                                                          | `mvp.types.ts:171-208`                                                       |
| `ExamResult{testId,enrollmentId,learnerId,passed}`                                                        | есть                                                          | `mvp.types.ts:331-342`                                                       |
| `upsertMaterialProgress` → `recalculateModuleProgress` → `recalculateCourseProgress` (накопление времени) | есть, серверное                                               | `mvp.service.ts:1750/1870/1920`                                              |
| `startAttempt` (валидации: course-link, IDOR, attempt-limit)                                              | есть; **гейтов модуля/времени/аутентификации НЕТ**            | `mvp.service.ts:2728-2826`                                                   |
| `POST /attempts/start` (`assessment.attempts.take`)                                                       | есть                                                          | `mvp.controller.ts:872`                                                      |
| magic-link: `iam.magic_link_tokens` + `MagicLinkService` (randomBytes+SHA-256, single-use, TTL)           | есть, переиспользуемо                                         | `0028_*.sql`, `magic-link.service.ts:66-127`                                 |
| email-отправитель                                                                                         | **logging-заглушка** (реально не шлёт)                        | `magic-link-email-sender.ts:22-29`                                           |
| course-viewer: `computeUnlockedMaterials` (посл. гейт **материалов**), `useWatchTracker.onMinimumReached` | есть; гейта **модулей** и проводки `onMinimumReached` нет     | `lock-logic.ts:9`, `use-watch-tracker.ts:53`, `course-viewer-screen.tsx:105` |
| «Старт экзамена» в course-viewer                                                                          | **отсутствует** — экзамены идут отдельным потоком `/me/tests` | `test-player/`                                                               |
| Последняя миграция                                                                                        | `0042` → следующая `0043`                                     | `apps/backend/migrations/`                                                   |

---

## 3. Дизайн по функциям

### 3.A Модульность с гейтингом

**Модель.** Добавить `TestEntity.moduleId?: string` (тест может быть промежуточным тестом модуля; тест без `moduleId` — курсовой/итоговый). Зеркалит `Assignment.moduleId`. Миграция `0043`: `module_id text REFERENCES learning.course_modules(id)` в `assessment.tests` (nullable).

**Определение «модуль пройден»** (для слушателя, в рамках зачисления):

1. все **обязательные** материалы модуля набрали своё время (`MaterialProgress.status='completed'`), И
2. промежуточный тест модуля (если есть) сдан (`ExamResult.passed=true` по тесту с этим `moduleId`).

**Гейт в `startAttempt`** (вставка после IDOR-проверки, ~`mvp.service.ts:2758`):

- старт промежуточного теста модуля → требуется, чтобы **предыдущий обязательный модуль** (по `sortOrder`) был пройден;
- старт курсового/итогового экзамена (`moduleId` отсутствует) → требуются **все обязательные модули** пройдены;
- модуль с `isRequired=false` → в гейтинге не участвует (свободный переход, FAQ §5);
- иначе `throw new PreconditionFailedException({ code: 'module_gate_locked', message: '...', meta:{ blockingModuleId } })`.

**Методист-исключение** (FAQ §5): гейтинг — только в кабинете слушателя; в режиме просмотра методиста доступны все модули. Реализация: гейт срабатывает только в контексте прогресса слушателя (по `enrollmentId`/роли), не в admin-preview.

**Frontend (course-viewer):**

- `lock-logic.ts:computeUnlockedMaterials` — расширить: принимать `Map<moduleId, 'passed'|'not_passed'>` и блокировать целые модули, а не только материалы.
- `table-of-contents.tsx` — индикатор замка на секции модуля; промежуточный тест показать узлом в конце модуля со state lock/«сдать, чтобы открыть следующий».
- `course-viewer-screen.tsx` — пробросить module-lock в TOC.

### 3.B Время на изучение материала

**Инфраструктура уже есть** (`minViewSeconds`, `studiedSeconds`, накопление, `onMinimumReached`). Не хватает: серверного гейта и UI-отсчёта.

**Гейт в `startAttempt`** (вместе с 3.A):

- если тест модульный — проверить `ModuleProgress.studiedSeconds >= module.minViewSeconds`;
- если курсовой — проверить сумму по обязательным модулям;
- `minViewSeconds=0` → контроль не ведётся (FAQ §7: «для модулей, где время не указано, контроль не производится»);
- иначе `throw new PreconditionFailedException({ code:'min_view_not_met', meta:{ remainingSeconds } })`.
- Без новых таблиц.

**Frontend:**

- `course-viewer-screen.tsx:105` — связать `useWatchTracker.onMinimumReached` со state `minimumMet`.
- Показать обратный отсчёт `minViewSeconds − studiedSeconds` на плеере материала.
- Закрыть кнопку старта экзамена, пока `minimumMet=false`, с пояснением.

### 3.C Аутентификация перед экзаменом (№816)

**Модель:**

- `GroupCourse.requiresPreExamAuth?: boolean` (+ tenant-настройка «включать по умолчанию новым группам», зеркалит логику инкумбента). Миграция `0044`: `requires_pre_exam_auth boolean NOT NULL DEFAULT false` в `learning.group_courses`.
- Таблица `assessment.pre_exam_tokens` — зеркало `iam.magic_link_tokens` + контекст `enrollment_id`, `test_id`. Миграция `0044`.
- `TestAttempt.identityVerifiedAt?`, `identityVerificationTokenId?` — фиксация факта (видно в карточке слушателя и отчёте, FAQ Рис.27/28). Миграция `0044`.
- Новая in-memory коллекция `preExamTokens` — зарегистрировать в `mvp-collections.ts` **и** `in-memory-mvp.state.ts` (обязательно вместе, иначе теряется между запросами — CLAUDE.md).

**Backend:**

- `PreExamAuthService` — копия паттерна `MagicLinkService` (randomBytes+SHA-256, single-use, TTL).
- `POST /attempts/request-pre-exam-token` (`assessment.attempts.take`): если группа требует и нет действующей верификации по `(learner, test)` — выпустить токен, отправить письмо со ссылкой `/exam-auth/:token`; вернуть «письмо отправлено».
- `POST /attempts/verify-pre-exam-token`: пометить токен consumed, записать верификацию по `(learner, test)`.
- `startAttempt`: если группа требует и нет верификации по `(learner, test)` → `throw PreconditionFailedException({ code:'pre_exam_auth_required' })`. После верификации повторные попытки **того же** экзамена идут без переспроса (FAQ §9: «следующая попытка… запускается уже как обычно»); другой итоговый экзамен — новая верификация.

**Зависимость email.** Отправитель сейчас — заглушка-логгер. Дизайним C через порт `EmailSender`: в dev/пилоте ссылка логируется/выводится в UI; **продакшн требует реального email-адаптера** (общая известная нехватка, не уникальна для этой фичи — фиксируем как precondition).

**Frontend (test-player):**

- `useStartAttempt` — если `requiresPreExamAuth` и нет верификации: интерстишал «Подтвердите личность — отправить ссылку на e-mail»; после клика по ссылке (verify) разрешить старт.
- Маркер «идентификация пройдена» в карточке слушателя / результате попытки.

---

## 4. Сквозное

- **Права:** переиспользуем `assessment.attempts.take`, `assessment.tests.read`, `progress.recalculate`, `groups.write` (флаг группы). Для проставления `test.moduleId` — `assessment.tests.write`. Новые права, скорее всего, не нужны.
- **Миграции:** `0043` (`tests.module_id`); `0044` (`group_courses.requires_pre_exam_auth` + `assessment.pre_exam_tokens` + `test_attempts.identity_*`). Историю миграций не трогаем (CLAUDE.md).
- **DTO:** `StartAttemptRequest` (`mvp.dto.ts:614`) — добавить `@IsOptional() @IsString() preExamToken?` (или вести верификацию серверным state — предпочтительно state, тогда токен в payload не нужен). `CreateTestRequest` — `moduleId?`.
- **Тесты (трио + e2e):** сервис — зеркало `test-player.service.test.ts`; DTO — `mvp.dto-validation.test.ts`; HTTP — `assessment-admin.http.integration.test.ts`; журней — расширить `business-flows.e2e.test.ts` (гейтированный путь).
- **Состояние:** новые коллекции регистрировать в `mvp-collections.ts` + `in-memory-mvp.state.ts`.

---

## 5. Разбиение на планы (для writing-plans)

- **✅ План 1 — «Модульный гейтинг + время на изучение» (A+B).** РЕАЛИЗОВАН (2026-05-31, ветка `feat/2026-05-31-wave1-module-gating`, merged PR #218). План: `docs/superpowers/plans/2026-05-31-wave1-plan1-module-gating-time-on-material.md`. Handoff §5.97.
- **✅ План 2 — «Аутентификация перед экзаменом №816» (C).** РЕАЛИЗОВАН (2026-05-31, ветка `feat/2026-05-31-wave1-pre-exam-auth`). Коллекция `preExamTokens` (consumed-токен = запись верификации), чистый крипто-хелпер `pre-exam-token.ts` (зеркало magic-link), гейт `assertPreExamAuthGate` в `startAttempt` (**только итоговый экзамен — `test.moduleId == null`**), 2 endpoint'а (`assessment.attempts.take`), интерстишал + страница `/exam-auth/[token]` + маркер в результате. Email = logging-заглушка (поле `Logger`, без изменения 6-арг конструктора). План: `docs/superpowers/plans/2026-05-31-wave1-pre-exam-auth.md`. Handoff §5.98.

Рекомендация: начать с Плана 1 (полностью автономен, быстрый результат), затем План 2. — Выполнено в этом порядке.

---

## 6. Критерии приёмки (эскиз)

- **A:** слушатель не может начать промежуточный тест модуля 2, пока не сдан тест модуля 1 (если модуль 1 обязателен); итоговый экзамен закрыт, пока не пройдены все обязательные модули; необязательный модуль → свободный переход; admin/methodist-preview не гейтится.
- **B:** при `minViewSeconds>0` экзамен модуля не стартует, пока `studiedSeconds≥minViewSeconds`; показан отсчёт; модули без `minViewSeconds` не затронуты.
- **C:** при `requiresPreExamAuth` старт попытки заблокирован до верификации по ссылке из письма; факт записан в попытке и виден в карточке слушателя; повторные попытки того же экзамена не переспрашивают; работает «включать по умолчанию новым группам».
- **Регресс:** `pnpm -s ci:check` зелёный; канонический `business-flows.e2e.test.ts` без регрессий.

---

## 7. Открытые вопросы / заметки

1. **Email-адаптер** для №816 — продакшн-зависимость (сейчас logging-заглушка). Дизайн C к этому готов (порт), но реальная отправка — отдельная задача.
2. **Интеграция экзамена в course-viewer.** Сейчас экзамены — отдельный поток `/me/tests`; гейт A/B логично показывать там, где слушатель учится. Предлагается добавить узел промежуточного теста в дерево модуля; серверный гейт в `startAttempt` остаётся источником истины независимо от точки входа.
3. **Автозавершение зачисления.** Сейчас `enrollment → completed` ставится вручную; не в scope Волны 1, но связано (гейтинг даёт основу для авто-завершения позже).
