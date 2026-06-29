import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  PreconditionFailedException
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { describe, expect, it } from 'vitest';

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

const noopFilesService = {
  ensureMaterialLink: async () => undefined,
  createUploadIntent: async () => ({
    fileId: 'file_stub',
    uploadUrl: 'https://minio.local/PUT',
    storageKey: 'submissions/tenant_demo/stub',
    expiresInSeconds: 900
  }),
  createDownloadUrl: async () => 'https://minio.local/GET'
} as unknown as FilesService;

const testEmitter = new EventEmitter2();

const ctx = {
  requestId: 'req_1',
  correlationId: 'corr_1',
  tenantId: 'tenant_demo',
  userId: 'u_tenant_admin',
  ip: '127.0.0.1',
  userAgent: 'vitest'
};

describe('mvp service domain rules', () => {
  it('requires at least one version before course publish', () => {
    const service = new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      new AuditService(),
      noopDocumentsService,
      noopFilesService,
      testEmitter
    );
    const course = service.createCourse(
      'tenant_demo',
      ctx.userId,
      { code: 'C1', title: 'Course 1' },
      ctx
    );
    expect(() => service.publishCourse('tenant_demo', ctx.userId, course.id, ctx)).toThrow(
      PreconditionFailedException
    );

    service.createCourseVersion('tenant_demo', course.id);
    const published = service.publishCourse('tenant_demo', ctx.userId, course.id, ctx);
    expect(published.status).toBe('published');
  });

  it('enforces unique enrollment by (group, learner)', () => {
    const service = new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      new AuditService(),
      noopDocumentsService,
      noopFilesService,
      testEmitter
    );
    const group = service.createGroup(
      'tenant_demo',
      ctx.userId,
      { code: 'G1', name: 'Group' },
      ctx
    );
    const learner = service.createLearner(
      'tenant_demo',
      ctx.userId,
      { code: 'L1', name: 'John Doe' },
      ctx
    );
    service.createEnrollment(
      'tenant_demo',
      ctx.userId,
      { groupId: group.id, learnerId: learner.id },
      ctx
    );

    expect(() =>
      service.createEnrollment(
        'tenant_demo',
        ctx.userId,
        { groupId: group.id, learnerId: learner.id },
        ctx
      )
    ).toThrow(ConflictException);
  });

  it('tracks enrollment status transitions and history', () => {
    const service = new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      new AuditService(),
      noopDocumentsService,
      noopFilesService,
      testEmitter
    );
    const group = service.createGroup(
      'tenant_demo',
      ctx.userId,
      { code: 'G1', name: 'Group' },
      ctx
    );
    const learner = service.createLearner(
      'tenant_demo',
      ctx.userId,
      { code: 'L1', name: 'John Doe' },
      ctx
    );
    const enrollment = service.createEnrollment(
      'tenant_demo',
      ctx.userId,
      { groupId: group.id, learnerId: learner.id },
      ctx
    );

    const active = service.changeEnrollmentStatus(
      'tenant_demo',
      ctx.userId,
      enrollment.id,
      { status: 'active' },
      ctx
    );
    expect(active.status).toBe('active');

    expect(() =>
      service.changeEnrollmentStatus(
        'tenant_demo',
        ctx.userId,
        enrollment.id,
        { status: 'pending' },
        ctx
      )
    ).toThrow(PreconditionFailedException);

    const history = service.listEnrollmentStatusHistory('tenant_demo', enrollment.id);
    expect(history.map((item) => item.status)).toEqual(['pending', 'active']);
  });

  it('calculates progress based on min_view_seconds and aggregates module/course', () => {
    const service = new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      new AuditService(),
      noopDocumentsService,
      noopFilesService,
      testEmitter
    );
    const course = service.createCourse(
      'tenant_demo',
      ctx.userId,
      { code: 'C1', title: 'Course' },
      ctx
    );
    const version = service.createCourseVersion('tenant_demo', course.id);
    const module = service.createModule(
      'tenant_demo',
      ctx.userId,
      { courseVersionId: version.id, title: 'M1', minViewSeconds: 0 },
      ctx
    );
    const material = service.createMaterial(
      'tenant_demo',
      ctx.userId,
      { moduleId: module.id, title: 'Mat', materialType: 'video', minViewSeconds: 100 },
      ctx
    );
    const group = service.createGroup(
      'tenant_demo',
      ctx.userId,
      { code: 'G1', name: 'Group' },
      ctx
    );
    service.createGroupCourse('tenant_demo', { groupId: group.id, courseId: course.id });
    const learner = service.createLearner(
      'tenant_demo',
      ctx.userId,
      { code: 'L1', name: 'John Doe' },
      ctx
    );
    const enrollment = service.createEnrollment(
      'tenant_demo',
      ctx.userId,
      { groupId: group.id, learnerId: learner.id },
      ctx
    );

    const p1 = service.upsertMaterialProgress(
      'tenant_demo',
      ctx.userId,
      material.id,
      { enrollmentId: enrollment.id, studiedSeconds: 40 },
      ctx
    );
    expect(p1.status).toBe('in_progress');
    expect(p1.progressPercent).toBe(40);

    service.upsertMaterialProgress(
      'tenant_demo',
      ctx.userId,
      material.id,
      { enrollmentId: enrollment.id, studiedSeconds: 100 },
      ctx
    );
    const courseProgress = service.listProgress('tenant_demo', {}).items[0];
    expect(courseProgress.status).toBe('completed');
    expect(courseProgress.progressPercent).toBe(100);
    expect(courseProgress.calculatedAt).toBeDefined();
  });

  it('rejects progress update when enrollment group is not linked to material course', () => {
    const service = new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      new AuditService(),
      noopDocumentsService,
      noopFilesService,
      testEmitter
    );
    const course = service.createCourse(
      'tenant_demo',
      ctx.userId,
      { code: 'C1', title: 'Course' },
      ctx
    );
    const version = service.createCourseVersion('tenant_demo', course.id);
    const module = service.createModule(
      'tenant_demo',
      ctx.userId,
      { courseVersionId: version.id, title: 'M1' },
      ctx
    );
    const material = service.createMaterial(
      'tenant_demo',
      ctx.userId,
      { moduleId: module.id, title: 'Mat', materialType: 'video', minViewSeconds: 30 },
      ctx
    );
    const group = service.createGroup(
      'tenant_demo',
      ctx.userId,
      { code: 'G1', name: 'Group' },
      ctx
    );
    const learner = service.createLearner(
      'tenant_demo',
      ctx.userId,
      { code: 'L1', name: 'John Doe' },
      ctx
    );
    const enrollment = service.createEnrollment(
      'tenant_demo',
      ctx.userId,
      { groupId: group.id, learnerId: learner.id },
      ctx
    );

    expect(() =>
      service.upsertMaterialProgress(
        'tenant_demo',
        ctx.userId,
        material.id,
        { enrollmentId: enrollment.id, studiedSeconds: 10 },
        ctx
      )
    ).toThrow(PreconditionFailedException);
  });

  it('enforces tenant isolation (getCourse is tenant-scoped → not_found for foreign tenant)', () => {
    const service = new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      new AuditService(),
      noopDocumentsService,
      noopFilesService,
      testEmitter
    );
    const course = service.createCourse(
      'tenant_demo',
      ctx.userId,
      { code: 'C1', title: 'Course' },
      ctx
    );
    expect(() => service.getCourse('tenant_other', course.id)).toThrow(NotFoundException);
  });

  it('returns lookup payloads with id/label/status', () => {
    const service = new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      new AuditService(),
      noopDocumentsService,
      noopFilesService,
      testEmitter
    );
    service.createDirection('tenant_demo', ctx.userId, { code: 'D1', name: 'Direction 1' }, ctx);
    const lookup = service.lookupDirections('tenant_demo', { q: 'Direction' });
    expect(lookup.items[0]).toMatchObject({ label: 'Direction 1', status: 'active' });
  });

  it('enforces unique group-course relation by (group, course)', () => {
    const service = new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      new AuditService(),
      noopDocumentsService,
      noopFilesService,
      testEmitter
    );
    const group = service.createGroup(
      'tenant_demo',
      ctx.userId,
      { code: 'G1', name: 'Group' },
      ctx
    );
    const course = service.createCourse(
      'tenant_demo',
      ctx.userId,
      { code: 'C1', title: 'Course' },
      ctx
    );
    service.createGroupCourse('tenant_demo', { groupId: group.id, courseId: course.id });

    expect(() =>
      service.createGroupCourse('tenant_demo', { groupId: group.id, courseId: course.id })
    ).toThrow(ConflictException);
  });

  it('writes audit events for critical actions', async () => {
    const audit = new AuditService();
    const service = new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      audit,
      noopDocumentsService,
      noopFilesService,
      testEmitter
    );
    service.createCounterparty('tenant_demo', ctx.userId, { code: 'CP1', name: 'Org 1' }, ctx);
    service.createLearner('tenant_demo', ctx.userId, { code: 'L1', name: 'John Doe' }, ctx);
    expect(
      (await audit.list('tenant_demo')).some((item) => item.action === 'crm.counterparty_created')
    ).toBe(true);
    expect(
      (await audit.list('tenant_demo')).some((item) => item.action === 'learning.learner_created')
    ).toBe(true);
  });

  it('enforces attempt limit, scoring and exam result finalization', () => {
    const service = new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      new AuditService(),
      noopDocumentsService,
      noopFilesService,
      testEmitter
    );
    const course = service.createCourse(
      'tenant_demo',
      ctx.userId,
      { code: 'C2', title: 'Assessment' },
      ctx
    );
    const group = service.createGroup(
      'tenant_demo',
      ctx.userId,
      { code: 'G2', name: 'Group 2' },
      ctx
    );
    service.createGroupCourse('tenant_demo', { groupId: group.id, courseId: course.id });
    const learner = service.createLearner(
      'tenant_demo',
      ctx.userId,
      { code: 'L2', name: 'Jane Doe' },
      ctx
    );
    const enrollment = service.createEnrollment(
      'tenant_demo',
      ctx.userId,
      { groupId: group.id, learnerId: learner.id },
      ctx
    );
    const bank = service.createQuestionBank(
      'tenant_demo',
      ctx.userId,
      { title: 'Bank', courseId: course.id },
      ctx
    );
    const question = service.createQuestion(
      'tenant_demo',
      ctx.userId,
      {
        questionBankId: bank.id,
        text: '1+1?',
        type: 'single_choice',
        options: [{ text: '2', isCorrect: true }, { text: '3' }]
      },
      ctx
    );
    const test = service.createTest(
      'tenant_demo',
      ctx.userId,
      {
        title: 'Math',
        courseId: course.id,
        questionBankId: bank.id,
        rules: { attemptLimit: 1, passingScore: 1 }
      },
      ctx
    );
    service.addTestQuestions('tenant_demo', test.id, [question.id]);

    const attempt = service.startAttempt(
      'tenant_demo',
      ctx.userId,
      { testId: test.id, enrollmentId: enrollment.id, learnerId: learner.id },
      ctx
    );
    const option = service['state'].answerOptions.find(
      (item) => item.questionId === question.id && item.isCorrect
    )!;
    service.saveAttemptAnswer(
      'tenant_demo',
      ctx.userId,
      attempt.id,
      { questionId: question.id, answerOptionIds: [option.id] },
      ctx
    );
    service.submitAttempt('tenant_demo', ctx.userId, attempt.id, ctx);
    service.finishAttempt('tenant_demo', ctx.userId, attempt.id, ctx);

    const result = service.getAttemptResult('tenant_demo', attempt.id);
    expect(result.passed).toBe(true);
    expect(() =>
      service.startAttempt(
        'tenant_demo',
        ctx.userId,
        { testId: test.id, enrollmentId: enrollment.id, learnerId: learner.id },
        ctx
      )
    ).toThrow(PreconditionFailedException);
  });

  it('keeps randomized question snapshot stable per attempt', () => {
    const service = new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      new AuditService(),
      noopDocumentsService,
      noopFilesService,
      testEmitter
    );
    const course = service.createCourse(
      'tenant_demo',
      ctx.userId,
      { code: 'C3', title: 'Random' },
      ctx
    );
    const group = service.createGroup(
      'tenant_demo',
      ctx.userId,
      { code: 'G3', name: 'Group 3' },
      ctx
    );
    service.createGroupCourse('tenant_demo', { groupId: group.id, courseId: course.id });
    const learner = service.createLearner(
      'tenant_demo',
      ctx.userId,
      { code: 'L3', name: 'User Three' },
      ctx
    );
    const enrollment = service.createEnrollment(
      'tenant_demo',
      ctx.userId,
      { groupId: group.id, learnerId: learner.id },
      ctx
    );
    const bank = service.createQuestionBank(
      'tenant_demo',
      ctx.userId,
      { title: 'QB', courseId: course.id },
      ctx
    );
    const q1 = service.createQuestion(
      'tenant_demo',
      ctx.userId,
      { questionBankId: bank.id, text: 'Q1', type: 'text' },
      ctx
    );
    const q2 = service.createQuestion(
      'tenant_demo',
      ctx.userId,
      { questionBankId: bank.id, text: 'Q2', type: 'text' },
      ctx
    );
    const test = service.createTest(
      'tenant_demo',
      ctx.userId,
      {
        title: 'Rnd',
        courseId: course.id,
        questionBankId: bank.id,
        rules: { attemptLimit: 2, randomizeQuestions: true, questionCount: 2 }
      },
      ctx
    );
    service.addTestQuestions('tenant_demo', test.id, [q1.id, q2.id]);
    const attempt = service.startAttempt(
      'tenant_demo',
      ctx.userId,
      { testId: test.id, enrollmentId: enrollment.id, learnerId: learner.id },
      ctx
    );
    expect(service.getAttempt('tenant_demo', attempt.id).questionOrder).toEqual(
      attempt.questionOrder
    );
  });

  it('locks assignment submission after submit and completes review workflow', () => {
    const service = new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      new AuditService(),
      noopDocumentsService,
      noopFilesService,
      testEmitter
    );
    const course = service.createCourse(
      'tenant_demo',
      ctx.userId,
      { code: 'C4', title: 'Assignments' },
      ctx
    );
    const group = service.createGroup(
      'tenant_demo',
      ctx.userId,
      { code: 'G4', name: 'Group 4' },
      ctx
    );
    service.createGroupCourse('tenant_demo', { groupId: group.id, courseId: course.id });
    const learner = service.createLearner(
      'tenant_demo',
      ctx.userId,
      { code: 'L4', name: 'Learner Four' },
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
    const submission = service.createAssignmentSubmission(
      'tenant_demo',
      ctx.userId,
      {
        assignmentId: assignment.id,
        enrollmentId: enrollment.id,
        learnerId: learner.id,
        answerText: 'draft'
      },
      ctx
    );
    service.submitAssignmentSubmission('tenant_demo', ctx.userId, submission.id, ctx);
    expect(() =>
      service.updateAssignmentSubmission(
        'tenant_demo',
        ctx.userId,
        submission.id,
        { answerText: 'changed' },
        ctx
      )
    ).toThrow(PreconditionFailedException);
    const review = service.createAssignmentReview(
      'tenant_demo',
      ctx.userId,
      { submissionId: submission.id, score: 80 },
      ctx
    );
    const completed = service.completeAssignmentReview(
      'tenant_demo',
      ctx.userId,
      review.id,
      { comment: 'done' },
      ctx
    );
    expect(completed.status).toBe('completed');
  });

  it('locks submission edit after submit and completes review workflow', () => {
    const service = new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      new AuditService(),
      noopDocumentsService,
      noopFilesService,
      testEmitter
    );
    const course = service.createCourse(
      'tenant_demo',
      ctx.userId,
      { code: 'C5', title: 'Assignments 2' },
      ctx
    );
    const group = service.createGroup(
      'tenant_demo',
      ctx.userId,
      { code: 'G1', name: 'Group' },
      ctx
    );
    service.createGroupCourse('tenant_demo', { groupId: group.id, courseId: course.id });
    const assignment = service.createAssignment(
      'tenant_demo',
      ctx.userId,
      { courseId: course.id, title: 'HW', maxScore: 100 },
      ctx
    );
    const learner = service.createLearner(
      'tenant_demo',
      ctx.userId,
      { code: 'L1', name: 'John Doe' },
      ctx
    );
    const enrollment = service.createEnrollment(
      'tenant_demo',
      ctx.userId,
      { groupId: group.id, learnerId: learner.id },
      ctx
    );
    const submission = service.createAssignmentSubmission(
      'tenant_demo',
      ctx.userId,
      {
        assignmentId: assignment.id,
        enrollmentId: enrollment.id,
        learnerId: learner.id,
        answerText: 'draft'
      },
      ctx
    );
    service.submitAssignmentSubmission('tenant_demo', ctx.userId, submission.id, ctx);
    expect(() =>
      service.updateAssignmentSubmission(
        'tenant_demo',
        ctx.userId,
        submission.id,
        { answerText: 'edited' },
        ctx
      )
    ).toThrow(PreconditionFailedException);
    const review = service.createAssignmentReview(
      'tenant_demo',
      ctx.userId,
      { submissionId: submission.id, score: 70 },
      ctx
    );
    const completed = service.completeAssignmentReview(
      'tenant_demo',
      ctx.userId,
      review.id,
      { comment: 'ok' },
      ctx
    );
    expect(completed.status).toBe('completed');
  });

  it('rejects assignment submission when enrollment group is not linked to assignment course', () => {
    const service = new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      new AuditService(),
      noopDocumentsService,
      noopFilesService,
      testEmitter
    );
    const course = service.createCourse(
      'tenant_demo',
      ctx.userId,
      { code: 'C6', title: 'Assignments 3' },
      ctx
    );
    const assignment = service.createAssignment(
      'tenant_demo',
      ctx.userId,
      { courseId: course.id, title: 'HW', maxScore: 100 },
      ctx
    );
    const group = service.createGroup(
      'tenant_demo',
      ctx.userId,
      { code: 'G6', name: 'Group 6' },
      ctx
    );
    const learner = service.createLearner(
      'tenant_demo',
      ctx.userId,
      { code: 'L6', name: 'Learner Six' },
      ctx
    );
    const enrollment = service.createEnrollment(
      'tenant_demo',
      ctx.userId,
      { groupId: group.id, learnerId: learner.id },
      ctx
    );

    expect(() =>
      service.createAssignmentSubmission(
        'tenant_demo',
        ctx.userId,
        {
          assignmentId: assignment.id,
          enrollmentId: enrollment.id,
          learnerId: learner.id,
          answerText: 'draft'
        },
        ctx
      )
    ).toThrow(PreconditionFailedException);
  });

  it('rejects createAssignmentSubmission when claimed learnerId does not match enrollment', () => {
    const service = new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      new AuditService(),
      noopDocumentsService,
      noopFilesService,
      testEmitter
    );
    const course = service.createCourse(
      'tenant_demo',
      ctx.userId,
      { code: 'CID1', title: 'IDOR Course' },
      ctx
    );
    const group = service.createGroup('tenant_demo', ctx.userId, { code: 'GID1', name: 'G1' }, ctx);
    service.createGroupCourse('tenant_demo', { groupId: group.id, courseId: course.id });
    const la = service.createLearner(
      'tenant_demo',
      ctx.userId,
      { code: 'LA', name: 'Learner A' },
      ctx
    );
    const lb = service.createLearner(
      'tenant_demo',
      ctx.userId,
      { code: 'LB', name: 'Learner B' },
      ctx
    );
    const enrollment = service.createEnrollment(
      'tenant_demo',
      ctx.userId,
      { groupId: group.id, learnerId: la.id },
      ctx
    );
    const assignment = service.createAssignment(
      'tenant_demo',
      ctx.userId,
      { courseId: course.id, title: 'HW', maxScore: 100 },
      ctx
    );

    expect(() =>
      service.createAssignmentSubmission(
        'tenant_demo',
        ctx.userId,
        {
          assignmentId: assignment.id,
          enrollmentId: enrollment.id,
          learnerId: lb.id,
          answerText: 'draft'
        },
        ctx
      )
    ).toThrow(BadRequestException);
  });

  it('forbids assignment submission when IAM actor does not match learner linkedIamUserId', async () => {
    const service = new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      new AuditService(),
      noopDocumentsService,
      noopFilesService,
      testEmitter
    );
    const course = service.createCourse(
      'tenant_demo',
      ctx.userId,
      { code: 'CID2', title: 'Link Course' },
      ctx
    );
    const group = service.createGroup('tenant_demo', ctx.userId, { code: 'GID2', name: 'G2' }, ctx);
    service.createGroupCourse('tenant_demo', { groupId: group.id, courseId: course.id });
    const learner = service.createLearner(
      'tenant_demo',
      ctx.userId,
      { code: 'L_OWN', name: 'Alice A', linkedIamUserId: 'u_owner' },
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

    expect(() =>
      service.createAssignmentSubmission(
        'tenant_demo',
        'u_intruder',
        {
          assignmentId: assignment.id,
          enrollmentId: enrollment.id,
          learnerId: learner.id,
          answerText: 'draft'
        },
        ctx
      )
    ).toThrow(ForbiddenException);

    const submission = service.createAssignmentSubmission(
      'tenant_demo',
      'u_owner',
      {
        assignmentId: assignment.id,
        enrollmentId: enrollment.id,
        learnerId: learner.id,
        answerText: 'draft'
      },
      ctx
    );
    expect(submission.learnerId).toBe(learner.id);

    await expect(
      service.getAssignmentSubmission('tenant_demo', submission.id, {
        actorId: 'u_intruder'
      })
    ).rejects.toThrow(ForbiddenException);
    expect(
      (
        await service.getAssignmentSubmission('tenant_demo', submission.id, {
          actorId: 'u_owner'
        })
      ).id
    ).toBe(submission.id);

    const other = service.createLearner(
      'tenant_demo',
      ctx.userId,
      { code: 'L_OTH', name: 'Other', linkedIamUserId: 'u_other' },
      ctx
    );
    const enrollmentOther = service.createEnrollment(
      'tenant_demo',
      ctx.userId,
      { groupId: group.id, learnerId: other.id },
      ctx
    );
    service.createAssignmentSubmission(
      'tenant_demo',
      'u_other',
      {
        assignmentId: assignment.id,
        enrollmentId: enrollmentOther.id,
        learnerId: other.id,
        answerText: 'b'
      },
      ctx
    );
    const scoped = service.listAssignmentSubmissions(
      'tenant_demo',
      {},
      {
        actorId: 'u_owner'
      }
    );
    expect(scoped.items).toHaveLength(1);
    expect(scoped.items[0]!.id).toBe(submission.id);

    const bypass = service.listAssignmentSubmissions(
      'tenant_demo',
      {},
      {
        actorId: 'u_owner',
        permissions: ['assessment.read.cross_learner']
      }
    );
    expect(bypass.total).toBe(2);
  });

  it('allows assignment submission for linked learner when actor has learners.act_as', async () => {
    const auditService = new AuditService();
    const service = new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      auditService,
      noopDocumentsService,
      noopFilesService,
      testEmitter
    );
    const actAsCtx = { ...ctx, permissions: ['learners.act_as'] } as RequestContext;
    const course = service.createCourse(
      'tenant_demo',
      ctx.userId,
      { code: 'CACT', title: 'ActAs Course' },
      ctx
    );
    const group = service.createGroup(
      'tenant_demo',
      ctx.userId,
      { code: 'GACT', name: 'G act' },
      ctx
    );
    service.createGroupCourse('tenant_demo', { groupId: group.id, courseId: course.id });
    const learner = service.createLearner(
      'tenant_demo',
      ctx.userId,
      { code: 'LACT', name: 'Linked', linkedIamUserId: 'u_alice_only' },
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
      { courseId: course.id, title: 'HW', maxScore: 10 },
      ctx
    );

    const sub = service.createAssignmentSubmission(
      'tenant_demo',
      'u_teacher_delegate',
      {
        assignmentId: assignment.id,
        enrollmentId: enrollment.id,
        learnerId: learner.id,
        answerText: 'teacher filed'
      },
      actAsCtx
    );
    expect(sub.learnerId).toBe(learner.id);
    service.submitAssignmentSubmission('tenant_demo', 'u_teacher_delegate', sub.id, actAsCtx);
    const auditRows = await auditService.list('tenant_demo');
    const submitLog = auditRows.find(
      (r) => r.action === 'assessment.assignment_submission_submitted'
    );
    expect(submitLog?.metadata?.delegated).toBe(true);
    expect(submitLog?.metadata?.viaPermission).toBe('learners.act_as');
    expect(submitLog?.metadata?.learnerId).toBe(learner.id);
    expect(submitLog?.metadata?.correlation_id).toBe(ctx.correlationId);
  });

  it('rejects review creation for draft submission and duplicate review creation', () => {
    const service = new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      new AuditService(),
      noopDocumentsService,
      noopFilesService,
      testEmitter
    );
    const course = service.createCourse(
      'tenant_demo',
      ctx.userId,
      { code: 'C8', title: 'Assignments 5' },
      ctx
    );
    const group = service.createGroup(
      'tenant_demo',
      ctx.userId,
      { code: 'G8', name: 'Group 8' },
      ctx
    );
    service.createGroupCourse('tenant_demo', { groupId: group.id, courseId: course.id });
    const learner = service.createLearner(
      'tenant_demo',
      ctx.userId,
      { code: 'L8', name: 'Learner Eight' },
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
      { courseId: course.id, title: 'HW 8', maxScore: 100 },
      ctx
    );
    const submission = service.createAssignmentSubmission(
      'tenant_demo',
      ctx.userId,
      {
        assignmentId: assignment.id,
        enrollmentId: enrollment.id,
        learnerId: learner.id,
        answerText: 'draft'
      },
      ctx
    );

    expect(() =>
      service.createAssignmentReview(
        'tenant_demo',
        ctx.userId,
        { submissionId: submission.id, score: 50 },
        ctx
      )
    ).toThrow(PreconditionFailedException);

    service.submitAssignmentSubmission('tenant_demo', ctx.userId, submission.id, ctx);
    service.createAssignmentReview(
      'tenant_demo',
      ctx.userId,
      { submissionId: submission.id, score: 80 },
      ctx
    );

    expect(() =>
      service.createAssignmentReview(
        'tenant_demo',
        ctx.userId,
        { submissionId: submission.id, score: 90 },
        ctx
      )
    ).toThrow(ConflictException);
  });

  it('rejects review update and second completion after review is completed', () => {
    const service = new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      new AuditService(),
      noopDocumentsService,
      noopFilesService,
      testEmitter
    );
    const course = service.createCourse(
      'tenant_demo',
      ctx.userId,
      { code: 'C9', title: 'Assignments 6' },
      ctx
    );
    const group = service.createGroup(
      'tenant_demo',
      ctx.userId,
      { code: 'G9', name: 'Group 9' },
      ctx
    );
    service.createGroupCourse('tenant_demo', { groupId: group.id, courseId: course.id });
    const learner = service.createLearner(
      'tenant_demo',
      ctx.userId,
      { code: 'L9', name: 'Learner Nine' },
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
      { courseId: course.id, title: 'HW 9', maxScore: 100 },
      ctx
    );
    const submission = service.createAssignmentSubmission(
      'tenant_demo',
      ctx.userId,
      {
        assignmentId: assignment.id,
        enrollmentId: enrollment.id,
        learnerId: learner.id,
        answerText: 'submitted'
      },
      ctx
    );
    service.submitAssignmentSubmission('tenant_demo', ctx.userId, submission.id, ctx);
    const review = service.createAssignmentReview(
      'tenant_demo',
      ctx.userId,
      { submissionId: submission.id, score: 77 },
      ctx
    );
    service.completeAssignmentReview('tenant_demo', ctx.userId, review.id, { comment: 'ok' }, ctx);

    expect(() =>
      service.updateAssignmentReview(
        'tenant_demo',
        ctx.userId,
        review.id,
        { comment: 'edited after complete' },
        ctx
      )
    ).toThrow(PreconditionFailedException);

    expect(() =>
      service.completeAssignmentReview(
        'tenant_demo',
        ctx.userId,
        review.id,
        { comment: 'complete twice' },
        ctx
      )
    ).toThrow(PreconditionFailedException);
  });

  it('validates assignment review score boundaries against assignment maxScore', () => {
    const service = new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      new AuditService(),
      noopDocumentsService,
      noopFilesService,
      testEmitter
    );
    const course = service.createCourse(
      'tenant_demo',
      ctx.userId,
      { code: 'C10', title: 'Assignments 10' },
      ctx
    );
    const group = service.createGroup(
      'tenant_demo',
      ctx.userId,
      { code: 'G10', name: 'Group 10' },
      ctx
    );
    service.createGroupCourse('tenant_demo', { groupId: group.id, courseId: course.id });
    const learner = service.createLearner(
      'tenant_demo',
      ctx.userId,
      { code: 'L10', name: 'Learner Ten' },
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
      { courseId: course.id, title: 'HW 10', maxScore: 80 },
      ctx
    );
    const submission = service.createAssignmentSubmission(
      'tenant_demo',
      ctx.userId,
      {
        assignmentId: assignment.id,
        enrollmentId: enrollment.id,
        learnerId: learner.id,
        answerText: 'submitted'
      },
      ctx
    );
    service.submitAssignmentSubmission('tenant_demo', ctx.userId, submission.id, ctx);

    expect(() =>
      service.createAssignmentReview(
        'tenant_demo',
        ctx.userId,
        { submissionId: submission.id, score: -1 },
        ctx
      )
    ).toThrow(BadRequestException);

    expect(() =>
      service.createAssignmentReview(
        'tenant_demo',
        ctx.userId,
        { submissionId: submission.id, score: 81 },
        ctx
      )
    ).toThrow(BadRequestException);

    const review = service.createAssignmentReview(
      'tenant_demo',
      ctx.userId,
      { submissionId: submission.id, score: 70 },
      ctx
    );

    expect(() =>
      service.updateAssignmentReview('tenant_demo', ctx.userId, review.id, { score: -5 }, ctx)
    ).toThrow(BadRequestException);

    expect(() =>
      service.updateAssignmentReview('tenant_demo', ctx.userId, review.id, { score: 100 }, ctx)
    ).toThrow(BadRequestException);

    expect(() =>
      service.completeAssignmentReview(
        'tenant_demo',
        ctx.userId,
        review.id,
        { score: -2, comment: 'invalid score' },
        ctx
      )
    ).toThrow(BadRequestException);
  });

  it('rejects attempt start when enrollment group is not linked to test course', () => {
    const service = new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      new AuditService(),
      noopDocumentsService,
      noopFilesService,
      testEmitter
    );
    const course = service.createCourse(
      'tenant_demo',
      ctx.userId,
      { code: 'C7', title: 'Assessments 4' },
      ctx
    );
    const bank = service.createQuestionBank(
      'tenant_demo',
      ctx.userId,
      { title: 'Bank 7', courseId: course.id },
      ctx
    );
    const question = service.createQuestion(
      'tenant_demo',
      ctx.userId,
      {
        questionBankId: bank.id,
        text: 'Q7',
        type: 'single_choice',
        options: [{ text: 'A', isCorrect: true }, { text: 'B' }]
      },
      ctx
    );
    const test = service.createTest(
      'tenant_demo',
      ctx.userId,
      { title: 'Test 7', courseId: course.id, questionBankId: bank.id },
      ctx
    );
    service.addTestQuestions('tenant_demo', test.id, [question.id]);
    const group = service.createGroup(
      'tenant_demo',
      ctx.userId,
      { code: 'G7', name: 'Group 7' },
      ctx
    );
    const learner = service.createLearner(
      'tenant_demo',
      ctx.userId,
      { code: 'L7', name: 'Learner Seven' },
      ctx
    );
    const enrollment = service.createEnrollment(
      'tenant_demo',
      ctx.userId,
      { groupId: group.id, learnerId: learner.id },
      ctx
    );

    expect(() =>
      service.startAttempt(
        'tenant_demo',
        ctx.userId,
        { testId: test.id, enrollmentId: enrollment.id, learnerId: learner.id },
        ctx
      )
    ).toThrow(PreconditionFailedException);
  });

  it('updates module/material/group and writes audit events', async () => {
    const audit = new AuditService();
    const service = new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      audit,
      noopDocumentsService,
      noopFilesService,
      testEmitter
    );
    const group = service.createGroup(
      'tenant_demo',
      ctx.userId,
      { code: 'G1', name: 'Group' },
      ctx
    );
    const course = service.createCourse(
      'tenant_demo',
      ctx.userId,
      { code: 'C1', title: 'Course' },
      ctx
    );
    const version = service.createCourseVersion('tenant_demo', course.id);
    const module = service.createModule(
      'tenant_demo',
      ctx.userId,
      { courseVersionId: version.id, title: 'M1' },
      ctx
    );
    const material = service.createMaterial(
      'tenant_demo',
      ctx.userId,
      { moduleId: module.id, title: 'Mat', materialType: 'file' },
      ctx
    );

    const updatedGroup = service.updateGroup(
      'tenant_demo',
      ctx.userId,
      group.id,
      { name: 'Group 2' },
      ctx
    );
    const updatedModule = service.updateModule(
      'tenant_demo',
      ctx.userId,
      module.id,
      { minViewSeconds: 15 },
      ctx
    );
    const updatedMaterial = service.updateMaterial(
      'tenant_demo',
      ctx.userId,
      material.id,
      { fileId: 'file_1', isRequired: false },
      ctx
    );

    expect(updatedGroup.name).toBe('Group 2');
    expect(updatedModule.minViewSeconds).toBe(15);
    expect(updatedMaterial.fileId).toBe('file_1');
    expect(
      (await audit.list('tenant_demo')).some((item) => item.action === 'learning.group_updated')
    ).toBe(true);
    expect(
      (await audit.list('tenant_demo')).some((item) => item.action === 'learning.module_updated')
    ).toBe(true);
    expect(
      (await audit.list('tenant_demo')).some((item) => item.action === 'learning.material_updated')
    ).toBe(true);
  });

  it('rejects mass-assignment of immutable fields on update endpoints', () => {
    const service = new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      new AuditService(),
      noopDocumentsService,
      noopFilesService,
      testEmitter
    );
    const group = service.createGroup(
      'tenant_demo',
      ctx.userId,
      { code: 'G-MA-1', name: 'Group MA' },
      ctx
    );
    const course = service.createCourse(
      'tenant_demo',
      ctx.userId,
      { code: 'C-MA-1', title: 'Course MA' },
      ctx
    );

    const updatedGroup = service.updateGroup(
      'tenant_demo',
      ctx.userId,
      group.id,
      { name: 'Group MA Updated', tenantId: 'tenant_other', id: 'group_hijacked' } as any,
      ctx
    );
    const updatedCourse = service.updateCourse(
      'tenant_demo',
      ctx.userId,
      course.id,
      {
        title: 'Course MA Updated',
        tenantId: 'tenant_other',
        id: 'course_hijacked',
        isArchived: true
      } as any,
      ctx
    );

    expect(updatedGroup.id).toBe(group.id);
    expect(updatedGroup.tenantId).toBe('tenant_demo');
    expect(updatedCourse.id).toBe(course.id);
    expect(updatedCourse.tenantId).toBe('tenant_demo');
    expect(updatedCourse.isArchived).toBe(false);
  });

  it('computes plannedEndAt from group course durations and filters by planned_end range', () => {
    const service = new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      new AuditService(),
      noopDocumentsService,
      noopFilesService,
      testEmitter
    );
    const course = service.createCourse(
      'tenant_demo',
      ctx.userId,
      { code: 'C-PLAN', title: 'Plan course' },
      ctx
    );
    const group = service.createGroup(
      'tenant_demo',
      ctx.userId,
      { code: 'G-PLAN', name: 'Plan group' },
      ctx
    );
    service.createGroupCourse('tenant_demo', {
      groupId: group.id,
      courseId: course.id,
      durationDays: 7
    });
    const learner = service.createLearner(
      'tenant_demo',
      ctx.userId,
      { code: 'L-PLAN', name: 'Plan learner' },
      ctx
    );
    const enrollment = service.createEnrollment(
      'tenant_demo',
      ctx.userId,
      { groupId: group.id, learnerId: learner.id },
      ctx
    );
    expect(enrollment.plannedEndAt).toBeDefined();
    const from = new Date(Date.parse(enrollment.enrolledAt) - 86_400_000).toISOString();
    const to = new Date(Date.parse(enrollment.plannedEndAt!) + 86_400_000).toISOString();
    const listed = service.listEnrollments('tenant_demo', {
      planned_end_from: from,
      planned_end_to: to
    });
    expect(listed.items.some((x) => x.id === enrollment.id)).toBe(true);
  });

  it('creates bulk enrollments with idempotency key, errors for missing learners', () => {
    const service = new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      new AuditService(),
      noopDocumentsService,
      noopFilesService,
      testEmitter
    );
    const group = service.createGroup(
      'tenant_demo',
      ctx.userId,
      { code: 'G-BLK', name: 'Bulk G' },
      ctx
    );
    const l1 = service.createLearner(
      'tenant_demo',
      ctx.userId,
      { code: 'L-BLK1', name: 'One' },
      ctx
    );

    const first = service.createBulkEnrollments(
      'tenant_demo',
      ctx.userId,
      {
        idempotencyKey: 'idem-bulk-1',
        groupId: group.id,
        learnerIds: [l1.id, 'no_such_learner', l1.id]
      },
      ctx
    );

    expect(first.created).toHaveLength(1);
    expect(first.errors).toHaveLength(1);

    const second = service.createBulkEnrollments(
      'tenant_demo',
      ctx.userId,
      {
        idempotencyKey: 'idem-bulk-1',
        groupId: group.id,
        learnerIds: [l1.id]
      },
      ctx
    );
    expect(second).toEqual(first);
  });

  it('replay re-attempts a previously-failed learner once it exists (retry, not frozen errors)', () => {
    const state = new InMemoryMvpState();
    const service = new MvpService(
      state,
      new TenantScopedRepository(),
      new AuditService(),
      noopDocumentsService,
      noopFilesService,
      testEmitter
    );
    const group = service.createGroup(
      'tenant_demo',
      ctx.userId,
      { code: 'G-RT', name: 'Retry G' },
      ctx
    );
    const l1 = service.createLearner(
      'tenant_demo',
      ctx.userId,
      { code: 'L-RT1', name: 'Present One' },
      ctx
    );

    // First attempt: l1 enrolls; 'learner_pending' is not yet hydrated → NotFound (transient).
    const first = service.createBulkEnrollments(
      'tenant_demo',
      ctx.userId,
      {
        idempotencyKey: 'payment:o1:g1',
        groupId: group.id,
        learnerIds: [l1.id, 'learner_pending']
      },
      ctx
    );
    expect(first.created).toHaveLength(1);
    expect(first.errors).toHaveLength(1);
    expect(first.errors[0]!.learnerId).toBe('learner_pending');

    // The transient cause is fixed: the learner now exists.
    const now = new Date().toISOString();
    state.learners.push({
      id: 'learner_pending',
      tenantId: 'tenant_demo',
      status: 'active',
      createdAt: now,
      updatedAt: now
    } as never);

    // Retry with the SAME deterministic idempotency key — must re-attempt the failed learner,
    // NOT return the frozen outcome that still lists it under `errors`.
    const second = service.createBulkEnrollments(
      'tenant_demo',
      ctx.userId,
      {
        idempotencyKey: 'payment:o1:g1',
        groupId: group.id,
        learnerIds: [l1.id, 'learner_pending']
      },
      ctx
    );

    expect(second.errors).toHaveLength(0);
    const enrolledLearnerIds = [
      ...second.created.map((e) => e.learnerId),
      ...second.skippedExisting.map((s) => s.learnerId)
    ].sort();
    expect(enrolledLearnerIds).toEqual([l1.id, 'learner_pending'].sort());
    // Cached success preserved — l1 is not re-enrolled (single row, no duplicate).
    expect(state.enrollments.filter((e) => e.learnerId === l1.id)).toHaveLength(1);
  });

  it('bulk enroll merges organizationUnitId with explicit learner ids', () => {
    const service = new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      new AuditService(),
      noopDocumentsService,
      noopFilesService,
      testEmitter
    );
    const group = service.createGroup(
      'tenant_demo',
      ctx.userId,
      { code: 'G-ORG', name: 'Org G' },
      ctx
    );
    const la = service.createLearner(
      'tenant_demo',
      ctx.userId,
      {
        code: 'L-OA',
        name: 'A Alpha',
        organizationUnitId: 'unit_sales'
      },
      ctx
    );
    service.createLearner('tenant_demo', ctx.userId, { code: 'L-OB', name: 'B Beta' }, ctx);

    const bulk = service.createBulkEnrollments(
      'tenant_demo',
      ctx.userId,
      {
        idempotencyKey: 'idem-org-1',
        groupId: group.id,
        organizationUnitId: 'unit_sales',
        learnerIds: []
      },
      ctx
    );
    expect(bulk.created.map((e) => e.learnerId)).toEqual([la.id]);
  });

  it('lists learners only for requested tenant', () => {
    const service = new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      new AuditService(),
      noopDocumentsService,
      noopFilesService,
      testEmitter
    );
    const ctxB = {
      ...ctx,
      tenantId: 'tenant_b',
      roles: [],
      permissions: ['*']
    } as typeof ctx;

    service.createLearner('tenant_demo', ctx.userId, { code: 'L-TA', name: 'On A' }, ctx);
    service.createLearner('tenant_b', ctx.userId, { code: 'L-TB', name: 'On B' }, ctxB);

    const onA = service.listLearners('tenant_demo', {});
    expect(onA.items).toHaveLength(1);
    expect(onA.items[0]?.tenantId).toBe('tenant_demo');
    const onB = service.listLearners('tenant_b', {});
    expect(onB.items).toHaveLength(1);
    expect(onB.items[0]?.tenantId).toBe('tenant_b');
  });

  it('getById is tenant-scoped: duplicate ids across tenants resolve correctly; foreign id is not_found', () => {
    const state = new InMemoryMvpState();
    const service = new MvpService(
      state,
      new TenantScopedRepository(),
      new AuditService(),
      noopDocumentsService,
      noopFilesService,
      testEmitter
    );
    const now = new Date().toISOString();
    const sharedId = 'course_shared_cross_tenant';
    state.courses.push({
      id: sharedId,
      tenantId: 'tenant_demo',
      code: 'ON_DEMO',
      title: 'Demo',
      description: undefined,
      status: 'draft',
      isArchived: false,
      createdAt: now,
      updatedAt: now
    });
    state.courses.push({
      id: sharedId,
      tenantId: 'tenant_other',
      code: 'ON_OTHER',
      title: 'Other',
      description: undefined,
      status: 'draft',
      isArchived: false,
      createdAt: now,
      updatedAt: now
    });

    expect(service.getCourse('tenant_demo', sharedId).code).toBe('ON_DEMO');
    expect(service.getCourse('tenant_other', sharedId).code).toBe('ON_OTHER');

    expect(() => service.getCourse('tenant_demo', 'course_only_other_tenant')).toThrow(
      NotFoundException
    );
  });
});

