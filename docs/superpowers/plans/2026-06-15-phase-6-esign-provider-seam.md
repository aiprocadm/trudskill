# Phase 6 — Provider-agnostic e-signature seam (НЭП) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ввести провайдер-абстракцию подписи документов с безопасным `NoopDocumentSignatureProvider` по умолчанию, прошить её за флагом `ESIGN_ENABLED`, добавить метаданные подписи на удостоверение и подписывать документ при финализации/по запросу — так, чтобы реальный КриптоПро-адаптер подключался позже **одной заменой фабрики**, не трогая места вызова.

**Architecture:** Точная копия AV-gate паттерна (`infrastructure/antivirus/`): интерфейс + Noop-реализация + DI-токен (`Symbol`), выбор реализации фабрикой в модуле по env-флагу. Метаданные подписи живут на `GeneratedDocumentEntity` и персистятся автоматически (документы хранятся целиком как `jsonb`-снимок — **SQL-миграция для полей подписи не нужна**). Единственная SQL-миграция — сид нового права `documents.sign`. Юр-модель — гибрид: НЭП на документы автоматически + КЭП на выгрузки (отдельно, вне этого плана). См. спеку решения в памяти `project_esign_phase6`.

**Tech Stack:** TypeScript, NestJS (request-scoped DocumentsService), Zod (env), Vitest. ГОСТ-подпись (КриптоПро CSP + КриптоАРМ SDK) — будущий адаптер, в этом плане НЕ реализуется.

---

## Контекст и точки интеграции (прочитать перед стартом)

- **Шаблон паттерна:** [`apps/backend/src/infrastructure/antivirus/antivirus.scanner.ts`](../../../apps/backend/src/infrastructure/antivirus/antivirus.scanner.ts) (интерфейс + Noop + `Symbol`-токен) и его прошивка в [`apps/backend/src/modules/files/files.module.ts:17-24`](../../../apps/backend/src/modules/files/files.module.ts) (фабрика по `backendEnv.ANTIVIRUS_ENABLED`).
- **env-паттерн булевого флага:** [`apps/backend/src/env.schema.ts:38-43`](../../../apps/backend/src/env.schema.ts) (кастомный парс `'false'`→false, НЕ `z.coerce.boolean`).
- **Сущность документа:** [`apps/backend/src/modules/documents/documents.types.ts:121-155`](../../../apps/backend/src/modules/documents/documents.types.ts) (`GeneratedDocumentEntity`).
- **Где подписывать:** [`apps/backend/src/modules/documents/documents.service.ts:741-767`](../../../apps/backend/src/modules/documents/documents.service.ts) (`finalizeDocument` — естественный хук: документ становится `final`).
- **Конструктор сервиса:** `documents.service.ts:117-122` — `(state, audit, realtime, metrics?, events?)`. Десятки тестов вызывают 3-аргументную форму → новый провайдер добавляем **последним опциональным** аргументом.
- **Контроллер:** [`apps/backend/src/modules/documents/documents.controller.ts:261-266`](../../../apps/backend/src/modules/documents/documents.controller.ts) (`finalize` endpoint — образец для нового `sign`).
- **DI модуля:** [`apps/backend/src/modules/documents/documents.module.ts`](../../../apps/backend/src/modules/documents/documents.module.ts).
- **Сид прав (образец):** [`apps/backend/migrations/0031_iam_pillar_a_permissions.sql`](../../../apps/backend/migrations/0031_iam_pillar_a_permissions.sql). Последняя миграция — `0052`; новая будет **`0053`**.
- **Персистентность:** [`postgres-documents-persistence.backend.ts:127-132`](../../../apps/backend/src/modules/documents/infrastructure/postgres-documents-persistence.backend.ts) — каждая сущность пишется целиком `JSON.stringify(entity)` в `data jsonb`. Новые поля сущности персистятся без миграции.

**Команды (Windows, см. CLAUDE.md «Gotchas» — полный backend-suite падает на кириллице, гоняем изолированно):**

```bash
pnpm --filter @cdoprof/backend exec vitest run <path> --no-file-parallelism
pnpm --filter @cdoprof/frontend exec vitest run <path> --no-file-parallelism
npx eslint <path> --max-warnings=0
pnpm typecheck
```

---

## File Structure

