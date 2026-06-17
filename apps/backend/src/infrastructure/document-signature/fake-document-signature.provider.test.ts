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
    expect(result.certificateSubject).toContain('STAGING');
  });
});
