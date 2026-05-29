import type {
  AssignmentSubmission,
  ReviewerQueueItem,
  ReviewerQueueSnapshot,
  TestAttempt
} from './mvp.types.js';

/**
 * Phase 3 Plan A: pure-function aggregator для reviewer queue.
 *
 * Plan A — read-only skeleton. Scoring actions (grade essay, finalize) — Plan C.
 *
 * Invariants:
 *  - tenant-scoped: возвращает только items с matching `tenantId`.
 *  - status filter: для attempts — `submitted` (есть, что проверять; finished/expired не нужны);
 *    для submissions — `submitted` или `under_review` (открытые позиции в очереди).
 *  - pure: нет state, нет I/O, deterministic. Тест-фрэндли + переиспользуема в Plans B+C.
 */
export interface ReviewerQueueFilter {
  tenantId: string;
  /** Если задан — фильтрует items под конкретного ревьюера (Plan C расширит). */
  reviewerId?: string;
}

export interface ReviewerQueueInputSnapshot {
  testAttempts: TestAttempt[];
  assignmentSubmissions: AssignmentSubmission[];
}

export function aggregateReviewerQueue(
  snapshot: ReviewerQueueInputSnapshot,
  filter: ReviewerQueueFilter
): ReviewerQueueSnapshot {
  const pendingAttempts: ReviewerQueueItem[] = snapshot.testAttempts
    .filter((a) => a.tenantId === filter.tenantId && a.status === 'submitted')
    .map((a) => ({
      kind: 'attempt' as const,
      id: a.id,
      tenantId: a.tenantId,
      learnerId: a.learnerId,
      testId: a.testId,
      submittedAt: a.submittedAt ?? a.createdAt
    }));

  const pendingSubmissions: ReviewerQueueItem[] = snapshot.assignmentSubmissions
    .filter(
      (s) =>
        s.tenantId === filter.tenantId && (s.status === 'submitted' || s.status === 'under_review')
    )
    .map((s) => ({
      kind: 'submission' as const,
      id: s.id,
      tenantId: s.tenantId,
      learnerId: s.learnerId,
      assignmentId: s.assignmentId,
      submittedAt: s.submittedAt ?? s.createdAt
    }));

  return { pendingAttempts, pendingSubmissions };
}