// === Pillar A — Plan A (§5.1, §5.2, §5.3) ===

function makeService(): MvpService {
  return new MvpService(
    new InMemoryMvpState(),
    new TenantScopedRepository(),
    new AuditService(),
    noopDocumentsService,
    noopFilesService,
    new EventEmitter2()
  );
}

describe('MvpService — commissions (Plan A §5.2)', () => {
  describe('createCommission', () => {
    it('creates active commission with provided code and name', () => {
      const service = makeService();
      const commission = service.createCommission(
        'tenant_demo',
        ctx.userId,
        { code: 'OT_2026', name: 'Аттестационная комиссия ОТ 2026', description: 'desc' },
        ctx
      );
      expect(commission.code).toBe('OT_2026');
      expect(commission.name).toBe('Аттестационная комиссия ОТ 2026');
      expect(commission.description).toBe('desc');
      expect(commission.status).toBe('active');
      expect(commission.tenantId).toBe('tenant_demo');
      expect(commission.id).toMatch(/^commission_/);
    });

    it('throws ConflictException on duplicate code within tenant', () => {
      const service = makeService();
      service.createCommission('tenant_demo', ctx.userId, { code: 'C1', name: 'First' }, ctx);
      expect(() =>
        service.createCommission('tenant_demo', ctx.userId, { code: 'C1', name: 'Duplicate' }, ctx)
      ).toThrow(ConflictException);
    });

    it('allows same code in different tenants', () => {
      const service = makeService();
      service.createCommission('tenant_demo', ctx.userId, { code: 'C1', name: 'T1' }, ctx);
      const t2 = service.createCommission(
        'tenant_other',
        ctx.userId,
        { code: 'C1', name: 'T2' },
        ctx
      );
      expect(t2.tenantId).toBe('tenant_other');
    });
  });

  describe('archiveCommission', () => {
    it('archives an active commission', () => {
      const service = makeService();
      const c = service.createCommission('tenant_demo', ctx.userId, { code: 'C1', name: 'C' }, ctx);
      const archived = service.archiveCommission('tenant_demo', ctx.userId, c.id, ctx);
      expect(archived.status).toBe('archived');
    });

    it('is idempotent — re-archiving stays archived without error', () => {
      const service = makeService();
      const c = service.createCommission('tenant_demo', ctx.userId, { code: 'C1', name: 'C' }, ctx);
      service.archiveCommission('tenant_demo', ctx.userId, c.id, ctx);
      const again = service.archiveCommission('tenant_demo', ctx.userId, c.id, ctx);
      expect(again.status).toBe('archived');
    });

    it('rejects archive of foreign-tenant commission with NotFoundException', () => {
      const service = makeService();
      const c = service.createCommission('tenant_demo', ctx.userId, { code: 'C1', name: 'C' }, ctx);
      expect(() => service.archiveCommission('tenant_other', ctx.userId, c.id, ctx)).toThrow(
        NotFoundException
      );
    });
  });

  describe('updateCommission', () => {
    it('updates name and description, preserves code', () => {
      const service = makeService();
      const c = service.createCommission(
        'tenant_demo',
        ctx.userId,
        { code: 'C1', name: 'Old' },
        ctx
      );
      const updated = service.updateCommission(
        'tenant_demo',
        ctx.userId,
        c.id,
        { name: 'New', description: 'd2' },
        ctx
      );
      expect(updated.name).toBe('New');
      expect(updated.description).toBe('d2');
      expect(updated.code).toBe('C1');
    });

    it('clears description when an empty string is sent', () => {
      const service = makeService();
      const c = service.createCommission(
        'tenant_demo',
        ctx.userId,
        { code: 'C1', name: 'C', description: 'old' },
        ctx
      );
      const updated = service.updateCommission(
        'tenant_demo',
        ctx.userId,
        c.id,
        { name: 'C', description: '' },
        ctx
      );
      expect(updated.description).toBe('');
    });
  });

  describe('addCommissionMember', () => {
    it('adds chairman as internal user', () => {
      const service = makeService();
      const c = service.createCommission('tenant_demo', ctx.userId, { code: 'C1', name: 'C' }, ctx);
      const m = service.addCommissionMember(
        'tenant_demo',
        ctx.userId,
        c.id,
        { role: 'chairman', userId: 'u_chair', positionInOrder: 0 },
        ctx
      );
      expect(m.role).toBe('chairman');
      expect(m.userId).toBe('u_chair');
      expect(m.externalFullName).toBeUndefined();
      expect(m.positionInOrder).toBe(0);
    });

    it('adds external_expert without userId', () => {
      const service = makeService();
      const c = service.createCommission('tenant_demo', ctx.userId, { code: 'C1', name: 'C' }, ctx);
      const m = service.addCommissionMember(
        'tenant_demo',
        ctx.userId,
        c.id,
        {
          role: 'external_expert',
          externalFullName: 'Иванов И.И.',
          externalPosition: 'Эксперт',
          positionInOrder: 1
        },
        ctx
      );
      expect(m.externalFullName).toBe('Иванов И.И.');
      expect(m.userId).toBeUndefined();
    });

    it('rejects when neither userId nor externalFullName provided (BadRequestException)', () => {
      const service = makeService();
      const c = service.createCommission('tenant_demo', ctx.userId, { code: 'C1', name: 'C' }, ctx);
      expect(() =>
        service.addCommissionMember(
          'tenant_demo',
          ctx.userId,
          c.id,
          { role: 'member', positionInOrder: 0 },
          ctx
        )
      ).toThrow(BadRequestException);
    });

    it('rejects adding member to archived commission', () => {
      const service = makeService();
      const c = service.createCommission('tenant_demo', ctx.userId, { code: 'C1', name: 'C' }, ctx);
      service.archiveCommission('tenant_demo', ctx.userId, c.id, ctx);
      expect(() =>
        service.addCommissionMember(
          'tenant_demo',
          ctx.userId,
          c.id,
          { role: 'member', userId: 'u_1', positionInOrder: 0 },
          ctx
        )
      ).toThrow(BadRequestException);
    });

    it('rejects adding member to non-existent commission', () => {
      const service = makeService();
      expect(() =>
        service.addCommissionMember(
          'tenant_demo',
          ctx.userId,
          'commission_nonexistent',
          { role: 'member', userId: 'u_1', positionInOrder: 0 },
          ctx
        )
      ).toThrow(NotFoundException);
    });
  });

  describe('removeCommissionMember', () => {
    it('removes member by id', () => {
      const service = makeService();
      const c = service.createCommission('tenant_demo', ctx.userId, { code: 'C1', name: 'C' }, ctx);
      const m = service.addCommissionMember(
        'tenant_demo',
        ctx.userId,
        c.id,
        { role: 'member', userId: 'u_1', positionInOrder: 0 },
        ctx
      );
      service.removeCommissionMember('tenant_demo', ctx.userId, c.id, m.id, ctx);
      expect(service.listCommissionMembers('tenant_demo', c.id)).toHaveLength(0);
    });

    it('throws NotFoundException for unknown member id', () => {
      const service = makeService();
      const c = service.createCommission('tenant_demo', ctx.userId, { code: 'C1', name: 'C' }, ctx);
      expect(() =>
        service.removeCommissionMember('tenant_demo', ctx.userId, c.id, 'member_nope', ctx)
      ).toThrow(NotFoundException);
    });
  });

  describe('listCommissions and getCommission', () => {
    it('filters by status when provided', () => {
      const service = makeService();
      const a = service.createCommission('tenant_demo', ctx.userId, { code: 'A', name: 'A' }, ctx);
      const b = service.createCommission('tenant_demo', ctx.userId, { code: 'B', name: 'B' }, ctx);
      service.archiveCommission('tenant_demo', ctx.userId, b.id, ctx);
      const active = service.listCommissions('tenant_demo', 'active');
      const archived = service.listCommissions('tenant_demo', 'archived');
      expect(active.map((c) => c.id)).toEqual([a.id]);
      expect(archived.map((c) => c.id)).toEqual([b.id]);
    });

    it('lists all when status filter omitted', () => {
      const service = makeService();
      service.createCommission('tenant_demo', ctx.userId, { code: 'A', name: 'A' }, ctx);
      const b = service.createCommission('tenant_demo', ctx.userId, { code: 'B', name: 'B' }, ctx);
      service.archiveCommission('tenant_demo', ctx.userId, b.id, ctx);
      expect(service.listCommissions('tenant_demo')).toHaveLength(2);
    });

    it('does not return commissions from other tenants', () => {
      const service = makeService();
      service.createCommission('tenant_demo', ctx.userId, { code: 'A', name: 'A' }, ctx);
      service.createCommission('tenant_other', ctx.userId, { code: 'A', name: 'A2' }, ctx);
      const items = service.listCommissions('tenant_demo');
      expect(items).toHaveLength(1);
      expect(items[0].tenantId).toBe('tenant_demo');
    });

    it('listCommissionMembers returns members sorted by positionInOrder', () => {
      const service = makeService();
      const c = service.createCommission('tenant_demo', ctx.userId, { code: 'C1', name: 'C' }, ctx);
      service.addCommissionMember(
        'tenant_demo',
        ctx.userId,
        c.id,
        { role: 'member', userId: 'u_2', positionInOrder: 2 },
        ctx
      );
      service.addCommissionMember(
        'tenant_demo',
        ctx.userId,
        c.id,
        { role: 'chairman', userId: 'u_0', positionInOrder: 0 },
        ctx
      );
      service.addCommissionMember(
        'tenant_demo',
        ctx.userId,
        c.id,
        { role: 'secretary', userId: 'u_1', positionInOrder: 1 },
        ctx
      );
      const members = service.listCommissionMembers('tenant_demo', c.id);
      expect(members.map((m) => m.role)).toEqual(['chairman', 'secretary', 'member']);
    });
  });
});

