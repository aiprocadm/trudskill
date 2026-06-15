/**
 * Provider-agnostic seam for ГОСТ document signing (НЭП), mirroring AntivirusScanner.
 * Noop is the safe default for dev/test and any env with ESIGN_ENABLED=false:
 * documents stay `unsigned` and the existing generate→finalize→download flow is unchanged.
 * A КриптоПро (CSP + КриптоАРМ SDK) adapter plugs in later behind the same token.
 */
export type DocumentSignatureStatus = 'unsigned' | 'signed' | 'failed';

export interface SignDocumentParams {
  tenantId: string;
  documentId: string;
  /** S3/MinIO key of the PDF to sign (GeneratedDocumentEntity.fileId / pdfFileId). */
  fileId: string;
}

export interface SignatureResult {
  status: DocumentSignatureStatus;
  /** Opaque reference to the stored signature (detached .sig key / provider tx id). Set when signed. */
  signatureRef?: string;
  /** Certificate subject / thumbprint for display + audit. Set when signed. */
  certificateSubject?: string;
  /** Error text when status==='failed'. */
  detail?: string;
}

export interface DocumentSignatureProvider {
  /** Stable provider id stored on the document for traceability ('noop' | 'cryptopro' | ...). */
  readonly id: string;
  sign(params: SignDocumentParams): Promise<SignatureResult>;
}

/** DI token for the active signer. Mirrors ANTIVIRUS_SCANNER. */
export const DOCUMENT_SIGNATURE_PROVIDER = Symbol('DOCUMENT_SIGNATURE_PROVIDER');

export class NoopDocumentSignatureProvider implements DocumentSignatureProvider {
  readonly id = 'noop';
  async sign(_params: SignDocumentParams): Promise<SignatureResult> {
    return { status: 'unsigned' };
  }
}
