# Спецификация: фундамент регулируемого ДПО — программы, документы, комиссии, лицензии

| Поле          | Значение                                                                           |
| ------------- | ---------------------------------------------------------------------------------- |
| Дата создания | 2026-05-22                                                                         |
| Автор         | Brainstorming session (владелец учебного центра + Claude)                          |
| Статус        | Черновик к утверждению                                                             |
| Релиз         | V1 (расширение pillar A после 2026-05-21 design)                                   |
| Базовая спека | [`2026-05-21-cdoprof-redesign-design.md`](./2026-05-21-cdoprof-redesign-design.md) |
| Следующий шаг | Детальный план реализации (writing-plans)                                          |

> **Назначение документа.** Зафиксировать решения брейнсторм-сессии 2026-05-22 по pillar A — «нормативный фундамент регулируемого ДПО». Спека дополняет базовую от 2026-05-21, не отменяя её. Является основанием для одной фазы реализации (между Phase 3 и Phase 6 в текущем роадмапе).

---

## 1. Контекст

### 1.1 Что было до этой спеки

В V1-спеке от 2026-05-21 заложены 12 базовых функций LMS + 4 кабинета + 21 архитектурное решение. Pillar A (регуляторика регулируемого профессионального обучения) в той спеке отражён частично — упомянуты гос-реестры (§7), удостоверения (§4.4), переаттестации (§9.1). Но **не зафиксированы**:

- Учебная программа как нормативная сущность с обязательными атрибутами регулятора;
- Аттестационная комиссия (состав, подписи);
- Per-course конфигурация набора выходных документов;
- Книга выдачи и реестр программ;
- Лицензии и аккредитации центра;
- QR-проверка подлинности и аннулирование документов.

### 1.2 Что нашлось в коде

Анализ существующей кодовой базы выявил, что инфраструктура документов **существенно зрелее**, чем фиксирует ТЗ §17:

- `documents.templates` + `template_versions` + `template_variables` + `template_bindings` — полная инфраструктура шаблонов с привязками к направлению/курсу/группе;
- `documents.numbering_rules` + `number_reservations` — нумерация с reset-периодами;
- `documents.generated_documents` — реестр выпущенных документов со статусами;
- `documents.document_generation_tasks` — очередь генерации (retry / cancel);
- `enrollment-document-issuance.listener` — автогенерация сертификата на завершение зачисления (BL-007);
- `course_versions` со статусами `draft` / `published` — версионирование курсов;
- UI на `/documents` для управления шаблонами и генерацией.

Это **меняет подход**: задача не «построить систему документов», а **обогатить существующую инфраструктуру регуляторной семантикой**.

### 1.3 Целевое состояние после реализации

Учебный центр получает:

1. **Юридически корректные** программы обучения (часы, виды, категории, нормативная база).
2. **Per-course пакеты документов** — у каждого курса свой набор выходных артефактов: удостоверение, протокол, диплом, свидетельство.
3. **Аттестационную комиссию** с подписями членов, которые автоматически проставляются в документы.
4. **Книгу выдачи** и **реестр программ** как первичные документы центра.
5. **Лицензии и аккредитации** с валидацией, что центр имеет право обучать по выбранному виду.
6. **QR-проверку** для регулятора и работодателей.
7. **Аннулирование и перевыпуск** с историей.
8. **Личное дело ученика** как агрегатор для регулятора.

---

## 2. Scope

### 2.1 Что входит в спеку (11 элементов)

| №   | Элемент                                       | Тип изменения                                                           |
| --- | --------------------------------------------- | ----------------------------------------------------------------------- |
| 1   | Регуляторная мета программы                   | Обогащение `course_versions` + справочники                              |
| 2   | Аттестационная комиссия                       | Новая сущность (2 таблицы)                                              |
| 3   | Per-course конфигурация документов            | Новая таблица `course_document_sets`                                    |
| 4   | Расширение типов шаблонов                     | Enum расширение в `documents.templates.template_type`                   |
| 5   | Категории переменных `program` и `commission` | Расширение `template_variables.category_code`                           |
| 6   | Книга выдачи удостоверений                    | UI-view над `generated_documents` + Excel-экспорт                       |
| 7   | Приказы по группам                            | UI flow + расширение `documents.generated_documents` (групповая выдача) |
| 8   | QR-проверка подлинности                       | Public endpoint + frontend-страница без авторизации                     |
| 9   | Аннулирование и перевыпуск                    | UI + state-machine в `documents.service`                                |
| 10  | Лицензии и аккредитации центра                | Новая таблица + UI в админке + валидация программ                       |
| 11  | Личное дело ученика                           | Секция на `/learners/[id]` + PDF-экспорт                                |

### 2.2 Что НЕ входит (вынесено в другие phases)

