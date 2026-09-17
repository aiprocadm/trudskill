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

/**
 * Подпись про попытки по состоянию теста (ТЗ 5.2 / Э2).
 *
 * Начатая попытка считается использованной, поэтому у теста с одной попыткой человек видел
 * «Осталось попыток: 0 из 1» рядом с кнопкой «Продолжить» — цифра говорила «всё», кнопка —
 * «нет». Пока попытка не завершена, подпись говорит именно это.
 */
export function attemptsCaption(
  test: Pick<LearnerTestSummary, 'attemptsUsed' | 'attemptLimit' | 'activeAttemptId'>
): string {
  if (test.activeAttemptId) return 'Попытка начата и не завершена — продолжите её';
  return formatAttemptsLeft(test.attemptsUsed, test.attemptLimit);
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

export type StartGateKind = 'pre_exam_auth' | 'identity_verification' | 'proctoring' | null;

/**
 * Routes a failed startAttempt error to the right interstitial. useStartAttempt exposes
 * err.message (the backend English message), so the regexes match messages; the codes are
 * kept in the alternation as future-proofing. The three backend gate messages are designed
 * to be mutually non-colliding (asserted by backend tests), so order is mostly cosmetic —
 * most specific first.
 */
export function detectStartGate(error: string | null | undefined): StartGateKind {
  const text = error ?? '';
  if (/identity_verification_required|identity confirmation by document/i.test(text)) {
    return 'identity_verification';
  }
  if (/proctoring_required|video recording must be active/i.test(text)) {
    return 'proctoring';
  }
  if (/pre_exam_auth_required|identity verification is required/i.test(text)) {
    return 'pre_exam_auth';
  }
  return null;
}
