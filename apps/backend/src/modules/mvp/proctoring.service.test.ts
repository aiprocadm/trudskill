import { EventEmitter2 } from '@nestjs/event-emitter';
import { describe, expect, it, vi } from 'vitest';

import { InMemoryMvpState } from './infrastructure/in-memory-mvp.state.js';
import { MvpService } from './mvp.service.js';
import { TenantScopedRepository } from '../../infrastructure/database/tenant-repository.js';
import { AuditService } from '../audit/audit.service.js';

import type { RequestContext } from '../../common/context/request-context.js';
import type { DocumentsService } from '../documents/documents.service.js';
import type { FilesService } from '../files/files.service.js';

const noopDocumentsService = {
  listDocuments: () => ({ items: [], page: 1, pageSize: 50, total: 0 })
} as unknown as DocumentsService;

const T = 'tenant_demo';
const ADMIN = 'u_tenant_admin';
const ctx: RequestContext = {
  requestId: 'req_1',
  correlationId: 'corr_1',
  tenantId: T,
  userId: ADMIN,
  ip: '127.0.0.1',
  userAgent: 'vitest'
};
/** ctx variant for learner 'u_l1' (IAM-linked seeds). */
const ctxL1: RequestContext = { ...ctx, userId: 'u_l1' };

let fileSeq = 0;
function makeFilesMock() {
  return {
    createUploadIntent: vi.fn(async () => ({
      fileId: `file_${(fileSeq += 1)}`,
      uploadUrl: 'https://minio.local/PUT-signed',
      storageKey: 'proctoring/tenant_demo/x_chunk.webm',
      expiresInSeconds: 900
    })),
    getAntivirusStatuses: vi.fn(
      async (_t: string, ids: string[]) => new Map(ids.map((id) => [id, 'clean']))
    ),
    createDownloadUrl: vi.fn(async () => 'https://minio.local/GET-signed'),
    ensureMaterialLink: async () => undefined
  } as unknown as FilesService & {
    createUploadIntent: ReturnType<typeof vi.fn>;
    getAntivirusStatuses: ReturnType<typeof vi.fn>;
    createDownloadUrl: ReturnType<typeof vi.fn>;
  };
}

function makeService(files = makeFilesMock()) {
  return {
    files,
    service: new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      new AuditService(),
      noopDocumentsService,
      files,
      new EventEmitter2()
    )
  };
}

/**
 * course → group → groupCourse(requiresProctoring) → learner(linked u_l1) → enrollment → bank → final test.
 * Mirrors identity-verification.service.test.ts seedFinalExam.
 */
function seedProctoredExam(service: MvpService, requiresProctoring: boolean) {
  const course = service.createCourse(T, ADMIN, { code: 'C1', title: 'Course' }, ctx);
  const group = service.createGroup(T, ADMIN, { code: 'G1', name: 'Group' }, ctx);
  const groupCourse = service.createGroupCourse(T, {
    groupId: group.id,
    courseId: course.id,
    requiresProctoring
  });
  const learner = service.createLearner(
    T,
    ADMIN,
    { code: 'L1', name: 'Jane Doe', linkedIamUserId: 'u_l1' },
    ctx
  );
  const enrollment = service.createEnrollment(
    T,
    ADMIN,
    { groupId: group.id, learnerId: learner.id },
    ctx
  );
  const bank = service.createQuestionBank(T, ADMIN, { title: 'Bank', courseId: course.id }, ctx);
  const q = service.createQuestion(
    T,
    ADMIN,
    {
      questionBankId: bank.id,
      type: 'single_choice',
      title: 'Q',
      score: 1,
      options: [
        { text: 'A', isCorrect: true },
        { text: 'B', isCorrect: false }
      ]
    } as never,
    ctx
  );
  const test = service.createTest(
    T,
    ADMIN,
    { courseId: course.id, questionBankId: bank.id, title: 'Final', rules: { attemptLimit: 5 } },
    ctx
  );
  service.addTestQuestions(T, test.id, [q.id]);
  return { course, group, groupCourse, learner, enrollment, test };
}

const startArgs = (test: { id: string }, enrollment: { id: string; learnerId: string }) => ({
  testId: test.id,
  enrollmentId: enrollment.id,
  learnerId: enrollment.learnerId
});

function getResponseOf(err: unknown): { code?: string; message?: string } {
  return (err as { getResponse: () => { code?: string; message?: string } }).getResponse();
}

describe('proctoring override (per-student switch)', () => {
  it('setProctoringOverride stores require/exempt and null clears back to inherit', () => {
    const { service } = makeService();
    const { enrollment } = seedProctoredExam(service, false);

    const required = service.setProctoringOverride(
      T,
      ADMIN,
      enrollment.id,
      { override: 'require' },
      ctx
    );
    expect(required.proctoringOverride).toBe('require');

    const exempt = service.setProctoringOverride(
      T,
      ADMIN,
      enrollment.id,
      { override: 'exempt' },
      ctx
    );
    expect(exempt.proctoringOverride).toBe('exempt');

    const inherited = service.setProctoringOverride(
      T,
      ADMIN,
      enrollment.id,
      { override: null },
      ctx
    );
    expect(inherited.proctoringOverride).toBeUndefined();
  });

  it('setProctoringOverride on an unknown enrollment throws', () => {
    const { service } = makeService();
    expect(() =>
      service.setProctoringOverride(T, ADMIN, 'enr_ghost', { override: 'require' }, ctx)
    ).toThrow();
  });

  it('createGroupCourse / updateGroupCourse persist requiresProctoring', () => {
    const { service } = makeService();
    const { groupCourse } = seedProctoredExam(service, true);
    expect(groupCourse.requiresProctoring).toBe(true);
    const updated = service.updateGroupCourse(
      T,
      ADMIN,
      groupCourse.id,
      { requiresProctoring: false },
      ctx
    );
    expect(updated.requiresProctoring).toBe(false);
  });
});

void startArgs; // used by gate tests added in Task 6
void ctxL1; // used by lifecycle tests added in Task 4
void getResponseOf; // used by lifecycle tests added in Task 4
