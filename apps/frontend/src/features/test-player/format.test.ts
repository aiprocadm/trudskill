import { describe, expect, it } from 'vitest';

import {
  detectStartGate,
  formatAttemptsLeft,
  formatLearnerTestStatus,
  formatScoreLine,
  formatTimeRemaining,
  remainingMsFromExpiry
} from './format';

describe('test-player format', () => {
  it('maps RU status labels', () => {
    expect(formatLearnerTestStatus('passed')).toBe('Пройден');
    expect(formatLearnerTestStatus('not_started')).toBe('Не начат');
    expect(formatLearnerTestStatus('submitted')).toBe('На проверке');
  });
  it('formats attempts left, clamped at 0', () => {
    expect(formatAttemptsLeft(1, 3)).toBe('Осталось попыток: 2 из 3');
    expect(formatAttemptsLeft(5, 3)).toBe('Осталось попыток: 0 из 3');
  });
  it('formats mm:ss and clamps negatives', () => {
    expect(formatTimeRemaining(65000)).toBe('01:05');
    expect(formatTimeRemaining(-1)).toBe('00:00');
  });
  it('computes remaining ms or null without expiry', () => {
    expect(remainingMsFromExpiry(undefined, 0)).toBeNull();
    expect(remainingMsFromExpiry(new Date(1000).toISOString(), 0)).toBe(1000);
  });
  it('formats score line', () => {
    expect(formatScoreLine(4, 5)).toBe('4 / 5');
    expect(formatScoreLine(undefined, 5)).toBe('0 / 5');
  });
});

describe('detectStartGate (start-attempt interstitial routing)', () => {
  it('detects the Wave 1 pre-exam-auth gate by message', () => {
    expect(detectStartGate('Identity verification is required before starting this exam')).toBe(
      'pre_exam_auth'
    );
    expect(detectStartGate('pre_exam_auth_required')).toBe('pre_exam_auth');
  });

  it('detects the Plan A identity gate by its non-colliding message', () => {
    expect(
      detectStartGate('Identity confirmation by document is required before starting this exam')
    ).toBe('identity_verification');
    expect(detectStartGate('identity_verification_required')).toBe('identity_verification');
  });

  it('detects the Plan B proctoring gate by its non-colliding message', () => {
    expect(detectStartGate('Video recording must be active before starting this exam')).toBe(
      'proctoring'
    );
    expect(detectStartGate('proctoring_required')).toBe('proctoring');
  });

  it('returns null for other errors and empty input', () => {
    expect(detectStartGate('Attempt limit reached')).toBeNull();
    expect(detectStartGate(null)).toBeNull();
    expect(detectStartGate(undefined)).toBeNull();
  });
});