- **Create** `apps/backend/src/infrastructure/document-signature/document-signature.provider.ts` — интерфейс `DocumentSignatureProvider`, тип `SignatureResult`, DI-токен `DOCUMENT_SIGNATURE_PROVIDER`, класс `NoopDocumentSignatureProvider`. Одна ответственность: контракт подписи + безопасный дефолт.
- **Create** `apps/backend/src/infrastructure/document-signature/noop-document-signature.provider.test.ts` — тесты Noop.
- **Modify** `apps/backend/src/env.schema.ts` — флаги `ESIGN_ENABLED`, `ESIGN_PROVIDER`, `ESIGN_SIGNER_NAME`.
- **Create** `apps/backend/src/env.esign.test.ts` — тесты парса env.
- **Modify** `apps/backend/src/modules/documents/documents.types.ts` — поля подписи на `GeneratedDocumentEntity` + тип `DocumentSignatureStatus`.
- **Modify** `apps/backend/src/modules/documents/documents.service.ts` — опц. инъекция провайдера, приватный `signDocumentInternal`, вызов из `finalizeDocument`, публичный `signDocument` (ручной/повторный).
- **Modify** `apps/backend/src/modules/documents/documents.service.test.ts` — unit-тесты подписи.
- **Modify** `apps/backend/src/modules/documents/documents.module.ts` — фабрика `DOCUMENT_SIGNATURE_PROVIDER`.
- **Modify** `apps/backend/src/modules/documents/documents.controller.ts` — `POST documents/:id/sign` под `documents.sign`.
- **Modify** `apps/backend/src/modules/documents/documents.http.integration.test.ts` — permission-boundary для `sign`.
- **Create** `apps/backend/migrations/0053_iam_documents_sign_permission.sql` — сид права `documents.sign`.
- **Create** `apps/backend/src/modules/documents/migrations.0053.test.ts` — тест миграции.
- **Modify** `apps/frontend/src/features/...` (read DTO + контракт-тест) — отображение статуса подписи (минимально).
- **Modify** docs: `README.md` §2, `LMS_AGENT_HANDOFF.md` §5.x, `docs/superpowers/plans/PLANS_STATUS.md`, этот план.

---

### Task 1: Signature provider interface + Noop default

**Files:**

- Create: `apps/backend/src/infrastructure/document-signature/document-signature.provider.ts`
- Test: `apps/backend/src/infrastructure/document-signature/noop-document-signature.provider.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// noop-document-signature.provider.test.ts
import { describe, expect, it } from 'vitest';

import { NoopDocumentSignatureProvider } from './document-signature.provider.js';

describe('NoopDocumentSignatureProvider', () => {
  it('reports unsigned without touching storage (safe default)', async () => {
    const provider = new NoopDocumentSignatureProvider();
    const result = await provider.sign({
      documentId: 'gdoc_1',
      fileId: 'file_1',
      tenantId: 't1'
    });
    expect(result).toEqual({ status: 'unsigned' });
  });

  it('exposes a provider id of "noop"', () => {
    expect(new NoopDocumentSignatureProvider().id).toBe('noop');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/infrastructure/document-signature/noop-document-signature.provider.test.ts --no-file-parallelism`
Expected: FAIL — `Cannot find module './document-signature.provider.js'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// document-signature.provider.ts
/**
 * Provider-agnostic seam for ГОСТ document signing (НЭП), mirroring AntivirusScanner.
 * Noop is the safe default for dev/test and any env with ESIGN_ENABLED=false:
 * documents stay `unsigned` and the existing generate→finalize→download flow is unchanged.
 * A КриптоПро (CSP + КриптоАРМ SDK) adapter plugs in later behind the same token.
 */
export type DocumentSignatureStatus = 'unsigned' | 'signed' | 'failed';

export interface SignDocumentParams {
  tenantId: string;
  documentId: string;
  /** S3/MinIO key of the PDF to sign (GeneratedDocumentEntity.fileId / pdfFileId). */
  fileId: string;
}

export interface SignatureResult {
  status: DocumentSignatureStatus;
  /** Opaque reference to the stored signature (detached .sig key / provider tx id). Set when signed. */
  signatureRef?: string;
  /** Certificate subject / thumbprint for display + audit. Set when signed. */
  certificateSubject?: string;
  /** Error text when status==='failed'. */
  detail?: string;
}

export interface DocumentSignatureProvider {
  /** Stable provider id stored on the document for traceability ('noop' | 'cryptopro' | ...). */
  readonly id: string;
  sign(params: SignDocumentParams): Promise<SignatureResult>;
}

/** DI token for the active signer. Mirrors ANTIVIRUS_SCANNER. */
export const DOCUMENT_SIGNATURE_PROVIDER = Symbol('DOCUMENT_SIGNATURE_PROVIDER');

export class NoopDocumentSignatureProvider implements DocumentSignatureProvider {
  readonly id = 'noop';
  async sign(_params: SignDocumentParams): Promise<SignatureResult> {
    return { status: 'unsigned' };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/infrastructure/document-signature/noop-document-signature.provider.test.ts --no-file-parallelism`
