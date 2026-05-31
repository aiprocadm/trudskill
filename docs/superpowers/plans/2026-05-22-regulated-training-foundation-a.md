# Regulated Training Foundation — Plan A: Programs, Commissions, Document Sets

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заложить нормативный фундамент регулируемого ДПО — добавить регуляторную мета программы к `course_versions`, ввести сущность «Аттестационная комиссия» с подписями членов, и per-course пакет выходных документов. После плана А курсы могут иметь юридически корректные параметры (часы / виды подготовки / категории), к ним привязывается комиссия, и при завершении зачисления выпускается **пакет** документов вместо одного сертификата.

**Architecture:** Расширение существующего `mvp` модуля (NestJS) + новые миграции. Никаких новых модулей не создаём — `mvp` это уже модуль learning-домена. `commission` уже задекларирован как категория переменной шаблона в `documents.service.ts:53`, но без entity — этот план её добавляет. Listener `enrollment-document-issuance.listener` расширяется с «один сертификат» до «пакет документов» (последовательный выпуск из `course_document_sets`).

**Tech Stack:** PostgreSQL (миграции SQL), NestJS + TypeScript (backend), Vitest (тесты), Next.js (frontend), React Query. Используется существующая инфраструктура `documents.*` (templates, numbering, listener), `learning.*` (courses, enrollments), `core.tenants`, `iam.users`, `storage.files`.

**Спецификация:** [../specs/2026-05-22-regulated-training-foundation-design.md](../specs/2026-05-22-regulated-training-foundation-design.md) — §5.1, §5.2, §5.3 (+ часть §5.5 для категорий переменных program/commission).

**Роадмап:** [2026-05-21-cdoprof-v1-roadmap.md](2026-05-21-cdoprof-v1-roadmap.md) — Phase 3.5 (новая фаза между Phase 3 и Phase 6).

**Зависимости перед стартом:**

- PR #172 (learner home) смержен в `main`.
- Ветка плана отрезается от `main`.
- Спека утверждена в коммите `7f5136c`.

**Что НЕ входит в план A (другие планы):**

- Plan B: расширение типов шаблонов (diploma/attestation/...), категории переменных enrollment/document, книга выдачи, приказы по группам.
- Plan C: QR-проверка, аннулирование/перевыпуск, лицензии центра, личное дело ученика.

---

## File Structure

### Create — backend

- `apps/backend/migrations/0029_learning_commissions.sql` — миграция: `learning.commissions` + `learning.commission_members`.
- `apps/backend/migrations/0030_learning_course_program_meta.sql` — миграция: расширение `learning.course_versions` (8 новых полей), создание `lookup` schema + `lookup.regulatory_acts` (с seed), `learning.course_document_sets`.

### Modify — backend (extend existing `mvp` module)

- `apps/backend/src/modules/mvp/mvp.types.ts` — добавить типы `Commission`, `CommissionMember`, `CommissionMemberRole`, `CourseDocumentSetEntry`, `TrainingType`, `LearnerCategory`, `StudyForm`, `FinalAssessmentForm`, `RegulatoryAct`, поля программы на `CourseVersion`.
- `apps/backend/src/modules/mvp/mvp.dto.ts` — DTO для CRUD комиссий, обновления программы, конфигурации `course_document_sets`.
- `apps/backend/src/modules/mvp/mvp.service.ts` — методы: `createCommission`, `updateCommission`, `archiveCommission`, `addCommissionMember`, `removeCommissionMember`, `updateProgramMeta`, `publishCourseVersion` (с валидацией программы), `setCourseDocumentSet`, `getCourseDocumentSet`.
- `apps/backend/src/modules/mvp/mvp.service.test.ts` — unit-тесты для каждого нового метода.
- `apps/backend/src/modules/mvp/mvp.controller.ts` — REST-эндпоинты: `POST/PATCH/DELETE /commissions`, `POST/DELETE /commissions/:id/members`, `PATCH /course-versions/:id/program-meta`, `PATCH /course-versions/:id/publish`, `PUT /course-versions/:id/document-set`.
- `apps/backend/src/modules/mvp/mvp.dto-validation.test.ts` — DTO-валидация новых endpoints.
- `apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts` — HTTP-regression тесты.
- `apps/backend/src/modules/mvp/infrastructure/in-memory-mvp.state.ts` — in-memory implementation: коллекции `commissions`, `commissionMembers`, `courseDocumentSets`.
- `apps/backend/src/modules/mvp/infrastructure/postgres-mvp-persistence.backend.ts` — Postgres-реализация: новые SQL для CRUD.
- `apps/backend/src/modules/documents/documents.service.ts` — расширить resolver переменных: добавить категорию `program` (читает из `course_versions` через `enrollment.course_id → group_courses.course_version_id`).
- `apps/backend/src/modules/documents/enrollment-document-issuance.listener.ts` — заменить `resolveAutoCertificateTemplateBinding` на `resolveCourseDocumentSet` + последовательная генерация всех документов набора.
- `apps/backend/src/modules/documents/enrollment-document-issuance.listener.test.ts` — обновить тесты под мульти-документную выдачу.

### Create — frontend

- `apps/frontend/app/admin/commissions/page.tsx` — страница списка комиссий (admin only).
- `apps/frontend/app/admin/commissions/[id]/page.tsx` — карточка комиссии с членами.
- `apps/frontend/src/features/commissions/types.ts` — типы для UI.
- `apps/frontend/src/features/commissions/api.ts` — REST-клиент.
- `apps/frontend/src/features/commissions/commission-list.tsx` — компонент списка.
- `apps/frontend/src/features/commissions/commission-form.tsx` — форма создания/редактирования.
- `apps/frontend/src/features/commissions/members-editor.tsx` — drag-n-drop редактор членов с подписями.
- `apps/frontend/src/features/commissions/use-commissions.ts` — React Query хуки.
- `apps/frontend/src/features/commissions/commission-list.test.tsx` — тесты компонента.
- `apps/frontend/src/features/course-editor/program-meta-tab.tsx` — таб «Нормативные параметры».
- `apps/frontend/src/features/course-editor/document-set-tab.tsx` — таб «Выходные документы».
- `apps/frontend/src/features/course-editor/types.ts` — типы (если ещё нет).

### Modify — frontend

- `apps/frontend/app/courses/[id]/page.tsx` — встроить вкладки «Нормативные параметры» и «Выходные документы» в редактор курса. Точная локация зависит от того, как организован существующий редактор; задача 11 уточняет.

### Untouched (используется как есть)

- `documents.templates` / `template_versions` / `template_variables` / `template_bindings` — инфраструктура шаблонов.
- `documents.numbering_rules` / `number_reservations` — нумерация.
- `core.tenants`, `iam.users`, `storage.files` — базовые сущности.

---

## Task 1: Migration 0029 — commissions + commission_members

**Files:**

- Create: `apps/backend/migrations/0029_learning_commissions.sql`
- Test: `apps/backend/src/infrastructure/database/mvp-domain-migrations.test.ts` (расширить)

### Спецификация

См. спеку §4.2. Две таблицы:

- `learning.commissions` — атттестационная комиссия (code, name, description, status active/archived).
- `learning.commission_members` — члены с ролями (chairman, deputy_chairman, member, secretary, external_expert), либо `user_id` (внутренний пользователь IAM), либо `external_full_name + external_position` (внешний эксперт). `signature_file_id` — PNG/SVG подписи в storage.

- [x] **Step 1: Создать миграционный файл**

```sql
-- apps/backend/migrations/0029_learning_commissions.sql
-- Stage 11: attestation commissions (Plan A, spec §5.2)

CREATE TABLE IF NOT EXISTS learning.commissions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  code text NOT NULL,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commissions_tenant_code_uniq UNIQUE (tenant_id, code),
  CONSTRAINT commissions_tenant_id_uniq UNIQUE (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_commissions_tenant_status
  ON learning.commissions (tenant_id, status);

CREATE TABLE IF NOT EXISTS learning.commission_members (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  commission_id text NOT NULL,
  role text NOT NULL
    CHECK (role IN ('chairman', 'deputy_chairman', 'member', 'secretary', 'external_expert')),
  user_id text REFERENCES iam.users(id),
  external_full_name text,
  external_position text,
  signature_file_id text,
  position_in_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commission_member_identity_chk
    CHECK (user_id IS NOT NULL OR external_full_name IS NOT NULL),
  CONSTRAINT commission_members_commission_tenant_fk
    FOREIGN KEY (tenant_id, commission_id)
    REFERENCES learning.commissions (tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_commission_members_commission
  ON learning.commission_members (tenant_id, commission_id, position_in_order);
```

- [x] **Step 2: Расширить тест миграций**

В файле `apps/backend/src/infrastructure/database/mvp-domain-migrations.test.ts` добавить новый `describe` блок:

```typescript
describe('migration 0029 — commissions', () => {
  it('creates learning.commissions and commission_members with proper constraints', async () => {
    // arrange: apply migrations up to 0029 in fresh DB
    const db = await createTestDatabase(['0001', '0002', '0003' /* ... */, , '0029']);

    // act: insert valid commission
    await db.query(
      `INSERT INTO learning.commissions (id, tenant_id, code, name) VALUES ($1, $2, $3, $4)`,
      ['cm_1', 't_1', 'OT_2026', 'Аттестационная комиссия ОТ 2026']
    );

    // assert: row exists
    const result = await db.query('SELECT * FROM learning.commissions WHERE id = $1', ['cm_1']);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].status).toBe('active');

    // assert: code uniqueness
    await expect(
      db.query(
        `INSERT INTO learning.commissions (id, tenant_id, code, name) VALUES ($1, $2, $3, $4)`,
        ['cm_2', 't_1', 'OT_2026', 'duplicate code']
      )
    ).rejects.toThrow(/commissions_tenant_code_uniq/);
  });

  it('enforces commission_member identity constraint (user_id or external_full_name)', async () => {
    const db = await createTestDatabase([, /* ... */ '0029']);
    await db.query(
      `INSERT INTO learning.commissions (id, tenant_id, code, name) VALUES ('cm_1', 't_1', 'C1', 'C')`
    );

    // act: neither user_id nor external_full_name → constraint violation
    await expect(
      db.query(
        `INSERT INTO learning.commission_members (id, tenant_id, commission_id, role) VALUES ($1, $2, $3, $4)`,
        ['m_1', 't_1', 'cm_1', 'chairman']
      )
    ).rejects.toThrow(/commission_member_identity_chk/);
  });
});
```

- [x] **Step 3: Прогнать тесты миграций**

Run: `pnpm -F backend test -- mvp-domain-migrations`
Expected: новые describe-блоки → PASS.

- [x] **Step 4: Коммит**

```bash
git add apps/backend/migrations/0029_learning_commissions.sql apps/backend/src/infrastructure/database/mvp-domain-migrations.test.ts
git commit -m "feat(backend): add commissions migration 0029 (learning.commissions + commission_members)"
```

---

## Task 2: Migration 0030 — program meta + lookup acts + course_document_sets

**Files:**

- Create: `apps/backend/migrations/0030_learning_course_program_meta.sql`
- Test: `apps/backend/src/infrastructure/database/mvp-domain-migrations.test.ts` (расширить)

### Спецификация

См. спеку §4.1, §4.2. Содержание миграции:

1. Расширение `learning.course_versions`: 8 новых полей (academic_hours, training_type, learner_category, study_form, final_assessment_form, regulatory_basis_codes, program_attachment_file_id, commission_id) + CHECK-constraints.
2. Новая schema `lookup` + таблица `lookup.regulatory_acts` со seed-данными (ПП 2464, ФЗ-116, ФЗ-273 ст.196, приказ Минтруда 26н, приказ Минздрава 707н).
3. Новая таблица `learning.course_document_sets` с composite FK на `course_versions` и `documents.templates`.

- [x] **Step 1: Создать миграционный файл**

