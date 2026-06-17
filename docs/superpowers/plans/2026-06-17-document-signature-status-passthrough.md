# Document Signature Status Passthrough Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the dormant НЭП document-signature seam (Phase 6, PR #256) visible end-to-end — surface `signatureStatus` to the learner cabinet and public QR-verification page — and close the test-coverage gap in the fail-soft signing path that the Noop default currently short-circuits.

**Architecture:** The signing data already lives on `GeneratedDocumentEntity` (6 fields) and is written by `DocumentsService.applySignature`. Today it is never read by any DTO and the non-Noop branch of `applySignature` is never exercised by tests. This plan (a) threads `signatureStatus` through `LearnerDocumentDto` → frontend badge, (b) threads it through `PublicVerifyResult` → public verify page, (c) covers the signed / failed / retry / guard branches with inline fake providers, and (d) adds a **prod-guarded** `fake` staging provider so the owner can see the full pipeline (signature → audit → badge → verify) without a КриптоПро licence. No real cryptography, no schema migration — all changes are additive and the production default stays Noop (`unsigned`).

**Tech Stack:** NestJS (backend, Vitest), Next.js 15 + `@cdoprof/ui` (frontend, Vitest, no React Testing Library), Zod env schema.

---

## File Structure

- `apps/backend/src/modules/mvp/mvp.service.ts` — add `signatureStatus` to `LearnerDocumentDto` + map it; **export** `mapDocumentToLearnerDto` for unit test.
- `apps/backend/src/modules/mvp/learner-document-dto.test.ts` — **new** focused unit test for the mapper.
- `apps/frontend/src/features/learner-documents/signature-badge.ts` — **new** pure label helper.
- `apps/frontend/src/features/learner-documents/documents-list.tsx` — render the badge column.
- `apps/frontend/src/features/learner-documents/learner-documents.test.ts` — extend with badge-helper assertions.
- `apps/backend/src/modules/documents/documents.service.ts` — add `signatureStatus` + `signatureCertificateSubject` to `PublicVerifyResult` and populate in `verifyDocumentByQrToken`.
- `apps/backend/src/modules/documents/documents.service.test.ts` — extend: verify result carries signature; `applySignature` signed/failed/retry/guard coverage via inline fake providers.
- `apps/backend/src/env.schema.ts` — add `'fake'` to `ESIGN_PROVIDER` enum + a refinement forbidding it in production.
- `apps/backend/src/infrastructure/document-signature/fake-document-signature.provider.ts` — **new** staging provider.
- `apps/backend/src/infrastructure/document-signature/fake-document-signature.provider.test.ts` — **new** test.
- `apps/backend/src/modules/documents/documents.module.ts` — factory branch selecting the fake provider.
- `apps/backend/src/env.esign.test.ts` — extend: fake allowed in dev, rejected in prod.

---

## Task 1: Backend — expose `signatureStatus` in `LearnerDocumentDto`

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.service.ts:178-226`
- Test: `apps/backend/src/modules/mvp/learner-document-dto.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/modules/mvp/learner-document-dto.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { mapDocumentToLearnerDto } from './mvp.service.js';

import type { GeneratedDocumentEntity } from '../documents/documents.types.js';

function makeDoc(overrides: Partial<GeneratedDocumentEntity> = {}): GeneratedDocumentEntity {
  return {
    id: 'doc_1',
    tenantId: 't1',
    documentType: 'certificate',
    name: 'Удостоверение №1',
    status: 'final',
    isFinal: true,
    fileId: '',
    ...overrides
  } as GeneratedDocumentEntity;
}

