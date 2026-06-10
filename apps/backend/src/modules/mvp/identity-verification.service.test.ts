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

function makeFilesMock() {
  return {
    createUploadIntent: vi.fn(async () => ({
      fileId: `file_${Math.random().toString(36).slice(2, 8)}`,
      uploadUrl: 'https://minio.local/PUT-signed',
      storageKey: 'identity/tenant_demo/x_selfie.jpg',
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

describe('identity verification lifecycle', () => {
  it('1. starts a draft for the actor-linked learner (no explicit learnerId)', () => {
    const { service } = makeService();
    service.createLearner(
      T,
      ADMIN,
      { code: 'L1', name: 'Ivanov Ivan', linkedIamUserId: 'u_l1' },
      ctx
    );
    const draft = service.startIdentityVerification(T, 'u_l1', {}, ctx);
    expect(draft.verificationStatus).toBe('draft');
    expect(draft.method).toBe('selfie_passport');
  });

  it('2. throws learner_not_linked when the actor has no linked learner', () => {
    const { service } = makeService();
    let err: unknown;
    try {
      service.startIdentityVerification(T, 'u_nobody', {}, ctx);
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect((err as { getResponse: () => unknown }).getResponse()).toMatchObject({
      code: 'learner_not_linked'
    });
  });

  it('3. is idempotent: a second start returns the existing draft', () => {
    const { service } = makeService();
    service.createLearner(
      T,
      ADMIN,
      { code: 'L1', name: 'Ivanov Ivan', linkedIamUserId: 'u_l1' },
      ctx
    );
    const first = service.startIdentityVerification(T, 'u_l1', {}, ctx);
    const second = service.startIdentityVerification(T, 'u_l1', {}, ctx);
    expect(second.id).toBe(first.id);
  });

  it('4. issues an upload intent with the identity prefix and image/pdf allowlist for a draft', async () => {
    const { service, files } = makeService();
    service.createLearner(
      T,
      ADMIN,
      { code: 'L1', name: 'Ivanov Ivan', linkedIamUserId: 'u_l1' },
      ctx
    );
    const draft = service.startIdentityVerification(T, 'u_l1', {}, ctx);
    await service.createIdentityVerificationUploadIntent(
      T,
      'u_l1',
      draft.id,
      { originalName: 'selfie.jpg', contentType: 'image/jpeg', sizeBytes: 1000 },
      ctx
    );
    expect((files as ReturnType<typeof makeFilesMock>).createUploadIntent).toHaveBeenCalledWith(
      T,
      expect.objectContaining({ contentType: 'image/jpeg' }),
      expect.objectContaining({ keyPrefix: 'identity' })
    );
    // Check mimeAllowlist contains image/jpeg but not application/msword
    const callArgs = (files as ReturnType<typeof makeFilesMock>).createUploadIntent.mock.calls[0];
    const opts = callArgs[2] as { mimeAllowlist: ReadonlySet<string> };
    expect(opts.mimeAllowlist.has('image/jpeg')).toBe(true);
    expect(opts.mimeAllowlist.has('application/msword')).toBe(false);
  });

  it('5. submit moves draft → pending with consent timestamp and both file ids', async () => {
    const { service } = makeService();
    service.createLearner(
      T,
      ADMIN,
      { code: 'L1', name: 'Ivanov Ivan', linkedIamUserId: 'u_l1' },
      ctx
    );
    const draft = service.startIdentityVerification(T, 'u_l1', {}, ctx);
    const result = await service.submitIdentityVerification(
      T,
      'u_l1',
      draft.id,
      { selfieFileId: 'f_selfie', passportFileId: 'f_passport', consent: true },
      ctx
    );
    expect(result.verificationStatus).toBe('pending');
    expect(result.consentAt).toBeTruthy();
    expect(result.submittedAt).toBeTruthy();
    expect(result.selfieFileId).toBe('f_selfie');
  });

  it('6. submit rejects unknown file ids (tenant scope)', async () => {
    const { service, files } = makeService();
    service.createLearner(
      T,
      ADMIN,
      { code: 'L1', name: 'Ivanov Ivan', linkedIamUserId: 'u_l1' },
      ctx
    );
    const draft = service.startIdentityVerification(T, 'u_l1', {}, ctx);
    // Only f_selfie is known; f_passport is not returned in the map
    (files as ReturnType<typeof makeFilesMock>).getAntivirusStatuses.mockResolvedValueOnce(
      new Map([['f_selfie', 'clean']])
    );
    let err: unknown;
    try {
      await service.submitIdentityVerification(
        T,
        'u_l1',
        draft.id,
        { selfieFileId: 'f_selfie', passportFileId: 'f_passport', consent: true },
        ctx
      );
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(((err as { getResponse: () => unknown }).getResponse() as { code: string }).code).toBe(
      'file_not_found'
    );
  });

  it('7. approve moves pending → approved and stamps the reviewer', async () => {
    const { service } = makeService();
    service.createLearner(
      T,
      ADMIN,
      { code: 'L1', name: 'Ivanov Ivan', linkedIamUserId: 'u_l1' },
      ctx
    );
    const draft = service.startIdentityVerification(T, 'u_l1', {}, ctx);
    await service.submitIdentityVerification(
      T,
      'u_l1',
      draft.id,
      { selfieFileId: 'f_selfie', passportFileId: 'f_passport', consent: true },
      ctx
    );
    const approved = service.reviewIdentityVerification(
      T,
      ADMIN,
      draft.id,
      { decision: 'approve' },
      ctx
    );
    expect(approved.verificationStatus).toBe('approved');
    expect(approved.reviewedByActorId).toBe(ADMIN);
    expect(approved.reviewedAt).toBeTruthy();
  });

  it('8. reject stores the reason; a new start after rejection creates a fresh record', async () => {
    const { service } = makeService();
    service.createLearner(
      T,
      ADMIN,
      { code: 'L1', name: 'Ivanov Ivan', linkedIamUserId: 'u_l1' },
      ctx
    );
    const draft = service.startIdentityVerification(T, 'u_l1', {}, ctx);
    await service.submitIdentityVerification(
      T,
      'u_l1',
      draft.id,
      { selfieFileId: 'f_selfie', passportFileId: 'f_passport', consent: true },
      ctx
    );
    const rejected = service.reviewIdentityVerification(
      T,
      ADMIN,
      draft.id,
      { decision: 'reject', rejectionReason: 'Фото нечитаемо' },
      ctx
    );
    expect(rejected.verificationStatus).toBe('rejected');
    expect(rejected.rejectionReason).toBe('Фото нечитаемо');

    // A new start after rejection creates a fresh record
    const newDraft = service.startIdentityVerification(T, 'u_l1', {}, ctx);
    expect(newDraft.id).not.toBe(draft.id);
    expect(newDraft.verificationStatus).toBe('draft');
  });

  it('9. review of a non-pending record throws identity_verification_not_pending', () => {
    const { service } = makeService();
    service.createLearner(
      T,
      ADMIN,
      { code: 'L1', name: 'Ivanov Ivan', linkedIamUserId: 'u_l1' },
      ctx
    );
    const draft = service.startIdentityVerification(T, 'u_l1', {}, ctx);
    let err: unknown;
    try {
      service.reviewIdentityVerification(T, ADMIN, draft.id, { decision: 'approve' }, ctx);
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect((err as { getResponse: () => unknown }).getResponse()).toMatchObject({
      code: 'identity_verification_not_pending'
    });
  });

  it('10. start throws identity_already_verified when an approved record exists', async () => {
    const { service } = makeService();
    service.createLearner(
      T,
      ADMIN,
      { code: 'L1', name: 'Ivanov Ivan', linkedIamUserId: 'u_l1' },
      ctx
    );
    const draft = service.startIdentityVerification(T, 'u_l1', {}, ctx);
    await service.submitIdentityVerification(
      T,
      'u_l1',
      draft.id,
      { selfieFileId: 'f_selfie', passportFileId: 'f_passport', consent: true },
      ctx
    );
    service.reviewIdentityVerification(T, ADMIN, draft.id, { decision: 'approve' }, ctx);

    let err: unknown;
    try {
      service.startIdentityVerification(T, 'u_l1', {}, ctx);
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect((err as { getResponse: () => unknown }).getResponse()).toMatchObject({
      code: 'identity_already_verified'
    });
  });

  it('11. list view enriches learner name + snils; me returns the latest own record', () => {
    const { service } = makeService();
    // Create learner with snils via createLearnerExtended
    const learner = service.createLearnerExtended(
      T,
      ADMIN,
      {
        firstName: 'Иван',
        lastName: 'Иванов',
        snils: '112-233-445 95'
      },
      ctx
    );
    // Manually set linkedIamUserId so we can use actor-linked lookup
    (service as unknown as { state: InMemoryMvpState }).state.learners.find(
      (l) => l.id === learner.id
    )!.linkedIamUserId = 'u_l1';

    const draft = service.startIdentityVerification(T, 'u_l1', {}, ctx);

    const list = service.listIdentityVerifications(T, {});
    expect(list.length).toBeGreaterThan(0);
    expect(list[0]!.learnerName).toContain('Иванов');
    expect(list[0]!.learnerSnils).toBe('112-233-445 95');

    expect(service.getMyIdentityVerification(T, 'u_l1')?.id).toBe(draft.id);
    expect(service.getMyIdentityVerification(T, 'u_unlinked')).toBeNull();
  });

  it('12. upload intent on a non-draft record throws identity_verification_not_editable', async () => {
    const { service } = makeService();
    service.createLearner(
      T,
      ADMIN,
      { code: 'L1', name: 'Ivanov Ivan', linkedIamUserId: 'u_l1' },
      ctx
    );
    const draft = service.startIdentityVerification(T, 'u_l1', {}, ctx);
    // Submit to move to pending status
    await service.submitIdentityVerification(
      T,
      'u_l1',
      draft.id,
      { selfieFileId: 'f_selfie', passportFileId: 'f_passport', consent: true },
      ctx
    );
    // Now record is pending — upload intent should throw identity_verification_not_editable
    let err: unknown;
    try {
      await service.createIdentityVerificationUploadIntent(
        T,
        'u_l1',
        draft.id,
        { originalName: 'selfie2.jpg', contentType: 'image/jpeg', sizeBytes: 500 },
        ctx
      );
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(((err as { getResponse: () => unknown }).getResponse() as { code: string }).code).toBe(
      'identity_verification_not_editable'
    );
  });
});

/**
 * course → group → groupCourse(requiresIdentityVerification) → learner → enrollment → bank → final test.
 * withIamLink=true sets linkedIamUserId so the identity flow (startIdentityVerification) can find the learner.
 */
function seedFinalExam(
  service: MvpService,
  requiresIdentityVerification: boolean,
  withIamLink = false
) {
  const course = service.createCourse(T, ADMIN, { code: 'C1', title: 'Course' }, ctx);
  const group = service.createGroup(T, ADMIN, { code: 'G1', name: 'Group' }, ctx);
  service.createGroupCourse(T, {
    groupId: group.id,
    courseId: course.id,
    requiresIdentityVerification
  });
  const learnerReq = withIamLink
    ? { code: 'L1', name: 'Jane Doe', linkedIamUserId: 'u_l1' }
    : { code: 'L1', name: 'Jane Doe' };
  const learner = service.createLearner(T, ADMIN, learnerReq, ctx);
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
  return { course, group, learner, enrollment, test };
}

const startArgs = (test: { id: string }, enrollment: { id: string; learnerId: string }) => ({
  testId: test.id,
  enrollmentId: enrollment.id,
  learnerId: enrollment.learnerId
});

/** ctx variant for learner 'u_l1' (used in gate tests 4+5 where learner has an IAM link). */
const ctxL1: RequestContext = { ...ctx, userId: 'u_l1' };

describe('identity verification gate', () => {
  it('does NOT gate when the group-course does not require identity verification', () => {
    const { service } = makeService();
    const { test, enrollment } = seedFinalExam(service, false);
    expect(() => service.startAttempt(T, ADMIN, startArgs(test, enrollment), ctx)).not.toThrow();
  });

  it('blocks the final exam with identity_verification_required until approved', () => {
    const { service } = makeService();
    const { test, enrollment } = seedFinalExam(service, true);
    let err: unknown;
    try {
      service.startAttempt(T, ADMIN, startArgs(test, enrollment), ctx);
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect((err as { getResponse: () => unknown }).getResponse()).toMatchObject({
      code: 'identity_verification_required'
    });
  });

  it('gate message must not collide with the Wave 1 frontend regex', () => {
    const { service } = makeService();
    const { test, enrollment } = seedFinalExam(service, true);
    let err: unknown;
    try {
      service.startAttempt(T, ADMIN, startArgs(test, enrollment), ctx);
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    const message = (err as { getResponse: () => { message: string } }).getResponse().message;
    expect(/identity verification is required/i.test(message)).toBe(false);
  });

  it('allows the exam after an approved verification (per-learner, any enrollment)', async () => {
    const { service } = makeService();
    // withIamLink=true so startIdentityVerification can find the learner by actorId 'u_l1'
    const { test, enrollment } = seedFinalExam(service, true, true);
    const draft = service.startIdentityVerification(T, 'u_l1', {}, ctx);
    await service.submitIdentityVerification(
      T,
      'u_l1',
      draft.id,
      { selfieFileId: 'f_s', passportFileId: 'f_p', consent: true },
      ctxL1
    );
    service.reviewIdentityVerification(T, ADMIN, draft.id, { decision: 'approve' }, ctx);
    // actorId='u_l1' matches the learner's IAM link — gate passes + IDOR check passes
    expect(() => service.startAttempt(T, 'u_l1', startArgs(test, enrollment), ctxL1)).not.toThrow();
  });

  it('a rejected verification does not unlock the gate', async () => {
    const { service } = makeService();
    // withIamLink=true so startIdentityVerification can find the learner by actorId 'u_l1'
    const { test, enrollment } = seedFinalExam(service, true, true);
    const draft = service.startIdentityVerification(T, 'u_l1', {}, ctx);
    await service.submitIdentityVerification(
      T,
      'u_l1',
      draft.id,
      { selfieFileId: 'f_s', passportFileId: 'f_p', consent: true },
      ctxL1
    );
    service.reviewIdentityVerification(T, ADMIN, draft.id, { decision: 'reject' }, ctx);
    let err: unknown;
    try {
      service.startAttempt(T, 'u_l1', startArgs(test, enrollment), ctxL1);
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect((err as { getResponse: () => unknown }).getResponse()).toMatchObject({
      code: 'identity_verification_required'
    });
  });
});