```sql
-- apps/backend/migrations/0030_learning_course_program_meta.sql
-- Stage 12: program meta on course_versions + lookup.regulatory_acts + course_document_sets
-- (Plan A, spec §5.1, §5.3)

-- 1. Lookup schema + regulatory_acts table with seed
CREATE SCHEMA IF NOT EXISTS lookup;

CREATE TABLE IF NOT EXISTS lookup.regulatory_acts (
  code text PRIMARY KEY,
  short_name text NOT NULL,
  full_name text NOT NULL,
  issuing_authority text NOT NULL,
  issued_at date,
  url text,
  applies_to_verticals text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO lookup.regulatory_acts (code, short_name, full_name, issuing_authority, issued_at, applies_to_verticals)
VALUES
  ('PP_2464_2022', 'ПП 2464', 'Постановление Правительства РФ от 24.12.2022 №2464 «О порядке обучения по охране труда»', 'Правительство РФ', '2022-12-24', '{ot}'),
  ('PRIKAZ_26N_2024', 'Приказ Минтруда 26н', 'Приказ Минтруда РФ от 17.01.2024 №26н', 'Минтруд России', '2024-01-17', '{ot}'),
  ('FZ_116_1997', 'ФЗ-116', 'Федеральный закон от 21.07.1997 №116-ФЗ «О промышленной безопасности опасных производственных объектов»', 'Государственная Дума РФ', '1997-07-21', '{pb}'),
  ('PP_2168_2022', 'ПП 2168', 'Постановление Правительства РФ от 29.11.2022 №2168 «О порядке аттестации в области промышленной безопасности»', 'Правительство РФ', '2022-11-29', '{pb}'),
  ('PRIKAZ_707N_2015', 'Приказ Минздрава 707н', 'Приказ Минздрава РФ от 08.10.2015 №707н', 'Минздрав России', '2015-10-08', '{nmo}'),
  ('FZ_273_2012_ART_196', 'ФЗ-273 ст.196', 'Федеральный закон от 29.12.2012 №273-ФЗ «Об образовании в РФ», ст. 196 — ДПО', 'Государственная Дума РФ', '2012-12-29', '{ot,pb,nmo,emergency,other}')
ON CONFLICT (code) DO NOTHING;

-- 2. Extend learning.course_versions
ALTER TABLE learning.course_versions
  ADD COLUMN IF NOT EXISTS academic_hours integer,
  ADD COLUMN IF NOT EXISTS training_type text,
  ADD COLUMN IF NOT EXISTS learner_category text,
  ADD COLUMN IF NOT EXISTS study_form text,
  ADD COLUMN IF NOT EXISTS final_assessment_form text,
  ADD COLUMN IF NOT EXISTS regulatory_basis_codes text[],
  ADD COLUMN IF NOT EXISTS program_attachment_file_id text,
  ADD COLUMN IF NOT EXISTS commission_id text;

ALTER TABLE learning.course_versions
  ADD CONSTRAINT course_versions_training_type_chk
    CHECK (training_type IS NULL OR training_type IN ('primary', 'repeat', 'target', 'extraordinary')),
  ADD CONSTRAINT course_versions_learner_category_chk
    CHECK (learner_category IS NULL OR learner_category IN ('worker', 'specialist', 'manager', 'mixed')),
  ADD CONSTRAINT course_versions_study_form_chk
    CHECK (study_form IS NULL OR study_form IN ('in_person', 'distance', 'blended')),
  ADD CONSTRAINT course_versions_final_assessment_chk
    CHECK (final_assessment_form IS NULL OR final_assessment_form IN ('test', 'exam', 'defense', 'interview')),
  ADD CONSTRAINT course_versions_academic_hours_chk
    CHECK (academic_hours IS NULL OR academic_hours > 0);

-- FK to commissions (composite, tenant-aware)
ALTER TABLE learning.course_versions
  ADD CONSTRAINT course_versions_commission_tenant_fk
    FOREIGN KEY (tenant_id, commission_id)
    REFERENCES learning.commissions (tenant_id, id);

-- 3. course_document_sets
CREATE TABLE IF NOT EXISTS learning.course_document_sets (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES core.tenants(id),
  course_version_id text NOT NULL,
  template_id text NOT NULL,
  position smallint NOT NULL,
  is_required boolean NOT NULL DEFAULT true,
  auto_issue_on_completion boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT course_doc_sets_course_tenant_fk
    FOREIGN KEY (tenant_id, course_version_id)
    REFERENCES learning.course_versions (tenant_id, id) ON DELETE CASCADE,
  CONSTRAINT course_doc_sets_template_tenant_fk
    FOREIGN KEY (tenant_id, template_id)
    REFERENCES documents.templates (tenant_id, id),
  CONSTRAINT course_doc_sets_position_uniq UNIQUE (tenant_id, course_version_id, position),
  CONSTRAINT course_doc_sets_position_chk CHECK (position >= 0)
);

CREATE INDEX IF NOT EXISTS idx_course_doc_sets_course_version
  ON learning.course_document_sets (tenant_id, course_version_id, position);
```

- [x] **Step 2: Расширить тест миграций**

```typescript
describe('migration 0030 — program meta + course_document_sets', () => {
  it('adds academic_hours and training_type to course_versions with CHECK constraints', async () => {
    const db = await createTestDatabase([, /* ... */ '0030']);

    // seed: tenant + course + course_version
    await db.query(`INSERT INTO core.tenants (id) VALUES ('t_1')`);
    await db.query(
      `INSERT INTO learning.courses (id, tenant_id, code, title) VALUES ('c_1', 't_1', 'C1', 'Course')`
    );
    await db.query(
      `INSERT INTO learning.course_versions (id, tenant_id, course_id, version_no, status, academic_hours, training_type)
       VALUES ('cv_1', 't_1', 'c_1', 1, 'draft', 16, 'primary')`
    );

    // assert: valid insert succeeds
    const ok = await db.query(
      `SELECT academic_hours, training_type FROM learning.course_versions WHERE id = 'cv_1'`
    );
    expect(ok.rows[0].academic_hours).toBe(16);
    expect(ok.rows[0].training_type).toBe('primary');

    // assert: invalid training_type rejected
    await expect(
      db.query(
        `INSERT INTO learning.course_versions (id, tenant_id, course_id, version_no, status, training_type)
         VALUES ('cv_2', 't_1', 'c_1', 2, 'draft', 'unknown')`
      )
    ).rejects.toThrow(/course_versions_training_type_chk/);

    // assert: academic_hours must be > 0
    await expect(
      db.query(
        `INSERT INTO learning.course_versions (id, tenant_id, course_id, version_no, status, academic_hours)
         VALUES ('cv_3', 't_1', 'c_1', 3, 'draft', 0)`
      )
    ).rejects.toThrow(/course_versions_academic_hours_chk/);
  });

  it('seeds 6 regulatory_acts with expected codes', async () => {
    const db = await createTestDatabase([, /* ... */ '0030']);
    const result = await db.query(`SELECT code FROM lookup.regulatory_acts ORDER BY code`);
    expect(result.rows.map((r) => r.code)).toEqual([
      'FZ_116_1997',
      'FZ_273_2012_ART_196',
      'PP_2168_2022',
      'PP_2464_2022',
      'PRIKAZ_26N_2024',
      'PRIKAZ_707N_2015'
    ]);
  });

  it('enforces course_document_sets unique position per course_version', async () => {
    const db = await createTestDatabase([, /* ... */ '0030']);

    // seed: tenant + course + course_version + template
    await db.query(`INSERT INTO core.tenants (id) VALUES ('t_1')`);
    await db.query(
      `INSERT INTO learning.courses (id, tenant_id, code, title) VALUES ('c_1', 't_1', 'C1', 'Course')`
    );
    await db.query(
      `INSERT INTO learning.course_versions (id, tenant_id, course_id, version_no, status) VALUES ('cv_1', 't_1', 'c_1', 1, 'draft')`
    );
    await db.query(
      `INSERT INTO documents.templates (id, tenant_id, name, template_type, status) VALUES ('tpl_1', 't_1', 'Cert', 'certificate', 'active')`
    );

    // act: insert first row
    await db.query(
      `INSERT INTO learning.course_document_sets (id, tenant_id, course_version_id, template_id, position) VALUES ('ds_1', 't_1', 'cv_1', 'tpl_1', 0)`
    );

    // assert: duplicate position rejected
    await expect(
      db.query(
        `INSERT INTO learning.course_document_sets (id, tenant_id, course_version_id, template_id, position) VALUES ('ds_2', 't_1', 'cv_1', 'tpl_1', 0)`
      )
    ).rejects.toThrow(/course_doc_sets_position_uniq/);
  });
});
```

- [x] **Step 3: Прогнать тесты**

Run: `pnpm -F backend test -- mvp-domain-migrations`
Expected: PASS. Если падает существующий тест миграции 0002 (там пишутся записи в course_versions без новых полей) — добавить дефолты для них или обновить тестовые fixtures.

- [x] **Step 4: Коммит**

```bash
git add apps/backend/migrations/0030_learning_course_program_meta.sql apps/backend/src/infrastructure/database/mvp-domain-migrations.test.ts
git commit -m "feat(backend): add program meta on course_versions + lookup.regulatory_acts + course_document_sets (migration 0030)"
```

---

## Task 3: Backend types — Commission, CourseDocumentSet, Program meta enums

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.types.ts`

- [x] **Step 1: Добавить типы в mvp.types.ts**

В конец файла:

```typescript
// === Pillar A — Plan A types ===

export type CommissionStatus = 'active' | 'archived';

export interface Commission extends BaseEntity {
  code: string;
  name: string;
  description?: string;
}

export type CommissionMemberRole =
  | 'chairman'
  | 'deputy_chairman'
  | 'member'
  | 'secretary'
  | 'external_expert';

export interface CommissionMember {
  id: string;
  tenantId: string;
  commissionId: string;
  role: CommissionMemberRole;
  userId?: string;
  externalFullName?: string;
  externalPosition?: string;
  signatureFileId?: string;
  positionInOrder: number;
  createdAt: string;
}

export type TrainingType = 'primary' | 'repeat' | 'target' | 'extraordinary';
export type LearnerCategory = 'worker' | 'specialist' | 'manager' | 'mixed';
export type StudyForm = 'in_person' | 'distance' | 'blended';
export type FinalAssessmentForm = 'test' | 'exam' | 'defense' | 'interview';

/**
 * Регуляторная мета программы — поля на course_versions из §5.1 спеки.
 * Заполняется на черновике, обязательна для публикации.
 */
export interface ProgramMeta {
  academicHours?: number;
  trainingType?: TrainingType;
  learnerCategory?: LearnerCategory;
  studyForm?: StudyForm;
  finalAssessmentForm?: FinalAssessmentForm;
  regulatoryBasisCodes?: string[];
  programAttachmentFileId?: string;
  commissionId?: string;
}

export interface RegulatoryAct {
  code: string;
  shortName: string;
  fullName: string;
  issuingAuthority: string;
  issuedAt?: string;
  url?: string;
  appliesToVerticals: string[];
  isActive: boolean;
  createdAt: string;
}

export interface CourseDocumentSetEntry {
  id: string;
  tenantId: string;
  courseVersionId: string;
  templateId: string;
  position: number;
  isRequired: boolean;
  autoIssueOnCompletion: boolean;
  createdAt: string;
}
```

Также расширить интерфейс `CourseVersion` существующими полями:

```typescript
// найти существующий интерфейс CourseVersion (строка ~40 в текущем файле) и расширить:
export interface CourseVersion extends BaseEntity, ProgramMeta {
  courseId: string;
  versionNo: number;
}
```

- [x] **Step 2: Проверить компиляцию**

Run: `pnpm -F backend run typecheck`
Expected: 0 errors. Если есть — это означает, что где-то есть несовместимость; обычно — добавление optional полей backwards-compatible.

- [x] **Step 3: Коммит**

```bash
git add apps/backend/src/modules/mvp/mvp.types.ts
git commit -m "feat(backend): add commission and program meta types to mvp.types"
```

---

## Task 4: Backend DTOs — commissions, program meta, document sets

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.dto.ts`
- Modify: `apps/backend/src/modules/mvp/mvp.dto-validation.test.ts`

### Спецификация

DTO с `class-validator` для всех новых endpoints. Все DTO следуют существующему стилю файла (см. `CreateCourseRequest`, `CreateMaterialRequest` для образца).

- [x] **Step 1: Добавить DTO в mvp.dto.ts**

```typescript
// === Commission DTOs ===

export class CreateCommissionRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

export class UpdateCommissionRequest {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

export class AddCommissionMemberRequest {
  @IsString()
  @IsIn(['chairman', 'deputy_chairman', 'member', 'secretary', 'external_expert'])
  role!: 'chairman' | 'deputy_chairman' | 'member' | 'secretary' | 'external_expert';

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  externalFullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  externalPosition?: string;

  @IsOptional()
  @IsString()
  signatureFileId?: string;

  @IsInt()
  @Min(0)
  positionInOrder!: number;
}

// === Program Meta DTO ===

export class UpdateProgramMetaRequest {
  @IsOptional()
  @IsInt()
  @Min(1)
  academicHours?: number;

  @IsOptional()
  @IsIn(['primary', 'repeat', 'target', 'extraordinary'])
  trainingType?: TrainingType;

  @IsOptional()
  @IsIn(['worker', 'specialist', 'manager', 'mixed'])
  learnerCategory?: LearnerCategory;

  @IsOptional()
  @IsIn(['in_person', 'distance', 'blended'])
  studyForm?: StudyForm;

  @IsOptional()
  @IsIn(['test', 'exam', 'defense', 'interview'])
  finalAssessmentForm?: FinalAssessmentForm;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  regulatoryBasisCodes?: string[];

  @IsOptional()
  @IsString()
  programAttachmentFileId?: string;

  @IsOptional()
  @IsString()
  commissionId?: string;
}

// === Document Set DTOs ===

export class CourseDocumentSetEntryRequest {
  @IsString()
  @IsNotEmpty()
  templateId!: string;

  @IsInt()
  @Min(0)
  position!: number;

  @IsBoolean()
  isRequired!: boolean;

  @IsBoolean()
  autoIssueOnCompletion!: boolean;
}

export class PutCourseDocumentSetRequest {
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CourseDocumentSetEntryRequest)
  entries!: CourseDocumentSetEntryRequest[];
}
```

Импорты добавить в начало (если ещё нет): `ValidateNested`, `Type` из `class-transformer`, `ArrayMaxSize`, `IsBoolean` из `class-validator`.

- [x] **Step 2: Добавить DTO-валидационные тесты**

В файле `mvp.dto-validation.test.ts` добавить:

