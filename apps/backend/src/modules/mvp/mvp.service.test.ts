import { ConflictException, ForbiddenException, PreconditionFailedException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { describe, expect, it } from 'vitest';

import { InMemoryMvpState } from './infrastructure/in-memory-mvp.state.js';
import { MvpService } from './mvp.service.js';
import { TenantScopedRepository } from '../../infrastructure/database/tenant-repository.js';
import { AuditService } from '../audit/audit.service.js';

import type { FilesService } from '../files/files.service.js';

const noopFilesService = {
  ensureMaterialLink: async () => undefined
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

  it('enforces tenant isolation', () => {
    const service = new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      new AuditService(),
      noopFilesService,
      testEmitter
    );
    const course = service.createCourse(
      'tenant_demo',
      ctx.userId,
      { code: 'C1', title: 'Course' },
      ctx
    );
    expect(() => service.getCourse('tenant_other', course.id)).toThrow(ForbiddenException);
  });

  it('returns lookup payloads with id/label/status', () => {
    const service = new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      new AuditService(),
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
      noopFilesService,
      testEmitter
    );
    service.createCounterparty('tenant_demo', ctx.userId, { code: 'CP1', name: 'Org 1' }, ctx);
    service.createLearner('tenant_demo', ctx.userId, { code: 'L1', name: 'John Doe' }, ctx);
    expect((await audit.list()).some((item) => item.action === 'crm.counterparty_created')).toBe(
      true
    );
    expect((await audit.list()).some((item) => item.action === 'learning.learner_created')).toBe(
      true
    );
  });

  it('enforces attempt limit, scoring and exam result finalization', () => {
    const service = new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      new AuditService(),
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
      { courseId: course.id, title: 'HW' },
      ctx
    );
    const submission = service.createAssignmentSubmission(
      'tenant_demo',
      ctx.userId,
      { assignmentId: assignment.id, enrollmentId: enrollment.id, answerText: 'draft' },
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
      noopFilesService,
      testEmitter
    );
    const assignment = service.createAssignment(
      'tenant_demo',
      ctx.userId,
      { courseId: 'course_x', title: 'HW', maxScore: 100 },
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
    const submission = service.createAssignmentSubmission(
      'tenant_demo',
      ctx.userId,
      { assignmentId: assignment.id, enrollmentId: enrollment.id, answerText: 'draft' },
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

  it('updates module/material/group and writes audit events', async () => {
    const audit = new AuditService();
    const service = new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      audit,
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
    expect((await audit.list()).some((item) => item.action === 'learning.group_updated')).toBe(
      true
    );
    expect((await audit.list()).some((item) => item.action === 'learning.module_updated')).toBe(
      true
    );
    expect((await audit.list()).some((item) => item.action === 'learning.material_updated')).toBe(
      true
    );
  });

  it('rejects mass-assignment of immutable fields on update endpoints', () => {
    const service = new MvpService(
      new InMemoryMvpState(),
      new TenantScopedRepository(),
      new AuditService(),
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
});
