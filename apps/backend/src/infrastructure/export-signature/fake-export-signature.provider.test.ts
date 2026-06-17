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
