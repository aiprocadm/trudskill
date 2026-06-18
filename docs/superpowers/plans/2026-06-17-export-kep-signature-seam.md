# КЭП Export-Signature Seam Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a provider-agnostic, dormant seam that attaches a detached КЭП signature (`.p7s`) to each of the 5 registry export files (ФРДО/ОТ/ЕИСОТ/Ростехнадзор/НМО), mirroring the НЭП document-signature seam.

**Architecture:** A new `infrastructure/export-signature/` seam (`ExportSignatureProvider` interface + `Noop`/`Fake` impls + DI token) and a shared `signExportArtifact` orchestrator that, when the provider is active, signs the XLSX buffer and stores the `.p7s` as a sibling file. Each of the 5 request-scoped registry services injects the provider as an optional last constructor arg and calls the helper right after `batch.fileId = meta.id`, stamping 3 new optional fields on the batch entity. Everything ships dormant (default `Noop`, `EXPORT_SIGN_ENABLED=false`); the `fake` staging provider is forbidden in production by an env refinement. No migration (MVP JSON snapshots), no new permission (reuse `regulatory.export.read/write`).

**Tech Stack:** NestJS (backend, Vitest), Zod env schema, Next.js frontend (gov-export page).

---

## File Structure

- `apps/backend/src/infrastructure/export-signature/export-signature.provider.ts` — **new** interface + token + `NoopExportSignatureProvider`.
- `apps/backend/src/infrastructure/export-signature/fake-export-signature.provider.ts` — **new** staging signer.
- `apps/backend/src/infrastructure/export-signature/sign-export-artifact.ts` — **new** shared orchestrator (the only place that registers+stores the `.p7s`).
- `apps/backend/src/env.schema.ts` — `EXPORT_SIGN_ENABLED`/`EXPORT_SIGN_PROVIDER`/`EXPORT_SIGN_SIGNER_NAME` + prod-guard refinement.
- `apps/backend/src/modules/mvp/mvp.types.ts` — 3 signature fields on each of the 5 `*Batch` interfaces + the 5 `*ExportOutcome` interfaces.
- `apps/backend/src/modules/mvp/mvp.module.ts` — provide `EXPORT_SIGNATURE_PROVIDER` via factory.
- `apps/backend/src/modules/mvp/{frdo,ot,eisot-testing,rostechnadzor,nmo}-registry/*.service.ts` — inject provider + call helper + stamp batch + `getBatchSignatureUrl`.
- `apps/backend/src/modules/mvp/{...}-registry/*.controller.ts` — `GET …/exports/:id/signature` endpoint.
- `apps/frontend/src/features/gov-export/` — export-signature badge.

Tests live next to each unit (`*.test.ts`).

**Cyrillic-path note (applies to EVERY test run in this plan):** the repo path contains Cyrillic, which crashes the full backend suite. ALWAYS run single files with `--no-file-parallelism`. Never run `pnpm test:backend`. Never use `--no-verify`.

---

## Task 1: Export-signature seam interface + Noop provider

**Files:**

- Create: `apps/backend/src/infrastructure/export-signature/export-signature.provider.ts`
- Test: `apps/backend/src/infrastructure/export-signature/noop-export-signature.provider.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/infrastructure/export-signature/noop-export-signature.provider.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { NoopExportSignatureProvider } from './export-signature.provider.js';

describe('NoopExportSignatureProvider', () => {
  it('returns unsigned and never produces signature content', async () => {
    const provider = new NoopExportSignatureProvider();
    const result = await provider.sign({
      tenantId: 't1',
      fileId: 'file_1',
      content: Buffer.from('xlsx-bytes')
    });
    expect(provider.id).toBe('noop');
    expect(result.status).toBe('unsigned');
    expect(result.signatureContent).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/infrastructure/export-signature/noop-export-signature.provider.test.ts --no-file-parallelism`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the implementation**

Create `apps/backend/src/infrastructure/export-signature/export-signature.provider.ts`:

```ts
/**
 * Provider-agnostic seam for КЭП detached signing of registry export files,
 * mirroring DocumentSignatureProvider (НЭП). Noop is the safe default for dev/test and any
 * env with EXPORT_SIGN_ENABLED=false: export files stay unsigned and the existing
 * generate→store→download flow is unchanged. A КриптоПро (CSP + SDK) adapter plugs in later
 * behind the same token. Unlike the document seam (embedded PDF stamp), this produces a
 * DETACHED .p7s over the raw file bytes — the КЭП standard for госреестр uploads.
 */
export type ExportSignatureStatus = 'unsigned' | 'signed' | 'failed';

export interface SignExportParams {
  tenantId: string;
  /** files-meta id of the exported XLSX (for traceability/audit). */
  fileId: string;
  /** Raw bytes of the file to sign (detached signature is computed over these). */
  content: Buffer;
}

export interface ExportSignatureResult {
  status: ExportSignatureStatus;
  /** Detached signature (CMS/PKCS#7, .p7s) bytes — caller stores it as a sibling file. Set when signed. */
  signatureContent?: Buffer;
  /** Certificate subject / thumbprint for display + audit. Set when signed. */
  certificateSubject?: string;
  /** Error text when status==='failed'. */
  detail?: string;
}

export interface ExportSignatureProvider {
  /** Stable provider id ('noop' | 'fake' | 'cryptopro'). */
  readonly id: string;
  sign(params: SignExportParams): Promise<ExportSignatureResult>;
}

/** DI token for the active export signer. Mirrors DOCUMENT_SIGNATURE_PROVIDER. */
export const EXPORT_SIGNATURE_PROVIDER = Symbol('EXPORT_SIGNATURE_PROVIDER');

export class NoopExportSignatureProvider implements ExportSignatureProvider {
  readonly id = 'noop';
  async sign(_params: SignExportParams): Promise<ExportSignatureResult> {
    return { status: 'unsigned' };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/infrastructure/export-signature/noop-export-signature.provider.test.ts --no-file-parallelism`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

