# Phase 5 — Уведомления и переаттестации: дизайн

| Поле          | Значение                                                                                                         |
| ------------- | ---------------------------------------------------------------------------------------------------------------- |
| Дата создания | 2026-06-04                                                                                                       |
| Автор         | Brainstorming session (владелец учебного центра + Claude)                                                        |
| Статус        | Утверждён владельцем (design approved 2026-06-04)                                                                |
| Релиз         | Phase 5 (роадмап V1, фаза 5 из 11)                                                                               |
| Источник      | [2026-05-21-cdoprof-v1-roadmap.md](../plans/2026-05-21-cdoprof-v1-roadmap.md) §Phase 5 + хвосты Pillar A         |
| Следующий шаг | План реализации (`superpowers:writing-plans`) — два плана: 5A (фундамент уведомлений) → 5B (цикл переаттестации) |

> **Назначение.** Дать платформе (1) систему отправки писем (сейчас её нет вообще) и (2) цикл переаттестации — автоматическое отслеживание истечения срока действия удостоверений с предложением перезачисления. Документ фиксирует реальное состояние кода, утверждённые владельцем решения, доменную модель, архитектуру и осознанно отложенное.

---

## 1. Реальность кода: что уже есть vs что строим

### 1.1 Уже есть (переиспользуем)

| Возможность                                                                                        | Где                                                                                                                                        |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Внутренние уведомления («колокольчик»): создание/чтение/непрочитанные + live-push по WebSocket     | [communication/notifications.service.ts](../../../apps/backend/src/modules/communication/notifications.service.ts)                         |
| Система доменных событий (`EventEmitter2`, `@OnEvent(..., { async: true })`)                       | [mvp/enrollment-completed.event.ts](../../../apps/backend/src/modules/mvp/enrollment-completed.event.ts)                                   |
| Событие `learning.enrollment_completed` (payload: learner, group, `documentSet[]`) — точка стыка   | [enrollment-completed.event.ts](../../../apps/backend/src/modules/mvp/enrollment-completed.event.ts)                                       |
| Слушатель выдачи документов по `auto_issue_on_completion` — образец listener'а                     | [documents/enrollment-document-issuance.listener.ts](../../../apps/backend/src/modules/documents/enrollment-document-issuance.listener.ts) |
| Очередь фоновых задач (RabbitMQ) с ретраями/backoff/дедупом; есть стаб типа `notification`         | [apps/worker/src/main.ts](../../../apps/worker/src/main.ts)                                                                                |
| Паттерн «срок годности»: `validUntil` + статус `active/expired/revoked` у лицензий                 | [org/licenses.types.ts](../../../apps/backend/src/modules/org/licenses.types.ts), миграция 0035                                            |
| Мета-данные программы на `course_versions` (8 полей: акад. часы, тип, форма аттестации…)           | [migration 0030](../../../apps/backend/migrations/0030_learning_course_program_meta.sql)                                                   |
| `auto_issue_on_completion` в `learning.course_document_sets` — крючок выдачи (туда же штамп срока) | [migration 0030](../../../apps/backend/migrations/0030_learning_course_program_meta.sql) (стр. 84-102)                                     |
| Поля отзыва документа: `revoked_at`, `revoked_by`, `revocation_reason`                             | [documents/documents.types.ts](../../../apps/backend/src/modules/documents/documents.types.ts), миграция 0034                              |
| Контактный e-mail компании-заказчика: `contactEmail`                                               | [mvp/create-counterparty-extended.dto.ts:35](../../../apps/backend/src/modules/mvp/create-counterparty-extended.dto.ts)                    |
| Массовое зачисление (переиспользуем при подтверждении переаттестации)                              | bulk-enrollment (Phase 2 Plan A)                                                                                                           |
| Паттерн «инфра за интерфейсом + выбор по env» (`MVP_PERSISTENCE_BACKEND`, `ANTIVIRUS_SCANNER`)     | [mvp.module](../../../apps/backend/src/modules/mvp/), [antivirus](../../../apps/backend/src/infrastructure/antivirus/)                     |

