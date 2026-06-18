import type {
  DocumentSignatureProvider,
  SignDocumentParams,
  SignatureResult
} from './document-signature.provider.js';

/**
 * Phase 6 — STAGING-ONLY signer. Returns a synthetic `signed` result WITHOUT any real
 * cryptography so dev/staging can exercise the full pipeline (signature → audit → badge →
 * public verify). FORBIDDEN in production by an env refinement (see env.schema.ts): prod
 * must never believe a document is signed when it isn't. The real КриптоПро adapter replaces
 * this behind the same DOCUMENT_SIGNATURE_PROVIDER token.
 */
export class FakeDocumentSignatureProvider implements DocumentSignatureProvider {
  readonly id = 'fake';

  constructor(private readonly signerName: string) {}

  async sign(params: SignDocumentParams): Promise<SignatureResult> {
    return {
      status: 'signed',
      signatureRef: `fake-sig://${params.documentId}`,
      certificateSubject: `CN=${this.signerName} (STAGING, не криптоподпись)`
    };
  }
}