describe('mapDocumentToLearnerDto — signature passthrough (Phase 6)', () => {
  it('passes signatureStatus through when set on the entity', () => {
    const dto = mapDocumentToLearnerDto(
      makeDoc({ signatureStatus: 'signed' }),
      '/api/v1',
      'enr_1',
      'Охрана труда',
      'course_1'
    );
    expect(dto.signatureStatus).toBe('signed');
  });

  it('leaves signatureStatus undefined for an unsigned document', () => {
    const dto = mapDocumentToLearnerDto(makeDoc(), '/api/v1', 'enr_1', 'Охрана труда');
    expect(dto.signatureStatus).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/learner-document-dto.test.ts --no-file-parallelism`
Expected: FAIL — `mapDocumentToLearnerDto` is not exported (import resolves to `undefined`) / `signatureStatus` not on the DTO.

- [ ] **Step 3: Write minimal implementation**

In `apps/backend/src/modules/mvp/mvp.service.ts`, add the field to the interface (after `replacedByDocumentId?` at line ~197):

```ts
  /** §5.9 — если перевыпущен, ссылка на новый документ. */
  replacedByDocumentId?: string;
  /** Phase 6 — статус НЭП-подписи (seam dormant → обычно undefined). */
  signatureStatus?: 'unsigned' | 'signed' | 'failed';
}
```

Export the mapper (change `function mapDocumentToLearnerDto(` at line ~200 to `export function mapDocumentToLearnerDto(`) and add the field to the returned object (after `replacedByDocumentId: doc.replacedByDocumentId` at line ~224), using conditional spread for `exactOptionalPropertyTypes`:

```ts
    revocationReason: doc.revocationReason,
    replacedByDocumentId: doc.replacedByDocumentId,
    ...(doc.signatureStatus ? { signatureStatus: doc.signatureStatus } : {})
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/learner-document-dto.test.ts --no-file-parallelism`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/mvp/mvp.service.ts apps/backend/src/modules/mvp/learner-document-dto.test.ts
git commit -m "feat(backend): pass signatureStatus through LearnerDocumentDto"
```

---

## Task 2: Frontend — signature badge in the learner documents list

**Files:**

- Create: `apps/frontend/src/features/learner-documents/signature-badge.ts`
- Modify: `apps/frontend/src/features/learner-documents/documents-list.tsx`
- Test: `apps/frontend/src/features/learner-documents/learner-documents.test.ts:9`

- [ ] **Step 1: Write the failing test**

Append to the first `describe` block in `apps/frontend/src/features/learner-documents/learner-documents.test.ts` (add the import at the top of the file: `import { signatureBadgeLabel } from './signature-badge';`):

```ts
describe('signatureBadgeLabel (Phase 6)', () => {
  it('подписанный документ → бейдж "Подписана НЭП"', () => {
    expect(signatureBadgeLabel('signed')).toBe('Подписана НЭП');
  });
  it('ошибка подписи → бейдж "Ошибка подписи"', () => {
    expect(signatureBadgeLabel('failed')).toBe('Ошибка подписи');
  });
  it('неподписанный / отсутствующий статус → нет бейджа', () => {
    expect(signatureBadgeLabel('unsigned')).toBeNull();
    expect(signatureBadgeLabel(undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/features/learner-documents/learner-documents.test.ts --no-file-parallelism`
Expected: FAIL — cannot resolve `./signature-badge`.

- [ ] **Step 3: Write minimal implementation**

Create `apps/frontend/src/features/learner-documents/signature-badge.ts`:

```ts
import type { LearnerDocument } from './types';

/**
 * Phase 6 — человекочитаемый бейдж статуса НЭП-подписи.
 * Возвращает null для unsigned/undefined: пока seam dormant большинство документов
 * не подписаны, и бейдж «не подписана» на каждой строке был бы шумом. Показываем
 * чип только когда подпись действительно проставлена или упала.
 */
export function signatureBadgeLabel(status: LearnerDocument['signatureStatus']): string | null {
  switch (status) {
    case 'signed':
      return 'Подписана НЭП';
    case 'failed':
      return 'Ошибка подписи';
    default:
      return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/features/learner-documents/learner-documents.test.ts --no-file-parallelism`
Expected: PASS.

- [ ] **Step 5: Render the badge in the list**

In `apps/frontend/src/features/learner-documents/documents-list.tsx`, add the import after line 7:

```ts
import type { LearnerDocument } from './types';
import { signatureBadgeLabel } from './signature-badge';
```

Render the badge next to the status chip. Replace the `statusView` assignment inside `rows` (line ~94) with:

```ts
    statusView: (
      <span className="learner-documents-status">
        <StatusChip status={d.status} />
        {signatureBadgeLabel(d.signatureStatus) ? (
          <StatusChip status={signatureBadgeLabel(d.signatureStatus) as string} />
        ) : null}
      </span>
    ),
```

- [ ] **Step 6: Run the full learner-documents test + typecheck**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/features/learner-documents/learner-documents.test.ts --no-file-parallelism`
Expected: PASS.
Run: `npx eslint apps/frontend/src/features/learner-documents/documents-list.tsx apps/frontend/src/features/learner-documents/signature-badge.ts --max-warnings=0`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/learner-documents/signature-badge.ts apps/frontend/src/features/learner-documents/documents-list.tsx apps/frontend/src/features/learner-documents/learner-documents.test.ts
git commit -m "feat(frontend): show НЭП signature badge in learner documents list"
```

---

## Task 3: Backend — surface signature status on the public QR-verify result

**Files:**

- Modify: `apps/backend/src/modules/documents/documents.service.ts:84-100` (type) and `:1394-1414` (`verifyDocumentByQrToken`)
- Test: `apps/backend/src/modules/documents/documents.service.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `describe('DocumentsService', ...)` in `apps/backend/src/modules/documents/documents.service.test.ts`. This test drives a document to `final`, stamps a signed status directly on the stored entity (the signing path itself is covered in Task 4), then verifies the public result reflects it:

```ts
it('public verify surfaces signatureStatus for a signed document', () => {
  const state = new InMemoryDocumentsState();
  const service = new DocumentsService(state, new AuditService(), new RealtimeEventsService());
  const template = service.createTemplate(
    't1',
    'u1',
    { name: 'Tpl', templateType: 'certificate' },
    ctx
  );
  const version = service.createTemplateVersion('t1', 'u1', {
    templateId: template.id,
    fileId: 'file_1'
  });
  service.activateTemplateVersion('t1', 'u1', version.id, ctx);
  const task = service.generateDocument('t1', 'u1', {
    idempotencyKey: 'sig-verify',
    templateId: template.id,
    sourceEntityType: 'group',
    sourceEntityId: 'g1',
    documentType: 'certificate'
  });
  const doc = state.generatedDocuments.find((d) => d.id === task.documentId)!;
  doc.qrToken = 'qrtoken-signed-1234';
  doc.signatureStatus = 'signed';
  doc.signatureCertificateSubject = 'CN=CDOProf, O=CDOProf';

  const result = service.verifyDocumentByQrToken('qrtoken-signed-1234');

  expect(result.status).toBe('valid');
  expect(result.signatureStatus).toBe('signed');
  expect(result.signatureCertificateSubject).toBe('CN=CDOProf, O=CDOProf');
});

it('public verify omits signature fields for an unsigned document', () => {
  const state = new InMemoryDocumentsState();
  const service = new DocumentsService(state, new AuditService(), new RealtimeEventsService());
  const template = service.createTemplate(
    't1',
    'u1',
    { name: 'Tpl', templateType: 'certificate' },
    ctx
  );
  const version = service.createTemplateVersion('t1', 'u1', {
    templateId: template.id,
    fileId: 'file_1'
  });
  service.activateTemplateVersion('t1', 'u1', version.id, ctx);
  const task = service.generateDocument('t1', 'u1', {
    idempotencyKey: 'sig-verify-unsigned',
    templateId: template.id,
    sourceEntityType: 'group',
    sourceEntityId: 'g1',
    documentType: 'certificate'
  });
  const doc = state.generatedDocuments.find((d) => d.id === task.documentId)!;
  doc.qrToken = 'qrtoken-unsigned-1234';

  const result = service.verifyDocumentByQrToken('qrtoken-unsigned-1234');

  expect(result.status).toBe('valid');
  expect(result.signatureStatus).toBeUndefined();
  expect(result.signatureCertificateSubject).toBeUndefined();
});
```

> If `generateDocument` does not set `documentId`/leaves the doc unfindable, fall back to `state.generatedDocuments.push({...} as GeneratedDocumentEntity)` with `qrToken` and `status: 'final'` set directly — assert the same result fields.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/documents/documents.service.test.ts --no-file-parallelism`
Expected: FAIL — `result.signatureStatus` is `undefined` for the signed doc (field not populated yet).

- [ ] **Step 3: Write minimal implementation**

In `apps/backend/src/modules/documents/documents.service.ts`, extend `PublicVerifyResult` (after `revocationReason?: string;` at line ~99):

```ts
  revocationReason?: string;
  /** Phase 6 — НЭП-подпись. Заполняется только для подписанных документов (доверие на странице проверки). */
  signatureStatus?: 'signed';
  signatureCertificateSubject?: string;
}
```

In `verifyDocumentByQrToken` (after the revoked block, before `return result;` at line ~1413):

```ts
if (doc.signatureStatus === 'signed') {
  result.signatureStatus = 'signed';
  if (doc.signatureCertificateSubject)
    result.signatureCertificateSubject = doc.signatureCertificateSubject;
}
return result;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/documents/documents.service.test.ts --no-file-parallelism`
Expected: PASS (existing tests + 2 new).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/documents/documents.service.ts apps/backend/src/modules/documents/documents.service.test.ts
git commit -m "feat(backend): surface НЭП signature status on public QR-verify result"
```

---

## Task 4: Backend — cover the fail-soft `applySignature` path with inline fake providers

**Files:**

- Test: `apps/backend/src/modules/documents/documents.service.test.ts`

> No production code changes here — this task closes the coverage gap where the Noop short-circuit (`documents.service.ts:816`) means the signed / failed / retry / guard branches are never executed. Inline fake providers are passed as the 6th constructor arg.

- [ ] **Step 1: Write the failing tests**

Add a helper + tests to `documents.service.test.ts`. Put the helper near the top of the file (after the `ctx` const):

```ts
import type {
  DocumentSignatureProvider,
  SignatureResult
} from '../../infrastructure/document-signature/document-signature.provider.js';

function fakeSigner(result: SignatureResult, id = 'fake'): DocumentSignatureProvider {
  return { id, sign: async () => result };
}

function throwingSigner(id = 'fake'): DocumentSignatureProvider {
  return {
    id,
    sign: async () => {
      throw new Error('signer offline');
    }
  };
}

function makeSignableDoc(service: DocumentsService, state: InMemoryDocumentsState) {
  const template = service.createTemplate(
    't1',
    'u1',
    { name: 'Tpl', templateType: 'certificate' },
    ctx
  );
  const version = service.createTemplateVersion('t1', 'u1', {
    templateId: template.id,
    fileId: 'file_1'
  });
  service.activateTemplateVersion('t1', 'u1', version.id, ctx);
  const task = service.generateDocument('t1', 'u1', {
    idempotencyKey: `sig-${Math.random()}`,
    templateId: template.id,
    sourceEntityType: 'group',
    sourceEntityId: 'g1',
    documentType: 'certificate'
  });
  return state.generatedDocuments.find((d) => d.id === task.documentId)!;
}
```

> `Math.random()` is fine in the test runner (the no-randomness restriction is about Workflow scripts, not Vitest). If lint flags it, use a module-level counter instead.

Then the tests:

```ts
describe('DocumentsService — applySignature (Phase 6 fail-soft)', () => {
  it('marks the document signed and stamps metadata when the provider succeeds', async () => {
    const state = new InMemoryDocumentsState();
    const provider = fakeSigner({
      status: 'signed',
      signatureRef: 'sig://ref-1',
      certificateSubject: 'CN=CDOProf'
    });
    const service = new DocumentsService(
      state,
      new AuditService(),
      new RealtimeEventsService(),
      undefined,
      undefined,
      provider
    );
    const doc = makeSignableDoc(service, state);

    const finalized = await service.finalizeDocument('t1', 'u1', doc.id, ctx);

    expect(finalized.signatureStatus).toBe('signed');
    expect(finalized.signatureProvider).toBe('fake');
    expect(finalized.signatureRef).toBe('sig://ref-1');
    expect(finalized.signatureCertificateSubject).toBe('CN=CDOProf');
    expect(finalized.signedBy).toBe('u1');
    expect(finalized.signedAt).toBeTruthy();
  });

  it('marks the document failed (not signed) when the provider throws, without rolling back finalization', async () => {
    const state = new InMemoryDocumentsState();
    const service = new DocumentsService(
      state,
      new AuditService(),
      new RealtimeEventsService(),
      undefined,
      undefined,
      throwingSigner()
    );
    const doc = makeSignableDoc(service, state);

    const finalized = await service.finalizeDocument('t1', 'u1', doc.id, ctx);

    expect(finalized.isFinal).toBe(true);
    expect(finalized.status).toBe('final');
    expect(finalized.signatureStatus).toBe('failed');
    expect(finalized.signedAt).toBeUndefined();
  });

  it('signDocument retries a previously failed signature to signed', async () => {
    const state = new InMemoryDocumentsState();
    let online = false;
    const flakyProvider: DocumentSignatureProvider = {
      id: 'fake',
      sign: async () =>
        online
          ? { status: 'signed', signatureRef: 'sig://retry' }
          : { status: 'failed', detail: 'offline' }
    };
    const service = new DocumentsService(
      state,
      new AuditService(),
      new RealtimeEventsService(),
      undefined,
      undefined,
      flakyProvider
    );
    const doc = makeSignableDoc(service, state);
    await service.finalizeDocument('t1', 'u1', doc.id, ctx);
    expect(state.generatedDocuments.find((d) => d.id === doc.id)!.signatureStatus).toBe('failed');

    online = true;
    const signed = await service.signDocument('t1', 'u1', doc.id, ctx);

    expect(signed.signatureStatus).toBe('signed');
    expect(signed.signatureRef).toBe('sig://retry');
  });

  it('signDocument rejects a non-final document', async () => {
    const state = new InMemoryDocumentsState();
    const service = new DocumentsService(
      state,
      new AuditService(),
      new RealtimeEventsService(),
      undefined,
      undefined,
      fakeSigner({ status: 'signed' })
    );
    const doc = makeSignableDoc(service, state);
    doc.isFinal = false;

    await expect(service.signDocument('t1', 'u1', doc.id, ctx)).rejects.toThrow(/finalized/i);
  });

  it('signDocument rejects a revoked document', async () => {
    const state = new InMemoryDocumentsState();
    const service = new DocumentsService(
      state,
      new AuditService(),
      new RealtimeEventsService(),
      undefined,
      undefined,
      fakeSigner({ status: 'signed' })
    );
    const doc = makeSignableDoc(service, state);
    doc.status = 'revoked';

    await expect(service.signDocument('t1', 'u1', doc.id, ctx)).rejects.toThrow(/revoked/i);
  });
});
```

- [ ] **Step 2: Run tests to verify expectations**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/documents/documents.service.test.ts --no-file-parallelism`
Expected: All PASS. These assert existing behaviour (`applySignature`, `signDocument` guards) that was previously untested — they should pass against the current implementation. If any fail, that reveals a real bug in the signing path; fix the implementation (not the test) per systematic-debugging.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/modules/documents/documents.service.test.ts
git commit -m "test(backend): cover fail-soft applySignature signed/failed/retry/guard paths"
```

---

## Task 5: Backend — prod-guarded `fake` staging signature provider

**Files:**

- Create: `apps/backend/src/infrastructure/document-signature/fake-document-signature.provider.ts`
- Create: `apps/backend/src/infrastructure/document-signature/fake-document-signature.provider.test.ts`
- Modify: `apps/backend/src/env.schema.ts:52` + refinement block (near `:200`)
- Modify: `apps/backend/src/modules/documents/documents.module.ts:44-59`
- Test: `apps/backend/src/env.esign.test.ts`

> Purpose: let the owner exercise the whole pipeline (signature → audit → badge → public verify) in dev/staging without КриптоПро. The provider returns `signed` with a synthetic ref, so it is **forbidden in production** by an env refinement — prod must never believe a doc is cryptographically signed when it isn't.

- [ ] **Step 1: Write the failing provider test**

Create `apps/backend/src/infrastructure/document-signature/fake-document-signature.provider.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { FakeDocumentSignatureProvider } from './fake-document-signature.provider.js';

describe('FakeDocumentSignatureProvider', () => {
  it('returns a synthetic signed result referencing the document', async () => {
    const provider = new FakeDocumentSignatureProvider('Тестовый УЦ');
    const result = await provider.sign({ tenantId: 't1', documentId: 'doc_9', fileId: 'file_9' });

    expect(provider.id).toBe('fake');
    expect(result.status).toBe('signed');
    expect(result.signatureRef).toContain('doc_9');
    expect(result.certificateSubject).toContain('Тестовый УЦ');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/infrastructure/document-signature/fake-document-signature.provider.test.ts --no-file-parallelism`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the provider**

Create `apps/backend/src/infrastructure/document-signature/fake-document-signature.provider.ts`:

```ts
import type {
  DocumentSignatureProvider,
  SignDocumentParams,
  SignatureResult
} from './document-signature.provider.js';

/**
 * Phase 6 — STAGING-ONLY signer. Returns a synthetic `signed` result WITHOUT any real
 * cryptography so dev/staging can exercise the full pipeline (signature → audit → badge →
 * public verify). FORBIDDEN in production by an env refinement (see env.schema.ts): prod
 * must never believe a document is signed when it isn't. The real КриптоПро adapter replaces
 * this behind the same DOCUMENT_SIGNATURE_PROVIDER token.
 */
export class FakeDocumentSignatureProvider implements DocumentSignatureProvider {
  readonly id = 'fake';

  constructor(private readonly signerName: string) {}

  async sign(params: SignDocumentParams): Promise<SignatureResult> {
    return {
      status: 'signed',
      signatureRef: `fake-sig://${params.documentId}`,
      certificateSubject: `CN=${this.signerName} (STAGING, не криптоподпись)`
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/infrastructure/document-signature/fake-document-signature.provider.test.ts --no-file-parallelism`
Expected: PASS.

- [ ] **Step 5: Write the failing env test**

In `apps/backend/src/env.esign.test.ts`, add (match the existing parse-helper convention in that file — it likely calls the schema's `parse`/`safeParse` with a base env object; mirror whatever helper is already there):

```ts
it('allows ESIGN_PROVIDER=fake in development', () => {
  const env = parseEnv({ NODE_ENV: 'development', ESIGN_ENABLED: 'true', ESIGN_PROVIDER: 'fake' });
  expect(env.ESIGN_PROVIDER).toBe('fake');
});

it('rejects ESIGN_PROVIDER=fake in production', () => {
  expect(() =>
    parseEnv({
      NODE_ENV: 'production',
      DEPLOYMENT_PROFILE: 'prod',
      ESIGN_ENABLED: 'true',
      ESIGN_PROVIDER: 'fake'
    })
  ).toThrow(/fake.*production|production.*fake/i);
});
```

> Use the file's existing parse helper and base-env fixture (the prod case needs all other prod-required fields the schema enforces — copy them from the nearest existing prod-rejection test in the same file). The assertion only cares that a `fake`-in-prod error is raised.

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/env.esign.test.ts --no-file-parallelism`
Expected: FAIL — `fake` is not a valid enum value yet (`ESIGN_PROVIDER` rejects it even in dev).

- [ ] **Step 7: Extend the env schema**

In `apps/backend/src/env.schema.ts` change line ~52:

```ts
    ESIGN_PROVIDER: z.enum(['noop', 'cryptopro', 'fake']).default('noop'),
```

Add a refinement in the same `.superRefine`/refinement block that holds the other prod guards (near line ~200, alongside the `production/staging/prod-profile` checks):

```ts
if (env.ESIGN_PROVIDER === 'fake' && env.NODE_ENV === 'production') {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ['ESIGN_PROVIDER'],
    message: 'ESIGN_PROVIDER=fake is forbidden in production — it fakes signatures (use cryptopro)'
  });
}
```

> Match the exact `ctx`/issue idiom already used in that block (the file uses `ctx.addIssue` with `z.ZodIssueCode.custom` — confirm and mirror it).

- [ ] **Step 8: Run env tests to verify they pass**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/env.esign.test.ts --no-file-parallelism`
Expected: PASS.

- [ ] **Step 9: Wire the factory**

In `apps/backend/src/modules/documents/documents.module.ts`, update the import (line ~12-15) and the factory (line ~44-59):

```ts
import {
  DOCUMENT_SIGNATURE_PROVIDER,
  NoopDocumentSignatureProvider
} from '../../infrastructure/document-signature/document-signature.provider.js';
import { FakeDocumentSignatureProvider } from '../../infrastructure/document-signature/fake-document-signature.provider.js';
```

```ts
    {
      provide: DOCUMENT_SIGNATURE_PROVIDER,
      useFactory: () => {
        // STAGING: synthetic signer for end-to-end QA (env refinement forbids it in prod).
        if (backendEnv.ESIGN_ENABLED && backendEnv.ESIGN_PROVIDER === 'fake') {
          return new FakeDocumentSignatureProvider(backendEnv.ESIGN_SIGNER_NAME);
        }
        // CryptoPro adapter not implemented yet — fall back to Noop so prod can't silently
        // believe docs are signed. Swap this branch for `new CryptoProSignatureProvider(...)`.
        if (backendEnv.ESIGN_ENABLED && backendEnv.ESIGN_PROVIDER === 'cryptopro') {
          console.warn(
            '[esign] ESIGN_PROVIDER=cryptopro requested but adapter not implemented — using Noop'
          );
        }
        return new NoopDocumentSignatureProvider();
      }
    }
```

- [ ] **Step 10: Lint + typecheck the touched backend files**

Run: `npx eslint apps/backend/src/infrastructure/document-signature/fake-document-signature.provider.ts apps/backend/src/modules/documents/documents.module.ts apps/backend/src/env.schema.ts --max-warnings=0`
Expected: clean.
Run: `pnpm --filter @cdoprof/backend exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 11: Commit**

```bash
git add apps/backend/src/infrastructure/document-signature/fake-document-signature.provider.ts apps/backend/src/infrastructure/document-signature/fake-document-signature.provider.test.ts apps/backend/src/env.schema.ts apps/backend/src/env.esign.test.ts apps/backend/src/modules/documents/documents.module.ts
git commit -m "feat(backend): prod-guarded fake staging signature provider"
```

---

## Final verification

- [ ] **Backend — run the touched suites together**

Run:

```bash
pnpm --filter @cdoprof/backend exec vitest run src/modules/documents/documents.service.test.ts src/modules/mvp/learner-document-dto.test.ts src/infrastructure/document-signature --no-file-parallelism
pnpm --filter @cdoprof/backend exec vitest run src/env.esign.test.ts --no-file-parallelism
```

Expected: all PASS.

- [ ] **Frontend — run the learner-documents suite**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/features/learner-documents --no-file-parallelism`
Expected: all PASS.

- [ ] **Monorepo typecheck**

Run: `pnpm typecheck`
Expected: 8/8 tasks pass.

- [ ] **Docs handoff** (per CLAUDE.md «After every engineering session»): update README §2 «AI Agent State», append `### 5.13x` to LMS_AGENT_HANDOFF.md §5 (summary, files, test status, deviations), cross-link this plan, and update memory `project_esign_phase6.md` to mark the passthrough + staging provider done and shrink the remaining follow-up to (КриптоПро adapter, КЭП export signing, ops/legal).

---

## Deviations

_(Record any deviations from this plan here during execution.)_
