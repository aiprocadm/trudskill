import type { LearnerTestSummary } from './types';

export const LEARNER_TEST_STATUS_LABEL: Record<LearnerTestSummary['status'], string> = {
  not_started: 'Не начат',
  in_progress: 'В процессе',
  submitted: 'На проверке',
  passed: 'Пройден',
  failed: 'Не пройден'
};

export function formatLearnerTestStatus(status: LearnerTestSummary['status']): string {
  return LEARNER_TEST_STATUS_LABEL[status] ?? status;
}

export function formatAttemptsLeft(used: number, limit: number): string {
  const left = Math.max(0, limit - used);
  return `Осталось попыток: ${left} из ${limit}`;
}

/** ms → "MM:SS"; clamps negatives to 00:00. */
export function formatTimeRemaining(msRemaining: number): string {
  const total = Math.max(0, Math.floor(msRemaining / 1000));
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

/** Remaining ms from an ISO expiry vs a now-ms; undefined expiry ⇒ null (no timer). */
export function remainingMsFromExpiry(expiresAt: string | undefined, nowMs: number): number | null {
  if (!expiresAt) return null;
  return new Date(expiresAt).getTime() - nowMs;
}

export function formatScoreLine(score: number | undefined, maxScore: number): string {
  return `${score ?? 0} / ${maxScore}`;
}
