import { describe, expect, it } from 'vitest';

import {
  PROCTORING_STATUS_LABELS,
  chunkIssueLabel,
  formatDateShort,
  formatProctoringStatus
} from './format';

describe('PROCTORING_STATUS_LABELS', () => {
  it('has Russian label for recording', () => {
    expect(PROCTORING_STATUS_LABELS.recording).toBe('Идёт запись');
  });
  it('has Russian label for completed', () => {
    expect(PROCTORING_STATUS_LABELS.completed).toBe('Завершена');
  });
});

describe('formatProctoringStatus', () => {
  it('returns mapped label for known status', () => {
    expect(formatProctoringStatus('recording')).toBe('Идёт запись');
    expect(formatProctoringStatus('completed')).toBe('Завершена');
  });
  it('passes through unknown status unchanged', () => {
    expect(formatProctoringStatus('unknown_status')).toBe('unknown_status');
  });
});

describe('formatDateShort', () => {
  it('returns «—» for undefined', () => {
    expect(formatDateShort(undefined)).toBe('—');
  });
  it('returns «—» for invalid date string', () => {
    expect(formatDateShort('not-a-date')).toBe('—');
  });
  it('returns non-dash string for valid ISO date', () => {
    const result = formatDateShort('2026-06-15T00:00:00.000Z');
    expect(result).not.toBe('—');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('chunkIssueLabel', () => {
  it('labels a missing chunk as a recording gap (разрыв)', () => {
    const label = chunkIssueLabel({ sequence: 1, code: 'missing_chunk' });
    expect(label).toContain('Фрагмент 2');
    expect(label).toContain('разрыв');
  });
  it('labels an infected chunk as antivirus-blocked', () => {
    const label = chunkIssueLabel({ sequence: 0, code: 'file_infected' });
    expect(label).toContain('Фрагмент 1');
    expect(label).toContain('антивирус');
  });
  it('labels a scan-failed chunk as antivirus-blocked', () => {
    const label = chunkIssueLabel({ sequence: 2, code: 'file_scan_failed' });
    expect(label).toContain('Фрагмент 3');
    expect(label).toContain('антивирус');
  });
  it('falls back to a generic label for unknown codes', () => {
    const label = chunkIssueLabel({ sequence: 4, code: 'file_error' });
    expect(label).toBe('Фрагмент 5: недоступен');
  });
});