| Из чего                                                                              | Куда                                                    |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| Шаблоны email-уведомлений (приглашение, дедлайны, переаттестация, магическая ссылка) | Phase 5 (Уведомления и переаттестации)                  |
| SMS-шаблоны                                                                          | Phase 5 (Could)                                         |
| Шаблоны выгрузки в ФИС ФРДО / ЕИСОТ / Ростехнадзор / НМО                             | Phase 6 (Документы и гос-реестры)                       |
| Шаблоны договоров B2B / B2C, счетов, актов                                           | Phase 7 (Оплаты)                                        |
| Сохраняемые шаблоны Excel-отчётов                                                    | Phase 10 (Excel-конструктор)                            |
| Юридически значимая электронная подпись (НЭП/КЭП)                                    | После решения по BL-011 (открытый вопрос из 2026-05-21) |
| Шаблон загрузки Excel сотрудников (BL-003)                                           | Phase 2 (Админка центра + массовые операции)            |

### 2.3 Принципы scope

- **Опираемся на существующее.** Не пересоздаём `documents.templates`, не дублируем `course_versions`.
- **Расширяем, а не разрушаем.** Все изменения схемы — новые поля и таблицы, нет переименований существующих сущностей.
- **Multi-vertical с первого дня.** Поля поддерживают ОТ, ПБ, НМО, МЧС, обязательные аттестации через справочники, а не enum.
- **Регулятор — первый пользователь.** Каждый элемент проверяется вопросом «это покажут регулятору при проверке?».

---

## 3. Принятые решения

### 3.1 Архитектурные

| #   | Решение                                                                                                              | Обоснование                                                                                                                                                                        |
| --- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Учебная программа = `course_versions` + новая мета, **без отдельной таблицы программ**                               | В коде уже работает версионирование. Каждая публикация `course_version` = «утверждённая программа на дату». Отдельная сущность создала бы дублирование.                            |
| A2  | Аттестационная комиссия — отдельная сущность (`learning.commissions` + `commission_members`)                         | Состав комиссии переиспользуется между курсами и группами. Подписи нужны консистентно во всех документах.                                                                          |
| A3  | Per-course пакет документов — отдельная таблица `learning.course_document_sets`                                      | Один курс выпускает несколько документов в определённом порядке (например: протокол → удостоверение → запись в книгу). Один и тот же шаблон может использоваться в разных пакетах. |
| A4  | Шаблоны типа `diploma`, `attestation`, `reference`, `report` — расширение enum в `documents.templates.template_type` | Инфраструктура шаблонов универсальна; добавление типов не требует новых таблиц.                                                                                                    |
| A5  | Лицензии центра — новая таблица `org.training_licenses` (новая схема `org`)                                          | Не относится к `iam` (это про доступы), не к `crm` (это про клиентов). Логически — про сам центр (tenant metadata).                                                                |
| A6  | Журналы и реестры — read-only views поверх `generated_documents` / `course_versions`                                 | Журнал — это **способ отображения** существующих данных, не отдельный артефакт хранения. Регулятор может получить выгрузку в Excel.                                                |
| A7  | QR-проверка — public endpoint без аутентификации, минимальный набор данных в ответе                                  | Регулятор / работодатель должен проверить подлинность с QR-кода. ПДн в ответе — только то, что уже есть на бумажном удостоверении.                                                 |

### 3.2 Дефолты для регуляторных полей

| Поле                      | Дефолт                                            | Источник                                    |
| ------------------------- | ------------------------------------------------- | ------------------------------------------- |
| Виды подготовки           | `primary` / `repeat` / `target` / `extraordinary` | Приказ Минтруда 26н, ПП 2464 (ОТ)           |
| Категории обучаемых       | `worker` / `specialist` / `manager` / `mixed`     | Типовая классификация для ДПО               |
| Форма обучения            | `in_person` / `distance` / `blended`              | 273-ФЗ ст. 17                               |
| Форма итоговой аттестации | `test` / `exam` / `defense` / `interview`         | Приказ Минобрнауки 499                      |
| Длительность (часы)       | целое число                                       | Академические часы (по ПП 2464 минимум 16ч) |
| Статус документа в QR     | `valid` / `revoked` / `expired`                   | Внутренняя модель                           |

### 3.3 Multi-tenant изоляция

Все новые таблицы (`commissions`, `commission_members`, `course_document_sets`, `org.training_licenses`) **обязательно** имеют `tenant_id text NOT NULL` с FK на `core.tenants(id)`, плюс составные FK с tenant_id для cross-tenant защиты (по образцу `0003_mvp_domain_integrity_hardening.sql`).

QR-endpoint при поиске по document_id **не раскрывает** tenant другого центра — отвечает «документ не найден», если запрос вне tenant (даже public flow).

---

## 4. Архитектура данных

### 4.1 Расширения существующих таблиц

#### `learning.course_versions` — добавляются поля

