# Фаза 0 «Аудит источника CDOPROF» — план (позиция 2 очереди)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Дата:** 2026-09-23. **ТЗ:** `TZ_TRUDSKILL_CDOPROF_MIGRATION.md` §13.1, §13.4 (МГ-K1.1), Часть VI п. 2 (PR-2).
**Трекер:** `docs/TZ_CDOPROF_MIGRATION_STATUS.md`, позиция 2. **Апрув:** делегирован (поручение владельца 23.09.2026) — план утверждён в момент записи.

**Goal:** Клиент API CDOPROF «только чтение» и скрипт выгрузки в JSON, работающие без живого доступа — на обезличенных фикстурах, — плюс описание источника (колонки, объёмы, известная грязь), чтобы Фаза 4 (импорт) начиналась с готового адаптера, а не с «а что вообще отдаёт API».

**Architecture:** Три слоя без Nest-обвязки (модуль пока не регистрируется в `AppModule` — некому его вызывать): (1) `sources/` — zod-схемы ответов + транспорт (`HttpCdoprofTransport` для стенда, `FixtureCdoprofTransport` для тестов) + `CdoprofApiClient` с постраничными итераторами; (2) `export/` — чистая функция `runCdoprofExport(client, sink)` с манифестом-профилем колонок (только счётчики, без ПДн); (3) тонкий скрипт `apps/backend/scripts/cdoprof-export.ts` (env → транспорт → папка на стенде). Ключ API живёт только в env и никогда не попадает в сообщения об ошибках.

**Tech Stack:** TypeScript (ESM, `.js` в импортах), zod 3 (уже в бэкенде), встроенный `fetch` Node 24, vitest.

**Spec:** `TZ_TRUDSKILL_CDOPROF_MIGRATION.md` (§13.1 источники, §13.4 МГ-K1.1, §15.2 «Интеграции», Часть VI PR-2) + `docs/audit/cdoprof-openapi-v1.yaml`.

## Global Constraints

- PR ≤30 файлов, обратимый; зелёный `pnpm ci:check` (правило репозитория).
- «ПДн в репозиторий не попадают — только структура и обезличенные примеры» (МГ-K1.1). Фикстуры — заведомо ничьи: ИНН с неверной контрольной суммой, почта `@example.invalid`, телефоны `+7 000 …`.
- «Реальные адреса CDOPROF — только из env» (трекер, «Адаптация ТЗ»): у скрипта нет адреса по умолчанию.
- Пауза между запросами, размер страницы, число повторов — настройки со значением по умолчанию, не константы (правило всех ТЗ).
- Ключ API — в env на стенде (Часть VI PR-2); в `integration.credentials` переедет в Фазе 4 вместе с экраном импорта.
- Живой прогон (ключ, IP, выгрузки Excel) — 🚫 О1/О2: код на фикстурах, живая часть в трекере остаётся ⬜ с пометкой.

## Review Focus

1. Ключ API в тексте ошибки или в журнале — транспорт обязан вырезать `api_key=…` из любого сообщения (тест в Task 2).
2. Бесконечный цикл по страницам, если API вернёт `has_next: true` при пустой странице или `pages` меньше `page` — итератор останавливается по трём условиям (тест в Task 3).
3. Отказ `contragent.students.trainings` по одному контрагенту не должен ронять всю выгрузку — частичный успех с поимённым отчётом (тест в Task 4).
4. Папка выгрузки внутри репозитория = ПДн в git — скрипт отказывается писать внутрь репозитория без `--fixtures` (тест в Task 5).
5. `items`/`trainings` в `contragent.students.trainings` описаны в OpenAPI как объект, а на практике почти наверняка массив — схема принимает обе формы и нормализует в массив (тест в Task 1).

---

### Task 1: zod-схемы ответов API CDOPROF

**Files:**

- Create: `apps/backend/src/modules/import-cdoprof/sources/cdoprof-api.schemas.ts`
- Test: `apps/backend/src/modules/import-cdoprof/sources/cdoprof-api.schemas.test.ts`

**Interfaces:**

- Produces: `cdoprofListEnvelope(itemSchema)` → zod-схема `{ success, data: { items: T[], pagination } }`; `cdoprofTrainingsEnvelopeSchema` → после `.transform` даёт `{ contragent, items: Array<{ student, trainings: Array<{ course, group, result }> }>, pagination? }`; типы `CdoprofContragent`, `CdoprofStudent`, `CdoprofCourse`, `CdoprofParentCourse`, `CdoprofGroup`, `CdoprofPagination`, `CdoprofTrainingsResponse`.