```typescript
describe('CreateCommissionRequest validation', () => {
  it('rejects empty code', async () => {
    const errors = await validateDto(CreateCommissionRequest, { code: '', name: 'ok' });
    expect(errors.code).toContain('isNotEmpty');
  });
  it('rejects code longer than 100', async () => {
    const errors = await validateDto(CreateCommissionRequest, {
      code: 'x'.repeat(101),
      name: 'ok'
    });
    expect(errors.code).toContain('maxLength');
  });
  it('accepts minimal valid', async () => {
    const errors = await validateDto(CreateCommissionRequest, {
      code: 'OT_2026',
      name: 'Комиссия ОТ'
    });
    expect(errors).toEqual({});
  });
});

describe('AddCommissionMemberRequest validation', () => {
  it('rejects unknown role', async () => {
    const errors = await validateDto(AddCommissionMemberRequest, {
      role: 'unknown',
      userId: 'u1',
      positionInOrder: 0
    });
    expect(errors.role).toContain('isIn');
  });
  it('accepts external expert without userId', async () => {
    const errors = await validateDto(AddCommissionMemberRequest, {
      role: 'external_expert',
      externalFullName: 'Иванов И.И.',
      externalPosition: 'Эксперт Ростехнадзора',
      positionInOrder: 0
    });
    expect(errors).toEqual({});
  });
});

describe('UpdateProgramMetaRequest validation', () => {
  it('rejects academicHours = 0', async () => {
    const errors = await validateDto(UpdateProgramMetaRequest, { academicHours: 0 });
    expect(errors.academicHours).toContain('min');
  });
  it('rejects unknown trainingType', async () => {
    const errors = await validateDto(UpdateProgramMetaRequest, { trainingType: 'unknown' });
    expect(errors.trainingType).toContain('isIn');
  });
  it('rejects regulatoryBasisCodes longer than 20', async () => {
    const errors = await validateDto(UpdateProgramMetaRequest, {
      regulatoryBasisCodes: new Array(21).fill('code')
    });
    expect(errors.regulatoryBasisCodes).toContain('arrayMaxSize');
  });
  it('accepts full valid meta', async () => {
    const errors = await validateDto(UpdateProgramMetaRequest, {
      academicHours: 40,
      trainingType: 'primary',
      learnerCategory: 'worker',
      studyForm: 'distance',
      finalAssessmentForm: 'test',
      regulatoryBasisCodes: ['PP_2464_2022', 'PRIKAZ_26N_2024']
    });
    expect(errors).toEqual({});
  });
});

describe('PutCourseDocumentSetRequest validation', () => {
  it('rejects empty templateId in entry', async () => {
    const errors = await validateDto(PutCourseDocumentSetRequest, {
      entries: [{ templateId: '', position: 0, isRequired: true, autoIssueOnCompletion: true }]
    });
    expect(JSON.stringify(errors)).toContain('isNotEmpty');
  });
  it('accepts valid entries array', async () => {
    const errors = await validateDto(PutCourseDocumentSetRequest, {
      entries: [
        { templateId: 'tpl_1', position: 0, isRequired: true, autoIssueOnCompletion: true },
        { templateId: 'tpl_2', position: 1, isRequired: false, autoIssueOnCompletion: false }
      ]
    });
    expect(errors).toEqual({});
  });
});
```

- [x] **Step 3: Прогнать тесты**

Run: `pnpm -F backend test -- mvp.dto-validation`
Expected: PASS. Если падает — `validateDto` helper нужно подсмотреть в существующих тестах (он есть, проверить импорт).

- [x] **Step 4: Коммит**

```bash
git add apps/backend/src/modules/mvp/mvp.dto.ts apps/backend/src/modules/mvp/mvp.dto-validation.test.ts
git commit -m "feat(backend): add DTOs for commissions, program meta, and document sets"
```

---

## Task 5: Backend Commission service (TDD)

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.service.ts`
- Modify: `apps/backend/src/modules/mvp/mvp.service.test.ts`
- Modify: `apps/backend/src/modules/mvp/infrastructure/in-memory-mvp.state.ts`

### Спецификация

Сервисные методы для CRUD комиссии и членов. Все методы tenant-scoped, пишут audit. Состояние commission переходит между `active` ↔ `archived`. При архивации — нельзя привязывать к новым курсам (валидируется в Task 6 publish-валидации).

- [x] **Step 1: Расширить in-memory state для commissions**

В файле `in-memory-mvp.state.ts` добавить:

```typescript
// Новые коллекции
commissions = new Map<string, Commission>(); // key: id
commissionMembers = new Map<string, CommissionMember>(); // key: id
```

Также добавить методы `clearAll()` для сброса в тестах и метод сериализации, если паттерн используется.

- [x] **Step 2: Написать падающие тесты**

```typescript
// in mvp.service.test.ts
describe('MvpService — commissions', () => {
  let service: MvpService;
  let auditService: AuditService;
  const tenantId = 't_1';
  const actorId = 'u_admin';

  beforeEach(() => {
    auditService = { write: vi.fn() } as unknown as AuditService;
    service = createMvpService({ auditService }); // helper, есть в существующих тестах
  });

  describe('createCommission', () => {
    it('creates an active commission with unique code per tenant', () => {
      const commission = service.createCommission(tenantId, actorId, {
        code: 'OT_2026',
        name: 'Аттестационная комиссия ОТ 2026',
        description: 'Состав на 2026 год'
      });

      expect(commission.code).toBe('OT_2026');
      expect(commission.status).toBe('active');
      expect(commission.tenantId).toBe(tenantId);
      expect(auditService.write).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          actorId,
          action: 'learning.commission_created',
          entityType: 'learning.commission',
          entityId: commission.id
        })
      );
    });

    it('throws ConflictException on duplicate code within tenant', () => {
      service.createCommission(tenantId, actorId, { code: 'C1', name: 'First' });
      expect(() =>
        service.createCommission(tenantId, actorId, { code: 'C1', name: 'Duplicate' })
      ).toThrow(ConflictException);
    });

    it('allows same code in different tenants', () => {
      service.createCommission('t_1', actorId, { code: 'C1', name: 'T1 commission' });
      const c2 = service.createCommission('t_2', actorId, { code: 'C1', name: 'T2 commission' });
      expect(c2.tenantId).toBe('t_2');
    });
  });

  describe('archiveCommission', () => {
    it('archives an active commission', () => {
      const c = service.createCommission(tenantId, actorId, { code: 'C1', name: 'Cmsn' });
      const archived = service.archiveCommission(tenantId, actorId, c.id);
      expect(archived.status).toBe('archived');
      expect(auditService.write).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'learning.commission_archived' })
      );
    });

    it('is idempotent — archiving already archived returns same status without error', () => {
      const c = service.createCommission(tenantId, actorId, { code: 'C1', name: 'Cmsn' });
      service.archiveCommission(tenantId, actorId, c.id);
      const again = service.archiveCommission(tenantId, actorId, c.id);
      expect(again.status).toBe('archived');
    });

    it('rejects archive of foreign-tenant commission', () => {
      const c = service.createCommission('t_1', actorId, { code: 'C1', name: 'Cmsn' });
      expect(() => service.archiveCommission('t_2', actorId, c.id)).toThrow(NotFoundException);
    });
  });

  describe('addCommissionMember', () => {
    it('adds chairman with internal user', () => {
      const c = service.createCommission(tenantId, actorId, { code: 'C1', name: 'Cmsn' });
      const m = service.addCommissionMember(tenantId, actorId, c.id, {
        role: 'chairman',
        userId: 'u_chairman',
        positionInOrder: 0
      });
      expect(m.role).toBe('chairman');
      expect(m.userId).toBe('u_chairman');
    });

    it('adds external expert without userId', () => {
      const c = service.createCommission(tenantId, actorId, { code: 'C1', name: 'Cmsn' });
      const m = service.addCommissionMember(tenantId, actorId, c.id, {
        role: 'external_expert',
        externalFullName: 'Иванов И.И.',
        externalPosition: 'Эксперт',
        positionInOrder: 1
      });
      expect(m.externalFullName).toBe('Иванов И.И.');
      expect(m.userId).toBeUndefined();
    });

    it('rejects when neither userId nor externalFullName provided', () => {
      const c = service.createCommission(tenantId, actorId, { code: 'C1', name: 'Cmsn' });
      expect(() =>
        service.addCommissionMember(tenantId, actorId, c.id, {
          role: 'member',
          positionInOrder: 0
        })
      ).toThrow(BadRequestException);
    });

    it('rejects adding member to archived commission', () => {
      const c = service.createCommission(tenantId, actorId, { code: 'C1', name: 'Cmsn' });
      service.archiveCommission(tenantId, actorId, c.id);
      expect(() =>
        service.addCommissionMember(tenantId, actorId, c.id, {
          role: 'member',
          userId: 'u_1',
          positionInOrder: 0
        })
      ).toThrow(BadRequestException);
    });
  });

  describe('removeCommissionMember', () => {
    it('removes member and writes audit', () => {
      const c = service.createCommission(tenantId, actorId, { code: 'C1', name: 'Cmsn' });
      const m = service.addCommissionMember(tenantId, actorId, c.id, {
        role: 'member',
        userId: 'u_1',
        positionInOrder: 0
      });
      service.removeCommissionMember(tenantId, actorId, c.id, m.id);
      expect(service.listCommissionMembers(tenantId, c.id)).toHaveLength(0);
      expect(auditService.write).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'learning.commission_member_removed' })
      );
    });
  });
});
```

- [x] **Step 3: Прогнать тесты — убедиться, что падают**

Run: `pnpm -F backend test -- mvp.service.test -t "commissions"`
Expected: FAIL — методы ещё не существуют.

- [x] **Step 4: Реализовать методы в mvp.service.ts**

Добавить в класс `MvpService` (рядом с существующими методами для course/group/etc.):

```typescript
createCommission(
  tenantId: string,
  actorId: string,
  request: CreateCommissionRequest
): Commission {
  // Check uniqueness
  for (const c of this.state.commissions.values()) {
    if (c.tenantId === tenantId && c.code === request.code) {
      throw new ConflictException('Commission with this code already exists in tenant');
    }
  }

  const now = new Date().toISOString();
  const commission: Commission = {
    id: this.idGenerator.generate('commission'),
    tenantId,
    code: request.code,
    name: request.name,
    description: request.description,
    status: 'active',
    createdAt: now,
    updatedAt: now
  };
  this.state.commissions.set(commission.id, commission);

  this.auditService.write({
    tenantId,
    actorId,
    action: 'learning.commission_created',
    entityType: 'learning.commission',
    entityId: commission.id,
    newValues: { code: commission.code, name: commission.name }
  });

  return commission;
}

archiveCommission(tenantId: string, actorId: string, id: string): Commission {
  const c = this.state.commissions.get(id);
  if (!c || c.tenantId !== tenantId) {
    throw new NotFoundException('Commission not found');
  }
  if (c.status === 'archived') return c;

  const updated: Commission = { ...c, status: 'archived', updatedAt: new Date().toISOString() };
  this.state.commissions.set(id, updated);

  this.auditService.write({
    tenantId,
    actorId,
    action: 'learning.commission_archived',
    entityType: 'learning.commission',
    entityId: id
  });

  return updated;
}

addCommissionMember(
  tenantId: string,
  actorId: string,
  commissionId: string,
  request: AddCommissionMemberRequest
): CommissionMember {
  const c = this.state.commissions.get(commissionId);
  if (!c || c.tenantId !== tenantId) {
    throw new NotFoundException('Commission not found');
  }
  if (c.status === 'archived') {
    throw new BadRequestException('Cannot add member to archived commission');
  }
  if (!request.userId && !request.externalFullName) {
    throw new BadRequestException('Either userId or externalFullName is required');
  }

  const now = new Date().toISOString();
  const member: CommissionMember = {
    id: this.idGenerator.generate('commission_member'),
    tenantId,
    commissionId,
    role: request.role,
    userId: request.userId,
    externalFullName: request.externalFullName,
    externalPosition: request.externalPosition,
    signatureFileId: request.signatureFileId,
    positionInOrder: request.positionInOrder,
    createdAt: now
  };
  this.state.commissionMembers.set(member.id, member);

  this.auditService.write({
    tenantId,
    actorId,
    action: 'learning.commission_member_added',
    entityType: 'learning.commission_member',
    entityId: member.id,
    newValues: { commissionId, role: member.role }
  });

  return member;
}

removeCommissionMember(
  tenantId: string,
  actorId: string,
  commissionId: string,
  memberId: string
): void {
  const m = this.state.commissionMembers.get(memberId);
  if (!m || m.tenantId !== tenantId || m.commissionId !== commissionId) {
    throw new NotFoundException('Member not found');
  }
  this.state.commissionMembers.delete(memberId);

  this.auditService.write({
    tenantId,
    actorId,
    action: 'learning.commission_member_removed',
    entityType: 'learning.commission_member',
    entityId: memberId,
    newValues: { commissionId, role: m.role }
  });
}

