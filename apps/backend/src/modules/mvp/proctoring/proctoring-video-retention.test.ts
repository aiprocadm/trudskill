import { describe, expect, it } from 'vitest';

import { selectProctoringRecordingsToPurge } from './proctoring-video-retention.js';

const chunk = (sequence: number) => ({
  sequence,
  fileId: `f_${sequence}`,
  uploadedIntentAt: '2026-01-01T10:00:30.000Z'
});

const base = {
  startedAt: '2026-01-01T10:00:00.000Z',
  completedAt: '2026-01-01T11:00:00.000Z',
  chunks: [chunk(0), chunk(1)]
};

describe('selectProctoringRecordingsToPurge', () => {
  it('selects recordings whose completedAt is older than the 365-day window', () => {
    const due = selectProctoringRecordingsToPurge('2027-01-02', [{ id: 'a', ...base }]);
    expect(due.map((r) => r.id)).toEqual(['a']);
  });

  it('keeps recordings inside the window', () => {
    expect(selectProctoringRecordingsToPurge('2026-12-31', [{ id: 'a', ...base }])).toEqual([]);
  });

  it("ages out abandoned 'recording' sessions from startedAt (no status filter — unlike identity)", () => {
    const abandoned = { id: 'b', startedAt: '2026-01-01T10:00:00.000Z', chunks: [chunk(0)] };
    expect(selectProctoringRecordingsToPurge('2027-01-02', [abandoned])).toHaveLength(1);
    expect(selectProctoringRecordingsToPurge('2026-06-01', [abandoned])).toEqual([]);
  });

  it('skips already-purged and chunkless recordings', () => {
    const records = [
      { id: 'purged', ...base, purgedAt: '2027-01-05T00:00:00.000Z' },
      { id: 'nochunks', ...base, chunks: [] }
    ];
    expect(selectProctoringRecordingsToPurge('2028-01-01', records)).toEqual([]);
  });

  it('honours a custom retentionDays', () => {
    expect(
      selectProctoringRecordingsToPurge('2026-02-01', [{ id: 'a', ...base }], 30)
    ).toHaveLength(1);
  });
});
