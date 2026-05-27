import { describe, expect, it } from 'vitest';

import { pickRecentDocuments } from './recent-documents';

import type { LearnerDocument } from '../learner-documents/types';

const doc = (overrides: Partial<LearnerDocument> = {}): LearnerDocument => ({
  id: 'd_' + Math.random().toString(36).slice(2, 6),
  documentType: 'certificate',
  name: 'Удостоверение',
  status: 'final',
  enrollmentId: 'enr_1',
  courseTitle: 'Охрана труда',
  downloadUrl: '',
  isDownloadable: false,
  ...overrides
});

describe('pickRecentDocuments', () => {
  it('returns empty array for undefined input', () => {
    expect(pickRecentDocuments(undefined)).toEqual([]);
  });

  it('returns empty array for empty list', () => {
    expect(pickRecentDocuments([])).toEqual([]);
  });

  it('returns first 3 by default (respects backend sort order)', () => {
    const docs = [doc({ id: 'a' }), doc({ id: 'b' }), doc({ id: 'c' }), doc({ id: 'd' })];
    const result = pickRecentDocuments(docs);
    expect(result.map((d) => d.id)).toEqual(['a', 'b', 'c']);
  });

  it('respects custom limit', () => {
    const docs = [doc({ id: 'a' }), doc({ id: 'b' }), doc({ id: 'c' })];
    expect(pickRecentDocuments(docs, 1).map((d) => d.id)).toEqual(['a']);
  });

  it('filters out revoked documents from preview', () => {
    const docs = [doc({ id: 'revoked', status: 'revoked' }), doc({ id: 'final', status: 'final' })];
    const result = pickRecentDocuments(docs);
    expect(result.map((d) => d.id)).toEqual(['final']);
  });

  it('does not mutate input array', () => {
    const docs = [doc({ id: 'a' }), doc({ id: 'b' })];
    const snapshot = [...docs];
    pickRecentDocuments(docs);
    expect(docs).toEqual(snapshot);
  });
});