listCommissions(tenantId: string, status?: CommissionStatus): Commission[] {
  return Array.from(this.state.commissions.values())
    .filter((c) => c.tenantId === tenantId && (!status || c.status === status))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

listCommissionMembers(tenantId: string, commissionId: string): CommissionMember[] {
  return Array.from(this.state.commissionMembers.values())
    .filter((m) => m.tenantId === tenantId && m.commissionId === commissionId)
    .sort((a, b) => a.positionInOrder - b.positionInOrder);
}
```

- [x] **Step 5: Прогнать тесты — убедиться, что проходят**

Run: `pnpm -F backend test -- mvp.service.test -t "commissions"`
Expected: PASS — все 10+ кейсов зелёные.

- [x] **Step 6: Коммит**

```bash
git add apps/backend/src/modules/mvp/mvp.service.ts apps/backend/src/modules/mvp/mvp.service.test.ts apps/backend/src/modules/mvp/infrastructure/in-memory-mvp.state.ts
git commit -m "feat(backend): add Commission CRUD service with members and audit"
```

---

## Task 6: Program meta + publish validation (TDD)

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.service.ts`
- Modify: `apps/backend/src/modules/mvp/mvp.service.test.ts`

### Спецификация

Метод `updateProgramMeta(tenantId, actorId, courseVersionId, meta)` — обновляет поля программы на черновике (`status='draft'`). Метод `publishCourseVersion(tenantId, actorId, courseVersionId)` — переводит в `published` с валидацией: все обязательные поля программы заполнены, attached commission активна, минимум один regulatory_act.

Лицензия центра НЕ проверяется в плане A — это §5.10, план C.

- [x] **Step 1: Написать падающие тесты**

```typescript
// in mvp.service.test.ts
describe('MvpService — program meta and publish validation', () => {
  let service: MvpService;
  const tenantId = 't_1';
  const actorId = 'u_admin';
  let courseVersionId: string;
  let commissionId: string;

  beforeEach(() => {
    service = createMvpService({ auditService: { write: vi.fn() } as unknown as AuditService });
    // seed: course + course_version draft
    const course = service.createCourse(tenantId, actorId, { code: 'C1', title: 'Курс 1' });
    const cv = service.createCourseVersion(tenantId, actorId, course.id);
    courseVersionId = cv.id;
    const c = service.createCommission(tenantId, actorId, { code: 'CM1', name: 'Cmsn' });
    commissionId = c.id;
  });

  describe('updateProgramMeta', () => {
    it('sets program meta on a draft course version', () => {
      const updated = service.updateProgramMeta(tenantId, actorId, courseVersionId, {
        academicHours: 40,
        trainingType: 'primary',
        learnerCategory: 'worker',
        studyForm: 'distance',
        finalAssessmentForm: 'test',
        regulatoryBasisCodes: ['PP_2464_2022'],
        commissionId
      });
      expect(updated.academicHours).toBe(40);
      expect(updated.commissionId).toBe(commissionId);
    });

    it('rejects update on a published version', () => {
      // arrange: publish first
      service.updateProgramMeta(tenantId, actorId, courseVersionId, {
        academicHours: 16,
        trainingType: 'primary',
        learnerCategory: 'worker',
        studyForm: 'distance',
        finalAssessmentForm: 'test',
        regulatoryBasisCodes: ['PP_2464_2022'],
        commissionId
      });
      service.publishCourseVersion(tenantId, actorId, courseVersionId);

      expect(() =>
        service.updateProgramMeta(tenantId, actorId, courseVersionId, { academicHours: 32 })
      ).toThrow(BadRequestException);
    });

    it('rejects unknown commissionId', () => {
      expect(() =>
        service.updateProgramMeta(tenantId, actorId, courseVersionId, {
          commissionId: 'nonexistent'
        })
      ).toThrow(BadRequestException);
    });

    it('rejects archived commission', () => {
      service.archiveCommission(tenantId, actorId, commissionId);
      expect(() =>
        service.updateProgramMeta(tenantId, actorId, courseVersionId, { commissionId })
      ).toThrow(BadRequestException);
    });
  });

  describe('publishCourseVersion', () => {
    const completeMeta = (overrides: Partial<ProgramMeta> = {}): ProgramMeta => ({
      academicHours: 40,
      trainingType: 'primary',
      learnerCategory: 'worker',
      studyForm: 'distance',
      finalAssessmentForm: 'test',
      regulatoryBasisCodes: ['PP_2464_2022'],
      ...overrides
    });

    it('publishes when all required meta is set + commission attached', () => {
      service.updateProgramMeta(tenantId, actorId, courseVersionId, {
        ...completeMeta(),
        commissionId
      });
      const published = service.publishCourseVersion(tenantId, actorId, courseVersionId);
      expect(published.status).toBe('published');
    });

    it('rejects publish without academic_hours', () => {
      service.updateProgramMeta(tenantId, actorId, courseVersionId, {
        ...completeMeta({ academicHours: undefined }),
        commissionId
      });
      expect(() => service.publishCourseVersion(tenantId, actorId, courseVersionId)).toThrow(
        BadRequestException
      );
    });

    it('rejects publish without training_type', () => {
      service.updateProgramMeta(tenantId, actorId, courseVersionId, {
        ...completeMeta({ trainingType: undefined }),
        commissionId
      });
      expect(() => service.publishCourseVersion(tenantId, actorId, courseVersionId)).toThrow(
        BadRequestException
      );
    });

    it('rejects publish without regulatory_basis', () => {
      service.updateProgramMeta(tenantId, actorId, courseVersionId, {
        ...completeMeta({ regulatoryBasisCodes: [] }),
        commissionId
      });
      expect(() => service.publishCourseVersion(tenantId, actorId, courseVersionId)).toThrow(
        BadRequestException
      );
    });

    it('rejects publish without commission attached', () => {
      service.updateProgramMeta(tenantId, actorId, courseVersionId, completeMeta());
      expect(() => service.publishCourseVersion(tenantId, actorId, courseVersionId)).toThrow(
        BadRequestException
      );
    });

    it('audits successful publish', () => {
      const auditMock = vi.fn();
      service = createMvpService({ auditService: { write: auditMock } as unknown as AuditService });
      // re-seed inside this test
      const c = service.createCommission(tenantId, actorId, { code: 'CM1', name: 'Cmsn' });
      const course = service.createCourse(tenantId, actorId, { code: 'C2', title: 'C' });
      const cv = service.createCourseVersion(tenantId, actorId, course.id);
      service.updateProgramMeta(tenantId, actorId, cv.id, {
        ...completeMeta(),
        commissionId: c.id
      });
      service.publishCourseVersion(tenantId, actorId, cv.id);
      expect(auditMock).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'learning.course_version_published' })
      );
    });
  });
});
```

- [x] **Step 2: Прогнать — убедиться, что падают**

Run: `pnpm -F backend test -- mvp.service.test -t "program meta and publish"`
Expected: FAIL.

- [x] **Step 3: Реализовать методы**

```typescript
updateProgramMeta(
  tenantId: string,
  actorId: string,
  courseVersionId: string,
  meta: UpdateProgramMetaRequest
): CourseVersion {
  const cv = this.findCourseVersion(tenantId, courseVersionId);
  if (cv.status !== 'draft') {
    throw new BadRequestException('Cannot edit program meta of published course version');
  }
  if (meta.commissionId) {
    const c = this.state.commissions.get(meta.commissionId);
    if (!c || c.tenantId !== tenantId) {
      throw new BadRequestException('Commission not found');
    }
    if (c.status === 'archived') {
      throw new BadRequestException('Cannot attach archived commission');
    }
  }

  const updated: CourseVersion = {
    ...cv,
    academicHours: meta.academicHours ?? cv.academicHours,
    trainingType: meta.trainingType ?? cv.trainingType,
    learnerCategory: meta.learnerCategory ?? cv.learnerCategory,
    studyForm: meta.studyForm ?? cv.studyForm,
    finalAssessmentForm: meta.finalAssessmentForm ?? cv.finalAssessmentForm,
    regulatoryBasisCodes: meta.regulatoryBasisCodes ?? cv.regulatoryBasisCodes,
    programAttachmentFileId: meta.programAttachmentFileId ?? cv.programAttachmentFileId,
    commissionId: meta.commissionId ?? cv.commissionId,
    updatedAt: new Date().toISOString()
  };
  this.state.courseVersions.set(courseVersionId, updated);

  this.auditService.write({
    tenantId,
    actorId,
    action: 'learning.course_version_program_meta_updated',
    entityType: 'learning.course_version',
    entityId: courseVersionId,
    newValues: meta
  });

  return updated;
}

publishCourseVersion(
  tenantId: string,
  actorId: string,
  courseVersionId: string
): CourseVersion {
  const cv = this.findCourseVersion(tenantId, courseVersionId);
  if (cv.status === 'published') return cv;

  // Validate required fields
  const missing: string[] = [];
  if (!cv.academicHours) missing.push('academicHours');
  if (!cv.trainingType) missing.push('trainingType');
  if (!cv.learnerCategory) missing.push('learnerCategory');
  if (!cv.studyForm) missing.push('studyForm');
  if (!cv.finalAssessmentForm) missing.push('finalAssessmentForm');
  if (!cv.regulatoryBasisCodes || cv.regulatoryBasisCodes.length === 0) {
    missing.push('regulatoryBasisCodes');
  }
  if (!cv.commissionId) missing.push('commissionId');

  if (missing.length > 0) {
    throw new BadRequestException(`Cannot publish: missing required fields ${missing.join(', ')}`);
  }

  // Validate attached commission still active
  const c = this.state.commissions.get(cv.commissionId!);
  if (!c || c.status !== 'active') {
    throw new BadRequestException('Attached commission is not active');
  }

  const updated: CourseVersion = {
    ...cv,
    status: 'published',
    updatedAt: new Date().toISOString()
  };
  this.state.courseVersions.set(courseVersionId, updated);

  this.auditService.write({
    tenantId,
    actorId,
    action: 'learning.course_version_published',
    entityType: 'learning.course_version',
    entityId: courseVersionId,
    newValues: { academicHours: cv.academicHours, trainingType: cv.trainingType }
  });

  return updated;
}

private findCourseVersion(tenantId: string, id: string): CourseVersion {
  const cv = this.state.courseVersions.get(id);
  if (!cv || cv.tenantId !== tenantId) {
    throw new NotFoundException('Course version not found');
  }
  return cv;
}
```

- [x] **Step 4: Прогнать тесты — PASS**

Run: `pnpm -F backend test -- mvp.service.test -t "program meta and publish"`
Expected: PASS — все 9+ кейсов зелёные.

- [x] **Step 5: Коммит**

```bash
git add apps/backend/src/modules/mvp/mvp.service.ts apps/backend/src/modules/mvp/mvp.service.test.ts
git commit -m "feat(backend): add program meta + publish validation to mvp.service"
```

---

## Task 7: Course Document Set service (TDD)

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.service.ts`
- Modify: `apps/backend/src/modules/mvp/mvp.service.test.ts`
- Modify: `apps/backend/src/modules/mvp/infrastructure/in-memory-mvp.state.ts`

### Спецификация

Метод `setCourseDocumentSet(tenantId, actorId, courseVersionId, entries)` — PUT-семантика (заменяет полностью). Метод `getCourseDocumentSet(tenantId, courseVersionId)` — список упорядочен по position. Валидация: каждый templateId должен существовать в `documents.templates` и принадлежать tenant; positions уникальны (0..N-1, последовательно).

- [x] **Step 1: Расширить in-memory state**

В файле `in-memory-mvp.state.ts`:

```typescript
courseDocumentSets = new Map<string, CourseDocumentSetEntry>(); // key: id
```

- [x] **Step 2: Написать падающие тесты**

```typescript
describe('MvpService — course document sets', () => {
  let service: MvpService;
  const tenantId = 't_1';
  const actorId = 'u_admin';
  let courseVersionId: string;
  let templateA: string;
  let templateB: string;

  beforeEach(() => {
    service = createMvpService({ auditService: { write: vi.fn() } as unknown as AuditService });
    const course = service.createCourse(tenantId, actorId, { code: 'C1', title: 'C' });
    const cv = service.createCourseVersion(tenantId, actorId, course.id);
    courseVersionId = cv.id;
    // Templates must exist in documents domain; for these unit tests we use the service's mockable
    // documents-state collaborator. See setupMvpServiceWithTemplates() helper.
    const templates = setupMvpServiceWithTemplates(service, tenantId, [
      { id: 'tpl_protocol', name: 'Протокол', templateType: 'protocol' },
      { id: 'tpl_cert', name: 'Удостоверение', templateType: 'certificate' }
    ]);
    templateA = templates[0].id;
    templateB = templates[1].id;
  });

  it('creates entries with sequential positions', () => {
    service.setCourseDocumentSet(tenantId, actorId, courseVersionId, {
      entries: [
        { templateId: templateA, position: 0, isRequired: true, autoIssueOnCompletion: true },
        { templateId: templateB, position: 1, isRequired: true, autoIssueOnCompletion: true }
      ]
    });

    const set = service.getCourseDocumentSet(tenantId, courseVersionId);
    expect(set).toHaveLength(2);
    expect(set[0].templateId).toBe(templateA);
    expect(set[0].position).toBe(0);
    expect(set[1].templateId).toBe(templateB);
    expect(set[1].position).toBe(1);
  });

  it('replaces existing set on second call (PUT semantics)', () => {
    service.setCourseDocumentSet(tenantId, actorId, courseVersionId, {
      entries: [
        { templateId: templateA, position: 0, isRequired: true, autoIssueOnCompletion: true }
      ]
    });
    service.setCourseDocumentSet(tenantId, actorId, courseVersionId, {
      entries: [
        { templateId: templateB, position: 0, isRequired: true, autoIssueOnCompletion: true }
      ]
    });

    const set = service.getCourseDocumentSet(tenantId, courseVersionId);
    expect(set).toHaveLength(1);
    expect(set[0].templateId).toBe(templateB);
  });

  it('rejects non-sequential positions (0, 2)', () => {
    expect(() =>
      service.setCourseDocumentSet(tenantId, actorId, courseVersionId, {
        entries: [
          { templateId: templateA, position: 0, isRequired: true, autoIssueOnCompletion: true },
          { templateId: templateB, position: 2, isRequired: true, autoIssueOnCompletion: true }
        ]
      })
    ).toThrow(BadRequestException);
  });

  it('rejects duplicate positions', () => {
    expect(() =>
      service.setCourseDocumentSet(tenantId, actorId, courseVersionId, {
        entries: [
          { templateId: templateA, position: 0, isRequired: true, autoIssueOnCompletion: true },
          { templateId: templateB, position: 0, isRequired: false, autoIssueOnCompletion: false }
        ]
      })
    ).toThrow(BadRequestException);
  });

  it('rejects unknown templateId', () => {
    expect(() =>
      service.setCourseDocumentSet(tenantId, actorId, courseVersionId, {
        entries: [
          { templateId: 'nonexistent', position: 0, isRequired: true, autoIssueOnCompletion: true }
        ]
      })
    ).toThrow(BadRequestException);
  });

  it('audits create and replace', () => {
    const auditMock = vi.fn();
    service = createMvpService({ auditService: { write: auditMock } as unknown as AuditService });
    // re-seed in this test
    const course = service.createCourse(tenantId, actorId, { code: 'C2', title: 'C' });
    const cv = service.createCourseVersion(tenantId, actorId, course.id);
    setupMvpServiceWithTemplates(service, tenantId, [
      { id: 'tpl_x', name: 'X', templateType: 'certificate' }
    ]);
    service.setCourseDocumentSet(tenantId, actorId, cv.id, {
      entries: [{ templateId: 'tpl_x', position: 0, isRequired: true, autoIssueOnCompletion: true }]
    });
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'learning.course_document_set_updated' })
    );
  });
});
```

> Хелпер `setupMvpServiceWithTemplates` нужно создать в тестовом helper-файле (см. существующий паттерн); он мокает связку с `documents`-сервисом для unit-тестов. Альтернатива: подменить через DI токен.

- [x] **Step 3: Прогнать — FAIL**

Run: `pnpm -F backend test -- mvp.service.test -t "course document sets"`
Expected: FAIL.

- [x] **Step 4: Реализовать**

```typescript
setCourseDocumentSet(
  tenantId: string,
  actorId: string,
  courseVersionId: string,
  request: PutCourseDocumentSetRequest
): CourseDocumentSetEntry[] {
  const cv = this.findCourseVersion(tenantId, courseVersionId);

  // Validate positions are 0..N-1
  const positions = request.entries.map((e) => e.position).sort((a, b) => a - b);
  const expected = Array.from({ length: positions.length }, (_, i) => i);
  if (JSON.stringify(positions) !== JSON.stringify(expected)) {
    throw new BadRequestException(`Positions must be sequential 0..N-1, got [${positions.join(',')}]`);
  }

  // Validate templates exist & belong to tenant (delegated to documents service)
  for (const e of request.entries) {
    const template = this.documentsState.getTemplate(tenantId, e.templateId);
    if (!template) {
      throw new BadRequestException(`Template ${e.templateId} not found in tenant`);
    }
  }

  // Replace: delete existing entries for this course_version, then insert new ones
  for (const [id, entry] of this.state.courseDocumentSets.entries()) {
    if (entry.tenantId === tenantId && entry.courseVersionId === courseVersionId) {
      this.state.courseDocumentSets.delete(id);
    }
  }

  const created: CourseDocumentSetEntry[] = [];
  for (const e of request.entries) {
    const entry: CourseDocumentSetEntry = {
      id: this.idGenerator.generate('course_doc_set'),
      tenantId,
      courseVersionId,
      templateId: e.templateId,
      position: e.position,
      isRequired: e.isRequired,
      autoIssueOnCompletion: e.autoIssueOnCompletion,
      createdAt: new Date().toISOString()
    };
    this.state.courseDocumentSets.set(entry.id, entry);
    created.push(entry);
  }

  this.auditService.write({
    tenantId,
    actorId,
    action: 'learning.course_document_set_updated',
    entityType: 'learning.course_version',
    entityId: courseVersionId,
    newValues: { entries: request.entries.length }
  });

  return created.sort((a, b) => a.position - b.position);
}