### 1.2 Строим в Phase 5

| Gap                                                                                     | Слой           | План  | Раздел |
| --------------------------------------------------------------------------------------- | -------------- | ----- | ------ |
| `MailerService` интерфейс + `NoopMailer` (dev/test) + `SmtpMailer` (prod), выбор по env | Backend infra  | 5A    | §4.1   |
| Журнал доставки писем `communication.email_deliveries`                                  | Backend        | 5A    | §3.3   |
| Шаблоны писем: код-дефолты + переопределение в БД (`communication.email_templates`)     | Backend        | 5A    | §3.3   |
| `NotificationDispatcher` — оркестратор: какие каналы/получатели на событие              | Backend        | 5A    | §4.2   |
| Подключение к **существующим** событиям (завершение курса, выдача документа)            | Backend        | 5A    | §3.1   |
| **Новые** точки эмита: приглашение при зачислении, отзыв документа                      | Backend        | 5A    | §3.1   |
| Поле «срок действия, мес» на `course_versions`                                          | Backend (мигр) | 5B    | §3.2   |
| Поле `valid_until` на `generated_documents` + штамповка при выдаче                      | Backend (мигр) | 5B    | §3.2   |
| Таблица «черновики переаттестации» `learning.recertification_drafts`                    | Backend (мигр) | 5B    | §3.2   |
| Планировщик (`@nestjs/schedule`) + advisory-lock; ежедневный скан дат                   | Backend        | 5B    | §4.3   |
| Очередь «нужна переаттестация» в админке + подтверждение → массовое зачисление          | Backend+Front  | 5B    | §3.4   |
| Напоминания о дедлайнах курсов и истечении лицензий (тот же скан)                       | Backend        | 5B    | §3.1   |
| Новые права: `notifications.read/write`, `recertification.read/write`                   | Backend (мигр) | 5A/5B | §5     |

**Вывод:** инфраструктура писем — полностью greenfield; планировщик — единственный новый системный кусок, и он один разблокирует три «датозависимые» фичи. Всё остальное — «дострой проводки» к уже существующим событиям и данным.

---

## 2. Утверждённые владельцем решения

| #   | Вопрос                                  | Решение                                                                                                                                                     |
| --- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Модель переаттестации                   | **Гибрид**: планировщик создаёт _черновик_ предложения; админ подтверждает (→ массовое зачисление) / отклоняет. Система ничего необратимого не делает сама. |
| 2   | Источник срока действия                 | **Per-программа**: «срок, мес» на `course_versions`; при выдаче штампуется `valid_until` = дата завершения + срок.                                          |
| 3   | Шаблоны писем                           | **Код-дефолты + переопределение в БД** (без полноценного UI-редактора пока).                                                                                |
| 4   | Получатели уведомлений о переаттестации | **Слушатель + компания-заказчик + преподаватель/куратор группы**; админ центра всегда видит очередь черновиков.                                             |

**Дефолты (заданы Claude, не раздували интервью):**

- **Провайдер e-mail:** провайдер-независимый `MailerService`, по умолчанию **`NoopMailer`** (как `NoopAntivirusScanner`) → старт без почтового провайдера; реальный SMTP — смена env-флага + ops-задача.
- **Каналы:** e-mail (новый) + внутренние уведомления (существующие). Push в браузере → **Phase 10** (зависит от PWA).
- **Каденс напоминаний:** `90 / 30 / 7` дней до даты (константа, конфигурируема). Применяется к переаттестации, дедлайнам курсов, истечению лицензий.
- **Архитектура:** backend-centric (см. §4), с чистым швом для будущего переноса массовой отправки в worker.

---

## 3. Доменная модель и потоки

### 3.1 Два спусковых крючка уведомлений (ядро дизайна)

Все письма Phase 5 порождаются одним из двух механизмов:

**A. Событийные («что-то произошло») — через `@OnEvent`:**