```sql
ALTER TABLE learning.course_versions
  ADD COLUMN IF NOT EXISTS academic_hours integer,
  ADD COLUMN IF NOT EXISTS training_type text,
  ADD COLUMN IF NOT EXISTS learner_category text,
  ADD COLUMN IF NOT EXISTS study_form text,
  ADD COLUMN IF NOT EXISTS final_assessment_form text,
  ADD COLUMN IF NOT EXISTS regulatory_basis_codes text[],
  ADD COLUMN IF NOT EXISTS program_attachment_file_id text,
  ADD COLUMN IF NOT EXISTS commission_id text;

-- CHECK-constraints для известных значений
ALTER TABLE learning.course_versions
  ADD CONSTRAINT course_versions_training_type_chk
    CHECK (training_type IS NULL OR training_type IN ('primary','repeat','target','extraordinary')),
  ADD CONSTRAINT course_versions_learner_category_chk
    CHECK (learner_category IS NULL OR learner_category IN ('worker','specialist','manager','mixed')),
  ADD CONSTRAINT course_versions_study_form_chk
    CHECK (study_form IS NULL OR study_form IN ('in_person','distance','blended')),
  ADD CONSTRAINT course_versions_final_assessment_chk
    CHECK (final_assessment_form IS NULL OR final_assessment_form IN ('test','exam','defense','interview')),
  ADD CONSTRAINT course_versions_academic_hours_chk
    CHECK (academic_hours IS NULL OR academic_hours > 0);
```

#### `documents.templates.template_type` — расширение enum

В коде это `text` без CHECK-constraint, но добавляем CHECK для известных значений и валидацию в DTO:

```sql
ALTER TABLE documents.templates
  ADD CONSTRAINT templates_type_chk
    CHECK (template_type IN (
      'certificate',  -- удостоверение
      'protocol',     -- протокол итоговой аттестации
      'order',        -- приказ
      'diploma',      -- диплом о профпереподготовке
      'attestation',  -- свидетельство об аттестации
      'reference',    -- справка о прохождении обучения
      'report'        -- отчёт/выгрузка (для гос-реестров)
    ));
```

#### `documents.template_variables.category_code` — расширение

Текущие категории: `learner`, `course`, `group`, `tenant`. Добавляем:

- `program` — поля программы (`{program.hours}`, `{program.training_type}`, `{program.regulatory_basis}`)
- `commission` — поля комиссии (`{commission.chairman.name}`, `{commission.chairman.signature_image}`, `{commission.members[].name}`)
- `enrollment` — поля зачисления (`{enrollment.start_date}`, `{enrollment.end_date}`)
- `document` — мета самого документа (`{document.number}`, `{document.issue_date}`, `{document.qr_url}`)

### 4.2 Новые таблицы

#### `learning.commissions` — аттестационная комиссия

```sql
CREATE TABLE IF NOT EXISTS learning.commissions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  code text NOT NULL,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
```

#### `learning.commission_members` — состав комиссии

```sql
CREATE TABLE IF NOT EXISTS learning.commission_members (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  commission_id text NOT NULL,
  role text NOT NULL
    CHECK (role IN ('chairman','deputy_chairman','member','secretary','external_expert')),
  user_id text REFERENCES iam.users(id),
  external_full_name text,
  external_position text,
  signature_file_id text,
  position_in_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commission_member_identity_chk
    CHECK (user_id IS NOT NULL OR external_full_name IS NOT NULL),
  CONSTRAINT commission_members_commission_tenant_fk
    FOREIGN KEY (tenant_id, commission_id) REFERENCES learning.commissions (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_commission_members_commission
  ON learning.commission_members (tenant_id, commission_id, position_in_order);
```

`signature_file_id` ссылается на `storage.files(id)` — это PNG / SVG-изображение подписи, которое подставляется в шаблоны.

#### `learning.course_document_sets` — пакет документов курса

```sql
CREATE TABLE IF NOT EXISTS learning.course_document_sets (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  course_version_id text NOT NULL,
  template_id text NOT NULL,
  position smallint NOT NULL,
  is_required boolean NOT NULL DEFAULT true,
  auto_issue_on_completion boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT course_document_sets_course_tenant_fk
    FOREIGN KEY (tenant_id, course_version_id) REFERENCES learning.course_versions (tenant_id, id),
  CONSTRAINT course_document_sets_template_tenant_fk
    FOREIGN KEY (tenant_id, template_id) REFERENCES documents.templates (tenant_id, id),
  UNIQUE (tenant_id, course_version_id, position)
);
```

Каждая строка = «этот курс выпускает документ по этому шаблону в таком порядке». Один курс может иметь несколько строк (протокол + удостоверение + диплом).

#### `org.training_licenses` — лицензии и аккредитации центра

