import { EventEmitter2 } from '@nestjs/event-emitter';
import { describe, expect, it, vi } from 'vitest';

import { InMemoryMvpState } from './infrastructure/in-memory-mvp.state.js';
import { MvpService } from './mvp.service.js';
import { TenantScopedRepository } from '../../infrastructure/database/tenant-repository.js';
import { AuditService } from '../audit/audit.service.js';

import type { RequestContext } from '../../common/context/request-context.js';
import type { DocumentsService } from '../documents/documents.service.js';
import type { FilesService } from '../files/files.service.js';

const ctx: RequestContext = {
  requestId: 'req_1',
  correlationId: 'corr_1',
  tenantId: 'tenant_demo',
  userId: 'u_admin',
  ip: '127.0.0.1',
  userAgent: 'vitest'
};

const noopDocumentsService = {
  listDocuments: () => ({ items: [], page: 1, pageSize: 50, total: 0 })
} as unknown as DocumentsService;

function makeServices() {
  const files = {
    scanFile: vi.fn(async () => 'clean' as const),
    ensureMaterialLink: vi.fn(async () => undefined)
  };
  const service = new MvpService(
    new InMemoryMvpState(),
    new TenantScopedRepository(),
    new AuditService(),
    noopDocumentsService,
    files as unknown as FilesService,
    new EventEmitter2()
  );
  return { service, files };
}

/**
 * Seeds a draft submission owned by IAM user `u_owner` (so the owner can submit it),
 * optionally carrying an attached file. Mirrors the seeding in mvp.service.test.ts.
 */
function seedDraftSubmission(service: MvpService, opts: { fileId?: string }) {
  const course = service.createCourse(
    'tenant_demo',
    ctx.userId,
    { code: 'C_AV', title: 'AV Course' },
    ctx
  );
  const group = service.createGroup(
    'tenant_demo',
    ctx.userId,
    { code: 'G_AV', name: 'AV Group' },
    ctx
  );
  service.createGroupCourse('tenant_demo', { groupId: group.id, courseId: course.id });
  const learner = service.createLearner(
    'tenant_demo',
    ctx.userId,
    { code: 'L_AV', name: 'Av Learner', linkedIamUserId: 'u_owner' },
    ctx
  );
  const enrollment = service.createEnrollment(
    'tenant_demo',
    ctx.userId,
    { groupId: group.id, learnerId: learner.id },
    ctx
  );
  const assignment = service.createAssignment(
    'tenant_demo',
    ctx.userId,
    { courseId: course.id, title: 'HW', maxScore: 100 },
    ctx
  );
  return service.createAssignmentSubmission(
    'tenant_demo',
    'u_owner',
    {
      assignmentId: assignment.id,
      enrollmentId: enrollment.id,
      learnerId: learner.id,
      answerText: 'draft',
      ...(opts.fileId ? { fileId: opts.fileId } : {})
    },
    ctx
  );
}

describe('MvpService.submitAssignmentSubmission — proactive AV scan', () => {
  it('fires a best-effort antivirus scan when a submission with a file is submitted', async () => {
    const { service, files } = makeServices();
    const submission = seedDraftSubmission(service, { fileId: 'file_abc' });
    service.submitAssignmentSubmission('tenant_demo', 'u_owner', submission.id, ctx);
    await Promise.resolve(); // let the fire-and-forget microtask settle
    expect(files.scanFile).toHaveBeenCalledWith('tenant_demo', 'file_abc', 'u_owner');
  });

  it('does not call scanFile when the submission has no file', async () => {
    const { service, files } = makeServices();
    const submission = seedDraftSubmission(service, {});
    service.submitAssignmentSubmission('tenant_demo', 'u_owner', submission.id, ctx);
    await Promise.resolve();
    expect(files.scanFile).not.toHaveBeenCalled();
  });
});
