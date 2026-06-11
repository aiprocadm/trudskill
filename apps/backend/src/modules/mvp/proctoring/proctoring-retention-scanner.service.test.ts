import { describe, expect, it, vi } from 'vitest';

import { ProctoringRetentionScanner } from './proctoring-retention-scanner.service.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';

import type { AuditService } from '../../audit/audit.service.js';
import type { FilesService } from '../../files/files.service.js';

function makeScanner() {
  const deleteFile = vi.fn(async () => undefined);
  const auditWrite = vi.fn();
  const scanner = new ProctoringRetentionScanner(
    { deleteFile } as unknown as FilesService,
    { write: auditWrite } as unknown as AuditService
  );
  return { scanner, deleteFile, auditWrite };
}

function seedState(startedAt: string, id = 'prec_1') {
  const state = new InMemoryMvpState();
  state.proctoringRecordings.push({
    id,
    tenantId: 't1',
    learnerId: 'l1',
    groupId: 'g1',
    courseId: 'c1',
    recordingStatus: 'completed',
    consentAt: startedAt,
    startedAt,
    completedAt: startedAt,
    chunks: [
      { sequence: 0, fileId: `${id}_f0`, uploadedIntentAt: startedAt },
      { sequence: 1, fileId: `${id}_f1`, uploadedIntentAt: startedAt }
    ],
    status: 'active',
    createdAt: startedAt,
    updatedAt: startedAt
  });
  return state;
}

describe('ProctoringRetentionScanner', () => {
  it('deletes every chunk file, stamps purgedAt, audits learning.proctoring_video_purged', async () => {
    const { scanner, deleteFile, auditWrite } = makeScanner();
    const state = seedState('2026-01-01T00:00:00.000Z');
    const purged = await scanner.scanTenant('t1', '2027-06-01', state);
    expect(purged).toBe(1);
    expect(deleteFile).toHaveBeenCalledWith('t1', 'prec_1_f0');
    expect(deleteFile).toHaveBeenCalledWith('t1', 'prec_1_f1');
    expect(state.proctoringRecordings[0]!.purgedAt).toBeTruthy();
    expect(auditWrite).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'learning.proctoring_video_purged', entityId: 'prec_1' })
    );
  });

  it('does nothing inside the retention window', async () => {
    const { scanner, deleteFile } = makeScanner();
    const state = seedState(new Date().toISOString());
    expect(await scanner.scanTenant('t1', new Date().toISOString().slice(0, 10), state)).toBe(0);
    expect(deleteFile).not.toHaveBeenCalled();
  });

  it('a failing record gets NO purgedAt stamp (retry next run) and does not abort the batch', async () => {
    const { scanner, deleteFile } = makeScanner();
    deleteFile.mockRejectedValueOnce(new Error('s3 down'));
    const state = seedState('2026-01-01T00:00:00.000Z');
    const second = seedState('2026-01-01T00:00:00.000Z', 'prec_2');
    state.proctoringRecordings.push(second.proctoringRecordings[0]!);
    const purged = await scanner.scanTenant('t1', '2027-06-01', state);
    expect(purged).toBe(1); // first failed mid-chunks, second succeeded
    expect(state.proctoringRecordings[0]!.purgedAt).toBeUndefined();
    expect(state.proctoringRecordings[1]!.purgedAt).toBeTruthy();
  });
});