```sql
CREATE SCHEMA IF NOT EXISTS org;

CREATE TABLE IF NOT EXISTS org.training_licenses (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  license_type text NOT NULL
    CHECK (license_type IN (
      'edu_license',        -- лицензия Министерства образования / Рособрнадзора
      'mintrud_accreditation',  -- аккредитация Минтруда
      'rostechnadzor_accreditation', -- Ростехнадзор
      'minzdrav_nmo',       -- регистрация Минздрав НМО
      'frdo_registration',  -- регистрация в ФИС ФРДО (номер ОУ)
      'other'
    )),
  license_number text NOT NULL,
  issued_by text NOT NULL,
  issued_at date NOT NULL,
  valid_until date,
  scan_file_id text,
  permitted_training_types text[],
  permitted_directions text[],
  notes text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','suspended','revoked','expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_training_licenses_tenant_status
  ON org.training_licenses (tenant_id, status);
```

`permitted_training_types` — массив видов подготовки, на которые лицензия даёт право (например `{primary,repeat}`).
`permitted_directions` — массив `direction_id`, на которые лицензия даёт право (или пусто — на все).

### 4.3 Изменения в `generated_documents`

Добавляются поля для перевыпуска и связи с приказом:

```sql
ALTER TABLE documents.generated_documents
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_by text,
  ADD COLUMN IF NOT EXISTS revocation_reason text,
  ADD COLUMN IF NOT EXISTS replaced_by_document_id text,
  ADD COLUMN IF NOT EXISTS replaces_document_id text,
  ADD COLUMN IF NOT EXISTS qr_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS group_order_document_id text;

ALTER TABLE documents.generated_documents
  ADD CONSTRAINT generated_docs_status_chk
    CHECK (status IN ('generated','final','archived','revoked'));
```

`qr_token` — случайный URL-safe токен (≥ 22 символа), который попадает в QR-код. Не равен `id` документа — чтобы нельзя было перебрать по последовательным id.

---

## 5. 11 элементов — детально

### 5.1 [1] Регуляторная мета программы

**Что меняется.** Поля в `course_versions` (см. §4.1). Справочников `lookup.regulatory_acts` (новая таблица) с предзаполнением: ПП 2464, ФЗ-116, ФЗ-273, приказы Минтруда, приказы Минздрава, и т.д.

**UI.** В редакторе курса (existing `/courses/[id]/version/[v]/edit`) добавляется раздел «Нормативные параметры»:

- Поля: часы, вид подготовки (select), категория обучаемых (multi-select), форма обучения (select), форма итоговой аттестации (select).
- Multi-select нормативных актов с поиском.
- Загрузка PDF/Word программы как вложения (`program_attachment_file_id`).

**Валидация.** При публикации `course_version` (переход в `published`):

- Часы > 0.
- Вид подготовки заполнен.
- Категория обучаемых заполнена.
- Хотя бы один нормативный акт.
- (см. §5.10) — у центра должна быть активная лицензия, разрешающая этот вид подготовки.

**Тесты.** Property-tests для DTO-валидации; integration-test на публикацию без обязательных полей → 422.

### 5.2 [2] Аттестационная комиссия

**Что меняется.** Новые таблицы `learning.commissions` + `commission_members` (§4.2).

**UI.** Новый раздел в админке `/commissions`:

- Список комиссий (с фильтрами active/archived).
- Карточка комиссии: код, название, описание, список членов.
- Член комиссии: роль (председатель/зам/член/секретарь/внешний эксперт), пользователь системы или внешнее ФИО+должность, файл подписи.
- Drag-n-drop для порядка членов в документе (`position_in_order`).

**Связь с курсом.** В редакторе course_version — поле «Аттестационная комиссия» (select из активных). Сохраняется в `course_versions.commission_id`.

**Переменные шаблона.** Категория `commission` даёт:

- `{commission.code}` / `{commission.name}`
- `{commission.chairman.name}` / `{commission.chairman.position}` / `{commission.chairman.signature}`
- `{commission.members}` — список (для таблицы в протоколе)
- `{commission.secretary.name}` / `{commission.secretary.signature}`

**Тесты.** State-machine для commission status (active ↔ archived); integration-test на привязку курса к archived commission → ошибка.

### 5.3 [3] Per-course конфигурация документов

**Что меняется.** Новая таблица `learning.course_document_sets` (§4.2).

**UI.** В редакторе course_version — таб «Выходные документы»:

- Список строк (position, шаблон, обязательность, авто-выпуск).
- Кнопка «Добавить документ» → modal с выбором шаблона (только те, у которых `template_type` подходит и есть привязка к курсу/направлению).
- Drag-n-drop для порядка.
- Toggle «Авто-выпуск на завершении».

**Изменение в листенере `enrollment-document-issuance.listener`.** Сейчас он генерит один сертификат через `resolveAutoCertificateTemplateBinding`. После изменения:

- Получает все строки `course_document_sets` для course_version, у которых `auto_issue_on_completion = true`, отсортированные по `position`.
- Для каждой генерирует документ через `documents.generateDocument` (последовательно, не параллельно, чтобы нумерация была предсказуема).
- Идемпотентность: `idempotencyKey = enrollment:${enrollmentId}:${templateId}:v1`.
- Если в пакете нет ни одного `auto_issue_on_completion` → лог audit `documents.enrollment_document_set_skipped`.

