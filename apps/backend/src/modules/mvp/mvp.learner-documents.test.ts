import { ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { describe, expect, it } from 'vitest';

import { InMemoryMvpState } from './infrastructure/in-memory-mvp.state.js';
import { MvpService } from './mvp.service.js';
import { TenantScopedRepository } from '../../infrastructure/database/tenant-repository.js';
import { AuditService } from '../audit/audit.service.js';

import type { Course, Enrollment, GroupCourse, Learner } from './mvp.types.js';
import type { DocumentsService } from '../documents/documents.service.js';
import type { GeneratedDocumentEntity } from '../documents/documents.types.js';
import type { FilesService } from '../files/files.service.js';

const TENANT = 'tenant_demo';
const OTHER_TENANT = 'tenant_other';

interface Fixture {
  service: MvpService;
}

function makeFixture(documents: GeneratedDocumentEntity[]): Fixture {
  const state = new InMemoryMvpState();

  const learnerSelf: Learner = {
    id: 'l_self',
    tenantId: TENANT,
    status: 'active',
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
    firstName: 'Иван',
    lastName: 'Иванов',
    linkedIamUserId: 'u_alice'
  };
  const learnerOther: Learner = {
    id: 'l_other',
    tenantId: TENANT,
    status: 'active',
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
    firstName: 'Пётр',
    lastName: 'Петров',
    linkedIamUserId: 'u_bob'
  };
  // Учащийся из другого tenant'а с тем же linkedIamUserId — для проверки изоляции.
  const learnerCrossTenant: Learner = {
    id: 'l_cross',
    tenantId: OTHER_TENANT,
    status: 'active',
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
    firstName: 'X',
    lastName: 'X',
    linkedIamUserId: 'u_alice'
  };
  state.learners.push(learnerSelf, learnerOther, learnerCrossTenant);

  const course: Course = {
    id: 'course_ot',
    tenantId: TENANT,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    code: 'OT-2026',
    title: 'Охрана труда',
    isArchived: false
  };
  state.courses.push(course);

  const groupCourse: GroupCourse = {
    id: 'gc_1',
    tenantId: TENANT,
    status: 'active',
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
    groupId: 'g_1',
    courseId: 'course_ot'
  };
  state.groupCourses.push(groupCourse);

  const enrollmentSelf: Enrollment = {
    id: 'enr_self',
    tenantId: TENANT,
    status: 'completed',
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-05-10T00:00:00.000Z',
    groupId: 'g_1',
    learnerId: 'l_self',
    enrolledAt: '2026-04-01T00:00:00.000Z',
    completedAt: '2026-05-10T00:00:00.000Z'
  };
  const enrollmentOther: Enrollment = {
    id: 'enr_other',
    tenantId: TENANT,
    status: 'completed',
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-05-10T00:00:00.000Z',
    groupId: 'g_1',
    learnerId: 'l_other',
    enrolledAt: '2026-04-01T00:00:00.000Z',
    completedAt: '2026-05-10T00:00:00.000Z'
  };
  state.enrollments.push(enrollmentSelf, enrollmentOther);

  const fakeDocumentsService = {
    listDocuments: (
      tenantId: string,
      query: { sourceEntityType?: string; sourceEntityId?: string; documentType?: string }
    ) => {
      const filtered = documents.filter((d) => {
        if (d.tenantId !== tenantId) return false;
        if (query.sourceEntityType && d.sourceEntityType !== query.sourceEntityType) return false;
        if (query.sourceEntityId && d.sourceEntityId !== query.sourceEntityId) return false;
        if (query.documentType && d.documentType !== query.documentType) return false;
        return true;
      });
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

  return { service };
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
    sourceEntityId: 'enr_self',
    fileId: '',
    status: 'generated',
    documentNumber: 'СТ-000001',
    documentDate: '2026-05-10',
    isFinal: false,
    generatedAt: '2026-05-10T12:00:00.000Z',
    ...overrides
  };
}

describe('MvpService.listEnrollmentDocuments — Phase 1 §4.3', () => {
  it('returns all document types issued for the enrollment, not only certificates', () => {
    const docs = [
      makeDoc({ id: 'd_cert', documentType: 'certificate' }),
      makeDoc({ id: 'd_diploma', documentType: 'diploma', documentNumber: 'ДП-001' }),
      makeDoc({ id: 'd_protocol', documentType: 'protocol', documentNumber: 'ПР-001' })
    ];
    const { service } = makeFixture(docs);

    const result = service.listEnrollmentDocuments(TENANT, 'enr_self', {
      actorId: 'u_alice',
      permissions: ['enrollments.read']
    });

    const types = result.items.map((d) => d.documentType).sort();
    expect(types).toEqual(['certificate', 'diploma', 'protocol']);
  });

  it('forbids reading documents of another learner via linkedIam ownership', () => {
    const docs = [makeDoc({ id: 'd_other', sourceEntityId: 'enr_other' })];
    const { service } = makeFixture(docs);

    expect(() =>
      service.listEnrollmentDocuments(TENANT, 'enr_other', {
        actorId: 'u_alice', // Alice пытается прочитать enrollment Боба.
        permissions: ['enrollments.read']
      })
    ).toThrow(ForbiddenException);
  });

  it('excludes archived documents but keeps revoked (с причиной)', () => {
    const docs = [
      makeDoc({ id: 'd_ok' }),
      makeDoc({ id: 'd_arch', status: 'archived' }),
      makeDoc({ id: 'd_revoked', status: 'revoked', revocationReason: 'Ошибка ФИО' })
    ];
    const { service } = makeFixture(docs);

    const result = service.listEnrollmentDocuments(TENANT, 'enr_self', {
      actorId: 'u_alice',
      permissions: ['enrollments.read']
    });

    const ids = result.items.map((d) => d.id).sort();
    expect(ids).toEqual(['d_ok', 'd_revoked']);
    const revoked = result.items.find((d) => d.id === 'd_revoked');
    expect(revoked?.revocationReason).toBe('Ошибка ФИО');
  });

  it('marks isDownloadable=false when fileId is empty (pre-Phase-5 documents)', () => {
    const docs = [makeDoc({ id: 'd_no_file', fileId: '' })];
    const { service } = makeFixture(docs);
    const result = service.listEnrollmentDocuments(TENANT, 'enr_self', { actorId: 'u_alice' });
    expect(result.items[0].isDownloadable).toBe(false);
    expect(result.items[0].downloadUrl).toBe('');
  });

  it('marks isDownloadable=true and builds downloadUrl when fileId present', () => {
    const docs = [makeDoc({ id: 'd_file', fileId: 'file_abc' })];
    const { service } = makeFixture(docs);
    const result = service.listEnrollmentDocuments(TENANT, 'enr_self', { actorId: 'u_alice' });
    expect(result.items[0].isDownloadable).toBe(true);
    expect(result.items[0].downloadUrl).toMatch(/\/files\/file_abc\/download$/);
  });

  it('attaches courseTitle resolved via groupCourse → course', () => {
    const docs = [makeDoc({ id: 'd_ct' })];
    const { service } = makeFixture(docs);
    const result = service.listEnrollmentDocuments(TENANT, 'enr_self', { actorId: 'u_alice' });
    expect(result.items[0].courseTitle).toBe('Охрана труда');
  });
});

describe('MvpService.listMyDocuments — Phase 1 §4.3', () => {
  it('returns empty when actorId is undefined', () => {
    const { service } = makeFixture([]);
    expect(service.listMyDocuments(TENANT, undefined)).toEqual({ items: [] });
  });

  it('returns empty when actor is not linked to any learner in this tenant', () => {
    const { service } = makeFixture([makeDoc({})]);
    expect(service.listMyDocuments(TENANT, 'u_no_link')).toEqual({ items: [] });
  });

  it('returns only documents of learners linked to current actor', () => {
    const docs = [
      makeDoc({ id: 'd_alice', sourceEntityId: 'enr_self' }),
      makeDoc({ id: 'd_bob', sourceEntityId: 'enr_other' })
    ];
    const { service } = makeFixture(docs);
    const result = service.listMyDocuments(TENANT, 'u_alice');
    expect(result.items.map((d) => d.id)).toEqual(['d_alice']);
  });

  it('does not leak documents from another tenant (cross-tenant linkedIamUserId)', () => {
    const docs = [
      makeDoc({ id: 'd_self', sourceEntityId: 'enr_self' }),
      makeDoc({ id: 'd_cross', tenantId: OTHER_TENANT, sourceEntityId: 'enr_cross' })
    ];
    const { service } = makeFixture(docs);
    // Запрос идёт под tenant=TENANT — кросс-tenant документ Alice не должен прийти.
    const result = service.listMyDocuments(TENANT, 'u_alice');
    expect(result.items.map((d) => d.id)).toEqual(['d_self']);
  });

  it('sorts by documentDate descending, with id tiebreaker', () => {
    const docs = [
      makeDoc({ id: 'd_old', documentDate: '2026-04-01' }),
      makeDoc({ id: 'd_new', documentDate: '2026-05-10' }),
      makeDoc({ id: 'd_mid_b', documentDate: '2026-04-15' }),
      makeDoc({ id: 'd_mid_a', documentDate: '2026-04-15' })
    ];
    const { service } = makeFixture(docs);
    const result = service.listMyDocuments(TENANT, 'u_alice');
    expect(result.items.map((d) => d.id)).toEqual(['d_new', 'd_mid_b', 'd_mid_a', 'd_old']);
  });

  it('skips archived but keeps revoked', () => {
    const docs = [
      makeDoc({ id: 'd_ok' }),
      makeDoc({ id: 'd_arch', status: 'archived' }),
      makeDoc({ id: 'd_revoked', status: 'revoked', revocationReason: 'reason' })
    ];
    const { service } = makeFixture(docs);
    const result = service.listMyDocuments(TENANT, 'u_alice');
    const ids = result.items.map((d) => d.id).sort();
    expect(ids).toEqual(['d_ok', 'd_revoked']);
  });

  it('attaches courseTitle and enrollmentId for each item', () => {
    const docs = [makeDoc({ id: 'd_x' })];
    const { service } = makeFixture(docs);
    const result = service.listMyDocuments(TENANT, 'u_alice');
    expect(result.items[0]).toMatchObject({
      enrollmentId: 'enr_self',
      courseTitle: 'Охрана труда'
    });
  });
});
