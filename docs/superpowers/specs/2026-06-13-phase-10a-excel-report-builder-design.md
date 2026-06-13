# Phase 10 Track A — Excel-конструктор отчётов (design)

**Дата:** 2026-06-13
**Фаза:** Roadmap Phase 10 (Mobile/PWA + WCAG + **Excel-конструктор**) — под-проект A из трёх независимых треков.
**Статус:** дизайн утверждён владельцем (выбор «все три параллельно» → реализуем последовательно, лидирует Track A как наивысшая ежедневная ценность и наименьший риск).

## 1. Цель

Администратор учебного центра самостоятельно собирает произвольный Excel-отчёт без участия разработчика:

1. выбирает **сущность** (ученики / назначения / документы),
2. отмечает нужные **поля** (колонки),
3. задаёт **фильтры** (по статусу, курсу, группе, клиенту, датам),
4. видит **превью** (первые N строк),
5. **скачивает XLSX**,
6. **сохраняет** конфигурацию как переиспользуемый шаблон и загружает его позже.

## 2. Не-цели (YAGNI)

- ❌ Произвольные JOIN-ы между сущностями / графовые запросы. Только одна сущность за отчёт (с денормализованными «прикреплёнными» полями — см. §5).
- ❌ Асинхронная генерация через worker + S3 + presigned URL. Отчёты ограничены данными одного тенанта и капом строк → синхронная генерация в request-scope (как `getAnalyticsDashboard`).
- ❌ CSV/PDF-форматы (только XLSX; CSV — отложенный пункт, тривиально добавляется позже тем же writer-слоем).
- ❌ Планировщик/рассылка отчётов по расписанию.
- ❌ Новая миграция / новое право / новая таблица. Всё read-model + MVP-state JSON-снимок, по образцу Phase 9 Plan B (analytics-dashboard).
- ❌ Расшаривание шаблонов между пользователями с ACL. Шаблоны — на уровне тенанта (любой админ с правом видит общие шаблоны центра).

## 3. Переиспользуемые паттерны кодовой базы

| Что нужно                                                        | Образец в репозитории                                                                                              |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Read-model: чистая функция над `here(state.X)` + scope → DTO     | `apps/backend/src/modules/mvp/analytics-dashboard.ts` + `MvpService.getAnalyticsDashboard` (`mvp.service.ts:1502`) |
| Endpoint отчёта под `enrollments.read`                           | `mvp.controller.ts:515` (`@Get('reports/analytics-dashboard')`)                                                    |
| Генерация XLSX через exceljs (single swap-point `COLUMNS`)       | `apps/backend/src/modules/mvp/ot-registry/ot-registry-xlsx.writer.ts`                                              |
| Регистрация новой MVP-коллекции (иначе теряется между запросами) | `apps/backend/src/modules/mvp/infrastructure/mvp-collections.ts`                                                   |
| DTO-валидация запроса                                            | `assertValidDto(SomeRequestClass, raw)` в контроллере                                                              |
| Frontend feature-модуль                                          | `apps/frontend/src/features/<domain>/` (`api.ts`/`hooks.ts`/`types.ts`/`screens.tsx`)                              |
| Навигация = данные                                               | `apps/frontend/src/features/navigation/model.ts` (`routeMeta` + `navigationModel`)                                 |

`exceljs ^4.4.0` уже в `apps/backend/package.json`. **Новых зависимостей нет.**

## 4. Архитектура

### 4.1 Реестр сущностей (single source of truth, backend, чистый модуль)

Новый файл `apps/backend/src/modules/mvp/report-builder/report-entities.ts` — декларативный реестр:

```ts
type FieldType = 'string' | 'number' | 'date' | 'enum';
interface ReportFieldDef {
  key: string; // стабильный ключ поля (контракт с фронтом)
  header: string; // заголовок колонки (рус.)
  type: FieldType;
  resolve: (row, ctx) => string | number | null; // как достать значение из строки + резолверы
}
interface ReportEntityDef {
  key: 'learners' | 'enrollments' | 'documents';
  label: string;
  fields: ReportFieldDef[]; // доступные колонки
  filters: ReportFilterDef[]; // доступные фильтры (status/course/group/client/date-range)
  load: (state, tenantId) => row[]; // tenant-scoped выборка базовых строк
}
```

