import { describe, expect, it } from 'vitest';

import { IDENTITY_STATUS_LABELS, formatDateShort, formatIdentityStatus } from './format';

describe('IDENTITY_STATUS_LABELS', () => {
  it('has Russian label for draft', () => {
    expect(IDENTITY_STATUS_LABELS.draft).toBe('Черновик');
  });
  it('has Russian label for pending', () => {
    expect(IDENTITY_STATUS_LABELS.pending).toBe('На проверке');
  });
  it('has Russian label for approved', () => {
    expect(IDENTITY_STATUS_LABELS.approved).toBe('Подтверждена');
  });
  it('has Russian label for rejected', () => {
    expect(IDENTITY_STATUS_LABELS.rejected).toBe('Отклонена');
  });
});

describe('formatIdentityStatus', () => {
  it('returns mapped label for known status', () => {
    expect(formatIdentityStatus('pending')).toBe('На проверке');
    expect(formatIdentityStatus('approved')).toBe('Подтверждена');
  });
  it('passes through unknown status unchanged', () => {
    expect(formatIdentityStatus('unknown_status')).toBe('unknown_status');
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
  it('returns non-dash string for YYYY-MM-DD format', () => {
    const result = formatDateShort('2026-01-01');
    expect(result).not.toBe('—');
  });
});
