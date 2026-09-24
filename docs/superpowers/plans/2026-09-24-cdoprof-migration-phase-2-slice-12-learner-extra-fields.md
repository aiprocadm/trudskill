# Именованные поля личного дела (МГ-C1.3) — Фаза 2, срез 8.14 — план

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking. План утверждён по поручению владельца (правила автономии ТЗ перехода).

**Goal:** Вместо «дополнительная строка 1–10» из CDOPROF центр сам называет свои поля личного дела (ТЗ перехода §6.4 МГ-C1.3): настройка `learnerExtraFields[]` (ключ, подпись, тип: текст / дата / список), значения — в `extra_fields` слушателя, в документах — переменные `{learner.extra.<ключ>}`.

**Architecture:** Бэкенд (8.14a): описание полей — в `org.tenant_settings.payload.learnerExtraFields` (образец `groupDefaults`: `learner-extra-fields.ts` с `resolveLearnerExtraFields(raw)` — снисходительный разбор, `LearnerFieldsSettingsService` как `GroupSettingsService`); `PATCH /learners/:id/profile` проверяет `extraFields` по описанию (неизвестный ключ, не-дата, значение вне списка → 400 с русским текстом); сборщик переменных документов добавляет коды `learner.extra.<ключ>` из настроек центра к каталогу (скелет и разрешение), проверка шаблона считает их известными. Новых ручек нет: описание читается через `GET /tenant/settings` (`tenant.read`), пишется через `PUT /tenant/settings` (`tenant.settings.write`). Фронт (8.14b): раздел настроек «Поля личного дела», динамические поля во вкладке «Личное дело» панели и в разделе карточки.

**Tech Stack:** NestJS, `TenantService.getSettings`, `document-variables.builder.ts`, `template-inspection.service.ts`, `@trudskill/ui`, vitest.

**Spec:** `TZ_TRUDSKILL_CDOPROF_MIGRATION.md` §6.4 МГ-C1.3, §13.2 («доп. строки без семантики → `extra_fields.legacy_1..10` с подписями из настроек»), §17 `org.tenant_settings.payload` (+ `learnerExtraFields`); ТЗ стабилизации: всё, что похоже на константу, — настройка.

## Global Constraints

- Права и ручки только существующие; контракты не трогаются; миграций нет (`extra_fields jsonb` — 0106, проекция — 8.12a).
- Ключ поля — латиница/цифры/подчёркивание (`^[a-z][a-z0-9_]{0,39}$`), подпись — русская, до 10 полей на центр (числа — настройка со значением по умолчанию: лимит полей в том же описании? — нет, константа `MAX_LEARNER_EXTRA_FIELDS = 10` из ТЗ «1–10» с пояснением).
- Каталог переменных остаётся статичным для документов без центра (демо-предпросмотр), динамические коды — только при сборке для конкретного центра.

## Решения (журнал РМ трекера)

- **РМ84.** Описание именованных полей живёт в `tenant_settings.payload.learnerExtraFields` (как `groupDefaults`), без отдельной таблицы и ручек: читается с правом `tenant.read`, пишется с `tenant.settings.write`; разбор снисходительный — испорченная запись игнорируется, а не ломает карточки.
- **РМ85.** Значения проверяются при правке карточки по описанию центра: неизвестный ключ, дата не в ISO, значение вне списка — 400 с перечнем допустимого; импорт CDOPROF (K5) сможет класть `legacy_1..10` до настройки — проверка применяется только к явной правке через `PATCH`.
- **РМ86.** Переменные документов `{learner.extra.<ключ>}` подмешиваются в каталог при сборке и проверке шаблона для конкретного центра; в общем каталоге и демо-предпросмотре их нет (статичный список остаётся под сторожами).

## Review Focus

1. Настройка с испорченной записью (без ключа, ключ с пробелом, тип «xml») → поле пропускается, остальные работают (тест разбора).
2. `PATCH` с ключом, которого нет в настройке → 400 и перечень допустимых ключей; с датой «01.03.2026» у поля типа дата → 400 (тест сервиса/контроллера).
3. Шаблон с `{learner.extra.otdel}` при описанном поле — «известная переменная», без описания — «неизвестная» (тест проверки шаблона).
4. Сборка документа подставляет значение поля и пустую строку, когда значения нет (тест сборщика).
5. Экран настроек: два поля с одинаковым ключом не сохраняются, подсказка называет дубль.

---

## Task 1: бэкенд (PR 8.14a)

**Files:** Create `mvp/learners/learner-extra-fields.ts` (+ тест), `mvp/learners/learner-fields-settings.service.ts`; Modify `mvp/mvp.controller.ts` (проверка `extraFields` в `PATCH learners/:id/profile`), `mvp/mvp.module.ts` (провайдер), `documents/variable-catalog.ts` (`classifyPlaceholders(placeholders, extraKnown?)`, `extraLearnerVariableEntries(defs)`), `documents/document-variables.builder.ts` (коды из настроек + разрешение `learner.extra.*`), `documents/template-inspection.service.ts` (известные из настроек), тесты сборщика/проверки.

- [x] Тесты → код → lint/typecheck → commit (PR 8.14a, §5.587).

## Task 2: документация 8.14a — handoff §5.587, трекер (РМ84–РМ86, МГ-C1.3 🔄), README, CLAUDE. `pnpm ci:check`, PR, слияние.

## Task 3: фронт (PR 8.14b)

**Files:** Create `features/learners/extra-fields.ts` (типы, разбор, хук `useLearnerExtraFields`), `features/settings/learner-fields-section.tsx`; Modify `settings/sections.ts` и `settings-screen.tsx` (раздел «Поля личного дела»), `learner-edit-drawer.tsx` и `learner-profile-section.tsx` (динамические поля), `format.ts` (`extraFields` в форме и разнице), тесты.

- [x] Экран; сторожа; commit (PR 8.14b, §5.588). Отклонение: добавлено слияние `extraFields` по ключам на сервере (РМ87, журнал 640) и транслитерация имени из подписи (РМ88).

## Task 4: документация 8.14b — handoff §5.588, трекер (МГ-C1 ✅ целиком), README, CLAUDE. `pnpm ci:check`, PR, слияние.