Expected: PASS (2 tests).

- [ ] **Step 5: Lint + commit**

```bash
npx eslint apps/backend/src/infrastructure/document-signature/*.ts --max-warnings=0
git add apps/backend/src/infrastructure/document-signature/
git commit -m "feat(backend): document signature provider seam + Noop default"
```

---

### Task 2: Env flags for the signing seam

**Files:**

- Modify: `apps/backend/src/env.schema.ts:43` (после блока CLAMAV\_\*)
- Test: `apps/backend/src/env.esign.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// env.esign.test.ts
import { describe, expect, it } from 'vitest';

import { backendEnvSchema } from './env.schema.js';

const base = {
  DATABASE_URL: 'postgres://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  RABBITMQ_URL: 'amqp://localhost:5672',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_ACCESS_KEY: 'a',
  S3_SECRET_KEY: 'b',
  S3_BUCKET: 'bucket'
};

describe('ESIGN env flags', () => {
  it('defaults to disabled / noop', () => {
    const env = backendEnvSchema.parse({ ...base });
    expect(env.ESIGN_ENABLED).toBe(false);
    expect(env.ESIGN_PROVIDER).toBe('noop');
  });

  it('does not enable on the string "false"', () => {
    const env = backendEnvSchema.parse({ ...base, ESIGN_ENABLED: 'false' });
    expect(env.ESIGN_ENABLED).toBe(false);
  });

  it('enables on "true" and accepts a provider + signer name', () => {
    const env = backendEnvSchema.parse({
      ...base,
      ESIGN_ENABLED: 'true',
      ESIGN_PROVIDER: 'cryptopro',
      ESIGN_SIGNER_NAME: 'ООО Учебный Центр'
    });
    expect(env.ESIGN_ENABLED).toBe(true);
    expect(env.ESIGN_PROVIDER).toBe('cryptopro');
    expect(env.ESIGN_SIGNER_NAME).toBe('ООО Учебный Центр');
  });
});
```

> NOTE: убедись, что `backendEnvSchema` экспортируется из `env.schema.ts`. Если экспортируется иначе (напр. `envSchema`) — поправь импорт в тесте под фактическое имя; не вводи новый экспорт.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/env.esign.test.ts --no-file-parallelism`
Expected: FAIL — `ESIGN_ENABLED` is `undefined`.

- [ ] **Step 3: Add the flags (insert after `CLAMAV_PORT` line ~43)**

```typescript
    // E-signature seam (Phase 6, НЭП). Ships dormant (false) → NoopDocumentSignatureProvider.
    // Custom boolean parse — NOT z.coerce.boolean (which maps the string "false" → true),
    // same rule as ANTIVIRUS_ENABLED so a signing flag is never accidentally on.
    ESIGN_ENABLED: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((v) => v === true || v === 'true')
      .default(false),
    /** Active signing provider. 'noop' until a КриптоПро adapter is wired (Phase 6 follow-up). */
    ESIGN_PROVIDER: z.enum(['noop', 'cryptopro']).default('noop'),
    /** Human-readable signer (organisation) name stamped onto the document for display. */
    ESIGN_SIGNER_NAME: z.string().min(1).default('CDOProf'),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/env.esign.test.ts --no-file-parallelism`
Expected: PASS (3 tests).

- [ ] **Step 5: Lint + commit**

```bash
npx eslint apps/backend/src/env.schema.ts apps/backend/src/env.esign.test.ts --max-warnings=0
git add apps/backend/src/env.schema.ts apps/backend/src/env.esign.test.ts
git commit -m "feat(backend): ESIGN_ENABLED/ESIGN_PROVIDER/ESIGN_SIGNER_NAME env flags (dormant)"
```

---

### Task 3: Signature metadata on GeneratedDocumentEntity

**Files:**

- Modify: `apps/backend/src/modules/documents/documents.types.ts:155` (внутри `GeneratedDocumentEntity`, перед закрывающей `}`)
- Test: `apps/backend/src/modules/documents/documents.types.test.ts`

> Полей подписи нет в БД-схеме явно — документ персистится целиком как `jsonb`-снимок (см. контекст), поэтому **SQL-миграция для этих полей НЕ нужна**.

- [ ] **Step 1: Write the failing test (append to existing documents.types.test.ts)**

```typescript
import { describe, expect, it } from 'vitest';

import type { GeneratedDocumentEntity, DocumentSignatureStatus } from './documents.types.js';

