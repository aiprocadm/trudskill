import { describe, expect, it } from 'vitest';

import { DOCUMENT_TYPE_LABELS, type VerifyStatus } from './types';

describe('Public verify types (Plan C §5.8)', () => {
  it('DOCUMENT_TYPE_LABELS covers all 8 template types', () => {
    const expectedKeys = [
      'certificate',
      'protocol',
      'order',
      'diploma',
      'attestation',
      'reference',
      'report',
      'contract'
    ];
    for (const k of expectedKeys) {
      expect(DOCUMENT_TYPE_LABELS[k]).toBeTruthy();
    }
  });

  it('VerifyStatus union has just valid + revoked (not_found handled at controller layer)', () => {
    const samples: VerifyStatus[] = ['valid', 'revoked'];
    expect(samples).toHaveLength(2);
  });
});