describe('MvpService — program meta and publish (Plan A §5.1)', () => {
  function seedCourseVersionAndCommission(service: MvpService) {
    const course = service.createCourse(
      'tenant_demo',
      ctx.userId,
      { code: 'C1', title: 'Курс' },
      ctx
    );
    const cv = service.createCourseVersion('tenant_demo', course.id);
    const commission = service.createCommission(
      'tenant_demo',
      ctx.userId,
      { code: 'CM1', name: 'C' },
      ctx
    );
    return { courseId: course.id, courseVersionId: cv.id, commissionId: commission.id };
  }

  const completeMeta = (commissionId: string) => ({
    academicHours: 40,
    trainingType: 'primary' as const,
    learnerCategory: 'worker' as const,
    studyForm: 'distance' as const,
    finalAssessmentForm: 'test' as const,
    regulatoryBasisCodes: ['PP_2464_2022'],
    commissionId
  });

  describe('updateProgramMeta', () => {
    it('sets program meta fields on a draft course version', () => {
      const service = makeService();
      const { courseVersionId, commissionId } = seedCourseVersionAndCommission(service);

      const updated = service.updateProgramMeta(
        'tenant_demo',
        ctx.userId,
        courseVersionId,
        completeMeta(commissionId),
        ctx
      );

      expect(updated.academicHours).toBe(40);
      expect(updated.trainingType).toBe('primary');
      expect(updated.commissionId).toBe(commissionId);
      expect(updated.regulatoryBasisCodes).toEqual(['PP_2464_2022']);
    });

    it('rejects update on a published version', async () => {
      const service = makeService();
      const { courseVersionId, commissionId } = seedCourseVersionAndCommission(service);
      service.updateProgramMeta(
        'tenant_demo',
        ctx.userId,
        courseVersionId,
        completeMeta(commissionId),
        ctx
      );
      await service.publishCourseVersion('tenant_demo', ctx.userId, courseVersionId, ctx);

      expect(() =>
        service.updateProgramMeta(
          'tenant_demo',
          ctx.userId,
          courseVersionId,
          { academicHours: 32 },
          ctx
        )
      ).toThrow(BadRequestException);
    });

    it('rejects unknown commissionId', () => {
      const service = makeService();
      const { courseVersionId } = seedCourseVersionAndCommission(service);
      expect(() =>
        service.updateProgramMeta(
          'tenant_demo',
          ctx.userId,
          courseVersionId,
          { commissionId: 'commission_nope' },
          ctx
        )
      ).toThrow(BadRequestException);
    });

    it('rejects archived commission', () => {
      const service = makeService();
      const { courseVersionId, commissionId } = seedCourseVersionAndCommission(service);
      service.archiveCommission('tenant_demo', ctx.userId, commissionId, ctx);
      expect(() =>
        service.updateProgramMeta('tenant_demo', ctx.userId, courseVersionId, { commissionId }, ctx)
      ).toThrow(BadRequestException);
    });

    it('preserves existing fields when patch omits them', () => {
      const service = makeService();
      const { courseVersionId, commissionId } = seedCourseVersionAndCommission(service);
      service.updateProgramMeta(
        'tenant_demo',
        ctx.userId,
        courseVersionId,
        { academicHours: 16, trainingType: 'primary' },
        ctx
      );
      const updated = service.updateProgramMeta(
        'tenant_demo',
        ctx.userId,
        courseVersionId,
        { commissionId },
        ctx
      );
      expect(updated.academicHours).toBe(16);
      expect(updated.trainingType).toBe('primary');
      expect(updated.commissionId).toBe(commissionId);
    });

    it('clears trainingType when null is sent (normalizes to undefined)', () => {
      const service = makeService();
      const { courseVersionId, commissionId } = seedCourseVersionAndCommission(service);
      service.updateProgramMeta(
        'tenant_demo',
        ctx.userId,
        courseVersionId,
        completeMeta(commissionId),
        ctx
      );

      const updated = service.updateProgramMeta(
        'tenant_demo',
        ctx.userId,
        courseVersionId,
        { trainingType: null },
        ctx
      );

      expect(updated.trainingType).toBeUndefined();
    });

    it('detaches commission when commissionId is null, without throwing', () => {
      const service = makeService();
      const { courseVersionId, commissionId } = seedCourseVersionAndCommission(service);
      service.updateProgramMeta(
        'tenant_demo',
        ctx.userId,
        courseVersionId,
        completeMeta(commissionId),
        ctx
      );

      const updated = service.updateProgramMeta(
        'tenant_demo',
        ctx.userId,
        courseVersionId,
        { commissionId: null },
        ctx
      );

      expect(updated.commissionId).toBeUndefined();
    });

    it('clears only the targeted field and keeps omitted ones intact', () => {
      const service = makeService();
      const { courseVersionId, commissionId } = seedCourseVersionAndCommission(service);
      service.updateProgramMeta(
        'tenant_demo',
        ctx.userId,
        courseVersionId,
        completeMeta(commissionId),
        ctx
      );

      const updated = service.updateProgramMeta(
        'tenant_demo',
        ctx.userId,
        courseVersionId,
        { studyForm: null },
        ctx
      );

      expect(updated.studyForm).toBeUndefined();
      expect(updated.academicHours).toBe(40);
      expect(updated.trainingType).toBe('primary');
      expect(updated.commissionId).toBe(commissionId);
    });

    it('clears regulatoryBasisCodes when an empty array is sent', () => {
      const service = makeService();
      const { courseVersionId, commissionId } = seedCourseVersionAndCommission(service);
      service.updateProgramMeta(
        'tenant_demo',
        ctx.userId,
        courseVersionId,
        completeMeta(commissionId),
        ctx
      );

      const updated = service.updateProgramMeta(
        'tenant_demo',
        ctx.userId,
        courseVersionId,
        { regulatoryBasisCodes: [] },
        ctx
      );

      expect(updated.regulatoryBasisCodes).toEqual([]);
    });
  });

  describe('publishCourseVersion', () => {
    it('publishes when all required meta set and commission active', async () => {
      const service = makeService();
      const { courseVersionId, commissionId } = seedCourseVersionAndCommission(service);
      service.updateProgramMeta(
        'tenant_demo',
        ctx.userId,
        courseVersionId,
        completeMeta(commissionId),
        ctx
      );
      const published = await service.publishCourseVersion(
        'tenant_demo',
        ctx.userId,
        courseVersionId,
        ctx
      );
      expect(published.status).toBe('published');
    });

    it('returns same entity when already published (idempotent)', async () => {
      const service = makeService();
      const { courseVersionId, commissionId } = seedCourseVersionAndCommission(service);
      service.updateProgramMeta(
        'tenant_demo',
        ctx.userId,
        courseVersionId,
        completeMeta(commissionId),
        ctx
      );
      await service.publishCourseVersion('tenant_demo', ctx.userId, courseVersionId, ctx);
      const again = await service.publishCourseVersion(
        'tenant_demo',
        ctx.userId,
        courseVersionId,
        ctx
      );
      expect(again.status).toBe('published');
    });

    it('rejects publish without academic_hours', async () => {
      const service = makeService();
      const { courseVersionId, commissionId } = seedCourseVersionAndCommission(service);
      const { academicHours: _omit, ...withoutHours } = completeMeta(commissionId);
      void _omit;
      service.updateProgramMeta('tenant_demo', ctx.userId, courseVersionId, withoutHours, ctx);
      await expect(
        service.publishCourseVersion('tenant_demo', ctx.userId, courseVersionId, ctx)
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects publish without training_type', async () => {
      const service = makeService();
      const { courseVersionId, commissionId } = seedCourseVersionAndCommission(service);
      const { trainingType: _omit, ...withoutType } = completeMeta(commissionId);
      void _omit;
      service.updateProgramMeta('tenant_demo', ctx.userId, courseVersionId, withoutType, ctx);
      await expect(
        service.publishCourseVersion('tenant_demo', ctx.userId, courseVersionId, ctx)
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects publish without regulatory_basis', async () => {
      const service = makeService();
      const { courseVersionId, commissionId } = seedCourseVersionAndCommission(service);
      service.updateProgramMeta(
        'tenant_demo',
        ctx.userId,
        courseVersionId,
        { ...completeMeta(commissionId), regulatoryBasisCodes: [] },
        ctx
      );
      await expect(
        service.publishCourseVersion('tenant_demo', ctx.userId, courseVersionId, ctx)
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects publish without commission attached', async () => {
      const service = makeService();
      const { courseVersionId, commissionId } = seedCourseVersionAndCommission(service);
      const { commissionId: _omit, ...withoutCommission } = completeMeta(commissionId);
      void _omit;
      service.updateProgramMeta('tenant_demo', ctx.userId, courseVersionId, withoutCommission, ctx);
      await expect(
        service.publishCourseVersion('tenant_demo', ctx.userId, courseVersionId, ctx)
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects publish when attached commission was archived after attach', async () => {
      const service = makeService();
      const { courseVersionId, commissionId } = seedCourseVersionAndCommission(service);
      service.updateProgramMeta(
        'tenant_demo',
        ctx.userId,
        courseVersionId,
        completeMeta(commissionId),
        ctx
      );
      service.archiveCommission('tenant_demo', ctx.userId, commissionId, ctx);
      await expect(
        service.publishCourseVersion('tenant_demo', ctx.userId, courseVersionId, ctx)
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException for unknown courseVersionId', async () => {
      const service = makeService();
      await expect(
        service.publishCourseVersion('tenant_demo', ctx.userId, 'cver_nope', ctx)
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects publish when no active license matches trainingType (Plan C §5.10)', async () => {
      const { LicensesService } = await import('../org/licenses.service.js');
      const { InMemoryLicensesRepository } =
        await import('../org/in-memory-licenses.repository.js');
      const licensesService = new LicensesService(
        new InMemoryLicensesRepository(),
        new AuditService()
      );

      const service = new MvpService(
        new InMemoryMvpState(),
        new TenantScopedRepository(),
        new AuditService(),
        noopDocumentsService,
        noopFilesService,
        new EventEmitter2(),
        licensesService
      );

      const { courseVersionId, commissionId } = seedCourseVersionAndCommission(service);
      service.updateProgramMeta(
        'tenant_demo',
        ctx.userId,
        courseVersionId,
        completeMeta(commissionId),
        ctx
      );

      // No licenses created — publish must fail.
      await expect(
        service.publishCourseVersion('tenant_demo', ctx.userId, courseVersionId, ctx)
      ).rejects.toThrow(/no_matching_license|нет активной лицензии/);

      // Create a permissive license — publish must succeed.
      await licensesService.create(
        'tenant_demo',
        ctx.userId,
        {
          licenseType: 'education_license',
          licenseNumber: 'L-001',
          issuerName: 'Рособрнадзор',
          issuedAt: '2024-01-01'
        },
        ctx
      );
      const published = await service.publishCourseVersion(
        'tenant_demo',
        ctx.userId,
        courseVersionId,
        ctx
      );
      expect(published.status).toBe('published');
    });
  });
});

describe('createGroupCourse — version pinning (§5.159)', () => {
  it('pins courseVersionId to the only published version at attach time', () => {
    const service = makeService();
    const course = service.createCourse(
      'tenant_demo',
      ctx.userId,
      { code: 'CP', title: 'Pin' },
      ctx
    );
    const group = service.createGroup('tenant_demo', ctx.userId, { code: 'GP', name: 'GP' }, ctx);
    const v1 = service.createCourseVersion('tenant_demo', course.id);
    (v1 as { status: string }).status = 'published';
    const gc = service.createGroupCourse('tenant_demo', {
      groupId: group.id,
      courseId: course.id
    });
    expect(gc.courseVersionId).toBe(v1.id);
  });

  it('pins to the latest published version (by versionNo) when several are published', () => {
    const service = makeService();
    const course = service.createCourse(
      'tenant_demo',
      ctx.userId,
      { code: 'CP', title: 'Pin' },
      ctx
    );
    const group = service.createGroup('tenant_demo', ctx.userId, { code: 'GP', name: 'GP' }, ctx);
    const v1 = service.createCourseVersion('tenant_demo', course.id);
    (v1 as { status: string }).status = 'published';
    const v2 = service.createCourseVersion('tenant_demo', course.id);
    (v2 as { status: string }).status = 'published';
    const gc = service.createGroupCourse('tenant_demo', {
      groupId: group.id,
      courseId: course.id
    });
    expect(gc.courseVersionId).toBe(v2.id);
  });

  it('leaves courseVersionId unset when the course has no published version', () => {
    const service = makeService();
    const course = service.createCourse(
      'tenant_demo',
      ctx.userId,
      { code: 'CP', title: 'Pin' },
      ctx
    );
    const group = service.createGroup('tenant_demo', ctx.userId, { code: 'GP', name: 'GP' }, ctx);
    service.createCourseVersion('tenant_demo', course.id); // draft only
    const gc = service.createGroupCourse('tenant_demo', {
      groupId: group.id,
      courseId: course.id
    });
    expect(gc.courseVersionId).toBeUndefined();
  });
});

describe('MvpService — course document sets (Plan A §5.3)', () => {
  function makeServiceWithTemplates(
    templates: Array<{ id: string; tenantId: string; name?: string; templateType?: string }>
  ): MvpService {
    const docs = {
      listDocuments: () => ({ items: [], page: 1, pageSize: 50, total: 0 }),
      getTemplate: (tenantId: string, id: string) => {
        const t = templates.find((x) => x.tenantId === tenantId && x.id === id);
        if (!t) throw new NotFoundException(`Template ${id} not found`);
        return t;
      }
    } as unknown as DocumentsService;
    return new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      new AuditService(),
      docs,
      noopFilesService,
      new EventEmitter2()
    );
  }

  function seed(service: MvpService): { courseVersionId: string } {
    const course = service.createCourse('tenant_demo', ctx.userId, { code: 'C1', title: 'C' }, ctx);
    const cv = service.createCourseVersion('tenant_demo', course.id);
    return { courseVersionId: cv.id };
  }

  it('creates entries with sequential positions 0..N-1', () => {
    const service = makeServiceWithTemplates([
      { id: 'tpl_protocol', tenantId: 'tenant_demo' },
      { id: 'tpl_cert', tenantId: 'tenant_demo' }
    ]);
    const { courseVersionId } = seed(service);

    const result = service.setCourseDocumentSet(
      'tenant_demo',
      ctx.userId,
      courseVersionId,
      {
        entries: [
          {
            templateId: 'tpl_protocol',
            position: 0,
            isRequired: true,
            autoIssueOnCompletion: true
          },
          { templateId: 'tpl_cert', position: 1, isRequired: true, autoIssueOnCompletion: true }
        ]
      },
      ctx
    );

    expect(result).toHaveLength(2);
    expect(result.map((e) => e.templateId)).toEqual(['tpl_protocol', 'tpl_cert']);
    expect(result.map((e) => e.position)).toEqual([0, 1]);
  });

  it('replaces existing set on second call (PUT semantics)', () => {
    const service = makeServiceWithTemplates([
      { id: 'tpl_a', tenantId: 'tenant_demo' },
      { id: 'tpl_b', tenantId: 'tenant_demo' }
    ]);
    const { courseVersionId } = seed(service);

    service.setCourseDocumentSet(
      'tenant_demo',
      ctx.userId,
      courseVersionId,
      {
        entries: [
          { templateId: 'tpl_a', position: 0, isRequired: true, autoIssueOnCompletion: true }
        ]
      },
      ctx
    );
    service.setCourseDocumentSet(
      'tenant_demo',
      ctx.userId,
      courseVersionId,
      {
        entries: [
          { templateId: 'tpl_b', position: 0, isRequired: true, autoIssueOnCompletion: true }
        ]
      },
      ctx
    );

    const set = service.getCourseDocumentSet('tenant_demo', courseVersionId);
    expect(set).toHaveLength(1);
    expect(set[0].templateId).toBe('tpl_b');
  });

  it('allows clearing the set by passing empty entries', () => {
    const service = makeServiceWithTemplates([{ id: 'tpl_a', tenantId: 'tenant_demo' }]);
    const { courseVersionId } = seed(service);

    service.setCourseDocumentSet(
      'tenant_demo',
      ctx.userId,
      courseVersionId,
      {
        entries: [
          { templateId: 'tpl_a', position: 0, isRequired: true, autoIssueOnCompletion: true }
        ]
      },
      ctx
    );
    service.setCourseDocumentSet('tenant_demo', ctx.userId, courseVersionId, { entries: [] }, ctx);

    expect(service.getCourseDocumentSet('tenant_demo', courseVersionId)).toHaveLength(0);
  });

  it('rejects non-sequential positions (gap 0, 2)', () => {
    const service = makeServiceWithTemplates([
      { id: 'tpl_a', tenantId: 'tenant_demo' },
      { id: 'tpl_b', tenantId: 'tenant_demo' }
    ]);
    const { courseVersionId } = seed(service);

    expect(() =>
      service.setCourseDocumentSet(
        'tenant_demo',
        ctx.userId,
        courseVersionId,
        {
          entries: [
            { templateId: 'tpl_a', position: 0, isRequired: true, autoIssueOnCompletion: true },
            { templateId: 'tpl_b', position: 2, isRequired: true, autoIssueOnCompletion: true }
          ]
        },
        ctx
      )
    ).toThrow(BadRequestException);
  });

  it('rejects duplicate positions', () => {
    const service = makeServiceWithTemplates([
      { id: 'tpl_a', tenantId: 'tenant_demo' },
      { id: 'tpl_b', tenantId: 'tenant_demo' }
    ]);
    const { courseVersionId } = seed(service);

    expect(() =>
      service.setCourseDocumentSet(
        'tenant_demo',
        ctx.userId,
        courseVersionId,
        {
          entries: [
            { templateId: 'tpl_a', position: 0, isRequired: true, autoIssueOnCompletion: true },
            { templateId: 'tpl_b', position: 0, isRequired: false, autoIssueOnCompletion: false }
          ]
        },
        ctx
      )
    ).toThrow(BadRequestException);
  });

  it('rejects unknown templateId', () => {
    const service = makeServiceWithTemplates([]);
    const { courseVersionId } = seed(service);

    expect(() =>
      service.setCourseDocumentSet(
        'tenant_demo',
        ctx.userId,
        courseVersionId,
        {
          entries: [
            {
              templateId: 'tpl_nope',
              position: 0,
              isRequired: true,
              autoIssueOnCompletion: true
            }
          ]
        },
        ctx
      )
    ).toThrow(BadRequestException);
  });

  it('rejects unknown courseVersionId', () => {
    const service = makeServiceWithTemplates([{ id: 'tpl_a', tenantId: 'tenant_demo' }]);
    expect(() =>
      service.setCourseDocumentSet(
        'tenant_demo',
        ctx.userId,
        'cver_nope',
        {
          entries: [
            { templateId: 'tpl_a', position: 0, isRequired: true, autoIssueOnCompletion: true }
          ]
        },
        ctx
      )
    ).toThrow(NotFoundException);
  });

  it('rejects template from another tenant', () => {
    const service = makeServiceWithTemplates([{ id: 'tpl_other', tenantId: 'tenant_other' }]);
    const { courseVersionId } = seed(service);
    expect(() =>
      service.setCourseDocumentSet(
        'tenant_demo',
        ctx.userId,
        courseVersionId,
        {
          entries: [
            {
              templateId: 'tpl_other',
              position: 0,
              isRequired: true,
              autoIssueOnCompletion: true
            }
          ]
        },
        ctx
      )
    ).toThrow(BadRequestException);
  });

  it('getCourseDocumentSet returns entries sorted by position', () => {
    const service = makeServiceWithTemplates([
      { id: 'tpl_a', tenantId: 'tenant_demo' },
      { id: 'tpl_b', tenantId: 'tenant_demo' },
      { id: 'tpl_c', tenantId: 'tenant_demo' }
    ]);
    const { courseVersionId } = seed(service);

    service.setCourseDocumentSet(
      'tenant_demo',
      ctx.userId,
      courseVersionId,
      {
        entries: [
          { templateId: 'tpl_c', position: 2, isRequired: true, autoIssueOnCompletion: true },
          { templateId: 'tpl_a', position: 0, isRequired: true, autoIssueOnCompletion: true },
          { templateId: 'tpl_b', position: 1, isRequired: true, autoIssueOnCompletion: true }
        ]
      },
      ctx
    );

    const set = service.getCourseDocumentSet('tenant_demo', courseVersionId);
    expect(set.map((e) => e.templateId)).toEqual(['tpl_a', 'tpl_b', 'tpl_c']);
  });

  it('does not leak entries across tenants', () => {
    const service = makeServiceWithTemplates([
      { id: 'tpl_a', tenantId: 'tenant_demo' },
      { id: 'tpl_b', tenantId: 'tenant_other' }
    ]);
    const c1 = service.createCourse('tenant_demo', ctx.userId, { code: 'C1', title: 'C' }, ctx);
    const cv1 = service.createCourseVersion('tenant_demo', c1.id);
    const c2 = service.createCourse('tenant_other', ctx.userId, { code: 'C2', title: 'C' }, ctx);
    const cv2 = service.createCourseVersion('tenant_other', c2.id);

    service.setCourseDocumentSet(
      'tenant_demo',
      ctx.userId,
      cv1.id,
      {
        entries: [
          { templateId: 'tpl_a', position: 0, isRequired: true, autoIssueOnCompletion: true }
        ]
      },
      ctx
    );

    expect(service.getCourseDocumentSet('tenant_other', cv2.id)).toHaveLength(0);
    expect(service.getCourseDocumentSet('tenant_demo', cv1.id)).toHaveLength(1);
  });
});

describe('MvpService.listFrdoDocumentKinds (ФРДО)', () => {
  it('returns 2 active ДПО kinds keyed by template type', () => {
    const service = new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      new AuditService(),
      noopDocumentsService,
      noopFilesService,
      testEmitter
    );
    const kinds = service.listFrdoDocumentKinds();
    expect(kinds.map((k) => k.templateType).sort()).toEqual(['certificate', 'diploma']);
    expect(kinds.every((k) => k.educationLevel === 'ДПО')).toBe(true);
  });
});

describe('MvpService — dateOfBirth (ФРДО)', () => {
  it('persists dateOfBirth on create and update', () => {
    const service = new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      new AuditService(),
      noopDocumentsService,
      noopFilesService,
      testEmitter
    );
    const created = service.createLearnerExtended(
      'tenant_demo',
      'admin-1',
      { firstName: 'Иван', lastName: 'Иванов', dateOfBirth: '1990-05-01' },
      ctx
    );
    expect(created.dateOfBirth).toBe('1990-05-01');
    const updated = service.updateLearnerExtended(
      'tenant_demo',
      'admin-1',
      created.id,
      { dateOfBirth: '1991-06-02' },
      ctx
    );
    expect(updated.dateOfBirth).toBe('1991-06-02');
  });
});

describe('MvpService — updateLearnerExtended (Phase 2 Plan B §Task2)', () => {
  it('updates all extended fields and writes audit', async () => {
    const audit = new AuditService();
    const service = new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      audit,
      noopDocumentsService,
      noopFilesService,
      testEmitter
    );

    const learner = service.createLearnerExtended(
      'tenant_demo',
      'admin-1',
      { firstName: 'Иван', lastName: 'Иванов', email: 'old@x.ru' },
      ctx
    );

    const updated = service.updateLearnerExtended(
      'tenant_demo',
      'admin-1',
      learner.id,
      {
        firstName: 'Пётр',
        middleName: 'Сергеевич',
        email: 'new@x.ru',
        snils: '123-456-789 01',
        position: 'инженер',
        status: 'archived'
      },
      ctx
    );

    expect(updated.firstName).toBe('Пётр');
    expect(updated.lastName).toBe('Иванов'); // не трогали
    expect(updated.middleName).toBe('Сергеевич');
    expect(updated.email).toBe('new@x.ru');
    expect(updated.snils).toBe('123-456-789 01');
    expect(updated.position).toBe('инженер');
    expect(updated.status).toBe('archived');
    expect(
      (await audit.list('tenant_demo')).some(
        (item) => item.action === 'learning.learner_updated' && item.entityId === learner.id
      )
    ).toBe(true);
  });

  it('clears nullable fields when null is provided', () => {
    const service = new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      new AuditService(),
      noopDocumentsService,
      noopFilesService,
      testEmitter
    );
    const learner = service.createLearnerExtended(
      'tenant_demo',
      'admin-1',
      {
        firstName: 'A',
        lastName: 'B',
        middleName: 'C',
        email: 'a@b.ru',
        snils: '111-111-111 02',
        position: 'p'
      },
      ctx
    );
    const updated = service.updateLearnerExtended(
      'tenant_demo',
      'admin-1',
      learner.id,
      { middleName: null, email: null, snils: null, position: null },
      ctx
    );
    expect(updated.middleName).toBeUndefined();
    expect(updated.email).toBeUndefined();
    expect(updated.snils).toBeUndefined();
    expect(updated.position).toBeUndefined();
  });

  it('throws NotFoundException for unknown learner', () => {
    const service = new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      new AuditService(),
      noopDocumentsService,
      noopFilesService,
      testEmitter
    );
    expect(() =>
      service.updateLearnerExtended(
        'tenant_demo',
        'admin-1',
        'learner-nope',
        { firstName: 'X' },
        ctx
      )
    ).toThrow(/not found/i);
  });

  it('refuses to overwrite linkedIamUserId with a different value', () => {
    const service = new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      new AuditService(),
      noopDocumentsService,
      noopFilesService,
      testEmitter
    );
    const learner = service.createLearnerExtended(
      'tenant_demo',
      'admin-1',
      { firstName: 'A', lastName: 'B' },
      ctx
    );
    service.updateLearnerExtended(
      'tenant_demo',
      'admin-1',
      learner.id,
      { linkedIamUserId: 'user-1' },
      ctx
    );
    expect(() =>
      service.updateLearnerExtended(
        'tenant_demo',
        'admin-1',
        learner.id,
        { linkedIamUserId: 'user-2' },
        ctx
      )
    ).toThrow(/already bound/i);
  });

  it('allows clear-then-reassign of linkedIamUserId', () => {
    const service = new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      new AuditService(),
      noopDocumentsService,
      noopFilesService,
      testEmitter
    );
    const learner = service.createLearnerExtended(
      'tenant_demo',
      'admin-1',
      { firstName: 'A', lastName: 'B' },
      ctx
    );
    service.updateLearnerExtended(
      'tenant_demo',
      'admin-1',
      learner.id,
      { linkedIamUserId: 'user-1' },
      ctx
    );
    service.updateLearnerExtended(
      'tenant_demo',
      'admin-1',
      learner.id,
      { linkedIamUserId: null },
      ctx
    );
    const reassigned = service.updateLearnerExtended(
      'tenant_demo',
      'admin-1',
      learner.id,
      { linkedIamUserId: 'user-2' },
      ctx
    );
    expect(reassigned.linkedIamUserId).toBe('user-2');
  });

  it('no-op patch (empty payload) just bumps updatedAt', () => {
    const service = new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      new AuditService(),
      noopDocumentsService,
      noopFilesService,
      testEmitter
    );
    const learner = service.createLearnerExtended(
      'tenant_demo',
      'admin-1',
      { firstName: 'A', lastName: 'B' },
      ctx
    );
    const before = learner.updatedAt;
    const updated = service.updateLearnerExtended('tenant_demo', 'admin-1', learner.id, {}, ctx);
    expect(updated.firstName).toBe('A');
    expect(updated.updatedAt >= before).toBe(true);
  });
});

