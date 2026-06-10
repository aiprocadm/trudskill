import { describe, expect, it, vi } from 'vitest';

import { IdentityRetentionScanner } from './identity-retention-scanner.service.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';

import type { AuditService } from '../../audit/audit.service.js';
import type { FilesService } from '../../files/files.service.js';

function makeScanner() {
  const deleteFile = vi.fn(async () => undefined);
  const auditWrite = vi.fn();
  const scanner = new IdentityRetentionScanner(
    { deleteFile } as unknown as FilesService,
    { write: auditWrite } as unknown as AuditService
  );
  return { scanner, deleteFile, auditWrite };
}

function seedState(reviewedAt: string) {
  const state = new InMemoryMvpState();
  state.identityVerifications.push({
    id: 'idv_1',
    tenantId: 't1',
    learnerId: 'l1',
    method: 'selfie_passport',
    verificationStatus: 'approved',
    selfieFileId: 'f_s',
    passportFileId: 'f_p',
    reviewedAt,
    status: 'active',
    createdAt: reviewedAt,
    updatedAt: reviewedAt
  });
  return state;
}

describe('IdentityRetentionScanner', () => {
  it('purges both images, stamps imagesPurgedAt, audits', async () => {
    const { scanner, deleteFile, auditWrite } = makeScanner();
    const state = seedState('2026-01-01T00:00:00.000Z');
    const purged = await scanner.scanTenant('t1', '2026-06-01', state);
    expect(purged).toBe(1);
    expect(deleteFile).toHaveBeenCalledWith('t1', 'f_s');
    expect(deleteFile).toHaveBeenCalledWith('t1', 'f_p');
    expect(state.identityVerifications[0]!.imagesPurgedAt).toBeTruthy();
    expect(auditWrite).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'learning.identity_verification_images_purged' })
    );
  });

  it('does nothing inside the retention window and never double-purges', async () => {
    const { scanner, deleteFile } = makeScanner();
    const state = seedState(new Date().toISOString());
    expect(await scanner.scanTenant('t1', new Date().toISOString().slice(0, 10), state)).toBe(0);
    expect(deleteFile).not.toHaveBeenCalled();
  });

  it('one failing record does not abort the batch', async () => {
    const { scanner, deleteFile } = makeScanner();
    deleteFile.mockRejectedValueOnce(new Error('s3 down'));
    const state = seedState('2026-01-01T00:00:00.000Z');
    state.identityVerifications.push({
      ...state.identityVerifications[0]!,
      id: 'idv_2',
      selfieFileId: 'f_s2',
      passportFileId: 'f_p2'
    });
    const purged = await scanner.scanTenant('t1', '2026-06-01', state);
    expect(purged).toBe(1); // first failed, second succeeded
    expect(state.identityVerifications[0]!.imagesPurgedAt).toBeUndefined();
    expect(state.identityVerifications[1]!.imagesPurgedAt).toBeTruthy();
  });
});