**Тесты.** Listener: курс с тремя документами → создаются 3 generated_documents в правильном порядке; повторный event → idempotency (3 raises, 0 duplicates).

### 5.4 [4] Расширение типов шаблонов

**Что меняется.** CHECK-constraint на `documents.templates.template_type` (§4.1) + DTO-валидация в `apps/backend/src/modules/documents/documents.dto.ts`.

**UI.** В `/documents/templates` форма создания шаблона — `<select>` с новыми опциями: certificate / protocol / order / diploma / attestation / reference / report.

**Бэк-совместимость.** Существующие шаблоны типа `certificate` остаются. Миграция — pure additive.

**Тесты.** DTO-валидация: создание с неизвестным типом → 400.

### 5.5 [5] Категории переменных `program` / `commission` / `enrollment` / `document`

**Что меняется.** Расширение `template_variables.category_code` (текст-колонка без CHECK; добавляем CHECK с поддерживаемыми значениями).

**Резолвер переменных.** В `documents.service` существует логика подстановки переменных (через `template_variables` + payload генерации). Расширяется resolve-фаза:

```
program.*    → читается из course_versions (по enrollment.course_id → group_courses → course_version_id)
commission.* → читается из commissions + commission_members
enrollment.* → читается из enrollments
document.*   → берётся из текущей generated_documents (включая qr_token → собирается qr_url)
```

**UI.** В `/documents` форма добавления переменной — `<select>` категории + автоподсказка для variable_code на основе категории.

**Тесты.** Unit на resolver: для каждой категории — корректное вычисление при наличии данных и при отсутствии (graceful fallback к пустой строке + audit-warning).

### 5.6 [6] Книга выдачи удостоверений

**Что это.** UI-view (read-only) поверх `generated_documents` для печати / показа регулятору.

**Что меняется.** Новая страница `/admin/issuance-journal`:

- Таблица: №, дата выдачи, ФИО ученика, СНИЛС, программа, часы, № документа, тип документа, статус (valid/revoked).
- Фильтры: период (от-до), тип документа (multi-select), направление, программа, компания-клиент, статус.
- Сортировка по дате выдачи (desc default).
- Экспорт в Excel (через существующий `/exports` infrastructure или новый endpoint).
- Печать (CSS-print).

**Backend.** Новый endpoint `GET /admin/issuance-journal?from=&to=&types=...&status=` — возвращает paginated список из `generated_documents` с join на `learners`, `course_versions`, `documents.templates`.

**Тесты.** Integration: фильтры работают; экспорт в Excel возвращает корректный набор колонок; cross-tenant — пустой результат.

### 5.7 [7] Приказы по группам

**Что это.** Документ типа `order` с категорией переменной `group_learners` (список учеников группы) для подстановки в приказ-таблицу.

**Что меняется.**

- Новая категория переменных `group_learners` (см. §5.5).
- В resolver: при генерации документа типа `order` с привязкой к `study_group` — собирает список learners группы с полями ФИО, СНИЛС, должность, дата зачисления.
- В шаблоне приказа доступно: `{group_learners}` (массив для подстановки в HTML-таблицу через шаблонизатор).
- Новое поле `group_order_document_id` в `generated_documents` (§4.3) — для документов, выпущенных по групповому приказу, ссылка на родительский приказ.
- UI: на странице группы `/groups/[id]` — кнопка «Сгенерировать приказ» с выбором шаблона приказа.

**Связь приказ ↔ удостоверения группы.** При выпуске приказа о выдаче удостоверений по группе:

- Создаётся 1 generated_documents типа `order`.
- Для каждого ученика группы, у которого `enrollment_status = completed` — выпускается удостоверение (если ещё не выпущено), и `group_order_document_id` ставится на id приказа.
- Таким образом из книги выдачи можно сгруппировать удостоверения по приказам.

**Тесты.** Listener / service: для группы из 20 учеников — приказ + 20 связанных удостоверений; idempotency на повторный вызов.

### 5.8 [8] QR-проверка подлинности

**Что это.** Public endpoint `GET /public/verify/{qr_token}` без аутентификации + frontend-страница `/verify/[token]`.

**Что меняется.**

- Поле `qr_token` в `generated_documents` (§4.3). Генерируется при выпуске документа (`crypto.randomBytes(16).toString('base64url')`).
- QR-код в PDF документа: при рендере PDF-шаблона переменная `{document.qr_url}` → `${PUBLIC_BASE_URL}/verify/{qr_token}`; шаблонизатор включает QR-картинку (через библиотеку `qrcode` или встроенную).
- Public endpoint `GET /public/verify/:token`:
  - Не требует auth.
  - Не раскрывает tenant (запрос идёт через index `documents.generated_documents.qr_token` глобально; результат содержит tenant.name для отображения, но не tenant_id).
  - Rate-limit: 30 req/мин на IP.
  - Возвращает: `{ status, learner_full_name, program_title, academic_hours, document_number, issue_date, issuer_name, revoked_at?, revocation_reason? }`.
  - Если `qr_token` не найден → 404 `{ error: 'document_not_found' }`. Если найден, но `status='revoked'` — отвечает с `status: 'revoked'`.
