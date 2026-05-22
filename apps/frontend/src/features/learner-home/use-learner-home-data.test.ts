import { describe, expect, it } from 'vitest';

import { assembleHomeData } from './use-learner-home-data';

import type { Course, Enrollment, Progress } from '../mvp/types';

const baseEntity = {
  tenantId: 't1',
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z'
};

const enroll = (id: string, courseId?: string): Enrollment => ({
  ...baseEntity,
  id,
  status: 'active',
  groupId: 'g1',
  learnerId: 'L1',
  enrolledAt: '2026-05-01T00:00:00.000Z',
  ...(courseId ? { courseId } : {})
});

const course = (id: string): Course => ({
  ...baseEntity,
  id,
  status: 'published',
  code: id,
  title: `Course ${id}`,
  isArchived: false
});

const progress = (id: string, enrollmentId: string, courseId: string): Progress => ({
  ...baseEntity,
  id,
  enrollmentId,
  courseId,
  moduleId: 'm1',
  materialId: 'mat1',
  progressPercent: 50,
  status: 'in_progress'
});

describe('assembleHomeData', () => {
  it('joins enrollments with course detail and progress, indexed by courseId', () => {
    const result = assembleHomeData({
      enrollments: [enroll('e1', 'c1'), enroll('e2', 'c2')],
      coursesByCourseId: { c1: course('c1'), c2: course('c2') },
      progressByCourseId: {
        c1: [progress('p1', 'e1', 'c1')],
        c2: []
      }
    });

    expect(result).toHaveLength(2);
    expect(result[0]?.enrollment.id).toBe('e1');
    expect(result[0]?.course?.title).toBe('Course c1');
    expect(result[0]?.progress).toHaveLength(1);
    expect(result[1]?.progress).toEqual([]);
  });

  it('returns null course when not available, keeping enrollment in the list', () => {
    const result = assembleHomeData({
      enrollments: [enroll('e1', 'c1')],
      coursesByCourseId: {},
      progressByCourseId: { c1: [] }
    });
    expect(result[0]?.course).toBeNull();
  });

  it('preserves enrollments without a courseId with empty progress and null course', () => {
    const result = assembleHomeData({
      enrollments: [enroll('e1')],
      coursesByCourseId: {},
      progressByCourseId: {}
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.progress).toEqual([]);
    expect(result[0]?.course).toBeNull();
  });
});
