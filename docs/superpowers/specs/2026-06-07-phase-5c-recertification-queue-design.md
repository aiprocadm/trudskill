# Phase 5C — Очередь «Нужна переаттестация»: дизайн

| Поле          | Значение                                                                                                                                                                    |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Дата создания | 2026-06-07                                                                                                                                                                  |
| Автор         | Brainstorming session (владелец учебного центра + Claude)                                                                                                                   |
| Статус        | Утверждён владельцем (design approved 2026-06-07)                                                                                                                           |
| Релиз         | Phase 5C (роадмап V1, фаза 5 из 11 — фронтенд-хвост после 5A/5B/5B-2)                                                                                                       |
| Источник      | [2026-05-21-cdoprof-v1-roadmap.md](../plans/2026-05-21-cdoprof-v1-roadmap.md) §Phase 5 + [phase-5 design](2026-06-04-phase-5-notifications-recertifications-design.md) §3.4 |
| Зависит от    | 5B (`recertification_drafts` + endpoints, migration 0048, PR #229 в `main`); 5B-2 (scanner-рефактор, ветка)                                                                 |
| Следующий шаг | План реализации (`superpowers:writing-plans`)                                                                                                                               |

> **Назначение.** Дать администратору центра видимый экран «кому пора переаттестацию». Бэкенд для этого построен в 5B/5B-2 (черновики переаттестации, скан по датам, endpoints `list`/`scan`/`reject`/`approve`), но **UI отсутствует** — черновики не видны нигде. Этот документ фиксирует осознанно-минимальный объём («только список»), доменную модель экрана, обогащение списка именами и осознанно отложенное.

---

## 1. Реальность кода: что уже есть vs что строим

### 1.1 Уже есть (переиспользуем)

| Возможность                                                                                    | Где                                                                                                                                |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `GET /recertification-drafts?status=` (`recertification.read`) → `RecertificationDraftRow[]`   | [recertification.controller.ts:33](../../../apps/backend/src/modules/mvp/recertification/recertification.controller.ts)            |
| `POST /recertification/scan` (`recertification.write`) → `RecertScanSummary`                   | [recertification.controller.ts:42](../../../apps/backend/src/modules/mvp/recertification/recertification.controller.ts)            |
| `POST /recertification-drafts/:id/reject` body `{ reason? }` (`recertification.write`)         | [recertification.controller.ts:61](../../../apps/backend/src/modules/mvp/recertification/recertification.controller.ts)            |
| Резолверы имени слушателя + названия курса (уже считаются для письма `recertification_due`)    | [recertification-scanner.service.ts:127](../../../apps/backend/src/modules/mvp/recertification/recertification-scanner.service.ts) |
| Права `recertification.read` / `recertification.write` (seeded)                                | migration 0048                                                                                                                     |
| Навигация-данными: `routeMeta` + `navigationModel` (`AppShell` рендерит динамически)           | [navigation/model.ts](../../../apps/frontend/src/features/navigation/model.ts)                                                     |
| Образец feature-модуля с таблицей + действиями + контракт-тестами (`/admin/clients`, learners) | [features/clients](../../../apps/frontend/src/features/clients/)                                                                   |
| Паттерн мутаций `useState` + async (`useDomainMutations` `wrap`), НЕ React Query               | [features/mvp/hooks.ts:131](../../../apps/frontend/src/features/mvp/hooks.ts)                                                      |
| Обёртки экрана: `PageContainer`, `PageHeader`, `SectionCard`, `SectionEmpty`, `SectionError`   | [apps/frontend/src/components](../../../apps/frontend/src/components/)                                                             |
| `DataTable`, `Column`, `StatusChip` из `@cdoprof/ui`                                           | [packages/ui](../../../packages/ui/)                                                                                               |
| `<ProtectedPage>` (sidebar + breadcrumbs + auth) для `/admin/*`                                | [widgets/shell/protected-page.tsx](../../../apps/frontend/src/widgets/shell/protected-page.tsx)                                    |

### 1.2 Строим в 5C

| Gap                                                                                                    | Слой     | Раздел |
| ------------------------------------------------------------------------------------------------------ | -------- | ------ |
| Обогащение `GET /recertification-drafts`: `learnerName`, `courseTitle` (+ `learnerSnils?` best-effort) | Backend  | §3.1   |
| Feature-модуль `features/recertification/` (`types`/`api`/`hooks`/`format`/`screens`)                  | Frontend | §3.2   |
| Страница `app/admin/recertification/page.tsx` в `<ProtectedPage>`                                      | Frontend | §3.2   |
| Запись навигации (`routeMeta` + `navigationModel`, слот `more`, метка «Переаттестация»)                | Frontend | §3.2   |
| Колонка «Осталось» (через N дн. / сегодня / просрочено) + лейблы статусов                              | Frontend | §3.3   |

**Вывод:** 5C — преимущественно фронтенд. Единственная правка бэкенда — **обогащение списка именами** (без него экран показывал бы голые UUID). Резолверы уже существуют (используются для письма) — переиспользуем их, не дублируем.

---

## 2. Утверждённые владельцем решения

| #   | Вопрос                              | Решение                                                                                                                                 |
| --- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Объём экрана                        | **«Только список»**: видимость + «Убрать» (reject) + «Проверить сейчас» (scan). Фактическое перезачисление — через «Массовую загрузку». |
| 2   | Кнопка «Одобрить» / авто-зачисление | **НЕ включаем** в 5C (endpoint `approve` есть на бэке, но не выводится в UI). Отложено как возможный 5C-2.                              |
| 3   | Кнопка «Проверить сейчас»           | **Включаем** (вариант «а»). Иначе список пуст, пока ops не включит ночной крон (`RECERTIFICATION_SCAN_ENABLED`).                        |

**Дефолты (заданы Claude, не раздували интервью):**

- **Обогащение — на бэкенде** (а не склейка на фронте): список дополняется `learnerName`/`courseTitle` через существующие резолверы из загруженного `state`. Отсутствующее имя → пустая строка (не падаем).
- **Фильтр статуса:** `Ожидают` (default) / `Отклонённые` / `Все`. Статус `approved` через UI не достигается (approve не выведен), но остаётся валиден для фильтра (на случай данных из крон/будущего).
- **Без пагинации:** список черновиков per-tenant мал; добавим позже при необходимости (endpoint и так без пагинации).
- **Мутации:** `useState` + async `wrap` (конвенция проекта), не React Query.

---

## 3. Доменная модель, потоки, архитектура

### 3.1 Бэкенд — обогащение списка

`RecertificationDraftRow` (репозиторий) хранит только идентификаторы:

```
id, tenantId, learnerId, sourceDocumentId, courseVersionId,
validUntil, status, resultingEnrollmentId?, reason?, decidedAt?, decidedBy?, createdAt, updatedAt
```

`RecertificationService.listDrafts` сейчас возвращает строки «как есть». Добавляем **маппер** в сервисе (request-scoped, `this.state` уже загружен интерсептором), который к каждой строке добавляет вычисляемые поля:

```ts
interface RecertificationDraftView extends RecertificationDraftRow {
  learnerName: string; // резолв ФИО из mvp-state по learnerId (тот же источник, что recipients в scanner)
  learnerSnils?: string; // best-effort: если СНИЛС есть на учётке слушателя в state
  courseTitle: string; // resolveCourseTitleByVersion(state, tenantId, courseVersionId) ?? ''
}
```

- Резолверы переиспользуются из `recertification-scanner.service.ts` (там уже `learnerName` + `courseTitle`). Оба резолвятся из загруженного **mvp-state** (слушатели и версии курсов лежат там). Если резолвер вернул пусто — поле = `''` / `undefined`, строка всё равно отображается (деградация, не падение).
- **Намеренно НЕ включаем `sourceDocumentNumber`:** исходный документ живёт в модуле `documents` (отдельный `DocumentsTenantRunner`), а не в загруженном mvp-state. Кросс-модульное чтение ради одной колонки — переусложнение для минимального 5C; отложено (см. §7). Слушатель + курс + дата однозначно идентифицируют запись.
- Endpoints `scan` и `reject` — без изменений.

### 3.2 Фронтенд — структура

```
apps/frontend/src/features/recertification/
  types.ts        # RecertificationDraftView, RecertScanSummary, status union + лейблы
  api.ts          # list(status?) / reject(id, reason?) / scan() через apiRequest (конверт)
  hooks.ts        # useRecertificationQueue: загрузка + reject/scan мутации (useState wrap)
  format.ts       # formatRemaining(validUntil, today) + STATUS_LABELS
  screens.tsx     # RecertificationQueueScreen
  api.contract.test.ts
  format.test.ts
apps/frontend/app/admin/recertification/page.tsx   # <ProtectedPage><RecertificationQueueScreen/></ProtectedPage>
```

Навигация ([model.ts](../../../apps/frontend/src/features/navigation/model.ts)):

- `routeMeta`: `{ pattern: '/admin/recertification', meta: { public: false, requiredPermissions: ['recertification.read'] } }`.
- `navigationModel`: `{ href: '/admin/recertification', label: 'Переаттестация', requiredPermissions: ['recertification.read'], navSlot: 'more' }`.

### 3.3 Экран

- `PageHeader` «Нужна переаттестация», справа кнопка **«Проверить сейчас»**.
- Сегмент-фильтр статуса: **Ожидают** (default) / Отклонённые / Все.
- `DataTable` (`@cdoprof/ui`), колонки:
  | Колонка | Контент |
  | --- | --- |
  | Слушатель | `learnerName` + СНИЛС (мелким) |
  | Курс | `courseTitle` |
  | Действует до | `validUntil` (дата) |
  | Осталось | бейдж: «через N дн.» / «сегодня» / «просрочено N дн.» (по `validUntil` vs сегодня) |
  | Статус | `StatusChip`: Ожидает / Отклонён / Одобрен |
  | Действие | «Убрать» (только для `pending`) |
- **«Убрать»** → инлайн-подтверждение с необязательной причиной → `reject(id, reason)` → рефетч.
- **«Проверить сейчас»** → `scan()` → краткий итог («Создано N черновиков, найдено M кандидатов») → рефетч.
- Пусто: `SectionEmpty` «Сейчас никому не нужна переаттестация».
- Ошибка/загрузка: `SectionError` / `LoadingState`.

### 3.4 Потоки данных

```
Открытие страницы → api.list({ status:'pending' }) → view[] → DataTable
Смена фильтра     → api.list({ status }) → рефетч
«Убрать»          → api.reject(id, reason?) → успех → рефетч (запись уходит из «Ожидают»)
«Проверить сейчас»→ api.scan() → summary → рефетч
```

Все мутации — `useState` + async `wrap` (loading/error per-action), как в `CommissionDetailsScreen` / `useBulkImportMutation`.

### 3.5 Обработка ошибок

- Ошибки в конверте `{ error: { code, message } }` → `SectionError` (загрузка) или inline `FieldError` (действие).
- `reject` уже не-`pending` записи → бэк `400 recertification_draft_not_pending` → показываем сообщение, рефетчим (состояние могло измениться).
- Сбой `scan` → тост/`FieldError` с текстом ошибки.

---

## 4. Побочные эффекты (важно для ops)

- **«Проверить сейчас»** запускает тот же скан, что и ночной крон: создаёт черновики **и рассылает письма-напоминания** `recertification_due` (слушатель + компания), send-once по `email_deliveries.dedup_key`. При `NOTIFICATIONS_EMAIL_ENABLED=false` (дев-дефолт) почта — `NoopMailer`, реальных писем нет. В проде с включённой почтой — уйдут (это и есть штатное напоминание Phase 5).
- 5C ничего необратимого с зачислениями **не** делает (approve не выведен) — только показывает и «убирает» черновики.

---

## 5. Права доступа

| Действие                  | Право                   |
| ------------------------- | ----------------------- |
| Видеть очередь + страницу | `recertification.read`  |
| «Убрать» (reject)         | `recertification.write` |
| «Проверить сейчас» (scan) | `recertification.write` |

Права уже засеяны в migration 0048. **Новой миграции 5C не требует** (обогащение — read-time маппинг, без изменения схемы).

---

## 6. Тестирование (по конвенциям проекта)

- **Backend (service unit):** маппер обогащения — резолвит `learnerName`/`courseTitle` из state; деградирует к `''` при отсутствии; не теряет поля строки. Permission-boundary для `list`/`scan`/`reject` уже покрыт в [mvp.http.integration.test.ts](../../../apps/backend/src/modules/mvp/mvp.http.integration.test.ts) (5B) — расширяем при необходимости.
- **Frontend `api.contract.test.ts`:** `vi.stubGlobal('fetch')` → проверка разворачивания конверта и формы payload для `list` / `reject` / `scan`.
- **Frontend `format.test.ts`:** `formatRemaining` (будущее «через N дн.», «сегодня», «просрочено»), `STATUS_LABELS`.
- **Frontend e2e (`src/e2e`):** доступ к `/admin/recertification` + видимость пункта навигации по праву `recertification.read` (через `evaluateRouteAccess` / `getVisibleNavigation`), без React-рендера — как `admin-bulk-enrollment.e2e.test.ts`.

---

## 7. Вне объёма (осознанно отложено)

| Отложено                                           | Куда / почему                                         |
| -------------------------------------------------- | ----------------------------------------------------- |
| Кнопка «Одобрить» / авто-зачисление + выбор группы | Возможный 5C-2; владелец выбрал «только список»       |
| `license_expiring` уведомления                     | Нужна postgres-persistence модуля `org` (Phase-хвост) |
| Получатели «куратор/админ-email»                   | Phase 5 хвост                                         |
| № исходного удостоверения в списке                 | Нужен кросс-модульный read `documents` (§3.1)         |
| Пагинация / серверная сортировка очереди           | По мере роста объёмов                                 |
| UI-редактор шаблонов писем                         | Позже (сейчас код-дефолты + override в БД)            |

```

```
