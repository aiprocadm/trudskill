import { describe, expect, it } from 'vitest';
import type { Enrollment, Progress } from './types';

describe('mvp domain typings', () => {
  it('accepts enrollment statuses used in learner cabinet', () => {
    const enrollment: Enrollment = {
      id: 'e1',
      tenantId: 't1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      groupId: 'g1',
      learnerId: 'l1',
      status: 'active',
      enrolledAt: new Date().toISOString()
    };
    expect(enrollment.status).toBe('active');
  });

  it('accepts progress statuses for continue CTA', () => {
    const progress: Progress = {
      id: 'p1',
      tenantId: 't1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      enrollmentId: 'e1',
      courseId: 'c1',
      moduleId: 'm1',
      materialId: 'mat1',
      progressPercent: 50,
      status: 'in_progress'
    };
    expect(progress.status).toBe('in_progress');
  });
});