getCourseDocumentSet(
  tenantId: string,
  courseVersionId: string
): CourseDocumentSetEntry[] {
  return Array.from(this.state.courseDocumentSets.values())
    .filter((e) => e.tenantId === tenantId && e.courseVersionId === courseVersionId)
    .sort((a, b) => a.position - b.position);
}
```

> `this.documentsState` — это новая зависимость, которую нужно инжектировать через конструктор `MvpService`. Альтернатива (если сильно лишний coupling): ввести `TemplatesLookupPort` интерфейс и реализацию в documents-модуле; зависимость minimal-surface (только `getTemplate(tenantId, id)`).

- [x] **Step 5: Прогнать тесты — PASS**

Run: `pnpm -F backend test -- mvp.service.test -t "course document sets"`
Expected: PASS — все 6+ кейсов зелёные.

- [x] **Step 6: Коммит**

```bash
git add apps/backend/src/modules/mvp/mvp.service.ts apps/backend/src/modules/mvp/mvp.service.test.ts apps/backend/src/modules/mvp/infrastructure/in-memory-mvp.state.ts
git commit -m "feat(backend): add course document set CRUD with template validation"
```

---

## Task 8: Extend enrollment-document-issuance.listener for multi-doc

**Files:**

- Modify: `apps/backend/src/modules/documents/enrollment-document-issuance.listener.ts`
- Modify: `apps/backend/src/modules/documents/enrollment-document-issuance.listener.test.ts`

### Спецификация

Сейчас листенер вызывает `documents.resolveAutoCertificateTemplateBinding` (один сертификат). Меняем на:

1. Получить course_version_id из enrollment → group_courses.
2. Прочитать `course_document_sets` для course_version_id, отсортировать по position, фильтровать `auto_issue_on_completion = true`.
3. Для каждой строки последовательно: резервировать номер → генерировать документ → audit.
4. Idempotency: ключ = `enrollment:${enrollmentId}:${templateId}:v1`.

- [x] **Step 1: Обновить тесты**

```typescript
// in enrollment-document-issuance.listener.test.ts
describe('EnrollmentDocumentIssuanceListener — multi-doc set', () => {
  const tenantId = 't_1';
  const enrollmentId = 'e_1';
  const courseVersionId = 'cv_1';

  it('issues all auto_issue_on_completion documents in order', async () => {
    const docsRunner = mockDocumentsRunner({
      courseDocumentSet: [
        { templateId: 'tpl_protocol', position: 0, autoIssueOnCompletion: true },
        { templateId: 'tpl_cert', position: 1, autoIssueOnCompletion: true }
      ]
    });
    const audit = { write: vi.fn() } as unknown as AuditService;
    const listener = new EnrollmentDocumentIssuanceListener(docsRunner, audit);

    await listener.handleEnrollmentCompleted({
      tenantId,
      enrollmentId,
      groupId: 'g_1',
      groupCourseIds: ['gc_1'],
      courseVersionId,
      actorId: 'u_1'
    } as EnrollmentCompletedPayload);

    // Wait for setImmediate
    await new Promise((r) => setImmediate(r));

    expect(docsRunner.generateDocument).toHaveBeenCalledTimes(2);
    expect(docsRunner.generateDocument).toHaveBeenNthCalledWith(
      1,
      tenantId,
      'u_1',
      expect.objectContaining({
        idempotencyKey: 'enrollment:e_1:tpl_protocol:v1',
        templateId: 'tpl_protocol'
      }),
      expect.any(Object)
    );
    expect(docsRunner.generateDocument).toHaveBeenNthCalledWith(
      2,
      tenantId,
      'u_1',
      expect.objectContaining({
        idempotencyKey: 'enrollment:e_1:tpl_cert:v1',
        templateId: 'tpl_cert'
      }),
      expect.any(Object)
    );
  });

  it('skips entries with auto_issue_on_completion = false', async () => {
    const docsRunner = mockDocumentsRunner({
      courseDocumentSet: [
        { templateId: 'tpl_required', position: 0, autoIssueOnCompletion: true },
        { templateId: 'tpl_optional', position: 1, autoIssueOnCompletion: false }
      ]
    });
    const listener = new EnrollmentDocumentIssuanceListener(docsRunner, {
      write: vi.fn()
    } as unknown as AuditService);

    await listener.handleEnrollmentCompleted({
      tenantId,
      enrollmentId /* ... */
    } as EnrollmentCompletedPayload);
    await new Promise((r) => setImmediate(r));

    expect(docsRunner.generateDocument).toHaveBeenCalledTimes(1);
  });

  it('audits skipped if no set configured', async () => {
    const docsRunner = mockDocumentsRunner({ courseDocumentSet: [] });
    const auditMock = vi.fn();
    const listener = new EnrollmentDocumentIssuanceListener(docsRunner, {
      write: auditMock
    } as unknown as AuditService);

    await listener.handleEnrollmentCompleted({
      tenantId,
      enrollmentId /* ... */
    } as EnrollmentCompletedPayload);
    await new Promise((r) => setImmediate(r));

    expect(docsRunner.generateDocument).not.toHaveBeenCalled();
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'documents.enrollment_document_set_skipped' })
    );
  });

  it('is idempotent — second event does not duplicate documents', async () => {
    const docsRunner = mockDocumentsRunner({
      courseDocumentSet: [{ templateId: 'tpl_cert', position: 0, autoIssueOnCompletion: true }]
    });
    const listener = new EnrollmentDocumentIssuanceListener(docsRunner, {
      write: vi.fn()
    } as unknown as AuditService);

    await listener.handleEnrollmentCompleted({
      tenantId,
      enrollmentId /* ... */
    } as EnrollmentCompletedPayload);
    await new Promise((r) => setImmediate(r));
    await listener.handleEnrollmentCompleted({
      tenantId,
      enrollmentId /* ... */
    } as EnrollmentCompletedPayload);
    await new Promise((r) => setImmediate(r));

    // generateDocument called twice but with same idempotencyKey → documents-service dedups
    expect(docsRunner.generateDocument).toHaveBeenCalledTimes(2);
    expect(docsRunner.generateDocument.mock.calls[0][2].idempotencyKey).toBe(
      docsRunner.generateDocument.mock.calls[1][2].idempotencyKey
    );
  });
});
```

- [x] **Step 2: Прогнать — FAIL**

Run: `pnpm -F backend test -- enrollment-document-issuance`
Expected: FAIL.

- [x] **Step 3: Заменить тело `issueCertificate` в листенере**

Старый код в `enrollment-document-issuance.listener.ts` вызывает `resolveAutoCertificateTemplateBinding`. Заменить:

```typescript
private async issueCertificate(payload: EnrollmentCompletedPayload): Promise<void> {
  const { tenantId, enrollmentId, courseVersionId, actorId } = payload;
  const traceCtx = enrollmentTraceRequestContext(payload);
  try {
    await this.documentsRunner.runWithTenantDocuments(tenantId, async (documents) => {
      const docSet = documents.resolveCourseDocumentSet(tenantId, courseVersionId);
      const autoIssueEntries = docSet.filter((e) => e.autoIssueOnCompletion);

      if (autoIssueEntries.length === 0) {
        this.auditService.write({
          tenantId,
          actorId,
          action: 'documents.enrollment_document_set_skipped',
          entityType: 'learning.enrollment',
          entityId: enrollmentId,
          newValues: { reason: 'no_auto_issue_entries' },
          requestId: payload.requestId,
          correlationId: payload.correlationId
        });
        return;
      }

      // Sequential issuance to keep numbering predictable
      for (const entry of autoIssueEntries.sort((a, b) => a.position - b.position)) {
        documents.generateDocument(
          tenantId,
          actorId,
          {
            idempotencyKey: `enrollment:${enrollmentId}:${entry.templateId}:v1`,
            templateId: entry.templateId,
            sourceEntityType: 'enrollment',
            sourceEntityId: enrollmentId,
            documentType: entry.documentType ?? 'certificate'
          },
          traceCtx
        );
      }

      this.auditService.write({
        tenantId,
        actorId,
        action: 'documents.enrollment_document_set_issued',
        entityType: 'learning.enrollment',
        entityId: enrollmentId,
        newValues: { count: autoIssueEntries.length, courseVersionId },
        requestId: payload.requestId,
        correlationId: payload.correlationId
      });
    });
  } catch (error) {
    this.auditService.write({
      tenantId,
      actorId,
      action: 'documents.enrollment_document_set_failed',
      entityType: 'learning.enrollment',
      entityId: enrollmentId,
      newValues: { error: error instanceof Error ? error.message : String(error) },
      requestId: payload.requestId,
      correlationId: payload.correlationId
    });
  }
}
```

> `resolveCourseDocumentSet` — новый метод на `documents` service (или адаптер, который читает из learning-домена). Если архитектурно правильнее — добавить отдельный read-port `CourseDocumentSetLookupPort` в `documents` module и реализацию в `mvp` module. Минимум — extend `InMemoryDocumentsState` методом `resolveCourseDocumentSet(tenantId, courseVersionId)` с делегированием в `MvpService.getCourseDocumentSet`.

Также `EnrollmentCompletedPayload` должен содержать `courseVersionId` — если ещё нет, добавить (см. `mvp/enrollment-completed.event.ts`).

- [x] **Step 4: Прогнать тесты — PASS**

Run: `pnpm -F backend test -- enrollment-document-issuance`
Expected: PASS.

- [x] **Step 5: Прогнать существующие e2e — проверить, что не сломали ничего**

Run: `pnpm -F backend test -- business-flows.e2e`
Expected: PASS — existing e2e должен по-прежнему работать (одиночный сертификат превратился в «пакет из 1 документа» — фасад тот же).

- [x] **Step 6: Коммит**

```bash
git add apps/backend/src/modules/documents/enrollment-document-issuance.listener.ts apps/backend/src/modules/documents/enrollment-document-issuance.listener.test.ts
git commit -m "feat(backend): extend listener for multi-document course document sets"
```

---

## Task 9: Variable resolver — program category

**Files:**

- Modify: `apps/backend/src/modules/documents/documents.service.ts`
- Modify: `apps/backend/src/modules/documents/documents.service.test.ts`

### Спецификация

В `documents.service.ts` уже есть `variableCategories` Set (строка 47) с категориями включая `commission`. Текущий resolver (вероятно метод `resolveVariables(tenantId, entityType, entityId)`) не имеет реализации для `program` категории. Добавить.

Резолвер для `program.*`:

- Источник: `course_versions` найденный по `enrollment.course_id → group_courses.course_version_id`.
- Поддерживаемые переменные:
  - `{program.academic_hours}` → number
  - `{program.training_type}` → 'primary' | 'repeat' | 'target' | 'extraordinary'
  - `{program.training_type_label}` → 'Первичное обучение' | ...
  - `{program.learner_category}`, `{program.learner_category_label}`
  - `{program.study_form}`, `{program.study_form_label}`
  - `{program.final_assessment_form}`, `{program.final_assessment_form_label}`
  - `{program.regulatory_basis}` → CSV строк («ПП 2464, Приказ Минтруда 26н»)
  - `{program.commission_name}`, `{program.commission_code}`

Резолвер для `commission.*` (расширить, поскольку категория уже задекларирована):

- Источник: `commissions` + `commission_members` по `course_version.commission_id`.
- Переменные:
  - `{commission.code}`, `{commission.name}`, `{commission.description}`
  - `{commission.chairman.name}` (string), `{commission.chairman.position}`, `{commission.chairman.signature_file_id}`
  - `{commission.secretary.name}`, `{commission.secretary.signature_file_id}`
  - `{commission.members}` — JSON-список объектов {fullName, role, position, signatureFileId} для таблицы в шаблоне

- [x] **Step 1: Написать падающие тесты**

```typescript
// in documents.service.test.ts (или новом resolver.test.ts)
describe('DocumentsService — variable resolver: program category', () => {
  let service: DocumentsService;
  const tenantId = 't_1';

  beforeEach(() => {
    service = createDocumentsService({
      /* setup with mvp adapter */
    });
    // Seed: course + course_version with program meta
    setupMvpCourseAndVersion(service, tenantId, {
      courseId: 'c_1',
      courseVersionId: 'cv_1',
      academicHours: 40,
      trainingType: 'primary',
      learnerCategory: 'worker',
      studyForm: 'distance',
      finalAssessmentForm: 'test',
      regulatoryBasisCodes: ['PP_2464_2022', 'PRIKAZ_26N_2024'],
      commissionId: 'cm_1'
    });
    setupMvpEnrollment(service, tenantId, {
      enrollmentId: 'e_1',
      learnerId: 'L_1',
      groupId: 'g_1',
      courseId: 'c_1',
      courseVersionId: 'cv_1'
    });
  });

  it('resolves academic_hours', () => {
    const v = service.resolveVariables(tenantId, 'enrollment', 'e_1', ['program.academic_hours']);
    expect(v).toEqual({ 'program.academic_hours': 40 });
  });

  it('resolves training_type and Russian label', () => {
    const v = service.resolveVariables(tenantId, 'enrollment', 'e_1', [
      'program.training_type',
      'program.training_type_label'
    ]);
    expect(v).toEqual({
      'program.training_type': 'primary',
      'program.training_type_label': 'Первичное обучение'
    });
  });

  it('resolves regulatory_basis as comma-separated short names', () => {
    const v = service.resolveVariables(tenantId, 'enrollment', 'e_1', ['program.regulatory_basis']);
    expect(v).toEqual({
      'program.regulatory_basis': 'ПП 2464, Приказ Минтруда 26н'
    });
  });

  it('returns empty string for unknown program variable', () => {
    const v = service.resolveVariables(tenantId, 'enrollment', 'e_1', ['program.nonexistent']);
    expect(v).toEqual({ 'program.nonexistent': '' });
  });

  it('returns empty for program variables on course_version without meta', () => {
    setupMvpCourseAndVersion(service, tenantId, {
      courseId: 'c_2',
      courseVersionId: 'cv_2'
      // no program meta
    });
    setupMvpEnrollment(service, tenantId, {
      enrollmentId: 'e_2',
      learnerId: 'L_2',
      groupId: 'g_2',
      courseId: 'c_2',
      courseVersionId: 'cv_2'
    });
    const v = service.resolveVariables(tenantId, 'enrollment', 'e_2', ['program.academic_hours']);
    expect(v['program.academic_hours']).toBe('');
  });
});

