import 'reflect-metadata';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { describe, expect, it } from 'vitest';

import { InMemoryMvpState } from './infrastructure/in-memory-mvp.state.js';
import { MvpController } from './mvp.controller.js';
import { MvpService } from './mvp.service.js';
import { TenantScopedRepository } from '../../infrastructure/database/tenant-repository.js';
import { AuditService } from '../audit/audit.service.js';
import { REQUIRED_PERMISSIONS } from '../iam/permission.decorator.js';

import type { LearnerPdfCardService } from './learner-pdf-card.service.js';
import type { MvpBulkEnqueueService } from './mvp-bulk-enqueue.service.js';
import type { Course, Enrollment, GroupCourse, Learner } from './mvp.types.js';
import type { RequestContext } from '../../common/context/request-context.js';
import type { DocumentsService } from '../documents/documents.service.js';
import type { GeneratedDocumentEntity } from '../documents/documents.types.js';
import type { FilesService } from '../files/files.service.js';

const TENANT = 'tenant_demo';

const ctx = (overrides: Partial<RequestContext> = {}): RequestContext => ({
  requestId: 'r1',
  correlationId: 'c1',
  ip: '127.0.0.1',
  userAgent: 'vitest',
  tenantId: TENANT,
  userId: 'u_alice',
  ...overrides
});

function makeController(documents: GeneratedDocumentEntity[]) {
  const state = new InMemoryMvpState();

  state.learners.push(
    {
      id: 'l_alice',
      tenantId: TENANT,
      status: 'active',
      createdAt: '2026-04-01T00:00:00.000Z',
      updatedAt: '2026-04-01T00:00:00.000Z',
      firstName: 'Alice',
      lastName: 'A',
      linkedIamUserId: 'u_alice'
    } as Learner,
    {
      id: 'l_bob',
      tenantId: TENANT,
      status: 'active',
      createdAt: '2026-04-01T00:00:00.000Z',
      updatedAt: '2026-04-01T00:00:00.000Z',
      firstName: 'Bob',
      lastName: 'B',
      linkedIamUserId: 'u_bob'
    } as Learner
  );

  state.courses.push({
    id: 'course_1',
    tenantId: TENANT,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    code: 'OT',
    title: 'Охрана труда',
    isArchived: false
  } as Course);

  state.groupCourses.push({
    id: 'gc_1',
    tenantId: TENANT,
    status: 'active',
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
    groupId: 'g_1',
    courseId: 'course_1'
  } as GroupCourse);

  state.enrollments.push(
    {
      id: 'enr_alice',
      tenantId: TENANT,
      status: 'completed',
      createdAt: '2026-04-01T00:00:00.000Z',
      updatedAt: '2026-05-10T00:00:00.000Z',
      groupId: 'g_1',
      learnerId: 'l_alice',
      enrolledAt: '2026-04-01T00:00:00.000Z',
      completedAt: '2026-05-10T00:00:00.000Z'
    } as Enrollment,
    {
      id: 'enr_bob',
      tenantId: TENANT,
      status: 'completed',
      createdAt: '2026-04-01T00:00:00.000Z',
      updatedAt: '2026-05-10T00:00:00.000Z',
      groupId: 'g_1',
      learnerId: 'l_bob',
      enrolledAt: '2026-04-01T00:00:00.000Z',
      completedAt: '2026-05-10T00:00:00.000Z'
    } as Enrollment
  );

  const fakeDocumentsService = {
    listDocuments: (
      tenantId: string,
      query: { sourceEntityType?: string; sourceEntityId?: string }
    ) => {
      const filtered = documents.filter(
        (d) =>
          d.tenantId === tenantId &&
          (!query.sourceEntityType || d.sourceEntityType === query.sourceEntityType) &&
          (!query.sourceEntityId || d.sourceEntityId === query.sourceEntityId)
      );
      return { items: filtered, page: 1, pageSize: 1000, total: filtered.length };
    }
  } as unknown as DocumentsService;

  const noopFilesService = { ensureMaterialLink: async () => undefined } as unknown as FilesService;
  const service = new MvpService(
    state,
    new TenantScopedRepository(),
    new AuditService(),
    fakeDocumentsService,
    noopFilesService,
    new EventEmitter2()
  );

  // Контроллер не зовёт две другие зависимости в новых маршрутах — даём заглушки.
  const stubBulkEnqueue = {} as unknown as MvpBulkEnqueueService;
  const stubLearnerPdfCard = {} as unknown as LearnerPdfCardService;
  const controller = new MvpController(service, stubBulkEnqueue, stubLearnerPdfCard);

  return { controller, service, state };
}

