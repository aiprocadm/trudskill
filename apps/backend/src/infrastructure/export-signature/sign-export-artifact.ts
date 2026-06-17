import type {
  ExportSignatureProvider,
  ExportSignatureStatus
} from './export-signature.provider.js';
import type { FilesService } from '../../modules/files/files.service.js';
import type { S3StorageClient } from '../storage/s3-storage.client.js';

export interface SignExportArtifactDeps {
  provider: ExportSignatureProvider | undefined;
  files: FilesService;
  storage: S3StorageClient;
}

export interface SignExportArtifactInput {
  tenantId: string;
  /** files-meta id of the exported XLSX. */
  fileId: string;
  /** storage key of the XLSX; the .p7s is stored at `${storageKey}.p7s`. */
  storageKey: string;
  /** bytes of the XLSX. */
  buffer: Buffer;
}

export interface SignExportArtifactOutput {
  signatureStatus: ExportSignatureStatus;
  signatureFileId?: string;
  signatureCertificateSubject?: string;
}

const P7S_CONTENT_TYPE = 'application/pkcs7-signature';

/**
 * Signs an export artifact with the active provider and stores the detached .p7s as a sibling
 * file. Provider absent / Noop → export stays `unsigned`. Fail-soft: a provider or storage error
 * never throws (the XLSX export is already persisted and must not be rolled back) — it returns
 * `signatureStatus: 'failed'`. Mirrors the fail-soft document `applySignature` + AV gate.
 */
export async function signExportArtifact(
  deps: SignExportArtifactDeps,
  input: SignExportArtifactInput
): Promise<SignExportArtifactOutput> {
  const { provider, files, storage } = deps;
  if (!provider || provider.id === 'noop') {
    return { signatureStatus: 'unsigned' };
  }
  try {
    const result = await provider.sign({
      tenantId: input.tenantId,
      fileId: input.fileId,
      content: input.buffer
    });
    if (result.status !== 'signed' || !result.signatureContent) {
      return { signatureStatus: result.status === 'unsigned' ? 'unsigned' : 'failed' };
    }
    const sigKey = `${input.storageKey}.p7s`;
    const meta = await files.register({
      tenantId: input.tenantId,
      storageKey: sigKey,
      originalName: `${input.storageKey.split('/').pop() ?? 'export'}.p7s`,
      mimeType: P7S_CONTENT_TYPE,
      sizeBytes: result.signatureContent.length,
      antivirusStatus: 'clean'
    });
    await storage.putObject({
      key: sigKey,
      body: result.signatureContent,
      contentType: P7S_CONTENT_TYPE
    });
    const out: SignExportArtifactOutput = {
      signatureStatus: 'signed',
      signatureFileId: meta.id
    };
    if (result.certificateSubject) out.signatureCertificateSubject = result.certificateSubject;
    return out;
  } catch {
    return { signatureStatus: 'failed' };
  }
}