- [ ] **Step 1: Тест — конверт списка и нормализация обучений**

```ts
import { describe, expect, it } from 'vitest';

import {
  cdoprofContragentSchema,
  cdoprofListEnvelope,
  cdoprofTrainingsEnvelopeSchema
} from './cdoprof-api.schemas.js';

const pagination = { page: 1, limit: 100, total: 1, pages: 1, has_prev: false, has_next: false };

describe('cdoprof-api.schemas', () => {
  it('принимает конверт списка и пропускает неизвестные поля контрагента', () => {
    const parsed = cdoprofListEnvelope(cdoprofContragentSchema).parse({
      success: true,
      data: {
        items: [{ id: 1, inn: '7700000001', name_organiztion: 'ООО «Тест»', new_field: 'x' }],
        pagination
      }
    });
    expect(parsed.data.items[0]?.id).toBe(1);
    expect((parsed.data.items[0] as Record<string, unknown>).new_field).toBe('x');
  });

  it('нормализует обучения: объект → массив из одного элемента', () => {
    const parsed = cdoprofTrainingsEnvelopeSchema.parse({
      success: true,
      data: {
        contragent: { id: 1 },
        items: {
          student: { id: 5 },
          trainings: { course: { id: 9 }, group: { id: 3 }, result: { code: 1 } }
        }
      }
    });
    expect(parsed.data.items).toHaveLength(1);
    expect(parsed.data.items[0]?.trainings).toHaveLength(1);
  });

  it('отвергает конверт без items', () => {
    expect(() =>
      cdoprofListEnvelope(cdoprofContragentSchema).parse({ success: true, data: {} })
    ).toThrow();
  });
});
```

- [ ] **Step 2: Запустить — падает (`Cannot find module`)**

Run: `pnpm --filter @trudskill/backend exec vitest run src/modules/import-cdoprof/sources/cdoprof-api.schemas.test.ts --no-file-parallelism`

- [ ] **Step 3: Реализация**

Все поля сущностей `nullable().optional()` (OpenAPI объявляет `nullable`, а живой API может и не прислать поле); `.passthrough()` — неизвестные колонки не ошибка, а предмет аудита. Для `items`/`trainings` — `z.union([z.array(x), x]).transform(toArray)`.

- [ ] **Step 4: Запустить — зелёный. Commit `feat(backend): схемы ответов API CDOPROF (Фаза 0)`**

### Task 2: HTTP-транспорт с паузами, повторами и защитой ключа

**Files:**

- Create: `apps/backend/src/modules/import-cdoprof/sources/cdoprof-transport.ts` (интерфейс + ошибка)
- Create: `apps/backend/src/modules/import-cdoprof/sources/http-cdoprof-transport.ts`
- Test: `apps/backend/src/modules/import-cdoprof/sources/http-cdoprof-transport.test.ts`

**Interfaces:**

- Produces: `interface CdoprofTransport { get(method: string, query?: CdoprofQuery): Promise<unknown> }`; `type CdoprofQuery = Record<string, string | number | undefined>`; `class CdoprofApiError extends Error { code: 'unauthorized' | 'http_error' | 'invalid_json' | 'api_error' | 'network_error'; status?: number }`; `class HttpCdoprofTransport implements CdoprofTransport` с опциями `{ baseUrl, apiKey, pauseMs = 300, maxRetries = 3, retryBaseMs = 1000, fetchImpl = globalThis.fetch, sleep = setTimeout-обёртка }`; `redactApiKey(text: string): string`.

- [ ] **Step 1: Тесты**

```ts
it('добавляет api_key и параметры в строку запроса', …)      // url содержит api_key=secret&page=2&limit=100
it('выдерживает паузу между запросами, но не перед первым', …) // sleep вызван 1 раз при 2 запросах, с pauseMs
it('повторяет запрос при 500 и 429 и отдаёт результат', …)     // fetch: 500 → 429 → 200; 2 повтора, задержки 1000, 2000
it('после maxRetries сдаётся с http_error', …)
it('401 → unauthorized без повторов', …)
it('не-JSON → invalid_json; success:false → api_error', …)
it('ни одно сообщение об ошибке не содержит ключ', …)           // все ошибки выше: expect(err.message).not.toContain('secret')
```