describe('MvpService — Counterparty extended + group linking (Phase 2 Plan C §Task4)', () => {
  function makeService() {
    const audit = new AuditService();
    const service = new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      audit,
      noopDocumentsService,
      noopFilesService,
      testEmitter
    );
    return { service, audit };
  }

  it('createCounterpartyExtended persists all extended fields + audits crm.counterparty_created', async () => {
    const { service, audit } = makeService();
    const cp = service.createCounterpartyExtended(
      'tenant_demo',
      'admin-1',
      {
        code: 'OOO-X',
        name: 'ООО Х',
        legalName: 'OOO Икс',
        inn: '7707083893',
        kpp: '770701001',
        contactEmail: 'a@x.ru',
        contactPhone: '+7-495-000',
        legalAddress: 'Москва',
        note: 'Заметка'
      },
      ctx
    );
    expect(cp.code).toBe('OOO-X');
    expect(cp.name).toBe('ООО Х');
    expect(cp.legalName).toBe('OOO Икс');
    expect(cp.inn).toBe('7707083893');
    expect(cp.kpp).toBe('770701001');
    expect(cp.contactEmail).toBe('a@x.ru');
    expect(cp.contactPhone).toBe('+7-495-000');
    expect(cp.legalAddress).toBe('Москва');
    expect(cp.note).toBe('Заметка');
    expect(cp.status).toBe('active');
    expect(
      (await audit.list('tenant_demo')).some(
        (e) => e.action === 'crm.counterparty_created' && e.entityId === cp.id
      )
    ).toBe(true);
  });

  it('createCounterpartyExtended omits empty optional fields (no undefined leak)', () => {
    const { service } = makeService();
    const cp = service.createCounterpartyExtended(
      'tenant_demo',
      'admin-1',
      { code: 'C', name: 'N' },
      ctx
    );
    expect(cp.inn).toBeUndefined();
    expect(cp.kpp).toBeUndefined();
    expect(cp.contactEmail).toBeUndefined();
    expect(cp.legalName).toBeUndefined();
  });

  it('updateCounterpartyExtended applies delta and clears nulls', () => {
    const { service } = makeService();
    const cp = service.createCounterpartyExtended(
      'tenant_demo',
      'admin-1',
      { code: 'C', name: 'N', inn: '7707083893', contactEmail: 'a@x.ru' },
      ctx
    );
    const updated = service.updateCounterpartyExtended(
      'tenant_demo',
      'admin-1',
      cp.id,
      { contactEmail: null, contactPhone: '+7-499-111' },
      ctx
    );
    expect(updated.contactEmail).toBeUndefined();
    expect(updated.contactPhone).toBe('+7-499-111');
    expect(updated.inn).toBe('7707083893');
  });

  it('updateCounterpartyExtended toggles status archived/active', async () => {
    const { service, audit } = makeService();
    const cp = service.createCounterpartyExtended(
      'tenant_demo',
      'admin-1',
      { code: 'C', name: 'N' },
      ctx
    );
    const archived = service.updateCounterpartyExtended(
      'tenant_demo',
      'admin-1',
      cp.id,
      { status: 'archived' },
      ctx
    );
    expect(archived.status).toBe('archived');
    expect(
      (await audit.list('tenant_demo')).some(
        (e) => e.action === 'crm.counterparty_updated' && e.entityId === cp.id
      )
    ).toBe(true);
  });

  it('updateCounterpartyExtended throws NotFound for unknown id', () => {
    const { service } = makeService();
    expect(() =>
      service.updateCounterpartyExtended('tenant_demo', 'admin-1', 'cp-nope', { name: 'X' }, ctx)
    ).toThrow(NotFoundException);
  });

  it('setGroupCounterparty links group to existing counterparty + audits linked action', async () => {
    const { service, audit } = makeService();
    const group = service.createGroup(
      'tenant_demo',
      ctx.userId,
      { code: 'G1', name: 'Group' },
      ctx
    );
    const cp = service.createCounterpartyExtended(
      'tenant_demo',
      'admin-1',
      { code: 'C', name: 'N' },
      ctx
    );
    const linked = service.setGroupCounterparty('tenant_demo', 'admin-1', group.id, cp.id, ctx);
    expect(linked.counterpartyId).toBe(cp.id);
    expect(
      (await audit.list('tenant_demo')).some(
        (e) => e.action === 'learning.group_counterparty_linked' && e.entityId === group.id
      )
    ).toBe(true);
  });

  it('setGroupCounterparty(null) unlinks the group + audits unlinked action', async () => {
    const { service, audit } = makeService();
    const group = service.createGroup(
      'tenant_demo',
      ctx.userId,
      { code: 'G1', name: 'Group' },
      ctx
    );
    const cp = service.createCounterpartyExtended(
      'tenant_demo',
      'admin-1',
      { code: 'C', name: 'N' },
      ctx
    );
    service.setGroupCounterparty('tenant_demo', 'admin-1', group.id, cp.id, ctx);
    const unlinked = service.setGroupCounterparty('tenant_demo', 'admin-1', group.id, null, ctx);
    expect(unlinked.counterpartyId).toBeUndefined();
    expect(
      (await audit.list('tenant_demo')).some(
        (e) => e.action === 'learning.group_counterparty_unlinked' && e.entityId === group.id
      )
    ).toBe(true);
  });

  it('setGroupCounterparty throws NotFound when counterparty does not exist', () => {
    const { service } = makeService();
    const group = service.createGroup('tenant_demo', ctx.userId, { code: 'G1', name: 'G' }, ctx);
    expect(() =>
      service.setGroupCounterparty('tenant_demo', 'admin-1', group.id, 'cp-nope', ctx)
    ).toThrow(NotFoundException);
  });

  it('setGroupCounterparty throws NotFound when group does not exist', () => {
    const { service } = makeService();
    const cp = service.createCounterpartyExtended(
      'tenant_demo',
      'admin-1',
      { code: 'C', name: 'N' },
      ctx
    );
    expect(() =>
      service.setGroupCounterparty('tenant_demo', 'admin-1', 'g-nope', cp.id, ctx)
    ).toThrow(NotFoundException);
  });
});