- Frontend `/verify/[token]`:
  - Public-страница (вне ProtectedPage).
  - Показывает карточку: ФИО, программа, часы, № документа, дата выдачи, кто выдал, **статус** (зелёная плашка «Действителен» / красная «Аннулирован»).
  - При revoked — причина и дата.
  - Адаптив для мобильных (QR обычно сканируют со смартфона).

**Security.**

- `qr_token` ≥ 22 символа base64url (≈128 бит).
- Endpoint не возвращает СНИЛС, паспортные данные, email — только то, что есть на бумажном удостоверении.
- Rate-limit защищает от перебора (даже при 128 бит — стандарт).
- Audit: `documents.qr_verification_requested` с partial token (первые 4 символа) для расследований.

**Тесты.** E2E: выпуск → проверка по QR валидна; revoke → проверка показывает revoked; неизвестный token → 404; cross-tenant token → возвращает корректные данные tenant выдавшего.

### 5.9 [9] Аннулирование и перевыпуск

**Что меняется.**

- Новые поля в `generated_documents` (§4.3): `revoked_at`, `revoked_by`, `revocation_reason`, `replaced_by_document_id`, `replaces_document_id`.
- Status enum расширен значением `revoked` (§4.3).
- В `documents.service`:
  - Метод `revokeDocument(tenantId, actorId, documentId, reason)` — переводит в `revoked`, пишет в audit `documents.revoked`.
  - Метод `reissueDocument(tenantId, actorId, originalDocumentId)` — выпускает новый документ с такими же параметрами (template, source_entity), новым номером (через `numbering_rules`), и связывает `replaces_document_id` / `replaced_by_document_id`.

**UI.**

- В книге выдачи (`/admin/issuance-journal`) — у каждой строки меню «Аннулировать» / «Перевыпустить».
- Modal «Аннулирование» — обязательное поле «Причина», кнопки «Аннулировать» / «Отмена», подтверждение.
- Modal «Перевыпуск» — обязательное «Причина» (передаётся в audit), кнопка «Перевыпустить и аннулировать исходный», вывод нового номера.

**Permissions.** Только роли `admin` и `methodist` могут аннулировать (через существующий RBAC). Audit пишется всегда.

**Тесты.**

- State-machine: generated → revoked OK; revoked → revoked → 409 conflict.
- Reissue: новый документ с правильным `replaces_document_id`; исходный → revoked; QR старого показывает revoked.

### 5.10 [10] Лицензии и аккредитации центра

**Что меняется.** Новая схема `org` + таблица `org.training_licenses` (§4.2).

**UI.**

- Новая страница `/admin/licenses` (для роли `admin`):
  - Список лицензий с фильтрами по типу и статусу.
  - Карточка лицензии: тип, номер, выдан, дата, действует до, scan (PDF), разрешённые виды подготовки, разрешённые направления, заметки.
  - Кнопки: «Добавить лицензию», «Отозвать», «Продлить».

**Валидация программ.**

- При публикации `course_version` (переход в `published`) — проверка:
  - У tenant есть хотя бы одна активная лицензия с `permitted_training_types`, включающим выбранный `training_type` курса, **или** `permitted_training_types IS NULL` (универсальная лицензия).
  - Если `permitted_directions` не пуст — `course.direction_id` должен в него входить.
  - Если ни одна активная лицензия не разрешает — публикация блокируется, ошибка `domain_rule_violation { code: 'no_matching_license', detail: 'У центра нет активной лицензии на этот вид подготовки' }`.
- В админке программ: подсказка «Активные лицензии: …» под формой публикации.

**Уведомления.** Лицензия близка к окончанию (`valid_until - 30 days`) — admin получает уведомление (через Phase 5, но триггер на запись `licenses` — здесь же).

**Тесты.**

- Publish без лицензии → 422.
- Publish c лицензией, но не подходящей по типу → 422.
- Истёкшая лицензия (`status = 'expired'`) — не считается активной.

### 5.11 [11] Личное дело ученика

**Что меняется.** Расширение существующей страницы `/learners/[id]` секцией «Учебная история и документы».

**UI.**

- Секция «Учебная история»:
  - Таблица: дата зачисления, программа, направление, длительность (часы), форма обучения, статус (active/completed/failed/withdrawn), даты начала и окончания.
  - Сортировка по дате (desc default).
- Секция «Выданные документы»:
  - Таблица: дата, тип документа, № документа, программа, статус (valid/revoked), QR-URL (для копирования).
  - Кнопки на строку: «Скачать PDF», «QR-страница».
- Кнопка «Экспорт PDF: карточка ученика» — собирает односраничный PDF с агрегированной информацией (полезно для регулятора).

