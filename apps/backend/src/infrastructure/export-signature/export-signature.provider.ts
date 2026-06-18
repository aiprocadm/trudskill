/**
 * Provider-agnostic seam for КЭП detached signing of registry export files,
 * mirroring DocumentSignatureProvider (НЭП). Noop is the safe default for dev/test and any
 * env with EXPORT_SIGN_ENABLED=false: export files stay unsigned and the existing
 * generate→store→download flow is unchanged. A КриптоПро (CSP + SDK) adapter plugs in later
 * behind the same token. Unlike the document seam (embedded PDF stamp), this produces a
 * DETACHED .p7s over the raw file bytes — the КЭП standard for госреестр uploads.
 */
export type ExportSignatureStatus = 'unsigned' | 'signed' | 'failed';

export interface SignExportParams {
  tenantId: string;
  /** files-meta id of the exported XLSX (for traceability/audit). */
  fileId: string;
  /** Raw bytes of the file to sign (detached signature is computed over these). */
  content: Buffer;
}

export interface ExportSignatureResult {
  status: ExportSignatureStatus;
  /** Detached signature (CMS/PKCS#7, .p7s) bytes — caller stores it as a sibling file. Set when signed. */
  signatureContent?: Buffer;
  /** Certificate subject / thumbprint for display + audit. Set when signed. */
  certificateSubject?: string;
  /** Error text when status==='failed'. */
  detail?: string;
}

export interface ExportSignatureProvider {
  /** Stable provider id ('noop' | 'fake' | 'cryptopro'). */
  readonly id: string;
  sign(params: SignExportParams): Promise<ExportSignatureResult>;
}

/** DI token for the active export signer. Mirrors DOCUMENT_SIGNATURE_PROVIDER. */
export const EXPORT_SIGNATURE_PROVIDER = Symbol('EXPORT_SIGNATURE_PROVIDER');

export class NoopExportSignatureProvider implements ExportSignatureProvider {
  readonly id = 'noop';
  async sign(_params: SignExportParams): Promise<ExportSignatureResult> {
    return { status: 'unsigned' };
  }
}
