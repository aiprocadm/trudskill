import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { InMemoryDocumentsState } from './in-memory-documents.state.js';
import { MemoryDocumentsPersistenceBackend } from './infrastructure/memory-documents-persistence.backend.js';
import { PublicVerifyController } from './public-verify.controller.js';
import { AuditService } from '../audit/audit.service.js';

import type { GeneratedDocumentEntity } from './documents.types.js';

function makeDoc(overrides: Partial<GeneratedDocumentEntity> = {}): GeneratedDocumentEntity {
  return {
    id: 'gdoc_x',
    tenantId: 't1',
    templateId: 'tpl',
    templateVersionId: 'tplv',
    documentType: 'certificate',
    name: 'Doc',
    sourceEntityType: 'enrollment',
    sourceEntityId: 'enr',
    fileId: 'f',
    status: 'generated',
    documentNumber: 'N-1',
    documentDate: '2026-05-26',
    isFinal: false,
    generatedAt: '2026-05-26T00:00:00.000Z',
    qrToken: 'AbC123XyZ_-token456789',
    ...overrides
  };
}

function makeService() {
  // The public path has NO tenant context and NO request-scoped state — it must find
  // documents cross-tenant in the DURABLE backend. We seed the backend (not a hand-held
  // service state), which is exactly the production wiring the old test failed to exercise.
  const backend = new MemoryDocumentsPersistenceBackend();
  const audit = new AuditService();
  const controller = new PublicVerifyController(backend, audit);

  async function seed(doc: GeneratedDocumentEntity): Promise<void> {
    const state = new InMemoryDocumentsState();
    await backend.loadIntoState(doc.tenantId, state);
    state.generatedDocuments.push(doc);
    await backend.saveFromState(doc.tenantId, state);
  }

  return { backend, audit, controller, seed };
}

describe('PublicVerifyController (Plan C §5.8)', () => {
  it('finds a document that lives only in the durable backend (regression: empty request state)', async () => {
    const { controller, seed } = makeService();
    // No request-scoped state is ever populated — the doc is only in persistence.
    await seed(makeDoc({ id: 'gdoc_real', qrToken: 'realtoken1234567890ab' }));
    const result = await controller.verify('realtoken1234567890ab');
    expect(result.status).toBe('valid');
    expect(result.documentId).toBe('gdoc_real');
    expect(result.documentNumber).toBe('N-1');
    expect(result.documentType).toBe('certificate');
    expect(result.issueDate).toBe('2026-05-26');
  });

  it('throws NotFoundException with document_not_found code for unknown token', async () => {
    const { controller } = makeService();
    await expect(controller.verify('unknown_token_aaaaaaaaa')).rejects.toBeInstanceOf(
      NotFoundException
    );
    const caught = await controller.verify('unknown_token_aaaaaaaaa').catch((e: unknown) => e);
    const response = (caught as NotFoundException).getResponse() as Record<string, unknown>;
    expect(response.code).toBe('document_not_found');
  });

  it('finds a document in ANOTHER tenant without leaking tenantId', async () => {
    const { controller, seed } = makeService();
    await seed(
      makeDoc({ id: 'gdoc_t2', tenantId: 'secret_tenant', qrToken: 'tt_token_1234567890ab' })
    );
    const result = await controller.verify('tt_token_1234567890ab');
    expect(result.status).toBe('valid');
    expect(result.documentId).toBe('gdoc_t2');
    expect(Object.keys(result)).not.toContain('tenantId');
    expect(JSON.stringify(result)).not.toContain('secret_tenant');
  });

  it('writes audit entry via writeCritical (awaited)', async () => {
    const { audit, controller, seed } = makeService();
    const spy = vi.spyOn(audit, 'writeCritical');
    await seed(makeDoc({ qrToken: 'AbCdEFGhIJKLMNOPQRSTUV' }));
    await controller.verify('AbCdEFGhIJKLMNOPQRSTUV');
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'public',
        action: 'documents.qr_verification_requested'
      })
    );
    const call = spy.mock.calls[0]?.[0] as { entityId?: string } | undefined;
    expect(call?.entityId).toBe('AbCd…');
    expect(call?.entityId).not.toContain('IJKL');
  });

  it('returns status="revoked" for revoked documents (Plan C §5.9 wiring)', async () => {
    const { controller, seed } = makeService();
    await seed(
      makeDoc({ id: 'gdoc_rev', qrToken: 'rev_token_1234567890ab', status: 'revoked' as never })
    );
    const result = await controller.verify('rev_token_1234567890ab');
    expect(result.status).toBe('revoked');
  });

  it('rejects empty / too-short tokens as not_found', async () => {
    const { controller } = makeService();
    await expect(controller.verify('')).rejects.toThrow(NotFoundException);
    await expect(controller.verify('abc')).rejects.toThrow(NotFoundException);
  });
});

describe('PublicVerifyController PII protection', () => {
  it('response does NOT include learnerFullName, snils, programTitle, issuerName, academicHours', async () => {
    const { controller, seed } = makeService();
    await seed(makeDoc({ id: 'gdoc_pii', qrToken: 'pii_token_1234567890ab' }));
    const result = await controller.verify('pii_token_1234567890ab');
    const keys = Object.keys(result);
    expect(keys).not.toContain('learnerFullName');
    expect(keys).not.toContain('snils');
    expect(keys).not.toContain('programTitle');
    expect(keys).not.toContain('issuerName');
    expect(keys).not.toContain('academicHours');
  });

  it('revoked response — НЕ раскрывает revokedBy (actor)', async () => {
    const { controller, seed } = makeService();
    await seed(
      makeDoc({
        id: 'gdoc_revoked',
        qrToken: 'rev_pii_1234567890ab',
        status: 'revoked' as never,
        revokedBy: 'secret_admin_id',
        revokedAt: '2026-05-01T00:00:00.000Z',
        revocationReason: 'причина'
      } as never)
    );
    const result = await controller.verify('rev_pii_1234567890ab');
    expect(result.status).toBe('revoked');
    expect(result).not.toHaveProperty('revokedBy');
    expect(JSON.stringify(result)).not.toContain('secret_admin_id');
  });
});

describe('PublicVerifyController rate-limit configuration', () => {
  it('verify method has @Throttle decorator with limit=30 ttl=60s', () => {
    const verifyFn = PublicVerifyController.prototype.verify;
    const ttl = Reflect.getMetadata('THROTTLER:TTLdefault', verifyFn) as number | undefined;
    const limit = Reflect.getMetadata('THROTTLER:LIMITdefault', verifyFn) as number | undefined;
    expect(ttl).toBe(60_000);
    expect(limit).toBe(30);
  });
});
