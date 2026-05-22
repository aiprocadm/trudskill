import { describe, expect, it } from 'vitest';

import { pickNextStep } from './next-step';

import type { EnrollmentWithDetails } from './types';
import type { Course, Enrollment, Progress } from '../mvp/types';

const baseEntity = {
  tenantId: 't1',
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z'
};

const buildEnrollment = (
  overrides: Partial<Enrollment> & { id: string; courseId?: string }
): Enrollment => ({
  ...baseEntity,
  groupId: 'g1',
  learnerId: 'L1',
  status: 'active',
  enrolledAt: '2026-05-01T00:00:00.000Z',
  ...overrides
});

const buildCourse = (id: string, title: string): Course => ({
  ...baseEntity,
  id,
  status: 'published',
  code: id,
  title,
  isArchived: false
});

const buildProgress = (
  overrides: Partial<Progress> & {
    id: string;
    status: Progress['status'];
    moduleId: string;
    materialId: string;
  }
): Progress => ({
  ...baseEntity,
  enrollmentId: 'e1',
  courseId: 'c1',
  progressPercent:
    overrides.status === 'completed' ? 100 : overrides.status === 'in_progress' ? 50 : 0,
  ...overrides
});

describe('pickNextStep', () => {
  it('returns null when there are no enrollments', () => {
    expect(pickNextStep([])).toBeNull();
  });

  it('picks continue when an active enrollment has an in-progress material', () => {
    const input: EnrollmentWithDetails[] = [
      {
        enrollment: buildEnrollment({ id: 'e1', status: 'active', courseId: 'c1' }),
        course: buildCourse('c1', 'Охрана труда'),
        progress: [
          buildProgress({ id: 'p1', status: 'completed', moduleId: 'm1', materialId: 'mat1' }),
          buildProgress({ id: 'p2', status: 'in_progress', moduleId: 'm1', materialId: 'mat2' })
        ]
      }
    ];
    const step = pickNextStep(input);
    expect(step?.kind).toBe('continue');
    expect(step?.courseId).toBe('c1');
    expect(step?.courseTitle).toBe('Охрана труда');
    expect(step?.moduleId).toBe('m1');
    expect(step?.materialId).toBe('mat2');
    expect(step?.href).toBe('/learner/courses/c1');
    expect(step?.cta).toBe('Продолжить');
  });

  it('prefers continue over start when both exist', () => {
    const input: EnrollmentWithDetails[] = [
      {
        enrollment: buildEnrollment({ id: 'e1', status: 'active', courseId: 'c1' }),
        course: buildCourse('c1', 'New course'),
        progress: []
      },
      {
        enrollment: buildEnrollment({ id: 'e2', status: 'active', courseId: 'c2' }),
        course: buildCourse('c2', 'Ongoing course'),
        progress: [
          buildProgress({ id: 'p1', status: 'in_progress', moduleId: 'm1', materialId: 'mat1' })
        ]
      }
    ];
    const step = pickNextStep(input);
    expect(step?.kind).toBe('continue');
    expect(step?.courseId).toBe('c2');
  });

  it('returns start when active enrollment has no in-progress material', () => {
    const input: EnrollmentWithDetails[] = [
      {
        enrollment: buildEnrollment({ id: 'e1', status: 'active', courseId: 'c1' }),
        course: buildCourse('c1', 'Пожарная безопасность'),
        progress: []
      }
    ];
    const step = pickNextStep(input);
    expect(step?.kind).toBe('start');
    expect(step?.courseId).toBe('c1');
    expect(step?.cta).toBe('Начать обучение');
    expect(step?.href).toBe('/learner/courses/c1');
  });

  it('returns awaiting_assignment for a pending enrollment', () => {
    const input: EnrollmentWithDetails[] = [
      {
        enrollment: buildEnrollment({ id: 'e1', status: 'pending', courseId: 'c1' }),
        course: buildCourse('c1', 'Электробезопасность'),
        progress: []
      }
    ];
    const step = pickNextStep(input);
    expect(step?.kind).toBe('awaiting_assignment');
  });

  it('returns completed_all when every enrollment is completed', () => {
    const input: EnrollmentWithDetails[] = [
      {
        enrollment: buildEnrollment({ id: 'e1', status: 'completed', courseId: 'c1' }),
        course: buildCourse('c1', 'Done 1'),
        progress: []
      },
      {
        enrollment: buildEnrollment({ id: 'e2', status: 'completed', courseId: 'c2' }),
        course: buildCourse('c2', 'Done 2'),
        progress: []
      }
    ];
    const step = pickNextStep(input);
    expect(step?.kind).toBe('completed_all');
    expect(step?.href).toBe('/learner/courses');
  });

  it('falls back to course title placeholder when course detail is missing', () => {
    const input: EnrollmentWithDetails[] = [
      {
        enrollment: buildEnrollment({ id: 'e1', status: 'active', courseId: 'c1' }),
        course: null,
        progress: [
          buildProgress({ id: 'p1', status: 'in_progress', moduleId: 'm1', materialId: 'mat1' })
        ]
      }
    ];
    const step = pickNextStep(input);
    expect(step?.kind).toBe('continue');
    expect(step?.courseTitle).toBe('Курс c1');
  });

  it('ignores enrollments without a courseId', () => {
    const input: EnrollmentWithDetails[] = [
      {
        enrollment: buildEnrollment({ id: 'e1', status: 'active' }),
        course: null,
        progress: []
      }
    ];
    expect(pickNextStep(input)).toBeNull();
  });
});
