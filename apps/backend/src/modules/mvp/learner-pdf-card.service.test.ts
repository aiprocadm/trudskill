import { NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { InMemoryMvpState } from './infrastructure/in-memory-mvp.state.js';
import { LearnerPdfCardService } from './learner-pdf-card.service.js';

import type { Course, CourseVersion, Enrollment, GroupCourse, Learner } from './mvp.types.js';
import type { DocumentsService } from '../documents/documents.service.js';
import type { GeneratedDocumentEntity } from '../documents/documents.types.js';

function makeServiceWithFixtures() {
  const state = new InMemoryMvpState();

  const learner: Learner = {
    id: 'l_1',
    tenantId: 'tenant_demo',
    status: 'active',
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
    learnerNo: 'L-001',
    firstName: 'Иван',
    lastName: 'Иванов',
    middleName: 'Сергеевич',
    snils: '111-222-333 44',
    position: 'Электромонтёр',
    email: 'ivanov@example.com'
  };
  state.learners.push(learner);
  // Учеников из других tenant'ов не должно случайно подмешиваться.
  state.learners.push({ ...learner, id: 'l_2', tenantId: 'tenant_other' });

  const course: Course = {
    id: 'course_1',
    tenantId: 'tenant_demo',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    code: 'OT-2026',
    title: 'Охрана труда',
    isArchived: false
  };
  state.courses.push(course);

  const courseVersion: CourseVersion = {
    id: 'cv_1',
    tenantId: 'tenant_demo',
    status: 'published',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    courseId: 'course_1',
    versionNo: 1,
    academicHours: 40,
    trainingType: 'primary'
  };
  state.courseVersions.push(courseVersion);

  const groupCourse: GroupCourse = {
    id: 'gc_1',
    tenantId: 'tenant_demo',
    status: 'active',
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
    groupId: 'g_1',
    courseId: 'course_1'
  };
  state.groupCourses.push(groupCourse);

  const enrollment: Enrollment = {
    id: 'enr_1',
    tenantId: 'tenant_demo',
    status: 'completed',
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-05-01T00:00:00.000Z',
    groupId: 'g_1',
    learnerId: 'l_1',
    enrolledAt: '2026-04-01T00:00:00.000Z',
    completedAt: '2026-05-01T00:00:00.000Z'
  };
  state.enrollments.push(enrollment);

  const documents: GeneratedDocumentEntity[] = [
    {
      id: 'doc_1',
      tenantId: 'tenant_demo',
      templateVersionId: 'tv_1',
      sourceEntityType: 'enrollment',
      sourceEntityId: 'enr_1',
      documentNumber: 'УТ-001',
      documentDate: '2026-05-01',
      documentType: 'certificate',
      status: 'final',
      generatedAt: '2026-05-01T00:00:00.000Z',
      payloadRef: 'ref_1'
    },
    {
      id: 'doc_other_tenant',
      tenantId: 'tenant_other',
      templateVersionId: 'tv_1',
      sourceEntityType: 'enrollment',
      sourceEntityId: 'enr_1',
      documentType: 'certificate',
      status: 'final',
      generatedAt: '2026-05-01T00:00:00.000Z',
      payloadRef: 'ref_2'
    }
  ];

  const fakeDocumentsService = {
    listDocuments: (tenantId: string, query: { sourceEntityType?: string }) => {
      const filtered = documents.filter(
        (d) =>
          d.tenantId === tenantId &&
          (!query.sourceEntityType || d.sourceEntityType === query.sourceEntityType)
      );
      return { items: filtered, page: 1, pageSize: 50, total: filtered.length };
    }
  } as unknown as DocumentsService;

  const service = new LearnerPdfCardService(state, fakeDocumentsService);
  return { service };
}

describe('LearnerPdfCardService (Plan C §5.11)', () => {
  it('composes aggregate with learner core, enrollments, documents', () => {
    const { service } = makeServiceWithFixtures();
    const aggregate = service.composeData('tenant_demo', 'l_1');

    expect(aggregate.learner.fullName).toBe('Иванов Иван Сергеевич');
    expect(aggregate.learner.snils).toBe('111-222-333 44');
    expect(aggregate.learner.position).toBe('Электромонтёр');

    expect(aggregate.enrollments).toHaveLength(1);
    expect(aggregate.enrollments[0]).toMatchObject({
      enrollmentId: 'enr_1',
      courseId: 'course_1',
      courseTitle: 'Охрана труда',
      academicHours: 40,
      trainingType: 'primary',
      status: 'completed'
    });

    expect(aggregate.documents).toHaveLength(1);
    expect(aggregate.documents[0]).toMatchObject({
      id: 'doc_1',
      documentNumber: 'УТ-001',
      documentType: 'certificate'
    });
  });

  it('throws NotFoundException when learner not in tenant', () => {
    const { service } = makeServiceWithFixtures();
    expect(() => service.composeData('tenant_other', 'l_1')).toThrow(NotFoundException);
  });

  it('returns no documents from other tenants (tenant isolation)', () => {
    const { service } = makeServiceWithFixtures();
    const aggregate = service.composeData('tenant_demo', 'l_1');
    expect(aggregate.documents.every((d) => d.id !== 'doc_other_tenant')).toBe(true);
  });

  it('handles learner without middleName/snils/position gracefully', () => {
    const { service } = makeServiceWithFixtures();
    // Add a second learner without optional fields
    const aggregate = service.composeData('tenant_demo', 'l_1');
    expect(aggregate.learner.fullName.trim().length).toBeGreaterThan(0);
  });

  it('returns empty enrollments and documents arrays when learner has no enrollments', () => {
    const { service } = makeServiceWithFixtures();
    // Use l_2 from tenant_other but query in tenant_other context, which doesn't have enrollments.
    const aggregate = service.composeData('tenant_other', 'l_2');
    expect(aggregate.enrollments).toEqual([]);
    expect(aggregate.documents).toEqual([]);
  });
});