function makeDoc(overrides: Partial<GeneratedDocumentEntity>): GeneratedDocumentEntity {
  return {
    id: 'gdoc_' + Math.random().toString(36).slice(2, 8),
    tenantId: TENANT,
    templateId: 't_certificate',
    templateVersionId: 'tv_1',
    documentType: 'certificate',
    name: 'Удостоверение',
    sourceEntityType: 'enrollment',
    sourceEntityId: 'enr_alice',
    fileId: '',
    status: 'generated',
    documentNumber: 'СТ-001',
    documentDate: '2026-05-10',
    isFinal: false,
    generatedAt: '2026-05-10T12:00:00.000Z',
    ...overrides
  };
}

describe('MvpController — learner documents endpoints (Phase 1 §4.3)', () => {
  it('GET /me/documents возвращает только документы привязанных учащихся', () => {
    const docs = [
      makeDoc({ id: 'd_alice', sourceEntityId: 'enr_alice' }),
      makeDoc({ id: 'd_bob', sourceEntityId: 'enr_bob' })
    ];
    const { controller } = makeController(docs);
    const result = controller.listMyDocuments(ctx({ userId: 'u_alice' }));
    expect(result.items.map((d) => d.id)).toEqual(['d_alice']);
    expect(result.items[0].courseTitle).toBe('Охрана труда');
    expect(result.items[0].courseId).toBe('course_1');
  });

  it('GET /me/documents возвращает пустой items для актора без linkedIamUserId', () => {
    const { controller } = makeController([makeDoc({})]);
    const result = controller.listMyDocuments(ctx({ userId: 'u_no_link' }));
    expect(result.items).toEqual([]);
  });

  it('GET /enrollments/:id/documents проксирует actorId и permissions в service', () => {
    const docs = [makeDoc({ id: 'd_alice' })];
    const { controller } = makeController(docs);
    const result = controller.listEnrollmentDocuments(
      ctx({ userId: 'u_alice', permissions: ['enrollments.read'] }),
      'enr_alice'
    );
    expect(result.items.map((d) => d.id)).toEqual(['d_alice']);
  });

  it('GET /enrollments/:id/documents падает 403, когда актор пытается смотреть чужое зачисление', () => {
    const docs = [makeDoc({ id: 'd_bob', sourceEntityId: 'enr_bob' })];
    const { controller } = makeController(docs);
    expect(() =>
      controller.listEnrollmentDocuments(
        ctx({ userId: 'u_alice', permissions: ['enrollments.read'] }),
        'enr_bob'
      )
    ).toThrow(/forbidden|Access denied/i);
  });
});

describe('MvpController — permission metadata wiring', () => {
  // Reflect-метаданные гарантируют, что @RequirePermissions реально навешан на метод.
  // Если кто-то случайно удалит декоратор — этот тест упадёт, в отличие от unit-тестов сервиса.

  it('listMyDocuments требует enrollments.read', () => {
    const required = Reflect.getMetadata(
      REQUIRED_PERMISSIONS,
      MvpController.prototype.listMyDocuments
    );
    expect(required).toEqual(['enrollments.read']);
  });

  it('listEnrollmentDocuments требует enrollments.read', () => {
    const required = Reflect.getMetadata(
      REQUIRED_PERMISSIONS,
      MvpController.prototype.listEnrollmentDocuments
    );
    expect(required).toEqual(['enrollments.read']);
  });

  it('listEnrollmentCertificates (предсуществующий) — sanity baseline', () => {
    const required = Reflect.getMetadata(
      REQUIRED_PERMISSIONS,
      MvpController.prototype.listEnrollmentCertificates
    );
    expect(required).toEqual(['enrollments.read']);
  });
});