| Событие                                | Статус крючка                         | Письмо/получатель                 |
| -------------------------------------- | ------------------------------------- | --------------------------------- |
| Зачисление слушателя                   | **новая** точка эмита (bulk + single) | «приглашение на курс» → слушатель |
| `learning.enrollment_completed`        | **существует**                        | «курс завершён» → слушатель       |
| Выдача документа (в issuance-listener) | **существует** (расширяем)            | «документ выдан» → слушатель      |
| Отзыв документа                        | **новая** точка эмита в revoke-flow   | «документ отозван» → слушатель    |

**B. Датозависимые («приближается дата») — через планировщик (ежедневный скан):**

| Скан по                           | Условие                   | Действие                                          |
| --------------------------------- | ------------------------- | ------------------------------------------------- |
| `generated_documents.valid_until` | в пределах `90/30/7` дней | создать **черновик переаттестации** + напоминания |
| `enrollments.planned_end_at`      | в пределах `90/30/7` дней | напоминание о дедлайне курса → слушатель          |
| `org` лицензии `valid_until`      | в пределах `90/30/7` дней | напоминание об истечении лицензии → админ центра  |

### 3.2 Изменения данных (миграция `0047`, всё аддитивно)

```sql
-- 1) Срок действия удостоверения — на уровне программы (course_versions, рядом с program-meta из 0030)
ALTER TABLE learning.course_versions
  ADD COLUMN IF NOT EXISTS recertification_period_months integer,
  ADD CONSTRAINT course_versions_recert_period_chk
    CHECK (recertification_period_months IS NULL OR recertification_period_months > 0);
-- NULL = бессрочно (переаттестация не требуется)

-- 2) Конкретная дата «годен до» — на выданном документе (штампуется при выдаче)
ALTER TABLE documents.generated_documents
  ADD COLUMN IF NOT EXISTS valid_until date;
-- NULL = бессрочный документ; истечение выводится сравнением valid_until с «сегодня» (отдельный статус не храним)

-- 3) Черновик переаттестации (гибрид-модель)
CREATE TABLE IF NOT EXISTS learning.recertification_drafts (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  learner_id text NOT NULL,
  source_document_id text NOT NULL,          -- истекающее удостоверение
  course_version_id text NOT NULL,           -- предлагаемый курс на переаттестацию
  valid_until date NOT NULL,                 -- срок истекающего документа (для сортировки очереди)
  status text NOT NULL DEFAULT 'pending'     -- pending | approved | rejected | superseded
    CHECK (status IN ('pending','approved','rejected','superseded')),
  resulting_enrollment_id text,              -- заполняется при approve (ссылка на созданное зачисление)
  decided_at timestamptz,
  decided_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- идемпотентность: один активный черновик на (слушатель, истекающий документ)
  CONSTRAINT recert_drafts_active_uniq UNIQUE (tenant_id, learner_id, source_document_id)
);

-- 4) Шаблоны писем: переопределения в БД (код задаёт дефолты)
CREATE TABLE IF NOT EXISTS communication.email_templates (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  template_key text NOT NULL,                -- 'enrollment_invite' | 'course_completed' | 'document_issued' | 'document_revoked' | 'recertification_due' | 'course_deadline' | 'license_expiring'
  subject text NOT NULL,
  body text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  CONSTRAINT email_templates_key_uniq UNIQUE (tenant_id, template_key)
);

-- 5) Журнал доставки писем
CREATE TABLE IF NOT EXISTS communication.email_deliveries (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  template_key text NOT NULL,
  recipient_email text NOT NULL,
  recipient_kind text NOT NULL               -- 'learner' | 'employer' | 'curator' | 'admin'
    CHECK (recipient_kind IN ('learner','employer','curator','admin')),
  subject text NOT NULL,
  status text NOT NULL                        -- 'sent' | 'failed' | 'skipped_noop'
    CHECK (status IN ('sent','failed','skipped_noop')),
  provider_message_id text,
  error text,
  related_entity_type text,                  -- 'enrollment' | 'generated_document' | 'recertification_draft' | 'license'
  related_entity_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

> **Замечание о канале уведомлений.** Существующая таблица `communication.notifications` остаётся для «колокольчика» (`channel_code='in_app'`). E-mail трекается отдельным журналом `email_deliveries` — разделение ответственностей: внутреннее уведомление и факт отправки письма — разные сущности. `NotificationDispatcher` (§4.2) при событии может породить и то, и другое.

### 3.3 Штамповка срока при выдаче

`enrollment-document-issuance.listener` уже выдаёт документы по `auto_issue_on_completion`. Расширяем: при создании `generated_document` вычисляем
`valid_until = enrollment.completed_at + course_version.recertification_period_months` (если срок задан; иначе `NULL`). Это единственная точка, где появляется срок — никакой ручной работы.

### 3.4 Поток переаттестации (гибрид)

```
[ежедневный скан]
   └─ находит generated_documents с valid_until в пределах 90/30/7 дней,
      у которых нет активного recertification_draft
        └─ создаёт recertification_draft (status=pending,
           course_version_id = курс, выдавший документ / его актуальная версия)
        └─ NotificationDispatcher шлёт письма: слушатель + заказчик + куратор
        └─ админ видит запись в очереди «Нужна переаттестация»

