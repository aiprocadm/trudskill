import { EventEmitter2 } from '@nestjs/event-emitter';
import { describe, expect, it } from 'vitest';

import { TenantScopedRepository } from '../../../infrastructure/database/tenant-repository.js';
import { AuditService } from '../../audit/audit.service.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import { MvpService } from '../mvp.service.js';

import type { RequestContext } from '../../../common/context/request-context.js';
import type { DocumentsService } from '../../documents/documents.service.js';
import type { FilesService } from '../../files/files.service.js';

const noopDocumentsService = {
  listDocuments: () => ({ items: [], page: 1, pageSize: 50, total: 0 })
} as unknown as DocumentsService;

const noopFilesService = {
  ensureMaterialLink: async () => undefined
} as unknown as FilesService;

const ctx: RequestContext = {
  requestId: 'req_1',
  correlationId: 'corr_1',
  tenantId: 'tenant_demo',
  userId: 'u_admin',
  ip: '127.0.0.1',
  userAgent: 'vitest'
};

function makeServices(): { service: MvpService } {
  const service = new MvpService(
    new InMemoryMvpState(),
    new TenantScopedRepository(),
    new AuditService(),
    noopDocumentsService,
    noopFilesService,
    new EventEmitter2()
  );
  return { service };
}

function seedCourseVersion(service: MvpService) {
  const course = service.createCourse(
    'tenant_demo',
    ctx.userId,
    { code: 'OT1', title: 'ОТ курс' },
    ctx
  );
  const cv = service.createCourseVersion('tenant_demo', course.id);
  return { courseId: course.id, courseVersionId: cv.id };
}

describe('updateProgramMeta — otProgramCodes', () => {
  it('persists ot_program_codes onto the course version', () => {
    const { service } = makeServices();
    const { courseVersionId } = seedCourseVersion(service);

    service.updateProgramMeta(
      'tenant_demo',
      ctx.userId,
      courseVersionId,
      { otProgramCodes: ['OT_A', 'OT_FIRST_AID'] },
      ctx
    );

    const updated = service.getCourseVersion('tenant_demo', courseVersionId);
    expect(updated.otProgramCodes).toEqual(['OT_A', 'OT_FIRST_AID']);
  });

  it('overwrites existing ot_program_codes on subsequent patch', () => {
    const { service } = makeServices();
    const { courseVersionId } = seedCourseVersion(service);

    service.updateProgramMeta(
      'tenant_demo',
      ctx.userId,
      courseVersionId,
      { otProgramCodes: ['OT_A'] },
      ctx
    );
    service.updateProgramMeta(
      'tenant_demo',
      ctx.userId,
      courseVersionId,
      { otProgramCodes: ['OT_B', 'OT_V'] },
      ctx
    );

    const updated = service.getCourseVersion('tenant_demo', courseVersionId);
    expect(updated.otProgramCodes).toEqual(['OT_B', 'OT_V']);
  });

  it('leaves ot_program_codes unchanged when not provided in patch', () => {
    const { service } = makeServices();
    const { courseVersionId } = seedCourseVersion(service);

    service.updateProgramMeta(
      'tenant_demo',
      ctx.userId,
      courseVersionId,
      { otProgramCodes: ['OT_SIZ'] },
      ctx
    );
    service.updateProgramMeta(
      'tenant_demo',
      ctx.userId,
      courseVersionId,
      { academicHours: 8 },
      ctx
    );

    const updated = service.getCourseVersion('tenant_demo', courseVersionId);
    expect(updated.otProgramCodes).toEqual(['OT_SIZ']);
    expect(updated.academicHours).toBe(8);
  });

  it('accepts empty array to clear ot_program_codes', () => {
    const { service } = makeServices();
    const { courseVersionId } = seedCourseVersion(service);

    service.updateProgramMeta(
      'tenant_demo',
      ctx.userId,
      courseVersionId,
      { otProgramCodes: ['OT_A'] },
      ctx
    );
    service.updateProgramMeta(
      'tenant_demo',
      ctx.userId,
      courseVersionId,
      { otProgramCodes: [] },
      ctx
    );

    const updated = service.getCourseVersion('tenant_demo', courseVersionId);
    expect(updated.otProgramCodes).toEqual([]);
  });
});
