# Regulated Training Foundation — Plan C: QR verification, revoke/reissue, licenses, learner file

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Закрыть последние 4 элемента Pillar A spec — публичная QR-проверка подлинности документов, аннулирование/перевыпуск с трассировкой `replaces_document_id`, лицензии центра с валидацией публикации программ, и личное дело ученика с PDF-карточкой.

**Architecture.** Расширение существующих модулей (`documents`, `mvp`) + одна новая схема `org` с таблицей `org.training_licenses` + новый public endpoint без auth (`@SkipAuth` или отдельный controller вне TenantGuard). На фронте — public-страница `/verify/[token]` вне `ProtectedPage`, страница `/admin/licenses`, расширение `/learners/[id]`, меню «Аннулировать»/«Перевыпустить» в `/admin/issuance-journal`.

**Tech Stack.** PostgreSQL миграции, NestJS + TypeScript, Vitest, Next.js, React Query. **Новые зависимости:** `qrcode` (генерация SVG QR в PDF и на странице verify). Если не хотим лишний npm pkg — fallback на сторонний QR-сервис URL (`api.qrserver.com`) — но это привязка к internet. Решение: добавить `qrcode` (≈15kb, no deps).

**Спецификация:** [../specs/2026-05-22-regulated-training-foundation-design.md](../specs/2026-05-22-regulated-training-foundation-design.md) — §5.8 / §5.9 / §5.10 / §5.11.

