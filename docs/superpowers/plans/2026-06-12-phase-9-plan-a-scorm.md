# Phase 9 Plan A: SCORM 1.2 Import + Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Админ загружает SCORM 1.2 zip-пакет, привязывает его к материалу курса; ученик проходит SCORM-курс во встроенном плеере, прогресс (lesson_status/score/suspend_data) сохраняется и завершает materialProgress.

**Architecture:** Новый суб-сервис `scorm/` внутри MVP-модуля по образцу `eisot-testing-registry/` (request-scoped, инжектит `MVP_STATE` + `MvpService` + `FilesService` + `S3StorageClient` + `AuditService`). Zip распаковывается синхронно в backend (буфер из S3 → `adm-zip` → гарды → `putObject` под `scorm/<tenantId>/<packageId>/`). Контент раздаётся unguarded-роутом `GET /api/v1/scorm-content/:token/*` (HMAC-токен в пути — iframe не умеет слать заголовки); same-origin обеспечен Caddy (`/api/v1/*` уже на одном домене с фронтом) + Next-rewrite для dev. Плеер — `scorm-again` (Scorm12API в родительском окне), коммиты cmi → `PUT /scorm-attempts/:id/commit`.

**Tech Stack:** NestJS, `adm-zip` (распаковка — синхронный API, тесты строят фикстуры той же библиотекой; пик памяти ≈ zip + крупнейший entry, приемлемо для редкой админ-операции), `fast-xml-parser` (манифест), `scorm-again` (SCORM 1.2 runtime), MinIO/S3, Vitest.

**Спека:** `docs/superpowers/specs/2026-06-12-phase-9-scorm-analytics-design.md` (решения D1–D10).

**Ключевые конвенции репо (обязательно к соблюдению):**

- Каждая новая MVP-коллекция регистрируется в `apps/backend/src/modules/mvp/infrastructure/mvp-collections.ts` И в `in-memory-mvp.state.ts` — иначе она теряется между HTTP-запросами.
- DTO — `class-validator`, в контроллере всегда `assertValidDto(Class, raw)`.
- Ошибки — `throw new BadRequestException({ code, message })` (объектная форма).
- Аудит мутаций — `this.audit(...)` / `AuditService`.
- Тесты НЕ используют React Testing Library; фронтенд-тесты — чистые функции + contract-тесты с `vi.stubGlobal('fetch', ...)`.
- Запуск одного файла тестов: `pnpm --filter @cdoprof/backend exec vitest run src/modules/<path>.test.ts --no-file-parallelism` (то же для frontend).
- Историчные миграции не редактируем; новая — `0052_*.sql`.
- Коммиты — Conventional Commits, многострочные через HEREDOC (bash) или `@'...'@` (PowerShell).

---

### Task 1: Зависимости + env-схема

**Files:**

- Modify: `apps/backend/package.json` (deps: `adm-zip`, `fast-xml-parser`; devDeps: `@types/adm-zip`)
- Modify: `apps/frontend/package.json` (deps: `scorm-again`)
- Modify: `apps/backend/src/env.schema.ts`
- Modify: `infra/.env.production.example`

- [ ] **Step 1: Установить зависимости**

```bash
pnpm --filter @cdoprof/backend add adm-zip fast-xml-parser
pnpm --filter @cdoprof/backend add -D @types/adm-zip
pnpm --filter @cdoprof/frontend add scorm-again
```

- [ ] **Step 2: Добавить env-переменные**

В `apps/backend/src/env.schema.ts` рядом с блоком `PROCTORING_VIDEO_RETENTION_*` (≈строка 65–75) добавить:

```ts
    // Phase 9 Plan A — SCORM package import (zip upload ceiling, bytes). Default 300 MB.
    SCORM_PACKAGE_MAX_BYTES: z.coerce.number().int().positive().default(314_572_800),
    /** HMAC secret for the path-embedded scorm-content tokens (iframe asset auth). */
    SCORM_CONTENT_TOKEN_SECRET: z.string().min(8).default('dev-scorm-content-secret'),
    /** TTL of a scorm-content token, seconds. Default 4h (player session). */
    SCORM_CONTENT_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(14_400),
```

- [ ] **Step 3: Добавить в `infra/.env.production.example`** (рядом с PROCTORING-блоком, тем же стилем комментариев):

```bash
# Phase 9 Plan A — SCORM: лимит zip-пакета (байт) и секрет токена раздачи контента.
SCORM_PACKAGE_MAX_BYTES=314572800
SCORM_CONTENT_TOKEN_SECRET=replace-with-strong-random-64-chars
SCORM_CONTENT_TOKEN_TTL_SECONDS=14400
```

- [ ] **Step 4: Проверка**

Run: `pnpm --filter @cdoprof/backend exec tsc --noEmit -p tsconfig.json` (или `pnpm typecheck`)
Expected: PASS (env-схема валидна, типы подтянулись).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/package.json apps/frontend/package.json pnpm-lock.yaml apps/backend/src/env.schema.ts infra/.env.production.example
git commit -m "chore(deps): unzipper + fast-xml-parser (backend), scorm-again (frontend) + SCORM env vars"
```

---

### Task 2: Миграция 0052 (scorm_packages, scorm_attempts, materials.scorm)

**Files:**

- Create: `apps/backend/migrations/0052_learning_scorm.sql`
- Modify: `apps/backend/src/infrastructure/database/mvp-domain-migrations.test.ts` (добавить блок проверок по образцу Phase 4 для 0051)

- [ ] **Step 1: Написать миграцию**

```sql
-- 0052_learning_scorm.sql
-- Phase 9 Plan A — SCORM 1.2 import + player.
--   * learning.materials: + 'scorm' в materials_type_chk, + scorm_package_id.
--   * learning.scorm_packages — загруженный/распакованный пакет (zip в storage.files).
--   * learning.scorm_attempts — cmi-прогресс ученика per (enrollment, material).
-- Прав не добавляем: пакеты = materials.read/write, launch = materials.read,
-- commit = progress.recalculate (все уже выданы ролям).
-- Additive + idempotent. Runtime MVP state persists as a JSONB snapshot; these typed
-- columns are the schema contract (0016 rule). Mirror of 0051.

BEGIN;

ALTER TABLE learning.materials
  ADD COLUMN IF NOT EXISTS scorm_package_id text;

ALTER TABLE learning.materials
  DROP CONSTRAINT IF EXISTS materials_type_chk;

ALTER TABLE learning.materials
  ADD CONSTRAINT materials_type_chk
  CHECK (material_type IN ('file', 'external_url', 'text', 'video', 'scorm'));

COMMENT ON COLUMN learning.materials.scorm_package_id IS
  'Phase 9 Plan A: FK на learning.scorm_packages для material_type=scorm; MVP JSON store mirrors this field.';

