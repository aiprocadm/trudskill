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