**Backend.** Новый endpoint `GET /learners/:id/pdf-card` — возвращает PDF, собранный из шаблона типа `report` (новый template_type из §5.4).

**Тесты.** Integration: для ученика с 3 enrollments и 5 документами — корректные данные в API ответе; PDF-export 200 (содержимое не проверяем — это шаблон).

---

## 6. Data flow

### 6.1 Полный цикл «программа → курс → выдача»

```
Админ создаёт программу:
  1. На /courses создаёт course + первую course_version (draft)
  2. Заполняет регуляторную мету (§5.1): часы, вид, категория, нормативка
  3. Загружает PDF программы (program_attachment_file_id)
  4. Привязывает комиссию (course_versions.commission_id)
  5. Конфигурирует пакет документов (§5.3): протокол + удостоверение + ...
  6. Жмёт «Опубликовать»
     → Backend проверяет: лицензия активна (§5.10), обязательные поля
     → course_version.status = 'published'

Админ создаёт группу:
  1. /groups: создаёт study_group, привязывает course через group_courses
  2. Загружает Excel учеников (Phase 2) → enrollments создаются

Ученики проходят курс (Phase 1, 3):
  1. Учится на материалах + сдаёт тесты
  2. enrollment.status → 'completed' при выполнении правил
  3. EVENT ENROLLMENT_COMPLETED испускается

Listener выдачи документов (§5.3):
  1. Получает course_document_sets для course_version
  2. Для каждой строки с auto_issue_on_completion = true:
     a. Резервирует номер через numbering_rules
     b. Резолвит переменные (program.*, commission.*, learner.*, document.*)
     c. Рендерит PDF через template + variables
     d. Сохраняет generated_documents
     e. Генерирует qr_token (§5.8)
  3. Audit: documents.enrollment_document_set_issued

Админ генерит приказ по группе (§5.7):
  1. /groups/[id]: «Сгенерировать приказ»
  2. Выбирает шаблон типа 'order'
  3. Generated_document типа 'order' создаётся с {group_learners} списком
  4. Для всех completed enrollments группы — связывает их удостоверения через group_order_document_id

Регулятор / работодатель:
  1. Сканирует QR с удостоверения
  2. Public /verify/[token] показывает: ФИО, программа, часы, № документа, дата, статус
  3. Если revoked — показывает причину

Аннулирование (§5.9):
  1. /admin/issuance-journal: меню «Аннулировать»
  2. Указывает причину
  3. generated_document.status = 'revoked'
  4. QR теперь показывает revoked
  5. Опционально — «Перевыпустить» → новый документ со ссылкой на исходный
```

---

## 7. Безопасность и multi-tenancy

### 7.1 Permissions

| Действие                                           | Роль                                        |
| -------------------------------------------------- | ------------------------------------------- |
| Создание/редактирование программы (course_version) | `methodist`, `admin`                        |
| Публикация программы                               | `methodist`, `admin`                        |
| Управление комиссиями                              | `admin`                                     |
| Управление пакетами документов курса               | `methodist`, `admin`                        |
| Просмотр книги выдачи                              | `methodist`, `admin` (только своего tenant) |
| Аннулирование документа                            | `admin` (только своего tenant)              |
| Перевыпуск документа                               | `admin` (только своего tenant)              |
| Управление лицензиями центра                       | `admin` (только своего tenant)              |
| Просмотр личного дела ученика                      | `methodist`, `admin` (только своего tenant) |
| QR-проверка                                        | public (без auth)                           |

### 7.2 Multi-tenant защита

- Все запросы через `TenantGuard` (существующий) — кроме `/public/verify/*`.
- Cross-tenant FK через составные ключи `(tenant_id, id)` для всех новых таблиц.
- QR-public endpoint: ищет по `qr_token` глобально, но возвращает только данные tenant выпустившего; не раскрывает `tenant_id` напрямую.

### 7.3 Аудит

Каждое из следующих действий пишется в `audit.audit_log`:

- `learning.course_version_published`
- `learning.commission_created` / `commission_archived`
- `learning.commission_member_added` / `commission_member_removed`
- `documents.template_type_extended` (для observability нового enum)
- `documents.document_set_configured`
- `documents.revoked` (с reason)
- `documents.reissued` (с original_id, new_id)
- `documents.qr_verification_requested` (partial token)
- `org.license_added` / `license_revoked` / `license_expired`

### 7.4 ПДн в QR-ответе

QR-проверка показывает только данные, которые **уже есть на бумажном удостоверении** (ФИО, программа, часы, номер, дата, статус). Это согласно ст. 6.1.5 152-ФЗ — обработка ПДн без согласия допустима для целей, на которые ученик согласился при выдаче документа (а согласие на выдачу даётся при зачислении).

---

## 8. Зависимости и совместимость

### 8.1 Связь с phases в роадмапе