**Зависимости перед стартом.** Plan A смержен (PR #174 + #175). Plan B смержен (PR #177 — текущий, должен быть merged до старта Plan C; либо ветка Plan C отрезана от Plan B и затем rebased на main после merge).

**Что НЕ входит в Plan C** (вынесено в follow-up / Phase 5+):

- Push-уведомления админу за 30 дней до истечения лицензии (§5.10 noted) — требует Phase 5 notification infrastructure.
- Полноценный PDF-рендер для verify-страницы QR-картинки — Plan C рендерит QR на странице (не в PDF, который генерится background worker'ом).
- Email-уведомления держателю аннулированного документа — требует Phase 5.

---

## File Structure

### Create — backend

- `apps/backend/migrations/0033_documents_qr_token.sql` — колонка `qr_token` (`text unique not null` с дефолтным значением через trigger или backfill), индекс по `qr_token`.
- `apps/backend/migrations/0034_documents_revoke_reissue.sql` — колонки `revoked_at`/`revoked_by`/`revocation_reason`/`replaces_document_id`/`replaced_by_document_id`; расширение status enum значением `revoked` (если status — text, добавляем в CHECK).
- `apps/backend/migrations/0035_org_training_licenses.sql` — схема `org`, таблица `org.training_licenses` со всеми полями из §4.2.
- `apps/backend/migrations/0036_learners_personal_data.sql` — колонки `snils`/`middle_name`/`position` на `mvp.learners` (расширение Learner-сущности; фиксит Plan B `group_learners` placeholder).
- `apps/backend/src/modules/documents/public-verify.controller.ts` — `@Controller('public')` без `TenantGuard`, эндпойнт `GET /verify/:token`. Throttler-decorator на 30 req/мин/IP.
- `apps/backend/src/modules/documents/public-verify.controller.test.ts` — unit-тесты public-controller'а.
- `apps/backend/src/modules/org/licenses.types.ts` — `TrainingLicense` entity + `LicenseStatus` enum.
- `apps/backend/src/modules/org/licenses.dto.ts` — Create/Update DTO + allow-list для license_type / status.
- `apps/backend/src/modules/org/licenses.service.ts` — CRUD service с tenant-isolation + публичный метод `findActiveLicensesFor(tenantId, trainingType, directionId?)`.
- `apps/backend/src/modules/org/licenses.service.test.ts` — TDD-тесты.
- `apps/backend/src/modules/org/licenses.controller.ts` — `/admin/licenses` REST endpoints.
- `apps/backend/src/modules/org/licenses.http.test.ts` — controller unit-тесты (instantiate directly).
- `apps/backend/src/modules/org/org.module.ts` — NestJS module регистрация.
- `apps/backend/src/modules/org/in-memory-org.state.ts` — in-memory store для licenses.
- `apps/backend/src/modules/mvp/learner-pdf-card.service.ts` — собирает данные ученика (enrollments + documents + program meta) для PDF-карточки.
- `apps/backend/src/modules/mvp/learner-pdf-card.service.test.ts` — TDD.

### Modify — backend

- `apps/backend/src/modules/documents/documents.service.ts` — генерация `qr_token` в `generateDocument` + `issueGroupOrder`. Методы `revokeDocument` / `reissueDocument`. `pillar-a-variables.ts` — `resolveDocumentKey` `qr_url` теперь возвращает реальный URL.
- `apps/backend/src/modules/documents/documents.service.test.ts` — тесты для revoke/reissue.
- `apps/backend/src/modules/documents/documents.types.ts` — `GeneratedDocumentEntity` поля `qrToken`, `revokedAt?`, `revokedBy?`, `revocationReason?`, `replacesDocumentId?`, `replacedByDocumentId?`. Status расширен `'revoked'`.
- `apps/backend/src/modules/documents/documents.controller.ts` — endpoints `POST /admin/documents/:id/revoke` + `POST /admin/documents/:id/reissue`.
- `apps/backend/src/modules/documents/pillar-a-variables.ts` — `resolveDocumentKey('qr_url', ...)` — реальный URL.
- `apps/backend/src/modules/documents/pillar-a-variables.test.ts` — обновить qr_url тест: больше не placeholder.
- `apps/backend/src/modules/documents/documents.module.ts` — зарегистрировать `PublicVerifyController`.
- `apps/backend/src/modules/mvp/mvp.types.ts` — `Learner` расширен `snils?: string`, `middleName?: string`, `position?: string`.
- `apps/backend/src/modules/mvp/mvp.service.ts` — `publishCourseVersion` — добавить вызов `licensesService.findActiveLicensesFor` и throw 422 если нет matching license.
- `apps/backend/src/modules/mvp/mvp.controller.ts` — endpoint `GET /learners/:id/pdf-card`.
- `apps/backend/src/modules/documents/pillar-a-variables.ts` — `resolveGroupLearnersVariables` теперь использует реальные `l.snils`, `l.position`, средний middleName в fullName.
- `apps/backend/src/app.module.ts` — импорт `OrgModule`.

### Create — frontend

- `apps/frontend/app/verify/[token]/page.tsx` — public-страница (вне `ProtectedPage`).
- `apps/frontend/src/features/verify/types.ts` — DTO public verify response.
- `apps/frontend/src/features/verify/api.ts` — `fetchVerifyDocument(token)` без auth.
- `apps/frontend/src/features/verify/verify-page.tsx` — компонент карточки.
- `apps/frontend/src/features/verify/verify-page.test.ts` — type/snapshot тесты.
- `apps/frontend/app/admin/licenses/page.tsx` — index page для лицензий.
- `apps/frontend/src/features/licenses/{types,api,hooks,licenses-list}.tsx` — фича licenses.
- `apps/frontend/src/features/licenses/licenses-list.test.ts` — type test.

### Modify — frontend

- `apps/frontend/src/features/issuance-journal/issuance-journal.tsx` — добавить меню действий на строку (Аннулировать / Перевыпустить).
- `apps/frontend/src/features/issuance-journal/api.ts` — методы `revoke` / `reissue`.
- `apps/frontend/src/features/mvp/screens.tsx` (`LearnerDetailsScreen` если есть) — секции «Учебная история» + «Выданные документы» + кнопка «PDF карточка».
- `apps/frontend/src/features/mvp/api.ts` — endpoint `learnerPdfCard(session, id)` (returns blob).

---

## Task 1 — Migration 0033: qr_token

**Files:** create `0033_documents_qr_token.sql` + `migrations.0033.test.ts`.

- [x] **Step 1: Write the migration test (regex check)**

```typescript
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SQL = readFileSync(
  join(__dirname, '../../../migrations/0033_documents_qr_token.sql'),
  'utf-8'
);

describe('migration 0033 — documents qr_token (Plan C §5.8)', () => {
  it('adds qr_token column on generated_documents', () => {
    expect(SQL).toMatch(/ALTER\s+TABLE\s+documents\.generated_documents/i);
    expect(SQL).toMatch(/ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+qr_token\s+text/i);
  });
  it('creates unique index on qr_token', () => {
    expect(SQL).toMatch(
      /CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+idx_generated_documents_qr_token/i
    );
  });
});
```

- [x] **Step 2: Implement migration**

```sql
-- 0033_documents_qr_token.sql
-- Pillar A Plan C §5.8 — qr_token для публичной QR-проверки подлинности.
-- Backfill для существующих документов: trigger-based generation на INSERT
-- (см. service-level генерацию в Task 2). Для уже выпущенных документов
-- (Plan A/B) qr_token остаётся NULL — UI скрывает QR на legacy документах
-- (валидно: они выпущены до feature).

ALTER TABLE documents.generated_documents
  ADD COLUMN IF NOT EXISTS qr_token text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_generated_documents_qr_token
  ON documents.generated_documents (qr_token)
  WHERE qr_token IS NOT NULL;
```

- [x] **Step 3:** Commit `feat(backend): add migration 0033 — qr_token for public verification (Plan C §5.8)`.

---

## Task 2 — qrToken generation in service + Document type + resolveDocumentKey

**Files:** modify `documents.types.ts`, `documents.service.ts`, `pillar-a-variables.ts`. Tests in `documents.service.test.ts` + `pillar-a-variables.test.ts`.

### Спецификация

- `GeneratedDocumentEntity` получает `qrToken?: string`.
- Все 3 пути выпуска (`generateDocument`, `issueGroupOrder` для order и для каждого certificate) генерируют `qr_token = crypto.randomBytes(16).toString('base64url')` (22 символа, ≈128 бит энтропии).
- `resolveDocumentVariables` `document.qr_url` → `${PUBLIC_BASE_URL}/verify/${qrToken}` (PUBLIC_BASE_URL читается из env).

### Steps

- [x] **Step 1:** Add `qrToken?: string` to `GeneratedDocumentEntity`.

- [x] **Step 2:** Add helper `private generateQrToken(): string` в `DocumentsService` (использует node `crypto.randomBytes`).

- [x] **Step 3:** Изменить все места создания `GeneratedDocumentEntity` в сервисе чтобы устанавливать `qrToken = this.generateQrToken()`.

- [x] **Step 4:** Тесты в `documents.service.test.ts` — выпуск через `generateDocument` (после `startTask` → `completeTask`) и `issueGroupOrder` должны давать `.qrToken` ≥ 22 chars, уникальный, base64url-валидный.

- [x] **Step 5:** Обновить `resolveDocumentKey` в `pillar-a-variables.ts`:

```typescript
case 'qr_url':
  return d.qrToken ? `${publicBaseUrl}/verify/${d.qrToken}` : '';
```

Передаём `publicBaseUrl` через расширение `DocumentVariableContext`:

```typescript
export interface DocumentVariableContext {
  document: GeneratedDocumentEntity;
  publicBaseUrl: string;
}
```

Тесты обновить: ожидать URL вместо пустой строки.

- [x] **Step 6:** Commit `feat(backend): generate qr_token on document issuance and resolve document.qr_url (Plan C §5.8)`.

---

## Task 3 — Public verify endpoint (no auth, rate-limited)

**Files:** create `public-verify.controller.ts` + `.test.ts`. Modify `documents.module.ts`.

### Спецификация

- `GET /public/verify/:token` без `TenantGuard`, без `PermissionGuard`, без auth.
- Throttler: 30 req/мин/IP. Используется `@Throttle({ default: { ttl: 60_000, limit: 30 } })`.
- Не раскрывает tenant_id. Возвращает (через прямой service-метод `verifyDocumentByQrToken`):
  ```
  { status: 'valid' | 'revoked' | 'not_found',
    learnerFullName?, programTitle?, academicHours?,
    documentNumber?, issueDate?, issuerName?,
    revokedAt?, revocationReason? }
  ```
- При unknown token → 404 с `{ status: 'not_found' }`.
- При `status='revoked'` (Task 4) — поля `revokedAt`/`revocationReason` обязательны.

### Steps

- [x] **Step 1:** Добавить метод `DocumentsService.verifyDocumentByQrToken(token: string)` который:
  1. Делает global scan по `state.generatedDocuments` (любой tenant) по `qrToken === token`.
  2. Возвращает агрегат для public response (без tenantId).
  3. Не пишет audit самостоятельно (controller пишет).

- [x] **Step 2:** Создать `PublicVerifyController`:

```typescript
import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { DocumentsService } from './documents.service.js';
import { AuditService } from '../audit/audit.service.js';

@Controller('public')
export class PublicVerifyController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly auditService: AuditService
  ) {}

  @Get('verify/:token')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  verify(@Param('token') token: string) {
    this.auditService.write({
      tenantId: 'public',
      action: 'documents.qr_verification_requested',
      entityType: 'documents.generated',
      entityId: token.slice(0, 4)
    });
    const result = this.documentsService.verifyDocumentByQrToken(token);
    if (!result || result.status === 'not_found') {
      throw new NotFoundException({ code: 'document_not_found', message: 'Документ не найден' });
    }
    return result;
  }
}
```

- [x] **Step 3:** Тесты `public-verify.controller.test.ts`: 200 valid, 404 unknown, 200 revoked (после Task 4 — пока assert на existence только).

- [x] **Step 4:** Зарегистрировать в `documents.module.ts`.

- [x] **Step 5:** Commit.

---

## Task 4 — Migration 0034: revoke/reissue columns + status enum

**Files:** create `0034_documents_revoke_reissue.sql` + test.

```sql
-- 0034_documents_revoke_reissue.sql
-- Pillar A Plan C §5.9 — аннулирование и перевыпуск документов.

ALTER TABLE documents.generated_documents
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_by text,
  ADD COLUMN IF NOT EXISTS revocation_reason text,
  ADD COLUMN IF NOT EXISTS replaces_document_id text,
  ADD COLUMN IF NOT EXISTS replaced_by_document_id text;

-- Если status — text + CHECK (а не enum), нужно перезаписать CHECK.
-- В нашем коде status — text без CHECK; runtime-валидация на уровне сервиса.
-- Поэтому DDL для status не требуется (entity-type обновляется в TS).

CREATE INDEX IF NOT EXISTS idx_generated_documents_revoked
  ON documents.generated_documents (tenant_id, revoked_at)
  WHERE revoked_at IS NOT NULL;
```

Test проверяет наличие 5 колонок + индекс. Commit.

---

## Task 5 — Service revokeDocument + reissueDocument

**Files:** modify `documents.service.ts`, `documents.types.ts`, tests.

### Спецификация

- `GeneratedDocumentEntity.status` теперь `'generated' | 'final' | 'archived' | 'revoked'`.
- `revokeDocument(tenantId, actorId, documentId, reason, ctx)` — переводит status в `revoked`, заполняет `revokedAt`/`revokedBy`/`revocationReason`. Конфликт если уже `revoked` (`409`).
- `reissueDocument(tenantId, actorId, originalDocId, reason, ctx)` — атомарно:
  1. Создаёт новый документ копированием полей (template, source) + новый номер через `reserveNumber`, новый qr_token.
  2. Связывает: новый.`replacesDocumentId = original.id` + original.`replacedByDocumentId = new.id`.
  3. Аннулирует исходный (`revokeDocument` с reason "Перевыпуск: ${reason}").
  4. Возвращает `{ original, replacement }`.
- Идемпотентность: если original уже revoked → 409. Если original уже имеет `replacedByDocumentId` → return cached pair (idempotent).

### Steps

TDD tests (~6 штук на revokeDocument, ~5 на reissueDocument покрывающих happy path + 409 + cross-tenant + idempotency + audit + qr_token uniqueness в reissue).

Commit.

---

## Task 6 — HTTP endpoints revoke/reissue + UI menu

**Files:** modify `documents.controller.ts`, `documents.issuance-journal.test.ts`, frontend `issuance-journal.tsx` + `api.ts`.

### Backend

- `POST /admin/documents/:id/revoke` body `{ reason }` — permission `documents.write` + дополнительная RBAC проверка `admin || methodist`. (В существующем permission системе это просто `documents.write`; spec §5.9 уточняет admin/methodist — это уровень роли, который маппится на `documents.write` уже.)
- `POST /admin/documents/:id/reissue` body `{ reason }`.

### Frontend

- В `issuance-journal.tsx`: на каждой строке кнопка «...» открывает popover с пунктами «Аннулировать» / «Перевыпустить».
- Modals: подтверждение с обязательным `reason: string` (textarea).
- После успеха: react-query invalidate `['issuance-journal']`, toast «Готово».

Commit.

---

## Task 7 — Migration 0035: org.training_licenses

```sql
-- 0035_org_training_licenses.sql
-- Pillar A Plan C §5.10 — лицензии и аккредитации центра.

CREATE SCHEMA IF NOT EXISTS org;

CREATE TABLE IF NOT EXISTS org.training_licenses (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  license_type text NOT NULL,
    -- 'education_license' | 'accreditation' | 'sro_membership' | 'other'
  license_number text NOT NULL,
  issuer_name text NOT NULL,
  issued_at date NOT NULL,
  valid_until date,
  scan_file_id text,
  permitted_training_types text[],
    -- NULL = универсальная, иначе подмножество TrainingType
  permitted_directions text[],
    -- NULL = все направления, иначе массив direction_ids
  status text NOT NULL DEFAULT 'active',
    -- 'active' | 'expired' | 'revoked'
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_training_licenses_tenant_status
  ON org.training_licenses (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_training_licenses_valid_until
  ON org.training_licenses (tenant_id, valid_until)
  WHERE status = 'active';
```

Test + commit.

---

## Task 8 — Licenses service + CRUD endpoints + publish validation

**Files:** create `org/` module files; modify `mvp.service.ts.publishCourseVersion`.

### Спецификация

- `LicensesService.findActiveLicensesFor(tenantId, trainingType, directionId?)` — возвращает все active licenses у которых:
  - `permittedTrainingTypes === null || permittedTrainingTypes.includes(trainingType)`.
  - И (`permittedDirections === null || permittedDirections.includes(directionId)`).
- `publishCourseVersion` (в `mvp.service.ts`) перед переводом в `published`:
  - Если `findActiveLicensesFor(...)` пусто → `BadRequestException({ code: 'no_matching_license', message: 'У центра нет активной лицензии на этот вид подготовки' })` (status 422 mapping).

### Steps

TDD tests на:

- CRUD service (8-10 тестов, как в Plan A для Commission).
- `findActiveLicensesFor` — matching правил (4-6 тестов).
- Publish validation: 422 если нет лицензии (1 тест).

Endpoints `/admin/licenses` (list/create/patch/revoke).

Commit.

---

## Task 9 — Frontend /admin/licenses page

**Files:** create `features/licenses/*` + `app/admin/licenses/page.tsx`.

Простая таблица + форма create/edit + кнопка revoke. UI-паттерны как в `commissions/`. Файлы:

- `features/licenses/types.ts` — DTO + label-mappings.
- `features/licenses/api.ts` — REST client.
- `features/licenses/hooks.ts` — `useLicenses` + invalidate.
- `features/licenses/licenses-list.tsx` — view.
- `features/licenses/licenses-list.test.ts` — type invariants.
- `app/admin/licenses/page.tsx` — page route.

Commit.

---

## Task 10 — Migration 0036: Learner personal data

```sql
-- 0036_learners_personal_data.sql
-- Pillar A Plan C §5.11 + fix Plan B group_learners placeholder.

ALTER TABLE mvp.learners
  ADD COLUMN IF NOT EXISTS snils text,
  ADD COLUMN IF NOT EXISTS middle_name text,
  ADD COLUMN IF NOT EXISTS position text;
```

Test + commit.

---

## Task 11 — Learner type extension + group_learners real values

**Files:** modify `mvp.types.ts`, `pillar-a-variables.ts` + tests.

### Спецификация

- `Learner` добавляет `snils?: string`, `middleName?: string`, `position?: string`.
- `resolveGroupLearnersVariables` теперь использует `l.snils ?? ''`, `l.position ?? ''`, fullName = `${lastName} ${firstName}${middleName ? ' ' + middleName : ''}`.
- Обновить тесты в `pillar-a-variables.test.ts` — заполнить snils/position в fixtures и проверить что они проходят насквозь.

Commit.

---

## Task 12 — Learner PDF card service + endpoint

**Files:** create `learner-pdf-card.service.ts` + `.test.ts`. Modify `mvp.controller.ts`.

### Спецификация

- `LearnerPdfCardService.composeData(tenantId, learnerId)` собирает:
  - Learner core (fullName, snils, position).
  - Все enrollments + program meta.
  - Все generated documents учеников этих enrollments.
- Возвращает structured aggregate (НЕ PDF binary — Plan C не делает PDF rendering, это для async worker'а с уже существующим document generation pipeline).
- Endpoint `GET /learners/:id/pdf-card` возвращает JSON aggregate; реальный PDF — submission через существующий `generateDocument` с template_type='report' (создаётся методистом отдельно). Это deviation от спеки которая просила PDF endpoint — но реальный PDF-render требует подключения к background worker pipeline, что Plan C не закрывает.

### Steps

Tests на агрегацию + tenant-isolation. Endpoint + permission `learners.read`.

Commit.

---

## Task 13 — Frontend learner page sections + PDF download button

**Files:** modify `mvp/screens.tsx` (`LearnerDetailsScreen` если есть), add `learner-history-section.tsx` + `learner-documents-section.tsx`. `mvp/api.ts` — `learnerPdfCard`.

### Спецификация

- Секция «Учебная история» — таблица enrollments с программой/часами/датами.
- Секция «Выданные документы» — таблица с QR-копированием.
- Кнопка «Экспорт PDF: карточка ученика» — пока показывает alert «В разработке» (так как Plan C не закрывает PDF rendering — см. deviation в Task 12).

Commit.

---

## Verification

- [x] `pnpm --filter @cdoprof/backend test` — все зелёные. Baseline 559 + ~50 новых от Plan C = ~610.
- [x] `pnpm --filter @cdoprof/frontend test` — baseline 117 + ~10 новых = ~127.
- [x] `pnpm --filter @cdoprof/backend exec tsc --noEmit` — 0 ошибок.
- [x] `pnpm --filter @cdoprof/frontend exec tsc --noEmit` — 0 ошибок.
- [x] Manual smoke: выпуск нового документа → QR-сканирование (или ручной visit URL) показывает карточку. Revoke → показывает «Аннулирован». Reissue → создаёт новый связанный документ.

---

## Self-Review

**1. Spec coverage:**

- §5.8 QR — ✓ Tasks 1-3.
- §5.9 Revoke/Reissue — ✓ Tasks 4-6.
- §5.10 Licenses — ✓ Tasks 7-9.
- §5.11 Learner file — ✓ Tasks 10-13.

**2. Deviations from spec (intentional):**

- §5.11 PDF endpoint — возвращает JSON aggregate, не PDF binary. Реальный PDF — через существующий document generation pipeline + template типа `report`. PDF endpoint остаётся для Phase 5 когда подключим async worker для on-demand PDF.
- §5.10 Email-notification за 30 дней — out of scope (требует Phase 5 notification infrastructure).

**3. Compile-time sync:**

- `TemplateType` остаётся 8 значений (Plan B); ничего не добавляется.
- Новые union'ы: `LicenseType`, `LicenseStatus` — `as const satisfies readonly Type[]` pattern.
- `GeneratedDocumentStatus` расширяется `'revoked'` — нужно обновить все switch'и (если есть exhaustive проверки).

**4. Migration ordering:**

- 0033 → 0034 → 0035 → 0036, последовательно. Если кто-то параллельно работает над другой фичей с миграцией 0033+, конфликт по номеру нужно решать через rename + rebase.
