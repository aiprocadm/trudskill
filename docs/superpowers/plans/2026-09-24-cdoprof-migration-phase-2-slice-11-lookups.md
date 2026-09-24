# Справочники личного дела (МГ-C1.2) — Фаза 2, срез 8.13 — план

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking. План утверждён по поручению владельца (правила автономии ТЗ перехода).

**Goal:** Должности, уровни образования и гражданство перестают быть свободным текстом (ТЗ перехода §6.4 МГ-C1.2): должности — справочник центра с автопополнением из импорта и мастера, уровни образования — фиксированный список ФРДО, гражданство — список стран; поле «должность» — ввод с подсказками и созданием новых значений.

**Architecture:** Новый модуль `modules/lookup` (образец — `modules/tasks`): миграция 0113 создаёт `lookup.positions` (на центр, `UNIQUE (tenant_id, lower(name))`) и глобальные `lookup.education_levels`, `lookup.countries` с сидом; репозиторий Postgres + память (`ALLOW_IN_MEMORY_STATE`), `LookupService` (`listPositions(tenantId, q)`, `rememberPositions(tenantId, names[])` с нормализацией, `listEducationLevels()`, `listCountries()`), контроллер `lookup/*` под `learners.read`/`learners.write`. Автопополнение — из обработчиков `POST learners/bulk-import`, `POST groups/wizard`, `PATCH learners/:id/profile`, `POST learners` (`LookupService` в `MvpController` последним необязательным аргументом). Фронт: `ComboInput` в `@trudskill/ui` (ввод + `datalist` подсказок, «создаётся при сохранении»), `features/lookup` (API + хуки), дровер слушателя — должность и гражданство через `ComboInput`, образование — `LookupSelect` уровней ФРДО.

**Tech Stack:** NestJS, pg (`insert … select unnest($2::text[]) on conflict do nothing` — одна запись на пачку), `@trudskill/ui`, vitest (+ testcontainers для таблиц).

**Spec:** `TZ_TRUDSKILL_CDOPROF_MIGRATION.md` §6.4 МГ-C1.2, §17 `lookup.positions/education_levels/countries` («`id, tenant_id?, code, name, is_active`, `UNIQUE (tenant_id, lower(name))`, автопополнение при импорте»), §13.3; ТЗ редизайна: ни одного англицизма как значения (`TXT-006`), подсказки в полях.

## Global Constraints

- Права только существующие (`learners.read` — чтение справочников, `learners.write` — создание должности); глобальные списки читаются без арендатора (сторож `tenant-scoped-handlers` — с объяснением), должности — строго по `tenant_id` (сторож `tenant-scoped-reads`).
- Значения у слушателя остаются текстом (`position`, `citizenship` — как ввели/выбрали; `educationLevel` — код уровня ФРДО); `position_id` не заполняется до появления потребителя (РМ81).
- Миграция аддитивная, сиды — `ON CONFLICT DO NOTHING`; нормализация не переписывает уже введённые должности слушателей.

## Решения (журнал РМ трекера)

- **РМ80.** Нормализация должности при автопополнении: обрезать и схлопнуть пробелы; запись ЦЕЛИКОМ ЗАГЛАВНЫМИ (как в выгрузках CDOPROF) → первая буква заглавная, остальные строчные; иначе — как ввели; дубли — по `lower(name)` (индекс уникальности); в справочник попадает нормализованное имя, у слушателя остаётся введённое.
- **РМ81.** Слушатель хранит `position`/`citizenship` текстом, `educationLevel` — кодом фиксированного списка ФРДО (`basic_general`, `secondary_general`, `secondary_vocational`, `higher_bachelor`, `higher_specialist`, `higher_postgraduate`, `other`); `position_id` — после появления потребителя (отчёты C3.2), чтобы не связывать карточку с записью, которую админ может переименовать.
- **РМ82.** Список стран — ISO 3166-1 alpha-2, стартовый сид 24 страны (Россия и ЕАЭС/СНГ первыми, далее частые в ДПО); пополняется миграцией; гражданство в карточке — название страны текстом (список — подсказки, свободный ввод допустим).
- **РМ83.** «`LookupSelect` с созданием» — не выпадающий список, а поле с подсказками (`ComboInput`: `<input list>` + `datalist`): новое значение создаётся при сохранении карточки (автопополнение сервером), без отдельного диалога «добавить должность».

## Review Focus

1. Импорт с должностями «ИНЖЕНЕР», «инженер », «Инженер» → в справочнике одна запись «Инженер» (тест сервиса).
2. Пустая должность в импорте → пусто без ошибки и без записи в справочнике (тест).
3. `GET lookup/positions?q=инж` → подсказки центра, чужой центр не виден (тест репозитория в памяти + SQL с `tenant_id`).
4. Уровни образования — фиксированный список, `POST` нет; коды не англицизмы на экране — подписи по-русски (тест словаря).
5. Дровер: выбор из подсказок и ввод нового значения дают одинаковый запрос (`position: 'Инженер'`); справочник пополняется после сохранения (тест контракта).

---

## Task 1: бэкенд

**Files:** Create `migrations/0113_lookup_positions_education_countries.sql`, `modules/lookup/{lookup.types,lookup.repository,postgres-lookup.repository,in-memory-lookup.repository,lookup.seed,lookup.service,lookup.dto,lookup.controller,lookup.module}.ts` (+ тесты сервиса и DTO); Modify `app.module.ts`, `mvp/mvp.module.ts`, `mvp/mvp.controller.ts` (автопополнение в 4 обработчиках), `common/guards/tenant-scoped-handlers.isolation.test.ts` (глобальные списки), фронт `audit/labels.ts` (`lookup.position_created`).

- [ ] Тесты → код → lint/typecheck → бэкенд тесты и сторожа → commit.

## Task 2: фронт

**Files:** Create `packages/ui/src/components/combo-input/index.tsx` (+ экспорт, тест), `features/lookup/{api,hooks}.ts` (+ контрактный тест); Modify `learner-edit-drawer.tsx` (должность и гражданство — `ComboInput`, образование — `LookupSelect`), `learner-profile-section.tsx` (уровень образования подписью), `features/lookup/labels.ts` (`EDUCATION_LEVEL_LABEL`).

- [ ] Экран; сторожа; commit.

## Task 3: документация 8.13 — handoff §5.586, трекер (РМ80–РМ83, МГ-C1.2 ✅), README, CLAUDE (миграция 0113), план — галочки. `pnpm ci:check`, PR, слияние.
