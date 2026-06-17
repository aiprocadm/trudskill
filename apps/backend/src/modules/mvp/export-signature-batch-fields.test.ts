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
