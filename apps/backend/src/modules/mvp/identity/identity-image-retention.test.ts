import { describe, expect, it } from 'vitest';

import { selectIdentityImagesToPurge } from './identity-image-retention.js';

const base = {
  verificationStatus: 'approved' as const,
  reviewedAt: '2026-01-01T10:00:00.000Z',
  selfieFileId: 'f_s',
  passportFileId: 'f_p'
};

describe('selectIdentityImagesToPurge', () => {
  it('selects decided records older than the retention window', () => {
    const due = selectIdentityImagesToPurge('2026-04-02', [{ id: 'a', ...base }], 90);
    expect(due.map((r) => r.id)).toEqual(['a']);
  });

  it('keeps records inside the window', () => {
    expect(selectIdentityImagesToPurge('2026-03-01', [{ id: 'a', ...base }], 90)).toEqual([]);
  });

  it('skips drafts/pending, already-purged, image-less and unreviewed records', () => {
    const records = [
      { id: 'draft', ...base, verificationStatus: 'draft' as const },
      { id: 'pending', ...base, verificationStatus: 'pending' as const },
      { id: 'purged', ...base, imagesPurgedAt: '2026-02-01T00:00:00.000Z' },
      { id: 'noimages', ...base, selfieFileId: undefined, passportFileId: undefined },
      { id: 'noreview', ...base, reviewedAt: undefined }
    ];
    expect(selectIdentityImagesToPurge('2027-01-01', records, 90)).toEqual([]);
  });

  it('selects rejected records too (purge regardless of decision)', () => {
    const due = selectIdentityImagesToPurge('2027-01-01', [
      { id: 'r', ...base, verificationStatus: 'rejected' as const }
    ]);
    expect(due).toHaveLength(1);
  });
});