describe('Plan C — completeAttemptReview', () => {
  function makeEssayAttempt(passingScore: number) {
    const service = new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      new AuditService(),
      noopDocumentsService,
      noopFilesService,
      testEmitter
    );
    const course = service.createCourse(
      'tenant_demo',
      ctx.userId,
      { code: 'CC', title: 'PlanC' },
      ctx
    );
    const group = service.createGroup(
      'tenant_demo',
      ctx.userId,
      { code: 'GC', name: 'GroupC' },
      ctx
    );
    service.createGroupCourse('tenant_demo', { groupId: group.id, courseId: course.id });
    const learner = service.createLearner(
      'tenant_demo',
      ctx.userId,
      { code: 'LC', name: 'Essay Learner' },
      ctx
    );
    const enrollment = service.createEnrollment(
      'tenant_demo',
      ctx.userId,
      { groupId: group.id, learnerId: learner.id },
      ctx
    );
    const bank = service.createQuestionBank(
      'tenant_demo',
      ctx.userId,
      { title: 'BankC', courseId: course.id },
      ctx
    );
    const essayQ = service.createQuestion(
      'tenant_demo',
      ctx.userId,
      { questionBankId: bank.id, text: 'Discuss safety', type: 'essay', score: 5 },
      ctx
    );
    const test = service.createTest(
      'tenant_demo',
      ctx.userId,
      {
        title: 'EssayTest',
        courseId: course.id,
        questionBankId: bank.id,
        rules: { attemptLimit: 1, passingScore }
      },
      ctx
    );
    service.addTestQuestions('tenant_demo', test.id, [essayQ.id]);
    const attempt = service.startAttempt(
      'tenant_demo',
      ctx.userId,
      { testId: test.id, enrollmentId: enrollment.id, learnerId: learner.id },
      ctx
    );
    service.saveAttemptAnswer(
      'tenant_demo',
      ctx.userId,
      attempt.id,
      { questionId: essayQ.id, textAnswer: 'a thoughtful essay' },
      ctx
    );
    return { service, essayQ, attempt };
  }

  it('scores the essay, recomputes score/passed, finishes, updates ExamResult', () => {
    const { service, essayQ, attempt } = makeEssayAttempt(3);
    const submitted = service.submitAttempt('tenant_demo', ctx.userId, attempt.id, ctx);
    expect(submitted.score).toBe(0); // essay abstains at submit
    expect(submitted.status).toBe('submitted');

    const reviewed = service.completeAttemptReview(
      'tenant_demo',
      ctx.userId,
      attempt.id,
      { answerScores: [{ questionId: essayQ.id, score: 4 }], reviewComment: 'good' },
      ctx
    );
    expect(reviewed.score).toBe(4);
    expect(reviewed.passed).toBe(true);
    expect(reviewed.status).toBe('finished');
    expect(reviewed.reviewComment).toBe('good');

    const result = service.getAttemptResult('tenant_demo', attempt.id);
    expect(result.finalScore).toBe(4);
    expect(result.passed).toBe(true);
  });

  it('finishAttempt keeps an essay attempt reviewable (does not lock out manual grading)', () => {
    const { service, essayQ, attempt } = makeEssayAttempt(3);

    // A learner clicking "finish" on a test that contains an essay must NOT freeze the
    // essay at the provisional 0 and finalize the attempt. It must stay 'submitted' so it
    // remains in the reviewer queue (status==='submitted' && autoGraded===false) and
    // completeAttemptReview can score it.
    const finished = service.finishAttempt('tenant_demo', ctx.userId, attempt.id, ctx);
    expect(finished.status).toBe('submitted');

    // The reviewer can still complete the review → real 'finished' with the human score.
    const reviewed = service.completeAttemptReview(
      'tenant_demo',
      ctx.userId,
      attempt.id,
      { answerScores: [{ questionId: essayQ.id, score: 4 }] },
      ctx
    );
    expect(reviewed.status).toBe('finished');
    expect(reviewed.score).toBe(4);
    expect(reviewed.passed).toBe(true);
  });

  it('rejects an out-of-range score', () => {
    const { service, essayQ, attempt } = makeEssayAttempt(3);
    service.submitAttempt('tenant_demo', ctx.userId, attempt.id, ctx);
    expect(() =>
      service.completeAttemptReview(
        'tenant_demo',
        ctx.userId,
        attempt.id,
        { answerScores: [{ questionId: essayQ.id, score: 99 }] },
        ctx
      )
    ).toThrow(BadRequestException);
  });

  it('refuses to review an attempt that is not submitted', () => {
    const { service, essayQ, attempt } = makeEssayAttempt(3);
    expect(() =>
      service.completeAttemptReview(
        'tenant_demo',
        ctx.userId,
        attempt.id,
        { answerScores: [{ questionId: essayQ.id, score: 1 }] },
        ctx
      )
    ).toThrow(PreconditionFailedException); // still in_progress
  });
});

