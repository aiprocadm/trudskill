import { describe, expect, it, vi } from 'vitest';

import { NoopExportSignatureProvider } from './export-signature.provider.js';
import { FakeExportSignatureProvider } from './fake-export-signature.provider.js';
import { signExportArtifact } from './sign-export-artifact.js';

import type { ExportSignatureProvider } from './export-signature.provider.js';
import type { FilesService } from '../../modules/files/files.service.js';
import type { S3StorageClient } from '../storage/s3-storage.client.js';

function makeDeps(provider: ExportSignatureProvider | undefined) {
  const files = { register: vi.fn(async () => ({ id: 'sigfile_1' })) };
  const storage = { putObject: vi.fn(async () => undefined) };
  return {
    deps: {
      provider,
      files: files as unknown as FilesService,
      storage: storage as unknown as S3StorageClient
    },
    files,
    storage
  };
}

const input = {
  tenantId: 't1',
  fileId: 'xlsxfile_1',
  storageKey: 't1/frdo-registry/frb_1.xlsx',
  buffer: Buffer.from('xlsx-bytes')
};

describe('signExportArtifact', () => {
  it('returns unsigned and stores nothing when provider is absent', async () => {
    const { deps, files, storage } = makeDeps(undefined);
    const out = await signExportArtifact(deps, input);
    expect(out.signatureStatus).toBe('unsigned');
    expect(files.register).not.toHaveBeenCalled();
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it('returns unsigned for the Noop provider', async () => {
    const { deps, storage } = makeDeps(new NoopExportSignatureProvider());
    const out = await signExportArtifact(deps, input);
    expect(out.signatureStatus).toBe('unsigned');
    expect(storage.putObject).not.toHaveBeenCalled();
  });

  it('signs, registers + stores the .p7s sibling, returns the signature file id', async () => {
    const { deps, storage } = makeDeps(new FakeExportSignatureProvider('УЦ'));
    const out = await signExportArtifact(deps, input);
    expect(out.signatureStatus).toBe('signed');
    expect(out.signatureFileId).toBe('sigfile_1');
    expect(out.signatureCertificateSubject).toContain('УЦ');
    expect(storage.putObject).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 't1/frdo-registry/frb_1.xlsx.p7s',
        contentType: 'application/pkcs7-signature'
      })
    );
  });

  it('returns failed (not signed) when the provider throws, without throwing', async () => {
    const throwing: ExportSignatureProvider = {
      id: 'fake',
      sign: async () => {
        throw new Error('signer offline');
      }
    };
    const { deps } = makeDeps(throwing);
    const out = await signExportArtifact(deps, input);
    expect(out.signatureStatus).toBe('failed');
    expect(out.signatureFileId).toBeUndefined();
  });

  it('returns failed when storage.putObject throws, without throwing', async () => {
    const { deps, storage } = makeDeps(new FakeExportSignatureProvider('УЦ'));
    storage.putObject.mockRejectedValueOnce(new Error('s3 down'));
    const out = await signExportArtifact(deps, input);
    expect(out.signatureStatus).toBe('failed');
  });
});
