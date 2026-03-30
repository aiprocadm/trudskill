import { describe, expect, it, vi } from 'vitest';

import { AuditService } from '../audit/audit.service.js';
import { RealtimeEventsService } from '../core/realtime-events.service.js';
import { DocumentsService } from '../documents/documents.service.js';
import { EsignService } from '../esign/esign.service.js';
import { IamService } from '../iam/services/iam.service.js';
import { AuthService } from '../iam/services/auth.service.js';
import { TenantScopedRepository } from '../../infrastructure/database/tenant-repository.js';
import { MvpService } from './mvp.service.js';

const baseCtx = {
  requestId: 'req_stage13_e2e',
  correlationId: 'corr_stage13_e2e',
  tenantId: 'tenant_demo',
  userId: 'u_tenant_admin',
  roles: ['tenant_admin'],
  permissions: ['*'],
  ip: '127.0.0.1',
  userAgent: 'vitest',
  method: 'POST',
  path: '/api/v1/stage13',
  timestamp: new Date().toISOString()
} as const;

describe('stage13 business e2e flows (service-level)', () => {
  it('completes auth flow: login -> refresh -> logout and blocks blocked user', () => {
    const audit = new AuditService();
    const iam = new IamService(audit);
    const auth = new AuthService(iam, audit);

    const login = auth.login('tenant_demo', { login: 'tenant_admin', password: 'Password123!' }, baseCtx);
    expect(login.accessToken).toBeTruthy();

    const refreshed = auth.refresh('tenant_demo', login.refreshToken, { ...baseCtx, requestId: 'req_refresh' });
    expect(refreshed.sessionId).not.toBe(login.sessionId);

    auth.logout('tenant_demo', 'u_tenant_admin', refreshed.sessionId, { ...baseCtx, requestId: 'req_logout' });
    const sessions = auth.listSessions('tenant_demo', 'u_tenant_admin');
    expect(sessions.find((s) => s.id === refreshed.sessionId)?.revokedAt).toBeTruthy();

    expect(() => auth.login('tenant_demo', { login: 'blocked_user', password: 'Password123!' }, baseCtx)).toThrow();
  });

  it('completes learner journey: create course/group -> enroll -> progress -> exam', () => {
    const service = new MvpService(new TenantScopedRepository(), new AuditService());

    const course = service.createCourse('tenant_demo', baseCtx.userId, { code: 'C-E2E-13', title: 'Stage13 Course' }, baseCtx);
    const version = service.createCourseVersion('tenant_demo', course.id);
    const module = service.createModule('tenant_demo', baseCtx.userId, { courseVersionId: version.id, title: 'Module', minViewSeconds: 0 }, baseCtx);
    const material = service.createMaterial(
      'tenant_demo',
      baseCtx.userId,
      { moduleId: module.id, title: 'Material', materialType: 'video', minViewSeconds: 60, isRequired: true },
      baseCtx
    );
    service.publishCourse('tenant_demo', baseCtx.userId, course.id, baseCtx);

    const group = service.createGroup('tenant_demo', baseCtx.userId, { code: 'G-E2E-13', name: 'Stage13 Group' }, baseCtx);
    service.createGroupCourse('tenant_demo', { groupId: group.id, courseId: course.id });

    const learner = service.createLearner('tenant_demo', baseCtx.userId, { code: 'L-E2E-13', name: 'Stage13 Learner' }, baseCtx);
    const enrollment = service.createEnrollment('tenant_demo', baseCtx.userId, { groupId: group.id, learnerId: learner.id }, baseCtx);

    const progress = service.upsertMaterialProgress(
      'tenant_demo',
      baseCtx.userId,
      material.id,
      { enrollmentId: enrollment.id, studiedSeconds: 60 },
      baseCtx
    );
    expect(progress.status).toBe('completed');

    const bank = service.createQuestionBank('tenant_demo', baseCtx.userId, { title: 'E2E bank', courseId: course.id }, baseCtx);
    const question = service.createQuestion(
      'tenant_demo',
      baseCtx.userId,
      {
        questionBankId: bank.id,
        text: '2 + 2 = ?',
        type: 'single_choice',
        options: [{ text: '4', isCorrect: true }, { text: '5', isCorrect: false }]
      },
      baseCtx
    );
    const test = service.createTest(
      'tenant_demo',
      baseCtx.userId,
      { title: 'Final test', courseId: course.id, questionBankId: bank.id, rules: { attemptLimit: 1, passingScore: 1 } },
      baseCtx
    );
    service.addTestQuestions('tenant_demo', test.id, [question.id]);

    const attempt = service.startAttempt('tenant_demo', baseCtx.userId, { testId: test.id, enrollmentId: enrollment.id, learnerId: learner.id }, baseCtx);
    const option = service['answerOptions'].find((item) => item.questionId === question.id && item.isCorrect);
    expect(option).toBeDefined();

    service.saveAttemptAnswer('tenant_demo', baseCtx.userId, attempt.id, { questionId: question.id, answerOptionIds: [option!.id] }, baseCtx);
    service.submitAttempt('tenant_demo', baseCtx.userId, attempt.id, baseCtx);
    service.finishAttempt('tenant_demo', baseCtx.userId, attempt.id, baseCtx);

    const result = service.getAttemptResult('tenant_demo', attempt.id);
    expect(result.passed).toBe(true);
  });

  it('completes document generation and e-sign signing flow with legal log artifacts', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true } as Response);

    const audit = new AuditService();
    const realtime = new RealtimeEventsService();
    const documents = new DocumentsService(audit, realtime);
    const esign = new EsignService(audit, documents, { publish: vi.fn() } as any);

    const template = documents.createTemplate('tenant_demo', baseCtx.userId, { name: 'Completion template', templateType: 'certificate' }, baseCtx);
    const version = documents.createTemplateVersion('tenant_demo', baseCtx.userId, { templateId: template.id, fileId: 'file_template_1' });
    documents.activateTemplateVersion('tenant_demo', version.id);

    const task = documents.generateDocument('tenant_demo', baseCtx.userId, {
      idempotencyKey: 'stage13-doc-e2e',
      templateId: template.id,
      templateVersionId: version.id,
      sourceEntityType: 'enrollment',
      sourceEntityId: 'enroll_stage13',
      documentType: 'certificate'
    });
    const generated = documents.completeTask('tenant_demo', task.id, 'file_generated_13', baseCtx.userId);

    const app = esign.createApplication('tenant_demo', baseCtx.userId, { learnerId: 'learner_stage13' }, baseCtx);
    const appFile = esign.createApplicationFile('tenant_demo', baseCtx.userId, { applicationId: app.id, fileId: 'file_esign_1' });
    esign.verifyApplicationFile('tenant_demo', baseCtx.userId, appFile.id);
    esign.submitApplication('tenant_demo', baseCtx.userId, app.id);
    esign.startReview('tenant_demo', 'u_staff_1', app.id);
    esign.approveApplication('tenant_demo', 'u_staff_1', app.id);

    const process = esign.createProcess('tenant_demo', 'u_staff_1', {
      idempotencyKey: 'stage13-proc-create',
      generatedDocumentId: generated.id,
      applicationId: app.id,
      sequential: true
    });
    const participant = esign.createParticipant('tenant_demo', 'u_staff_1', {
      processId: process.id,
      participantType: 'employee',
      participantUserId: 'u_signer_1',
      signOrder: 1
    });

    esign.startProcess('tenant_demo', 'u_staff_1', process.id, { idempotencyKey: 'stage13-proc-start' });
    esign.inviteParticipant('tenant_demo', 'u_staff_1', participant.id);
    esign.signParticipant('tenant_demo', 'u_signer_1', participant.id, { idempotencyKey: 'stage13-sign' });

    expect(esign.getProcess('tenant_demo', process.id).status).toBe('signed');
    expect(documents.getDocument('tenant_demo', generated.id).status).toBe('final');
    expect(esign.listLegalLog('tenant_demo', {}).items.length).toBeGreaterThan(0);
  });
});