describe('§5.156 — provisional ExamResult must not publish a pass before manual review', () => {
  function makeService(): MvpService {
    return new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      new AuditService(),
      noopDocumentsService,
      noopFilesService,
      testEmitter
    );
  }

  /**
   * Course with ONE test mixing an auto-graded number_input (score 2) and an essay
   * (score 5), passingScore = 2. The auto question ALONE clears the bar — the exact
   * shape that made submitAttempt publish a provisional `passed: true` before the
   * essay was human-reviewed.
   */
  function seedMixedAutoEssayTest(service: MvpService) {
    const course = service.createCourse(
      'tenant_demo',
      ctx.userId,
      { code: 'MX', title: 'Mixed' },
      ctx
    );
    const group = service.createGroup(
      'tenant_demo',
      ctx.userId,
      { code: 'GM', name: 'GroupMixed' },
      ctx
    );
    service.createGroupCourse('tenant_demo', { groupId: group.id, courseId: course.id });
    const learner = service.createLearner(
      'tenant_demo',
      ctx.userId,
      { code: 'LM', name: 'Mixed Learner' },
      ctx
    );
    const enrollment = service.createEnrollment(
      'tenant_demo',
      ctx.userId,
      { groupId: group.id, learnerId: learner.id },
      ctx
    );
    const bank = service.createQuestionBank(
      'tenant_demo',
      ctx.userId,
      { title: 'BankMixed', courseId: course.id },
      ctx
    );
    const autoQ = service.createQuestion(
      'tenant_demo',
      ctx.userId,
      {
        questionBankId: bank.id,
        type: 'number_input',
        title: 'Pi?',
        score: 2,
        numericExpected: 3.14,
        numericTolerance: 0.01
      },
      ctx
    );
    const essayQ = service.createQuestion(
      'tenant_demo',
      ctx.userId,
      { questionBankId: bank.id, type: 'essay', title: 'Discuss safety', score: 5 },
      ctx
    );
    const test = service.createTest(
      'tenant_demo',
      ctx.userId,
      {
        title: 'MixedTest',
        courseId: course.id,
        questionBankId: bank.id,
        rules: { attemptLimit: 1, passingScore: 2 }
      },
      ctx
    );
    service.addTestQuestions('tenant_demo', test.id, [autoQ.id, essayQ.id]);
    const attempt = service.startAttempt(
      'tenant_demo',
      ctx.userId,
      { testId: test.id, enrollmentId: enrollment.id, learnerId: learner.id },
      ctx
    );
    service.saveAttemptAnswer(
      'tenant_demo',
      ctx.userId,
      attempt.id,
      { questionId: autoQ.id, textAnswer: '3.14' },
      ctx
    );
    service.saveAttemptAnswer(
      'tenant_demo',
      ctx.userId,
      attempt.id,
      { questionId: essayQ.id, textAnswer: 'a thoughtful essay' },
      ctx
    );
    return { service, course, group, learner, enrollment, bank, autoQ, essayQ, test, attempt };
  }

  it('does NOT publish passed/final when the auto subtotal clears passingScore but an essay is pending', () => {
    const { service, enrollment, test, attempt } = seedMixedAutoEssayTest(makeService());
    const submitted = service.submitAttempt('tenant_demo', ctx.userId, attempt.id, ctx);
    // Auto subtotal = 2 (number_input) ≥ passingScore 2; essay abstains.
    expect(submitted.score).toBe(2);
    expect(submitted.status).toBe('submitted');

    const result = service['state'].examResults.find(
      (r) => r.enrollmentId === enrollment.id && r.testId === test.id
    );
    expect(result).toBeDefined();
    // The provisional record must NOT be a published pass.
    expect(result!.passed).toBe(false);
    expect(result!.status).toBe('needs_review');
  });

  it('transitions the ExamResult from needs_review to a real pass after completeAttemptReview', () => {
    const { service, enrollment, test, attempt, essayQ } = seedMixedAutoEssayTest(makeService());
    service.submitAttempt('tenant_demo', ctx.userId, attempt.id, ctx);

    service.completeAttemptReview(
      'tenant_demo',
      ctx.userId,
      attempt.id,
      { answerScores: [{ questionId: essayQ.id, score: 1 }] },
      ctx
    );

    const result = service['state'].examResults.find(
      (r) => r.enrollmentId === enrollment.id && r.testId === test.id
    );
    expect(result!.passed).toBe(true);
    expect(result!.status).not.toBe('needs_review');
    expect(result!.finalScore).toBe(3); // auto 2 + reviewed essay 1
  });

  it('publishes a real pass for an auto-only attempt (no manual review needed) — regression guard', () => {
    const service = makeService();
    const course = service.createCourse(
      'tenant_demo',
      ctx.userId,
      { code: 'AO', title: 'AutoOnly' },
      ctx
    );
    const group = service.createGroup('tenant_demo', ctx.userId, { code: 'GA', name: 'GA' }, ctx);
    service.createGroupCourse('tenant_demo', { groupId: group.id, courseId: course.id });
    const learner = service.createLearner(
      'tenant_demo',
      ctx.userId,
      { code: 'LA', name: 'Auto Learner' },
      ctx
    );
    const enrollment = service.createEnrollment(
      'tenant_demo',
      ctx.userId,
      { groupId: group.id, learnerId: learner.id },
      ctx
    );
    const bank = service.createQuestionBank(
      'tenant_demo',
      ctx.userId,
      { title: 'BankA', courseId: course.id },
      ctx
    );
    const autoQ = service.createQuestion(
      'tenant_demo',
      ctx.userId,
      {
        questionBankId: bank.id,
        type: 'number_input',
        title: 'Pi?',
        score: 2,
        numericExpected: 3.14,
        numericTolerance: 0.01
      },
      ctx
    );
    const test = service.createTest(
      'tenant_demo',
      ctx.userId,
      {
        title: 'AutoTest',
        courseId: course.id,
        questionBankId: bank.id,
        rules: { attemptLimit: 1, passingScore: 2 }
      },
      ctx
    );
    service.addTestQuestions('tenant_demo', test.id, [autoQ.id]);
    const attempt = service.startAttempt(
      'tenant_demo',
      ctx.userId,
      { testId: test.id, enrollmentId: enrollment.id, learnerId: learner.id },
      ctx
    );
    service.saveAttemptAnswer(
      'tenant_demo',
      ctx.userId,
      attempt.id,
      { questionId: autoQ.id, textAnswer: '3.14' },
      ctx
    );
    service.submitAttempt('tenant_demo', ctx.userId, attempt.id, ctx);

    const result = service['state'].examResults.find((r) => r.enrollmentId === enrollment.id);
    expect(result!.passed).toBe(true);
    expect(result!.status).not.toBe('needs_review');
  });

  it('keeps the module gate LOCKED while the gating exam awaits essay review, then opens after review', () => {
    const service = makeService();
    const course = service.createCourse(
      'tenant_demo',
      ctx.userId,
      { code: 'GT', title: 'Gated' },
      ctx
    );
    const group = service.createGroup('tenant_demo', ctx.userId, { code: 'GG', name: 'GG' }, ctx);
    service.createGroupCourse('tenant_demo', { groupId: group.id, courseId: course.id });
    const learner = service.createLearner(
      'tenant_demo',
      ctx.userId,
      { code: 'LG', name: 'Gated Learner' },
      ctx
    );
    const enrollment = service.createEnrollment(
      'tenant_demo',
      ctx.userId,
      { groupId: group.id, learnerId: learner.id },
      ctx
    );
    const bank = service.createQuestionBank(
      'tenant_demo',
      ctx.userId,
      { title: 'BankG', courseId: course.id },
      ctx
    );
    const version = service.createCourseVersion('tenant_demo', course.id);
    const m1 = service.createModule(
      'tenant_demo',
      ctx.userId,
      { courseVersionId: version.id, title: 'M1', minViewSeconds: 0, isRequired: true },
      ctx
    );
    const m2 = service.createModule(
      'tenant_demo',
      ctx.userId,
      { courseVersionId: version.id, title: 'M2', minViewSeconds: 0, isRequired: true },
      ctx
    );
    // m1 gating test: mixed auto(number_input score 2) + essay, passingScore 2.
    const autoQ = service.createQuestion(
      'tenant_demo',
      ctx.userId,
      {
        questionBankId: bank.id,
        type: 'number_input',
        title: 'Pi?',
        score: 2,
        numericExpected: 3.14,
        numericTolerance: 0.01
      },
      ctx
    );
    const essayQ = service.createQuestion(
      'tenant_demo',
      ctx.userId,
      { questionBankId: bank.id, type: 'essay', title: 'Discuss', score: 5 },
      ctx
    );
    const m1test = service.createTest(
      'tenant_demo',
      ctx.userId,
      {
        title: 'M1 test',
        courseId: course.id,
        questionBankId: bank.id,
        moduleId: m1.id,
        rules: { attemptLimit: 1, passingScore: 2 }
      },
      ctx
    );
    service.addTestQuestions('tenant_demo', m1test.id, [autoQ.id, essayQ.id]);
    const m2q = service.createQuestion(
      'tenant_demo',
      ctx.userId,
      {
        questionBankId: bank.id,
        type: 'number_input',
        title: 'Two?',
        score: 1,
        numericExpected: 2,
        numericTolerance: 0
      },
      ctx
    );
    const m2test = service.createTest(
      'tenant_demo',
      ctx.userId,
      {
        title: 'M2 test',
        courseId: course.id,
        questionBankId: bank.id,
        moduleId: m2.id,
        rules: { attemptLimit: 1, passingScore: 1 }
      },
      ctx
    );
    service.addTestQuestions('tenant_demo', m2test.id, [m2q.id]);

    // Take m1's gating test: auto answered correctly, essay pending.
    const a1 = service.startAttempt(
      'tenant_demo',
      ctx.userId,
      { testId: m1test.id, enrollmentId: enrollment.id, learnerId: learner.id },
      ctx
    );
    service.saveAttemptAnswer(
      'tenant_demo',
      ctx.userId,
      a1.id,
      { questionId: autoQ.id, textAnswer: '3.14' },
      ctx
    );
    service.saveAttemptAnswer(
      'tenant_demo',
      ctx.userId,
      a1.id,
      { questionId: essayQ.id, textAnswer: 'essay' },
      ctx
    );
    service.submitAttempt('tenant_demo', ctx.userId, a1.id, ctx);

    // BEFORE review: the provisional pass must NOT unlock the next module.
    expect(() =>
      service.startAttempt(
        'tenant_demo',
        ctx.userId,
        { testId: m2test.id, enrollmentId: enrollment.id, learnerId: learner.id },
        ctx
      )
    ).toThrow(PreconditionFailedException);

    // Reviewer scores the essay → real pass.
    service.completeAttemptReview(
      'tenant_demo',
      ctx.userId,
      a1.id,
      { answerScores: [{ questionId: essayQ.id, score: 1 }] },
      ctx
    );

    // AFTER review: the gate opens.
    const a2 = service.startAttempt(
      'tenant_demo',
      ctx.userId,
      { testId: m2test.id, enrollmentId: enrollment.id, learnerId: learner.id },
      ctx
    );
    expect(a2.status).toBe('in_progress');
  });

  it('does not count a provisional (needs_review) result as a pass in analytics pass-rate', () => {
    const { service, attempt } = seedMixedAutoEssayTest(makeService());
    service.submitAttempt('tenant_demo', ctx.userId, attempt.id, ctx);

    const kpi = service.getKpiSnapshot('tenant_demo', {});
    expect(kpi.examResultsPassed).toBe(0);
    expect(kpi.examPassRate).toBe(0);
  });
});

