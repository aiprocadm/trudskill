import { describe, expect, it } from 'vitest';

import { computeAnalyticsDashboard } from './analytics-dashboard.js';

import type { Course, Enrollment, ExamResult, GroupCourse, GroupEntity } from './mvp.types.js';

const base = { tenantId: 't1', status: 'active', createdAt: '2026-01-01T00:00:00.000Z' };

function enrollment(p: Partial<Enrollment> & { id: string }): Enrollment {
  return {
    ...base,
    groupId: 'g1',
    learnerId: 'l1',
    status: 'active',
    enrolledAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...p
  } as Enrollment;
}
function examResult(p: Partial<ExamResult> & { id: string }): ExamResult {
  return {
    ...base,
    updatedAt: '2026-01-01T00:00:00.000Z',
    testId: 'tst1',
    enrollmentId: 'e1',
    learnerId: 'l1',
    attemptsCount: 1,
    maxScore: 100,
    passed: true,
    ...p
  } as ExamResult;
}

const groups: GroupEntity[] = [
  {
    ...base,
    updatedAt: base.createdAt,
    id: 'g1',
    code: 'G1',
    name: 'Группа 1',
    counterpartyId: 'c1'
  },
  { ...base, updatedAt: base.createdAt, id: 'g2', code: 'G2', name: 'Группа 2' }
];
const courses: Course[] = [
  { ...base, updatedAt: base.createdAt, id: 'crs1', code: 'C1', title: 'Курс 1', isArchived: false }
];
const groupCourses: GroupCourse[] = [
  { ...base, updatedAt: base.createdAt, id: 'gc1', groupId: 'g1', courseId: 'crs1', sortOrder: 0 }
];
const tests = [{ ...base, updatedAt: base.createdAt, id: 'tst1', courseId: 'crs1' }] as never[];

describe('computeAnalyticsDashboard', () => {
  it('computes completion rate, pass rate and attempt distribution', () => {
    const enrollments = [
      enrollment({
        id: 'e1',
        status: 'completed',
        enrolledAt: '2026-01-01T00:00:00.000Z',
        completedAt: '2026-01-11T00:00:00.000Z'
      }),
      enrollment({ id: 'e2', status: 'active' })
    ];
    const examResults = [
      examResult({ id: 'x1', enrollmentId: 'e1', attemptsCount: 1, passed: true, bestScore: 80 }),
      examResult({ id: 'x2', enrollmentId: 'e2', attemptsCount: 3, passed: false, bestScore: 40 })
    ];
    const out = computeAnalyticsDashboard({
      enrollments,
      examResults,
      groups,
      groupCourses,
      courses,
      tests,
      asOf: '2026-02-01T00:00:00.000Z',
      dropOffThresholdDays: 14,
      scope: {}
    });
    expect(out.enrollmentsTotal).toBe(2);
    expect(out.enrollmentsCompleted).toBe(1);
    expect(out.completionRate).toBeCloseTo(0.5);
    expect(out.examResultsTotal).toBe(2);
    expect(out.examResultsPassed).toBe(1);
    expect(out.examPassRate).toBeCloseTo(0.5);
    expect(out.averageCompletionDays).toBeCloseTo(10);
    expect(out.averageScorePercent).toBeCloseTo(0.6); // (0.8 + 0.4) / 2
    expect(out.attemptDistribution).toEqual({
      passedFirstAttempt: 1,
      passedSecondAttempt: 0,
      passedThirdPlusAttempt: 0
    });
  });

  it('counts drop-off: active enrollments stale beyond threshold', () => {
    const enrollments = [
      enrollment({ id: 'e1', status: 'active', updatedAt: '2026-01-01T00:00:00.000Z' }), // stale
      enrollment({ id: 'e2', status: 'active', updatedAt: '2026-01-30T00:00:00.000Z' }), // fresh
      enrollment({ id: 'e3', status: 'completed', updatedAt: '2026-01-01T00:00:00.000Z' }) // not active
    ];
    const out = computeAnalyticsDashboard({
      enrollments,
      examResults: [],
      groups,
      groupCourses,
      courses,
      tests,
      asOf: '2026-02-01T00:00:00.000Z',
      dropOffThresholdDays: 14,
      scope: {}
    });
    expect(out.dropOffCount).toBe(1);
    expect(out.dropOffThresholdDays).toBe(14);
  });

  it('filters by clientId via group.counterpartyId', () => {
    const enrollments = [
      enrollment({ id: 'e1', groupId: 'g1' }), // counterparty c1
      enrollment({ id: 'e2', groupId: 'g2' }) // no counterparty
    ];
    const out = computeAnalyticsDashboard({
      enrollments,
      examResults: [],
      groups,
      groupCourses,
      courses,
      tests,
      asOf: '2026-02-01T00:00:00.000Z',
      dropOffThresholdDays: 14,
      scope: { clientId: 'c1' }
    });
    expect(out.enrollmentsTotal).toBe(1);
    expect(out.scope.clientId).toBe('c1');
  });

  it('produces byCourse and byGroup breakdown rows with labels', () => {
    const enrollments = [
      enrollment({ id: 'e1', groupId: 'g1', status: 'completed' }),
      enrollment({ id: 'e2', groupId: 'g1', status: 'active' })
    ];
    const out = computeAnalyticsDashboard({
      enrollments,
      examResults: [],
      groups,
      groupCourses,
      courses,
      tests,
      asOf: '2026-02-01T00:00:00.000Z',
      dropOffThresholdDays: 14,
      scope: {}
    });
    const courseRow = out.byCourse.find((r) => r.key === 'crs1');
    expect(courseRow?.label).toBe('Курс 1');
    expect(courseRow?.enrollmentsTotal).toBe(2);
    expect(courseRow?.completionRate).toBeCloseTo(0.5);
    const groupRow = out.byGroup.find((r) => r.key === 'g1');
    expect(groupRow?.label).toBe('Группа 1');
    expect(groupRow?.enrollmentsTotal).toBe(2);
  });
});
