import { describe, expect, it } from 'vitest';

import { buildPublicVerifyResult } from './public-verify.util.js';

import type { GeneratedDocumentEntity } from './documents.types.js';

function makeDoc(overrides: Partial<GeneratedDocumentEntity> = {}): GeneratedDocumentEntity {
  return {
    id: 'gdoc_x',
    tenantId: 'secret_tenant',
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
    qrToken: 'tok',
    ...overrides
  };
}

describe('buildPublicVerifyResult', () => {
  it('maps a generated document to a valid public result', () => {
    const r = buildPublicVerifyResult(makeDoc());
    expect(r.status).toBe('valid');
    expect(r.documentId).toBe('gdoc_x');
    expect(r.documentNumber).toBe('N-1');
    expect(r.documentType).toBe('certificate');
    expect(r.issueDate).toBe('2026-05-26');
  });

  it('maps a revoked document and exposes the revocation reason but no actor', () => {
    const r = buildPublicVerifyResult(
      makeDoc({
        status: 'revoked' as never,
        revokedAt: '2026-06-01T00:00:00.000Z',
        revocationReason: 'причина',
        revokedBy: 'secret_admin'
      } as never)
    );
    expect(r.status).toBe('revoked');
    expect(r.revocationReason).toBe('причина');
    expect(JSON.stringify(r)).not.toContain('secret_admin');
  });

  it('treats an archived (withdrawn) document as not_found and leaks no document fields', () => {
    const r = buildPublicVerifyResult(
      makeDoc({ status: 'archived', archivedAt: '2026-06-10T00:00:00.000Z' } as never)
    );
    expect(r.status).toBe('not_found');
    expect(r.documentId).toBeUndefined();
    expect(r.documentNumber).toBeUndefined();
    expect(JSON.stringify(r)).not.toContain('gdoc_x');
    expect(JSON.stringify(r)).not.toContain('N-1');
  });

  it('never leaks tenantId or PII fields', () => {
    const r = buildPublicVerifyResult(makeDoc());
    expect(JSON.stringify(r)).not.toContain('secret_tenant');
    for (const key of ['tenantId', 'learnerFullName', 'snils', 'issuerName']) {
      expect(Object.keys(r)).not.toContain(key);
    }
  });

  it('exposes signatureStatus only when signed', () => {
    expect(buildPublicVerifyResult(makeDoc()).signatureStatus).toBeUndefined();
    const signed = buildPublicVerifyResult(
      makeDoc({ signatureStatus: 'signed', signatureCertificateSubject: 'CN=УЦ' } as never)
    );
    expect(signed.signatureStatus).toBe('signed');
    expect(signed.signatureCertificateSubject).toBe('CN=УЦ');
  });
});
