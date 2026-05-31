# Выгрузка в реестр обученных по ОТ (Минтруд/ЕИСОТ) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **STATUS — 2026-05-31: ✅ РЕАЛИЗОВАНО** на ветке `feat/2026-05-31-eisot-ot-trained-registry-export` (subagent-driven, 8 слайсов = задачи 1–18). Tests: backend **102** / frontend **10** зелёные; `tsc` backend+frontend 0; ESLint clean. Backend-ревью APPROVED-with-fixes (commit `143f437`). Пошаговые `- [ ]` ниже намеренно не проставлялись (per [PLANS_STATUS](PLANS_STATUS.md) — факт сверяется по git+файлам, не по галочкам). PR pending. **Остаётся:** подставить 3 официальных артефакта ЛКОТ (§13 спеки) — точный классификатор в seed `0045`, колонки офиц. `.xlsx` в `COLUMNS`, формат файла-ответа в `RESPONSE_COLUMNS`.

**Goal:** Учебный центр одной кнопкой формирует корректный Excel-файл для реестра обученных по ОТ (Минтруд, ПП №2464), скачивает его для ручной загрузки в ЛКОТ, а затем загружает файл-ответ реестра, чтобы присвоенные регистрационные номера сохранились в CDOProf.

**Architecture:** Фича живёт в **MVP-модуле** (request-scoped состояние, durable через Postgres-backend MVP), а не в in-memory `integrations`-оркестраторе. Источник строк — существующие сущности (зачисления → группа → контрагент-работодатель, версия курса, протокол-документ, `ExamResult`). Чистые функции (preflight-валидация, построение строк, парсинг ответа) изолированы и юнит-тестируемы; `OtRegistryService` (request-scoped) их оркестрирует, генерирует `.xlsx` через `exceljs`, кладёт файл в `storage.files`, персистит batch + per-record. Классификатор программ — глобальная lookup-таблица (как `lookup.regulatory_acts`). Адаптерный шов `EisotAdapter` НЕ трогаем — он остаётся для будущей прямой API-отправки (Phase 4).

**Tech Stack:** NestJS (backend), `exceljs` (новая зависимость, генерация/чтение `.xlsx`), `@aws-sdk/client-s3` (уже есть — добавляем `putObject`), Postgres (миграция 0045), Next.js 15 (frontend), vitest.

---

## Отклонения от спеки (зафиксированы по итогам разведки кода)

| #   | Спека говорила                                                                  | План делает                                                           | Почему                                                                                                                                           |
| --- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | Approach A — наполнить `EisotAdapter`, переиспользовать `ExportItem.externalId` | Реализуем в MVP-модуле с durable batch/records; адаптер не трогаем    | `integrations` — in-memory, синхронный, пишет 1 summary-item на задачу → обратная загрузка номеров (дни спустя) и пер-record хранение невозможны |
| D2  | Отдельная таблица `learning.course_version_ot_programs` (1:N)                   | Поле `course_versions.ot_program_codes text[]`                        | Точная копия существующего `regulatory_basis_codes text[]`; 1:N сохраняется (массив), без новой таблицы и FK-машинерии                           |
| D3  | Проставлять рег. номер «в карточку и в документ-протокол»                       | Храним рег. номер на durable record + показываем в карточке слушателя | Мутации `documentNumber` у выданных протоколов нет (номера присваиваются только при генерации); менять выпущенный PDF рискованно                 |

