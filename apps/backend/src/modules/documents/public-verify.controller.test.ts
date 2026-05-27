import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { DocumentsService } from './documents.service.js';
import { InMemoryDocumentsState } from './in-memory-documents.state.js';
import { PublicVerifyController } from './public-verify.controller.js';
import { AuditService } from '../audit/audit.service.js';
import { RealtimeEventsService } from '../core/realtime-events.service.js';

import type { GeneratedDocumentEntity } from './documents.types.js';

function makeService() {
  const state = new InMemoryDocumentsState();
  const audit = new AuditService();
  const service = new DocumentsService(state, audit, new RealtimeEventsService());
  const controller = new PublicVerifyController(service, audit);
  return { state, audit, service, controller };
}

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

describe('PublicVerifyController (Plan C §5.8)', () => {
  it('returns valid result for a known qr_token', async () => {
    const { state, controller } = makeService();
    state.generatedDocuments.push(makeDoc({ id: 'gdoc_real', qrToken: 'realtoken1234567890ab' }));
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

  it('does NOT leak tenantId in response', async () => {
    const { state, controller } = makeService();
    state.generatedDocuments.push(
      makeDoc({ id: 'gdoc_t2', tenantId: 'secret_tenant', qrToken: 'tt_token_1234567890ab' })
    );
    const result = await controller.verify('tt_token_1234567890ab');
    expect(Object.keys(result)).not.toContain('tenantId');
    expect(JSON.stringify(result)).not.toContain('secret_tenant');
  });

  it('writes audit entry via writeCritical (awaited)', async () => {
    const { audit, controller, state } = makeService();
    const spy = vi.spyOn(audit, 'writeCritical');
    state.generatedDocuments.push(makeDoc({ qrToken: 'AbCdEFGhIJKLMNOPQRSTUV' }));
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
    const { state, controller } = makeService();
    state.generatedDocuments.push(
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
    const { state, controller } = makeService();
    state.generatedDocuments.push(
      makeDoc({
        id: 'gdoc_pii',
        qrToken: 'pii_token_1234567890ab'
        // даже если что-то в state есть, оно НЕ должно попасть в response
      })
    );
    const result = await controller.verify('pii_token_1234567890ab');
    const keys = Object.keys(result);
    expect(keys).not.toContain('learnerFullName');
    expect(keys).not.toContain('snils');
    expect(keys).not.toContain('programTitle');
    expect(keys).not.toContain('issuerName');
    expect(keys).not.toContain('academicHours');
  });

  it('revoked response — НЕ раскрывает revokedBy (actor)', async () => {
    const { state, controller } = makeService();
    state.generatedDocuments.push(
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
