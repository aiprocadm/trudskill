import { describe, expect, it } from 'vitest';

import type { LearnerPdfCardAggregate } from './types';

describe('LearnerPdfCardAggregate type (Plan C §5.11)', () => {
  it('compile-time: required fields present', () => {
    const aggregate: LearnerPdfCardAggregate = {
      learner: {
        id: 'l_1',
        fullName: 'Иванов Иван'
      },
      enrollments: [],
      documents: []
    };
    expect(aggregate.learner.id).toBe('l_1');
    expect(aggregate.enrollments).toHaveLength(0);
    expect(aggregate.documents).toHaveLength(0);
  });

  it('accepts optional snils/position/middleName/learnerNo/email', () => {
    const aggregate: LearnerPdfCardAggregate = {
      learner: {
        id: 'l_1',
        learnerNo: 'L-001',
        fullName: 'Иванов Иван Сергеевич',
        snils: '111-222-333 44',
        position: 'Электромонтёр',
        email: 'ivanov@example.com'
      },
      enrollments: [
        {
          enrollmentId: 'enr_1',
          courseId: 'c1',
          courseTitle: 'Охрана труда',
          courseVersionId: 'cv1',
          academicHours: 40,
          trainingType: 'primary',
          enrolledAt: '2026-04-01T00:00:00.000Z',
          completedAt: '2026-05-01T00:00:00.000Z',
          status: 'completed'
        }
      ],
      documents: [
        {
          id: 'd1',
          documentNumber: 'УТ-001',
          documentDate: '2026-05-01',
          documentType: 'certificate',
          status: 'final'
        }
      ]
    };
    expect(aggregate.learner.snils).toBe('111-222-333 44');
    expect(aggregate.enrollments[0]?.academicHours).toBe(40);
    expect(aggregate.documents[0]?.documentType).toBe('certificate');
  });
});