Это **единственное место**, где описано «какие сущности/поля/фильтры доступны». Добавить новую сущность = добавить один `ReportEntityDef`.

Стартовый набор (3 сущности):

- **learners** (ученики): ФИО, email, СНИЛС, телефон, статус, дата создания.
- **enrollments** (назначения): ученик (ФИО), курс, группа, клиент, статус, прогресс %, дата назначения, дата завершения, срок (deadline), `valid_until`.
- **documents** (выданные документы): тип, номер, ученик, курс, дата выдачи, `valid_until`, статус (выдан/аннулирован).

«Прикреплённые» поля (курс/группа/клиент по enrollment) резолвятся через мапы — как `courseTitleById`/`groupById` в `analytics-dashboard.ts`. Денормализация, без JOIN-абстракции.

### 4.2 Движок отчёта (чистая функция)

`apps/backend/src/modules/mvp/report-builder/build-report.ts`:

```ts
buildReport(input: {
  entity: ReportEntityDef;
  selectedFields: string[];   // подмножество entity.fields, в порядке вывода
  filters: ResolvedFilter[];  // значения фильтров
  rows: row[];                // уже tenant-scoped (entity.load)
  limit?: number;             // для превью
  ctx: ResolveCtx;            // резолвер-мапы
}): { columns: {key,header,type}[]; rows: Record<string, string|number|null>[]; total: number }
```

Чистая, без DI → тестируется напрямую (unit). Фильтрация по выбранным фильтрам, проекция на выбранные поля, кап `limit`.

### 4.3 XLSX-writer

`apps/backend/src/modules/mvp/report-builder/report-xlsx.writer.ts` — обобщённый вариант `OtRegistryXlsxWriter`: принимает `{columns, rows}` (динамические колонки, не фиксированный `COLUMNS`), форматирует даты, жирный заголовок, `wb.xlsx.writeBuffer()` → Buffer. `contentType = application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`.

### 4.4 Сервис + state

`MvpService` получает методы (по образцу `getAnalyticsDashboard`):

- `previewReport(tenantId, req): { columns, rows, total }` — превью (кап, напр. 50 строк).
- `exportReport(tenantId, req): { fileName, mimeType, contentBase64 }` — полный XLSX, base64-в-конверте.
- `listReportTemplates(tenantId)`, `getReportTemplate(tenantId, id)`.
- `saveReportTemplate(tenantId, body, ctx)` (create/update), `deleteReportTemplate(tenantId, id, ctx)`.

Новая коллекция `reportTemplates: ReportTemplate[]` в in-memory state **+ регистрация в `mvp-collections.ts`** (иначе пропадёт между запросами — известный подводный камень). `ReportTemplate = { id, tenantId, name, entityKey, selectedFields[], filters, createdBy, createdAt, updatedAt }`. Все мутации шаблонов пишут `audit` (`reports.template_created`/`_updated`/`_deleted`).

### 4.5 Endpoints (контроллер `mvp.controller.ts`, под `enrollments.read`/`write`)

| Метод    | Путь                            | Право               | Назначение                                          |
| -------- | ------------------------------- | ------------------- | --------------------------------------------------- |
| `GET`    | `reports/builder/entities`      | `enrollments.read`  | метаданные реестра (сущности, поля, фильтры) для UI |
| `POST`   | `reports/builder/preview`       | `enrollments.read`  | превью строк (capped)                               |
| `POST`   | `reports/builder/export`        | `enrollments.read`  | XLSX base64-в-конверте                              |
| `GET`    | `reports/builder/templates`     | `enrollments.read`  | список шаблонов тенанта                             |
| `POST`   | `reports/builder/templates`     | `enrollments.write` | сохранить шаблон                                    |
| `DELETE` | `reports/builder/templates/:id` | `enrollments.write` | удалить шаблон                                      |