CREATE TABLE IF NOT EXISTS learning.scorm_packages (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  title text NOT NULL,
  package_status text NOT NULL DEFAULT 'uploaded'
    CONSTRAINT scorm_packages_status_chk
    CHECK (package_status IN ('uploaded', 'processing', 'ready', 'failed')),
  zip_file_id text NOT NULL,
  storage_prefix text NOT NULL,
  launch_href text,
  manifest_title text,
  entry_count integer,
  total_bytes bigint,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scorm_packages_tenant_status
  ON learning.scorm_packages (tenant_id, package_status);

COMMENT ON TABLE learning.scorm_packages IS
  'Phase 9 Plan A: SCORM 1.2 пакет (zip в storage.files, распакованный контент в S3 под storage_prefix). MVP JSON store mirrors this collection.';

CREATE TABLE IF NOT EXISTS learning.scorm_attempts (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  enrollment_id text NOT NULL,
  material_id text NOT NULL,
  learner_id text NOT NULL,
  lesson_status text NOT NULL DEFAULT 'not attempted'
    CONSTRAINT scorm_attempts_lesson_status_chk
    CHECK (lesson_status IN ('not attempted', 'incomplete', 'completed', 'passed', 'failed', 'browsed')),
  lesson_location text,
  suspend_data text,
  score_raw numeric,
  score_max numeric,
  score_min numeric,
  total_seconds integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL,
  last_commit_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_scorm_attempts_tenant_enrollment_material
  ON learning.scorm_attempts (tenant_id, enrollment_id, material_id);

COMMENT ON TABLE learning.scorm_attempts IS
  'Phase 9 Plan A: cmi-прогресс SCORM 1.2 per (enrollment, material); единственная запись, last-write-wins. MVP JSON store mirrors this collection.';

COMMIT;
```

- [ ] **Step 2: Написать проверки миграции** — открыть `apps/backend/src/infrastructure/database/mvp-domain-migrations.test.ts`, найти блок Phase 4 (`0051`) и добавить аналогичный `describe('0052_learning_scorm', ...)`, проверяющий (по той же технике чтения файла миграции, что 0051-блок): наличие `'scorm'` в новом `materials_type_chk`, колонок `scorm_package_id`, таблиц `learning.scorm_packages` / `learning.scorm_attempts`, CHECK-ов статусов, уникального индекса `idx_scorm_attempts_tenant_enrollment_material`, отсутствия INSERT в `iam.permissions` (прав не добавляем).

- [ ] **Step 3: Прогнать тест**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/infrastructure/database/mvp-domain-migrations.test.ts --no-file-parallelism`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/migrations/0052_learning_scorm.sql apps/backend/src/infrastructure/database/mvp-domain-migrations.test.ts
git commit -m "feat(backend): migration 0052 - scorm packages/attempts tables + scorm material type"
```

---

### Task 3: Backend-типы, state, коллекции

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.types.ts`
- Modify: `apps/backend/src/modules/mvp/infrastructure/in-memory-mvp.state.ts`
- Modify: `apps/backend/src/modules/mvp/infrastructure/mvp-collections.ts`

- [ ] **Step 1: Типы.** В `mvp.types.ts`:

В `Material` (≈строка 73) заменить union и добавить поле:

```ts
export interface Material extends BaseEntity {
  moduleId: string;
  title: string;
  materialType: 'file' | 'external_url' | 'text' | 'video' | 'scorm';
  sortOrder: number;
  minViewSeconds: number;
  isRequired: boolean;
  fileId?: string;
  /** Phase 9 Plan A: пакет для materialType='scorm' (FK learning.scorm_packages, статус ready). */
  scormPackageId?: string;
}
```

В конец файла (рядом с Phase 4 типами) добавить:

```ts
// ─── Phase 9 Plan A: SCORM 1.2 import + player ───

export type ScormPackageStatus = 'uploaded' | 'processing' | 'ready' | 'failed';

/** Загруженный SCORM 1.2 пакет: zip в storage.files, распакованный контент в S3 под storagePrefix. */
export interface ScormPackage extends BaseEntity {
  title: string;
  packageStatus: ScormPackageStatus;
  zipFileId: string;
  /** Детерминированный префикс: scorm/<tenantId>/<id> — content-роут вычисляет его без чтения state. */
  storagePrefix: string;
  launchHref?: string;
  manifestTitle?: string;
  entryCount?: number;
  totalBytes?: number;
  /** Код причины failed (scorm_version_unsupported | scorm_manifest_missing | ...). */
  error?: string;
}

export type ScormLessonStatus =
  | 'not attempted'
  | 'incomplete'
  | 'completed'
  | 'passed'
  | 'failed'
  | 'browsed';

/** cmi-прогресс SCORM per (enrollment, material): единственная запись, last-write-wins. */
export interface ScormAttempt extends BaseEntity {
  enrollmentId: string;
  materialId: string;
  learnerId: string;
  lessonStatus: ScormLessonStatus;
  lessonLocation?: string;
  suspendData?: string;
  scoreRaw?: number;
  scoreMax?: number;
  scoreMin?: number;
  /** Сумма session_time коммитов, секунды. */
  totalSeconds: number;
  startedAt: string;
  lastCommitAt?: string;
  completedAt?: string;
}
```

- [ ] **Step 2: State.** В `in-memory-mvp.state.ts` добавить импорт типов `ScormAttempt, ScormPackage` и поля в конец класса:

```ts
  // Phase 9 Plan A — SCORM: пакеты + cmi-прогресс учеников.
  scormPackages: ScormPackage[] = [];
  scormAttempts: ScormAttempt[] = [];
```

- [ ] **Step 3: Коллекции.** В `mvp-collections.ts` добавить `'scormPackages', 'scormAttempts'` в конец массива `MVP_COLLECTIONS` (без этого коллекции не переживут HTTP-запрос).

- [ ] **Step 4: Проверка** — `pnpm typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/mvp/mvp.types.ts apps/backend/src/modules/mvp/infrastructure/in-memory-mvp.state.ts apps/backend/src/modules/mvp/infrastructure/mvp-collections.ts
git commit -m "feat(backend): scorm types + MVP state collections (scormPackages, scormAttempts)"
```

---

### Task 4: FilesService — опция maxBytes (TDD)

**Files:**

- Modify: `apps/backend/src/modules/files/files.service.ts:41-55,135-152`
- Test: `apps/backend/src/modules/files/files.service.test.ts` (существует — дописать; если файла нет, найти текущие тесты FilesService через `Glob apps/backend/src/modules/files/*.test.ts` и дописать туда)

- [ ] **Step 1: Failing test** — в тестах FilesService (по образцу существующих тестов createUploadIntent, тем же harness'ом):

```ts
it('createUploadIntent honors options.maxBytes override (scorm zip > default 10MB)', async () => {
  // 50 MB при дефолтном лимите 10 MB — должно пройти с override
  const intent = await service.createUploadIntent(
    'tenant_demo',
    { originalName: 'course.zip', contentType: 'application/zip', sizeBytes: 50 * 1024 * 1024 },
    {
      maxBytes: 300 * 1024 * 1024,
      mimeAllowlist: new Set(['application/zip']),
      keyPrefix: 'scorm-packages'
    }
  );
  expect(intent.fileId).toBeTruthy();
});

it('createUploadIntent rejects sizeBytes above options.maxBytes', async () => {
  await expect(
    service.createUploadIntent(
      'tenant_demo',
      { originalName: 'course.zip', contentType: 'application/zip', sizeBytes: 400 * 1024 * 1024 },
      { maxBytes: 300 * 1024 * 1024, mimeAllowlist: new Set(['application/zip']) }
    )
  ).rejects.toMatchObject({ response: { code: 'file_too_large' } });
});
```

- [ ] **Step 2: Run** → FAIL (`maxBytes` не существует в `UploadIntentOptions`).

- [ ] **Step 3: Реализация.** В `UploadIntentOptions` добавить:

```ts
  /** Per-purpose size ceiling override, bytes; defaults to SUBMISSION_MAX_BYTES (10 MB). */
  maxBytes?: number;
```

В `createUploadIntent` заменить проверку размера (строка ≈147):

```ts
    const maxBytes = options?.maxBytes ?? SUBMISSION_MAX_BYTES;
    if (input.sizeBytes <= 0 || input.sizeBytes > maxBytes) {
```

- [ ] **Step 4: Run tests** → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/files/
git commit -m "feat(backend): per-purpose maxBytes override in FilesService upload intents"
```

---

### Task 5: Парсер манифеста — чистая функция (TDD)

**Files:**

- Create: `apps/backend/src/modules/mvp/scorm/parse-scorm-manifest.ts`
- Test: `apps/backend/src/modules/mvp/scorm/parse-scorm-manifest.test.ts`

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from 'vitest';

import { parseScormManifest, ScormManifestError } from './parse-scorm-manifest.js';

const MANIFEST_12 = `<?xml version="1.0"?>
<manifest identifier="m1" xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2">
  <metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>
  <organizations default="org1">
    <organization identifier="org1">
      <title>Охрана труда — вводный</title>
      <item identifier="i1" identifierref="res1"><title>Урок 1</title></item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="res1" type="webcontent" adlcp:scormtype="sco" href="content/index.html" xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2">
      <file href="content/index.html"/>
    </resource>
  </resources>
</manifest>`;

describe('parseScormManifest', () => {
  it('извлекает версию, title и launch href первого item→resource', () => {
    const m = parseScormManifest(MANIFEST_12);
    expect(m).toEqual({
      version: '1.2',
      title: 'Охрана труда — вводный',
      launchHref: 'content/index.html'
    });
  });

  it('учитывает xml:base ресурса', () => {
    const xml = MANIFEST_12.replace(
      'href="content/index.html"',
      'href="index.html" xml:base="content/"'
    );
    expect(parseScormManifest(xml).launchHref).toBe('content/index.html');
  });

  it('SCORM 2004 → ScormManifestError(scorm_version_unsupported)', () => {
    const xml = MANIFEST_12.replace(
      '<schemaversion>1.2</schemaversion>',
      '<schemaversion>2004 4th Edition</schemaversion>'
    );
    expect(() => parseScormManifest(xml)).toThrowError(
      expect.objectContaining({ code: 'scorm_version_unsupported' })
    );
  });

  it('нет organizations/item с identifierref → scorm_launch_not_found', () => {
    const xml = MANIFEST_12.replace(' identifierref="res1"', '');
    expect(() => parseScormManifest(xml)).toThrowError(
      expect.objectContaining({ code: 'scorm_launch_not_found' })
    );
  });

  it('битый XML → scorm_manifest_invalid', () => {
    expect(() => parseScormManifest('<manifest><broken')).toThrowError(
      expect.objectContaining({ code: 'scorm_manifest_invalid' })
    );
  });

  it('отсутствие schemaversion трактуется как 1.2 (многие пакеты его не пишут)', () => {
    const xml = MANIFEST_12.replace(
      '<metadata><schema>ADL SCORM</schema><schemaversion>1.2</schemaversion></metadata>',
      ''
    );
    expect(parseScormManifest(xml).version).toBe('1.2');
  });
});
```

- [ ] **Step 2: Run** → FAIL (модуль не существует).

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/scorm/parse-scorm-manifest.test.ts --no-file-parallelism`

- [ ] **Step 3: Реализация**

```ts
import { XMLParser } from 'fast-xml-parser';

export interface ScormManifest {
  version: '1.2';
  title: string;
  launchHref: string;
}

/** Типизированная ошибка разбора манифеста; code уходит в ScormPackage.error. */
export class ScormManifestError extends Error {
  constructor(
    public readonly code:
      | 'scorm_manifest_invalid'
      | 'scorm_version_unsupported'
      | 'scorm_launch_not_found',
    message: string
  ) {
    super(message);
  }
}

const first = <T>(v: T | T[] | undefined): T | undefined => (Array.isArray(v) ? v[0] : v);

/**
 * Минимальный разбор imsmanifest.xml (D4 спеки): версия схемы, title организации,
 * launch href первого item с identifierref (+ xml:base ресурса). Multi-SCO — backlog.
 */
export function parseScormManifest(xml: string): ScormManifest {
  let doc: Record<string, unknown>;
  try {
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      removeNSPrefix: true
    });
    doc = parser.parse(xml) as Record<string, unknown>;
  } catch {
    throw new ScormManifestError('scorm_manifest_invalid', 'imsmanifest.xml is not valid XML');
  }
  const manifest = doc['manifest'] as Record<string, unknown> | undefined;
  if (!manifest) {
    throw new ScormManifestError('scorm_manifest_invalid', 'No <manifest> root element');
  }

  const metadata = first(manifest['metadata']) as Record<string, unknown> | undefined;
  const schemaVersion = String(metadata?.['schemaversion'] ?? '1.2').trim();
  // Пакеты без schemaversion считаем 1.2; всё, что начинается с "2004"/"CAM" — отказ.
  if (!schemaVersion.startsWith('1.2')) {
    throw new ScormManifestError(
      'scorm_version_unsupported',
      `Unsupported SCORM version: ${schemaVersion} (only 1.2 is supported)`
    );
  }

  const organizations = first(manifest['organizations']) as Record<string, unknown> | undefined;
  const organization = first(organizations?.['organization']) as
    | Record<string, unknown>
    | undefined;
  const title = String(first(organization?.['title']) ?? '').trim() || 'SCORM course';

  // Первый item (возможно вложенный) с identifierref.
  const findItemRef = (node: Record<string, unknown> | undefined): string | undefined => {
    if (!node) return undefined;
    const items = node['item'];
    const list = Array.isArray(items) ? items : items ? [items] : [];
    for (const raw of list) {
      const item = raw as Record<string, unknown>;
      const ref = item['@_identifierref'];
      if (typeof ref === 'string' && ref.length > 0) return ref;
      const nested = findItemRef(item);
      if (nested) return nested;
    }
    return undefined;
  };
  const identifierref = findItemRef(organization);

  const resources = first(manifest['resources']) as Record<string, unknown> | undefined;
  const resourceRaw = resources?.['resource'];
  const resourceList = (
    Array.isArray(resourceRaw) ? resourceRaw : resourceRaw ? [resourceRaw] : []
  ) as Array<Record<string, unknown>>;
  const resource = identifierref
    ? resourceList.find((r) => r['@_identifier'] === identifierref)
    : undefined;
  const href =
    typeof resource?.['@_href'] === 'string' ? (resource['@_href'] as string) : undefined;
  if (!identifierref || !href) {
    throw new ScormManifestError(
      'scorm_launch_not_found',
      'Manifest has no launchable item (organization item with identifierref → resource href)'
    );
  }
  const base = typeof resource?.['@_base'] === 'string' ? (resource['@_base'] as string) : '';
  return { version: '1.2', title, launchHref: `${base}${href}` };
}
```

Примечание: `removeNSPrefix: true` срезает и `xml:` у `xml:base` → атрибут виден как `@_base`.

- [ ] **Step 4: Run tests** → PASS (все 6).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/mvp/scorm/parse-scorm-manifest.ts apps/backend/src/modules/mvp/scorm/parse-scorm-manifest.test.ts
git commit -m "feat(backend): SCORM 1.2 imsmanifest parser (pure function)"
```

---

### Task 6: Zip-гарды + контентные утилиты — чистые функции (TDD)

**Files:**

- Create: `apps/backend/src/modules/mvp/scorm/scorm-zip-guards.ts`
- Test: `apps/backend/src/modules/mvp/scorm/scorm-zip-guards.test.ts`

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from 'vitest';

import {
  SCORM_ZIP_LIMITS,
  ScormZipGuardError,
  assertSafeEntryPath,
  contentTypeForPath,
  createZipBudget
} from './scorm-zip-guards.js';

describe('assertSafeEntryPath', () => {
  it('пропускает обычные относительные пути', () => {
    expect(() => assertSafeEntryPath('content/js/app.js')).not.toThrow();
  });
  for (const bad of ['../evil.js', 'a/../../evil.js', '/etc/passwd', 'C:\\windows\\x', 'a\\b.js']) {
    it(`отклоняет ${bad} → scorm_zip_unsafe_path`, () => {
      expect(() => assertSafeEntryPath(bad)).toThrowError(
        expect.objectContaining({ code: 'scorm_zip_unsafe_path' })
      );
    });
  }
});

describe('createZipBudget', () => {
  it('считает entries и байты, бросает при превышении entry-лимита', () => {
    const budget = createZipBudget();
    for (let i = 0; i < SCORM_ZIP_LIMITS.maxEntries; i++) budget.addEntry(10);
    expect(() => budget.addEntry(10)).toThrowError(
      expect.objectContaining({ code: 'scorm_zip_too_many_entries' })
    );
  });
  it('бросает при превышении total-байт', () => {
    const budget = createZipBudget();
    expect(() => budget.addEntry(SCORM_ZIP_LIMITS.maxTotalBytes + 1)).toThrowError(
      expect.objectContaining({ code: 'scorm_zip_too_large' })
    );
  });
  it('бросает при слишком большом одиночном entry', () => {
    const budget = createZipBudget();
    expect(() => budget.addEntry(SCORM_ZIP_LIMITS.maxEntryBytes + 1)).toThrowError(
      expect.objectContaining({ code: 'scorm_zip_entry_too_large' })
    );
  });
});

describe('contentTypeForPath', () => {
  it.each([
    ['index.html', 'text/html; charset=utf-8'],
    ['js/app.js', 'text/javascript'],
    ['style.css', 'text/css'],
    ['img/logo.png', 'image/png'],
    ['data.json', 'application/json'],
    ['video.mp4', 'video/mp4'],
    ['unknown.bin', 'application/octet-stream']
  ])('%s → %s', (p, expected) => {
    expect(contentTypeForPath(p)).toBe(expected);
  });
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Реализация**

```ts
/** Лимиты распаковки SCORM-zip (D3 спеки): zip-bomb / DoS guard. */
export const SCORM_ZIP_LIMITS = {
  maxEntries: 5000,
  maxTotalBytes: 1.5 * 1024 * 1024 * 1024,
  maxEntryBytes: 300 * 1024 * 1024
} as const;

export class ScormZipGuardError extends Error {
  constructor(
    public readonly code:
      | 'scorm_zip_unsafe_path'
      | 'scorm_zip_too_many_entries'
      | 'scorm_zip_too_large'
      | 'scorm_zip_entry_too_large',
    message: string
  ) {
    super(message);
  }
}

/** Отказ при path traversal / абсолютных / windows-путях (entry кладётся в S3 как есть). */
export function assertSafeEntryPath(entryPath: string): void {
  const unsafe =
    entryPath.includes('\\') ||
    entryPath.startsWith('/') ||
    /^[a-zA-Z]:/.test(entryPath) ||
    entryPath.split('/').includes('..');
  if (unsafe) {
    throw new ScormZipGuardError('scorm_zip_unsafe_path', `Unsafe zip entry path: ${entryPath}`);
  }
}

/** Аккумулятор лимитов на один прогон распаковки. */
export function createZipBudget() {
  let entries = 0;
  let totalBytes = 0;
  return {
    addEntry(sizeBytes: number): void {
      entries += 1;
      totalBytes += sizeBytes;
      if (entries > SCORM_ZIP_LIMITS.maxEntries) {
        throw new ScormZipGuardError(
          'scorm_zip_too_many_entries',
          `More than ${SCORM_ZIP_LIMITS.maxEntries} entries`
        );
      }
      if (sizeBytes > SCORM_ZIP_LIMITS.maxEntryBytes) {
        throw new ScormZipGuardError(
          'scorm_zip_entry_too_large',
          'Single entry exceeds the per-file limit'
        );
      }
      if (totalBytes > SCORM_ZIP_LIMITS.maxTotalBytes) {
        throw new ScormZipGuardError(
          'scorm_zip_too_large',
          'Uncompressed size exceeds the total limit'
        );
      }
    },
    get entries() {
      return entries;
    },
    get totalBytes() {
      return totalBytes;
    }
  };
}

const MIME_BY_EXT: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  htm: 'text/html; charset=utf-8',
  js: 'text/javascript',
  mjs: 'text/javascript',
  css: 'text/css',
  json: 'application/json',
  xml: 'application/xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  ico: 'image/x-icon',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  wav: 'audio/wav',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
  pdf: 'application/pdf',
  txt: 'text/plain; charset=utf-8'
};

/** Content-Type по расширению (раздача распакованного контента и putObject при распаковке). */
export function contentTypeForPath(entryPath: string): string {
  const ext = entryPath.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}
```

- [ ] **Step 4: Run tests** → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/mvp/scorm/scorm-zip-guards.*
git commit -m "feat(backend): scorm zip guards (traversal, zip-bomb limits) + mime map"
```

---

### Task 7: Контент-токен — sign/verify (TDD)

**Files:**

- Create: `apps/backend/src/modules/mvp/scorm/scorm-content-token.ts`
- Test: `apps/backend/src/modules/mvp/scorm/scorm-content-token.test.ts`

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from 'vitest';

import { createScormContentToken, verifyScormContentToken } from './scorm-content-token.js';

const SECRET = 'test-secret-0123456789';

describe('scorm content token', () => {
  it('round-trip: подписали → верифицировали payload', () => {
    const token = createScormContentToken({ tenantId: 'tenant_demo', packageId: 'scp_1' }, SECRET, {
      ttlSeconds: 3600,
      nowEpochSeconds: 1_000_000
    });
    const payload = verifyScormContentToken(token, SECRET, { nowEpochSeconds: 1_000_100 });
    expect(payload).toEqual({ tenantId: 'tenant_demo', packageId: 'scp_1', exp: 1_003_600 });
  });

  it('просроченный токен → null', () => {
    const token = createScormContentToken({ tenantId: 't', packageId: 'p' }, SECRET, {
      ttlSeconds: 60,
      nowEpochSeconds: 1_000_000
    });
    expect(verifyScormContentToken(token, SECRET, { nowEpochSeconds: 1_000_061 })).toBeNull();
  });

  it('подделка подписи → null', () => {
    const token = createScormContentToken({ tenantId: 't', packageId: 'p' }, SECRET, {
      ttlSeconds: 60,
      nowEpochSeconds: 1_000_000
    });
    const [body] = token.split('.');
    expect(
      verifyScormContentToken(`${body}.AAAA`, SECRET, { nowEpochSeconds: 1_000_001 })
    ).toBeNull();
  });

  it('подмена payload под старую подпись → null', () => {
    const token = createScormContentToken({ tenantId: 't', packageId: 'p' }, SECRET, {
      ttlSeconds: 60,
      nowEpochSeconds: 1_000_000
    });
    const sig = token.split('.')[1];
    const forgedBody = Buffer.from(
      JSON.stringify({ tenantId: 'other', packageId: 'p', exp: 2_000_000 })
    ).toString('base64url');
    expect(
      verifyScormContentToken(`${forgedBody}.${sig}`, SECRET, { nowEpochSeconds: 1_000_001 })
    ).toBeNull();
  });

  it('мусор вместо токена → null (не бросает)', () => {
    expect(verifyScormContentToken('garbage', SECRET, { nowEpochSeconds: 1 })).toBeNull();
    expect(verifyScormContentToken('a.b.c', SECRET, { nowEpochSeconds: 1 })).toBeNull();
  });
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Реализация**

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';

export interface ScormContentTokenPayload {
  tenantId: string;
  packageId: string;
  exp: number;
}

/** `base64url(json).base64url(hmac-sha256)` — токен в пути URL, поэтому только base64url-символы. */
export function createScormContentToken(
  input: { tenantId: string; packageId: string },
  secret: string,
  opts: { ttlSeconds: number; nowEpochSeconds: number }
): string {
  const payload: ScormContentTokenPayload = {
    tenantId: input.tenantId,
    packageId: input.packageId,
    exp: opts.nowEpochSeconds + opts.ttlSeconds
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

/** null при любой проблеме (битый формат, подпись, exp) — роут отвечает 404/403 без деталей. */
export function verifyScormContentToken(
  token: string,
  secret: string,
  opts: { nowEpochSeconds: number }
): ScormContentTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts as [string, string];
  const expected = createHmac('sha256', secret).update(body).digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(sig, 'base64url');
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  let payload: ScormContentTokenPayload;
  try {
    payload = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8')
    ) as ScormContentTokenPayload;
  } catch {
    return null;
  }
  if (
    typeof payload.tenantId !== 'string' ||
    typeof payload.packageId !== 'string' ||
    typeof payload.exp !== 'number' ||
    payload.exp <= opts.nowEpochSeconds
  ) {
    return null;
  }
  return payload;
}
```

- [ ] **Step 4: Run tests** → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/mvp/scorm/scorm-content-token.*
git commit -m "feat(backend): HMAC path-token for scorm content serving (sign/verify, ttl)"
```

---

### Task 8: Подготовка инфраструктуры под ScormService

**Files:**

- Modify: `apps/backend/src/infrastructure/storage/s3-storage.client.ts` (+ `listObjectKeys`)
- Modify: `apps/backend/src/modules/files/files.service.ts` (+ `getReadableFile`)
- Modify: `apps/backend/src/modules/mvp/mvp.service.ts` (модификатор `assertActorMatchesLearnerIamLink`)
- Test: тесты FilesService (тот же файл, что в Task 4)

- [ ] **Step 1: Failing test для `getReadableFile`** — server-side чтение файла с тем же AV-гейтом, что у download:

```ts
it('getReadableFile возвращает storageKey чистого файла', async () => {
  // зарегистрировать файл с antivirus_status='clean' через существующий harness
  const meta = await service.getReadableFile('tenant_demo', cleanFileId);
  expect(meta.storageKey).toContain('scorm-packages/');
});

it('getReadableFile блокирует infected файл кодом file_infected (423)', async () => {
  await expect(service.getReadableFile('tenant_demo', infectedFileId)).rejects.toMatchObject({
    response: { code: 'file_infected' }
  });
});
```

- [ ] **Step 2: Run** → FAIL (метода нет).

- [ ] **Step 3: Реализация `getReadableFile`.** В `files.service.ts` найти `createDownloadUrl` и выделить из него приватный хелпер `ensureCleanFile(tenantId, fileId)` (lookup строки `storage.files` + проверка `antivirus_status` с lazy-сканом `pending` и выбросом 423 `file_infected` / 409 `file_scan_failed` — ровно тот код, что сейчас инлайном в `createDownloadUrl`). Затем:

```ts
  /** Phase 9 Plan A: server-side чтение (распаковка SCORM-zip) — тот же AV-гейт, что у download. */
  async getReadableFile(
    tenantId: string,
    fileId: string
  ): Promise<{ storageKey: string; sizeBytes: number }> {
    const row = await this.ensureCleanFile(tenantId, fileId);
    return { storageKey: row.storageKey, sizeBytes: row.sizeBytes };
  }
```

`createDownloadUrl` переключить на `ensureCleanFile` (поведение не меняется — существующие тесты download-гейта должны остаться зелёными).

- [ ] **Step 4: `listObjectKeys` в S3StorageClient** (нужен для удаления распакованного префикса и cleanup при failed-распаковке):

```ts
import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListBucketsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client
} from '@aws-sdk/client-s3';

  /** Все ключи под префиксом (пагинация ListObjectsV2). Phase 9: зачистка распакованного SCORM. */
  async listObjectKeys(params: { prefix: string }): Promise<string[]> {
    const keys: string[] = [];
    let continuationToken: string | undefined;
    do {
      const response = await this.getClient().send(
        new ListObjectsV2Command({
          Bucket: backendEnv.S3_BUCKET,
          Prefix: params.prefix,
          ...(continuationToken ? { ContinuationToken: continuationToken } : {})
        })
      );
      for (const obj of response.Contents ?? []) {
        if (obj.Key) keys.push(obj.Key);
      }
      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);
    return keys;
  }
```

Если у `S3StorageClient` есть интерфейс `StorageClient` (`storage.client.ts`) — добавить метод и туда (и в memory/fake реализацию, если существует, — проверить `Glob apps/backend/src/infrastructure/storage/*`).

- [ ] **Step 5: Сделать `assertActorMatchesLearnerIamLink` публичным.** В `mvp.service.ts` найти объявление `assertActorMatchesLearnerIamLink` (используется в `upsertMaterialProgress`, прокторинге). Если `private` — сменить на `public` (вызовы извне появятся в ScormService). Поведение не меняется.

- [ ] **Step 6: Run tests** (FilesService + быстрый smoke существующих files-тестов) → PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/infrastructure/storage/ apps/backend/src/modules/files/ apps/backend/src/modules/mvp/mvp.service.ts
git commit -m "feat(backend): getReadableFile AV-gate, S3 listObjectKeys, public learner-link assert (scorm prep)"
```

---

### Task 9: ScormService — DTO + жизненный цикл пакета (TDD)

**Files:**

- Create: `apps/backend/src/modules/mvp/scorm/scorm.dto.ts`
- Create: `apps/backend/src/modules/mvp/scorm/scorm.service.ts`
- Test: `apps/backend/src/modules/mvp/scorm/scorm.service.test.ts`
- Modify: `apps/backend/src/modules/mvp/mvp.dto-validation.test.ts` (DTO-тесты)

**Контекст для исполнителя:** harness тестов — по образцу `apps/backend/src/modules/mvp/proctoring.service.test.ts` (`makeService()` создаёт `InMemoryMvpState`, реальный `MvpService` из 6 позиционных аргументов с vi.fn-моками, сид-хелперы для course/group/enrollment/learner с `linkedIamUserId`). Сервисный паттерн — `apps/backend/src/modules/mvp/eisot-testing-registry/eisot-testing-registry.service.ts` (`@Injectable({ scope: Scope.REQUEST })`, инжекты `MVP_STATE`, `MvpService`, `FilesService`, `S3StorageClient`, `AuditService`); вызов аудита скопировать оттуда же (те же аргументы/форма).

- [ ] **Step 1: DTO** (`scorm.dto.ts`):

```ts
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength
} from 'class-validator';

/** `POST /scorm-packages` — регистрация после presigned PUT zip-файла. */
export class RegisterScormPackageRequest {
  @IsString()
  @MinLength(1)
  zipFileId!: string;

  /** Необязательный заголовок; иначе возьмём <title> организации из манифеста при process. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  title?: string;
}

/** `POST /scorm-materials/:materialId/launch` */
export class LaunchScormMaterialRequest {
  @IsString()
  @MinLength(1)
  enrollmentId!: string;
}

export const SCORM_LESSON_STATUSES = [
  'not attempted',
  'incomplete',
  'completed',
  'passed',
  'failed',
  'browsed'
] as const;

/** `PUT /scorm-attempts/:id/commit` — снапшот cmi-полей от плеера. Все поля опциональны (merge). */
export class CommitScormAttemptRequest {
  @IsOptional()
  @IsIn([...SCORM_LESSON_STATUSES])
  lessonStatus?: (typeof SCORM_LESSON_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  lessonLocation?: string;

  /** SCORM 1.2 ограничивает 4096; берём с запасом 64KB (некоторые пакеты нарушают стандарт). */
  @IsOptional()
  @IsString()
  @MaxLength(65536)
  suspendData?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  scoreRaw?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  scoreMax?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  scoreMin?: number;

  /** Секунды cmi.core.session_time этого коммита; суммируются в totalSeconds. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sessionSeconds?: number;
}
```

DTO-тесты добавить в `mvp.dto-validation.test.ts` (по образцу соседних): валидный `CommitScormAttemptRequest` проходит; `lessonStatus: 'weird'` — ошибка; `sessionSeconds: -1` — ошибка; `RegisterScormPackageRequest` без `zipFileId` — ошибка.

- [ ] **Step 2: Failing service-тесты (жизненный цикл пакета).** `scorm.service.test.ts` — harness:

```ts
import AdmZip from 'adm-zip';
import { Readable } from 'node:stream';

const MANIFEST = `<?xml version="1.0"?>
<manifest identifier="m1">
  <metadata><schemaversion>1.2</schemaversion></metadata>
  <organizations default="org1"><organization identifier="org1">
    <title>Курс ОТ</title><item identifier="i1" identifierref="res1"><title>Урок</title></item>
  </organization></organizations>
  <resources><resource identifier="res1" type="webcontent" href="index.html">
    <file href="index.html"/></resource></resources>
</manifest>`;

function makeZip(files: Record<string, string>): Buffer {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(files))
    zip.addFile(name, Buffer.from(content, 'utf8'));
  return zip.toBuffer();
}

// makeService(): по образцу proctoring.service.test.ts; дополнительно мок-объекты:
//   files = { createUploadIntent: vi.fn(), getReadableFile: vi.fn() }
//   storage = { getObjectStream: vi.fn(), putObject: vi.fn(), deleteObject: vi.fn(), listObjectKeys: vi.fn().mockResolvedValue([]) }
//   scorm = new ScormService(state, mvp, files as never, storage as never, audit as never)
// Хелпер: givenZip(buf) => { files.getReadableFile.mockResolvedValue({ storageKey: 'k', sizeBytes: buf.length });
//                            storage.getObjectStream.mockResolvedValue(Readable.from(buf)); }
```

Тесты (минимум):

```ts
it('registerPackage создаёт uploaded-пакет с детерминированным storagePrefix scorm/<tenant>/<id>', ...);
it('createPackageUploadIntent зовёт files.createUploadIntent c keyPrefix scorm-packages, zip-allowlist и env-лимитом', ...);
it('processPackage: валидный zip → ready, putObject на каждый entry с contentType и ключом <prefix>/<entryName>, launchHref/manifestTitle/entryCount/totalBytes заполнены', ...);
it('processPackage: zip без imsmanifest.xml → packageStatus failed, error=scorm_manifest_missing (не бросает)', ...);
it('processPackage: манифест 2004 → failed, error=scorm_version_unsupported', ...);
it('processPackage: entry с ../ → failed, error=scorm_zip_unsafe_path, listObjectKeys+deleteObject вызваны (cleanup)', ...);
it('processPackage идемпотентен: ready-пакет → no-op (getReadableFile не вызывается повторно)', ...);
it('deletePackage: блокируется 409 scorm_package_in_use, пока material.scormPackageId ссылается', ...);
it('deletePackage: без ссылок — listObjectKeys+deleteObject по префиксу, status пакета=deleted/soft-delete', ...);
```

- [ ] **Step 3: Run** → FAIL.

- [ ] **Step 4: Реализация `scorm.service.ts`** (жизненный цикл пакета; launch/commit добавит Task 10):

```ts
import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Scope
} from '@nestjs/common';
import AdmZip from 'adm-zip';

import { parseScormManifest, ScormManifestError } from './parse-scorm-manifest.js';
import {
  ScormZipGuardError,
  assertSafeEntryPath,
  contentTypeForPath,
  createZipBudget
} from './scorm-zip-guards.js';
import { backendEnv } from '../../../env.js';
import { S3StorageClient } from '../../../infrastructure/storage/s3-storage.client.js';
import { AuditService } from '../../audit/audit.service.js';
import { FilesService } from '../../files/files.service.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import { MVP_STATE } from '../infrastructure/mvp-state.token.js';
import { MvpService } from '../mvp.service.js';

import type { RegisterScormPackageRequest } from './scorm.dto.js';
import type { RequestContext } from '../../../common/context/request-context.js';
import type { ScormPackage } from '../mvp.types.js';
import type { UploadIntent, UploadIntentInput } from '../../files/files.service.js';
import type { Readable } from 'node:stream';

const SCORM_ZIP_MIME_ALLOWLIST: ReadonlySet<string> = new Set([
  'application/zip',
  'application/x-zip-compressed'
]);

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

@Injectable({ scope: Scope.REQUEST })
export class ScormService {
  constructor(
    @Inject(MVP_STATE) private readonly state: InMemoryMvpState,
    @Inject(MvpService) private readonly mvp: MvpService,
    @Inject(FilesService) private readonly files: FilesService,
    @Inject(S3StorageClient) private readonly storage: S3StorageClient,
    @Inject(AuditService) private readonly auditService: AuditService
  ) {}

  private newId(prefix: string): string {
    return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
  }

  private getPackage(tenantId: string, id: string): ScormPackage {
    const pkg = this.state.scormPackages.find(
      (p) => p.tenantId === tenantId && p.id === id && p.status !== 'deleted'
    );
    if (!pkg) {
      throw new NotFoundException({ code: 'not_found', message: 'SCORM package not found' });
    }
    return pkg;
  }

  async createPackageUploadIntent(
    tenantId: string,
    input: UploadIntentInput
  ): Promise<UploadIntent> {
    return this.files.createUploadIntent(tenantId, input, {
      keyPrefix: 'scorm-packages',
      mimeAllowlist: SCORM_ZIP_MIME_ALLOWLIST,
      maxBytes: backendEnv.SCORM_PACKAGE_MAX_BYTES
    });
  }

  registerPackage(
    tenantId: string,
    actorId: string | undefined,
    request: RegisterScormPackageRequest,
    ctx: RequestContext
  ): ScormPackage {
    const now = new Date().toISOString();
    const id = this.newId('scp');
    const pkg: ScormPackage = {
      id,
      tenantId,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      title: request.title?.trim() || 'SCORM package',
      packageStatus: 'uploaded',
      zipFileId: request.zipFileId,
      storagePrefix: `scorm/${tenantId}/${id}`
    };
    this.state.scormPackages.push(pkg);
    // Аудит: action 'learning.scorm_package_registered' — вызов AuditService по образцу
    // eisot-testing-registry.service.ts (entityType 'scorm_package', entityId pkg.id).
    return pkg;
  }

  listPackages(tenantId: string): { items: ScormPackage[]; total: number } {
    const items = this.state.scormPackages
      .filter((p) => p.tenantId === tenantId && p.status !== 'deleted')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { items, total: items.length };
  }

  async processPackage(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    ctx: RequestContext
  ): Promise<ScormPackage> {
    const pkg = this.getPackage(tenantId, id);
    if (pkg.packageStatus === 'ready') return pkg; // идемпотентность: повторный вызов — no-op
    if (pkg.packageStatus === 'processing') {
      throw new ConflictException({
        code: 'scorm_package_processing',
        message: 'Package is already being processed'
      });
    }
    pkg.packageStatus = 'processing';
    pkg.error = undefined as never; // exactOptionalPropertyTypes: см. примечание ниже
    try {
      const meta = await this.files.getReadableFile(tenantId, pkg.zipFileId); // AV-гейт внутри
      const zipBuffer = await streamToBuffer(
        await this.storage.getObjectStream({ key: meta.storageKey })
      );
      const zip = new AdmZip(zipBuffer);
      const entries = zip.getEntries().filter((e) => !e.isDirectory);
      const manifestEntry = entries.find((e) => e.entryName === 'imsmanifest.xml');
      if (!manifestEntry) {
        throw new ScormManifestError(
          'scorm_manifest_missing' as never,
          'imsmanifest.xml not found at zip root'
        );
      }
      const manifest = parseScormManifest(manifestEntry.getData().toString('utf8'));
      const budget = createZipBudget();
      for (const entry of entries) {
        assertSafeEntryPath(entry.entryName);
        budget.addEntry(entry.header.size);
      }
      for (const entry of entries) {
        await this.storage.putObject({
          key: `${pkg.storagePrefix}/${entry.entryName}`,
          body: entry.getData(),
          contentType: contentTypeForPath(entry.entryName)
        });
      }
      pkg.launchHref = manifest.launchHref;
      pkg.manifestTitle = manifest.title;
      if (!pkg.title || pkg.title === 'SCORM package') pkg.title = manifest.title;
      pkg.entryCount = budget.entries;
      pkg.totalBytes = budget.totalBytes;
      pkg.packageStatus = 'ready';
      pkg.updatedAt = new Date().toISOString();
      // Аудит: 'learning.scorm_package_processed'.
      return pkg;
    } catch (error) {
      pkg.packageStatus = 'failed';
      pkg.error =
        error instanceof ScormManifestError || error instanceof ScormZipGuardError
          ? error.code
          : 'scorm_process_failed';
      pkg.updatedAt = new Date().toISOString();
      await this.cleanupPrefix(pkg.storagePrefix); // best-effort зачистка частично залитых entries
      if (error instanceof ScormManifestError || error instanceof ScormZipGuardError) {
        return pkg; // ожидаемые отказы: админ видит failed+код, HTTP 200
      }
      throw error; // AV-гейт (423/409) и инфраструктурные ошибки — наружу
    }
  }

  private async cleanupPrefix(prefix: string): Promise<void> {
    try {
      const keys = await this.storage.listObjectKeys({ prefix: `${prefix}/` });
      for (const key of keys) await this.storage.deleteObject({ key });
    } catch {
      // best-effort: оставшиеся объекты перетрутся при повторном process
    }
  }

  async deletePackage(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    ctx: RequestContext
  ): Promise<{ id: string; deleted: true }> {
    const pkg = this.getPackage(tenantId, id);
    const inUse = this.state.materials.some(
      (m) => m.tenantId === tenantId && m.scormPackageId === id && m.status !== 'deleted'
    );
    if (inUse) {
      throw new ConflictException({
        code: 'scorm_package_in_use',
        message: 'Package is referenced by a course material'
      });
    }
    await this.cleanupPrefix(pkg.storagePrefix);
    pkg.status = 'deleted';
    pkg.updatedAt = new Date().toISOString();
    // Аудит: 'learning.scorm_package_deleted'.
    return { id, deleted: true };
  }
}
```

**Примечания для исполнителя:**

- `EntityStatus` (`BaseEntity.status`): проверить допустимые значения в `mvp.types.ts` (есть ли `'deleted'`; если статусная модель иная — использовать принятый в репо механизм soft-delete, как у других MVP-сущностей; グreп `status !== 'deleted'` по mvp.service.ts покажет конвенцию).
- `exactOptionalPropertyTypes`: backend tsconfig может не включать его; если включён — вместо `pkg.error = undefined as never` использовать `delete (pkg as { error?: string }).error`.
- Аудит: заменить комментарии на реальный вызов AuditService, скопировав форму из eisot-сервиса.
- `ScormManifestError` union в Task 5 расширить кодом `'scorm_manifest_missing'`.

- [ ] **Step 5: Run tests** → PASS (vitest по `src/modules/mvp/scorm/scorm.service.test.ts` + `mvp.dto-validation.test.ts`).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/mvp/scorm/ apps/backend/src/modules/mvp/mvp.dto-validation.test.ts
git commit -m "feat(backend): ScormService package lifecycle (register/upload-intent/process/delete) + DTOs"
```

---

### Task 10: ScormService — launch + commit + завершение materialProgress (TDD)

**Files:**

- Modify: `apps/backend/src/modules/mvp/scorm/scorm.service.ts`
- Test: `apps/backend/src/modules/mvp/scorm/scorm.service.test.ts`

- [ ] **Step 1: Failing tests** (сид: курс+версия+модуль+material типа scorm со scormPackageId ready-пакета, группа+groupCourse+enrollment+learner с `linkedIamUserId: 'u_l1'` — скопировать сид-хелперы proctoring.service.test.ts):

```ts
it('launch создаёт attempt (not attempted), возвращает token и launchUrl с launchHref пакета', ...);
// expect(res.launchUrl).toBe(`/api/v1/scorm-content/${res.token}/index.html`)
it('повторный launch возвращает существующий attempt (단 одна запись на enrollment+material)', ...);
it('launch по материалу не-scorm → 412 domain_rule_violation', ...);
it('launch по пакету не-ready → 412 scorm_package_not_ready', ...);
it('launch чужим учеником (actorId не совпадает с linkedIamUserId) → ForbiddenException', ...);
it('commit мёрджит cmi-поля и суммирует sessionSeconds в totalSeconds', ...);
it('commit с lessonStatus=passed выставляет completedAt и завершает materialProgress (state.materialProgress completed)', ...);
it('повторный commit passed НЕ дублирует завершение (completedAt не меняется, прогресс остаётся completed)', ...);
it('commit чужого attempt → ForbiddenException', ...);
```

Для проверки завершения прогресса: после commit-passed найти в `state.materialProgress` запись по `(enrollmentId, materialId)` и проверить `status === 'completed'` (реальный `MvpService.upsertMaterialProgress` сделает это, когда `studiedSeconds >= material.minViewSeconds`).

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Реализация** — добавить в `scorm.service.ts`:

```ts
  /** Доступ ученика к scorm-материалу: материал→модуль→версия→курс, enrollment→groupCourse линк, владелец. */
  private resolveLaunchTarget(tenantId: string, actorId: string | undefined, materialId: string, enrollmentId: string, ctx: RequestContext) {
    const material = this.state.materials.find((m) => m.tenantId === tenantId && m.id === materialId);
    if (!material) throw new NotFoundException({ code: 'not_found', message: 'Material not found' });
    if (material.materialType !== 'scorm' || !material.scormPackageId) {
      throw new PreconditionFailedException({ code: 'domain_rule_violation', message: 'Material is not a SCORM material' });
    }
    const pkg = this.getPackage(tenantId, material.scormPackageId);
    if (pkg.packageStatus !== 'ready' || !pkg.launchHref) {
      throw new PreconditionFailedException({ code: 'scorm_package_not_ready', message: 'SCORM package is not processed yet' });
    }
    const moduleEntity = this.state.modules.find((m) => m.tenantId === tenantId && m.id === material.moduleId);
    const courseVersion = moduleEntity
      ? this.state.courseVersions.find((v) => v.tenantId === tenantId && v.id === moduleEntity.courseVersionId)
      : undefined;
    const enrollment = this.state.enrollments.find((e) => e.tenantId === tenantId && e.id === enrollmentId);
    if (!enrollment || !courseVersion) {
      throw new NotFoundException({ code: 'not_found', message: 'Enrollment not found for SCORM launch' });
    }
    const hasGroupCourseAccess = this.state.groupCourses.some(
      (gc) => gc.tenantId === tenantId && gc.groupId === enrollment.groupId && gc.courseId === courseVersion.courseId
    );
    if (!hasGroupCourseAccess) {
      throw new PreconditionFailedException({ code: 'domain_rule_violation', message: 'Enrollment is not linked to the course for this material' });
    }
    this.mvp.assertActorMatchesLearnerIamLink(tenantId, actorId, enrollment.learnerId, ctx.permissions);
    return { material, pkg, enrollment };
  }

  launchScormMaterial(tenantId, actorId, materialId, request: LaunchScormMaterialRequest, ctx) {
    const { pkg, enrollment } = this.resolveLaunchTarget(tenantId, actorId, materialId, request.enrollmentId, ctx);
    let attempt = this.state.scormAttempts.find(
      (a) => a.tenantId === tenantId && a.enrollmentId === request.enrollmentId && a.materialId === materialId
    );
    const now = new Date().toISOString();
    if (!attempt) {
      attempt = {
        id: this.newId('sca'), tenantId, status: 'active', createdAt: now, updatedAt: now,
        enrollmentId: request.enrollmentId, materialId, learnerId: enrollment.learnerId,
        lessonStatus: 'not attempted', totalSeconds: 0, startedAt: now
      };
      this.state.scormAttempts.push(attempt);
    }
    const token = createScormContentToken(
      { tenantId, packageId: pkg.id },
      backendEnv.SCORM_CONTENT_TOKEN_SECRET,
      { ttlSeconds: backendEnv.SCORM_CONTENT_TOKEN_TTL_SECONDS, nowEpochSeconds: Math.floor(Date.now() / 1000) }
    );
    const apiPrefix = backendEnv.API_PREFIX.startsWith('/') ? backendEnv.API_PREFIX : `/${backendEnv.API_PREFIX}`;
    return { attempt, token, launchUrl: `${apiPrefix}/scorm-content/${token}/${pkg.launchHref}` };
  }

  commitScormAttempt(tenantId, actorId, attemptId, request: CommitScormAttemptRequest, ctx) {
    const attempt = this.state.scormAttempts.find((a) => a.tenantId === tenantId && a.id === attemptId);
    if (!attempt) throw new NotFoundException({ code: 'not_found', message: 'SCORM attempt not found' });
    this.mvp.assertActorMatchesLearnerIamLink(tenantId, actorId, attempt.learnerId, ctx.permissions);
    const now = new Date().toISOString();
    if (request.lessonStatus !== undefined) attempt.lessonStatus = request.lessonStatus;
    if (request.lessonLocation !== undefined) attempt.lessonLocation = request.lessonLocation;
    if (request.suspendData !== undefined) attempt.suspendData = request.suspendData;
    if (request.scoreRaw !== undefined) attempt.scoreRaw = request.scoreRaw;
    if (request.scoreMax !== undefined) attempt.scoreMax = request.scoreMax;
    if (request.scoreMin !== undefined) attempt.scoreMin = request.scoreMin;
    attempt.totalSeconds += request.sessionSeconds ?? 0;
    attempt.lastCommitAt = now;
    attempt.updatedAt = now;
    const completesNow =
      (attempt.lessonStatus === 'passed' || attempt.lessonStatus === 'completed') && !attempt.completedAt;
    if (completesNow) {
      attempt.completedAt = now;
      const material = this.state.materials.find((m) => m.tenantId === tenantId && m.id === attempt.materialId);
      const studiedSeconds = Math.max(material?.minViewSeconds ?? 0, attempt.totalSeconds);
      // Переиспользуем штатный путь завершения материала (D7): идемпотентно, с аудитом и пересчётом
      // module/course-прогресса внутри MvpService.
      this.mvp.upsertMaterialProgress(
        tenantId, actorId, attempt.materialId,
        { enrollmentId: attempt.enrollmentId, studiedSeconds } as never, ctx
      );
    }
    return attempt;
  }
```

(Импорты `PreconditionFailedException`, `ForbiddenException` — из `@nestjs/common`; типы методов — полные сигнатуры как в Task 9. `as never` у DTO-литерала заменить на `plainToInstance(UpdateMaterialProgressRequest, {...})`, если typecheck потребует точный класс.)

- [ ] **Step 4: Run tests** → PASS (все тесты Task 9 + Task 10).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/mvp/scorm/
git commit -m "feat(backend): scorm launch (token+attempt) and cmi commit with materialProgress completion"
```

---

### Task 11: Контроллеры + module wiring + HTTP-тесты

**Files:**

- Create: `apps/backend/src/modules/mvp/scorm/scorm.controller.ts`
- Create: `apps/backend/src/modules/mvp/scorm/scorm-content.controller.ts`
- Create: `apps/backend/src/modules/mvp/scorm/scorm-content.http.integration.test.ts`
- Modify: `apps/backend/src/modules/mvp/mvp.module.ts` (providers + controllers; по образцу подключения eisot-testing-registry)
- Modify: `apps/backend/src/modules/mvp/mvp.http.integration.test.ts` (permission-стабы)

- [ ] **Step 1: ScormController** (авторизованные маршруты; по образцу `eisot-testing-registry.controller.ts`):

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Put,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';

import {
  CommitScormAttemptRequest,
  LaunchScormMaterialRequest,
  RegisterScormPackageRequest
} from './scorm.dto.js';
import { ScormService } from './scorm.service.js';
import { assertValidDto } from '../../../common/app-validation.pipe.js';
import { CurrentContext } from '../../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../../common/guards/tenant.guard.js';
import { RequirePermissions } from '../../iam/permission.decorator.js';
import { PermissionGuard } from '../../iam/permission.guard.js';
import { CreateUploadUrlRequest } from '../mvp.dto.js';
import { MvpRequestPersistenceInterceptor } from '../infrastructure/mvp-request-persistence.interceptor.js';

import type { RequestContext } from '../../../common/context/request-context.js';

@Controller()
@UseInterceptors(MvpRequestPersistenceInterceptor)
@UseGuards(TenantGuard)
export class ScormController {
  constructor(@Inject(ScormService) private readonly scorm: ScormService) {}

  @Post('scorm-packages/upload-url')
  @UseGuards(PermissionGuard)
  @RequirePermissions('materials.write')
  createUploadUrl(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const b = assertValidDto(CreateUploadUrlRequest, raw);
    return this.scorm.createPackageUploadIntent(c.tenantId!, b);
  }

  @Post('scorm-packages')
  @UseGuards(PermissionGuard)
  @RequirePermissions('materials.write')
  register(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const b = assertValidDto(RegisterScormPackageRequest, raw);
    return this.scorm.registerPackage(c.tenantId!, c.userId, b, c);
  }

  @Get('scorm-packages')
  @UseGuards(PermissionGuard)
  @RequirePermissions('materials.read')
  list(@CurrentContext() c: RequestContext) {
    return this.scorm.listPackages(c.tenantId!);
  }

  @Get('scorm-packages/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('materials.read')
  get(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.scorm.getPackageView(c.tenantId!, id); // обёртка над getPackage (сделать public view-метод)
  }

  @Post('scorm-packages/:id/process')
  @UseGuards(PermissionGuard)
  @RequirePermissions('materials.write')
  process(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.scorm.processPackage(c.tenantId!, c.userId, id, c);
  }

  @Delete('scorm-packages/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('materials.write')
  remove(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.scorm.deletePackage(c.tenantId!, c.userId, id, c);
  }

  @Post('scorm-materials/:materialId/launch')
  @UseGuards(PermissionGuard)
  @RequirePermissions('materials.read')
  launch(
    @CurrentContext() c: RequestContext,
    @Param('materialId') materialId: string,
    @Body() raw: unknown
  ) {
    const b = assertValidDto(LaunchScormMaterialRequest, raw);
    return this.scorm.launchScormMaterial(c.tenantId!, c.userId, materialId, b, c);
  }

  @Put('scorm-attempts/:id/commit')
  @UseGuards(PermissionGuard)
  @RequirePermissions('progress.recalculate')
  commit(@CurrentContext() c: RequestContext, @Param('id') id: string, @Body() raw: unknown) {
    const b = assertValidDto(CommitScormAttemptRequest, raw);
    return this.scorm.commitScormAttempt(c.tenantId!, c.userId, id, b, c);
  }
}
```

- [ ] **Step 2: ScormContentController** — unguarded стриминг (НЕТ TenantGuard/interceptor'а; state не читается — префикс детерминирован из токена):

```ts
import { Controller, Get, Inject, NotFoundException, Param, Req, Res } from '@nestjs/common';

import { verifyScormContentToken } from './scorm-content-token.js';
import { contentTypeForPath } from './scorm-zip-guards.js';
import { backendEnv } from '../../../env.js';
import { S3StorageClient } from '../../../infrastructure/storage/s3-storage.client.js';

import type { Request, Response } from 'express';

/**
 * Phase 9 Plan A (D6): раздача распакованного SCORM-контента в iframe.
 * Auth — HMAC-токен в пути (iframe не шлёт заголовков); относительные ассеты курса
 * наследуют /scorm-content/<token>/ префикс. Никакого MVP-state: ключ S3 детерминирован.
 */
@Controller('scorm-content')
export class ScormContentController {
  constructor(@Inject(S3StorageClient) private readonly storage: S3StorageClient) {}

  @Get(':token/*')
  async serve(@Param('token') token: string, @Req() req: Request, @Res() res: Response) {
    const payload = verifyScormContentToken(token, backendEnv.SCORM_CONTENT_TOKEN_SECRET, {
      nowEpochSeconds: Math.floor(Date.now() / 1000)
    });
    if (!payload) {
      throw new NotFoundException({
        code: 'not_found',
        message: 'Invalid or expired content token'
      });
    }
    // Express кладёт wildcard-хвост в params[0] (в Nest 11/path-to-regexp v8 — именованный
    // параметр: тогда @Get(':token/*path') + @Param('path')). Проверить интеграционным тестом.
    const rest = decodeURIComponent((req.params as Record<string, string>)['0'] ?? '');
    if (!rest || rest.split('/').includes('..')) {
      throw new NotFoundException({ code: 'not_found', message: 'Not found' });
    }
    const key = `scorm/${payload.tenantId}/${payload.packageId}/${rest}`;
    try {
      const stream = await this.storage.getObjectStream({ key });
      res.setHeader('Content-Type', contentTypeForPath(rest));
      res.setHeader('Cache-Control', 'private, max-age=3600');
      stream.pipe(res);
    } catch {
      throw new NotFoundException({ code: 'not_found', message: 'Not found' });
    }
  }
}
```

- [ ] **Step 3: Wiring.** В `mvp.module.ts` добавить `ScormService` в providers и `ScormController`, `ScormContentController` в controllers (рядом с eisot/frdo-контроллерами).

- [ ] **Step 4: HTTP-тесты.**

a) `scorm-content.http.integration.test.ts` — поднять минимальный Nest-app (по образцу harness'а `mvp.http.integration.test.ts`: `Test.createTestingModule` с РЕАЛЬНЫМ `ScormContentController` и мокнутым `S3StorageClient` провайдером `{ getObjectStream: vi.fn().mockResolvedValue(Readable.from(Buffer.from('<html>ok</html>'))) }`), `setGlobalPrefix(process.env.API_PREFIX ?? '/api/v1')`. Тесты:

```ts
it('валидный токен → 200, тело контента, Content-Type text/html', ...);     // GET /api/v1/scorm-content/<token>/index.html
it('просроченный токен → 404 (без деталей)', ...);
it('подделанная подпись → 404', ...);
it('путь с ../ → 404, getObjectStream НЕ вызван', ...);
it('S3 промахнулся (reject) → 404', ...);
it('запрос вообще без auth-заголовков проходит (unguarded route)', ...);     // главный контракт D6
```

b) В `mvp.http.integration.test.ts` добавить в стаб-контроллер (по образцу proctoring-блока) маршруты и assertions границы прав: `GET /scorm-packages` → `materials.read`; `POST /scorm-packages`, `POST /scorm-packages/:id/process`, `DELETE /scorm-packages/:id` → `materials.write`; `POST /scorm-materials/:id/launch` → `materials.read`; `PUT /scorm-attempts/:id/commit` → `progress.recalculate`; для каждого: 401 без токена / 403 без права / 200 с правом.

- [ ] **Step 5: Run**

```bash
pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/scorm/scorm-content.http.integration.test.ts --no-file-parallelism
pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/mvp.http.integration.test.ts --no-file-parallelism
```

Expected: PASS. Если wildcard-роут не матчится — переключить синтаксис на `':token/*path'` + `@Param('path')` (см. комментарий в коде) и перепрогнать.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/modules/mvp/scorm/ apps/backend/src/modules/mvp/mvp.module.ts apps/backend/src/modules/mvp/mvp.http.integration.test.ts
git commit -m "feat(backend): scorm controllers (packages/launch/commit + unguarded token content route) + http tests"
```

---

### Task 12: Материалы: DTO/сервис принимают scorm (backend)

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.dto.ts` (`CreateMaterialRequest` / `UpdateMaterialRequest`)
- Modify: `apps/backend/src/modules/mvp/mvp.service.ts` (создание/обновление материала)
- Test: `apps/backend/src/modules/mvp/mvp.dto-validation.test.ts`, `apps/backend/src/modules/mvp/scorm/scorm.service.test.ts` (или существующий materials-блок сервис-тестов — найти, где тестируется createMaterial)

- [ ] **Step 1: Failing tests:** DTO принимает `materialType: 'scorm'` + `scormPackageId`; сервис отклоняет scorm-материал без `scormPackageId` (`BadRequestException validation_error`) и с пакетом не в `ready` (`PreconditionFailedException scorm_package_not_ready`); принимает с ready-пакетом (поле сохраняется).

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Реализация.** В `CreateMaterialRequest`/`UpdateMaterialRequest` (mvp.dto.ts): найти `@IsIn(['file', 'external_url', 'text', 'video'])` у `materialType`, добавить `'scorm'`; добавить поле:

```ts
  /** Phase 9 Plan A: обязателен при materialType='scorm' (валидируется в сервисе — пакет должен быть ready). */
  @IsOptional()
  @IsString()
  scormPackageId?: string;
```

В `mvp.service.ts` в методе создания материала (`createMaterial`/`saveMaterial` — найти по `materials.push`) и обновления — добавить валидацию:

```ts
if (request.materialType === 'scorm') {
  if (!request.scormPackageId) {
    throw new BadRequestException({
      code: 'validation_error',
      message: 'scormPackageId is required for scorm materials'
    });
  }
  const pkg = this.state.scormPackages.find(
    (p) => p.tenantId === tenantId && p.id === request.scormPackageId && p.status !== 'deleted'
  );
  if (!pkg || pkg.packageStatus !== 'ready') {
    throw new PreconditionFailedException({
      code: 'scorm_package_not_ready',
      message: 'SCORM package must be processed before use'
    });
  }
}
```

и прокидывание `scormPackageId` в создаваемую/обновляемую сущность (по образцу `fileId` — conditional spread).

- [ ] **Step 4: Run tests** → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/mvp/
git commit -m "feat(backend): scorm material type in material DTOs + ready-package validation"
```

---

### Task 13: Frontend-фича scorm: types + api + cmi-маппинг (TDD) + dev-rewrite

**Files:**

- Create: `apps/frontend/src/features/scorm/types.ts`
- Create: `apps/frontend/src/features/scorm/api.ts`
- Create: `apps/frontend/src/features/scorm/cmi-mapping.ts`
- Test: `apps/frontend/src/features/scorm/cmi-mapping.test.ts`
- Test: `apps/frontend/src/features/scorm/api.contract.test.ts`
- Modify: `apps/frontend/src/features/mvp/types.ts` (Material: + `'scorm'` в union, + `scormPackageId?`)
- Modify: `apps/frontend/next.config.ts` (dev-rewrite)

- [ ] **Step 1: types.ts**

```ts
export type ScormPackageStatus = 'uploaded' | 'processing' | 'ready' | 'failed';

export interface ScormPackageDto {
  id: string;
  title: string;
  packageStatus: ScormPackageStatus;
  zipFileId: string;
  launchHref?: string;
  manifestTitle?: string;
  entryCount?: number;
  totalBytes?: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export type ScormLessonStatus =
  | 'not attempted'
  | 'incomplete'
  | 'completed'
  | 'passed'
  | 'failed'
  | 'browsed';

export interface ScormAttemptDto {
  id: string;
  enrollmentId: string;
  materialId: string;
  lessonStatus: ScormLessonStatus;
  lessonLocation?: string;
  suspendData?: string;
  scoreRaw?: number;
  scoreMax?: number;
  scoreMin?: number;
  totalSeconds: number;
  startedAt: string;
  completedAt?: string;
}

export interface ScormLaunchDto {
  attempt: ScormAttemptDto;
  token: string;
  /** Относительный same-origin URL: /api/v1/scorm-content/<token>/<launchHref>. */
  launchUrl: string;
}

export interface CommitScormAttemptPayload {
  lessonStatus?: ScormLessonStatus;
  lessonLocation?: string;
  suspendData?: string;
  scoreRaw?: number;
  scoreMax?: number;
  scoreMin?: number;
  sessionSeconds?: number;
}

export interface UploadIntent {
  fileId: string;
  uploadUrl: string;
  storageKey: string;
  expiresInSeconds: number;
}
```

- [ ] **Step 2: api.ts** (паттерн — `features/proctoring/api.ts`, включая локальную копию presigned-PUT-хелпера — документированный прецедент дублирования): методы `scormApi.uploadUrl` (`POST /scorm-packages/upload-url`), `register` (`POST /scorm-packages`), `list` (`GET /scorm-packages`), `process` (`POST /scorm-packages/:id/process`, body `{}`), `remove` (`DELETE /scorm-packages/:id`), `launch` (`POST /scorm-materials/:materialId/launch`, body `{ enrollmentId }`), `commit` (`PUT /scorm-attempts/:id/commit`, body `CommitScormAttemptPayload`) — все через `apiRequest` + `withAuth(session)` ровно как в proctoring/api.ts; плюс хелпер:

```ts
/** Direct PUT zip-файла на presigned MinIO URL (мимо API envelope). Копия хелпера proctoring (прецедент). */
export async function putFileToPresignedUrl(uploadUrl: string, file: File): Promise<void> {
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file
  });
  if (!res.ok) throw new Error(`Не удалось загрузить пакет (HTTP ${res.status})`);
}
```

- [ ] **Step 3: cmi-mapping.ts — чистые функции (сначала failing-тесты `cmi-mapping.test.ts`):**

Тесты:

```ts
import { describe, expect, it } from 'vitest';

import { buildCommitPayload, buildInitialCmi, parseScormSessionTime } from './cmi-mapping';

describe('parseScormSessionTime', () => {
  it.each([
    ['00:00:30', 30],
    ['01:02:03', 3723],
    ['0000:05:00.99', 300],
    ['', 0],
    ['garbage', 0]
  ])('%s → %d сек', (input, expected) => {
    expect(parseScormSessionTime(input)).toBe(expected);
  });
});

describe('buildCommitPayload', () => {
  it('переносит lesson_status/location/suspend_data/score и session_time в секунды', () => {
    const payload = buildCommitPayload({
      core: {
        lesson_status: 'passed',
        lesson_location: 'page-7',
        session_time: '00:10:00',
        score: { raw: '85', max: '100', min: '0' }
      },
      suspend_data: 'state-blob'
    });
    expect(payload).toEqual({
      lessonStatus: 'passed',
      lessonLocation: 'page-7',
      suspendData: 'state-blob',
      scoreRaw: 85,
      scoreMax: 100,
      scoreMin: 0,
      sessionSeconds: 600
    });
  });
  it('опускает пустые/нечисловые поля (exactOptionalPropertyTypes: НЕ undefined-ключи)', () => {
    const payload = buildCommitPayload({ core: { lesson_status: 'incomplete', session_time: '' } });
    expect(payload).toEqual({ lessonStatus: 'incomplete', sessionSeconds: 0 });
    expect('scoreRaw' in payload).toBe(false);
  });
});

describe('buildInitialCmi', () => {
  it('строит JSON для Scorm12API.loadFromJSON из attempt + ученика', () => {
    expect(
      buildInitialCmi(
        {
          id: 'sca_1',
          enrollmentId: 'enr_1',
          materialId: 'mat_1',
          lessonStatus: 'incomplete',
          lessonLocation: 'page-3',
          suspendData: 'blob',
          scoreRaw: 40,
          totalSeconds: 120,
          startedAt: '2026-06-12T00:00:00Z'
        },
        { studentId: 'lrn_1', studentName: 'Иванов Иван' }
      )
    ).toEqual({
      core: {
        student_id: 'lrn_1',
        student_name: 'Иванов Иван',
        lesson_location: 'page-3',
        lesson_status: 'incomplete',
        score: { raw: 40 }
      },
      suspend_data: 'blob'
    });
  });
});
```

Реализация:

```ts
import type { CommitScormAttemptPayload, ScormAttemptDto, ScormLessonStatus } from './types';

/** SCORM 1.2 CMITimespan 'HHHH:MM:SS.SS' → целые секунды; мусор → 0. */
export function parseScormSessionTime(value: string): number {
  const m = /^(\d{2,4}):(\d{2}):(\d{2})(?:\.\d{1,2})?$/.exec(value ?? '');
  if (!m) return 0;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/** Снапшот cmi из scorm-again → payload коммита; пустые поля опускаем (exactOptionalPropertyTypes). */
export function buildCommitPayload(cmi: {
  core?: {
    lesson_status?: string;
    lesson_location?: string;
    session_time?: string;
    score?: { raw?: string | number; max?: string | number; min?: string | number };
  };
  suspend_data?: string;
}): CommitScormAttemptPayload {
  const num = (v: string | number | undefined): number | undefined => {
    if (v === undefined || v === '') return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const score = cmi.core?.score;
  const raw = num(score?.raw);
  const max = num(score?.max);
  const min = num(score?.min);
  return {
    ...(cmi.core?.lesson_status
      ? { lessonStatus: cmi.core.lesson_status as ScormLessonStatus }
      : {}),
    ...(cmi.core?.lesson_location ? { lessonLocation: cmi.core.lesson_location } : {}),
    ...(cmi.suspend_data ? { suspendData: cmi.suspend_data } : {}),
    ...(raw !== undefined ? { scoreRaw: raw } : {}),
    ...(max !== undefined ? { scoreMax: max } : {}),
    ...(min !== undefined ? { scoreMin: min } : {}),
    sessionSeconds: parseScormSessionTime(cmi.core?.session_time ?? '')
  };
}

/** Восстановление cmi при повторном запуске (резюме D7). */
export function buildInitialCmi(
  attempt: ScormAttemptDto,
  learner: { studentId: string; studentName: string }
): Record<string, unknown> {
  return {
    core: {
      student_id: learner.studentId,
      student_name: learner.studentName,
      ...(attempt.lessonLocation ? { lesson_location: attempt.lessonLocation } : {}),
      lesson_status: attempt.lessonStatus,
      ...(attempt.scoreRaw !== undefined ? { score: { raw: attempt.scoreRaw } } : {})
    },
    ...(attempt.suspendData ? { suspend_data: attempt.suspendData } : {})
  };
}
```

- [ ] **Step 4: api.contract.test.ts** — по образцу `features/proctoring/api.contract.test.ts` (`vi.stubGlobal('fetch', ...)`, проверка envelope unwrap `{ data, meta }`, путей, методов, заголовка `x-tenant-id`): покрыть `list`, `register`, `process`, `launch`, `commit` (минимум — launch и commit: правильный URL/метод/body).

- [ ] **Step 5: Material type на фронте.** В `apps/frontend/src/features/mvp/types.ts` — `materialType: 'file' | 'external_url' | 'text' | 'video' | 'scorm'` + `scormPackageId?: string`.

- [ ] **Step 6: dev-rewrite.** В `apps/frontend/next.config.ts`:

```ts
const nextConfig: NextConfig = {
  // ...существующие поля без изменений...
  // Phase 9 (D6): same-origin для SCORM-iframe в dev. В prod Caddy маршрутизирует /api/v1/*
  // на backend ДО Next, rewrite не срабатывает. NEXT_PUBLIC_API_BASE_URL уже содержит /api/v1.
  async rewrites() {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL;
    if (!apiBase) return [];
    return [
      { source: '/api/v1/scorm-content/:path*', destination: `${apiBase}/scorm-content/:path*` }
    ];
  }
};
```

- [ ] **Step 7: Run** — vitest по `src/features/scorm/cmi-mapping.test.ts` и `src/features/scorm/api.contract.test.ts` (single-file команды из шапки плана). Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/features/scorm/ apps/frontend/src/features/mvp/types.ts apps/frontend/next.config.ts
git commit -m "feat(frontend): scorm feature - api client, cmi mapping (pure), dev rewrite for same-origin content"
```

---

### Task 14: Админ-реестр пакетов (/scorm) + scorm-опция в форме материала

**Files:**

- Create: `apps/frontend/src/features/scorm/screens.tsx` (`ScormPackagesScreen`)
- Create: `apps/frontend/src/features/scorm/hooks.ts`
- Modify: `apps/frontend/app/scorm/page.tsx` (заменить заглушку)
- Modify: `apps/frontend/src/features/mvp/screens.tsx` (форма материала, ≈строки 1235–1400)
- Modify: `apps/frontend/src/features/mvp/api.ts` / `hooks.ts` (прокинуть `scormPackageId` в payload saveMaterial — найти текущий тип payload материала)

- [ ] **Step 1: hooks.ts** — `useScormPackages(session)`: загрузка списка (`useState` + `useEffect` + reload-функция, как соседние фичи; НЕ React Query mutations). Мутации (upload+register, process, remove) — `wrap`-паттерн `useDomainMutations` (см. `features/mvp/hooks.ts:131`) или локальный `useState`-аналог как в `CommissionDetailsScreen.onSaveEditInfo`.

- [ ] **Step 2: ScormPackagesScreen** — `PageContainer` + `PageHeader` («SCORM-пакеты», подзаголовок про загрузку готовых курсов) + `SectionCard`:

- `<input type="file" accept=".zip,application/zip">` + кнопка «Загрузить»: `scormApi.uploadUrl` → `putFileToPresignedUrl` → `scormApi.register({ zipFileId, title: имяФайла })` → авто-вызов `scormApi.process(id)` → reload. Ошибки — `FieldError`/`SectionError`.
- `DataTable` (`@cdoprof/ui`): колонки «Название», «Статус» (`StatusChip`: uploaded/processing → нейтральный, ready → success, failed → error + `error`-код в подписи), «Файлов» (entryCount), «Размер» (totalBytes, человекочитаемо), «Создан», действия: «Обработать» (для uploaded/failed), «Удалить» (confirm; ошибка `scorm_package_in_use` → понятное сообщение «Пакет привязан к материалу курса»).
- Состояния `LoadingState` / `SectionEmpty` («Пока нет пакетов — загрузите zip с курсом SCORM 1.2»).

- [ ] **Step 3: page.tsx.** Открыть `apps/frontend/app/scorm/page.tsx`, сохранить существующую обёртку (`ProtectedPage`, если есть) и заменить контент-заглушку на `<ScormPackagesScreen />`.

- [ ] **Step 4: Форма материала.** В `features/mvp/screens.tsx` (CourseDetailsScreen, ≈1238): расширить state-тип `materialType` и `<select>` опцией `<option value="scorm">scorm</option>`; добавить state `scormPackageId` и при `materialType === 'scorm'` показывать select из ready-пакетов (`scormApi.list` → filter `packageStatus === 'ready'`; загрузка при первом выборе scorm-типа); в `saveMaterial(...)` payload добавить conditional spread `...(materialType === 'scorm' && scormPackageId ? { scormPackageId } : {})`. Проверить тип payload в `features/mvp/api.ts`/`hooks.ts` и расширить его полем `scormPackageId?: string`.

- [ ] **Step 5: Проверка** — `pnpm typecheck` + ESLint по затронутым файлам (`npx eslint <paths> --max-warnings=0`) → PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/scorm/ apps/frontend/app/scorm/page.tsx apps/frontend/src/features/mvp/
git commit -m "feat(frontend): scorm packages admin registry (upload/process/delete) + scorm material option"
```

---

### Task 15: ScormPlayer + интеграция в курс-вьюер

**Files:**

- Create: `apps/frontend/src/features/scorm/scorm-player.tsx`
- Modify: `apps/frontend/src/features/course-viewer/material-player.tsx`
- Modify: `apps/frontend/src/features/course-viewer/course-viewer-screen.tsx` (прокинуть enrollmentId)

- [ ] **Step 1: ScormPlayer.** Требования (D7):

- Пропсы: `{ material: Material; enrollmentId: string; onCompleted?: (() => void) | undefined }`.
- При монтировании: `scormApi.launch(session, material.id, enrollmentId)`; пока ждём — `LoadingState`; ошибка → `SectionError` (код `scorm_package_not_ready` → «Курс ещё обрабатывается администратором»).
- После launch: `const { Scorm12API } = await import('scorm-again')` (client-only; компонент `'use client'`); создать `new Scorm12API({ autocommit: false, logLevel: 4 })`; `api.loadFromJSON(buildInitialCmi(attempt, { studentId: session.user.id, studentName: <имя из UserSession — проверить поля> }))`; `(window as { API?: unknown }).API = api`.
- **Только после установки `window.API`** рендерить `<iframe src={launchUrl} sandbox="allow-scripts allow-same-origin allow-forms allow-popups" title={material.title} />` (SCO ищет API синхронно при загрузке).
- Подписки: `api.on('LMSCommit', handler)` и `api.on('LMSFinish', handler)`; handler читает снапшот cmi (поля `api.cmi.core.lesson_status`, `api.cmi.core.lesson_location`, `api.cmi.core.session_time`, `api.cmi.core.score.raw/max/min`, `api.cmi.suspend_data` — сверить имена с типами scorm-again в node_modules) → `buildCommitPayload` → `scormApi.commit(session, attempt.id, payload)`; ошибки коммита показывать ненавязчиво (не ломать плеер), хранить «последний коммит сохранён HH:MM».
- Если payload коммита получил `lessonStatus` `passed`/`completed` — после успешного ответа вызвать `onCompleted?.()`.
- На unmount: снять `window.API`, отписаться, послать финальный commit.
- Никакого RTL-теста на компонент; вся выносимая логика (маппинг, парс времени) уже покрыта в `cmi-mapping.test.ts`.

- [ ] **Step 2: MaterialPlayer.** Расширить пропсы и добавить кейс (учесть, что `default:` exhaustive-check теперь включает `'scorm'`):

```tsx
interface Props {
  material: Material;
  enrollmentId?: string | undefined;
  onMaterialEnded?: (() => void) | undefined;
}

    case 'scorm':
      return enrollmentId ? (
        <ScormPlayer material={material} enrollmentId={enrollmentId} onCompleted={onMaterialEnded} />
      ) : (
        <div className="course-player__placeholder">SCORM-материал доступен в контексте зачисления</div>
      );
```

- [ ] **Step 3: course-viewer-screen.tsx** — найти место рендера `<MaterialPlayer ...>`; экран уже знает enrollmentId (он передаёт его в updateMaterialProgress) — прокинуть `enrollmentId={...}` тем же значением.

- [ ] **Step 4: Проверка** — `pnpm typecheck` + ESLint по затронутым файлам → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/scorm/ apps/frontend/src/features/course-viewer/
git commit -m "feat(frontend): scorm player (scorm-again, same-origin iframe) wired into course viewer"
```

---

### Task 16: Frontend e2e (permission/routing/smoke) + полный прогон

**Files:**

- Create: `apps/frontend/src/e2e/scorm.e2e.test.ts`
- Reference: `apps/frontend/src/e2e/proctoring.e2e.test.ts` (структура), `canonical-e2e-readiness.e2e.test.ts`

- [ ] **Step 1: Тесты** (конвенция репо: НЕ render; только evaluateRouteAccess / getVisibleNavigation / чистые пайплайны / dynamic-import smoke):

1. Route access: `/scorm` доступен с `materials.read`, недоступен без (роут уже в `navigation/model.ts` — тест фиксирует контракт).
2. Навигация: пункт SCORM виден роли с `materials.read` (по образцу proctoring.e2e.test.ts).
3. Pipeline-интеграция (чистые функции): launch-ответ → `buildInitialCmi` → симулированный cmi-снапшот (passed, `00:10:00`, score 85) → `buildCommitPayload` → assert формы payload (`lessonStatus: 'passed'`, `sessionSeconds: 600`).
4. Dynamic-import smoke: `await import('../features/scorm/api')`, `('../features/scorm/screens')`, `('../features/scorm/scorm-player')` — модули загружаются. ВАЖНО: `scorm-again` импортируется только внутри компонента (dynamic) — если import scorm-player падает в node-окружении, ограничиться api+screens и зафиксировать комментарием.

- [ ] **Step 2: Полный прогон frontend** — `pnpm test:frontend` (полный набор на этой машине работает). Expected: PASS (все существующие + новые).

- [ ] **Step 3: Backend изолированные прогоны** (полный backend-suite на Windows/Cyrillic падает — НЕ запускать целиком): vitest single-file по `src/modules/mvp/scorm/` (все файлы), `mvp.http.integration.test.ts`, `src/modules/files/`, `src/infrastructure/database/mvp-domain-migrations.test.ts`, `mvp.dto-validation.test.ts` — каждый с `--no-file-parallelism`. Expected: PASS.

- [ ] **Step 4: Lint + typecheck монорепо** — `pnpm typecheck` и `pnpm lint`. Expected: PASS (pre-existing падения вне наших файлов не блокируют; свои файлы — ESLint `--max-warnings=0`).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/e2e/scorm.e2e.test.ts
git commit -m "test(frontend): scorm e2e - route access, cmi pipeline, module smoke"
```

---

### Task 17: Документация и закрытие сессии

**Files:**

- Modify: `README.md` §2 «AI Agent State» (Current Stage / Last Completed / Current / Next / Last Updated At / By)
- Modify: `LMS_AGENT_HANDOFF.md` — добавить `### 5.119` (следующий номер после 5.118): summary, файлы, тестовый статус, отклонения (включая adm-zip vs unzipper из спеки)
- Modify: `docs/superpowers/plans/2026-06-12-phase-9-plan-a-scorm.md` — проставить `- [x]` выполненным шагам
- Modify: `docs/superpowers/plans/2026-05-21-cdoprof-v1-roadmap.md` — отметить выполненные SCORM-пункты Phase 9 (парсер, плеер, прогресс; дашборд остаётся Plan B)
- Modify: `docs/superpowers/PLANS_STATUS.md` — строка Phase 9 Plan A со статусом и PR (формат — по соседним строкам)
- Modify: `docs/operations-runbook.md` (или `infra/server-setup.md` — где описаны env) — примечание: same-origin SCORM уже покрыт существующим Caddy-маршрутом `/api/v1/*`; новые env `SCORM_PACKAGE_MAX_BYTES`, `SCORM_CONTENT_TOKEN_SECRET` (в проде сгенерировать сильный), `SCORM_CONTENT_TOKEN_TTL_SECONDS`

- [ ] **Step 1: Внести правки во все файлы выше.**
- [ ] **Step 2: Commit**

```bash
git add README.md LMS_AGENT_HANDOFF.md docs/ infra/
git commit -m "docs: Phase 9 Plan A handoff 5.119 + README s2 + roadmap/plan checkboxes + scorm env runbook"
```

---

## Self-review (выполнен при написании плана)

- **Покрытие спеки:** D1 → Task 5 (отказ 2004); D2 → Tasks 13/15 (scorm-again); D3 → Tasks 6/9 (гарды; adm-zip вместо unzipper — осознанное отклонение, зафиксировано в Tech Stack и в handoff Task 17); D4 → Task 5; D5 → Tasks 2/3; D6 → Tasks 7/11/13 (токен, unguarded-роут, rewrite, Caddy уже покрывает prod); D7 → Tasks 10/15 (commit, resume, materialProgress); D8 → Tasks 4/9/14 (maxBytes, флоу админа, идемпотентный process); D9 → Tasks 11/14 (без новых permissions, UI); D10 → Tasks 2, 5–13, 16 (тестовый каркас по конвенциям). §11 спеки (Plan B аналитика) — отдельный план, вне скоупа.
- **Типы согласованы:** `ScormPackage.packageStatus` (НЕ `status` — занят `BaseEntity`), токен `{tenantId, packageId, exp}` совпадает в Tasks 7/10/11, `CommitScormAttemptPayload` фронта зеркалит `CommitScormAttemptRequest` бэка, `launchUrl` строится из `API_PREFIX` и совпадает с маршрутом content-контроллера.
- **Точки верификации исполнителем в живом коде** (не плейсхолдеры — проверка фактов): форма вызова AuditService (копировать из eisot-сервиса), модификатор `assertActorMatchesLearnerIamLink`, wildcard-синтаксис Nest-роута (`:token/*` vs `:token/*path`), значения `EntityStatus`, поля `UserSession` для имени ученика, имя метода создания материала в MvpService, обёртка `app/scorm/page.tsx`.