| Phase                                        | Что зависит от этой спеки                                                                                                                                                         |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 1 (Минимальный путь ученика)           | ✅ Уже завершён — никакие изменения не требуются                                                                                                                                  |
| Phase 2 (Админка центра + массовые операции) | Эта спека добавляет UI элементов админки (комиссии, лицензии, книга выдачи) — не блокирует Phase 2, но порядок: сначала Phase 2 базовый layout, потом эта спека добавляет разделы |
| Phase 3 (Тестирование и оценивание)          | Независимо                                                                                                                                                                        |
| Phase 4 (Идентификация и прокторинг)         | Независимо                                                                                                                                                                        |
| Phase 5 (Уведомления и переаттестации)       | Спека вводит триггер «лицензия истекает за 30 дней» — реализуется в Phase 5                                                                                                       |
| Phase 6 (Документы и гос-реестры)            | **Сильная зависимость:** Phase 6 выгружает в реестры данные, которые **создаются** в этой спеке. Очерёдность: эта спека → Phase 6.                                                |
| Phase 7 (Оплаты)                             | Независимо                                                                                                                                                                        |
| Phase 8-11                                   | Независимо                                                                                                                                                                        |

### 8.2 Размещение в роадмапе

Эта работа становится **Phase 3.5 — «Фундамент регулируемого ДПО»** (или Phase 4.5, в зависимости от точного порядка). Идёт после Phase 3 (тесты) и до Phase 6 (гос-реестры).

### 8.3 Совместимость с существующим кодом

- **Не ломает** магическую ссылку (Phase 1).
- **Не ломает** «Следующий шаг» (Phase 1).
- **Не ломает** существующие `documents.templates` — новые типы аддитивны, новые переменные аддитивны.
- **Расширяет** `enrollment-document-issuance.listener` — текущая логика «один сертификат» становится частным случаем «пакет с одним документом».

---

## 9. Тестирование

### 9.1 Уровни покрытия

| Уровень             | Что покрывается                                                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Unit (pure)         | Resolver переменных (program/commission/document категории); state-machine для revoke/reissue; правила публикации course_version |
| Integration (DB)    | Все новые таблицы и FK; cross-tenant изоляция; миграции 0029+                                                                    |
| HTTP integration    | Все новые endpoints (Nest harness); RBAC; rate-limit для public verify                                                           |
| E2E (business flow) | Полный цикл: программа → группа → ученики → выдача пакета → QR-проверка → revoke → reissue                                       |

### 9.2 Целевые числа (ориентир)

- ~30 новых unit-тестов (resolver, state-machine, validation).
- ~15 новых integration-тестов (миграции, cross-tenant, listeners).
- ~10 новых HTTP-тестов (endpoints, permissions, rate-limit).
- 2 новых E2E-теста в стиле `business-flows.e2e.test.ts`.

Целевое состояние: backend test count растёт с текущих ~88+ до ~145.

### 9.3 Тесты QR (особо важно)

- Token уникальность (≥ 10000 случайных не пересекаются).
- 404 на неизвестный.
- Rate-limit срабатывает на 31-й запрос с одного IP в минуту.
- Revoked → корректный ответ.
- Cross-tenant token → корректные данные tenant.

---

## 10. Открытые вопросы

| #   | Вопрос                                                                                                                                 | Решает               | Срок                   |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ---------------------- |
| Q1  | Конкретные дефолты `lookup.regulatory_acts` для каждой вертикали                                                                       | Владелец + методолог | До старта реализации   |
| Q2  | Шаблоны (HTML-вёрстка) для удостоверения, протокола, диплома, свидетельства                                                            | Владелец + дизайнер  | Параллельно реализации |
| Q3  | Подписи комиссии — PNG или SVG, ограничения по размеру                                                                                 | Методолог + DevOps   | До UI комиссии         |
| Q4  | Регламент истечения лицензий — что делать с активными курсами при истечении (блокировать публикацию новых vs аннулировать действующие) | Владелец + юрист     | До реализации §5.10    |
| Q5  | QR-URL: `school.<center>.ru/verify/<token>` или общий `verify.cdoprof.ru/<token>` (для SaaS-будущего)                                  | Владелец             | До реализации §5.8     |
| Q6  | Перевыпуск: сохранять старый номер документа или выдавать новый                                                                        | Владелец + юрист     | До реализации §5.9     |

Все вопросы можно начать реализацию **без** их решения (использовать reasonable defaults, перенастроить позже).

---

## 11. Принятие и следующий шаг

После одобрения этой спецификации владельцем:

1. **Детальный план реализации** через `superpowers:writing-plans` — задачи с TDD, файловой структурой, кодом тестов.
2. План будет в `docs/superpowers/plans/2026-05-22-regulated-training-foundation.md`.
3. Реализация **не начинается** до утверждения плана.

Реализация запланирована **после** PR #172 (learner home) и **до** Phase 6 (гос-реестры) в роадмапе. Оценка трудоёмкости — ~49 раб. дней (~8-10 недель команды из 2 человек).
