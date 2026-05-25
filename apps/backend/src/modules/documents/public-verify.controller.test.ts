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
  it('returns valid result for a known qr_token', () => {
    const { state, controller } = makeService();
    state.generatedDocuments.push(makeDoc({ id: 'gdoc_real', qrToken: 'realtoken1234567890ab' }));
    const result = controller.verify('realtoken1234567890ab');
    expect(result.status).toBe('valid');
    expect(result.documentId).toBe('gdoc_real');
    expect(result.documentNumber).toBe('N-1');
    expect(result.documentType).toBe('certificate');
    expect(result.issueDate).toBe('2026-05-26');
  });

  it('throws NotFoundException with document_not_found code for unknown token', () => {
    const { controller } = makeService();
    try {
      controller.verify('unknown_token_aaaaaaaaa');
      expect.fail('should have thrown');
    } catch (caught) {
      expect(caught).toBeInstanceOf(NotFoundException);
      const response = (caught as NotFoundException).getResponse() as Record<string, unknown>;
      expect(response.code).toBe('document_not_found');
    }
  });

  it('does NOT leak tenantId in response', () => {
    const { state, controller } = makeService();
    state.generatedDocuments.push(
      makeDoc({ id: 'gdoc_t2', tenantId: 'secret_tenant', qrToken: 'tt_token_1234567890ab' })
    );
    const result = controller.verify('tt_token_1234567890ab');
    expect(Object.keys(result)).not.toContain('tenantId');
    expect(JSON.stringify(result)).not.toContain('secret_tenant');
  });

  it('writes audit entry with partial token (first 4 chars)', () => {
    const { audit, controller, state } = makeService();
    const spy = vi.spyOn(audit, 'write');
    state.generatedDocuments.push(makeDoc({ qrToken: 'AbCdEFGhIJKLMNOPQRSTUV' }));
    controller.verify('AbCdEFGhIJKLMNOPQRSTUV');
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

  it('returns status="revoked" for revoked documents (Plan C §5.9 wiring)', () => {
    const { state, controller } = makeService();
    state.generatedDocuments.push(
      makeDoc({ id: 'gdoc_rev', qrToken: 'rev_token_1234567890ab', status: 'revoked' as never })
    );
    const result = controller.verify('rev_token_1234567890ab');
    expect(result.status).toBe('revoked');
  });

  it('rejects empty / too-short tokens as not_found', () => {
    const { controller } = makeService();
    expect(() => controller.verify('')).toThrow(NotFoundException);
    expect(() => controller.verify('abc')).toThrow(NotFoundException);
  });
});