describe('DocumentsService — variable resolver: commission category', () => {
  // Seed: commission with chairman + secretary + 2 members
  // Test:
  // - {commission.code} → 'CM1'
  // - {commission.chairman.name} → 'Иванов И.И.' (or display name)
  // - {commission.secretary.name} → 'Сидорова А.А.'
  // - {commission.members} → JSON array of {fullName, role}
});
```

- [x] **Step 2: Прогнать — FAIL**

Run: `pnpm -F backend test -- documents.service.test -t "variable resolver"`
Expected: FAIL.

- [x] **Step 3: Реализовать resolver**

Резолвер должен делегировать в `mvp` для чтения course_versions / commission state. Расширить `DocumentsService.resolveVariables` (или создать отдельные методы `resolveProgramVariables` / `resolveCommissionVariables`):

```typescript
// In documents.service.ts
private resolveProgramVariables(
  tenantId: string,
  entityType: string,
  entityId: string,
  vars: string[]
): Record<string, unknown> {
  if (entityType !== 'enrollment') return Object.fromEntries(vars.map((v) => [v, '']));

  const enrollment = this.mvpAdapter.getEnrollment(tenantId, entityId);
  if (!enrollment) return Object.fromEntries(vars.map((v) => [v, '']));

  const cv = this.mvpAdapter.findActiveCourseVersionForEnrollment(tenantId, enrollment);
  if (!cv) return Object.fromEntries(vars.map((v) => [v, '']));

  const acts = this.mvpAdapter.getRegulatoryActs(cv.regulatoryBasisCodes ?? []);

  const labels: Record<string, Record<string, string>> = {
    training_type: {
      primary: 'Первичное обучение',
      repeat: 'Повторное обучение',
      target: 'Целевое обучение',
      extraordinary: 'Внеочередное обучение'
    },
    learner_category: {
      worker: 'Рабочие',
      specialist: 'Специалисты',
      manager: 'Руководители',
      mixed: 'Смешанная категория'
    },
    study_form: {
      in_person: 'Очная',
      distance: 'Дистанционная',
      blended: 'Смешанная'
    },
    final_assessment_form: {
      test: 'Тестирование',
      exam: 'Экзамен',
      defense: 'Защита проекта',
      interview: 'Собеседование'
    }
  };

  const result: Record<string, unknown> = {};
  for (const v of vars) {
    const key = v.slice('program.'.length);
    switch (key) {
      case 'academic_hours':
        result[v] = cv.academicHours ?? '';
        break;
      case 'training_type':
        result[v] = cv.trainingType ?? '';
        break;
      case 'training_type_label':
        result[v] = cv.trainingType ? labels.training_type[cv.trainingType] : '';
        break;
      case 'learner_category':
        result[v] = cv.learnerCategory ?? '';
        break;
      case 'learner_category_label':
        result[v] = cv.learnerCategory ? labels.learner_category[cv.learnerCategory] : '';
        break;
      case 'study_form':
        result[v] = cv.studyForm ?? '';
        break;
      case 'study_form_label':
        result[v] = cv.studyForm ? labels.study_form[cv.studyForm] : '';
        break;
      case 'final_assessment_form':
        result[v] = cv.finalAssessmentForm ?? '';
        break;
      case 'final_assessment_form_label':
        result[v] = cv.finalAssessmentForm ? labels.final_assessment_form[cv.finalAssessmentForm] : '';
        break;
      case 'regulatory_basis':
        result[v] = acts.map((a) => a.shortName).join(', ');
        break;
      case 'commission_name':
        result[v] = cv.commissionId ? this.mvpAdapter.getCommission(tenantId, cv.commissionId)?.name ?? '' : '';
        break;
      case 'commission_code':
        result[v] = cv.commissionId ? this.mvpAdapter.getCommission(tenantId, cv.commissionId)?.code ?? '' : '';
        break;
      default:
        result[v] = '';
    }
  }
  return result;
}

// commission category resolver — similar pattern, reading from commission_members
```

И завести `MvpAdapter` interface (новый port) с минимальной поверхностью:

```typescript
// In documents.module.ts — register dependency
export interface MvpAdapter {
  getEnrollment(tenantId: string, id: string): Enrollment | undefined;
  findActiveCourseVersionForEnrollment(tenantId: string, e: Enrollment): CourseVersion | undefined;
  getRegulatoryActs(codes: string[]): RegulatoryAct[];
  getCommission(tenantId: string, id: string): Commission | undefined;
  listCommissionMembers(tenantId: string, commissionId: string): CommissionMember[];
}
```

Реализация — в `mvp` module: `MvpService` имплементирует port.

- [x] **Step 4: Прогнать — PASS**

Run: `pnpm -F backend test -- documents.service.test -t "variable resolver"`
Expected: PASS.

- [x] **Step 5: Коммит**

```bash
git add apps/backend/src/modules/documents/documents.service.ts apps/backend/src/modules/documents/documents.service.test.ts apps/backend/src/modules/mvp/mvp.service.ts
git commit -m "feat(backend): add variable resolver for program and commission categories"
```

---

## Task 10: Backend controllers + HTTP integration

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.controller.ts`
- Modify: `apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts`

### Спецификация

HTTP-эндпоинты с RBAC через существующий `PermissionsGuard` (см. соседние контроллеры):

- `POST /commissions` — `learning.commissions.write` → 201 + entity
- `GET /commissions` — `learning.commissions.read` → list
- `GET /commissions/:id` — `learning.commissions.read` → entity + members
- `PATCH /commissions/:id` — `learning.commissions.write` → update name/description
- `POST /commissions/:id/archive` — `learning.commissions.write` → archive
- `POST /commissions/:id/members` — `learning.commissions.write` → add member
- `DELETE /commissions/:id/members/:memberId` — `learning.commissions.write` → remove
- `PATCH /course-versions/:id/program-meta` — `learning.courses.write` → 200 + entity
- `POST /course-versions/:id/publish` — `learning.courses.publish` → 200 + entity
- `PUT /course-versions/:id/document-set` — `learning.courses.write` → 200 + entries
- `GET /course-versions/:id/document-set` — `learning.courses.read` → entries

Все эндпоинты проходят через `TenantGuard` + `PermissionsGuard` (стандартный паттерн `mvp`).

- [x] **Step 1: Добавить permissions seed**

Проверить, есть ли в `apps/backend/migrations/0010_iam_role_permissions_and_seed.sql` permissions `learning.commissions.read`, `learning.commissions.write`, `learning.courses.publish`. Если нет — добавить миграцией `0031_iam_pillar_a_permissions.sql` (отдельный файл, чтобы не трогать seed):

```sql
-- apps/backend/migrations/0031_iam_pillar_a_permissions.sql
INSERT INTO iam.permissions (code) VALUES
  ('learning.commissions.read'),
  ('learning.commissions.write'),
  ('learning.courses.publish'),
  ('learning.course_document_sets.read'),
  ('learning.course_document_sets.write')
ON CONFLICT (code) DO NOTHING;

INSERT INTO iam.role_permissions (role_code, permission_code) VALUES
  ('admin', 'learning.commissions.read'),
  ('admin', 'learning.commissions.write'),
  ('admin', 'learning.courses.publish'),
  ('admin', 'learning.course_document_sets.read'),
  ('admin', 'learning.course_document_sets.write'),
  ('methodist', 'learning.commissions.read'),
  ('methodist', 'learning.courses.publish'),
  ('methodist', 'learning.course_document_sets.read'),
  ('methodist', 'learning.course_document_sets.write')
ON CONFLICT (role_code, permission_code) DO NOTHING;
```

- [x] **Step 2: Добавить контроллер-методы**

В `mvp.controller.ts` добавить (используя существующий паттерн `@Permissions(...)` / `@Body(assertValidDto)`):

```typescript
@Post('commissions')
@Permissions('learning.commissions.write')
async createCommission(
  @Auth() auth: AuthContext,
  @Body(assertValidDto) body: CreateCommissionRequest
): Promise<Commission> {
  return this.mvpService.createCommission(auth.tenantId, auth.userId, body);
}

@Get('commissions')
@Permissions('learning.commissions.read')
async listCommissions(
  @Auth() auth: AuthContext,
  @Query('status') status?: CommissionStatus
): Promise<{ items: Commission[] }> {
  return { items: this.mvpService.listCommissions(auth.tenantId, status) };
}

// ... остальные endpoints по аналогии

@Patch('course-versions/:id/program-meta')
@Permissions('learning.courses.write')
async updateProgramMeta(
  @Auth() auth: AuthContext,
  @Param('id') id: string,
  @Body(assertValidDto) body: UpdateProgramMetaRequest
): Promise<CourseVersion> {
  return this.mvpService.updateProgramMeta(auth.tenantId, auth.userId, id, body);
}

@Post('course-versions/:id/publish')
@Permissions('learning.courses.publish')
async publishCourseVersion(
  @Auth() auth: AuthContext,
  @Param('id') id: string
): Promise<CourseVersion> {
  return this.mvpService.publishCourseVersion(auth.tenantId, auth.userId, id);
}

@Put('course-versions/:id/document-set')
@Permissions('learning.course_document_sets.write')
async setCourseDocumentSet(
  @Auth() auth: AuthContext,
  @Param('id') id: string,
  @Body(assertValidDto) body: PutCourseDocumentSetRequest
): Promise<{ items: CourseDocumentSetEntry[] }> {
  return { items: this.mvpService.setCourseDocumentSet(auth.tenantId, auth.userId, id, body) };
}

@Get('course-versions/:id/document-set')
@Permissions('learning.course_document_sets.read')
async getCourseDocumentSet(
  @Auth() auth: AuthContext,
  @Param('id') id: string
): Promise<{ items: CourseDocumentSetEntry[] }> {
  return { items: this.mvpService.getCourseDocumentSet(auth.tenantId, id) };
}
```

- [x] **Step 3: HTTP integration тесты**

В `mvp.domains.http.integration.test.ts` добавить:

```typescript
describe('Pillar A — commissions HTTP', () => {
  it('POST /commissions creates with proper permissions', async () => {
    const app = await bootstrapApp();
    const token = signJwtForRole('admin', 't_1', 'u_1');
    const res = await request(app.getHttpServer())
      .post('/commissions')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Tenant-Id', 't_1')
      .send({ code: 'OT_2026', name: 'ОТ' });
    expect(res.status).toBe(201);
    expect(res.body.code).toBe('OT_2026');
  });

  it('POST /commissions requires learning.commissions.write permission', async () => {
    const app = await bootstrapApp();
    const tokenWithoutPermission = signJwtForRole('learner', 't_1', 'u_1');
    const res = await request(app.getHttpServer())
      .post('/commissions')
      .set('Authorization', `Bearer ${tokenWithoutPermission}`)
      .set('X-Tenant-Id', 't_1')
      .send({ code: 'OT', name: 'ОТ' });
    expect(res.status).toBe(403);
  });

  it('PATCH /course-versions/:id/program-meta updates fields', async () => {
    // ...
  });

  it('POST /course-versions/:id/publish 400 on missing required fields', async () => {
    // ...
  });

  it('PUT /course-versions/:id/document-set 400 on non-sequential positions', async () => {
    // ...
  });

  it('cross-tenant: t_2 cannot read commissions of t_1', async () => {
    const app = await bootstrapApp();
    const tokenT1 = signJwtForRole('admin', 't_1', 'u_1');
    const tokenT2 = signJwtForRole('admin', 't_2', 'u_2');
    // create in t_1
    await request(app.getHttpServer())
      .post('/commissions')
      .set('Authorization', `Bearer ${tokenT1}`)
      .set('X-Tenant-Id', 't_1')
      .send({ code: 'C1', name: 'X' });
    // try read from t_2
    const res = await request(app.getHttpServer())
      .get('/commissions')
      .set('Authorization', `Bearer ${tokenT2}`)
      .set('X-Tenant-Id', 't_2');
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
  });
});
```