**Внешние данные (спека §13) — три изолированные константы, не блокируют код:** точные `registry_id` классификатора программ; точные заголовки/порядок колонок официального `.xlsx`; формат файла-ответа. Каждая локализована в одном месте (seed-блок миграции / маппинг колонок writer'а / маппинг колонок парсера). Задачи 2, 9, 12 помечают, что эти константы сверяются с официальным источником ЛКОТ; логика от них не зависит.

---

## File Structure

**Backend — создать:**

- `apps/backend/migrations/0045_ot_registry_export.sql` — lookup-таблица + seed классификатора, колонка `ot_program_codes`, права `regulatory.export.read/write`.
- `apps/backend/src/modules/mvp/ot-registry/ot-registry-preflight.ts` — чистые функции валидации строки.
- `apps/backend/src/modules/mvp/ot-registry/ot-registry-rows.ts` — чистая сборка строк (разворот человек×программа).
- `apps/backend/src/modules/mvp/ot-registry/ot-registry-xlsx.writer.ts` — `OtRegistryXlsxWriter` (генерация `.xlsx`).
- `apps/backend/src/modules/mvp/ot-registry/ot-registry-response.parser.ts` — чистый парсинг+сопоставление файла-ответа.
- `apps/backend/src/modules/mvp/ot-registry/ot-registry.service.ts` — `OtRegistryService` (Scope.REQUEST, оркестрация).
- `apps/backend/src/modules/mvp/ot-registry/ot-registry.controller.ts` — эндпоинты `/ot-registry/*`.
- Тесты рядом: `*.test.ts` для preflight / rows / writer / parser / service, `ot-registry.http.integration.test.ts`.

**Backend — изменить:**

- `apps/backend/package.json` — dep `exceljs`.
- `apps/backend/src/modules/mvp/mvp.types.ts` — `ProgramMeta.otProgramCodes?`, `OtTrainingProgram`, `OtRegistryBatch`, `OtRegistryRecord`, `OtRegistryRow`, `OtRegistryExportOutcome`, `OtRegistryResponseRow`.
- `apps/backend/src/modules/mvp/infrastructure/mvp-collections.ts` — регистрация `otRegistryBatches`, `otRegistryRecords`.
- `apps/backend/src/modules/mvp/mvp.service.ts` — `listOtTrainingPrograms()`, `updateCourseVersionProgramMeta` принимает `otProgramCodes`.
- `apps/backend/src/modules/mvp/dto/*` — расширить ProgramMeta-DTO + новые DTO выгрузки/ответа.
- `apps/backend/src/modules/mvp/mvp.module.ts` — провайдеры `OtRegistryService`, `OtRegistryXlsxWriter`, контроллер.
- `apps/backend/src/infrastructure/storage/storage.client.ts` + `s3-storage.client.ts` — метод `putObject`.
- `apps/backend/src/modules/files/files.service.ts` — `register` принимает `antivirusStatus` (для self-generated `'clean'`).

**Frontend — создать:**

- `apps/frontend/src/features/gov-export/api.ts` — мутации выгрузки/загрузки ответа.
- `apps/frontend/src/features/gov-export/hooks.ts` — `useOtTrainingPrograms`, `useOtRegistryBatches`.
- `apps/frontend/src/features/gov-export/api.contract.test.ts`.
- `apps/frontend/src/e2e/ot-registry-export.e2e.test.ts`.

**Frontend — изменить:**

- `apps/frontend/app/gov-export/page.tsx` — секция «Реестр обученных по ОТ».
- `apps/frontend/src/features/mvp/screens.tsx` — мультиселект программ ОТ в `ProgramMetaSection`.
- `apps/frontend/src/features/mvp/api.ts` + `hooks.ts` — `otProgramCodes` в `ProgramMetaPatch`.
- `apps/frontend/src/features/navigation/model.ts` — `/gov-export` под `regulatory.export.read`.

**Docs:** `README.md` §2, `LMS_AGENT_HANDOFF.md` §5.99, `docs/superpowers/plans/PLANS_STATUS.md`.

---

## Соглашения по командам (Windows + кириллический путь)

- Один backend-тест: `pnpm --filter @cdoprof/backend exec vitest run <path> --no-file-parallelism`
- Один frontend-тест: `pnpm --filter @cdoprof/frontend exec vitest run <path> --no-file-parallelism`
- Lint одного файла: `npx eslint <path> --max-warnings=0`
- Не запускать полный `pnpm test:backend` локально (краш `tinypool` на кириллице) — полагаемся на изолированные файлы + CI.
- Коммиты — Conventional Commits, scope `feat(backend)`/`feat(frontend)`/`docs(plan)`.

---

### Task 1: Зависимость `exceljs`

**Files:**

- Modify: `apps/backend/package.json`

- [ ] **Step 1: Добавить зависимость**

Run: `pnpm --filter @cdoprof/backend add exceljs@^4.4.0`
Expected: `package.json` deps содержит `"exceljs": "^4.4.0"`, `pnpm-lock.yaml` обновлён.

- [ ] **Step 2: Проверить импорт типов**

Run: `pnpm --filter @cdoprof/backend exec tsc --noEmit -p tsconfig.json` (или `pnpm typecheck`)
Expected: PASS (exceljs поставляет собственные типы).

- [ ] **Step 3: Commit**

```bash
git add apps/backend/package.json pnpm-lock.yaml
git commit -m "chore(backend): add exceljs for registry export generation"
```

---

### Task 2: Миграция 0045 — классификатор, поле маппинга, права

**Files:**

- Create: `apps/backend/migrations/0045_ot_registry_export.sql`
- Test: `apps/backend/src/modules/.../migrations.test.ts` (добавить кейс; найти существующий файл миграционных тестов через `pnpm test:migrations`)

> **Внешние данные:** `registry_id` и точные `exact_name` ниже — сверить с официальным классификатором ЛКОТ (спека §13 #3). Ниже засеяны канонические программы ПП №2464 с уверенными наименованиями; расширить до полного официального списка тем же шаблоном `INSERT`. Код фичи ссылается на `code`, поэтому дополнение seed не меняет код.

- [ ] **Step 1: Написать миграцию**

```sql
-- migration 0045: ОТ-реестр — классификатор программ (lookup), маппинг на курс, права.

-- 1. Глобальный классификатор программ обучения по ОТ (не мультитенантный, как regulatory_acts).
CREATE TABLE IF NOT EXISTS lookup.ot_training_programs (
  code         text PRIMARY KEY,            -- внутренний стабильный код, на него ссылается course_versions.ot_program_codes
  registry_id  integer NOT NULL,            -- ID программы в реестре Минтруда (сверить с офиц. классификатором)
  exact_name   text NOT NULL,               -- наименование СТРОГО как в реестре
  program_kind text NOT NULL,               -- 'A' | 'B' | 'V' | 'first_aid' | 'siz' | 'other'
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ot_programs_kind_chk CHECK (program_kind IN ('A','B','V','first_aid','siz','other')),
  CONSTRAINT ot_programs_registry_id_uniq UNIQUE (registry_id)
);

INSERT INTO lookup.ot_training_programs (code, registry_id, exact_name, program_kind) VALUES
  ('OT_A',          1, 'Обучение по общим вопросам охраны труда и функционирования системы управления охраной труда', 'A'),
  ('OT_B',          2, 'Обучение безопасным методам и приёмам выполнения работ при воздействии вредных и (или) опасных производственных факторов, источников опасности, идентифицированных в рамках специальной оценки условий труда и оценки профессиональных рисков', 'B'),
  ('OT_V',          3, 'Обучение безопасным методам и приёмам выполнения работ повышенной опасности', 'V'),
  ('OT_FIRST_AID',  4, 'Обучение по оказанию первой помощи пострадавшим', 'first_aid'),
  ('OT_SIZ',        5, 'Обучение по использованию (применению) средств индивидуальной защиты', 'siz')
ON CONFLICT (code) DO NOTHING;

COMMENT ON TABLE lookup.ot_training_programs IS
  'Классификатор программ обучения по ОТ (ПП 2464). registry_id/exact_name сверяются с официальным реестром Минтруда (ЛКОТ).';

-- 2. Маппинг версии курса → программы реестра (массив кодов, по аналогии с regulatory_basis_codes).
ALTER TABLE learning.course_versions
  ADD COLUMN IF NOT EXISTS ot_program_codes text[];

-- 3. Права на формирование/загрузку выгрузки (выгрузка содержит ПДн → отдельное право).
INSERT INTO iam.permissions (id, code, description) VALUES
  ('p_regulatory_export_read',  'regulatory.export.read',  'Read regulatory export batches/records'),
  ('p_regulatory_export_write', 'regulatory.export.write', 'Create regulatory exports and import registry responses')
ON CONFLICT (id) DO NOTHING;

INSERT INTO iam.role_permissions (id, tenant_id, role_id, permission_id)
SELECT concat('rp_', r.id, '_', p.id), r.tenant_id, r.id, p.id
FROM iam.roles r
JOIN iam.permissions p ON true
WHERE r.tenant_id = 'tenant_demo'
  AND (
    (r.code IN ('platform_admin','tenant_admin') AND p.code IN ('regulatory.export.read','regulatory.export.write'))
    OR (r.code IN ('methodist','manager') AND p.code = 'regulatory.export.read')
  )
ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING;
```

- [ ] **Step 2: Прогнать миграции и подтвердить применение**

Run: `pnpm test:migrations`
Expected: PASS; миграция 0045 применяется без ошибок.

- [ ] **Step 3: Добавить тест наличия объектов**

В существующий миграционный тест добавить проверки: таблица `lookup.ot_training_programs` существует и содержит ≥5 строк; `learning.course_versions` имеет колонку `ot_program_codes`; права `regulatory.export.read/write` присутствуют в `iam.permissions`.

```sql
-- пример проверок (адаптировать под раннер миграционных тестов)
SELECT count(*) FROM lookup.ot_training_programs;                 -- >= 5
SELECT 1 FROM information_schema.columns
  WHERE table_schema='learning' AND table_name='course_versions' AND column_name='ot_program_codes';
SELECT code FROM iam.permissions WHERE code LIKE 'regulatory.export.%'; -- 2 строки
```

- [ ] **Step 4: Запустить тест**

Run: `pnpm test:migrations`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/migrations/0045_ot_registry_export.sql apps/backend/src/modules/**/migrations*.ts
git commit -m "feat(backend): migration 0045 — ОТ registry program classifier, course mapping, perms"
```

---

### Task 2 уточнение масштаба

Если миграционные тесты ожидают «один концерн на файл» — разбить 0045 на 0045/0046/0047 (lookup / column / perms). По образцу `0030` бандл допустим; начинать с одного файла.

---

### Task 3: Типы

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.types.ts`

- [ ] **Step 1: Добавить типы**

```ts
// === ОТ-реестр (Минтруд/ЕИСОТ) ===

/** Глобальный классификатор программ ОТ (lookup.ot_training_programs). */
export interface OtTrainingProgram {
  code: string;
  registryId: number;
  exactName: string;
  programKind: 'A' | 'B' | 'V' | 'first_aid' | 'siz' | 'other';
  isActive: boolean;
}

/** Одна выгружаемая строка реестра = человек × программа. */
export interface OtRegistryRow {
  enrollmentId: string;
  learnerId: string;
  fullName: string;
  snils: string;
  position: string;
  employerInn: string;
  programCode: string;
  programRegistryId: number;
  programName: string;
  protocolNumber: string;
  knowledgeCheckDate: string; // ДД.ММ.ГГГГ
  result: 'удовлетворительно' | 'неудовлетворительно';
}

export interface OtRegistryRowError {
  enrollmentId: string;
  learnerId: string;
  fullName: string;
  field: string;
  message: string;
}

export type OtRegistryBatchStatus = 'generated' | 'partial' | 'failed';

export interface OtRegistryBatch extends BaseEntity {
  sourceFilterJson: Record<string, unknown>;
  fileId?: string;
  totalCandidates: number;
  exportedRows: number;
  failedRows: number;
  batchStatus: OtRegistryBatchStatus;
  generatedBy: string;
}

export interface OtRegistryRecord extends BaseEntity {
  batchId: string;
  enrollmentId: string;
  learnerId: string;
  snils: string;
  programCode: string;
  programRegistryId: number;
  protocolNumber: string;
  registrationNumber?: string; // приходит из файла-ответа реестра
}

export interface OtRegistryExportOutcome {
  batchId: string;
  fileId?: string;
  total: number;
  exported: number;
  failed: number;
  rows: OtRegistryRow[];
  errors: OtRegistryRowError[];
}

/** Строка файла-ответа реестра (после парсинга). */
export interface OtRegistryResponseRow {
  snils: string;
  protocolNumber: string;
  programRegistryId: number;
  registrationNumber: string;
}

export interface OtRegistryImportOutcome {
  matched: number;
  unmatched: number;
  unmatchedRows: OtRegistryResponseRow[];
}
```

И расширить `ProgramMeta` (около `:523`):

```ts
  /** Коды программ ОТ-реестра (lookup.ot_training_programs.code); комплексный курс = несколько. */
  otProgramCodes?: string[];
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @cdoprof/backend exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/modules/mvp/mvp.types.ts
git commit -m "feat(backend): ОТ registry types + ProgramMeta.otProgramCodes"
```

---

### Task 4: Чтение классификатора (`listOtTrainingPrograms` + эндпоинт)

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.service.ts` (рядом с `listRegulatoryActs`, `:4406`)
- Modify: `apps/backend/src/modules/mvp/mvp.controller.ts`
- Test: `apps/backend/src/modules/mvp/ot-registry/ot-registry-lookup.test.ts`

- [ ] **Step 1: Тест на сервис-метод (failing)**

```ts
import { describe, it, expect } from 'vitest';
import { makeServices } from '../learners-bulk-import.service.test.js'; // переиспользовать helper, если экспортирован; иначе локальный
// Если makeServices не экспортирован — создать локальный фабричный helper по образцу из learners-bulk-import.service.test.ts.

describe('listOtTrainingPrograms', () => {
  it('returns seeded ОТ programs from lookup', () => {
    const { service } = makeServices();
    const programs = service.listOtTrainingPrograms();
    expect(programs.length).toBeGreaterThanOrEqual(5);
    expect(programs.find((p) => p.programKind === 'first_aid')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Запустить — FAIL**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/ot-registry/ot-registry-lookup.test.ts --no-file-parallelism`
Expected: FAIL — `service.listOtTrainingPrograms is not a function`.

- [ ] **Step 3: Реализовать метод**

В `mvp.service.ts` (по образцу `listRegulatoryActs`, читающего lookup):

```ts
listOtTrainingPrograms(): OtTrainingProgram[] {
  return this.state.otTrainingPrograms
    .filter((p) => p.isActive)
    .sort((a, b) => a.registryId - b.registryId);
}
```

> Lookup-данные загружаются так же, как `regulatoryActs` (см. как они попадают в `state` — глобальный seed грузится backend'ом при старте/в тестовом сиде). Если `regulatoryActs` приходят из Postgres lookup-загрузчика — добавить `otTrainingPrograms` в тот же загрузчик и в тестовый сид-фикстуру.

- [ ] **Step 4: Эндпоинт чтения**

В `mvp.controller.ts` добавить (без RBAC — справочник, как acts):

```ts
@Get('ot-training-programs')
listOtTrainingPrograms() {
  return this.mvp.listOtTrainingPrograms();
}
```

- [ ] **Step 5: Запустить — PASS**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/ot-registry/ot-registry-lookup.test.ts --no-file-parallelism`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/mvp/mvp.service.ts apps/backend/src/modules/mvp/mvp.controller.ts apps/backend/src/modules/mvp/ot-registry/ot-registry-lookup.test.ts
git commit -m "feat(backend): list ОТ training programs (lookup read + endpoint)"
```

---

### Task 5: Маппинг курс→программы в program-meta

**Files:**

- Modify: `apps/backend/src/modules/mvp/dto/<program-meta-patch>.dto.ts` (найти класс `ProgramMetaPatch`/обновления program-meta — он валидирует `regulatoryBasisCodes`)
- Modify: `apps/backend/src/modules/mvp/mvp.service.ts` (`updateCourseVersionProgramMeta`)
- Test: `apps/backend/src/modules/mvp/ot-registry/program-meta-ot-codes.test.ts`

- [ ] **Step 1: Тест (failing)**

```ts
describe('updateCourseVersionProgramMeta — otProgramCodes', () => {
  it('persists ot_program_codes onto the course version', () => {
    const { service, ctx } = makeServices();
    const cv = service.createCourseDraftWithVersion(/* существующий путь создания версии */, ctx);
    service.updateCourseVersionProgramMeta(cv.versionId, { otProgramCodes: ['OT_A', 'OT_FIRST_AID'] }, ctx);
    const updated = service.getCourseVersion(ctx.tenantId, cv.versionId);
    expect(updated.otProgramCodes).toEqual(['OT_A', 'OT_FIRST_AID']);
  });
});
```

> Точные имена методов создания версии взять из соседних тестов program-meta (поискать существующий тест, который зовёт `updateCourseVersionProgramMeta`).

- [ ] **Step 2: FAIL**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/ot-registry/program-meta-ot-codes.test.ts --no-file-parallelism`
Expected: FAIL — `otProgramCodes` не сохраняется.

- [ ] **Step 3: Расширить DTO**

В классе program-meta-patch (рядом с полем `regulatoryBasisCodes`):

```ts
@IsOptional()
@IsArray()
@IsString({ each: true })
otProgramCodes?: string[];
```

- [ ] **Step 4: Persist в сервисе**

В `updateCourseVersionProgramMeta` (где применяются прочие поля meta) добавить:

```ts
if (patch.otProgramCodes !== undefined) version.otProgramCodes = patch.otProgramCodes;
```

- [ ] **Step 5: PASS**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/ot-registry/program-meta-ot-codes.test.ts --no-file-parallelism`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/mvp/dto apps/backend/src/modules/mvp/mvp.service.ts apps/backend/src/modules/mvp/ot-registry/program-meta-ot-codes.test.ts
git commit -m "feat(backend): map course version to ОТ registry programs (otProgramCodes)"
```

---

### Task 6: Preflight-валидация (чистые функции)

**Files:**

- Create: `apps/backend/src/modules/mvp/ot-registry/ot-registry-preflight.ts`
- Test: `apps/backend/src/modules/mvp/ot-registry/ot-registry-preflight.test.ts`

- [ ] **Step 1: Тесты (failing)**

```ts
import { describe, it, expect } from 'vitest';
import { validateRegistryRow } from './ot-registry-preflight.js';
import type { OtRegistryRow } from '../mvp.types.js';

const valid: OtRegistryRow = {
  enrollmentId: 'enr_1',
  learnerId: 'lrn_1',
  fullName: 'Иванов Иван Иванович',
  snils: '112-233-445 95',
  position: 'Слесарь',
  employerInn: '7707083893',
  programCode: 'OT_A',
  programRegistryId: 1,
  programName: 'Обучение по общим вопросам охраны труда...',
  protocolNumber: 'ПР-12/2026',
  knowledgeCheckDate: '10.03.2026',
  result: 'удовлетворительно'
};

describe('validateRegistryRow', () => {
  it('passes a fully valid row', () => {
    expect(validateRegistryRow(valid)).toEqual([]);
  });
  it('rejects bad СНИЛС checksum', () => {
    const errs = validateRegistryRow({ ...valid, snils: '112-233-445 00' });
    expect(errs.some((e) => e.field === 'snils')).toBe(true);
  });
  it('rejects ИНН of wrong length', () => {
    const errs = validateRegistryRow({ ...valid, employerInn: '123' });
    expect(errs.some((e) => e.field === 'employerInn')).toBe(true);
  });
  it('requires position, protocolNumber, date', () => {
    const errs = validateRegistryRow({
      ...valid,
      position: '',
      protocolNumber: '',
      knowledgeCheckDate: ''
    });
    expect(errs.map((e) => e.field).sort()).toEqual([
      'knowledgeCheckDate',
      'position',
      'protocolNumber'
    ]);
  });
});
```

- [ ] **Step 2: FAIL**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/ot-registry/ot-registry-preflight.test.ts --no-file-parallelism`
Expected: FAIL — модуль не существует.

- [ ] **Step 3: Реализовать**

```ts
import { normalizeSnils, isValidSnilsChecksum } from '../learners-bulk-import.service.js';
import type { OtRegistryRow, OtRegistryRowError } from '../mvp.types.js';

const INN_RE = /^[0-9]{10}$|^[0-9]{12}$/;
const DATE_RE = /^[0-3][0-9]\.[0-1][0-9]\.[0-9]{4}$/;

export function validateRegistryRow(row: OtRegistryRow): OtRegistryRowError[] {
  const errs: OtRegistryRowError[] = [];
  const push = (field: string, message: string) =>
    errs.push({
      enrollmentId: row.enrollmentId,
      learnerId: row.learnerId,
      fullName: row.fullName,
      field,
      message
    });

  if (!row.fullName?.trim()) push('fullName', 'ФИО отсутствует');
  const snils = normalizeSnils(row.snils ?? '');
  if (snils.length !== 11 || !isValidSnilsChecksum(snils)) push('snils', 'Некорректный СНИЛС');
  if (!INN_RE.test(row.employerInn ?? ''))
    push('employerInn', 'ИНН работодателя должен быть 10 или 12 цифр');
  if (!row.position?.trim()) push('position', 'Должность отсутствует');
  if (!row.protocolNumber?.trim()) push('protocolNumber', 'Номер протокола отсутствует');
  if (!DATE_RE.test(row.knowledgeCheckDate ?? ''))
    push('knowledgeCheckDate', 'Дата должна быть в формате ДД.ММ.ГГГГ');
  if (!row.programCode || !row.programRegistryId)
    push('programCode', 'Курс не сопоставлен программе реестра');
  if (!row.programName?.trim()) push('programName', 'Наименование программы отсутствует');
  return errs;
}
```

- [ ] **Step 4: PASS**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/ot-registry/ot-registry-preflight.test.ts --no-file-parallelism`
Expected: PASS (4 теста).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/mvp/ot-registry/ot-registry-preflight.ts apps/backend/src/modules/mvp/ot-registry/ot-registry-preflight.test.ts
git commit -m "feat(backend): ОТ registry preflight validation (СНИЛС/ИНН/required/mapping)"
```

---

### Task 7: Сборка строк (разворот человек×программа, чистая функция)

**Files:**

- Create: `apps/backend/src/modules/mvp/ot-registry/ot-registry-rows.ts`
- Test: `apps/backend/src/modules/mvp/ot-registry/ot-registry-rows.test.ts`

«Bundle» — это уже собранные сервисом сущности по одному зачислению; чистая функция только маппит и разворачивает.

- [ ] **Step 1: Тесты (failing)**

```ts
import { describe, it, expect } from 'vitest';
import { buildRegistryRows, type EnrollmentBundle } from './ot-registry-rows.js';

const bundle: EnrollmentBundle = {
  enrollment: { id: 'enr_1', learnerId: 'lrn_1', status: 'completed' } as any,
  learner: {
    id: 'lrn_1',
    firstName: 'Иван',
    lastName: 'Иванов',
    middleName: 'Иванович',
    snils: '112-233-445 95',
    position: 'Слесарь'
  } as any,
  employerInn: '7707083893',
  protocol: { documentNumber: 'ПР-12/2026', documentDate: '2026-03-10' } as any,
  examPassed: true,
  programs: [
    { code: 'OT_A', registryId: 1, exactName: 'Программа А ...', programKind: 'A', isActive: true },
    {
      code: 'OT_FIRST_AID',
      registryId: 4,
      exactName: 'Первая помощь ...',
      programKind: 'first_aid',
      isActive: true
    }
  ]
};

describe('buildRegistryRows', () => {
  it('fans out one row per program for a комплексный курс', () => {
    const rows = buildRegistryRows([bundle]);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.programRegistryId)).toEqual([1, 4]);
    expect(rows[0].fullName).toBe('Иванов Иван Иванович');
    expect(rows[0].knowledgeCheckDate).toBe('10.03.2026');
    expect(rows[0].result).toBe('удовлетворительно');
  });
  it('marks неудовлетворительно when exam not passed', () => {
    const rows = buildRegistryRows([{ ...bundle, examPassed: false }]);
    expect(rows[0].result).toBe('неудовлетворительно');
  });
});
```

- [ ] **Step 2: FAIL**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/ot-registry/ot-registry-rows.test.ts --no-file-parallelism`
Expected: FAIL.

- [ ] **Step 3: Реализовать**

```ts
import type {
  Counterparty,
  Enrollment,
  Learner,
  OtRegistryRow,
  OtTrainingProgram
} from '../mvp.types.js';
import type { GeneratedDocumentEntity } from '../../documents/documents.types.js';

export interface EnrollmentBundle {
  enrollment: Enrollment;
  learner: Learner;
  employerInn: string;
  protocol: Pick<GeneratedDocumentEntity, 'documentNumber' | 'documentDate'>;
  examPassed: boolean;
  programs: OtTrainingProgram[];
}

const fmtDate = (iso: string): string => {
  // ISO 'YYYY-MM-DD' (или с временем) → 'ДД.ММ.ГГГГ'
  const [y, m, d] = iso.slice(0, 10).split('-');
  return d && m && y ? `${d}.${m}.${y}` : '';
};

const fullName = (l: Learner): string =>
  [l.lastName, l.firstName, l.middleName].filter(Boolean).join(' ').trim();

export function buildRegistryRows(bundles: EnrollmentBundle[]): OtRegistryRow[] {
  const rows: OtRegistryRow[] = [];
  for (const b of bundles) {
    for (const p of b.programs) {
      rows.push({
        enrollmentId: b.enrollment.id,
        learnerId: b.learner.id,
        fullName: fullName(b.learner),
        snils: b.learner.snils ?? '',
        position: b.learner.position ?? '',
        employerInn: b.employerInn ?? '',
        programCode: p.code,
        programRegistryId: p.registryId,
        programName: p.exactName,
        protocolNumber: b.protocol.documentNumber ?? '',
        knowledgeCheckDate: fmtDate(b.protocol.documentDate ?? ''),
        result: b.examPassed ? 'удовлетворительно' : 'неудовлетворительно'
      });
    }
  }
  return rows;
}
```

- [ ] **Step 4: PASS**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/ot-registry/ot-registry-rows.test.ts --no-file-parallelism`
Expected: PASS (2 теста).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/mvp/ot-registry/ot-registry-rows.ts apps/backend/src/modules/mvp/ot-registry/ot-registry-rows.test.ts
git commit -m "feat(backend): build ОТ registry rows (person×program fan-out)"
```

---

### Task 8: Запись файла в хранилище (`putObject` + register clean)

**Files:**

- Modify: `apps/backend/src/infrastructure/storage/storage.client.ts` (интерфейс)
- Modify: `apps/backend/src/infrastructure/storage/s3-storage.client.ts`
- Modify: `apps/backend/src/modules/files/files.service.ts` (`register` принимает `antivirusStatus`)
- Test: `apps/backend/src/infrastructure/storage/s3-storage.client.test.ts` (добавить кейс или новый файл)

- [ ] **Step 1: Тест (failing)** — мокаем S3 client `send`

```ts
import { describe, it, expect, vi } from 'vitest';
import { S3StorageClient } from './s3-storage.client.js';

describe('S3StorageClient.putObject', () => {
  it('sends a PutObjectCommand with body', async () => {
    const send = vi.fn().mockResolvedValue({});
    const client = new S3StorageClient(/* config */);
    (client as unknown as { client: { send: typeof send } }).client = { send } as any;
    await client.putObject({
      key: 'tenant/x/file.xlsx',
      body: Buffer.from('abc'),
      contentType: 'application/octet-stream'
    });
    expect(send).toHaveBeenCalledOnce();
  });
});
```

> Точную форму конструктора `S3StorageClient` взять из файла; если он берёт config из env — адаптировать инициализацию мока.

- [ ] **Step 2: FAIL**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/infrastructure/storage/s3-storage.client.test.ts --no-file-parallelism`
Expected: FAIL — `putObject` не существует.

- [ ] **Step 3: Реализовать**

В интерфейсе `StorageClient`:

```ts
putObject(params: { key: string; body: Buffer; contentType: string }): Promise<void>;
```

В `S3StorageClient` (использует уже импортированный `PutObjectCommand`):

```ts
async putObject(params: { key: string; body: Buffer; contentType: string }): Promise<void> {
  await this.client.send(new PutObjectCommand({
    Bucket: this.bucket,
    Key: params.key,
    Body: params.body,
    ContentType: params.contentType
  }));
}
```

В `FilesService.register` добавить опциональный статус (для self-generated файлов — `'clean'`, чтобы AV-гейт скачивания не блокировал):

```ts
async register(metadata: Omit<FileMetadata, 'id' | 'createdAt'> & { bucketName?: string; antivirusStatus?: string }): Promise<FileMetadata> {
  const antivirusStatus = metadata.antivirusStatus ?? 'pending';
  // ... использовать antivirusStatus в INSERT вместо хардкода 'pending'
}
```

- [ ] **Step 4: PASS**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/infrastructure/storage/s3-storage.client.test.ts --no-file-parallelism`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/infrastructure/storage apps/backend/src/modules/files/files.service.ts apps/backend/src/infrastructure/storage/s3-storage.client.test.ts
git commit -m "feat(backend): StorageClient.putObject + FilesService clean-register for self-generated files"
```

---

### Task 9: Генератор `.xlsx` (`OtRegistryXlsxWriter`)

**Files:**

- Create: `apps/backend/src/modules/mvp/ot-registry/ot-registry-xlsx.writer.ts`
- Test: `apps/backend/src/modules/mvp/ot-registry/ot-registry-xlsx.writer.test.ts`

> **Внешние данные:** точные заголовки/порядок колонок официального шаблона ЛКОТ (спека §13 #1). `COLUMNS` ниже — единственное место маппинга; сверить и поправить строки заголовков по официальному `.xlsx`. Тест читает файл обратно через `exceljs` и проверяет структуру и значения.

- [ ] **Step 1: Тест (failing)**

```ts
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { OtRegistryXlsxWriter } from './ot-registry-xlsx.writer.js';
import type { OtRegistryRow } from '../mvp.types.js';

const row: OtRegistryRow = {
  enrollmentId: 'e1',
  learnerId: 'l1',
  fullName: 'Иванов Иван Иванович',
  snils: '112-233-445 95',
  position: 'Слесарь',
  employerInn: '7707083893',
  programCode: 'OT_A',
  programRegistryId: 1,
  programName: 'Программа А',
  protocolNumber: 'ПР-12/2026',
  knowledgeCheckDate: '10.03.2026',
  result: 'удовлетворительно'
};

describe('OtRegistryXlsxWriter', () => {
  it('writes a workbook readable back with the expected header + values', async () => {
    const buffer = await new OtRegistryXlsxWriter().build([row]);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.worksheets[0];
    expect(ws.getRow(1).getCell(3).value).toBe('ФИО'); // 3-я колонка — ФИО
    const dataRow = ws.getRow(2);
    expect(dataRow.getCell(3).value).toBe('Иванов Иван Иванович');
    expect(dataRow.getCell(4).value).toBe('112-233-445 95');
    expect(dataRow.getCell(10).value).toBe('удовлетворительно');
  });
});
```

- [ ] **Step 2: FAIL**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/ot-registry/ot-registry-xlsx.writer.test.ts --no-file-parallelism`
Expected: FAIL — модуль не существует.

- [ ] **Step 3: Реализовать**

```ts
import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { OtRegistryRow } from '../mvp.types.js';

// Единственное место маппинга поле→колонка. Сверить заголовки с офиц. шаблоном ЛКОТ (спека §13 #1).
const COLUMNS: { header: string; key: keyof OtRegistryRow; width: number }[] = [
  { header: 'ID программы', key: 'programRegistryId', width: 12 },
  { header: 'Наименование программы', key: 'programName', width: 60 },
  { header: 'ФИО', key: 'fullName', width: 30 },
  { header: 'СНИЛС', key: 'snils', width: 16 },
  { header: 'Должность', key: 'position', width: 24 },
  { header: 'ИНН работодателя', key: 'employerInn', width: 16 },
  { header: 'Номер протокола', key: 'protocolNumber', width: 18 },
  { header: 'Дата проверки знаний', key: 'knowledgeCheckDate', width: 18 },
  { header: 'Результат', key: 'result', width: 18 }
];

@Injectable()
export class OtRegistryXlsxWriter {
  readonly contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  async build(rows: OtRegistryRow[]): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Обученные');
    ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key as string, width: c.width }));
    for (const r of rows)
      ws.addRow(COLUMNS.reduce((acc, c) => ({ ...acc, [c.key]: r[c.key] }), {}));
    ws.getRow(1).font = { bold: true };
    return (await wb.xlsx.writeBuffer()) as Buffer;
  }
}
```

> Тест в Step 1 проверяет колонку 3 = «ФИО». При корректировке `COLUMNS` под офиц. шаблон — обновить и индексы в тесте (заголовок остаётся SSOT).

- [ ] **Step 4: PASS**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/ot-registry/ot-registry-xlsx.writer.test.ts --no-file-parallelism`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/mvp/ot-registry/ot-registry-xlsx.writer.ts apps/backend/src/modules/mvp/ot-registry/ot-registry-xlsx.writer.test.ts
git commit -m "feat(backend): ОТ registry .xlsx writer (exceljs, golden-file test)"
```

---

### Task 10: `OtRegistryService` — сбор, preflight, файл, персист batch+records

**Files:**

- Create: `apps/backend/src/modules/mvp/ot-registry/ot-registry.service.ts`
- Modify: `apps/backend/src/modules/mvp/infrastructure/mvp-collections.ts` (регистрация коллекций)
- Modify: `apps/backend/src/modules/mvp/mvp.module.ts` (провайдеры)
- Modify: `apps/backend/src/modules/mvp/infrastructure/in-memory-mvp.state.ts` (массивы `otRegistryBatches`, `otRegistryRecords`, `otTrainingProgram` — см. Task 4)
- Test: `apps/backend/src/modules/mvp/ot-registry/ot-registry.service.test.ts`

- [ ] **Step 1: Зарегистрировать коллекции**

В `mvp-collections.ts` добавить ключи `otRegistryBatches`, `otRegistryRecords` (по образцу `examResults`/`commissions`). В `InMemoryMvpState` добавить поля-массивы.

- [ ] **Step 2: Тест сервиса (failing)** — стиль `makeServices()` из `learners-bulk-import.service.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { makeOtRegistryService } from './ot-registry.service.test-helpers.js'; // локальный фабричный helper

describe('OtRegistryService.exportOtRegistry', () => {
  it('exports valid rows, persists batch+records, stores a file', async () => {
    const { service, seed, ctx, storage } = makeOtRegistryService();
    seed.completedOtEnrollment({
      snils: '112-233-445 95',
      inn: '7707083893',
      programs: ['OT_A', 'OT_FIRST_AID'],
      passed: true,
      protocolNo: 'ПР-1',
      protocolDate: '2026-03-10'
    });
    const outcome = await service.exportOtRegistry(ctx.tenantId, { groupId: 'g1' }, ctx);
    expect(outcome.exported).toBe(2); // 2 программы
    expect(outcome.failed).toBe(0);
    expect(outcome.fileId).toBeTruthy();
    expect(storage.put).toHaveBeenCalledOnce();
  });

  it('reports per-row errors and partial status for bad СНИЛС', async () => {
    const { service, seed, ctx } = makeOtRegistryService();
    seed.completedOtEnrollment({
      snils: '000-000-000 00',
      inn: '7707083893',
      programs: ['OT_A'],
      passed: true,
      protocolNo: 'ПР-2',
      protocolDate: '2026-03-10'
    });
    const outcome = await service.exportOtRegistry(ctx.tenantId, { groupId: 'g1' }, ctx);
    expect(outcome.failed).toBe(1);
    expect(outcome.errors[0].field).toBe('snils');
  });
});
```

- [ ] **Step 3: FAIL**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/ot-registry/ot-registry.service.test.ts --no-file-parallelism`
Expected: FAIL.

- [ ] **Step 4: Реализовать сервис**

```ts
import { Inject, Injectable, Scope } from '@nestjs/common';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import { MvpService } from '../mvp.service.js';
import { DocumentsService } from '../../documents/documents.service.js';
import { FilesService } from '../../files/files.service.js';
import {
  STORAGE_CLIENT,
  type StorageClient
} from '../../../infrastructure/storage/storage.client.js';
import { OtRegistryXlsxWriter } from './ot-registry-xlsx.writer.js';
import { buildRegistryRows, type EnrollmentBundle } from './ot-registry-rows.js';
import { validateRegistryRow } from './ot-registry-preflight.js';
import type { RequestContext } from '../../../common/request-context.js';
import type {
  OtRegistryBatch,
  OtRegistryExportOutcome,
  OtRegistryRecord,
  OtRegistryRow
} from '../mvp.types.js';

@Injectable({ scope: Scope.REQUEST })
export class OtRegistryService {
  constructor(
    @Inject(InMemoryMvpState) private readonly state: InMemoryMvpState,
    private readonly mvp: MvpService,
    private readonly documents: DocumentsService,
    private readonly files: FilesService,
    @Inject(STORAGE_CLIENT) private readonly storage: StorageClient,
    private readonly xlsx: OtRegistryXlsxWriter
  ) {}

  async exportOtRegistry(
    tenantId: string,
    filter: { groupId?: string; clientId?: string; enrolledFrom?: string; enrolledTo?: string },
    ctx: RequestContext
  ): Promise<OtRegistryExportOutcome> {
    const programsByCode = new Map(this.mvp.listOtTrainingPrograms().map((p) => [p.code, p]));
    const enrollments = this.mvp
      .listEnrollments(tenantId, {
        group_id: filter.groupId,
        enrolled_from: filter.enrolledFrom,
        enrolled_to: filter.enrolledTo,
        page_size: 1000
      })
      .items.filter((e) => e.status === 'completed');

    const bundles: EnrollmentBundle[] = [];
    for (const enrollment of enrollments) {
      const learner = this.mvp.getLearner(tenantId, enrollment.learnerId);
      const group = this.mvp.getGroup(tenantId, enrollment.groupId);
      const employerInn = group.counterpartyId
        ? (this.mvp.getCounterparty(tenantId, group.counterpartyId).inn ?? '')
        : '';
      const groupCourse = this.mvp.listGroupCourses(tenantId, { group_id: enrollment.groupId })
        .items[0];
      const cv = groupCourse?.courseVersionId
        ? this.mvp.getCourseVersion(tenantId, groupCourse.courseVersionId)
        : undefined;
      const codes = cv?.otProgramCodes ?? [];
      const programs = codes.map((c) => programsByCode.get(c)).filter(Boolean) as NonNullable<
        ReturnType<typeof programsByCode.get>
      >[];
      const protocols = this.documents.listDocuments(tenantId, {
        documentType: 'protocol',
        sourceEntityType: 'enrollment',
        sourceEntityId: enrollment.id,
        pageSize: 1
      }).items;
      const exam = this.mvp.getExamResultByEnrollment(tenantId, enrollment.id)[0];
      bundles.push({
        enrollment,
        learner,
        employerInn,
        protocol: {
          documentNumber: protocols[0]?.documentNumber ?? '',
          documentDate: protocols[0]?.documentDate ?? ''
        },
        examPassed: Boolean(exam?.passed),
        programs: programs.length
          ? programs
          : [{ code: '', registryId: 0, exactName: '', programKind: 'other', isActive: true }] // пустая программа → preflight отметит «не сопоставлен»
      });
    }

    const rows = buildRegistryRows(bundles);
    const valid: OtRegistryRow[] = [];
    const errors = [];
    for (const r of rows) {
      const rowErrors = validateRegistryRow(r);
      if (rowErrors.length) errors.push(...rowErrors);
      else valid.push(r);
    }

    const batch: OtRegistryBatch = {
      id: `otb_${this.mvp.newId()}`,
      tenantId,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      sourceFilterJson: filter,
      totalCandidates: rows.length,
      exportedRows: valid.length,
      failedRows: errors.length,
      batchStatus: errors.length ? (valid.length ? 'partial' : 'failed') : 'generated',
      generatedBy: ctx.userId ?? ''
    };

    let fileId: string | undefined;
    if (valid.length) {
      const buffer = await this.xlsx.build(valid);
      const meta = await this.files.register({
        tenantId,
        fileName: `ot-registry-${batch.id}.xlsx`,
        mimeType: this.xlsx.contentType,
        sizeBytes: buffer.length,
        antivirusStatus: 'clean'
      } as never);
      await this.storage.putObject({
        key: `${tenantId}/ot-registry/${meta.id}.xlsx`,
        body: buffer,
        contentType: this.xlsx.contentType
      });
      fileId = meta.id;
      batch.fileId = fileId;
    }
    this.state.otRegistryBatches.push(batch);
    for (const r of valid) {
      const rec: OtRegistryRecord = {
        id: `otr_${this.mvp.newId()}`,
        tenantId,
        status: 'active',
        createdAt: batch.createdAt,
        updatedAt: batch.createdAt,
        batchId: batch.id,
        enrollmentId: r.enrollmentId,
        learnerId: r.learnerId,
        snils: r.snils,
        programCode: r.programCode,
        programRegistryId: r.programRegistryId,
        protocolNumber: r.protocolNumber
      };
      this.state.otRegistryRecords.push(rec);
    }
    this.mvp.audit(
      tenantId,
      ctx.userId,
      'regulatory.ot_registry_exported',
      'ot_registry_batch',
      batch.id,
      undefined,
      { exported: valid.length, failed: errors.length },
      ctx
    );
    return {
      batchId: batch.id,
      fileId,
      total: rows.length,
      exported: valid.length,
      failed: errors.length,
      rows: valid,
      errors
    };
  }
}
```

> `this.mvp.newId()` / `this.mvp.audit(...)` — использовать существующие хелперы `MvpService` (проверить имена: id-генератор и `audit` уже применяются по всему сервису). Если приватные — добавить тонкие публичные обёртки или сгенерировать id локально.
> `STORAGE_CLIENT` токен — проверить фактический DI-токен StorageClient в модуле инфраструктуры.

- [ ] **Step 5: Провайдеры в модуле**

В `mvp.module.ts` добавить в `providers`: `OtRegistryService`, `OtRegistryXlsxWriter`; убедиться, что `DocumentsModule`/`FilesModule`/storage доступны (MVP уже инжектит documents+files — см. конструктор `MvpService`).

- [ ] **Step 6: PASS**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/ot-registry/ot-registry.service.test.ts --no-file-parallelism`
Expected: PASS (2 теста).

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/mvp/ot-registry/ot-registry.service.ts apps/backend/src/modules/mvp/ot-registry/ot-registry.service.test.ts apps/backend/src/modules/mvp/infrastructure apps/backend/src/modules/mvp/mvp.module.ts
git commit -m "feat(backend): OtRegistryService — gather, preflight, generate .xlsx, persist batch/records"
```

---

### Task 11: Эндпоинты выгрузки + RBAC + HTTP-integration

**Files:**

- Create: `apps/backend/src/modules/mvp/ot-registry/ot-registry.controller.ts`
- Create: `apps/backend/src/modules/mvp/dto/ot-registry-export.dto.ts`
- Modify: `apps/backend/src/modules/mvp/mvp.module.ts` (controller)
- Test: `apps/backend/src/modules/mvp/ot-registry/ot-registry.http.integration.test.ts`

- [ ] **Step 1: DTO**

```ts
import { IsOptional, IsString } from 'class-validator';
export class CreateOtRegistryExportDto {
  @IsOptional() @IsString() groupId?: string;
  @IsOptional() @IsString() clientId?: string;
  @IsOptional() @IsString() enrolledFrom?: string;
  @IsOptional() @IsString() enrolledTo?: string;
}
```

- [ ] **Step 2: HTTP-integration тест (failing)** — стаб-контроллер по образцу `mvp.http.integration.test.ts`, проверяем границу прав `regulatory.export.write`

```ts
// boot минимального Nest-приложения со стаб-контроллером, который требует RequirePermissions('regulatory.export.write')
// — assert 403 без права, 201 c правом. Шаблон строго по mvp.http.integration.test.ts.
```

- [ ] **Step 3: FAIL**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/ot-registry/ot-registry.http.integration.test.ts --no-file-parallelism`
Expected: FAIL.

- [ ] **Step 4: Контроллер**

```ts
import { Body, Controller, Get, Param, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { MvpRequestPersistenceInterceptor } from '../infrastructure/mvp-request-persistence.interceptor.js';
import { TenantGuard } from '../../iam/guards/tenant.guard.js';
import { PermissionGuard } from '../../iam/guards/permission.guard.js';
import { RequirePermissions } from '../../iam/decorators/require-permissions.decorator.js';
import { CurrentContext, type RequestContext } from '../../../common/request-context.js';
import { assertValidDto } from '../../../common/app-validation.pipe.js';
import { OtRegistryService } from './ot-registry.service.js';
import { CreateOtRegistryExportDto } from '../dto/ot-registry-export.dto.js';

@Controller('ot-registry')
@UseInterceptors(MvpRequestPersistenceInterceptor)
@UseGuards(TenantGuard)
export class OtRegistryController {
  constructor(private readonly service: OtRegistryService) {}

  @Post('exports')
  @UseGuards(PermissionGuard)
  @RequirePermissions('regulatory.export.write')
  async createExport(@CurrentContext() ctx: RequestContext, @Body() body: unknown) {
    const dto = assertValidDto(CreateOtRegistryExportDto, body);
    return this.service.exportOtRegistry(ctx.tenantId!, dto, ctx);
  }

  @Get('exports')
  @UseGuards(PermissionGuard)
  @RequirePermissions('regulatory.export.read')
  listExports(@CurrentContext() ctx: RequestContext) {
    return this.service.listBatches(ctx.tenantId!);
  }

  @Get('exports/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('regulatory.export.read')
  getExport(@CurrentContext() ctx: RequestContext, @Param('id') id: string) {
    return this.service.getBatchWithRecords(ctx.tenantId!, id);
  }

  @Get('exports/:id/file')
  @UseGuards(PermissionGuard)
  @RequirePermissions('regulatory.export.read')
  async getFile(@CurrentContext() ctx: RequestContext, @Param('id') id: string) {
    return this.service.getBatchDownloadUrl(ctx.tenantId!, id);
  }
}
```

> Добавить в `OtRegistryService`: `listBatches`, `getBatchWithRecords`, `getBatchDownloadUrl` (последний — через `FilesService.createDownloadUrl(tenantId, fileId)`). Точные пути импортов guard'ов/декораторов взять из любого MVP-контроллера, использующего `@RequirePermissions`.

- [ ] **Step 5: PASS**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/ot-registry/ot-registry.http.integration.test.ts --no-file-parallelism`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/mvp/ot-registry/ot-registry.controller.ts apps/backend/src/modules/mvp/dto/ot-registry-export.dto.ts apps/backend/src/modules/mvp/mvp.module.ts apps/backend/src/modules/mvp/ot-registry/ot-registry.http.integration.test.ts
git commit -m "feat(backend): ОТ registry export endpoints + RBAC boundary"
```

---

### Task 12: Парсинг файла-ответа + сопоставление (чистые функции)

**Files:**

- Create: `apps/backend/src/modules/mvp/ot-registry/ot-registry-response.parser.ts`
- Test: `apps/backend/src/modules/mvp/ot-registry/ot-registry-response.parser.test.ts`

> **Внешние данные:** формат файла-ответа (спека §13 #2). `RESPONSE_COLUMNS` ниже — единственное место маппинга; сверить с реальным файлом. Логика сопоставления (СНИЛС+протокол+ID программы) формат-независима.

- [ ] **Step 1: Тесты (failing)**

```ts
import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { parseRegistryResponse, matchResponseToRecords } from './ot-registry-response.parser.js';
import type { OtRegistryRecord } from '../mvp.types.js';

async function buildResponseXlsx(
  rows: { snils: string; protocol: string; programId: number; regNo: string }[]
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('resp');
  ws.addRow(['СНИЛС', 'Номер протокола', 'ID программы', 'Регистрационный номер']);
  rows.forEach((r) => ws.addRow([r.snils, r.protocol, r.programId, r.regNo]));
  return (await wb.xlsx.writeBuffer()) as Buffer;
}

describe('registry response round-trip', () => {
  it('parses rows and matches by snils+protocol+programId', async () => {
    const buf = await buildResponseXlsx([
      { snils: '112-233-445 95', protocol: 'ПР-1', programId: 1, regNo: 'РН-777' }
    ]);
    const parsed = await parseRegistryResponse(buf);
    expect(parsed).toHaveLength(1);
    const records: OtRegistryRecord[] = [
      {
        id: 'r1',
        tenantId: 't',
        status: 'active',
        createdAt: '',
        updatedAt: '',
        batchId: 'b1',
        enrollmentId: 'e1',
        learnerId: 'l1',
        snils: '112-233-445 95',
        programCode: 'OT_A',
        programRegistryId: 1,
        protocolNumber: 'ПР-1'
      }
    ];
    const result = matchResponseToRecords(parsed, records);
    expect(result.matched).toBe(1);
    expect(records[0].registrationNumber).toBe('РН-777');
  });
  it('reports unmatched response rows', async () => {
    const buf = await buildResponseXlsx([
      { snils: '999-999-999 99', protocol: 'X', programId: 9, regNo: 'РН-1' }
    ]);
    const parsed = await parseRegistryResponse(buf);
    const result = matchResponseToRecords(parsed, []);
    expect(result.unmatched).toBe(1);
  });
});
```

- [ ] **Step 2: FAIL**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/ot-registry/ot-registry-response.parser.test.ts --no-file-parallelism`
Expected: FAIL.

- [ ] **Step 3: Реализовать**

```ts
import ExcelJS from 'exceljs';
import type {
  OtRegistryImportOutcome,
  OtRegistryRecord,
  OtRegistryResponseRow
} from '../mvp.types.js';

// Сверить с реальным файлом-ответом (спека §13 #2): индексы колонок 1..4.
const RESPONSE_COLUMNS = {
  snils: 1,
  protocolNumber: 2,
  programRegistryId: 3,
  registrationNumber: 4
};

export async function parseRegistryResponse(buffer: Buffer): Promise<OtRegistryResponseRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  const rows: OtRegistryResponseRow[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return; // header
    const cell = (i: number) => String(row.getCell(i).value ?? '').trim();
    const snils = cell(RESPONSE_COLUMNS.snils);
    const registrationNumber = cell(RESPONSE_COLUMNS.registrationNumber);
    if (!snils || !registrationNumber) return;
    rows.push({
      snils,
      protocolNumber: cell(RESPONSE_COLUMNS.protocolNumber),
      programRegistryId: Number(cell(RESPONSE_COLUMNS.programRegistryId)),
      registrationNumber
    });
  });
  return rows;
}

const key = (snils: string, protocol: string, programId: number) =>
  `${snils.replace(/\D/g, '')}|${protocol}|${programId}`;

export function matchResponseToRecords(
  response: OtRegistryResponseRow[],
  records: OtRegistryRecord[]
): OtRegistryImportOutcome {
  const byKey = new Map(
    records.map((r) => [key(r.snils, r.protocolNumber, r.programRegistryId), r])
  );
  let matched = 0;
  const unmatchedRows: OtRegistryResponseRow[] = [];
  for (const row of response) {
    const rec = byKey.get(key(row.snils, row.protocolNumber, row.programRegistryId));
    if (rec) {
      rec.registrationNumber = row.registrationNumber;
      rec.updatedAt = new Date().toISOString();
      matched += 1;
    } else unmatchedRows.push(row);
  }
  return { matched, unmatched: unmatchedRows.length, unmatchedRows };
}
```

- [ ] **Step 4: PASS**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/ot-registry/ot-registry-response.parser.test.ts --no-file-parallelism`
Expected: PASS (2 теста).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/mvp/ot-registry/ot-registry-response.parser.ts apps/backend/src/modules/mvp/ot-registry/ot-registry-response.parser.test.ts
git commit -m "feat(backend): parse + match registry response (reg numbers round-trip)"
```

---

### Task 13: Сервис+эндпоинт обратной загрузки + аудит

**Files:**

- Modify: `apps/backend/src/modules/mvp/ot-registry/ot-registry.service.ts` (`importRegistryResponse`)
- Modify: `apps/backend/src/modules/mvp/ot-registry/ot-registry.controller.ts`
- Create: `apps/backend/src/modules/mvp/dto/ot-registry-import.dto.ts`
- Test: добавить кейс в `ot-registry.service.test.ts`

- [ ] **Step 1: DTO**

```ts
import { IsString } from 'class-validator';
export class ImportOtRegistryResponseDto {
  @IsString() fileBase64!: string; // .xlsx файла-ответа, base64
}
```

- [ ] **Step 2: Тест сервиса (failing)**

```ts
it('imports registry response and stamps registration numbers', async () => {
  const { service, seed, ctx } = makeOtRegistryService();
  seed.completedOtEnrollment({
    snils: '112-233-445 95',
    inn: '7707083893',
    programs: ['OT_A'],
    passed: true,
    protocolNo: 'ПР-1',
    protocolDate: '2026-03-10'
  });
  const exported = await service.exportOtRegistry(ctx.tenantId, { groupId: 'g1' }, ctx);
  const responseBuffer = await seed.buildResponse([
    { snils: '112-233-445 95', protocol: 'ПР-1', programId: 1, regNo: 'РН-777' }
  ]);
  const outcome = await service.importRegistryResponse(
    ctx.tenantId,
    exported.batchId,
    responseBuffer.toString('base64'),
    ctx
  );
  expect(outcome.matched).toBe(1);
  const detail = service.getBatchWithRecords(ctx.tenantId, exported.batchId);
  expect(detail.records[0].registrationNumber).toBe('РН-777');
});
```

- [ ] **Step 3: FAIL**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/ot-registry/ot-registry.service.test.ts --no-file-parallelism`
Expected: FAIL.

- [ ] **Step 4: Реализовать метод сервиса**

```ts
async importRegistryResponse(tenantId: string, batchId: string, fileBase64: string, ctx: RequestContext): Promise<OtRegistryImportOutcome> {
  const records = this.state.otRegistryRecords.filter((r) => r.tenantId === tenantId && r.batchId === batchId);
  const parsed = await parseRegistryResponse(Buffer.from(fileBase64, 'base64'));
  const outcome = matchResponseToRecords(parsed, records);
  this.mvp.audit(tenantId, ctx.userId, 'regulatory.ot_registry_response_imported', 'ot_registry_batch', batchId, undefined, { matched: outcome.matched, unmatched: outcome.unmatched }, ctx);
  return outcome;
}
```

(импортировать `parseRegistryResponse`, `matchResponseToRecords`, тип `OtRegistryImportOutcome`.)

- [ ] **Step 5: Эндпоинт**

```ts
@Post('exports/:id/registry-response')
@UseGuards(PermissionGuard) @RequirePermissions('regulatory.export.write')
async importResponse(@CurrentContext() ctx: RequestContext, @Param('id') id: string, @Body() body: unknown) {
  const dto = assertValidDto(ImportOtRegistryResponseDto, body);
  return this.service.importRegistryResponse(ctx.tenantId!, id, dto.fileBase64, ctx);
}
```

- [ ] **Step 6: PASS**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/ot-registry/ot-registry.service.test.ts --no-file-parallelism`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/modules/mvp/ot-registry apps/backend/src/modules/mvp/dto/ot-registry-import.dto.ts
git commit -m "feat(backend): import registry response, stamp reg numbers + audit"
```

---

### Task 14: Frontend — API-слой + хуки + контракт-тесты

**Files:**

- Create: `apps/frontend/src/features/gov-export/api.ts`
- Create: `apps/frontend/src/features/gov-export/hooks.ts`
- Create: `apps/frontend/src/features/gov-export/types.ts`
- Test: `apps/frontend/src/features/gov-export/api.contract.test.ts`

- [ ] **Step 1: Контракт-тест (failing)** — по образцу `bulk-enrollments/api.contract.test.ts`

```ts
// envelope() + vi.stubGlobal('fetch') + dynamic import('./api') после set env.
it('posts export filter and unwraps outcome', async () => {
  fetchMock.mockResolvedValueOnce(
    new Response(envelope({ batchId: 'b1', exported: 2, failed: 0, rows: [], errors: [] }), {
      status: 201
    })
  );
  const result = await govExportApi.createOtRegistryExport(session, { groupId: 'g1' });
  expect(result.batchId).toBe('b1');
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url).toContain('/ot-registry/exports');
  expect(init.method).toBe('POST');
});
```

- [ ] **Step 2: FAIL**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/features/gov-export/api.contract.test.ts --no-file-parallelism`
Expected: FAIL.

- [ ] **Step 3: API-слой** (паттерн `withAuth` из `bulk-enrollments/api.ts`)

```ts
import { apiRequest } from '../../lib/api/client';
import type { UserSession } from '../auth/types';
import type {
  OtRegistryExportOutcome,
  OtRegistryImportOutcome,
  OtRegistryBatch,
  OtTrainingProgram
} from './types';

const withAuth = (s: UserSession) => ({
  auth: { userId: s.user.id, tenantId: s.user.tenantId, accessToken: s.tokens.accessToken }
});

export const govExportApi = {
  listOtTrainingPrograms: () => apiRequest<OtTrainingProgram[]>('/ot-training-programs'),
  createOtRegistryExport: (
    s: UserSession,
    body: { groupId?: string; clientId?: string; enrolledFrom?: string; enrolledTo?: string }
  ) =>
    apiRequest<OtRegistryExportOutcome>('/ot-registry/exports', {
      method: 'POST',
      body,
      ...withAuth(s)
    }),
  listBatches: (s: UserSession) =>
    apiRequest<OtRegistryBatch[]>('/ot-registry/exports', withAuth(s)),
  importResponse: (s: UserSession, batchId: string, fileBase64: string) =>
    apiRequest<OtRegistryImportOutcome>(`/ot-registry/exports/${batchId}/registry-response`, {
      method: 'POST',
      body: { fileBase64 },
      ...withAuth(s)
    })
};
```

`hooks.ts`: `useOtTrainingPrograms()` (React Query, как `useRegulatoryActs`), `useOtRegistryBatches(session)`. `types.ts`: зеркало backend-типов.

- [ ] **Step 4: PASS**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/features/gov-export/api.contract.test.ts --no-file-parallelism`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/gov-export
git commit -m "feat(frontend): gov-export ОТ registry API layer + hooks + contract tests"
```

---

### Task 15: Frontend — страница `gov-export` (секция реестра ОТ)

**Files:**

- Modify: `apps/frontend/app/gov-export/page.tsx`
- Modify: `apps/frontend/src/features/navigation/model.ts` (`/gov-export` → `regulatory.export.read`)

- [ ] **Step 1: Обновить gating маршрута**

В `model.ts` для `/gov-export` заменить `requiredPermissions: ['tenant.read']` → `['regulatory.export.read']` в `routeMeta` (`:38`) и `navigationModel` (`:309`).

- [ ] **Step 2: Добавить секцию «Реестр обученных по ОТ»**

В `page.tsx` добавить `SectionCard` с: выбором фильтра (группа/период/клиент), кнопкой «Сформировать выгрузку» (вызывает `govExportApi.createOtRegistryExport`), выводом `outcome.errors` (preflight-список), ссылкой скачивания (`/ot-registry/exports/:id/file`), и загрузкой файла-ответа (`<input type="file">` → читать как base64 → `govExportApi.importResponse`). Мутации — `useState`+async (паттерн страницы уже такой, см. `onCreateTask`).

```tsx
const onGenerate = async () => {
  if (!session) return;
  setBusy(true);
  setErr(null);
  try {
    const res = await govExportApi.createOtRegistryExport(session, {
      groupId: groupFilter || undefined
    });
    setOutcome(res);
  } catch (e) {
    setErr(e instanceof Error ? e.message : 'Ошибка выгрузки');
  } finally {
    setBusy(false);
  }
};

const onUploadResponse = async (file: File, batchId: string) => {
  const base64 = btoa(String.fromCharCode(...new Uint8Array(await file.arrayBuffer())));
  await govExportApi.importResponse(session!, batchId, base64);
};
```

- [ ] **Step 3: Проверка сборки/линта**

Run: `npx eslint apps/frontend/app/gov-export/page.tsx apps/frontend/src/features/navigation/model.ts --max-warnings=0`
Run: `pnpm --filter @cdoprof/frontend exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Verify в превью** (см. preview\_\* workflow)

Запустить dev-сервер, открыть `/gov-export`, убедиться: секция реестра ОТ рендерится, кнопка активна, preflight-ошибки показываются. Снять скриншот.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/app/gov-export/page.tsx apps/frontend/src/features/navigation/model.ts
git commit -m "feat(frontend): gov-export ОТ registry section (generate/download/import) + route perm"
```

---

### Task 16: Frontend — мультиселект программ в `ProgramMetaSection`

**Files:**

- Modify: `apps/frontend/src/features/mvp/screens.tsx` (`ProgramMetaSection`, `:796`)
- Modify: `apps/frontend/src/features/mvp/api.ts` + `hooks.ts` + `types.ts` (`ProgramMetaPatch.otProgramCodes`)
- Test: `apps/frontend/src/features/mvp/screens.test.ts` (расширить, если есть подходящий)

- [ ] **Step 1: Добавить `otProgramCodes` в `ProgramMetaPatch`** (frontend types) и в `buildPayload` секции (зеркало `regulatoryBasisCodes`):

```ts
const [otProgramCodes, setOtProgramCodes] = useState<string[]>(courseVersion.otProgramCodes ?? []);
// reset в useEffect([courseVersion])
// в buildPayload:
if (otProgramCodes.length > 0) payload.otProgramCodes = otProgramCodes;
```

- [ ] **Step 2: Мультиселект** (точная копия `<select multiple>` для `regulatoryBasisCodes`, `:962`, источник — `useOtTrainingPrograms`):

```tsx
<select
  multiple
  value={otProgramCodes}
  onChange={(e) => setOtProgramCodes(Array.from(e.target.selectedOptions, (o) => o.value))}
  disabled={readOnly}
  size={6}
>
  {otPrograms?.map((p) => (
    <option key={p.code} value={p.code}>
      {p.registryId}. {p.exactName}
    </option>
  ))}
</select>
```

- [ ] **Step 3: Линт + typecheck**

Run: `npx eslint apps/frontend/src/features/mvp/screens.tsx --max-warnings=0`
Run: `pnpm --filter @cdoprof/frontend exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/features/mvp/screens.tsx apps/frontend/src/features/mvp/api.ts apps/frontend/src/features/mvp/hooks.ts apps/frontend/src/features/mvp/types.ts
git commit -m "feat(frontend): map course version to ОТ registry programs (program-meta multiselect)"
```

---

### Task 17: Frontend — E2E permission/route smoke

**Files:**

- Create: `apps/frontend/src/e2e/ot-registry-export.e2e.test.ts` (по образцу `admin-bulk-enrollment.e2e.test.ts` — `evaluateRouteAccess` + `getVisibleNavigation`; НЕ `render()`)

- [ ] **Step 1: Тест (failing)**

```ts
// 1) пользователь с regulatory.export.read видит /gov-export в навигации и проходит evaluateRouteAccess;
// 2) пользователь без права — не видит и получает deny.
```

- [ ] **Step 2: FAIL → реализация не нужна (логика уже в model.ts) → PASS**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/e2e/ot-registry-export.e2e.test.ts --no-file-parallelism`
Expected: PASS (после корректного gating из Task 15).

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/e2e/ot-registry-export.e2e.test.ts
git commit -m "test(frontend): ОТ registry export route/permission e2e smoke"
```

---

### Task 18: Документация и хендофф

**Files:**

- Modify: `README.md` (§2 AI Agent State)
- Modify: `LMS_AGENT_HANDOFF.md` (§5.99 — summary/files/test status/deviations + cross-link спеки и плана)
- Modify: `docs/superpowers/plans/PLANS_STATUS.md` (строка нового плана)
- Modify: этот план (отметить галочки)

- [ ] **Step 1: Обновить README §2** (Current/Last/Next Task, дата, by).
- [ ] **Step 2: §5.99 в HANDOFF** — что сделано, список файлов, статус тестов (изолированные прогоны + CI), 3 отклонения (D1–D3), 3 внешних артефакта (§13 спеки), что осталось (полный классификатор / точные колонки / формат ответа — сверить с офиц. ЛКОТ).
- [ ] **Step 3: PLANS_STATUS** — добавить строку плана; пометить Волну 2 под-цель B.
- [ ] **Step 4: Commit**

```bash
git add README.md LMS_AGENT_HANDOFF.md docs/superpowers/plans/PLANS_STATUS.md docs/superpowers/plans/2026-05-31-eisot-ot-trained-registry-export.md
git commit -m "docs(plan): ОТ registry export — handoff §5.99 + plans status"
```

---

## Self-Review (выполнено автором плана)

**1. Покрытие спеки:**

- §3 поля → Task 7 (rows) + Task 9 (writer columns). ✓
- §5 данные (классификатор / маппинг / конфиг тенанта) → Task 2 (классификатор+поле), Task 5 (маппинг). Конфиг тенанта (рег.№ УЦ) — **сознательно отложен**: в V1 рег.№ организации не требуется для строк per-record (он атрибут заголовка пакета/кабинета). Если офиц. шаблон требует его в файле — добавить в `eisot`-credential settings + header writer'а (отметить в §5.99). ⚠️ зафиксировано как deviation-уточнение.
- §6 outbound → Tasks 10–11. ✓
- §7 round-trip → Tasks 12–13 (D3: номер на record, не на PDF). ✓
- §8 preflight → Task 6. ✓
- §9 UI → Tasks 15–16. ✓
- §10 права/ПДн → Task 2 (perms), Task 8 (clean register обходит AV-гейт для self-generated), Tasks 11/13 (guards). ✓
- §11 тесты → trio + golden-file + round-trip покрыты (Tasks 6,7,9,10,11,12,13,14,17). ✓
- §12 4 типа шаблонов → описано в спеке; план не дублирует. ✓
- §13 внешние артефакты → изолированы (Task 2 seed, Task 9 COLUMNS, Task 12 RESPONSE_COLUMNS). ✓

**2. Сканирование плейсхолдеров:** код в шагах реальный. Места, требующие сверки с фактическим кодом, помечены явно (имена helper'ов `makeServices`/`newId`/`audit`, точные пути guard'ов, DI-токен storage) — это уточнения «возьми из соседнего файла», не заглушки логики. Внешние данные (§13) — реальные изолированные константы с пометкой сверки, не «TODO в логике».

**3. Согласованность типов:** `OtRegistryRow`, `OtRegistryBatch`, `OtRegistryRecord`, `OtRegistryResponseRow`, `OtTrainingProgram` определены в Task 3 и используются согласованно в Tasks 6–14. Методы сервиса (`exportOtRegistry`, `importRegistryResponse`, `listBatches`, `getBatchWithRecords`, `getBatchDownloadUrl`) согласованы между сервисом (10/13) и контроллером (11/13). Функции `validateRegistryRow`, `buildRegistryRows`, `parseRegistryResponse`, `matchResponseToRecords` — имена едины между реализацией и вызовами.

**Открытое уточнение для реализатора:** проверить наличие публичных `MvpService.newId()`/`audit(...)` и токена `STORAGE_CLIENT`/`InMemoryMvpState` инъекции вне `MvpService`; при отсутствии публичного доступа — добавить тонкие обёртки (минимальная правка, не меняет архитектуру).