Run: `npx eslint apps/backend/src/infrastructure/export-signature/export-signature.provider.ts apps/backend/src/infrastructure/export-signature/noop-export-signature.provider.test.ts --max-warnings=0`
Expected: clean.

```bash
git add apps/backend/src/infrastructure/export-signature/export-signature.provider.ts apps/backend/src/infrastructure/export-signature/noop-export-signature.provider.test.ts
git commit -m "feat(backend): export-signature seam interface + Noop provider"
```

End commit body with:
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

---

## Task 2: Fake (staging) export-signature provider

**Files:**

- Create: `apps/backend/src/infrastructure/export-signature/fake-export-signature.provider.ts`
- Test: `apps/backend/src/infrastructure/export-signature/fake-export-signature.provider.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/infrastructure/export-signature/fake-export-signature.provider.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { FakeExportSignatureProvider } from './fake-export-signature.provider.js';

describe('FakeExportSignatureProvider', () => {
  it('returns a synthetic detached signed result referencing the file', async () => {
    const provider = new FakeExportSignatureProvider('Тестовый УЦ');
    const result = await provider.sign({
      tenantId: 't1',
      fileId: 'file_9',
      content: Buffer.from('xlsx-bytes')
    });

    expect(provider.id).toBe('fake');
    expect(result.status).toBe('signed');
    expect(result.signatureContent).toBeInstanceOf(Buffer);
    expect(result.signatureContent!.length).toBeGreaterThan(0);
    expect(result.signatureContent!.toString()).toContain('file_9');
    expect(result.signatureContent!.toString()).toContain('STAGING');
    expect(result.certificateSubject).toContain('Тестовый УЦ');
    expect(result.certificateSubject).toContain('STAGING');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/infrastructure/export-signature/fake-export-signature.provider.test.ts --no-file-parallelism`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the implementation**

Create `apps/backend/src/infrastructure/export-signature/fake-export-signature.provider.ts`:

```ts
import type {
  ExportSignatureProvider,
  ExportSignatureResult,
  SignExportParams
} from './export-signature.provider.js';

/**
 * STAGING-ONLY export signer. Returns a synthetic detached signature WITHOUT any real
 * cryptography so dev/staging can exercise the full pipeline (sign → store → download →
 * badge). FORBIDDEN in production by an env refinement (see env.schema.ts): prod must never
 * believe an export is signed when it isn't. The real КриптоПро adapter replaces this behind
 * the same EXPORT_SIGNATURE_PROVIDER token.
 */
export class FakeExportSignatureProvider implements ExportSignatureProvider {
  readonly id = 'fake';

  constructor(private readonly signerName: string) {}

  async sign(params: SignExportParams): Promise<ExportSignatureResult> {
    return {
      status: 'signed',
      signatureContent: Buffer.from(`FAKE-P7S STAGING — не криптоподпись over ${params.fileId}`),
      certificateSubject: `CN=${this.signerName} (STAGING, не криптоподпись)`
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/infrastructure/export-signature/fake-export-signature.provider.test.ts --no-file-parallelism`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

Run: `npx eslint apps/backend/src/infrastructure/export-signature/fake-export-signature.provider.ts apps/backend/src/infrastructure/export-signature/fake-export-signature.provider.test.ts --max-warnings=0`
Expected: clean.

```bash
git add apps/backend/src/infrastructure/export-signature/fake-export-signature.provider.ts apps/backend/src/infrastructure/export-signature/fake-export-signature.provider.test.ts
git commit -m "feat(backend): fake (staging) export-signature provider"
```

End commit body with:
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

---

## Task 3: Env flags + prod-guard refinement

**Files:**

- Modify: `apps/backend/src/env.schema.ts` (ESIGN block ~line 47-54; the superRefine prod-guard block ~line 200-325)
- Test: `apps/backend/src/env.export-sign.test.ts` (create)

- [ ] **Step 1: Read the existing patterns first**

Read `apps/backend/src/env.schema.ts`: the `ESIGN_ENABLED` custom boolean parse (~line 47-50), `ESIGN_PROVIDER` enum (~line 52), `ESIGN_SIGNER_NAME` (~line 54), and the `ESIGN_PROVIDER==='fake' && NODE_ENV==='production'` refinement (added in §5.131). Also read `apps/backend/src/env.esign.test.ts` to mirror its `prodBase` fixture + `safeParse` helper convention.

- [ ] **Step 2: Write the failing test**

Create `apps/backend/src/env.export-sign.test.ts`. Mirror the helper/fixtures from `env.esign.test.ts` (import the schema the same way; build a dev `base` and a full `prodBase` with all strict-profile-required fields — copy them from `env.esign.test.ts`):