describe('GeneratedDocumentEntity signature fields (Phase 6)', () => {
  it('accepts a fully-signed document shape', () => {
    const statuses: DocumentSignatureStatus[] = ['unsigned', 'signed', 'failed'];
    expect(statuses).toContain('signed');
    const doc: Pick<
      GeneratedDocumentEntity,
      | 'signatureStatus'
      | 'signedAt'
      | 'signedBy'
      | 'signatureProvider'
      | 'signatureRef'
      | 'signatureCertificateSubject'
    > = {
      signatureStatus: 'signed',
      signedAt: '2026-06-15T00:00:00.000Z',
      signedBy: 'user_1',
      signatureProvider: 'cryptopro',
      signatureRef: 'sig_abc',
      signatureCertificateSubject: 'CN=ООО Учебный Центр'
    };
    expect(doc.signatureStatus).toBe('signed');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/documents/documents.types.test.ts --no-file-parallelism`
Expected: FAIL — typecheck error: properties don't exist / `DocumentSignatureStatus` not exported.

- [ ] **Step 3: Add fields + re-export the status type**

В `documents.types.ts` добавь импорт-реэкспорт типа статуса в начало файла (рядом с другими типами):

```typescript
import type { DocumentSignatureStatus } from '../../infrastructure/document-signature/document-signature.provider.js';
export type { DocumentSignatureStatus };
```

В `GeneratedDocumentEntity` перед закрывающей скобкой (после `replacedByDocumentId?`):

```typescript
  /** Phase 6 — статус подписи. undefined для legacy/несписанных документов трактуется как 'unsigned'. */
  signatureStatus?: DocumentSignatureStatus;
  /** Phase 6 — момент подписания (ISO timestamp). */
  signedAt?: string;
  /** Phase 6 — кто инициировал подписание (actorId; 'system' для авто-подписи при финализации). */
  signedBy?: string;
  /** Phase 6 — id провайдера подписи на момент подписания ('noop' | 'cryptopro'). */
  signatureProvider?: string;
  /** Phase 6 — непрозрачная ссылка на хранимую подпись (detached .sig key / tx id провайдера). */
  signatureRef?: string;
  /** Phase 6 — subject/thumbprint сертификата для отображения и аудита. */
  signatureCertificateSubject?: string;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/documents/documents.types.test.ts --no-file-parallelism`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
npx eslint apps/backend/src/modules/documents/documents.types.ts apps/backend/src/modules/documents/documents.types.test.ts --max-warnings=0
git add apps/backend/src/modules/documents/documents.types.ts apps/backend/src/modules/documents/documents.types.test.ts
git commit -m "feat(backend): signature metadata fields on GeneratedDocumentEntity"
```

---

### Task 4: Sign on finalize + manual signDocument in service

**Files:**

- Modify: `apps/backend/src/modules/documents/documents.service.ts` (импорты ~14-35; конструктор 117-122; `finalizeDocument` 741-767; добавить методы рядом)
- Test: `apps/backend/src/modules/documents/documents.service.test.ts`

- [ ] **Step 1: Write the failing tests (append to documents.service.test.ts)**

Используй существующий хелпер создания сервиса (см. `new DocumentsService(state, audit, realtime)` в файле). Добавь тест-провайдер.

```typescript
import {
  type DocumentSignatureProvider,
  type SignatureResult
} from '../../infrastructure/document-signature/document-signature.provider.js';

class StubSignatureProvider implements DocumentSignatureProvider {
  readonly id = 'cryptopro';
  constructor(private readonly result: SignatureResult) {}
  calls: Array<{ documentId: string }> = [];
  async sign(params: { documentId: string; fileId: string; tenantId: string }) {
    this.calls.push({ documentId: params.documentId });
    return this.result;
  }
}

// helper that seeds one generated document directly into state and returns {service, state, doc}
function makeSignServiceWith(provider?: DocumentSignatureProvider) {
  const state = new InMemoryDocumentsState();
  const service = new DocumentsService(
    state,
    new AuditService(),
    new RealtimeEventsService(),
    undefined,
    undefined,
    provider
  );
  const doc = {
    id: 'gdoc_sig',
    tenantId: 't1',
    templateId: 'tpl',
    templateVersionId: 'tplv',
    documentType: 'certificate',
    name: 'cert',
    sourceEntityType: 'enrollment',
    sourceEntityId: 'enr_1',
    fileId: 'file_1',
    status: 'generated' as const,
    isFinal: false,
    generatedAt: '2026-06-15T00:00:00.000Z'
  };
  state.generatedDocuments.push(doc as never);
  return { service, state, doc };
}

const ctx = {
  tenantId: 't1',
  userId: 'user_1',
  requestId: 'r1',
  correlationId: 'c1'
} as never;

describe('DocumentsService signing (Phase 6)', () => {
  it('finalize without a provider leaves the document unsigned (back-compat)', async () => {
    const { service, state } = makeSignServiceWith(undefined);
    await service.finalizeDocument('t1', 'user_1', 'gdoc_sig', ctx);
    expect(state.generatedDocuments[0].signatureStatus ?? 'unsigned').toBe('unsigned');
  });

  it('finalize with a signing provider stamps signed metadata', async () => {
    const provider = new StubSignatureProvider({
      status: 'signed',
      signatureRef: 'sig_abc',
      certificateSubject: 'CN=УЦ'
    });
    const { service, state } = makeSignServiceWith(provider);
    await service.finalizeDocument('t1', 'user_1', 'gdoc_sig', ctx);
    const d = state.generatedDocuments[0];
    expect(d.signatureStatus).toBe('signed');
    expect(d.signatureProvider).toBe('cryptopro');
    expect(d.signatureRef).toBe('sig_abc');
    expect(d.signatureCertificateSubject).toBe('CN=УЦ');
    expect(d.signedAt).toBeDefined();
    expect(d.isFinal).toBe(true);
    expect(provider.calls).toHaveLength(1);
  });

  it('finalize still succeeds when signing fails (status=failed, document stays final)', async () => {
    const provider = new StubSignatureProvider({ status: 'failed', detail: 'provider_down' });
    const { service, state } = makeSignServiceWith(provider);
    const result = await service.finalizeDocument('t1', 'user_1', 'gdoc_sig', ctx);
    expect(result.isFinal).toBe(true);
    expect(state.generatedDocuments[0].signatureStatus).toBe('failed');
  });

  it('signDocument re-signs an already-final document on demand', async () => {
    const provider = new StubSignatureProvider({ status: 'signed', signatureRef: 'sig_2' });
    const { service, state } = makeSignServiceWith(provider);
    state.generatedDocuments[0].status = 'final';
    state.generatedDocuments[0].isFinal = true;
    state.generatedDocuments[0].signatureStatus = 'failed';
    await service.signDocument('t1', 'user_1', 'gdoc_sig', ctx);
    expect(state.generatedDocuments[0].signatureStatus).toBe('signed');
    expect(state.generatedDocuments[0].signatureRef).toBe('sig_2');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/documents/documents.service.test.ts -t "signing (Phase 6)" --no-file-parallelism`
Expected: FAIL — конструктор не принимает 6-й аргумент / `signDocument` не определён.

- [ ] **Step 3a: Add import + optional constructor injection**

В импортах `documents.service.ts` добавь:

```typescript
import {
  DOCUMENT_SIGNATURE_PROVIDER,
  type DocumentSignatureProvider
} from '../../infrastructure/document-signature/document-signature.provider.js';
```

В конструкторе (после `events?`):

```typescript
    @Optional()
    @Inject(DOCUMENT_SIGNATURE_PROVIDER)
    private readonly signatureProvider?: DocumentSignatureProvider
```

- [ ] **Step 3b: Add the private signing helper + call it from finalizeDocument**

Добавь приватный метод (рядом с `finalizeDocument`):

```typescript
  /**
   * Phase 6 — подписывает документ через активный провайдер и проставляет метаданные.
   * Провайдер отсутствует (старые call-sites/тесты) или Noop → документ остаётся unsigned.
   * Сбой провайдера НЕ откатывает финализацию: ставим status='failed' и продолжаем
   * (повторить можно через signDocument). Это зеркалит fail-soft AV-gate.
   */
  private async applySignature(
    doc: GeneratedDocumentEntity,
    actorId: string | undefined,
    ctx: RequestContext
  ): Promise<void> {
    if (!this.signatureProvider || this.signatureProvider.id === 'noop') return;
    let result;
    try {
      result = await this.signatureProvider.sign({
        tenantId: doc.tenantId,
        documentId: doc.id,
        fileId: doc.pdfFileId ?? doc.fileId
      });
    } catch (err) {
      result = { status: 'failed' as const, detail: String(err) };
    }
    doc.signatureStatus = result.status;
    doc.signatureProvider = this.signatureProvider.id;
    if (result.status === 'signed') {
      doc.signedAt = this.now();
      doc.signedBy = actorId ?? 'system';
      if (result.signatureRef) doc.signatureRef = result.signatureRef;
      if (result.certificateSubject) doc.signatureCertificateSubject = result.certificateSubject;
    }
    await this.auditService.writeCritical({
      tenantId: doc.tenantId,
      actorId,
      action: 'documents.signed',
      entityType: 'documents.generated',
      entityId: doc.id,
      oldValues: {},
      newValues: {
        signatureStatus: doc.signatureStatus,
        signatureProvider: doc.signatureProvider
      },
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });
  }
```

В `finalizeDocument`, перед `return doc;` (после блока аудита финализации):

```typescript
await this.applySignature(doc, actorId, ctx);
```

- [ ] **Step 3c: Add the public signDocument method**

```typescript
  /** Phase 6 — ручное/повторное подписание уже выпущенного документа (напр. после включения флага). */
  async signDocument(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    ctx: RequestContext
  ): Promise<GeneratedDocumentEntity> {
    const doc = this.getDocument(tenantId, id);
    if (doc.status === 'archived')
      throw new BadRequestException({
        code: 'validation_error',
        message: 'Archived document cannot be signed'
      });
    await this.applySignature(doc, actorId, ctx);
    return doc;
  }
```

> Проверь, что `GeneratedDocumentEntity`, `RequestContext` и `BadRequestException` уже импортированы в файле (они используются в `finalizeDocument`/рядом — да).

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/documents/documents.service.test.ts --no-file-parallelism`
Expected: PASS — новые 4 теста зелёные, существующие не сломаны.

- [ ] **Step 5: Lint + commit**

```bash
npx eslint apps/backend/src/modules/documents/documents.service.ts apps/backend/src/modules/documents/documents.service.test.ts --max-warnings=0
git add apps/backend/src/modules/documents/documents.service.ts apps/backend/src/modules/documents/documents.service.test.ts
git commit -m "feat(backend): sign-on-finalize + manual signDocument via provider seam"
```

---

### Task 5: Wire the provider into DocumentsModule

**Files:**

- Modify: `apps/backend/src/modules/documents/documents.module.ts`

- [ ] **Step 1: Add the factory provider (mirrors files.module.ts AV factory)**

Импорты:

```typescript
import { backendEnv } from '../../env.js';
import {
  DOCUMENT_SIGNATURE_PROVIDER,
  NoopDocumentSignatureProvider
} from '../../infrastructure/document-signature/document-signature.provider.js';
```

> `backendEnv` уже импортируется в модуле — не дублируй импорт.

В массив `providers` добавь:

```typescript
    {
      provide: DOCUMENT_SIGNATURE_PROVIDER,
      useFactory: () => {
        // CryptoPro adapter not implemented yet — when ESIGN_ENABLED && provider==='cryptopro'
        // is requested, fall back to Noop so prod can't silently believe docs are signed.
        // Swap this branch for `new CryptoProSignatureProvider(...)` when the adapter lands.
        if (backendEnv.ESIGN_ENABLED && backendEnv.ESIGN_PROVIDER === 'cryptopro') {
          // eslint-disable-next-line no-console
          console.warn(
            '[esign] ESIGN_PROVIDER=cryptopro requested but adapter not implemented — using Noop'
          );
        }
        return new NoopDocumentSignatureProvider();
      }
    },
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS (8/8 tasks).

- [ ] **Step 3: Lint + commit**

```bash
npx eslint apps/backend/src/modules/documents/documents.module.ts --max-warnings=0
git add apps/backend/src/modules/documents/documents.module.ts
git commit -m "feat(backend): wire DOCUMENT_SIGNATURE_PROVIDER factory (Noop until CryptoPro)"
```

---

### Task 6: `documents.sign` permission migration

**Files:**

- Create: `apps/backend/migrations/0053_iam_documents_sign_permission.sql`
- Test: `apps/backend/src/modules/documents/migrations.0053.test.ts`

- [ ] **Step 1: Write the failing test (mirror migrations.0033.test.ts structure)**

```typescript
// migrations.0053.test.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(process.cwd(), 'migrations', '0053_iam_documents_sign_permission.sql'),
  'utf8'
);

describe('0053 documents.sign permission migration', () => {
  it('seeds the documents.sign permission', () => {
    expect(sql).toMatch(/insert into iam\.permissions/i);
    expect(sql).toContain('documents.sign');
  });
  it('grants it to admin roles and is idempotent', () => {
    expect(sql).toMatch(/insert into iam\.role_permissions/i);
    expect(sql).toMatch(/on conflict/i);
  });
});
```

> NOTE: проверь рабочую директорию vitest для backend. Если `migrations.0033.test.ts` читает путь иначе (напр. от `__dirname` или `apps/backend`), скопируй ровно его способ построения пути, чтобы тест нашёл файл.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/documents/migrations.0053.test.ts --no-file-parallelism`
Expected: FAIL — файла миграции нет.

- [ ] **Step 3: Write the migration**

```sql
-- apps/backend/migrations/0053_iam_documents_sign_permission.sql
-- Phase 6 — право на подписание/повторное подписание выпущенных документов
-- (POST /documents/:id/sign). Выдаётся platform_admin/tenant_admin и methodist.
-- Сама подпись провайдер-агностична (ESIGN_PROVIDER); по умолчанию Noop.

insert into iam.permissions (id, code, description)
values
  ('p_documents_sign', 'documents.sign', 'Sign or re-sign issued documents (НЭП)')
on conflict (id) do nothing;

insert into iam.role_permissions (id, tenant_id, role_id, permission_id)
select
  concat('rp_', r.id, '_', p.id),
  r.tenant_id,
  r.id,
  p.id
from iam.roles r
join iam.permissions p on true
where r.tenant_id = 'tenant_demo'
  and p.code = 'documents.sign'
  and r.code in ('platform_admin', 'tenant_admin', 'methodist')
on conflict (tenant_id, role_id, permission_id) do nothing;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/documents/migrations.0053.test.ts --no-file-parallelism`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/migrations/0053_iam_documents_sign_permission.sql apps/backend/src/modules/documents/migrations.0053.test.ts
git commit -m "feat(backend): seed documents.sign permission (migration 0053)"
```

---

### Task 7: `POST documents/:id/sign` endpoint + permission boundary test

**Files:**

- Modify: `apps/backend/src/modules/documents/documents.controller.ts:266` (после `finalizeDocument` endpoint)
- Test: `apps/backend/src/modules/documents/documents.http.integration.test.ts`

- [ ] **Step 1: Write the failing HTTP integration test**

Открой `documents.http.integration.test.ts`, найди существующий стаб-контроллер (паттерн из CLAUDE.md). Добавь маршрут и assert, ровно повторяя стиль соседних permission-тестов в файле (тот же способ boot минимального Nest-app + проверка 403 без права / 2xx с правом `documents.sign`). Скелет:

```typescript
describe('POST /documents/:id/sign permission boundary', () => {
  it('rejects without documents.sign (403)', async () => {
    // ... boot app с правами без documents.sign, как в соседних тестах ...
    // expect 403
  });
  it('allows with documents.sign', async () => {
    // ... boot app с правом documents.sign ...
    // expect 2xx
  });
});
```

> Скопируй точную обвязку (имена хелперов boot/withPermissions) из ближайшего `*finalize*`/`*archive*` permission-теста в этом же файле — не выдумывай новый каркас.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/documents/documents.http.integration.test.ts -t "sign permission boundary" --no-file-parallelism`
Expected: FAIL — маршрута нет (404) или право не распознано.

- [ ] **Step 3: Add the endpoint (after finalizeDocument, controller line ~266)**

```typescript
  @Post('documents/:id/sign')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.sign')
  signDocument(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.documentsService.signDocument(c.tenantId!, c.userId, id, c);
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/documents/documents.http.integration.test.ts --no-file-parallelism`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
npx eslint apps/backend/src/modules/documents/documents.controller.ts apps/backend/src/modules/documents/documents.http.integration.test.ts --max-warnings=0
git add apps/backend/src/modules/documents/documents.controller.ts apps/backend/src/modules/documents/documents.http.integration.test.ts
git commit -m "feat(backend): POST documents/:id/sign endpoint under documents.sign"
```

---

### Task 8: Frontend — surface signature status (minimal)

**Files:**

- Modify: тип документа во фронт-фиче документов (найди где описан читаемый `GeneratedDocument`, напр. `apps/frontend/src/features/documents/types.ts` — если фичи нет, пропусти UI и оставь только контракт-тест в той фиче, что читает документы).
- Test: соответствующий `*.contract.test.ts` рядом.

> Цель — минимальная: фронт умеет читать новые поля подписи без падения типов и отображает бейдж статуса. Реальный UX-полиш — отдельно.

- [ ] **Step 1: Locate the frontend document type**

Run: `npx --yes rg -n "signatureStatus|GeneratedDocument|qrToken" apps/frontend/src` (или Grep tool)
Expected: найдёшь тип, отражающий документ. Если фронт не типизирует документ отдельно — задача сводится к контракт-тесту (Step 2) на эндпоинт, который теперь возвращает поля подписи; UI-бейдж добавь только если есть экран документа.

- [ ] **Step 2: Add fields to the frontend type + a contract assertion**

В тип документа добавь (соблюдая `exactOptionalPropertyTypes` — все поля опциональны):

```typescript
  signatureStatus?: 'unsigned' | 'signed' | 'failed';
  signedAt?: string;
  signatureCertificateSubject?: string;
```

В контракт-тест (stub `fetch` через `vi.stubGlobal`, как в других `api.contract.test.ts`) добавь кейс: ответ с `signatureStatus: 'signed'` корректно разворачивается из envelope и доходит до вызывающего.

- [ ] **Step 3: Run the frontend test**

Run: `pnpm --filter @cdoprof/frontend exec vitest run <path-to-contract-test> --no-file-parallelism`
Expected: PASS.

- [ ] **Step 4: Lint + commit**

```bash
npx eslint <changed frontend files> --max-warnings=0
git add apps/frontend/src/features/documents/
git commit -m "feat(frontend): surface document signature status from API"
```

---

### Task 9: Full typecheck + docs sync

**Files:**

- Modify: `README.md` §2, `LMS_AGENT_HANDOFF.md` §5.x (следующий номер), `docs/superpowers/plans/PLANS_STATUS.md`, этот план (отметить чекбоксы).

- [ ] **Step 1: Whole-repo typecheck**

Run: `pnpm typecheck`
Expected: PASS (8/8).

- [ ] **Step 2: Run the touched backend clusters together**

Run:

```bash
pnpm --filter @cdoprof/backend exec vitest run src/infrastructure/document-signature src/env.esign.test.ts src/modules/documents --no-file-parallelism
```

Expected: все зелёные.

- [ ] **Step 3: Update README §2 «AI Agent State»**

Обнови Last Completed Task / Current Task / Last Updated At / By на «Phase 6 e-signature provider seam (НЭП, dormant)».

- [ ] **Step 4: Append LMS_AGENT_HANDOFF §5.x**

Новая запись (следующий номер после текущего максимума §5.x): summary (provider seam по AV-паттерну, dormant `ESIGN_ENABLED=false`, КриптоПро — будущий адаптер), список файлов, статус тестов, deviations.

- [ ] **Step 5: Update PLANS_STATUS.md**

Добавь строку про этот план; отметь, что остаток Phase 6 теперь = реальный КриптоПро-адаптер + КЭП-подпись выгрузок + юр-оформление (оферта/Положение об ЭДО).

- [ ] **Step 6: Commit docs**

```bash
git add README.md LMS_AGENT_HANDOFF.md docs/superpowers/plans/
git commit -m "docs(phase-6): e-signature provider seam handoff + state sync"
```

---

## Что СОЗНАТЕЛЬНО не входит в этот план (follow-up Phase 6)

1. **КриптоПро-адаптер** (`CryptoProSignatureProvider`): КриптоПро CSP на сервере + КриптоАРМ ГОСТ SDK (`trusted-pdf`/`trusted-crypto`), реальная PAdES-подпись PDF + хранение detached `.sig`. Подключается заменой ветки фабрики в Task 5 — без изменений в сервисе/контроллере.
2. **КЭП-подпись файлов выгрузки** в ФИС ФРДО / ЕИСОТ / Ростехнадзор / Минздрав-НМО (отдельный поток, отдельная КЭП руководителя). Кандидат — поверх готовых экспортёров реестров.
3. **Юр-оформление** (не код): Положение об ЭДО, условие признания НЭП в оферте, согласие 152-ФЗ, распорядительный акт об ответственном за автоподпись (63-ФЗ ст. 4).
4. **Персистентная esign-машина состояний** (текущий `esign`-модуль in-memory) и сид его `esign.*` прав — отдельная задача, не нужна для seam подписи документа.
5. **Ops**: получить сертификат КЭП юрлица (УЦ ФНС), лицензии КриптоПро, поднять CSP, выставить `ESIGN_ENABLED=true` + `ESIGN_PROVIDER=cryptopro`.

---

## Self-Review

**Spec coverage:** Решение владельца (2026-06-15) = гибрид НЭП+КЭП + provider-agnostic по AV-паттерну. Seam (Tasks 1,4,5), флаг (Task 2), метаданные (Task 3), право+endpoint (Tasks 6,7), фронт-статус (Task 8), docs (Task 9). КЭП-выгрузки и КриптоПро-адаптер явно вынесены в follow-up — это и есть «остаток Phase 6», осознанно за рамками текущего seam.

**Placeholder scan:** Реальный код во всех code-шагах. Места, требующие сверки с фактическим кодом (имя экспорта env-схемы в Task 2, способ построения пути в Task 6, обвязка boot в Task 7, расположение фронт-типа в Task 8), помечены `NOTE`/`>` с инструкцией копировать существующий паттерн, а не выдумывать — это не заглушки, а защита от дрейфа имён.

**Type consistency:** `DocumentSignatureStatus` объявлен в Task 1, реэкспортирован и использован в Task 3; `SignatureResult.certificateSubject` (провайдер) маппится в `doc.signatureCertificateSubject` (сущность) в Task 4 — имена намеренно различаются (provider-DTO vs entity), маппинг явный. `signDocument(tenantId, actorId, id, ctx)` — единая сигнатура в сервисе (Task 4) и контроллере (Task 7). Конструктор: провайдер — 6-й опциональный арг, существующие 3-арг вызовы целы.

```

```