**Решение D-A2 (право):** переиспользуем `enrollments.read`/`enrollments.write` — отчётность есть расширение доступа к данным назначений; зеркалит `enrollments.read` у analytics/kpi; **избегаем RBAC-миграции** (held: roadmap Plan B сознательно без миграции). Документируется как осознанное переиспользование.

### 4.6 Скачивание (frontend)

`POST reports/builder/export` возвращает `{ fileName, mimeType, contentBase64 }` в стандартном конверте `{data,meta}`. Фронт декодирует base64 → `Blob` → `URL.createObjectURL` → клик по скрытой `<a download>`. Без S3, без presigned. Подходит для ограниченных по объёму отчётов (один тенант, кап строк в writer, напр. 50 000).

### 4.7 Frontend

`apps/frontend/src/features/report-builder/`:

- `api.ts` — обёртки над 6 endpoints (`apiRequest`); экспорт = base64→Blob→download.
- `types.ts` — зеркало контрактов.
- `report-builder.ts` (чистая логика) — валидация (≥1 поле выбрано), сериализация фильтров, состояние конструктора. Тестируется напрямую.
- `screens.tsx` — `ReportBuilderScreen`: селектор сущности → чекбоксы полей → строки фильтров → кнопка «Превью» (таблица `@cdoprof/ui` `DataTable`) → «Скачать XLSX» → «Сохранить шаблон» / список шаблонов (загрузить/удалить). Мутации через `useState`+async/await (`wrap`-паттерн `useDomainMutations`), НЕ React Query mutations.

Страница `apps/frontend/app/admin/reports/builder/page.tsx` в `<ProtectedPage>`. Навигация: запись в `routeMeta` (доступ — те же права, что у текущего раздела отчётов/аналитики) + `navigationModel` (раздел «Отчёты» / рядом с «Аналитика»).

## 5. Поток данных

```
UI (выбор сущности+полей+фильтров)
  → POST reports/builder/preview {entityKey, selectedFields[], filters}
      → MvpService.previewReport → entity.load(state,tenant) → buildReport(limit=50) → {columns,rows,total}
  → таблица превью
UI «Скачать»
  → POST reports/builder/export {entityKey, selectedFields[], filters}
      → buildReport(no limit) → report-xlsx.writer → Buffer → base64
      → {fileName, mimeType, contentBase64}
  → Blob → download
UI «Сохранить шаблон»
  → POST reports/builder/templates {name, entityKey, selectedFields[], filters}
      → state.reportTemplates.push(...) + audit → персист интерсептором
```

## 6. Обработка ошибок

- Пустой `selectedFields` или неизвестный `entityKey`/`fieldKey`/`filterKey` → `BadRequestException({code:'validation_error',...})` (DTO + проверка против реестра).
- Тенант-изоляция: `entity.load` фильтрует по `tenantId`; шаблоны — `getById`-паттерн с tenant-check.
- Превью кап (50) и экспорт-кап (напр. 50 000 строк) — при превышении экспорт всё равно отдаёт капнутый файл + `meta.truncated=true` (не молчаливое усечение; surв ответе и в UI-предупреждении).

## 7. Тестирование (trio + чистые юниты)

- `report-entities.test.ts` — резолверы полей возвращают ожидаемое; tenant-scoped `load`.
- `build-report.test.ts` — фильтрация, проекция, порядок колонок, кап/`total`, неизвестные ключи.
- `report-xlsx.writer.test.ts` — динамические колонки, формат дат, заголовок (по образцу `ot-registry-xlsx.writer.test.ts`, читаем буфер обратно через exceljs).
- `report-builder.service.test.ts` — `previewReport`/`exportReport`/CRUD шаблонов + идемпотентность update + audit + tenant-изоляция (`makeServices()` helper).
- DTO-валидация: `report-builder.dto-validation.test.ts`.
- HTTP integration: расширить `mvp.http.integration.test.ts` — permission boundary новых маршрутов (read vs write).
- Frontend: `report-builder.test.ts` (чистая логика), `api.contract.test.ts` (envelope + base64-decode), `*.e2e.test.ts` (доступ к маршруту + smoke динамического импорта экрана).

