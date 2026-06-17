import type {
  ExportSignatureProvider,
  ExportSignatureResult,
  SignExportParams
} from './export-signature.provider.js';

/**
 * STAGING-ONLY export signer. Returns a synthetic detached signature WITHOUT any real
 * cryptography so dev/staging can exercise the full pipeline (sign → store → download →
 * badge). FORBIDDEN in production by an env refinement (see env.schema.ts): prod must never
 * believe an export is signed when it isn't. The real КриптоПро adapter replaces this behind
 * the same EXPORT_SIGNATURE_PROVIDER token.
 */
export class FakeExportSignatureProvider implements ExportSignatureProvider {
  readonly id = 'fake';

  constructor(private readonly signerName: string) {}

  async sign(params: SignExportParams): Promise<ExportSignatureResult> {
    return {
      status: 'signed',
      signatureContent: Buffer.from(`FAKE-P7S STAGING — не криптоподпись over ${params.fileId}`),
      certificateSubject: `CN=${this.signerName} (STAGING, не криптоподпись)`
    };
  }
}