- [x] **Step 4: Прогнать**

Run: `pnpm -F backend test -- mvp.domains.http`
Expected: PASS. Если миграция permissions не подхватилась в test setup — проверить, что test bootstrap runs миграции.

- [x] **Step 5: Коммит**

```bash
git add apps/backend/migrations/0031_iam_pillar_a_permissions.sql apps/backend/src/modules/mvp/mvp.controller.ts apps/backend/src/modules/mvp/mvp.domains.http.integration.test.ts
git commit -m "feat(backend): add HTTP endpoints for commissions, program meta, course document sets"
```

---

## Task 11: Frontend — /admin/commissions page

**Files:**

- Create: `apps/frontend/app/admin/commissions/page.tsx`
- Create: `apps/frontend/app/admin/commissions/[id]/page.tsx`
- Create: `apps/frontend/src/features/commissions/types.ts`
- Create: `apps/frontend/src/features/commissions/api.ts`
- Create: `apps/frontend/src/features/commissions/use-commissions.ts`
- Create: `apps/frontend/src/features/commissions/commission-list.tsx`
- Create: `apps/frontend/src/features/commissions/commission-form.tsx`
- Create: `apps/frontend/src/features/commissions/members-editor.tsx`
- Create: `apps/frontend/src/features/commissions/use-commissions.test.ts`
- Create: `apps/frontend/src/features/commissions/commission-list.test.tsx`

### Спецификация

Раздел `/admin/commissions` — список комиссий (admin role), фильтр active/archived, создание новой, переход в детальную карточку. Карточка `/admin/commissions/[id]` — редактирование name/description, drag-n-drop редактор членов с ролями и загрузкой подписей.

- [x] **Step 1: Создать types и api клиент**

```typescript
// apps/frontend/src/features/commissions/types.ts
export type CommissionStatus = 'active' | 'archived';
export type CommissionMemberRole =
  | 'chairman'
  | 'deputy_chairman'
  | 'member'
  | 'secretary'
  | 'external_expert';

export interface Commission {
  id: string;
  code: string;
  name: string;
  description?: string;
  status: CommissionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CommissionMember {
  id: string;
  commissionId: string;
  role: CommissionMemberRole;
  userId?: string;
  externalFullName?: string;
  externalPosition?: string;
  signatureFileId?: string;
  positionInOrder: number;
}
```

```typescript
// apps/frontend/src/features/commissions/api.ts
import { mvpApi } from '../../lib/api/client';
import type { Commission, CommissionMember, CommissionStatus, CommissionMemberRole } from './types';

export const commissionsApi = {
  list: (status?: CommissionStatus) =>
    mvpApi.get<{ items: Commission[] }>(`/commissions${status ? `?status=${status}` : ''}`),
  get: (id: string) =>
    mvpApi.get<Commission & { members: CommissionMember[] }>(`/commissions/${id}`),
  create: (body: { code: string; name: string; description?: string }) =>
    mvpApi.post<Commission>('/commissions', body),
  update: (id: string, body: { name?: string; description?: string }) =>
    mvpApi.patch<Commission>(`/commissions/${id}`, body),
  archive: (id: string) => mvpApi.post<Commission>(`/commissions/${id}/archive`, {}),
  addMember: (
    commissionId: string,
    body: {
      role: CommissionMemberRole;
      userId?: string;
      externalFullName?: string;
      externalPosition?: string;
      signatureFileId?: string;
      positionInOrder: number;
    }
  ) => mvpApi.post<CommissionMember>(`/commissions/${commissionId}/members`, body),
  removeMember: (commissionId: string, memberId: string) =>
    mvpApi.delete(`/commissions/${commissionId}/members/${memberId}`)
};
```

- [x] **Step 2: React Query хуки + тесты**

```typescript
// apps/frontend/src/features/commissions/use-commissions.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { commissionsApi } from './api';
import type { CommissionStatus } from './types';

export function useCommissions(status?: CommissionStatus) {
  return useQuery({
    queryKey: ['commissions', status],
    queryFn: () => commissionsApi.list(status).then((r) => r.items)
  });
}

export function useCommission(id: string) {
  return useQuery({
    queryKey: ['commission', id],
    queryFn: () => commissionsApi.get(id),
    enabled: !!id
  });
}

export function useCreateCommission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: commissionsApi.create,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['commissions'] })
  });
}

export function useAddMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      commissionId,
      body
    }: {
      commissionId: string;
      body: Parameters<typeof commissionsApi.addMember>[1];
    }) => commissionsApi.addMember(commissionId, body),
    onSuccess: (_, { commissionId }) =>
      qc.invalidateQueries({ queryKey: ['commission', commissionId] })
  });
}

// ... similar for archive, update, removeMember
```

```typescript
// apps/frontend/src/features/commissions/use-commissions.test.ts
import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCommissions } from './use-commissions';

vi.mock('./api', () => ({
  commissionsApi: {
    list: vi.fn(() => Promise.resolve({ items: [{ id: 'c1', code: 'C1', name: 'C', status: 'active', createdAt: '', updatedAt: '' }] }))
  }
}));

describe('useCommissions', () => {
  it('fetches and returns items', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useCommissions(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(result.current.data?.[0].id).toBe('c1');
  });
});
```

- [x] **Step 3: Список + форма создания (компонент)**

```tsx
// apps/frontend/src/features/commissions/commission-list.tsx
'use client';
import { useState } from 'react';
import { DataTable, LoadingState, StatusChip } from '@cdoprof/ui';
import { useRouter } from 'next/navigation';
import { useCommissions, useCreateCommission } from './use-commissions';
import { SectionCard, SectionEmpty } from '../../components/state-wrappers';

export function CommissionList() {
  const router = useRouter();
  const [filter, setFilter] = useState<'active' | 'archived' | undefined>('active');
  const { data, isLoading, error } = useCommissions(filter);
  const create = useCreateCommission();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');

  return (
    <>
      <SectionCard title="Аттестационные комиссии">
        <div className="ui-inline">
          <select
            value={filter ?? ''}
            onChange={(e) => setFilter((e.target.value as any) || undefined)}
          >
            <option value="active">Активные</option>
            <option value="archived">Архивные</option>
            <option value="">Все</option>
          </select>
        </div>
        {isLoading ? <LoadingState message="Загрузка..." /> : null}
        {error ? <p>Ошибка: {String(error)}</p> : null}
        {data && data.length > 0 ? (
          <DataTable
            columns={[
              { key: 'code', title: 'Код' },
              { key: 'name', title: 'Название' },
              {
                key: 'status',
                title: 'Статус',
                render: (row) => <StatusChip status={row.status} />
              }
            ]}
            rows={data}
            onRowClick={(row) => router.push(`/admin/commissions/${row.id}`)}
          />
        ) : null}
        {data && data.length === 0 ? <SectionEmpty message="Комиссии не созданы" /> : null}
      </SectionCard>

      <SectionCard title="Создать новую комиссию">
        <div className="ui-inline">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Код (напр. OT_2026)"
          />
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Название" />
          <button
            disabled={!code.trim() || !name.trim() || create.isPending}
            onClick={() => {
              create.mutate(
                { code: code.trim(), name: name.trim() },
                {
                  onSuccess: () => {
                    setCode('');
                    setName('');
                  }
                }
              );
            }}
          >
            Создать
          </button>
        </div>
        {create.isError ? <p>Ошибка: {String(create.error)}</p> : null}
      </SectionCard>
    </>
  );
}
```

- [x] **Step 4: Page файлы**

```tsx
// apps/frontend/app/admin/commissions/page.tsx
import { PageContainer, PageHeader } from '../../../src/components/state-wrappers';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';
import { CommissionList } from '../../../src/features/commissions/commission-list';

export default function CommissionsPage() {
  return (
    <ProtectedPage requiredPermission="learning.commissions.read">
      <PageContainer>
        <PageHeader
          title="Аттестационные комиссии"
          subtitle="Управление составами комиссий для регулируемого ДПО"
        />
        <CommissionList />
      </PageContainer>
    </ProtectedPage>
  );
}
```

```tsx
// apps/frontend/app/admin/commissions/[id]/page.tsx
'use client';
import { useParams } from 'next/navigation';
import { PageContainer, PageHeader } from '../../../../src/components/state-wrappers';
import { ProtectedPage } from '../../../../src/widgets/shell/protected-page';
import { useCommission } from '../../../../src/features/commissions/use-commissions';
import { CommissionForm } from '../../../../src/features/commissions/commission-form';
import { MembersEditor } from '../../../../src/features/commissions/members-editor';

export default function CommissionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data } = useCommission(id);
  if (!data) return null;

  return (
    <ProtectedPage requiredPermission="learning.commissions.read">
      <PageContainer>
        <PageHeader
          title={data.name}
          subtitle={`Код: ${data.code} · ${data.status === 'active' ? 'Активна' : 'Архивная'}`}
        />
        <CommissionForm commission={data} />
        <MembersEditor commissionId={id} members={data.members} />
      </PageContainer>
    </ProtectedPage>
  );
}
```

> `MembersEditor` — компонент с drag-n-drop (использовать `@dnd-kit/sortable` или существующий паттерн), upload подписи (через `storage.files` API). Реализация по образцу существующих admin-форм.

- [x] **Step 5: Component-test для списка**

```tsx
// commission-list.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CommissionList } from './commission-list';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('./api', () => ({
  commissionsApi: {
    list: vi.fn(() =>
      Promise.resolve({
        items: [
          { id: 'c1', code: 'OT_2026', name: 'ОТ', status: 'active', createdAt: '', updatedAt: '' }
        ]
      })
    ),
    create: vi.fn()
  }
}));

describe('CommissionList', () => {
  it('renders commissions from API', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <CommissionList />
      </QueryClientProvider>
    );
    await waitFor(() => expect(screen.getByText('OT_2026')).toBeInTheDocument());
    expect(screen.getByText('ОТ')).toBeInTheDocument();
  });
});
```

- [x] **Step 6: Прогнать**

Run: `pnpm -F frontend test -- commissions`
Expected: PASS.

- [x] **Step 7: Manual smoke**

1. `pnpm dev` запустить.
2. Залогиниться как admin (через магическую ссылку).
3. Перейти на `/admin/commissions`.
4. Создать новую комиссию, перейти в карточку, добавить chairman/secretary/2 members.
5. Заархивировать.
6. Проверить, что в admin списке появилась с статусом archived (если фильтр archived выбран).

- [x] **Step 8: Коммит**

```bash
git add apps/frontend/app/admin/commissions/ apps/frontend/src/features/commissions/
git commit -m "feat(frontend): add /admin/commissions list and detail pages with members editor"
```

---

## Task 12: Frontend — course editor program meta tab

**Files:**

- Create: `apps/frontend/src/features/course-editor/program-meta-tab.tsx`
- Create: `apps/frontend/src/features/course-editor/use-program-meta.ts`
- Create: `apps/frontend/src/features/course-editor/program-meta-tab.test.tsx`
- Modify: `apps/frontend/app/courses/[id]/page.tsx` (или существующая страница редактора) — встроить таб

### Спецификация

Таб «Нормативные параметры» в редакторе course_version. Форма:

- Часы (number input, min 1)
- Вид подготовки (select: первичная/повторная/целевая/внеочередная)
- Категория обучаемых (select)
- Форма обучения (select)
- Форма аттестации (select)
- Нормативные акты (multi-select c поиском по `lookup.regulatory_acts`)
- Привязка комиссии (select из активных commissions)
- Загрузка PDF программы (file upload)
- Кнопка «Сохранить»
- Кнопка «Опубликовать» (видна на черновике, выдает 400 с понятным сообщением если поля не заполнены)

- [x] **Step 1: API клиент**

```typescript
// apps/frontend/src/features/course-editor/use-program-meta.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { mvpApi } from '../../lib/api/client';

interface CourseVersion {
  id: string;
  status: 'draft' | 'published' | 'archived';
  academicHours?: number;
  trainingType?: string;
  learnerCategory?: string;
  studyForm?: string;
  finalAssessmentForm?: string;
  regulatoryBasisCodes?: string[];
  programAttachmentFileId?: string;
  commissionId?: string;
}

export function useCourseVersion(id: string) {
  return useQuery({
    queryKey: ['course-version', id],
    queryFn: () => mvpApi.get<CourseVersion>(`/course-versions/${id}`)
  });
}

export function useUpdateProgramMeta(courseVersionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<CourseVersion>) =>
      mvpApi.patch<CourseVersion>(`/course-versions/${courseVersionId}/program-meta`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['course-version', courseVersionId] })
  });
}

export function usePublishCourseVersion(courseVersionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => mvpApi.post<CourseVersion>(`/course-versions/${courseVersionId}/publish`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['course-version', courseVersionId] })
  });
}

export function useRegulatoryActs() {
  return useQuery({
    queryKey: ['regulatory-acts'],
    queryFn: () =>
      mvpApi.get<{ items: { code: string; shortName: string; fullName: string }[] }>(
        '/regulatory-acts'
      )
  });
}
```

> `/regulatory-acts` — read-only endpoint, который надо добавить в `mvp.controller.ts` (или существующий `lookup.controller.ts`, если есть). Минимум: `GET /regulatory-acts → { items: RegulatoryAct[] }`. Добавить в задачи (Task 10 уже не покрывает; можно вписать сюда или в Task 10.5). Для краткости считаем, что добавляется как часть Task 10.

- [x] **Step 2: Форма + select-helpers**

