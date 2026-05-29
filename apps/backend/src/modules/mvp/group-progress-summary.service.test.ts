import { describe, expect, it } from 'vitest';

import {
  summarizeCounterpartyProgress,
  summarizeGroupProgress
} from './group-progress-summary.service.js';

const ENR_BASE = { groupId: 'g-1' };

describe('summarizeGroupProgress (Phase 2 Plan C Task 5)', () => {
  it('returns empty summary for group with no enrollments and no courses', () => {
    const r = summarizeGroupProgress('g-1', { enrollments: [], groupCourses: [] });
    expect(r.groupId).toBe('g-1');
    expect(r.counterpartyId).toBeUndefined();
    expect(r.totalLearners).toBe(0);
    expect(r.enrollments).toEqual({ total: 0, completed: 0, inProgress: 0, notStarted: 0 });
    expect(r.avgCompletionRate).toBe(0);
    expect(r.perCourse).toEqual([]);
  });

  it('classifies enrollment status into completed/inProgress/notStarted buckets', () => {
    const r = summarizeGroupProgress('g-1', {
      enrollments: [
        { ...ENR_BASE, id: 'e1', learnerId: 'l1', status: 'completed' },
        { ...ENR_BASE, id: 'e2', learnerId: 'l2', status: 'active' },
        { ...ENR_BASE, id: 'e3', learnerId: 'l3', status: 'pending' },
        { ...ENR_BASE, id: 'e4', learnerId: 'l4', status: 'cancelled' }
      ],
      groupCourses: []
    });
    expect(r.enrollments.completed).toBe(1);
    expect(r.enrollments.inProgress).toBe(1);
    expect(r.enrollments.notStarted).toBe(2);
  });

  it('counts unique learners across enrollments (same learner in 2 groups counts once)', () => {
    const r = summarizeGroupProgress('g-1', {
      enrollments: [
        { id: 'e1', groupId: 'g-1', learnerId: 'l1', status: 'completed' },
        { id: 'e2', groupId: 'g-1', learnerId: 'l1', status: 'active' }
      ],
      groupCourses: []
    });
    expect(r.totalLearners).toBe(1);
    expect(r.enrollments.total).toBe(2);
  });

  it('computes avgCompletionRate as completed / total', () => {
    const r = summarizeGroupProgress('g-1', {
      enrollments: [
        { ...ENR_BASE, id: 'e1', learnerId: 'l1', status: 'completed' },
        { ...ENR_BASE, id: 'e2', learnerId: 'l2', status: 'completed' },
        { ...ENR_BASE, id: 'e3', learnerId: 'l3', status: 'active' },
        { ...ENR_BASE, id: 'e4', learnerId: 'l4', status: 'pending' }
      ],
      groupCourses: []
    });
    expect(r.avgCompletionRate).toBeCloseTo(0.5, 5);
  });

  it('aggregates per-course breakdown through groupCourses join', () => {
    const r = summarizeGroupProgress('g-1', {
      enrollments: [
        { ...ENR_BASE, id: 'e1', learnerId: 'l1', status: 'completed' },
        { ...ENR_BASE, id: 'e2', learnerId: 'l2', status: 'completed' },
        { ...ENR_BASE, id: 'e3', learnerId: 'l3', status: 'active' }
      ],
      groupCourses: [
        { groupId: 'g-1', courseId: 'c1' },
        { groupId: 'g-1', courseId: 'c2' }
      ]
    });
    const c1 = r.perCourse.find((p) => p.courseId === 'c1');
    const c2 = r.perCourse.find((p) => p.courseId === 'c2');
    expect(c1).toEqual({ courseId: 'c1', total: 3, completed: 2 });
    expect(c2).toEqual({ courseId: 'c2', total: 3, completed: 2 });
  });

  it('filters out enrollments and groupCourses of other groups', () => {
    const r = summarizeGroupProgress('g-1', {
      enrollments: [
        { id: 'e1', groupId: 'g-1', learnerId: 'l1', status: 'completed' },
        { id: 'e2', groupId: 'g-other', learnerId: 'l2', status: 'completed' }
      ],
      groupCourses: [
        { groupId: 'g-1', courseId: 'c1' },
        { groupId: 'g-other', courseId: 'cZ' }
      ]
    });
    expect(r.enrollments.total).toBe(1);
    expect(r.perCourse).toEqual([{ courseId: 'c1', total: 1, completed: 1 }]);
  });

  it('returns empty perCourse when group has no courses linked', () => {
    const r = summarizeGroupProgress('g-1', {
      enrollments: [{ ...ENR_BASE, id: 'e1', learnerId: 'l1', status: 'completed' }],
      groupCourses: []
    });
    expect(r.perCourse).toEqual([]);
    expect(r.enrollments.completed).toBe(1);
  });
});

describe('summarizeCounterpartyProgress (Phase 2 Plan C Task 5)', () => {
  it('aggregates across multiple groups (caller pre-filters by counterparty)', () => {
    const r = summarizeCounterpartyProgress('cp-1', {
      enrollments: [
        { id: 'e1', groupId: 'g-1', learnerId: 'l1', status: 'completed' },
        { id: 'e2', groupId: 'g-2', learnerId: 'l2', status: 'active' }
      ],
      groupCourses: [
        { groupId: 'g-1', courseId: 'c1' },
        { groupId: 'g-2', courseId: 'c1' }
      ]
    });
    expect(r.counterpartyId).toBe('cp-1');
    expect(r.groupId).toBeUndefined();
    expect(r.enrollments.total).toBe(2);
    expect(r.enrollments.completed).toBe(1);
    expect(r.avgCompletionRate).toBeCloseTo(0.5, 5);
    const c1 = r.perCourse.find((p) => p.courseId === 'c1');
    expect(c1).toEqual({ courseId: 'c1', total: 2, completed: 1 });
  });

  it('treats unknown status as notStarted bucket', () => {
    const r = summarizeCounterpartyProgress('cp-1', {
      enrollments: [
        {
          id: 'e1',
          groupId: 'g-1',
          learnerId: 'l1',
          status: 'unknown-future-status'
        }
      ],
      groupCourses: []
    });
    expect(r.enrollments.notStarted).toBe(1);
    expect(r.enrollments.completed).toBe(0);
    expect(r.enrollments.inProgress).toBe(0);
  });
});