```ts
import { describe, expect, it } from 'vitest';

// Mirror the import + parse helper used by env.esign.test.ts (same schema entrypoint).
// Copy `base` (dev) and `prodBase` (full prod env) fixtures from env.esign.test.ts.

describe('EXPORT_SIGN_* env', () => {
  it('defaults to noop + disabled', () => {
    const env = parseEnv({ ...base });
    expect(env.EXPORT_SIGN_ENABLED).toBe(false);
    expect(env.EXPORT_SIGN_PROVIDER).toBe('noop');
  });

  it('allows EXPORT_SIGN_PROVIDER=fake in development', () => {
    const env = parseEnv({ ...base, EXPORT_SIGN_ENABLED: 'true', EXPORT_SIGN_PROVIDER: 'fake' });
    expect(env.EXPORT_SIGN_PROVIDER).toBe('fake');
  });

  it('allows EXPORT_SIGN_PROVIDER=fake in staging', () => {
    const parsed = safeParseEnv({
      ...prodBase,
      NODE_ENV: 'staging',
      DEPLOYMENT_PROFILE: 'staging',
      EXPORT_SIGN_ENABLED: 'true',
      EXPORT_SIGN_PROVIDER: 'fake'
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.EXPORT_SIGN_PROVIDER).toBe('fake');
  });

  it('rejects EXPORT_SIGN_PROVIDER=fake in production', () => {
    const parsed = safeParseEnv({
      ...prodBase,
      EXPORT_SIGN_ENABLED: 'true',
      EXPORT_SIGN_PROVIDER: 'fake'
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success)
      expect(JSON.stringify(parsed.error.issues)).toMatch(/fake.*production|production.*fake/i);
  });
});
```

Adapt `parseEnv`/`safeParseEnv`/`base`/`prodBase` to the real helper names in `env.esign.test.ts`.

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/env.export-sign.test.ts --no-file-parallelism`
Expected: FAIL — `EXPORT_SIGN_*` keys don't exist yet.

- [ ] **Step 4: Add the env fields**

In `apps/backend/src/env.schema.ts`, directly after the `ESIGN_SIGNER_NAME` line, add (mirror the `ESIGN_ENABLED` boolean parse exactly):

```ts
    EXPORT_SIGN_ENABLED: z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .transform((v) => v === true || v === 'true')
      .default(false),
    /** Active export-signing provider. 'noop' until a КриптоПро adapter is wired. */
    EXPORT_SIGN_PROVIDER: z.enum(['noop', 'cryptopro', 'fake']).default('noop'),
    /** Human-readable signer (organisation) name stamped onto the export signature for display. */
    EXPORT_SIGN_SIGNER_NAME: z.string().min(1).default('CDOProf'),
```

- [ ] **Step 5: Add the prod-guard refinement**

In the same superRefine block that holds the `ESIGN_PROVIDER==='fake'` guard, add directly after it (match the exact `ctx.addIssue`/`z.ZodIssueCode.custom` idiom):

```ts
// EXPORT_SIGN_PROVIDER=fake is a STAGING preview signer (self-marked non-cryptographic).
// Deliberately blocked ONLY in production, NOT staging: staging is where the owner previews
// the export-signing pipeline. Real prod is always NODE_ENV=production (enforced by the
// DEPLOYMENT_PROFILE=prod ⟺ NODE_ENV=production parity checks above), so this cannot be dodged.
if (env.EXPORT_SIGN_PROVIDER === 'fake' && env.NODE_ENV === 'production') {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path: ['EXPORT_SIGN_PROVIDER'],
    message:
      'EXPORT_SIGN_PROVIDER=fake is forbidden in production — it fakes signatures (use cryptopro)'
  });
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/env.export-sign.test.ts --no-file-parallelism`
Expected: all PASS.

- [ ] **Step 7: Lint + commit**

Run: `npx eslint apps/backend/src/env.schema.ts apps/backend/src/env.export-sign.test.ts --max-warnings=0`
Expected: clean.

```bash
git add apps/backend/src/env.schema.ts apps/backend/src/env.export-sign.test.ts
git commit -m "feat(backend): EXPORT_SIGN_* env flags + prod-guard for fake"
```

End commit body with:
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

---

## Task 4: `signExportArtifact` shared orchestrator

**Files:**

- Create: `apps/backend/src/infrastructure/export-signature/sign-export-artifact.ts`
- Test: `apps/backend/src/infrastructure/export-signature/sign-export-artifact.test.ts`

This is the single place that stores the `.p7s`. It is fail-soft: any provider/storage error → `signatureStatus:'failed'` (never throws, so the already-stored XLSX export is never rolled back).

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/infrastructure/export-signature/sign-export-artifact.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import { FakeExportSignatureProvider } from './fake-export-signature.provider.js';
import { NoopExportSignatureProvider } from './export-signature.provider.js';
import { signExportArtifact } from './sign-export-artifact.js';

import type { ExportSignatureProvider } from './export-signature.provider.js';

function makeDeps(provider: ExportSignatureProvider | undefined) {
  const files = { register: vi.fn(async () => ({ id: 'sigfile_1' })) };
  const storage = { putObject: vi.fn(async () => undefined) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return {
    provider,
    files: files as any,
    storage: storage as any,
    _files: files,
    _storage: storage
  };
}

const input = {
  tenantId: 't1',
  fileId: 'xlsxfile_1',
  storageKey: 't1/frdo-registry/frb_1.xlsx',
  buffer: Buffer.from('xlsx-bytes')
};

describe('signExportArtifact', () => {
  it('returns unsigned and stores nothing when provider is absent', async () => {
    const deps = makeDeps(undefined);
    const out = await signExportArtifact(deps, input);
    expect(out.signatureStatus).toBe('unsigned');
    expect(deps._files.register).not.toHaveBeenCalled();
    expect(deps._storage.putObject).not.toHaveBeenCalled();
  });

  it('returns unsigned for the Noop provider', async () => {
    const deps = makeDeps(new NoopExportSignatureProvider());
    const out = await signExportArtifact(deps, input);
    expect(out.signatureStatus).toBe('unsigned');
    expect(deps._storage.putObject).not.toHaveBeenCalled();
  });

  it('signs, registers + stores the .p7s sibling, returns the signature file id', async () => {
    const deps = makeDeps(new FakeExportSignatureProvider('УЦ'));
    const out = await signExportArtifact(deps, input);
    expect(out.signatureStatus).toBe('signed');
    expect(out.signatureFileId).toBe('sigfile_1');
    expect(out.signatureCertificateSubject).toContain('УЦ');
    expect(deps._storage.putObject).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 't1/frdo-registry/frb_1.xlsx.p7s',
        contentType: 'application/pkcs7-signature'
      })
    );
  });

  it('returns failed (not signed) when the provider throws, without throwing', async () => {
    const throwing: ExportSignatureProvider = {
      id: 'fake',
      sign: async () => {
        throw new Error('signer offline');
      }
    };
    const deps = makeDeps(throwing);
    const out = await signExportArtifact(deps, input);
    expect(out.signatureStatus).toBe('failed');
    expect(out.signatureFileId).toBeUndefined();
  });

  it('returns failed when storage.putObject throws, without throwing', async () => {
    const deps = makeDeps(new FakeExportSignatureProvider('УЦ'));
    deps._storage.putObject.mockRejectedValueOnce(new Error('s3 down'));
    const out = await signExportArtifact(deps, input);
    expect(out.signatureStatus).toBe('failed');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/infrastructure/export-signature/sign-export-artifact.test.ts --no-file-parallelism`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Write the implementation**