```tsx
// apps/frontend/src/features/course-editor/program-meta-tab.tsx
'use client';
import { useState } from 'react';
import { SectionCard } from '../../components/state-wrappers';
import {
  useCourseVersion,
  useUpdateProgramMeta,
  usePublishCourseVersion,
  useRegulatoryActs
} from './use-program-meta';
import { useCommissions } from '../commissions/use-commissions';

const TRAINING_TYPES = [
  { value: 'primary', label: 'Первичная' },
  { value: 'repeat', label: 'Повторная' },
  { value: 'target', label: 'Целевая' },
  { value: 'extraordinary', label: 'Внеочередная' }
];

const LEARNER_CATEGORIES = [
  { value: 'worker', label: 'Рабочие' },
  { value: 'specialist', label: 'Специалисты' },
  { value: 'manager', label: 'Руководители' },
  { value: 'mixed', label: 'Смешанная' }
];

const STUDY_FORMS = [
  { value: 'in_person', label: 'Очная' },
  { value: 'distance', label: 'Дистанционная' },
  { value: 'blended', label: 'Смешанная' }
];

const ASSESSMENT_FORMS = [
  { value: 'test', label: 'Тест' },
  { value: 'exam', label: 'Экзамен' },
  { value: 'defense', label: 'Защита' },
  { value: 'interview', label: 'Собеседование' }
];

export function ProgramMetaTab({ courseVersionId }: { courseVersionId: string }) {
  const { data: cv } = useCourseVersion(courseVersionId);
  const { data: acts } = useRegulatoryActs();
  const { data: commissions } = useCommissions('active');
  const update = useUpdateProgramMeta(courseVersionId);
  const publish = usePublishCourseVersion(courseVersionId);

  const [form, setForm] = useState({
    academicHours: cv?.academicHours,
    trainingType: cv?.trainingType,
    learnerCategory: cv?.learnerCategory,
    studyForm: cv?.studyForm,
    finalAssessmentForm: cv?.finalAssessmentForm,
    regulatoryBasisCodes: cv?.regulatoryBasisCodes ?? [],
    commissionId: cv?.commissionId
  });

  if (!cv) return null;

  const readOnly = cv.status !== 'draft';

  return (
    <SectionCard title="Нормативные параметры программы">
      {readOnly ? (
        <p className="ui-text-warning">
          Программа опубликована — параметры доступны только для просмотра.
        </p>
      ) : null}

      <div className="ui-stack">
        <label>
          Часы (академические)
          <input
            type="number"
            min={1}
            value={form.academicHours ?? ''}
            onChange={(e) =>
              setForm({ ...form, academicHours: Number(e.target.value) || undefined })
            }
            disabled={readOnly}
          />
        </label>

        <label>
          Вид подготовки
          <select
            value={form.trainingType ?? ''}
            onChange={(e) => setForm({ ...form, trainingType: e.target.value || undefined })}
            disabled={readOnly}
          >
            <option value="">— выберите —</option>
            {TRAINING_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        {/* Аналогично для learnerCategory, studyForm, finalAssessmentForm */}

        <label>
          Нормативные акты
          <select
            multiple
            value={form.regulatoryBasisCodes}
            onChange={(e) =>
              setForm({
                ...form,
                regulatoryBasisCodes: Array.from(e.target.selectedOptions, (o) => o.value)
              })
            }
            disabled={readOnly}
          >
            {acts?.items.map((a) => (
              <option key={a.code} value={a.code}>
                {a.shortName}
              </option>
            ))}
          </select>
        </label>

        <label>
          Аттестационная комиссия
          <select
            value={form.commissionId ?? ''}
            onChange={(e) => setForm({ ...form, commissionId: e.target.value || undefined })}
            disabled={readOnly}
          >
            <option value="">— выберите комиссию —</option>
            {commissions?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.name}
              </option>
            ))}
          </select>
        </label>

        {!readOnly && (
          <div className="ui-inline">
            <button onClick={() => update.mutate(form)} disabled={update.isPending}>
              Сохранить черновик
            </button>
            <button
              onClick={() => publish.mutate()}
              disabled={publish.isPending}
              className="ui-button--primary"
            >
              Опубликовать
            </button>
          </div>
        )}
        {publish.isError ? (
          <p className="ui-text-error">Не удалось опубликовать: {String(publish.error)}</p>
        ) : null}
      </div>
    </SectionCard>
  );
}
```

- [x] **Step 3: Тест компонента**

```tsx
// program-meta-tab.test.tsx — минимально:
// - renders form fields when course version is draft
// - shows readOnly state when published
// - calls update.mutate on Сохранить click
// - shows error message on publish failure
```

- [x] **Step 4: Интегрировать в редактор курса**

В `apps/frontend/app/courses/[id]/page.tsx` (или специфичной странице редактора версии курса) добавить таб. Если редактор — это разные routes, не одна страница с табами — создать `app/courses/[id]/versions/[v]/program-meta/page.tsx`.

- [x] **Step 5: Прогнать тесты**

Run: `pnpm -F frontend test -- program-meta`
Expected: PASS.

- [x] **Step 6: Manual smoke**

1. Перейти на страницу редактора курса.
2. Заполнить часы=40, виды подготовки=первичная, и т.д.
3. Сохранить черновик.
4. Нажать опубликовать без commission → ошибка.
5. Привязать commission → опубликовать успешно.
6. После публикации форма становится read-only.

- [x] **Step 7: Коммит**

```bash
git add apps/frontend/src/features/course-editor/ apps/frontend/app/courses/
git commit -m "feat(frontend): add program meta tab in course editor with publish flow"
```

---

## Task 13: Frontend — course editor document set tab

**Files:**

- Create: `apps/frontend/src/features/course-editor/document-set-tab.tsx`
- Create: `apps/frontend/src/features/course-editor/use-document-set.ts`
- Create: `apps/frontend/src/features/course-editor/document-set-tab.test.tsx`

### Спецификация

Таб «Выходные документы» в редакторе course_version. UI:

- Список текущих entries (templateId, position, isRequired, autoIssueOnCompletion)
- Кнопка «Добавить документ» → modal с выбором шаблона из `documents.templates` (фильтр по `template_type` подходящему для регулируемого ДПО)
- Drag-n-drop для изменения position
- Чекбоксы «Обязательный» и «Авто-выпуск»
- Кнопка «Сохранить»

- [x] **Step 1: Хуки**

```typescript
// use-document-set.ts
export function useDocumentSet(courseVersionId: string) {
  return useQuery({
    queryKey: ['course-document-set', courseVersionId],
    queryFn: () =>
      mvpApi.get<{ items: DocumentSetEntry[] }>(`/course-versions/${courseVersionId}/document-set`)
  });
}

export function useSaveDocumentSet(courseVersionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entries: DocumentSetEntryInput[]) =>
      mvpApi.put<{ items: DocumentSetEntry[] }>(
        `/course-versions/${courseVersionId}/document-set`,
        { entries }
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['course-document-set', courseVersionId] })
  });
}

export function useTemplates() {
  return useQuery({
    queryKey: ['documents-templates'],
    queryFn: () =>
      mvpApi.get<{ items: { id: string; name: string; templateType: string }[] }>('/templates')
  });
}
```

- [x] **Step 2: Компонент (drag-n-drop с @dnd-kit или без — простой UP/DOWN)**

```tsx
export function DocumentSetTab({ courseVersionId }: { courseVersionId: string }) {
  const { data: entries } = useDocumentSet(courseVersionId);
  const { data: templates } = useTemplates();
  const save = useSaveDocumentSet(courseVersionId);

  const [draft, setDraft] = useState<DocumentSetEntryInput[]>([]);

  // init draft from entries when loaded
  useEffect(() => {
    if (entries)
      setDraft(
        entries.items.map((e) => ({
          templateId: e.templateId,
          position: e.position,
          isRequired: e.isRequired,
          autoIssueOnCompletion: e.autoIssueOnCompletion
        }))
      );
  }, [entries]);

  const addEntry = (templateId: string) => {
    setDraft([
      ...draft,
      {
        templateId,
        position: draft.length,
        isRequired: true,
        autoIssueOnCompletion: true
      }
    ]);
  };

  const removeEntry = (idx: number) => {
    setDraft(draft.filter((_, i) => i !== idx).map((e, i) => ({ ...e, position: i })));
  };

  const move = (idx: number, delta: number) => {
    const newIdx = idx + delta;
    if (newIdx < 0 || newIdx >= draft.length) return;
    const arr = [...draft];
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    setDraft(arr.map((e, i) => ({ ...e, position: i })));
  };

  return (
    <SectionCard title="Выходные документы курса">
      {/* Table of entries with up/down buttons + edit + remove */}
      {draft.map((e, idx) => {
        const tpl = templates?.items.find((t) => t.id === e.templateId);
        return (
          <div key={idx} className="ui-inline">
            <span>
              {idx + 1}. {tpl?.name ?? '(шаблон не найден)'}
            </span>
            <span className="ui-text-muted">{tpl?.templateType}</span>
            <label>
              <input
                type="checkbox"
                checked={e.isRequired}
                onChange={(ev) =>
                  setDraft(
                    draft.map((x, i) => (i === idx ? { ...x, isRequired: ev.target.checked } : x))
                  )
                }
              />{' '}
              Обязательный
            </label>
            <label>
              <input
                type="checkbox"
                checked={e.autoIssueOnCompletion}
                onChange={(ev) =>
                  setDraft(
                    draft.map((x, i) =>
                      i === idx ? { ...x, autoIssueOnCompletion: ev.target.checked } : x
                    )
                  )
                }
              />{' '}
              Авто-выпуск
            </label>
            <button onClick={() => move(idx, -1)} disabled={idx === 0}>
              ↑
            </button>
            <button onClick={() => move(idx, 1)} disabled={idx === draft.length - 1}>
              ↓
            </button>
            <button onClick={() => removeEntry(idx)}>Удалить</button>
          </div>
        );
      })}

      <div className="ui-inline">
        <select
          onChange={(e) => {
            if (e.target.value) {
              addEntry(e.target.value);
              e.target.value = '';
            }
          }}
        >
          <option value="">— добавить шаблон —</option>
          {templates?.items.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.templateType})
            </option>
          ))}
        </select>
      </div>

      <button onClick={() => save.mutate(draft)} disabled={save.isPending}>
        Сохранить
      </button>
      {save.isError ? <p>Ошибка: {String(save.error)}</p> : null}
    </SectionCard>
  );
}
```

- [x] **Step 3: Тест**

```tsx
// document-set-tab.test.tsx
// - rendering empty list
// - adding entry from template select
// - moving up/down updates positions
// - removing entry renumbers positions
// - save.mutate called with correct entries
```

- [x] **Step 4: Прогнать тесты**

Run: `pnpm -F frontend test -- document-set`
Expected: PASS.

- [x] **Step 5: Manual smoke**

1. На редакторе course_version открыть таб «Выходные документы».
2. Добавить шаблон сертификата.
3. Добавить шаблон протокола.
4. Поменять их местами.
5. Сохранить.
6. Завершить какое-нибудь зачисление по этому курсу.
7. Проверить в `/documents` — выпущены оба документа.

- [x] **Step 6: Полный прогон всех тестов**

Run: `pnpm -s ci:check`
Expected: PASS (lint, typecheck, backend tests, frontend tests, e2e).

- [x] **Step 7: Коммит**

```bash
git add apps/frontend/src/features/course-editor/document-set-tab.tsx apps/frontend/src/features/course-editor/use-document-set.ts apps/frontend/src/features/course-editor/document-set-tab.test.tsx
git commit -m "feat(frontend): add document set tab in course editor"
```

---

## Verification

После всех 13 задач прогнать полный quality gate:

```bash
pnpm -s ci:check
```

Ожидаемый результат:

- ESLint: 0 errors
- TypeScript: 0 errors
- Backend tests: PASS (новые: ~30 unit, ~6 HTTP, ~3 migration → +39 тестов)
- Frontend tests: PASS (новые: ~10 хуки/компоненты)
- E2E: existing flows continue to work; новый сценарий «программа с пакетом документов → завершение → пакет выдан» работает

Проверить manually:

1. `/admin/commissions` — создать комиссию, добавить chairman + secretary + member.
2. Редактор курса → таб «Нормативные параметры»: заполнить, привязать комиссию, опубликовать.
3. Редактор курса → таб «Выходные документы»: настроить пакет из 2 шаблонов.
4. Создать группу с этим курсом, зачислить ученика, завершить курс.
5. `/documents` → проверить, что выпущены 2 документа в правильном порядке.

---

## Self-Review (выполнен перед сохранением плана)

**Spec coverage:**

- §5.1 Регуляторная мета программы → Tasks 2, 3, 6, 12.
- §5.2 Аттестационная комиссия → Tasks 1, 3, 5, 11.
- §5.3 Per-course конфигурация документов → Tasks 2, 3, 7, 8, 13.
- §5.5 Категории переменных program/commission → Task 9.
- §4 (schema) → Tasks 1, 2.
- §7 (RBAC, audit) → Tasks 5, 6, 7, 10 (audit calls в каждом сервисном методе).
- §9 (тесты) → 30+ unit, 6 HTTP, 3 migration, ~10 frontend.

**Placeholder scan:** Все шаги содержат конкретный код или конкретные команды; references только к существующим helper-функциям (`createMvpService`, `createTestDatabase`, `setupMvpServiceWithTemplates`) с описанием паттерна.

**Type consistency:** `Commission`, `CommissionMember`, `CourseDocumentSetEntry`, `ProgramMeta` использованы согласованно от Task 3 (определение) через Tasks 5-7 (сервис) до Tasks 11-13 (frontend). Имена методов (`createCommission`, `addCommissionMember`, `setCourseDocumentSet`) идентичны во всех ссылках.

**Out of scope (Plan B / C):**

- Категории переменных `enrollment` / `document` / `group_learners` → Plan B.
- Расширение `template_type` enum (diploma/attestation/...) → Plan B.
- Книга выдачи / приказы по группам → Plan B.
- QR / revocation / лицензии / личное дело → Plan C.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-22-regulated-training-foundation-a.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** — я диспатчу свежий подагент на каждую задачу, review между задачами, быстрая итерация.

**2. Inline Execution** — выполнение задач в текущей сессии через `superpowers:executing-plans`, batch-выполнение с checkpoints для review.

Которое выбираете?
