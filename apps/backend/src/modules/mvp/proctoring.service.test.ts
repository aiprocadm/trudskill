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

function makeFilesMock() {
  let fileSeq = 0; // scoped per mock instance — no leakage across tests
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

describe('proctoring lifecycle — start session', () => {
  it('consent !== true → 400 consent_required', () => {
    const { service } = makeService();
    const { course, enrollment } = seedProctoredExam(service, true);
    let err: unknown;
    try {
      service.startProctoringRecording(
        T,
        'u_l1',
        { enrollmentId: enrollment.id, courseId: course.id, consent: false },
        ctxL1
      );
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(getResponseOf(err).code).toBe('consent_required');
  });

  it('proctoring not required (flag off, no override) → 400 proctoring_not_required', () => {
    const { service } = makeService();
    const { course, enrollment } = seedProctoredExam(service, false);
    let err: unknown;
    try {
      service.startProctoringRecording(
        T,
        'u_l1',
        { enrollmentId: enrollment.id, courseId: course.id, consent: true },
        ctxL1
      );
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(getResponseOf(err).code).toBe('proctoring_not_required');
  });

  it("override 'exempt' beats the group-course flag → proctoring_not_required", () => {
    const { service } = makeService();
    const { course, enrollment } = seedProctoredExam(service, true);
    service.setProctoringOverride(T, ADMIN, enrollment.id, { override: 'exempt' }, ctx);
    let err: unknown;
    try {
      service.startProctoringRecording(
        T,
        'u_l1',
        { enrollmentId: enrollment.id, courseId: course.id, consent: true },
        ctxL1
      );
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(getResponseOf(err).code).toBe('proctoring_not_required');
  });

  it("override 'require' starts a session even when the group-course flag is off", () => {
    const { service } = makeService();
    const { course, enrollment } = seedProctoredExam(service, false);
    service.setProctoringOverride(T, ADMIN, enrollment.id, { override: 'require' }, ctx);
    const recording = service.startProctoringRecording(
      T,
      'u_l1',
      { enrollmentId: enrollment.id, courseId: course.id, consent: true },
      ctxL1
    );
    expect(recording.recordingStatus).toBe('recording');
  });

  it('starts a recording session: status, consentAt/startedAt stamps, empty chunks, group derived from enrollment', () => {
    const { service } = makeService();
    const { course, group, enrollment, learner } = seedProctoredExam(service, true);
    const recording = service.startProctoringRecording(
      T,
      'u_l1',
      { enrollmentId: enrollment.id, courseId: course.id, consent: true },
      ctxL1
    );
    expect(recording.recordingStatus).toBe('recording');
    expect(recording.consentAt).toBeTruthy();
    expect(recording.startedAt).toBeTruthy();
    expect(recording.chunks).toEqual([]);
    expect(recording.learnerId).toBe(learner.id);
    expect(recording.groupId).toBe(group.id);
    expect(recording.courseId).toBe(course.id);
  });

  it('is idempotent: a second start while a session is active returns the same record', () => {
    const { service } = makeService();
    const { course, enrollment } = seedProctoredExam(service, true);
    const first = service.startProctoringRecording(
      T,
      'u_l1',
      { enrollmentId: enrollment.id, courseId: course.id, consent: true },
      ctxL1
    );
    const second = service.startProctoringRecording(
      T,
      'u_l1',
      { enrollmentId: enrollment.id, courseId: course.id, consent: true },
      ctxL1
    );
    expect(second.id).toBe(first.id);
  });

  it('a foreign actor without delegation cannot start on someone else’s enrollment', () => {
    const { service } = makeService();
    const { course, enrollment } = seedProctoredExam(service, true);
    expect(() =>
      service.startProctoringRecording(
        T,
        'u_stranger',
        { enrollmentId: enrollment.id, courseId: course.id, consent: true },
        { ...ctx, userId: 'u_stranger' }
      )
    ).toThrow();
  });

  it('course not linked to the enrollment group → domain_rule_violation', () => {
    const { service } = makeService();
    const { enrollment } = seedProctoredExam(service, true);
    const other = service.createCourse(T, ADMIN, { code: 'C2', title: 'Other' }, ctx);
    let err: unknown;
    try {
      service.startProctoringRecording(
        T,
        'u_l1',
        { enrollmentId: enrollment.id, courseId: other.id, consent: true },
        ctxL1
      );
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(getResponseOf(err).code).toBe('domain_rule_violation');
  });
});

describe('proctoring lifecycle — chunks, complete, active', () => {
  function startSession(service: MvpService) {
    const seed = seedProctoredExam(service, true);
    const recording = service.startProctoringRecording(
      T,
      'u_l1',
      { enrollmentId: seed.enrollment.id, courseId: seed.course.id, consent: true },
      ctxL1
    );
    return { ...seed, recording };
  }

  it('issues an upload intent with the proctoring prefix and webm/mp4 allowlist, registers the chunk', async () => {
    const { service, files } = makeService();
    const { recording } = startSession(service);
    const intent = await service.createProctoringChunkUploadIntent(
      T,
      'u_l1',
      recording.id,
      { sequence: 0, originalName: 'chunk-0.webm', contentType: 'video/webm', sizeBytes: 2048 },
      ctxL1
    );
    expect(files.createUploadIntent).toHaveBeenCalledWith(
      T,
      expect.objectContaining({ contentType: 'video/webm' }),
      expect.objectContaining({ keyPrefix: 'proctoring' })
    );
    const opts = files.createUploadIntent.mock.calls[0]![2] as {
      mimeAllowlist: ReadonlySet<string>;
    };
    expect(opts.mimeAllowlist.has('video/webm')).toBe(true);
    expect(opts.mimeAllowlist.has('video/mp4')).toBe(true);
    expect(opts.mimeAllowlist.has('image/jpeg')).toBe(false);
    expect(recording.chunks).toHaveLength(1);
    expect(recording.chunks[0]).toMatchObject({ sequence: 0, fileId: intent.fileId });
    expect(recording.chunks[0]!.uploadedIntentAt).toBeTruthy();
  });

  it('duplicate sequence → 409 proctoring_chunk_duplicate', async () => {
    const { service } = makeService();
    const { recording } = startSession(service);
    await service.createProctoringChunkUploadIntent(
      T,
      'u_l1',
      recording.id,
      { sequence: 0, originalName: 'chunk-0.webm', contentType: 'video/webm', sizeBytes: 2048 },
      ctxL1
    );
    let err: unknown;
    try {
      await service.createProctoringChunkUploadIntent(
        T,
        'u_l1',
        recording.id,
        { sequence: 0, originalName: 'chunk-0r.webm', contentType: 'video/webm', sizeBytes: 1024 },
        ctxL1
      );
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(getResponseOf(err).code).toBe('proctoring_chunk_duplicate');
  });

  it('chunk intent on a completed session → 412 proctoring_recording_not_active', async () => {
    const { service } = makeService();
    const { recording } = startSession(service);
    service.completeProctoringRecording(T, 'u_l1', recording.id, ctxL1);
    let err: unknown;
    try {
      await service.createProctoringChunkUploadIntent(
        T,
        'u_l1',
        recording.id,
        { sequence: 1, originalName: 'chunk-1.webm', contentType: 'video/webm', sizeBytes: 1024 },
        ctxL1
      );
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(getResponseOf(err).code).toBe('proctoring_recording_not_active');
  });

  it('complete stamps completedAt and is idempotent', () => {
    const { service } = makeService();
    const { recording } = startSession(service);
    const done = service.completeProctoringRecording(T, 'u_l1', recording.id, ctxL1);
    expect(done.recordingStatus).toBe('completed');
    expect(done.completedAt).toBeTruthy();
    const again = service.completeProctoringRecording(T, 'u_l1', recording.id, ctxL1);
    expect(again.id).toBe(done.id);
    expect(again.completedAt).toBe(done.completedAt);
  });

  it('getActive returns the session + nextSequence = maxSeq + 1; null when no active session', async () => {
    const { service } = makeService();
    const { recording, enrollment, course } = startSession(service);
    await service.createProctoringChunkUploadIntent(
      T,
      'u_l1',
      recording.id,
      { sequence: 0, originalName: 'c0.webm', contentType: 'video/webm', sizeBytes: 10 },
      ctxL1
    );
    await service.createProctoringChunkUploadIntent(
      T,
      'u_l1',
      recording.id,
      { sequence: 4, originalName: 'c4.webm', contentType: 'video/webm', sizeBytes: 10 },
      ctxL1
    );
    const active = service.getMyActiveProctoringRecording(
      T,
      'u_l1',
      { enrollmentId: enrollment.id, courseId: course.id },
      ctxL1
    );
    expect(active?.recording.id).toBe(recording.id);
    expect(active?.nextSequence).toBe(5);

    service.completeProctoringRecording(T, 'u_l1', recording.id, ctxL1);
    expect(
      service.getMyActiveProctoringRecording(
        T,
        'u_l1',
        { enrollmentId: enrollment.id, courseId: course.id },
        ctxL1
      )
    ).toBeNull();
  });

  it('a fresh session has nextSequence 0', () => {
    const { service } = makeService();
    const { enrollment, course } = startSession(service);
    const active = service.getMyActiveProctoringRecording(
      T,
      'u_l1',
      { enrollmentId: enrollment.id, courseId: course.id },
      ctxL1
    );
    expect(active?.nextSequence).toBe(0);
  });
});

describe('proctoring gate (5th assert in startAttempt)', () => {
  it('does NOT gate when proctoring is not required', () => {
    const { service } = makeService();
    const { test, enrollment } = seedProctoredExam(service, false);
    expect(() => service.startAttempt(T, 'u_l1', startArgs(test, enrollment), ctxL1)).not.toThrow();
  });

  it('blocks the final exam with 412 proctoring_required until a session is active', () => {
    const { service } = makeService();
    const { test, enrollment } = seedProctoredExam(service, true);
    let err: unknown;
    try {
      service.startAttempt(T, 'u_l1', startArgs(test, enrollment), ctxL1);
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect((err as { getStatus: () => number }).getStatus()).toBe(412);
    expect(getResponseOf(err).code).toBe('proctoring_required');
  });

  it('gate message collides with NEITHER the Wave 1 nor the Plan A frontend regex', () => {
    const { service } = makeService();
    const { test, enrollment } = seedProctoredExam(service, true);
    let err: unknown;
    try {
      service.startAttempt(T, 'u_l1', startArgs(test, enrollment), ctxL1);
    } catch (e) {
      err = e;
    }
    const message = getResponseOf(err).message ?? '';
    expect(message.length).toBeGreaterThan(0);
    // Wave 1 pre-exam-auth interstitial regex (tests-list-screen.tsx)
    expect(/pre_exam_auth_required|identity verification is required/i.test(message)).toBe(false);
    // Plan A identity interstitial regex
    expect(/identity_verification_required|identity confirmation by document/i.test(message)).toBe(
      false
    );
    // …and it DOES match its own interstitial regex
    expect(/proctoring_required|video recording must be active/i.test(message)).toBe(true);
  });

  it('an active recording session opens the gate and gets attemptId linked', () => {
    const { service } = makeService();
    const { test, course, enrollment } = seedProctoredExam(service, true);
    const recording = service.startProctoringRecording(
      T,
      'u_l1',
      { enrollmentId: enrollment.id, courseId: course.id, consent: true },
      ctxL1
    );
    const attempt = service.startAttempt(T, 'u_l1', startArgs(test, enrollment), ctxL1);
    expect(recording.attemptId).toBe(attempt.id);
  });

  it('a completed (not active) session does not open the gate', () => {
    const { service } = makeService();
    const { test, course, enrollment } = seedProctoredExam(service, true);
    const recording = service.startProctoringRecording(
      T,
      'u_l1',
      { enrollmentId: enrollment.id, courseId: course.id, consent: true },
      ctxL1
    );
    service.completeProctoringRecording(T, 'u_l1', recording.id, ctxL1);
    let err: unknown;
    try {
      service.startAttempt(T, 'u_l1', startArgs(test, enrollment), ctxL1);
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(getResponseOf(err).code).toBe('proctoring_required');
  });

  it("override 'exempt' disables the gate even when the group-course flag is on", () => {
    const { service } = makeService();
    const { test, enrollment } = seedProctoredExam(service, true);
    service.setProctoringOverride(T, ADMIN, enrollment.id, { override: 'exempt' }, ctx);
    expect(() => service.startAttempt(T, 'u_l1', startArgs(test, enrollment), ctxL1)).not.toThrow();
  });

  it("override 'require' gates an exam whose group-course flag is off", () => {
    const { service } = makeService();
    const { test, enrollment } = seedProctoredExam(service, false);
    service.setProctoringOverride(T, ADMIN, enrollment.id, { override: 'require' }, ctx);
    let err: unknown;
    try {
      service.startAttempt(T, 'u_l1', startArgs(test, enrollment), ctxL1);
    } catch (e) {
      err = e;
    }
    expect(err).toBeDefined();
    expect(getResponseOf(err).code).toBe('proctoring_required');
  });

  it('module (intermediate) tests are never gated', () => {
    const { service } = makeService();
    const seed = seedProctoredExam(service, true);
    // A second test bound to a module of the course — moduleId set ⇒ not a final exam.
    // Canonical module seeding (module-gating.service.test.ts seedCourseWithModules/makeTest).
    // NB: this is the first module in state (sortOrder 0) → no prior required modules, so the
    // module-sequence gate stays silent and only the proctoring exemption is exercised here.
    const version = service.createCourseVersion(T, seed.course.id);
    const mod = service.createModule(
      T,
      ADMIN,
      { courseVersionId: version.id, title: 'Module 1', minViewSeconds: 0, isRequired: true },
      ctx
    );
    const bank2 = service.createQuestionBank(T, ADMIN, { title: 'B2' }, ctx);
    const q2 = service.createQuestion(
      T,
      ADMIN,
      {
        questionBankId: bank2.id,
        type: 'single_choice',
        title: 'Q2',
        score: 1,
        options: [
          { text: 'A', isCorrect: true },
          { text: 'B', isCorrect: false }
        ]
      } as never,
      ctx
    );
    const moduleTest = service.createTest(
      T,
      ADMIN,
      {
        courseId: seed.course.id,
        questionBankId: bank2.id,
        title: 'Module test',
        moduleId: mod.id,
        rules: { attemptLimit: 5, passingScore: 0 }
      },
      ctx
    );
    service.addTestQuestions(T, moduleTest.id, [q2.id]);
    expect(() =>
      service.startAttempt(T, 'u_l1', startArgs(moduleTest, seed.enrollment), ctxL1)
    ).not.toThrow();
  });
});

describe('proctoring admin views', () => {
  async function seedWithChunks(service: MvpService, sequences: number[]) {
    const seed = seedProctoredExam(service, true);
    const recording = service.startProctoringRecording(
      T,
      'u_l1',
      { enrollmentId: seed.enrollment.id, courseId: seed.course.id, consent: true },
      ctxL1
    );
    for (const sequence of sequences) {
      await service.createProctoringChunkUploadIntent(
        T,
        'u_l1',
        recording.id,
        {
          sequence,
          originalName: `c${sequence}.webm`,
          contentType: 'video/webm',
          sizeBytes: 10
        },
        ctxL1
      );
    }
    return { ...seed, recording };
  }

  it('list enriches learnerName + courseTitle and filters by status', async () => {
    const { service } = makeService();
    const { recording, course } = await seedWithChunks(service, [0]);
    const all = service.listProctoringRecordings(T, {});
    expect(all).toHaveLength(1);
    expect(all[0]!.learnerName).toContain('Doe');
    expect(all[0]!.courseTitle).toBe(course.title);
    expect(service.listProctoringRecordings(T, { status: 'recording' })).toHaveLength(1);
    expect(service.listProctoringRecordings(T, { status: 'completed' })).toHaveLength(0);
    service.completeProctoringRecording(T, 'u_l1', recording.id, ctxL1);
    expect(service.listProctoringRecordings(T, { status: 'completed' })).toHaveLength(1);
  });

  it('list enriches attemptStatus once the attempt is linked', async () => {
    const { service } = makeService();
    const { test, enrollment } = await seedWithChunks(service, [0]);
    service.startAttempt(T, 'u_l1', startArgs(test, enrollment), ctxL1);
    const rows = service.listProctoringRecordings(T, {});
    expect(rows[0]!.attemptId).toBeTruthy();
    expect(rows[0]!.attemptStatus).toBe('in_progress');
  });

  it('detail returns presigned GET urls of clean chunks ordered by sequence', async () => {
    const { service, files } = makeService();
    const { recording } = await seedWithChunks(service, [1, 0, 2]);
    const detail = await service.getProctoringRecordingView(T, recording.id);
    expect(detail.playbackChunks.map((c) => c.sequence)).toEqual([0, 1, 2]);
    expect(detail.playbackChunks.every((c) => c.url === 'https://minio.local/GET-signed')).toBe(
      true
    );
    expect(detail.chunkIssues).toEqual([]);
    expect(files.createDownloadUrl).toHaveBeenCalledTimes(3);
  });

  it('infected chunk is excluded with a file_infected issue; the rest still play', async () => {
    const { service, files } = makeService();
    const { recording } = await seedWithChunks(service, [0, 1]);
    const infectedFileId = recording.chunks.find((c) => c.sequence === 1)!.fileId;
    files.getAntivirusStatuses.mockImplementation(
      async (_t: string, ids: string[]) =>
        new Map(ids.map((id) => [id, id === infectedFileId ? 'infected' : 'clean']))
    );
    const detail = await service.getProctoringRecordingView(T, recording.id);
    expect(detail.playbackChunks.map((c) => c.sequence)).toEqual([0]);
    expect(detail.chunkIssues).toContainEqual({ sequence: 1, code: 'file_infected' });
    expect(files.createDownloadUrl).toHaveBeenCalledTimes(1); // infected never hits the URL signer
  });

  it('sequence gaps are reported as missing_chunk issues', async () => {
    const { service } = makeService();
    const { recording } = await seedWithChunks(service, [0, 2, 3]);
    const detail = await service.getProctoringRecordingView(T, recording.id);
    expect(detail.chunkIssues).toContainEqual({ sequence: 1, code: 'missing_chunk' });
    expect(detail.playbackChunks.map((c) => c.sequence)).toEqual([0, 2, 3]);
  });

  it('a download-url failure degrades to an issue instead of failing the whole detail', async () => {
    const { service, files } = makeService();
    const { recording } = await seedWithChunks(service, [0, 1]);
    const failingFileId = recording.chunks.find((c) => c.sequence === 0)!.fileId;
    const { ConflictException: NestConflict } = await import('@nestjs/common');
    files.createDownloadUrl.mockImplementation(async (_t: string, fileId: string) => {
      if (fileId === failingFileId) {
        throw new NestConflict({ code: 'file_scan_failed', message: 'scan did not complete' });
      }
      return 'https://minio.local/GET-signed';
    });
    const detail = await service.getProctoringRecordingView(T, recording.id);
    expect(detail.chunkIssues).toContainEqual({ sequence: 0, code: 'file_scan_failed' });
    expect(detail.playbackChunks.map((c) => c.sequence)).toEqual([1]);
  });

  it('a purged recording returns metadata with no playback chunks and no issues', async () => {
    const { service, files } = makeService();
    const { recording } = await seedWithChunks(service, [0]);
    recording.purgedAt = '2027-06-12T00:00:00.000Z';
    const detail = await service.getProctoringRecordingView(T, recording.id);
    expect(detail.playbackChunks).toEqual([]);
    expect(detail.chunkIssues).toEqual([]);
    expect(files.createDownloadUrl).not.toHaveBeenCalled();
  });
});