- [ ] **Step 2: Запустить — падает. Step 3: Реализация. Step 4: Зелёный. Commit `feat(backend): HTTP-транспорт API CDOPROF — паузы, повторы, ключ не утекает`**

### Task 3: Транспорт на фикстурах и клиент с постраничными итераторами

**Files:**

- Create: `apps/backend/src/modules/import-cdoprof/__fixtures__/cdoprof-api/dataset.json` (обезличенный набор: 4 контрагента, 8 слушателей, 3 направления, 5 курсов, 6 групп, обучения по 3 контрагентам — с известной грязью из ТЗ I.1.3/I.2 P8: дата `2109-12-01`, дубль ФИО+ДР с «ё», должность `undefined`, пустой ИНН, 12-значный ИНН, дубль номера группы, группа без дат, слушатель только с `full_name`)
- Create: `apps/backend/src/modules/import-cdoprof/sources/fixture-cdoprof-transport.ts`
- Create: `apps/backend/src/modules/import-cdoprof/sources/cdoprof-api-client.ts`
- Test: `apps/backend/src/modules/import-cdoprof/sources/cdoprof-api-client.test.ts`
- Test: `apps/backend/src/modules/import-cdoprof/__fixtures__/fixtures-are-anonymized.test.ts` (сторож: ИНН с неверной контрольной суммой, почта только `@example.invalid`, телефоны только `+7 000`)

**Interfaces:**

- Consumes: Task 1 схемы, Task 2 `CdoprofTransport`.
- Produces: `interface CdoprofDataset { contragents; students; parentCourses; courses; groups; trainings: Record<string, TrainingItem[]> }`; `loadFixtureDataset(): CdoprofDataset`; `class FixtureCdoprofTransport implements CdoprofTransport` (`constructor(dataset)`, `calls: Array<{ method, query }>`); `class CdoprofApiClient` — `constructor(transport, { pageLimit = 100 })`, методы `listContragents(page, search?)`, `getContragentByInn(inn)`, `listContragentStudents(contragentId, page)`, `listStudents(page, search?, searchColumn?)`, `listCourses(page, …)`, `listParentCourses(page, …)`, `listGroups(page, …)`, `getContragentTrainings(contragentId)`, и `iterateContragents()`, `iterateStudents()`, `iterateCourses()`, `iterateParentCourses()`, `iterateGroups()` — `AsyncGenerator<T>`.

- [ ] **Step 1: Тесты клиента** — итератор собирает все элементы через 3 страницы при `pageLimit: 3`; останавливается при `has_next: false`; останавливается при пустой странице и при `page > pages` даже если `has_next: true` (подставной транспорт); `byInn` возвращает одного; `listContragentStudents` фильтрует по `id_organiz`; `getContragentTrainings` для контрагента без обучений даёт `items: []`; неизвестный метод у фикстур — ошибка.
- [ ] **Step 2: Сторож фикстур** — для каждого ИНН `isValidInnChecksum(inn) === false`; для каждой почты `endsWith('@example.invalid')`; телефон `startsWith('+7 000')`.
- [ ] **Step 3: Реализация. Step 4: Зелёный. Commit `feat(backend): клиент API CDOPROF только на чтение + обезличенные фикстуры`**

### Task 4: Выгрузка в JSON с манифестом-профилем колонок

**Files:**

- Create: `apps/backend/src/modules/import-cdoprof/export/cdoprof-export.ts`
- Create: `apps/backend/src/modules/import-cdoprof/export/fs-export-sink.ts`
- Test: `apps/backend/src/modules/import-cdoprof/export/cdoprof-export.test.ts`

**Interfaces:**

- Consumes: `CdoprofApiClient` (Task 3).
- Produces: `interface ExportSink { write(name: string, payload: unknown): Promise<void> }`; `class FsExportSink implements ExportSink` (`constructor(dir)`, файлы `0600`, папка `0700`); `runCdoprofExport(client, sink, { withTrainings = true, now = () => new Date(), log = () => {} }): Promise<CdoprofExportManifest>`; манифест `{ exportedAt, durationMs, entities: Record<name, { file, count, columns: Record<col, { filled, empty, undefinedStrings }> }>, trainings: { requested, exported, failed: Array<{ contragentId, reason }> }, warnings: string[] }`.