describe('Plan C — returnAssignmentSubmission', () => {
  function makeSubmittedUnderReview() {
    const service = new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      new AuditService(),
      noopDocumentsService,
      noopFilesService,
      testEmitter
    );
    const course = service.createCourse(
      'tenant_demo',
      ctx.userId,
      { code: 'CR', title: 'Return' },
      ctx
    );
    const group = service.createGroup(
      'tenant_demo',
      ctx.userId,
      { code: 'GR', name: 'GroupR' },
      ctx
    );
    service.createGroupCourse('tenant_demo', { groupId: group.id, courseId: course.id });
    const learner = service.createLearner(
      'tenant_demo',
      ctx.userId,
      { code: 'LR', name: 'Return Learner' },
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
      { courseId: course.id, title: 'Practical', maxScore: 10 },
      ctx
    );
    const submission = service.createAssignmentSubmission(
      'tenant_demo',
      ctx.userId,
      {
        assignmentId: assignment.id,
        enrollmentId: enrollment.id,
        learnerId: learner.id,
        answerText: 'first draft'
      },
      ctx
    );
    service.submitAssignmentSubmission('tenant_demo', ctx.userId, submission.id, ctx);
    service.createAssignmentReview(
      'tenant_demo',
      ctx.userId,
      { submissionId: submission.id, comment: 'needs work' },
      ctx
    );
    return { service, submission, enrollment, assignment, learner };
  }

  it('returns an under_review submission and clears the active review so it can be re-reviewed', () => {
    const { service, submission } = makeSubmittedUnderReview();
    const returned = service.returnAssignmentSubmission(
      'tenant_demo',
      ctx.userId,
      submission.id,
      { comment: 'add section 3' },
      ctx
    );
    expect(returned.status).toBe('returned');
    expect(returned.returnComment).toBe('add section 3');
    expect(
      service
        .listAssignmentReviews('tenant_demo', {})
        .items.filter((r) => r.submissionId === submission.id)
    ).toHaveLength(0);

    // learner edits the returned submission and resubmits → submitted again
    service.updateAssignmentSubmission(
      'tenant_demo',
      ctx.userId,
      submission.id,
      { answerText: 'revised draft' },
      ctx
    );
    const resubmitted = service.submitAssignmentSubmission(
      'tenant_demo',
      ctx.userId,
      submission.id,
      ctx
    );
    expect(resubmitted.status).toBe('submitted');

    // a fresh review can now be created without the one-review conflict
    const review = service.createAssignmentReview(
      'tenant_demo',
      ctx.userId,
      { submissionId: submission.id },
      ctx
    );
    expect(review.status).toBe('in_review');
  });

  it('refuses to return a submission that is not under_review', () => {
    const { service, assignment, enrollment, learner } = makeSubmittedUnderReview();
    const draft = service.createAssignmentSubmission(
      'tenant_demo',
      ctx.userId,
      {
        assignmentId: assignment.id,
        enrollmentId: enrollment.id,
        learnerId: learner.id,
        answerText: 'x'
      },
      ctx
    );
    expect(() =>
      service.returnAssignmentSubmission(
        'tenant_demo',
        ctx.userId,
        draft.id,
        { comment: 'no' },
        ctx
      )
    ).toThrow(PreconditionFailedException);
  });
});

describe('Plan C — submission file upload wrappers', () => {
  it('issues an upload intent for a draft submission owned by the actor', async () => {
    const service = new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      new AuditService(),
      noopDocumentsService,
      noopFilesService,
      testEmitter
    );
    const course = service.createCourse(
      'tenant_demo',
      ctx.userId,
      { code: 'CF', title: 'Files' },
      ctx
    );
    const group = service.createGroup('tenant_demo', ctx.userId, { code: 'GF', name: 'GF' }, ctx);
    service.createGroupCourse('tenant_demo', { groupId: group.id, courseId: course.id });
    const learner = service.createLearner(
      'tenant_demo',
      ctx.userId,
      { code: 'LF', name: 'File Learner' },
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
      { courseId: course.id, title: 'P', maxScore: 10 },
      ctx
    );
    const submission = service.createAssignmentSubmission(
      'tenant_demo',
      ctx.userId,
      {
        assignmentId: assignment.id,
        enrollmentId: enrollment.id,
        learnerId: learner.id,
        answerText: 'd'
      },
      ctx
    );

    const intent = await service.createSubmissionUploadIntent(
      'tenant_demo',
      ctx.userId,
      submission.id,
      { originalName: 'w.pdf', contentType: 'application/pdf', sizeBytes: 100 },
      ctx
    );
    expect(intent.uploadUrl).toContain('https://minio.local');
    expect(intent.fileId).toBe('file_stub');
  });
});