[админ в очереди]
   ├─ Подтвердить → переиспользуется массовое зачисление (создаётся enrollment),
   │                draft.status=approved, resulting_enrollment_id=…, письмо слушателю «вы перезачислены»
   └─ Отклонить  → draft.status=rejected

[идемпотентность] UNIQUE (tenant, learner, source_document) — повторный скан не плодит дубликаты.
                  Повторные напоминания на рубежах 90/30/7 — по журналу email_deliveries (не слать дважды один рубеж).
```

---

## 4. Архитектура

### 4.1 `MailerService` — провайдер-независимая отправка (зеркало `AntivirusScanner`)

Новый каталог `apps/backend/src/infrastructure/mailer/`:

```ts
export interface EmailMessage {
  to: string;
  subject: string;
  body: string; // text/plain в MVP; html — расширение
  templateKey: string; // для журнала
}
export interface SendResult {
  status: 'sent' | 'failed' | 'skipped_noop';
  providerMessageId?: string;
  error?: string;
}
export interface MailerService {
  send(msg: EmailMessage): Promise<SendResult>;
}
export const MAILER = Symbol('MAILER');
```

- **`NoopMailer`** (dev/test/in-memory по умолчанию): ничего не отправляет, возвращает `{ status: 'skipped_noop' }`. Весь поток (диспетчер, шаблоны, журнал) работает и тестируется без SMTP.
- **`SmtpMailer`** (prod): `nodemailer` поверх `SMTP_*`. Выбор фабрикой по env `NOTIFICATIONS_EMAIL_ENABLED` (default `false`) — точно как `ANTIVIRUS_ENABLED`.
- Новые env (`env.ts` + `.env.example`): `NOTIFICATIONS_EMAIL_ENABLED`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`.

### 4.2 `NotificationDispatcher`

Единая точка «событие → (получатели × каналы)». Резолвит получателей (слушатель / заказчик через `counterparty.contactEmail` / куратор группы / админ), берёт шаблон (override из БД или код-дефолт), подставляет переменные, пишет `email_deliveries` и/или внутреннее уведомление. Изолирован и юнит-тестируем с `NoopMailer`.

### 4.3 Планировщик

- `@nestjs/schedule`, ежедневная cron-задача в бэкенде.
- **Advisory-lock** (`pg_try_advisory_lock`) на время скана → при нескольких инстансах задача выполняется один раз (без двойной рассылки).
- **Детерминизм для тестов:** вся логика — в чистой функции `scan(asOf: Date, …)`, cron лишь передаёт `new Date()`. Тесты вызывают `scan(fixedDate)` напрямую (CLAUDE.md: не `Date.now()` в тестируемой логике).
- **Шов к worker'у:** массовая отправка может позже уехать в worker-очередь (`notification`-job уже есть) — `MailerService` это скрывает; на MVP отправка инлайн.

