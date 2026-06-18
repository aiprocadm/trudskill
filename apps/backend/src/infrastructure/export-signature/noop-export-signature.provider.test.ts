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