describe('Plan C — listMyAssignments', () => {
  it('returns assignments for the actor-linked learner with submission status', () => {
    const service = new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      new AuditService(),
      noopDocumentsService,
      noopFilesService,
      testEmitter
    );
    const course = service.createCourse('tenant_demo', ctx.userId, { code: 'CA', title: 'A' }, ctx);
    const group = service.createGroup('tenant_demo', ctx.userId, { code: 'GA', name: 'GA' }, ctx);
    service.createGroupCourse('tenant_demo', { groupId: group.id, courseId: course.id });
    // Link a learner to the acting IAM user so the actor-resolution finds it.
    const learner = service.createLearner(
      'tenant_demo',
      ctx.userId,
      { code: 'LA', name: 'Linked', linkedIamUserId: ctx.userId },
      ctx
    );
    service.createEnrollment(
      'tenant_demo',
      ctx.userId,
      { groupId: group.id, learnerId: learner.id },
      ctx
    );
    const assignment = service.createAssignment(
      'tenant_demo',
      ctx.userId,
      { courseId: course.id, title: 'Practical', maxScore: 10 },
      ctx
    );

    const list = service.listMyAssignments('tenant_demo', ctx.userId);
    expect(list.map((a) => a.assignmentId)).toContain(assignment.id);
    expect(list.find((a) => a.assignmentId === assignment.id)?.status).toBe('not_started');
  });

  it('returns [] when the actor has no linked learner (not 403)', () => {
    const service = new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      new AuditService(),
      noopDocumentsService,
      noopFilesService,
      testEmitter
    );
    expect(service.listMyAssignments('tenant_demo', 'u_no_link')).toEqual([]);
  });
});

describe('progress denominator (audit tail 1c)', () => {
  it('module is not 100% until every material in the module is completed', () => {
    const service = makeService();
    const course = service.createCourse(
      'tenant_demo',
      ctx.userId,
      { code: 'C1', title: 'Course' },
      ctx
    );
    const version = service.createCourseVersion('tenant_demo', course.id);
    const mod = service.createModule(
      'tenant_demo',
      ctx.userId,
      { courseVersionId: version.id, title: 'Mod1', minViewSeconds: 0 },
      ctx
    );
    const matA = service.createMaterial(
      'tenant_demo',
      ctx.userId,
      { moduleId: mod.id, title: 'MatA', materialType: 'video', minViewSeconds: 600 },
      ctx
    );
    const matB = service.createMaterial(
      'tenant_demo',
      ctx.userId,
      { moduleId: mod.id, title: 'MatB', materialType: 'video', minViewSeconds: 600 },
      ctx
    );
    const group = service.createGroup(
      'tenant_demo',
      ctx.userId,
      { code: 'G1', name: 'Group' },
      ctx
    );
    service.createGroupCourse('tenant_demo', { groupId: group.id, courseId: course.id });
    const learner = service.createLearner(
      'tenant_demo',
      ctx.userId,
      { code: 'L1', name: 'John Doe' },
      ctx
    );
    const enrollment = service.createEnrollment(
      'tenant_demo',
      ctx.userId,
      { groupId: group.id, learnerId: learner.id },
      ctx
    );

    // Study only material A fully — module should be 50%, not completed
    service.upsertMaterialProgress(
      'tenant_demo',
      ctx.userId,
      matA.id,
      { enrollmentId: enrollment.id, studiedSeconds: 600 },
      ctx
    );

    const modProgressAfterA = service['state'].moduleProgress.find(
      (p: { tenantId: string; moduleId: string; enrollmentId: string }) =>
        p.tenantId === 'tenant_demo' && p.moduleId === mod.id && p.enrollmentId === enrollment.id
    );
    expect(modProgressAfterA).toBeDefined();
    expect(modProgressAfterA!.progressPercent).toBe(50);
    expect(modProgressAfterA!.status).toBe('in_progress');

    // Now study material B fully — module should be 100%, completed
    service.upsertMaterialProgress(
      'tenant_demo',
      ctx.userId,
      matB.id,
      { enrollmentId: enrollment.id, studiedSeconds: 600 },
      ctx
    );

    const modProgressAfterB = service['state'].moduleProgress.find(
      (p: { tenantId: string; moduleId: string; enrollmentId: string }) =>
        p.tenantId === 'tenant_demo' && p.moduleId === mod.id && p.enrollmentId === enrollment.id
    );
    expect(modProgressAfterB!.progressPercent).toBe(100);
    expect(modProgressAfterB!.status).toBe('completed');
  });

  it('course is not 100% while a sibling module has no opened materials', () => {
    const service = makeService();
    const course = service.createCourse(
      'tenant_demo',
      ctx.userId,
      { code: 'C2', title: 'Course2' },
      ctx
    );
    const version = service.createCourseVersion('tenant_demo', course.id);
    const mod1 = service.createModule(
      'tenant_demo',
      ctx.userId,
      { courseVersionId: version.id, title: 'Mod1', minViewSeconds: 0 },
      ctx
    );
    const mod2 = service.createModule(
      'tenant_demo',
      ctx.userId,
      { courseVersionId: version.id, title: 'Mod2', minViewSeconds: 0 },
      ctx
    );
    // Each module has one 600s material
    const mat1 = service.createMaterial(
      'tenant_demo',
      ctx.userId,
      { moduleId: mod1.id, title: 'Mat1', materialType: 'video', minViewSeconds: 600 },
      ctx
    );
    service.createMaterial(
      'tenant_demo',
      ctx.userId,
      { moduleId: mod2.id, title: 'Mat2', materialType: 'video', minViewSeconds: 600 },
      ctx
    );
    const group = service.createGroup(
      'tenant_demo',
      ctx.userId,
      { code: 'G2', name: 'Group2' },
      ctx
    );
    service.createGroupCourse('tenant_demo', { groupId: group.id, courseId: course.id });
    const learner = service.createLearner(
      'tenant_demo',
      ctx.userId,
      { code: 'L2', name: 'Jane Doe' },
      ctx
    );
    const enrollment = service.createEnrollment(
      'tenant_demo',
      ctx.userId,
      { groupId: group.id, learnerId: learner.id },
      ctx
    );

    // Complete only module 1's material — course should be 50%, not completed
    service.upsertMaterialProgress(
      'tenant_demo',
      ctx.userId,
      mat1.id,
      { enrollmentId: enrollment.id, studiedSeconds: 600 },
      ctx
    );

    const courseProgressRow = service['state'].courseProgress.find(
      (p: { tenantId: string; courseId: string; enrollmentId: string }) =>
        p.tenantId === 'tenant_demo' && p.courseId === course.id && p.enrollmentId === enrollment.id
    );
    expect(courseProgressRow).toBeDefined();
    expect(courseProgressRow!.progressPercent).toBe(50);
    expect(courseProgressRow!.status).toBe('in_progress');
  });

  it('optional material does not block module completion (isRequired:false)', () => {
    const service = makeService();
    const course = service.createCourse(
      'tenant_demo',
      ctx.userId,
      { code: 'C3', title: 'Course3' },
      ctx
    );
    const version = service.createCourseVersion('tenant_demo', course.id);
    const mod = service.createModule(
      'tenant_demo',
      ctx.userId,
      { courseVersionId: version.id, title: 'Mod1', minViewSeconds: 0 },
      ctx
    );
    const required = service.createMaterial(
      'tenant_demo',
      ctx.userId,
      {
        moduleId: mod.id,
        title: 'Required',
        materialType: 'video',
        minViewSeconds: 600,
        isRequired: true
      },
      ctx
    );
    // Optional material — must NOT block 100%.
    service.createMaterial(
      'tenant_demo',
      ctx.userId,
      {
        moduleId: mod.id,
        title: 'Optional',
        materialType: 'video',
        minViewSeconds: 600,
        isRequired: false
      },
      ctx
    );
    const group = service.createGroup(
      'tenant_demo',
      ctx.userId,
      { code: 'G3', name: 'Group3' },
      ctx
    );
    service.createGroupCourse('tenant_demo', { groupId: group.id, courseId: course.id });
    const learner = service.createLearner(
      'tenant_demo',
      ctx.userId,
      { code: 'L3', name: 'Sam Doe' },
      ctx
    );
    const enrollment = service.createEnrollment(
      'tenant_demo',
      ctx.userId,
      { groupId: group.id, learnerId: learner.id },
      ctx
    );

    // Study only the required material — module should reach 100%/completed.
    service.upsertMaterialProgress(
      'tenant_demo',
      ctx.userId,
      required.id,
      { enrollmentId: enrollment.id, studiedSeconds: 600 },
      ctx
    );

    const modProgress = service['state'].moduleProgress.find(
      (p: { tenantId: string; moduleId: string; enrollmentId: string }) =>
        p.tenantId === 'tenant_demo' && p.moduleId === mod.id && p.enrollmentId === enrollment.id
    );
    expect(modProgress).toBeDefined();
    expect(modProgress!.progressPercent).toBe(100);
    expect(modProgress!.status).toBe('completed');
  });

  it('course pinned to v1 reaches 100% even when v2 is published with extra modules', () => {
    const service = makeService();
    const course = service.createCourse(
      'tenant_demo',
      ctx.userId,
      { code: 'C4', title: 'Course4' },
      ctx
    );

    // v1: one module with one required 600s material.
    const v1 = service.createCourseVersion('tenant_demo', course.id);
    const v1mod = service.createModule(
      'tenant_demo',
      ctx.userId,
      { courseVersionId: v1.id, title: 'V1 Mod', minViewSeconds: 0 },
      ctx
    );
    const v1mat = service.createMaterial(
      'tenant_demo',
      ctx.userId,
      { moduleId: v1mod.id, title: 'V1 Mat', materialType: 'video', minViewSeconds: 600 },
      ctx
    );

    // v2: two EXTRA modules each with a required material — must NOT be counted.
    const v2 = service.createCourseVersion('tenant_demo', course.id);
    const v2modA = service.createModule(
      'tenant_demo',
      ctx.userId,
      { courseVersionId: v2.id, title: 'V2 ModA', minViewSeconds: 0 },
      ctx
    );
    service.createMaterial(
      'tenant_demo',
      ctx.userId,
      { moduleId: v2modA.id, title: 'V2 MatA', materialType: 'video', minViewSeconds: 600 },
      ctx
    );
    const v2modB = service.createModule(
      'tenant_demo',
      ctx.userId,
      { courseVersionId: v2.id, title: 'V2 ModB', minViewSeconds: 0 },
      ctx
    );
    service.createMaterial(
      'tenant_demo',
      ctx.userId,
      { moduleId: v2modB.id, title: 'V2 MatB', materialType: 'video', minViewSeconds: 600 },
      ctx
    );

    // Both versions are published (publishing v2 does not demote v1).
    service['state'].courseVersions.find((v) => v.id === v1.id)!.status = 'published';
    service['state'].courseVersions.find((v) => v.id === v2.id)!.status = 'published';

    const group = service.createGroup(
      'tenant_demo',
      ctx.userId,
      { code: 'G4', name: 'Group4' },
      ctx
    );
    const gc = service.createGroupCourse('tenant_demo', { groupId: group.id, courseId: course.id });
    // Pin the group's course to v1.
    service['state'].groupCourses.find((g) => g.id === gc.id)!.courseVersionId = v1.id;

    const learner = service.createLearner(
      'tenant_demo',
      ctx.userId,
      { code: 'L4', name: 'Pat Doe' },
      ctx
    );
    const enrollment = service.createEnrollment(
      'tenant_demo',
      ctx.userId,
      { groupId: group.id, learnerId: learner.id },
      ctx
    );

    // Study v1's material to completion — course should be 100% (v2 not counted).
    service.upsertMaterialProgress(
      'tenant_demo',
      ctx.userId,
      v1mat.id,
      { enrollmentId: enrollment.id, studiedSeconds: 600 },
      ctx
    );

    const courseProgressRow = service['state'].courseProgress.find(
      (p: { tenantId: string; courseId: string; enrollmentId: string }) =>
        p.tenantId === 'tenant_demo' && p.courseId === course.id && p.enrollmentId === enrollment.id
    );
    expect(courseProgressRow).toBeDefined();
    expect(courseProgressRow!.progressPercent).toBe(100);
    expect(courseProgressRow!.status).toBe('completed');
  });

  it('published-version primary path (no group pin)', () => {
    const service = makeService();
    const course = service.createCourse(
      'tenant_demo',
      ctx.userId,
      { code: 'C5', title: 'Course5' },
      ctx
    );
    const version = service.createCourseVersion('tenant_demo', course.id);
    const mod1 = service.createModule(
      'tenant_demo',
      ctx.userId,
      { courseVersionId: version.id, title: 'Mod1', minViewSeconds: 0 },
      ctx
    );
    const mod2 = service.createModule(
      'tenant_demo',
      ctx.userId,
      { courseVersionId: version.id, title: 'Mod2', minViewSeconds: 0 },
      ctx
    );
    const mat1 = service.createMaterial(
      'tenant_demo',
      ctx.userId,
      { moduleId: mod1.id, title: 'Mat1', materialType: 'video', minViewSeconds: 600 },
      ctx
    );
    service.createMaterial(
      'tenant_demo',
      ctx.userId,
      { moduleId: mod2.id, title: 'Mat2', materialType: 'video', minViewSeconds: 600 },
      ctx
    );

    // Single published version; group course WITHOUT a version pin → exercises
    // the published-primary branch (not the progress-referenced fallback).
    service['state'].courseVersions.find((v) => v.id === version.id)!.status = 'published';

    const group = service.createGroup(
      'tenant_demo',
      ctx.userId,
      { code: 'G5', name: 'Group5' },
      ctx
    );
    service.createGroupCourse('tenant_demo', { groupId: group.id, courseId: course.id });
    const learner = service.createLearner(
      'tenant_demo',
      ctx.userId,
      { code: 'L5', name: 'Lee Doe' },
      ctx
    );
    const enrollment = service.createEnrollment(
      'tenant_demo',
      ctx.userId,
      { groupId: group.id, learnerId: learner.id },
      ctx
    );

    // Complete only module 1 → course should be 50% / in_progress.
    service.upsertMaterialProgress(
      'tenant_demo',
      ctx.userId,
      mat1.id,
      { enrollmentId: enrollment.id, studiedSeconds: 600 },
      ctx
    );

    const courseProgressRow = service['state'].courseProgress.find(
      (p: { tenantId: string; courseId: string; enrollmentId: string }) =>
        p.tenantId === 'tenant_demo' && p.courseId === course.id && p.enrollmentId === enrollment.id
    );
    expect(courseProgressRow).toBeDefined();
    expect(courseProgressRow!.progressPercent).toBe(50);
    expect(courseProgressRow!.status).toBe('in_progress');
  });
});