---

## 5. Разбивка на реализацию (спека одна, кода два плана — как Phase 2/3)

**План 5A — фундамент уведомлений:**
`MailerService` (Noop/SMTP по env) → `email_deliveries` журнал → `email_templates` (код-дефолт + БД-override) → `NotificationDispatcher` → подключение к существующим событиям (завершение, выдача) + новые точки эмита (приглашение при зачислении, отзыв документа). Право `notifications.read/write`. Трио тестов + Noop-транспорт.

**План 5B — цикл переаттестации (+ планировщик):**
Миграция 0047 (срок на `course_versions`, `valid_until` на документе, `recertification_drafts`) → штамповка срока в issuance-listener → `@nestjs/schedule` + advisory-lock + ежедневный скан (переаттестация + дедлайны курсов + истечение лицензий) → очередь «Нужна переаттестация» в админке → подтверждение → массовое зачисление. Право `recertification.read/write`. Навигация — данными в `navigation/model.ts`.

5B стоит на 5A (использует `MailerService` + `NotificationDispatcher`).

---

## 6. Тестирование (канонический трио + специфика)

| Тип                                | Что покрывает                                                                                                               |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Service-unit                       | расчёт `valid_until`; идемпотентность черновиков; резолв получателей; override-резолв шаблона; `scan(asOf)` на разных датах |
| DTO-validation                     | новые запросы: approve/reject черновика, upsert override-шаблона                                                            |
| HTTP-integration (стаб-контроллер) | границы прав `notifications.write`, `recertification.write` (паттерн `mvp.http.integration.test.ts`)                        |
| Транспорт в тестах                 | `NoopMailer` — без реального SMTP; диспетчер проверяется по `email_deliveries`                                              |
| Планировщик                        | детерминированно: `scan(fixedDate)` напрямую, без cron                                                                      |

> **Gotcha-напоминание.** Если в 5B какая-либо коллекция кладётся в in-memory MVP-состояние — зарегистрировать её в [`mvp-collections.ts`](../../../apps/backend/src/modules/mvp/infrastructure/mvp-collections.ts). Черновики переаттестации — отдельная сущность с persistence-backend (зеркало documents-персистентности), а не request-scoped MVP-стейт.

---

## 7. Осознанно вне объёма (defer)

- **Push в браузере (PWA).** → Phase 10 (зависит от PWA-каркаса). Каденс/диспетчер строятся так, чтобы добавить канал позже.
- **PDF «личного дела» слушателя.** Это функция модуля документов, а не уведомлений. → отдельный мелкий план.
- **Полноценный UI-редактор шаблонов писем.** Phase 5 = код-дефолты + override записью в БД. UI-редактор (по образцу шаблонов документов Pillar A) → будущее.
- **Реальный SMTP/почтовый провайдер.** ops-задача: поднять провайдера + `NOTIFICATIONS_EMAIL_ENABLED=true`. По умолчанию `NoopMailer`.
- **Автоматическое перезачисление без подтверждения.** Владелец выбрал гибрид-подтверждение; полный авто-режим не делаем.

---

## 8. Открытые вопросы (решаются в плане, не блокируют)

1. Точные рубежи каденса — дефолт `90/30/7`; вынести в конфиг-константу.
2. Дедлайны курсов в 5B или отдельным под-планом — по умолчанию в 5B (тот же скан), можно отрезать при раздувании.
3. Текст/локаль писем — RU; формат дат — единый helper.
4. Прод-провайдер (SMTP vs SendGrid) — абстрагирован `MailerService`, решается на ops-этапе.
5. Точное имя поля (`recertification_period_months`) — финализируется в плане.
6. **Источник «куратора группы»** для резолва получателя — связь `group → ответственный`. **Дефолт (явно):** если у группы ответственный не задан, письмо куратора не шлётся, а запись остаётся в общей очереди админа (fallback на админа). План уточнит, есть ли уже такая связь в данных или её надо добавить.