Create `apps/backend/src/infrastructure/export-signature/sign-export-artifact.ts`:

```ts
import type {
  ExportSignatureProvider,
  ExportSignatureStatus
} from './export-signature.provider.js';
import type { FilesService } from '../../modules/files/files.service.js';
import type { S3StorageClient } from '../storage/s3-storage.client.js';

export interface SignExportArtifactDeps {
  provider: ExportSignatureProvider | undefined;
  files: FilesService;
  storage: S3StorageClient;
}

export interface SignExportArtifactInput {
  tenantId: string;
  /** files-meta id of the exported XLSX. */
  fileId: string;
  /** storage key of the XLSX; the .p7s is stored at `${storageKey}.p7s`. */
  storageKey: string;
  /** bytes of the XLSX. */
  buffer: Buffer;
}

export interface SignExportArtifactOutput {
  signatureStatus: ExportSignatureStatus;
  signatureFileId?: string;
  signatureCertificateSubject?: string;
}

const P7S_CONTENT_TYPE = 'application/pkcs7-signature';

/**
 * Signs an export artifact with the active provider and stores the detached .p7s as a sibling
 * file. Provider absent / Noop → export stays `unsigned`. Fail-soft: a provider or storage error
 * never throws (the XLSX export is already persisted and must not be rolled back) — it returns
 * `signatureStatus: 'failed'`. Mirrors the fail-soft document `applySignature` + AV gate.
 */
export async function signExportArtifact(
  deps: SignExportArtifactDeps,
  input: SignExportArtifactInput
): Promise<SignExportArtifactOutput> {
  const { provider, files, storage } = deps;
  if (!provider || provider.id === 'noop') {
    return { signatureStatus: 'unsigned' };
  }
  try {
    const result = await provider.sign({
      tenantId: input.tenantId,
      fileId: input.fileId,
      content: input.buffer
    });
    if (result.status !== 'signed' || !result.signatureContent) {
      return { signatureStatus: result.status === 'unsigned' ? 'unsigned' : 'failed' };
    }
    const sigKey = `${input.storageKey}.p7s`;
    const meta = await files.register({
      tenantId: input.tenantId,
      storageKey: sigKey,
      originalName: `${input.storageKey.split('/').pop() ?? 'export'}.p7s`,
      mimeType: P7S_CONTENT_TYPE,
      sizeBytes: result.signatureContent.length,
      antivirusStatus: 'clean'
    });
    await storage.putObject({
      key: sigKey,
      body: result.signatureContent,
      contentType: P7S_CONTENT_TYPE
    });
    const out: SignExportArtifactOutput = {
      signatureStatus: 'signed',
      signatureFileId: meta.id
    };
    if (result.certificateSubject) out.signatureCertificateSubject = result.certificateSubject;
    return out;
  } catch {
    return { signatureStatus: 'failed' };
  }
}
```

Note: verify `FilesService.register` accepts exactly `{ tenantId, storageKey, originalName, mimeType, sizeBytes, antivirusStatus }` and returns `{ id }` (it does — see `frdo-registry.service.ts:163`). If its signature differs, adapt the call to the real one, keeping the behavior identical.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/infrastructure/export-signature/sign-export-artifact.test.ts --no-file-parallelism`
Expected: all PASS.

- [ ] **Step 5: Lint + commit**

Run: `npx eslint apps/backend/src/infrastructure/export-signature/sign-export-artifact.ts apps/backend/src/infrastructure/export-signature/sign-export-artifact.test.ts --max-warnings=0`
Expected: clean.

```bash
git add apps/backend/src/infrastructure/export-signature/sign-export-artifact.ts apps/backend/src/infrastructure/export-signature/sign-export-artifact.test.ts
git commit -m "feat(backend): signExportArtifact shared orchestrator (fail-soft detached sign)"
```

End commit body with:
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

---

## Task 5: Signature fields on the 5 batch + outcome types

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.types.ts` (the 5 `*Batch` interfaces + 5 `*ExportOutcome` interfaces)
- Test: `apps/backend/src/modules/mvp/export-signature-batch-fields.test.ts` (create — a compile-level shape assertion)

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/modules/mvp/export-signature-batch-fields.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type {
  EisotTestingBatch,
  FrdoRegistryBatch,
  NmoBatch,
  OtRegistryBatch,
  RostechnadzorBatch
} from './mvp.types.js';