## 8. Файлы (создать/изменить)

**Backend (создать):**

- `modules/mvp/report-builder/report-entities.ts` (+ test)
- `modules/mvp/report-builder/build-report.ts` (+ test)
- `modules/mvp/report-builder/report-xlsx.writer.ts` (+ test)
- `modules/mvp/report-builder.dto.ts` (+ dto-validation test)
- `modules/mvp/report-builder.service.test.ts`

**Backend (изменить):**

- `modules/mvp/mvp.service.ts` — 6 методов + коллекция `reportTemplates`.
- `modules/mvp/mvp.types.ts` — типы `ReportTemplate`, request/response DTO-формы.
- `modules/mvp/mvp.controller.ts` — 6 endpoints.
- `modules/mvp/infrastructure/mvp-collections.ts` — регистрация `reportTemplates`.
- `modules/mvp/mvp.http.integration.test.ts` — permission boundary.
- `packages/api-contracts` — если read-model DTO идут через контракты (сверить, как сделан analytics-dashboard).

**Frontend (создать):**

- `features/report-builder/{api,types,report-builder,screens}.ts(x)` (+ tests)
- `app/admin/reports/builder/page.tsx`
- e2e + api.contract тесты

**Frontend (изменить):**

- `features/navigation/model.ts` — `routeMeta` + `navigationModel`.

## 9. Критерии приёмки

1. Админ выбирает сущность «Назначения», поля {ФИО, курс, статус, прогресс}, фильтр статус=«в процессе» → превью показывает корректные строки только своего тенанта.
2. «Скачать» отдаёт валидный .xlsx, открывается в Excel, колонки = выбранные поля в выбранном порядке, даты читаемы.
3. «Сохранить шаблон» → шаблон в списке; «Загрузить» восстанавливает сущность+поля+фильтры; «Удалить» убирает; всё переживает повторный HTTP-запрос (персист коллекции).
4. Запросы без `enrollments.read` → 403; сохранение/удаление без `enrollments.write` → 403.
5. `pnpm typecheck` 8/8, ESLint clean, целевые тесты зелёные; полный `ci:check` (с Cyrillic-fallback на изолированные backend-прогоны).

## 10. Деривации/решения

- **D-A1:** одна сущность за отчёт + денормализованные прикреплённые поля (без JOIN-движка) — покрывает реальные кейсы центра, держит движок чистым и тестируемым.
- **D-A2:** переиспользование `enrollments.read`/`write` без RBAC-миграции (см. §4.5).
- **D-A3:** синхронный экспорт base64-в-конверте вместо S3+presigned — нет worker/инфра-зависимости, достаточно для объёмов одного тенанта; для очень больших отчётов в будущем — отдельный план (S3 + worker).
- **D-A4:** генерация XLSX через exceljs (уже в зависимостях), writer обобщён до динамических колонок.

## 11. Следующие треки Phase 10 (дизайн утверждён, отдельные ветки/планы)

- **Track B — WCAG:** `eslint-plugin-jsx-a11y` (статический гейт, под конвенцию «no React mount») + ручные фиксы общих примитивов (`DataTable`, кнопки, `FilterBar`, формы, `AppShell`): семантика, aria, focus-visible, skip-link, landmarks, label↔input, `aria-live`. Runtime axe-аудит отложен (нет DOM-окружения в тестах).
- **Track C — PWA + push:** манифест + service worker (Serwist, Next 15 App Router) для устанавливаемости + app-shell кэш; backend `web-push` (VAPID через env), коллекция `pushSubscriptions`, канал «push» в `notification-dispatcher` рядом с email, привязка к событиям Phase 5. Offline-контент курсов отложен.
