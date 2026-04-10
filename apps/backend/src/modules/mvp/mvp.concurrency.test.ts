import { ConflictException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { MvpService } from './mvp.service.js';
import { TenantScopedRepository } from '../../infrastructure/database/tenant-repository.js';
import { AuditService } from '../audit/audit.service.js';

const ctx = {
  requestId: 'req_concurrency_1',
  correlationId: 'corr_concurrency_1',
  tenantId: 'tenant_demo',
  userId: 'u_tenant_admin',
  ip: '127.0.0.1',
  userAgent: 'vitest'
};

describe('mvp service concurrency-lite invariants', () => {
  it('keeps enrollment unique when duplicate requests race on same group+learner pair', async () => {
    const service = new MvpService(new TenantScopedRepository(), new AuditService());
    const group = service.createGroup('tenant_demo', ctx.userId, { code: 'GR-CNC-1', name: 'Concurrency group' }, ctx);
    const learner = service.createLearner('tenant_demo', ctx.userId, { code: 'LR-CNC-1', name: 'Concurrent Learner' }, ctx);

    const [first, second] = await Promise.allSettled([
      Promise.resolve().then(() => service.createEnrollment('tenant_demo', ctx.userId, { groupId: group.id, learnerId: learner.id }, ctx)),
      Promise.resolve().then(() => service.createEnrollment('tenant_demo', ctx.userId, { groupId: group.id, learnerId: learner.id }, ctx))
    ]);

    const fulfilled = [first, second].filter((item): item is PromiseFulfilledResult<unknown> => item.status === 'fulfilled');
    const rejected = [first, second].filter((item): item is PromiseRejectedResult => item.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBeInstanceOf(ConflictException);
  });

  it('keeps submitAttempt idempotent for duplicated concurrent submissions', async () => {
    const service = new MvpService(new TenantScopedRepository(), new AuditService());
    const course = service.createCourse('tenant_demo', ctx.userId, { code: 'C-CNC-2', title: 'Assessment race' }, ctx);
    const group = service.createGroup('tenant_demo', ctx.userId, { code: 'G-CNC-2', name: 'Group race' }, ctx);
    const learner = service.createLearner('tenant_demo', ctx.userId, { code: 'L-CNC-2', name: 'Learner race' }, ctx);
    const enrollment = service.createEnrollment('tenant_demo', ctx.userId, { groupId: group.id, learnerId: learner.id }, ctx);
    const bank = service.createQuestionBank('tenant_demo', ctx.userId, { title: 'Race bank', courseId: course.id }, ctx);
    const question = service.createQuestion(
      'tenant_demo',
      ctx.userId,
      { questionBankId: bank.id, text: '2+2?', type: 'single_choice', options: [{ text: '4', isCorrect: true }, { text: '5' }] },
      ctx
    );
    const test = service.createTest(
      'tenant_demo',
      ctx.userId,
      { title: 'Race test', courseId: course.id, questionBankId: bank.id, rules: { attemptLimit: 1, passingScore: 1 } },
      ctx
    );
    service.addTestQuestions('tenant_demo', test.id, [question.id]);

    const attempt = service.startAttempt('tenant_demo', ctx.userId, { testId: test.id, enrollmentId: enrollment.id, learnerId: learner.id }, ctx);
    const correctOption = service['answerOptions'].find((item) => item.questionId === question.id && item.isCorrect);
    expect(correctOption).toBeDefined();

    service.saveAttemptAnswer('tenant_demo', ctx.userId, attempt.id, { questionId: question.id, answerOptionIds: [correctOption!.id] }, ctx);

    const [firstSubmit, secondSubmit] = await Promise.all([
      Promise.resolve().then(() => service.submitAttempt('tenant_demo', ctx.userId, attempt.id, ctx)),
      Promise.resolve().then(() => service.submitAttempt('tenant_demo', ctx.userId, attempt.id, ctx))
    ]);

    expect(firstSubmit.id).toBe(secondSubmit.id);
    expect(firstSubmit.status).toBe('submitted');

    const results = service.getExamResultByEnrollment('tenant_demo', enrollment.id);
    expect(results).toHaveLength(1);
    expect(results[0]?.attemptsCount).toBe(1);
  });
});