describe('export-signature batch fields (Phase 6 КЭП)', () => {
  it('every registry batch carries optional signature fields', () => {
    const base = {
      signatureStatus: 'signed' as const,
      signatureFileId: 'sigfile_1',
      signatureCertificateSubject: 'CN=УЦ'
    };
    // Type-level: these object literals must be assignable to each batch's signature subset.
    const ot: Pick<
      OtRegistryBatch,
      'signatureStatus' | 'signatureFileId' | 'signatureCertificateSubject'
    > = base;
    const frdo: Pick<
      FrdoRegistryBatch,
      'signatureStatus' | 'signatureFileId' | 'signatureCertificateSubject'
    > = base;
    const eisot: Pick<
      EisotTestingBatch,
      'signatureStatus' | 'signatureFileId' | 'signatureCertificateSubject'
    > = base;
    const rtn: Pick<
      RostechnadzorBatch,
      'signatureStatus' | 'signatureFileId' | 'signatureCertificateSubject'
    > = base;
    const nmo: Pick<
      NmoBatch,
      'signatureStatus' | 'signatureFileId' | 'signatureCertificateSubject'
    > = base;
    expect([ot, frdo, eisot, rtn, nmo].every((b) => b.signatureStatus === 'signed')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/export-signature-batch-fields.test.ts --no-file-parallelism`
Expected: FAIL (type error / tsc) — the fields don't exist on the batch types yet.

- [ ] **Step 3: Add the fields**

In `apps/backend/src/modules/mvp/mvp.types.ts`, add the import of the status type near the top (find where other infrastructure types are imported; if none, add):

```ts
import type { ExportSignatureStatus } from '../../infrastructure/export-signature/export-signature.provider.js';
```

Then add these 3 fields to EACH of the 5 batch interfaces — `OtRegistryBatch` (~782), `FrdoRegistryBatch` (~868), `EisotTestingBatch` (~926), `RostechnadzorBatch` (~986), `NmoBatch` (~1045) — directly after their `fileId?: string;` line:

```ts
  /** Phase 6 КЭП — detached export signature (seam dormant → usually undefined). */
  signatureStatus?: ExportSignatureStatus;
  signatureFileId?: string;
  signatureCertificateSubject?: string;
```

Also add `signatureStatus?: ExportSignatureStatus;` and `signatureFileId?: string;` to each of the 5 `*ExportOutcome` interfaces (`OtRegistryExportOutcome` ~805, `FrdoRegistryExportOutcome`, `EisotTestingExportOutcome`, `RostechnadzorExportOutcome`, `NmoExportOutcome` — grep for `ExportOutcome` to find all 5) after their `fileId?: string;` line, so the export call returns the signature status for immediate UI feedback:

```ts
  signatureStatus?: ExportSignatureStatus;
  signatureFileId?: string;
```

- [ ] **Step 4: Run test + typecheck to verify pass**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/export-signature-batch-fields.test.ts --no-file-parallelism`
Expected: PASS.
Run: `pnpm --filter @cdoprof/backend exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Lint + commit**

Run: `npx eslint apps/backend/src/modules/mvp/mvp.types.ts apps/backend/src/modules/mvp/export-signature-batch-fields.test.ts --max-warnings=0`
Expected: clean.

```bash
git add apps/backend/src/modules/mvp/mvp.types.ts apps/backend/src/modules/mvp/export-signature-batch-fields.test.ts
git commit -m "feat(backend): signature fields on 5 registry batch + outcome types"
```

End commit body with:
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

---

## Task 6: Provide `EXPORT_SIGNATURE_PROVIDER` in MvpModule

**Files:**

- Modify: `apps/backend/src/modules/mvp/mvp.module.ts`

- [ ] **Step 1: Read the documents.module.ts factory as the template**

Read `apps/backend/src/modules/documents/documents.module.ts` lines ~44-59 — the `DOCUMENT_SIGNATURE_PROVIDER` `useFactory` with the fake-first / cryptopro-warn / Noop-default branches. Mirror it.

- [ ] **Step 2: Add the provider**

In `apps/backend/src/modules/mvp/mvp.module.ts`, add the imports:

```ts
import {
  EXPORT_SIGNATURE_PROVIDER,
  NoopExportSignatureProvider
} from '../../infrastructure/export-signature/export-signature.provider.js';
import { FakeExportSignatureProvider } from '../../infrastructure/export-signature/fake-export-signature.provider.js';
```

Confirm `backendEnv` is already imported (it is used by other modules; if not present in this file, import it from `../../env.js`). Add this provider object to the module's `providers` array:

```ts
    {
      provide: EXPORT_SIGNATURE_PROVIDER,
      useFactory: () => {
        // STAGING: synthetic detached signer for end-to-end QA (env refinement forbids it in prod).
        if (backendEnv.EXPORT_SIGN_ENABLED && backendEnv.EXPORT_SIGN_PROVIDER === 'fake') {
          return new FakeExportSignatureProvider(backendEnv.EXPORT_SIGN_SIGNER_NAME);
        }
        // CryptoPro adapter not implemented yet — fall back to Noop so prod can't silently
        // believe exports are signed. Swap this branch for `new CryptoProExportSignatureProvider(...)`.
        if (backendEnv.EXPORT_SIGN_ENABLED && backendEnv.EXPORT_SIGN_PROVIDER === 'cryptopro') {
          console.warn(
            '[export-sign] EXPORT_SIGN_PROVIDER=cryptopro requested but adapter not implemented — using Noop'
          );
        }
        return new NoopExportSignatureProvider();
      }
    },
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @cdoprof/backend exec tsc --noEmit`
Expected: no errors (the token is provided but not yet injected — that's Task 7).

- [ ] **Step 4: Lint + commit**

Run: `npx eslint apps/backend/src/modules/mvp/mvp.module.ts --max-warnings=0`
Expected: clean.

```bash
git add apps/backend/src/modules/mvp/mvp.module.ts
git commit -m "feat(backend): provide EXPORT_SIGNATURE_PROVIDER factory in MvpModule"
```

End commit body with:
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

---

## Task 7: Integrate signing into all 5 exporters + parity tests

**Files (modify each service + its test):**

- `apps/backend/src/modules/mvp/frdo-registry/frdo-registry.service.ts` (+ `.service.test.ts`)
- `apps/backend/src/modules/mvp/ot-registry/ot-registry.service.ts` (+ `.service.test.ts`)
- `apps/backend/src/modules/mvp/eisot-testing-registry/eisot-testing-registry.service.ts` (+ `.service.test.ts`)
- `apps/backend/src/modules/mvp/rostechnadzor-registry/rostechnadzor-registry.service.ts` (+ `.service.test.ts`)
- `apps/backend/src/modules/mvp/nmo-registry/nmo-registry.service.ts` (+ `.service.test.ts`)

All 5 services have `@Inject(AuditService) private readonly auditService: AuditService` as the LAST constructor arg. The change is identical in shape: add an optional injected provider as the new last arg, then call the helper right after `batch.fileId = meta.id`. Because the arg is optional and last, existing positional-arg test constructions stay valid (provider `undefined` → `unsigned`).

- [ ] **Step 1: Write a failing parity test for FRDO (the reference)**

Add to `apps/backend/src/modules/mvp/frdo-registry/frdo-registry.service.test.ts`. First read the file's existing setup (how it constructs `FrdoRegistryService` with mocked deps and produces an export with ≥1 valid row). Add a test that injects a fake provider and asserts the batch is stamped. Use the file's existing service-construction helper; append the fake provider as the final constructor arg:

```ts
import { FakeExportSignatureProvider } from '../../../infrastructure/export-signature/fake-export-signature.provider.js';

it('stamps the batch with a КЭП signature when an export signer is active', async () => {
  // Build the service exactly as the existing happy-path test does, but pass
  // `new FakeExportSignatureProvider('УЦ')` as the FINAL constructor argument.
  // Run a successful export (≥1 valid row, so a file is produced).
  // Then assert on the returned outcome / stored batch:
  expect(outcome.exported).toBeGreaterThan(0);
  const batch = service.listBatches(tenantId)[0];
  expect(batch.signatureStatus).toBe('signed');
  expect(batch.signatureFileId).toBeTruthy();
  expect(batch.signatureCertificateSubject).toContain('УЦ');
});

it('leaves the batch unsigned when no export signer is configured', async () => {
  // Build the service WITHOUT the final provider arg (or pass undefined).
  // Run a successful export.
  const batch = service.listBatches(tenantId)[0];
  expect(batch.signatureStatus).toBe('unsigned');
  expect(batch.signatureFileId).toBeUndefined();
});
```

Fill in the construction/export lines from the existing happy-path test in that file. The fake provider needs the service's mocked `files.register` to return an object with `.id` and `storage.putObject` to resolve — these mocks already exist for the XLSX path, and the helper reuses the same `files`/`storage`, so no new mocks are required (the `.p7s` register call returns the same mocked id).

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/frdo-registry/frdo-registry.service.test.ts --no-file-parallelism`
Expected: the new signed-parity test FAILS (batch has no `signatureStatus`); the unsigned test may already pass.

- [ ] **Step 3: Integrate into FRDO**

In `frdo-registry.service.ts`:

Add imports:

```ts
import { signExportArtifact } from '../../../infrastructure/export-signature/sign-export-artifact.js';
import { EXPORT_SIGNATURE_PROVIDER } from '../../../infrastructure/export-signature/export-signature.provider.js';
import type { ExportSignatureProvider } from '../../../infrastructure/export-signature/export-signature.provider.js';
```

Add the optional injection as the new LAST constructor parameter (after `auditService`), remembering to add `@Optional` to the `@nestjs/common` import:

```ts
    @Inject(AuditService) private readonly auditService: AuditService,
    @Optional()
    @Inject(EXPORT_SIGNATURE_PROVIDER)
    private readonly exportSigner?: ExportSignatureProvider
```

Right after `batch.fileId = meta.id;` (inside the `if (exported)` block), add:

```ts
const sig = await signExportArtifact(
  { provider: this.exportSigner, files: this.files, storage: this.storage },
  { tenantId, fileId: meta.id, storageKey, buffer }
);
batch.signatureStatus = sig.signatureStatus;
if (sig.signatureFileId) batch.signatureFileId = sig.signatureFileId;
if (sig.signatureCertificateSubject)
  batch.signatureCertificateSubject = sig.signatureCertificateSubject;
```

Also surface it on the returned outcome — in the final `return { batchId, fileId: batch.fileId, ... }`, add:

```ts
      ...(batch.signatureStatus ? { signatureStatus: batch.signatureStatus } : {}),
      ...(batch.signatureFileId ? { signatureFileId: batch.signatureFileId } : {}),
```

- [ ] **Step 4: Run FRDO tests to verify pass**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/frdo-registry/frdo-registry.service.test.ts --no-file-parallelism`
Expected: all PASS (including both new parity tests).

- [ ] **Step 5: Repeat for OT, EISOT, Rostechnadzor, NMO**

For each of the other 4 services, apply the SAME three edits (imports, optional last-arg injection after `auditService`, the identical `signExportArtifact` call + batch stamping + outcome spread after `batch.fileId = meta.id`), and add the SAME two parity tests (signed-with-fake, unsigned-without) to its `.service.test.ts`, filled from that file's existing happy-path test. Note OT's constructor has 8 args (it also injects `OtRegistryXmlWriter`); the provider still goes LAST, after `auditService`. The import path depth (`../../../infrastructure/...`) is identical for all (each service is at `modules/mvp/<name>-registry/`).

Run each after editing:

```bash
pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/ot-registry/ot-registry.service.test.ts --no-file-parallelism
pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/eisot-testing-registry/eisot-testing-registry.service.test.ts --no-file-parallelism
pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/rostechnadzor-registry/rostechnadzor-registry.service.test.ts --no-file-parallelism
pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/nmo-registry/nmo-registry.service.test.ts --no-file-parallelism
```

Expected: all PASS.

- [ ] **Step 6: Typecheck + lint + commit**

Run: `pnpm --filter @cdoprof/backend exec tsc --noEmit` → no errors.
Run eslint on all 10 touched files → clean.

```bash
git add apps/backend/src/modules/mvp/frdo-registry apps/backend/src/modules/mvp/ot-registry apps/backend/src/modules/mvp/eisot-testing-registry apps/backend/src/modules/mvp/rostechnadzor-registry apps/backend/src/modules/mvp/nmo-registry
git commit -m "feat(backend): attach detached КЭП signature to all 5 registry exports"
```

End commit body with:
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

---

## Task 8: Signature download endpoint on the 5 controllers

**Files (modify each service + controller):**

- `apps/backend/src/modules/mvp/{frdo,ot,eisot-testing,rostechnadzor,nmo}-registry/*.service.ts` (add `getBatchSignatureUrl`)
- `apps/backend/src/modules/mvp/{...}-registry/*.controller.ts` (add `GET …/exports/:id/signature`)

The `.p7s` is stored but unreachable without an endpoint. Mirror the existing `getBatchDownloadUrl` + its controller route.

- [ ] **Step 1: Write a failing test for FRDO**

Add to `frdo-registry.service.test.ts`:

```ts
it('getBatchSignatureUrl returns a download url for a signed batch', async () => {
  // Construct with FakeExportSignatureProvider, run a successful export.
  const batch = service.listBatches(tenantId)[0];
  const { url } = await service.getBatchSignatureUrl(tenantId, batch.id);
  expect(typeof url).toBe('string');
});

it('getBatchSignatureUrl throws when the batch has no signature', async () => {
  // Construct WITHOUT a provider, run a successful export (unsigned).
  const batch = service.listBatches(tenantId)[0];
  await expect(service.getBatchSignatureUrl(tenantId, batch.id)).rejects.toThrow();
});
```

The mocked `files.createDownloadUrl` already exists for `getBatchDownloadUrl`; reuse it (return a string).

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/frdo-registry/frdo-registry.service.test.ts --no-file-parallelism`
Expected: new tests FAIL (`getBatchSignatureUrl` is not a function).

- [ ] **Step 3: Add the service method (FRDO)**

In `frdo-registry.service.ts`, mirror `getBatchDownloadUrl`:

```ts
  async getBatchSignatureUrl(tenantId: string, id: string): Promise<{ url: string }> {
    const { batch } = this.getBatchWithRecords(tenantId, id);
    if (!batch.signatureFileId) {
      throw new NotFoundException({
        code: 'frdo_registry_signature_not_found',
        message: 'Batch has no signature file'
      });
    }
    return { url: await this.files.createDownloadUrl(tenantId, batch.signatureFileId) };
  }
```

- [ ] **Step 4: Add the controller route (FRDO)**

In `frdo-registry.controller.ts`, find the existing `…/exports/:id/file` download route and add a sibling immediately after it, with the SAME guards/permission decorators (`regulatory.export.read`):

```ts
  @Get('exports/:id/signature')
  @RequirePermissions('regulatory.export.read')
  getSignature(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.service.getBatchSignatureUrl(c.tenantId!, id);
  }
```

Match the controller's actual method/route naming, decorator order, and service property name (read the existing `getFile`/download route in that controller and mirror it exactly).

- [ ] **Step 5: Run FRDO tests**

Run: `pnpm --filter @cdoprof/backend exec vitest run src/modules/mvp/frdo-registry/frdo-registry.service.test.ts --no-file-parallelism`
Expected: PASS.

- [ ] **Step 6: Repeat for OT, EISOT, Rostechnadzor, NMO**

Apply the identical service method (adjust the NotFound `code` prefix per registry: `ot_registry_…`, `eisot_testing_…`, `rostechnadzor_registry_…`, `nmo_registry_…`) and the identical controller route (same `regulatory.export.read` permission) to each. Add the same 2 service tests to each `.service.test.ts`. Run each service test file after editing (commands as in Task 7 Step 5).

- [ ] **Step 7: Typecheck + lint + commit**

Run: `pnpm --filter @cdoprof/backend exec tsc --noEmit` → no errors.
Run eslint on touched files → clean.

```bash
git add apps/backend/src/modules/mvp/frdo-registry apps/backend/src/modules/mvp/ot-registry apps/backend/src/modules/mvp/eisot-testing-registry apps/backend/src/modules/mvp/rostechnadzor-registry apps/backend/src/modules/mvp/nmo-registry
git commit -m "feat(backend): signature (.p7s) download endpoint on 5 registry controllers"
```

End commit body with:
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

---

## Task 9: Frontend gov-export signature badge

**Files:**

- Create: `apps/frontend/src/features/gov-export/export-signature-badge.ts`
- Modify: the gov-export batch-list rendering (read `apps/frontend/app/gov-export/page.tsx` and the `apps/frontend/src/features/gov-export/` feature to find where batch rows render their status).
- Test: a `*.test.ts` next to the helper (pure-function convention, no React render).

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/features/gov-export/export-signature-badge.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { exportSignatureBadgeLabel } from './export-signature-badge';

describe('exportSignatureBadgeLabel (Phase 6 КЭП)', () => {
  it('signed → "Подписано КЭП"', () => {
    expect(exportSignatureBadgeLabel('signed')).toBe('Подписано КЭП');
  });
  it('failed → "Ошибка подписи"', () => {
    expect(exportSignatureBadgeLabel('failed')).toBe('Ошибка подписи');
  });
  it('unsigned / undefined → null', () => {
    expect(exportSignatureBadgeLabel('unsigned')).toBeNull();
    expect(exportSignatureBadgeLabel(undefined)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/features/gov-export/export-signature-badge.test.ts --no-file-parallelism`
Expected: FAIL — module missing.

- [ ] **Step 3: Write the pure helper**

Create `apps/frontend/src/features/gov-export/export-signature-badge.ts`:

```ts
/**
 * Phase 6 КЭП — human-readable badge for an export batch's detached-signature status.
 * Returns null for unsigned/undefined: the seam ships dormant, so most batches are unsigned and a
 * per-row "не подписано" would be noise. Show a chip only when actually signed or failed.
 */
export function exportSignatureBadgeLabel(
  status: 'unsigned' | 'signed' | 'failed' | undefined
): string | null {
  switch (status) {
    case 'signed':
      return 'Подписано КЭП';
    case 'failed':
      return 'Ошибка подписи';
    default:
      return null;
  }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/features/gov-export/export-signature-badge.test.ts --no-file-parallelism`
Expected: PASS.

- [ ] **Step 5: Render the badge**

Read the gov-export feature's batch-row rendering (the types file should already expose batch fields; add `signatureStatus?: 'unsigned' | 'signed' | 'failed'` and `signatureFileId?: string` to the frontend batch type if it mirrors the backend outcome). Where each batch row shows its status/download, render the badge when non-null (plain `<span>`, mirroring §5.131's learner-documents badge — do NOT reuse a status chip that maps a fixed vocabulary). Keep it minimal; if the gov-export batch type/list is shared across the 5 registries, add the badge once in the shared row renderer.

- [ ] **Step 6: Verify + lint + typecheck + commit**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/features/gov-export --no-file-parallelism` → PASS.
Run eslint on touched frontend files → clean.
Run: `pnpm --filter @cdoprof/frontend exec tsc --noEmit` → no errors.

```bash
git add apps/frontend/src/features/gov-export apps/frontend/app/gov-export
git commit -m "feat(frontend): КЭП export-signature badge in gov-export"
```

End commit body with:
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>

---

## Final verification + docs handoff

- [ ] **Backend — run all touched suites together**

```bash
pnpm --filter @cdoprof/backend exec vitest run src/infrastructure/export-signature src/env.export-sign.test.ts src/modules/mvp/export-signature-batch-fields.test.ts src/modules/mvp/frdo-registry src/modules/mvp/ot-registry src/modules/mvp/eisot-testing-registry src/modules/mvp/rostechnadzor-registry src/modules/mvp/nmo-registry --no-file-parallelism
```

Expected: all PASS.

- [ ] **Frontend — gov-export suite**

Run: `pnpm --filter @cdoprof/frontend exec vitest run src/features/gov-export --no-file-parallelism`
Expected: PASS.

- [ ] **Monorepo typecheck**

Run: `pnpm typecheck`
Expected: 8/8.

- [ ] **Docs handoff** (per CLAUDE.md «After every engineering session»): README §2 «AI Agent State» (Current Stage / Last Completed / Last Updated By+At), append `### 5.132` to LMS_AGENT_HANDOFF.md §5, cross-link this plan + the spec, update memory `project_esign_phase6.md` (КЭП export half now has its seam; shrink follow-up to: real КриптоПро adapter for BOTH document+export seams, legal, ops). Note dependency: this branch was cut from `origin/main` and does not include §5.131 (PR #259) — the README/handoff doc edits may conflict at merge; resolve by keeping both entries.

---

## Deviations

_(Record any deviations from this plan here during execution.)_
