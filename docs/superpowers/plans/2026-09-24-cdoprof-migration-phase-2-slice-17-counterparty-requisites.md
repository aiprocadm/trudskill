# Реквизиты контрагента и подстановка по ИНН (МГ-D1) — Фаза 2, срезы 13.1–13.2 — план

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax for tracking. План утверждён по поручению владельца (правила автономии ТЗ перехода).

**Goal:** ТЗ перехода МГ-D1.1–D1.2 [P0]: полная карточка контрагента (краткое название, ОГРН, ОКПО, ОКАТО, ОКТМО, ОКОГУ, ОКОПФ, ОКВЭД, почтовый и фактический адрес, регион, город, индекс, факс, директор и его должность, менеджер, номер и дата договора) и подстановка реквизитов по ИНН (`GET /counterparties/suggest?inn=`, провайдер `dadata | noop`).

**Architecture:** Разведка (§5.598): колонки реквизитов в `crm.counterparties` уже есть (миграции 0039, 0102, 0106), но их не несёт ни сущность `Counterparty`, ни DTO, ни служба, ни проекция снимка в таблицу, ни репозиторий — поля уходили бы в `payload`, а форма их вообще не знает. Подстановки по ИНН в коде нет. Поэтому миграции нет, а работа — провести поля по цепочке и добавить провайдера. Два среза:

- **13.1 (бэкенд):** поля в `Counterparty`, DTO создания и правки (с проверкой форматов кодов), `createCounterpartyExtended`/`updateCounterpartyExtended` через общий список полей, `TABLE_SPECS.counterparties` + `projectCounterparty` + `COLUMNS` репозитория; провайдер подсказки (`InnSuggestProvider`: `Noop…` и `DaData…` с `AbortSignal.timeout`), служба `CounterpartySuggestService`, ручка `GET counterparties/suggest` под `counterparties.write` выше `counterparties/:id`; ключ `DADATA_API_KEY` (пусто — провайдер выключен); статьи ошибок `inn_not_found`, `inn_suggest_unavailable`.
- **13.2 (фронт):** типы и API клиента, форма контрагента разделами (основное, реквизиты, адреса, руководитель, договор и менеджер) с кнопкой «Заполнить по ИНН», карточка — реквизиты словами.

**Tech Stack:** NestJS, Postgres (`crm.counterparties`), `class-validator`, Next.js, `@trudskill/ui`.

**Spec:** `TZ_TRUDSKILL_CDOPROF_MIGRATION.md` §4 (сущность «Контрагент»), §16 (`/counterparties/:id/profile` расширен, `/counterparties/suggest`), §17 (`crm.counterparties` расширить), I.1.4 (карточка CDOPROF), В9 («ручной ввод в MVP + провайдер»).

## Global Constraints

- Миграций нет: колонки созданы 0106. Контракты и права только добавляются; ручка подсказки — под существующим `counterparties.write`.
- Внешний вызов — со сроком (`outbound-deadline`); ключ — только в окружении, в ответы и журнал не попадает.
- Импортные коды бывают грязными: проекция не роняет строку на кривой дате договора — значение уходит в `payload`, как кривой ИНН.

## Решения (журнал РМ трекера)

- **РМ112.** Реквизиты — без миграции: колонки 0106 уже есть, поля проводятся по цепочке «сущность → DTO → служба → проекция → репозиторий». Логотип контрагента (`branding`) — не в этом срезе: он нужен только брендированию портала, которого у портала заказчика пока нет (записано в журнал как отложенное, P1).
- **РМ113.** Провайдер подсказки выбирается наличием ключа `DADATA_API_KEY` в окружении (пусто — `noop`, ручка отвечает 503 `inn_suggest_unavailable` со статьёй «введите вручную»). Ключ на весь стенд, а не на центр в `integration.credentials`: у пилота один центр; ключ центра — P1. Ответ подсказки — плоский, с именами полей сущности (`name`, `shortName`, `kpp`, `ogrn`, …, `legalAddress`, `directorName`), чтобы форма подставляла его без перевода. Код «не найдено» — `inn_not_found` (404) по ТЗ; «провайдер недоступен» — `inn_suggest_unavailable` вместо общего `provider_unavailable`, чтобы у статьи был точный совет.
- **РМ114.** Менеджер контрагента — идентификатор сотрудника без серверной проверки (как ответственный группы, МГ-B1); выбор — из списка сотрудников на форме.

## Review Focus

1. Правка одного реквизита (`null`) очищает только его — остальные не трогаются.
2. Импортная дата договора «31.02.2025» не роняет запись снимка — уходит в `payload`.
3. Ключ не задан — ручка честно говорит «подстановка не подключена», а не 500.
4. DaData ответила пустым списком — 404 `inn_not_found`; ответила ошибкой или молчит дольше срока — 503.
5. `GET counterparties/suggest` не перехватывается маршрутом `counterparties/:id`.

---

## Task 1: срез 13.1 — бэкенд

**Files:** `mvp/mvp.types.ts`, `mvp/create-counterparty-extended.dto.ts`, `mvp/update-counterparty-extended.dto.ts`, `mvp/counterparties/counterparty-requisites.ts` (новый), `mvp/mvp.service.ts`, `migration/backfill/normalized/normalized-projection.ts` (+ тест), `mvp/infrastructure/repositories/postgres-counterparties.repository.ts`, `mvp/counterparties/inn-suggest.provider.ts` (новый), `mvp/counterparties/counterparty-suggest.service.ts` (+ тест), `mvp/mvp.controller.ts`, `mvp/mvp.module.ts`, `env.schema.ts`, `mvp/mvp.dto-validation.test.ts`, `frontend/src/lib/errors/error-text.ts`.

- [ ] Поля и DTO; общий список `COUNTERPARTY_REQUISITE_FIELDS`; служба создания и правки.
- [ ] Проекция и репозиторий; тест проекции (колонки, кривая дата → `payload`).
- [ ] Провайдер, служба, ручка, ключ окружения; тесты службы и провайдера (фикстура ответа DaData, пусто → 404, ошибка → 503, noop → 503, кривой ИНН → 400).
- [ ] Документация §5.598, `pnpm ci:check`, PR, слияние.

**Acceptance:** реквизиты сохраняются и читаются из колонок; `GET counterparties/suggest?inn=7707083893` при фикстуре DaData отдаёт реквизиты; без ключа — 503 со статьёй.

## Task 2: срез 13.2 — фронт

**Files:** `features/clients/{types,api,hooks,format}.ts`, `client-edit-drawer.tsx`, `client-detail-screen.tsx`, `api.contract.test.ts`, `features/tasks/staff-select.tsx` (переиспользование).

- [ ] Типы и API (`suggestByInn`), контрактный тест.
- [ ] Форма разделами, «Заполнить по ИНН» (подставляет только пустые поля), менеджер из сотрудников.
- [ ] Карточка: реквизиты словами, пустые не показываются.
- [ ] Документация §5.599 (МГ-D1.1–D1.2 ✅ по коду, живая подстановка 🚫 до ключа О11), `pnpm ci:check`, PR, слияние.

**Acceptance:** куратор вводит ИНН, жмёт «Заполнить по ИНН» — пустые поля заполняются, введённые руками не затираются; без ключа — понятное сообщение и ручной ввод.
