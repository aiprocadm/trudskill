# Pillar A Hardening Design

> **Назначение документа.** Спецификация целевого укрепления модуля Pillar A (выдача документов, шаблоны, лицензии, личное дело, публичная QR-верификация) перед пилотом. Совмещает аудит изменений, security-проход (IDOR, public verify, 152-ФЗ, идемпотентность) и runbook для дежурного.
>
> Это **спека**, не план: описывает ЧТО и ПОЧЕМУ, но не разбивает на TDD-задачи. План будет создан отдельным документом `docs/superpowers/plans/2026-05-27-pillar-a-hardening.md` через `superpowers:writing-plans`.

**Базовая ветка:** `main` (после мержа PR #178 Plan C). Работа идёт в `feat/2026-05-27-pillar-a-hardening`.

**Спецификация-источник:** [Pillar A regulated training design](2026-05-22-regulated-training-foundation-design.md). Этот документ её НЕ заменяет, а добавляет операционный слой.

---

## 1. Контекст и мотивация

Pillar A собран за 4 дня пятью PR-ами (#173–#178): foundation + HTTP endpoints + admin commissions + course editor tabs (Plan A) → 8 типов шаблонов + 10 категорий переменных + журнал выдачи + групповые приказы (Plan B) → QR-верификация + revoke/reissue + лицензии центра + личное дело ученика (Plan C).

В коде это:

- `apps/backend/src/modules/documents/` — главный сервис ~1019 строк, 43 эндпоинта в одном контроллере, плюс публичный `public-verify.controller.ts` без guards.
- `apps/backend/src/modules/org/licenses.*` — новый модуль (Plan C).
- `apps/backend/src/modules/mvp/learner-pdf-card.service.ts` — личное дело (Plan C).
- Миграции 0032–0037, в т.ч. 0036 `learners_personal_data` (ПДн по 152-ФЗ).

Код горячий, авторы помнят контекст — оптимальное окно для hardening'а. Без него нельзя запускать пилот с реальными ПДн учеников.

---

## 2. Scope

### 2.1 Что попадает в работу

1. Backend `documents/*`, `org/licenses.*`, `mvp/learner-pdf-card.service.ts`, `documents/public-verify.controller.ts`.
2. Миграции 0032–0037 (read-only анализ, в т.ч. на индексы и constraints).
3. Аудит-эмиттеры через существующий `AuditService` (см. §3).
4. Документация: новый runbook (§5) или секция в существующем `operations-runbook.md` (решается при написании, исходя из конвенций репо).

### 2.2 Что НЕ попадает в работу (явно YAGNI)

- Phase 1 (magic link, learner home) — устаканилось, не трогаем.
- Frontend Pillar A (`/admin/issuance-journal`, `/admin/licenses`, `revoke-reissue-modal`, `verify-page`) — отдельный фронт-sprint, если понадобится. Сейчас focus на backend и публичных поверхностях. Исключение: на странице `/verify/[token]` уточняется текст ошибки в response (например, корректное сообщение про rate limit) — это часть hardening'а public verify.
- Большие рефакторинги типа «разбить 1019-LOC service». Если файл мешает — выделить **только** минимально необходимое (audit-emitter wrapper), не больше.
- §4.3 Course Viewer (V1 Phase 1 §4.3) — следующая фича, отдельный трек.
- Sentry, централизованный logger, CI quality gates на coverage threshold — это «approach B» из брейнсторминга, отдельный спек.
- Нагрузочное тестирование Pillar A — Phase 11 в роадмапе.

### 2.3 Definition of Done

- Все state-changing эндпоинты Pillar A пишут структурированный audit-event с обязательными полями (actor, tenant, target, action, result, correlationId).
- Критичные мутации (revoke, reissue, finalize, group_order_issued, certificate_issued_via_order, archive, license CRUD) используют `auditService.writeCritical()` (awaited), а не fire-and-forget `write()`.
- Публичный `/verify/:token` имеет: rate limit per IP, проверку токена в константное время, ограниченный response без ПДн, negative tests на malformed/expired/revoked/replay/info-leak.
- Каждый `:id`-эндпоинт в `documents/*` и `org/licenses/*` прошёл IDOR-чек: тенант-скоупинг проверен **в сервисе**, не только в guard. На каждый объект есть cross-tenant negative test, ожидающий 404 (не 403).
- ПДн (поля `learners_personal_data` из 0036) маскируются в `audit.old_values/new_values`. Тест подтверждает, что audit-event при изменении ПДн не содержит самих ПДн в чистом виде.
- Идемпотентность `documents/generate/batch` и `admin/documents/group-orders` подтверждена интеграционным тестом на параллельные запросы с одним idempotency key.
- Runbook содержит 5 сценариев в едином формате «Симптом → Проверки → Действия → Verify» (см. §5).
- Каждая Plan B/C мутация имеет `*.http.integration.test.ts` (минимум — happy path + один error path).

### 2.4 Что НЕ входит в DoD (намеренно)

- Покрытие unit-тестами выше какого-то процентного порога. Цель — целевые тесты на риск-зоны, не метрика покрытия.
- Изменения публичного API контракта (`api-contracts/`). Только внутренние правки + новые тесты + audit-events + rate-limit.

---

## 3. Audit-trail архитектура

### 3.1 Решение: использовать существующий `AuditService`

`apps/backend/src/modules/audit/audit.service.ts` уже даёт:

- БД-таблицу `audit.audit_log` с полями: `tenant_id`, `actor_id`, `action`, `entity_type`, `entity_id`, `old_values` (jsonb), `new_values` (jsonb), `metadata` (jsonb), `request_id`, `ip`, `user_agent`, `created_at`.
- `write()` — fire-and-forget (для нечастых CRUD по справочникам).
- `writeCritical()` — `await`-ed, для критичных мутаций. При падении БД промис rejects, что заметно в логах.
- `correlationId` пробрасывается через `metadata.correlation_id`.
- `list(tenantId)` с защитой от cross-tenant read (пустой `tenantId` возвращает `[]`).

Текущее покрытие в Pillar A (по grep `documents.service.ts`): `template_created`, `template_updated`, `document_task` lifecycle, `group_order_issued`, `certificate_issued_via_order`. Все используют `write()` (fire-and-forget).

### 3.2 Gap analysis

В плане будет таблица `действие → текущий статус → что добавить` для всех эндпоинтов:

| Эндпоинт / действие                               | Audit сейчас                          | Что нужно                                              |
| ------------------------------------------------- | ------------------------------------- | ------------------------------------------------------ |
| `templates/*` (`create`, `update`)                | ✅ `template_created/updated` (write) | проверить archive/unarchive/set-current-version        |
| `template-versions/:id/activate`, parse-variables | проверить                             | добавить, если нет                                     |
| `template-variables` CRUD                         | проверить                             | добавить                                               |
| `template-bindings` CRUD                          | проверить                             | добавить                                               |
| `documents/generate` (одиночная)                  | проверить                             | добавить с `writeCritical`                             |
| `documents/generate/batch`                        | частично через `document_task`        | добавить итоговый event с `writeCritical`              |
| `documents/:id/finalize`                          | проверить                             | **критично, `writeCritical`**                          |
| `documents/:id/archive`                           | проверить                             | **`writeCritical`**                                    |
| `document-tasks/:id/retry`, `cancel`              | проверить                             | добавить                                               |
| `numbering-rules/:id/activate`, `deactivate`      | проверить                             | добавить                                               |
| `admin/documents/group-orders`                    | ✅ `group_order_issued` (write)       | перевести на `writeCritical`                           |
| revoke / reissue (Plan C)                         | проверить                             | **критично, `writeCritical`**                          |
| `org/licenses` CRUD                               | проверить                             | добавить                                               |
| `learner-pdf-card` чтение                         | нет                                   | добавить access-лог (`learner.personal_data_accessed`) |
| `/verify/:token` (public)                         | нет                                   | **обязательно** — кто проверял, когда, с какого IP     |

В плане каждая строка станет TDD-задачей: «прочитать код → подтвердить наличие/отсутствие audit-call → добавить тест → добавить вызов».

### 3.3 Правило `write` vs `writeCritical`

- **`writeCritical` (awaited):** меняет статус/нумерацию выданного документа; создаёт/отзывает/перевыпускает документ; меняет лицензию или права; происходит на публичных эндпоинтах; массовые операции (group order, batch).
- **`write` (fire-and-forget):** CRUD по справочникам (шаблоны, переменные, биндинги, numbering rules), где потеря одной audit-записи не делает невозможной forensic-реконструкцию.

Правило живёт в коде как docstring у `AuditService.write` / `writeCritical`, одной строкой каждый. Отдельного документа не заводим.

### 3.4 Обязательные поля для критичных событий

Все `writeCritical` обязаны заполнить:

- `actorId` — кто инициировал (или `system` для cron/webhook).
- `tenantId` — никогда не пусто.
- `requestId` + `correlationId` — для трассировки через логи. Уже идут через `ctx`.
- `ip` + `userAgent` — для public action'ов (`/verify/:token`). В плане проверим, что `documents-request-persistence.interceptor.ts` пробрасывает их в `ctx`.

### 3.5 Тест-паттерн

```ts
it('emits writeCritical when revoking document', async () => {
  await service.revoke(documentId, { actorId, tenantId, reason, ctx });
  const events = await audit.list(tenantId);
  expect(events).toContainEqual(
    expect.objectContaining({
      action: 'documents.revoked',
      entityId: documentId,
      actorId,
      oldValues: expect.objectContaining({ status: 'issued' }),
      newValues: expect.objectContaining({ status: 'revoked' })
    })
  );
});
```

`AuditService` хранит in-memory копию `this.records` — этого достаточно для тестов без БД.

---

## 4. Security checklist

### 4.1 IDOR (Insecure Direct Object Reference)

**Угроза:** админ тенанта B имеет permission `documents.write`, делает revoke документа тенанта A через прямой `:id`. Guard разрешит (право есть), service не проверит (`WHERE id=$1` без `AND tenant_id=$2`).

**Тест-паттерн на каждый `:id`-эндпоинт:**

1. Создать объект в тенанте A.
2. Аутентифицироваться как пользователь тенанта B с **правильным** permission.
3. Попытаться прочитать/изменить/удалить объект A.
4. Ожидать 404 (не 403 — чтобы не leak'ать существование).

**Зона покрытия:**

- `documents/templates/:id` (все методы)
- `documents/template-versions/:id` (все методы)
- `documents/template-variables/:id`, `template-bindings/:id`
- `documents/documents/:id/finalize`, `archive`, `download`
- `documents/document-tasks/:id/retry`, `cancel`
- `documents/numbering-rules/:id/activate`, `deactivate`
- revoke / reissue (Plan C)
- `org/licenses/:id`
- `mvp/learner-pdf-card/:learnerId` (если эндпоинт принимает id; путь уточняется в плане при чтении актуального main)

**Объём:** ~10–12 cross-tenant negative tests + точечные правки сервисов (`assert(entity.tenantId === ctx.tenantId)` или `where tenant_id = $1`).

### 4.2 Public `/verify/:token` hardening

| Угроза                              | Митигация                                                                                                                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Brute-force enumeration токенов     | Rate limit per IP: 10 req/min на `/verify/*`. `@nestjs/throttler` или существующий механизм (в плане сверяемся с тем, что уже используется в `iam/`).                           |
| Timing attack при сравнении токенов | `crypto.timingSafeEqual`, не `===`. Проверить текущий `public-verify.controller.ts`.                                                                                            |
| Information leak в response         | Ответ — только: организация-эмитент, тип документа, дата выдачи, номер, статус (issued/revoked/archived). **НЕ возвращать** ФИО, СНИЛС, паспорт, email, телефон, дату рождения. |
| Замена токена на чужой документ     | Энтропия токена ≥128 бит (16 байт минимум; 32 байта base64url предпочтительно). Проверить миграцию 0033 и код генерации.                                                        |
| Доступ к revoked документу          | Статус `revoked` + дата отзыва. Причину и actor НЕ раскрываем.                                                                                                                  |
| TTL токена                          | Решение: токен живёт всё время существования документа, не expires. Соответствует Pillar A спеке.                                                                               |
| Replay/CSRF                         | GET-only, без cookie/session. Уже так.                                                                                                                                          |

**Тесты:** на каждую угрозу — 1 integration test. Итого 6–7 тестов.

### 4.3 Личные данные (152-ФЗ) / migration 0036

1. **Список ПДн:** прочитать миграцию `0036_learners_personal_data.sql` → составить полный список полей (ожидаемо: ФИО, СНИЛС, паспорт, email, телефон, дата рождения; уточняется при чтении).
2. **Право чтения:** каждый запрос идёт через сервис, проверяющий permission + tenant scope. Списочное чтение — только админ центра, личный профиль — только сам ученик.
3. **Логи не содержат ПДн.** В `auditService.newValues/oldValues` для ПДн-полей пишем:
   - либо маску (`***`),
   - либо хеш (sha256 значения, для возможности сравнения «изменилось/нет»),
   - либо вообще опускаем поле, оставляя только `entityId` и факт изменения.
     Конкретное решение фиксируется в плане. По умолчанию — маска `***`, т.к. не нужен поиск.
4. **152-ФЗ запрос на удаление:** процедура описана в runbook §5.4.

**Тесты:**

- 1 тест «audit-event при изменении ПДн не содержит самих ПДн в `newValues`».
- 1 тест «учёт тенанта A не может прочитать ПДн ученика тенанта B через `learner-pdf-card`».
- 1 тест на удаление ПДн (когда сделаем процедуру в runbook).

### 4.4 Идемпотентность group-orders и batch-generate

Идемпотентность group-orders реализована в PR #176/#177 (см. memory). Для `documents/generate/batch` наличие idempotency не подтверждено — проверяется в плане; если нет, реализуется.

**Тесты:**

- 2 параллельных POST на `admin/documents/group-orders` с одним idempotency key → ровно один issuance, второй возвращает тот же ID.
- 2 параллельных POST на `documents/generate/batch` с одним idempotency key → аналогично.
- 2 параллельных revoke на один документ → один revoke, второй 409 или idempotent (выбираем в плане).

**Реализация:** скорее всего нужен unique constraint на `(tenant_id, idempotency_key)` в БД. План пропишет конкретно, если ещё нет.

---

## 5. Runbook

Документ `docs/runbooks/pillar-a-incidents.md` (либо отдельной секцией в `docs/operations-runbook.md` — решается при написании). Единый формат: **Симптом → Проверки → Действия → Verify**.

### 5.1 «Документ не выдался после завершения курса»

- **Симптом:** ученик завершил курс, документа нет в журнале.
- **Проверки:** `document_tasks` по `enrollmentId` → найти запись `status=failed`; смотреть `error`; смотреть audit `documents.document_task_*` events; смотреть worker-логи.
- **Действия:** `POST /documents/document-tasks/:id/retry`. Если повторно падает — escalate (детали в плане).
- **Verify:** появилась `documents.generated`, audit-event `documents.document_issued`, ученик видит документ в кабинете.

### 5.2 «Нужно отозвать ошибочно выданный документ (массовая ошибка)»

- **Симптом:** групповой приказ выдал документы с неправильным шаблоном/датой — нужно отозвать N штук.
- **Проверки:** найти `group_order_id` в журнале → перечислить связанные `documents.generated`.
- **Действия:** для каждого — revoke с указанием reason; при необходимости — reissue с правильным шаблоном.
- **Verify:** audit показывает `documents.revoked` для каждого; QR-верификация возвращает `revoked`; учёт переаттестации (если был) сброшен.

### 5.3 «QR-проверка возвращает "не найдено" для валидного документа»

- **Симптом:** ученик/работодатель сканирует QR — verify-страница говорит «не существует».
- **Проверки:** токен в URL → найти в БД; если найден, но статус `revoked`/`archived` — это правильное поведение; если не найден — проверить миграцию 0033 и логику генерации в `documents.service`.
- **Действия:** если документ есть, но `archived` без повода — restore. Если QR битый — reissue с новым токеном.
- **Verify:** повторное сканирование возвращает корректный ответ.

### 5.4 «Запрос ПДн от ученика (152-ФЗ): удалить мои данные»

- **Симптом:** ученик прислал письменное требование удаления ПДн.
- **Проверки:** совпадение личности; есть ли действующие документы (нельзя полностью удалить ученика, у которого активные удостоверения — 273-ФЗ требует хранения N лет).
- **Действия:**
  1. Если документов нет — `DELETE` ученика с каскадом.
  2. Если документы есть — анонимизация: ФИО → «Удалено по запросу», паспорт/СНИЛС/email/телефон → `NULL`, но удостоверения остаются с прежним номером и датой.
  3. Audit-event `learner.personal_data_erased` с `actorId = admin` (writeCritical).
- **Verify:** ученик не появляется в поиске; документы остаются в реестре; API ответы не содержат ПДн.

### 5.5 «Подозрение на компрометацию admin-аккаунта (массовый revoke)»

- **Симптом:** в журнале выдачи много revoke за короткий период от одного `actorId`.
- **Проверки:** audit-events этого actor'а за период; `ip`/`userAgent` в audit; сопоставить с известными активностями.
- **Действия:** rotate magic-link; временно убрать `documents.write` permission; ручной reissue всех revoked-by-attacker документов.
- **Verify:** revoke-поток прекратился; есть audit-event `iam.permission_revoked`; восстановленные документы валидны через QR.

---

## 6. Группировка работ и порядок

### 6.1 Последовательность шагов

1. Audit gap analysis (написать gap-таблицу из §3.2 в файле плана) — 0.5 дня.
2. `write` → `writeCritical` для критичных + новые audit calls — 0.5 дня + тесты.
3. IDOR negative tests + tenant-scoping fixes в сервисах — 1.5 дня.
4. Public verify hardening (rate-limit, timing-safe, response surface) — 1 день.
5. ПДн / 152-ФЗ слой (маски в audit, права чтения, runbook §5.4) — 1 день.
6. Idempotency concurrency tests — 0.5 дня.
7. Runbook (5 сценариев) — 0.5 дня.
8. Финальный smoke (ручной прогон по runbook) — 0.5 дня.

**Итого:** ~7–8 рабочих дней одной парой рук.

### 6.2 Группировка в PR

- **PR-1: Audit completeness** (шаги 1–2): gap'ы в audit, переход критичных на `writeCritical`. ~10–15 файлов, ~200 строк.
- **PR-2: Security hardening** (шаги 3–6): IDOR fixes, public verify, ПДн, idempotency. ~20–25 файлов, ~500 строк.
- **PR-3: Runbook + smoke** (шаги 7–8): docs + чек-лист. ~1 файл.

PR-1 и PR-2 не блокируют друг друга. PR-3 ждёт обе.

### 6.3 Риски

| Риск                                                                                                            | Вероятность | Митигация                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------- |
| При IDOR-проверке найдём, что `tenantId` не проверяется в сервисе на некоторых эндпоинтах (реальная уязвимость) | Средняя     | Фиксим в той же PR-2; если уязвимость серьёзная — отдельный hotfix-merge сразу в `main` без ожидания остального            |
| `AuditService` не справляется под нагрузкой (in-memory `records[]` растёт без cleanup)                          | Низкая      | В плане — задача проверить наличие cleanup. Если нет — записать в follow-ups (out of scope этой работы)                    |
| Rate-limit конфликтует с интеграционным окружением QA                                                           | Низкая      | Конфигурируемый через env, default = высокий лимит в dev/test                                                              |
| ПДн-анонимизация ломает существующие выданные документы                                                         | Средняя     | Тесты на сохранение `number/date/issuer`; ПДн остаются только в `learners_personal_data`; runbook §5.4 проверяется в smoke |
| Срочный production revoke во время hardening'а                                                                  | Низкая      | Code-path revoke не меняется концептуально, только добавляются проверки и audit. Hotfix всегда возможен                    |
| Раздутие `documents.service.ts` (сейчас 1019 LOC) во время работы                                               | Средняя     | Если вырастает до >1100 — выделить **только** audit-emitter wrapper в отдельный файл, не больше                            |

### 6.4 Out-of-scope follow-ups (записать, не делать сейчас)

- Разбить `documents.service.ts` на под-сервисы. Большая отдельная PR — после hardening'а.
- Sentry / Pino / централизованная error-handling политика (approach B из брейнсторминга — отдельный спек).
- Frontend hardening для `/admin/issuance-journal`, `/admin/licenses`, modal-ов revoke. Отдельный фронт-sprint.
- Нагрузочное тестирование Pillar A — Phase 11 в роадмапе.

---

## 7. Открытые вопросы

Решаются при написании плана (нужны для конкретного кода, не для архитектуры):

1. **Расположение runbook'а:** новый `docs/runbooks/pillar-a-incidents.md` или секция в существующем `docs/operations-runbook.md`. Зависит от того, что выберет автор плана при чтении конвенций репо.
2. **Способ маскирования ПДн в audit:** маска `***`, sha256-хеш или полное опускание поля. По умолчанию — маска (см. §4.3), но финал — в плане.
3. **Поведение при конфликте revoke:** второй параллельный revoke возвращает 409 или идемпотентен. План выбирает после чтения текущего `documents.service.revoke`.
4. **Rate-limit механизм:** `@nestjs/throttler` или существующий в `iam/`. Сверяется в плане.

---

## 8. Готовность к плану

После одобрения этого спека:

1. Создаётся `docs/superpowers/plans/2026-05-27-pillar-a-hardening.md` через `superpowers:writing-plans`.
2. План разбивает работу на TDD-задачи по группам PR (см. §6.2).
3. Каждая задача: red-test → green-impl → refactor, как принято в репо.
4. План коммитится отдельной правкой в этой же ветке `feat/2026-05-27-pillar-a-hardening` до начала имплементации.