- [ ] **Step 1: Тесты** — на фикстурах пишет 7 файлов (`contragents.json`, `students.json`, `parent-courses.json`, `courses.json`, `groups.json`, `trainings.json`, `manifest.json`); счётчики равны размеру фикстур; профиль колонок: `students.dolznost.undefinedStrings === 1`, `contragents.inn.empty === 1`; отказ обучений по одному контрагенту (обёртка над транспортом бросает на `contragent_id=2`) → `failed: [{ contragentId: 2 }]`, остальные выгружены, `warnings` содержит строку с id; `withTrainings: false` → файла `trainings.json` нет; в манифесте нет ни одного значения из фикстур (ФИО/почта) — только числа.
- [ ] **Step 2–4: Реализация, зелёный, Commit `feat(backend): выгрузка CDOPROF в JSON с профилем колонок без ПДн`**

### Task 5: Скрипт на стенде + команда + пример env

**Files:**

- Create: `apps/backend/scripts/cdoprof-export.ts`
- Create: `apps/backend/src/modules/import-cdoprof/export/export-dir-guard.ts` (+ тест `export-dir-guard.test.ts`): `assertExportDirOutsideRepo(dir, repoRoot, { allowInsideRepo })` — отказывает писать внутрь репозитория без `--fixtures`
- Modify: `apps/backend/package.json` (`"export:cdoprof": "tsx scripts/cdoprof-export.ts"`), `package.json` корня (`"export:cdoprof": "pnpm --filter @trudskill/backend export:cdoprof"`)
- Modify: `apps/backend/.env.example` (блок `CDOPROF_*` закомментированный, с пояснением)

Поведение скрипта: env `CDOPROF_API_BASE_URL`, `CDOPROF_API_KEY`, `CDOPROF_EXPORT_DIR` (обязательны без `--fixtures`), `CDOPROF_REQUEST_PAUSE_MS` (300), `CDOPROF_PAGE_LIMIT` (100), `CDOPROF_MAX_RETRIES` (3); флаги `--fixtures` (учебный прогон без сети, папка по умолчанию — `os.tmpdir()/cdoprof-export-fixtures`), `--no-trainings`. Печатает состав манифеста по-русски; код выхода 1 при отказе.

- [ ] **Step 1: Тест стража папки. Step 2: Реализация стража и скрипта. Step 3: Прогон `pnpm export:cdoprof -- --fixtures` руками — 7 файлов в tmp. Commit `feat(backend): скрипт выгрузки CDOPROF (env, --fixtures, отказ писать в репозиторий)`**

### Task 6: Документ источника + трекер + handoff

**Files:**

- Create: `docs/audit/cdoprof-source-2026-09.md` — колонки по каждому методу API (из OpenAPI + тип + что с ними делает §13.2), известные объёмы (1 622 / 13 755 / 24 756 / ~427 / 18), чего в API нет, известная грязь, что снять в живом прогоне (🚫 О1/О2: форматы дат, лимиты частоты, реальная форма `items` в trainings, колонки Excel), как запускать скрипт на стенде, что лежит в манифесте.
- Modify: `docs/TZ_CDOPROF_MIGRATION_STATUS.md` («Где мы сейчас» → позиция 3; очередь п. 2 → ✅ по коду / живой прогон 🚫; статус МГ-K1.1; журнал решений РМ15+; журнал сессий), `LMS_AGENT_HANDOFF.md` (§5.553), `README.md` §2.

- [ ] **Step 1: Написать документ. Step 2: Обновить трекер/handoff/README. Step 3: `pnpm ci:check` зелёный → PR.**

## Решения агента (в журнал трекера)

- **РМ15.** Модуль `import-cdoprof` в Фазе 0 не регистрируется в `AppModule`: без экрана и ручек ему нечего обслуживать, а мёртвый провайдер — лишняя поверхность. Регистрация — в Фазе 4 вместе с `import.controller.ts`.
- **РМ16.** Ключ API в Фазе 0 — из env скрипта, не из `integration.credentials`: скрипт запускается руками на стенде миграции вне HTTP-контекста тенанта; перенос в зашифрованное хранилище — Фаза 4 (там же появится тенант-владелец ключа).
- **РМ17.** Схемы ответов — `passthrough` + все поля необязательные: описание API — тестового сервера, живой может отличаться; строгая схема уронила бы выгрузку из-за одной лишней колонки, а Фаза 0 как раз должна их увидеть (профиль колонок в манифесте).
