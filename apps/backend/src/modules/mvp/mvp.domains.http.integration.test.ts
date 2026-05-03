import 'reflect-metadata';
import { Module, Scope } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createAppValidationPipe } from '../../common/app-validation.pipe.js';
import { AuditService } from '../audit/audit.service.js';
import { DocumentsService } from '../documents/documents.service.js';
import { FilesService } from '../files/files.service.js';
import { PermissionGuard } from '../iam/permission.guard.js';
import { AuthService } from '../iam/services/auth.service.js';
import { IamService } from '../iam/services/iam.service.js';

/** Права для полного охвата `mvp`-маршрутов, используемых в этом HTTP suite. */
const MVP_DOMAIN_HTTP_PERMS: readonly string[] = [
  'counterparties.read',
  'counterparties.write',
  'learners.read',
  'learners.write',
  'directions.read',
  'directions.write',
  'courses.read',
  'courses.write',
  'courses.publish',
  'courses.archive',
  'materials.read',
  'materials.write',
  'groups.read',
  'groups.write',
  'enrollments.read',
  'enrollments.write',
  'enrollments.change_status',
  'progress.read',
  'progress.recalculate',
  'assessment.question_banks.read',
  'assessment.question_banks.write',
  'assessment.questions.read',
  'assessment.questions.write',
  'assessment.tests.read',
  'assessment.tests.write',
  'assessment.tests.publish',
  'assessment.attempts.read',
  'assessment.attempts.take',
  'assessment.results.read',
  'assessment.assignments.read',
  'assessment.assignments.write',
  'assessment.submissions.submit',
  'assessment.reviews.review'
];

describe('MVP HTTP integration (domain invariants)', () => {
  let issueSignedAccessToken: (
    payload: {
      sub: string;
      tenant_id: string;
      session_id: string;
      roles: string[];
    },
    secret: string,
    ttlSeconds: number
  ) => string;
  let apiBaseUrl = '';
  let app:
    | {
        close: () => Promise<void>;
        getHttpServer: () => { address: () => { port: number } | string | null };
      }
    | undefined;

  const authServiceMock = { isSessionActive: vi.fn().mockResolvedValue(true) };
  /** Токены `tokenFor()` используют `sub=u_domain_http_actor` — ему нужен bypass list/GET для staff-сценариев. */
  const MVP_HTTP_STAFF_SUB = 'u_domain_http_actor';
  const iamServiceMock = {
    resolvePermissions: vi.fn().mockImplementation((_tenantId: string, userId: string) => {
      const perms = [...MVP_DOMAIN_HTTP_PERMS];
      if (userId === MVP_HTTP_STAFF_SUB) {
        perms.push('assessment.read.cross_learner', 'learners.act_as');
      }
      return Promise.resolve(perms);
    })
  };
  const noopFilesService = {
    ensureMaterialLink: async (): Promise<undefined> => undefined
  } as unknown as FilesService;
  const noopDocumentsService = {
    listDocuments: () => ({ items: [], page: 1, pageSize: 200, total: 0 })
  } as unknown as DocumentsService;

  beforeAll(async () => {
    const requiredEnv: Record<string, string> = {
      NODE_ENV: 'test',
      BACKEND_PORT: '3001',
      API_PREFIX: '/api/v1',
      ALLOW_IN_MEMORY_STATE: 'true',
      AUTH_JWT_SECRET: 'secret_value_123',
      SESSION_SECRET: 'session_secret_123',
      CORS_ORIGIN: 'http://localhost:3000',
      PUBLIC_BASE_URL: 'http://localhost:3000',
      REALTIME_PUBLIC_URL: 'ws://localhost:3000',
      REALTIME_PUBLISH_KEY: 'test-realtime-publish-key'
    };
    Object.assign(process.env, requiredEnv);

    const [
      { NestFactory },
      { ThrottlerModule },
      { HttpExceptionEnvelopeFilter },
      { RequestContextInterceptor },
      { ResponseEnvelopeInterceptor },
      { TenantGuard },
      cryptoImport,
      { MetricsService },
      { TenantScopedRepository },
      { TenantSerialGateway },
      { SecretsService },
      { MVP_PERSISTENCE_BACKEND },
      { MVP_STATE },
      { MvpRequestPersistenceInterceptor },
      { MemoryMvpPersistenceBackend },
      { MvpBulkEnqueueService },
      { MvpController },
      { MvpService },
      { InMemoryMvpState }
    ] = await Promise.all([
      import('@nestjs/core'),
      import('@nestjs/throttler'),
      import('../../common/filters/http-exception.filter.js'),
      import('../../common/interceptors/request-context.interceptor.js'),
      import('../../common/interceptors/response-envelope.interceptor.js'),
      import('../../common/guards/tenant.guard.js'),
      import('../iam/crypto.util.js'),
      import('../../common/metrics/metrics.service.js'),
      import('../../infrastructure/database/tenant-repository.js'),
      import('../../infrastructure/request/tenant-serial.gateway.js'),
      import('../../infrastructure/secrets/secrets.service.js'),
      import('./infrastructure/mvp-persistence.token.js'),
      import('./infrastructure/mvp-state.token.js'),
      import('./infrastructure/mvp-request-persistence.interceptor.js'),
      import('./infrastructure/memory-mvp-persistence.backend.js'),
      import('./mvp-bulk-enqueue.service.js'),
      import('./mvp.controller.js'),
      import('./mvp.service.js'),
      import('./infrastructure/in-memory-mvp.state.js')
    ]);

    issueSignedAccessToken = cryptoImport.issueSignedAccessToken;

    @Module({
      imports: [
        EventEmitterModule.forRoot(),
        ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 300 }] })
      ],
      controllers: [MvpController],
      providers: [
        Reflector,
        TenantGuard,
        SecretsService,
        AuditService,
        TenantScopedRepository,
        MetricsService,
        MemoryMvpPersistenceBackend,
        { provide: MVP_PERSISTENCE_BACKEND, useExisting: MemoryMvpPersistenceBackend },
        TenantSerialGateway,
        { provide: MVP_STATE, scope: Scope.REQUEST, useClass: InMemoryMvpState },
        { provide: MvpService, scope: Scope.REQUEST, useClass: MvpService },
        {
          provide: MvpRequestPersistenceInterceptor,
          scope: Scope.REQUEST,
          useClass: MvpRequestPersistenceInterceptor
        },
        PermissionGuard,
        {
          provide: MvpBulkEnqueueService,
          useValue: {
            publishBulkJob: vi.fn().mockResolvedValue({
              status: 'queued',
              messageId: 'test_worker_message',
              idempotencyKey: 'test'
            })
          }
        },
        { provide: AuthService, useValue: authServiceMock },
        { provide: IamService, useValue: iamServiceMock },
        { provide: FilesService, useValue: noopFilesService },
        { provide: DocumentsService, useValue: noopDocumentsService }
      ]
    })
    class MvpDomainsHttpIntegrationRootModule {}

    const created = await NestFactory.create(MvpDomainsHttpIntegrationRootModule, {
      logger: false
    });
    created.useGlobalPipes(createAppValidationPipe());
    created.useGlobalFilters(new HttpExceptionEnvelopeFilter());
    created.useGlobalInterceptors(
      new RequestContextInterceptor(),
      new ResponseEnvelopeInterceptor()
    );
    created.setGlobalPrefix((process.env.API_PREFIX ?? '/api/v1').replace(/^\//, ''));

    await created.listen(0, '127.0.0.1');

    const address = created.getHttpServer().address() as Socket | { port: number };
    const port = typeof address === 'object' && address && 'port' in address ? address.port : 0;
    apiBaseUrl = `http://127.0.0.1:${port}${process.env.API_PREFIX ?? '/api/v1'}`;
    app = created;
  }, 120_000);

  afterAll(async () => {
    if (app) await app.close();
  });

  const hdr = (token: string): HeadersInit => ({
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    'x-tenant-id': 'tenant_demo'
  });

  const tokenFor = (sessionId: string): string =>
    issueSignedAccessToken(
      {
        sub: 'u_domain_http_actor',
        tenant_id: 'tenant_demo',
        session_id: sessionId,
        roles: ['tenant_admin']
      },
      process.env.AUTH_JWT_SECRET ?? 'secret_value_123',
      3600
    );

  it('HTTP: rejects assignment submission when group is not linked to assignment course', async () => {
    const t = tokenFor('sess_http_submissions_1');

    const courseRes = await fetch(`${apiBaseUrl}/courses`, {
      method: 'POST',
      headers: hdr(t),
      body: JSON.stringify({ code: `CDH1_${Date.now()}`, title: 'DH Course' })
    });
    const course = (await courseRes.json()) as { data: { id: string } };

    const groupWrap = (await (
      await fetch(`${apiBaseUrl}/groups`, {
        method: 'POST',
        headers: hdr(t),
        body: JSON.stringify({ code: `GDH1_${Date.now()}`, name: 'DH Group' })
      })
    ).json()) as { data: { id: string } };
    const groupId = groupWrap.data.id;

    const learner = (await (
      await fetch(`${apiBaseUrl}/learners`, {
        method: 'POST',
        headers: hdr(t),
        body: JSON.stringify({ code: `LDH1_${Date.now()}`, name: 'Learner' })
      })
    ).json()) as { data: { id: string } };

    const enrollment = (await (
      await fetch(`${apiBaseUrl}/enrollments`, {
        method: 'POST',
        headers: hdr(t),
        body: JSON.stringify({ groupId, learnerId: learner.data.id })
      })
    ).json()) as { data: { id: string } };

    const assignment = (await (
      await fetch(`${apiBaseUrl}/assignments`, {
        method: 'POST',
        headers: hdr(t),
        body: JSON.stringify({
          courseId: course.data.id,
          title: 'Task',
          maxScore: 50
        })
      })
    ).json()) as { data: { id: string } };

    const res = await fetch(`${apiBaseUrl}/assignment-submissions`, {
      method: 'POST',
      headers: hdr(t),
      body: JSON.stringify({
        assignmentId: assignment.data.id,
        enrollmentId: enrollment.data.id,
        learnerId: learner.data.id,
        answerText: 'attempt'
      })
    });

    expect(res.status).toBe(412);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('domain_rule_violation');
  });

  it('HTTP: class-validator — submissions без learnerId, progress studiedSeconds<0, forbidNonWhitelisted', async () => {
    const ts = Date.now();
    const t = tokenFor(`sess_http_cval_${ts}`);

    const noLearnerRes = await fetch(`${apiBaseUrl}/assignment-submissions`, {
      method: 'POST',
      headers: hdr(t),
      body: JSON.stringify({
        assignmentId: 'asg_dummy',
        enrollmentId: 'enr_dummy',
        answerText: 'x'
      })
    });
    expect(noLearnerRes.status).toBe(400);
    expect(((await noLearnerRes.json()) as { error: { code: string } }).error.code).toBe(
      'validation_error'
    );

    const course = (await (
      await fetch(`${apiBaseUrl}/courses`, {
        method: 'POST',
        headers: hdr(t),
        body: JSON.stringify({ code: `CVAL_${ts}`, title: 'Validator progress course' })
      })
    ).json()) as { data: { id: string } };

    const ver = (await (
      await fetch(`${apiBaseUrl}/course-versions/${course.data.id}`, {
        method: 'POST',
        headers: hdr(t)
      })
    ).json()) as { data: { id: string } };

    await fetch(`${apiBaseUrl}/courses/${course.data.id}/publish`, {
      method: 'POST',
      headers: hdr(t)
    });

    const mod = (await (
      await fetch(`${apiBaseUrl}/modules`, {
        method: 'POST',
        headers: hdr(t),
        body: JSON.stringify({
          courseVersionId: ver.data.id,
          title: 'Module V',
          minViewSeconds: 0
        })
      })
    ).json()) as { data: { id: string } };

    const mat = (await (
      await fetch(`${apiBaseUrl}/materials`, {
        method: 'POST',
        headers: hdr(t),
        body: JSON.stringify({
          moduleId: mod.data.id,
          title: 'Material V',
          materialType: 'text',
          minViewSeconds: 30
        })
      })
    ).json()) as { data: { id: string } };

    const groupWrap = (await (
      await fetch(`${apiBaseUrl}/groups`, {
        method: 'POST',
        headers: hdr(t),
        body: JSON.stringify({ code: `GVAL_${ts}`, name: 'Group V' })
      })
    ).json()) as { data: { id: string } };

    const learner = (await (
      await fetch(`${apiBaseUrl}/learners`, {
        method: 'POST',
        headers: hdr(t),
        body: JSON.stringify({ code: `LVAL_${ts}`, name: 'Learner V' })
      })
    ).json()) as { data: { id: string } };

    const enrollment = (await (
      await fetch(`${apiBaseUrl}/enrollments`, {
        method: 'POST',
        headers: hdr(t),
        body: JSON.stringify({
          groupId: groupWrap.data.id,
          learnerId: learner.data.id
        })
      })
    ).json()) as { data: { id: string } };

    await fetch(`${apiBaseUrl}/group-courses`, {
      method: 'POST',
      headers: hdr(t),
      body: JSON.stringify({ groupId: groupWrap.data.id, courseId: course.data.id })
    });

    const negSeconds = await fetch(`${apiBaseUrl}/progress/materials/${mat.data.id}`, {
      method: 'PATCH',
      headers: hdr(t),
      body: JSON.stringify({
        enrollmentId: enrollment.data.id,
        studiedSeconds: -1
      })
    });
    expect(negSeconds.status).toBe(400);
    expect(((await negSeconds.json()) as { error: { code: string } }).error.code).toBe(
      'validation_error'
    );

    const nonWhitelisted = await fetch(`${apiBaseUrl}/progress/materials/${mat.data.id}`, {
      method: 'PATCH',
      headers: hdr(t),
      body: JSON.stringify({
        enrollmentId: enrollment.data.id,
        studiedSeconds: 0,
        unexpectedFieldShouldReject: true
      })
    });
    expect(nonWhitelisted.status).toBe(400);
    expect(((await nonWhitelisted.json()) as { error: { code: string } }).error.code).toBe(
      'validation_error'
    );
  });

  it('HTTP: rejects test attempt start when enrollment is not linked to test course', async () => {
    const t = tokenFor('sess_http_attempts_1');

    const courseRes = await fetch(`${apiBaseUrl}/courses`, {
      method: 'POST',
      headers: hdr(t),
      body: JSON.stringify({ code: `CDH2_${Date.now()}`, title: 'Attempt Course' })
    });
    const course = (await courseRes.json()) as { data: { id: string } };

    const groupWrap = (await (
      await fetch(`${apiBaseUrl}/groups`, {
        method: 'POST',
        headers: hdr(t),
        body: JSON.stringify({ code: `GDH2_${Date.now()}`, name: 'Attempt Group' })
      })
    ).json()) as { data: { id: string } };
    const groupId = groupWrap.data.id;

    const learner = (await (
      await fetch(`${apiBaseUrl}/learners`, {
        method: 'POST',
        headers: hdr(t),
        body: JSON.stringify({ code: `LDH2_${Date.now()}`, name: 'Learner 2' })
      })
    ).json()) as { data: { id: string } };

    const enrollment = (await (
      await fetch(`${apiBaseUrl}/enrollments`, {
        method: 'POST',
        headers: hdr(t),
        body: JSON.stringify({ groupId, learnerId: learner.data.id })
      })
    ).json()) as { data: { id: string } };

    const bank = (await (
      await fetch(`${apiBaseUrl}/question-banks`, {
        method: 'POST',
        headers: hdr(t),
        body: JSON.stringify({ title: 'Bank', courseId: course.data.id })
      })
    ).json()) as { data: { id: string } };

    const q = (await (
      await fetch(`${apiBaseUrl}/questions`, {
        method: 'POST',
        headers: hdr(t),
        body: JSON.stringify({
          questionBankId: bank.data.id,
          type: 'text',
          text: 'Q?',
          score: 1
        })
      })
    ).json()) as { data: { id: string } };

    const test = (await (
      await fetch(`${apiBaseUrl}/tests`, {
        method: 'POST',
        headers: hdr(t),
        body: JSON.stringify({
          title: 'Exam',
          courseId: course.data.id,
          questionBankId: bank.data.id,
          rules: { attemptLimit: 3 }
        })
      })
    ).json()) as { data: { id: string } };

    await fetch(`${apiBaseUrl}/tests/${test.data.id}/questions`, {
      method: 'POST',
      headers: hdr(t),
      body: JSON.stringify({ questionIds: [q.data.id] })
    });

    const res = await fetch(`${apiBaseUrl}/attempts/start`, {
      method: 'POST',
      headers: hdr(t),
      body: JSON.stringify({
        testId: test.data.id,
        enrollmentId: enrollment.data.id,
        learnerId: learner.data.id
      })
    });

    expect(res.status).toBe(412);
    const payload = (await res.json()) as { error: { code: string } };
    expect(payload.error.code).toBe('domain_rule_violation');
  });

  it('HTTP: rejects assignment review on draft submission and score above maxScore', async () => {
    const t = tokenFor('sess_http_reviews_1');

    const courseRes = await fetch(`${apiBaseUrl}/courses`, {
      method: 'POST',
      headers: hdr(t),
      body: JSON.stringify({ code: `CDH3_${Date.now()}`, title: 'Review Course' })
    });
    const course = (await courseRes.json()) as { data: { id: string } };

    const groupWrap = (await (
      await fetch(`${apiBaseUrl}/groups`, {
        method: 'POST',
        headers: hdr(t),
        body: JSON.stringify({ code: `GDH3_${Date.now()}`, name: 'Review Group' })
      })
    ).json()) as { data: { id: string } };
    const groupId = groupWrap.data.id;

    await fetch(`${apiBaseUrl}/group-courses`, {
      method: 'POST',
      headers: hdr(t),
      body: JSON.stringify({ groupId, courseId: course.data.id })
    });

    const learner = (await (
      await fetch(`${apiBaseUrl}/learners`, {
        method: 'POST',
        headers: hdr(t),
        body: JSON.stringify({ code: `LDH3_${Date.now()}`, name: 'Learner 3' })
      })
    ).json()) as { data: { id: string } };

    const enrollment = (await (
      await fetch(`${apiBaseUrl}/enrollments`, {
        method: 'POST',
        headers: hdr(t),
        body: JSON.stringify({ groupId, learnerId: learner.data.id })
      })
    ).json()) as { data: { id: string } };

    const assignment = (await (
      await fetch(`${apiBaseUrl}/assignments`, {
        method: 'POST',
        headers: hdr(t),
        body: JSON.stringify({
          courseId: course.data.id,
          title: 'Review HW',
          maxScore: 5
        })
      })
    ).json()) as { data: { id: string } };

    const submission = (await (
      await fetch(`${apiBaseUrl}/assignment-submissions`, {
        method: 'POST',
        headers: hdr(t),
        body: JSON.stringify({
          assignmentId: assignment.data.id,
          enrollmentId: enrollment.data.id,
          learnerId: learner.data.id,
          answerText: 'draft-only'
        })
      })
    ).json()) as { data: { id: string } };

    const draftReview = await fetch(`${apiBaseUrl}/assignment-reviews`, {
      method: 'POST',
      headers: hdr(t),
      body: JSON.stringify({ submissionId: submission.data.id, score: 1 })
    });
    expect(draftReview.status).toBe(412);
    expect(((await draftReview.json()) as { error: { code: string } }).error.code).toBe(
      'domain_rule_violation'
    );

    await fetch(`${apiBaseUrl}/assignment-submissions/${submission.data.id}/submit`, {
      method: 'POST',
      headers: hdr(t)
    });

    const badScore = await fetch(`${apiBaseUrl}/assignment-reviews`, {
      method: 'POST',
      headers: hdr(t),
      body: JSON.stringify({ submissionId: submission.data.id, score: 100 })
    });
    expect(badScore.status).toBe(400);
    expect(((await badScore.json()) as { error: { code: string } }).error.code).toBe(
      'validation_error'
    );

    const ok = await fetch(`${apiBaseUrl}/assignment-reviews`, {
      method: 'POST',
      headers: hdr(t),
      body: JSON.stringify({ submissionId: submission.data.id, score: 5 })
    });
    expect(ok.ok).toBe(true);
    const envelope = (await ok.json()) as { data: { id: string }; meta?: { requestId: string } };
    expect(envelope.data.id).toBeTruthy();
    expect(envelope.meta?.requestId).toBeTruthy();
  });

  it('HTTP: PATCH progress/materials без group-course → 412 domain_rule_violation', async () => {
    const t = tokenFor('sess_http_prog_nlink');
    const ts = Date.now();

    const course = (await (
      await fetch(`${apiBaseUrl}/courses`, {
        method: 'POST',
        headers: hdr(t),
        body: JSON.stringify({ code: `CPRG_${ts}`, title: 'Progress course' })
      })
    ).json()) as { data: { id: string } };

    const ver = (await (
      await fetch(`${apiBaseUrl}/course-versions/${course.data.id}`, {
        method: 'POST',
        headers: hdr(t)
      })
    ).json()) as { data: { id: string } };

    await fetch(`${apiBaseUrl}/courses/${course.data.id}/publish`, {
      method: 'POST',
      headers: hdr(t)
    });

    const mod = (await (
      await fetch(`${apiBaseUrl}/modules`, {
        method: 'POST',
        headers: hdr(t),
        body: JSON.stringify({
          courseVersionId: ver.data.id,
          title: 'Module P',
          minViewSeconds: 0
        })
      })
    ).json()) as { data: { id: string } };

    const mat = (await (
      await fetch(`${apiBaseUrl}/materials`, {
        method: 'POST',
        headers: hdr(t),
        body: JSON.stringify({
          moduleId: mod.data.id,
          title: 'Lesson',
          materialType: 'text',
          minViewSeconds: 30
        })
      })
    ).json()) as { data: { id: string } };

    const groupWrap = (await (
      await fetch(`${apiBaseUrl}/groups`, {
        method: 'POST',
        headers: hdr(t),
        body: JSON.stringify({ code: `GPROG_${ts}`, name: 'Group P' })
      })
    ).json()) as { data: { id: string } };

    const learner = (await (
      await fetch(`${apiBaseUrl}/learners`, {
        method: 'POST',
        headers: hdr(t),
        body: JSON.stringify({ code: `LPROG_${ts}`, name: 'Prog Learner' })
      })
    ).json()) as { data: { id: string } };

    const enrollment = (await (
      await fetch(`${apiBaseUrl}/enrollments`, {
        method: 'POST',
        headers: hdr(t),
        body: JSON.stringify({
          groupId: groupWrap.data.id,
          learnerId: learner.data.id
        })
      })
    ).json()) as { data: { id: string } };

    const progRes = await fetch(`${apiBaseUrl}/progress/materials/${mat.data.id}`, {
      method: 'PATCH',
      headers: hdr(t),
      body: JSON.stringify({
        enrollmentId: enrollment.data.id,
        studiedSeconds: 40
      })
    });

    expect(progRes.status).toBe(412);
    const body = (await progRes.json()) as { error: { code: string } };
    expect(body.error.code).toBe('domain_rule_violation');
  });

  it('HTTP: 403 когда слушатель с linkedIamUserId, а JWT — другой пользователь', async () => {
    const ts = Date.now();
    const admin = tokenFor(`sess_http_idor_${ts}`);

    const course = (await (
      await fetch(`${apiBaseUrl}/courses`, {
        method: 'POST',
        headers: hdr(admin),
        body: JSON.stringify({ code: `CIDOR_${ts}`, title: 'IDOR Course' })
      })
    ).json()) as { data: { id: string } };

    const groupWrap = (await (
      await fetch(`${apiBaseUrl}/groups`, {
        method: 'POST',
        headers: hdr(admin),
        body: JSON.stringify({ code: `GIDOR_${ts}`, name: 'IDOR G' })
      })
    ).json()) as { data: { id: string } };

    await fetch(`${apiBaseUrl}/group-courses`, {
      method: 'POST',
      headers: hdr(admin),
      body: JSON.stringify({ groupId: groupWrap.data.id, courseId: course.data.id })
    });

    const learner = (await (
      await fetch(`${apiBaseUrl}/learners`, {
        method: 'POST',
        headers: hdr(admin),
        body: JSON.stringify({
          code: `LIDA_${ts}`,
          name: 'Linked Learner',
          linkedIamUserId: 'u_alice_linked'
        })
      })
    ).json()) as { data: { id: string } };

    const enrollment = (await (
      await fetch(`${apiBaseUrl}/enrollments`, {
        method: 'POST',
        headers: hdr(admin),
        body: JSON.stringify({
          groupId: groupWrap.data.id,
          learnerId: learner.data.id
        })
      })
    ).json()) as { data: { id: string } };

    const assignment = (await (
      await fetch(`${apiBaseUrl}/assignments`, {
        method: 'POST',
        headers: hdr(admin),
        body: JSON.stringify({
          courseId: course.data.id,
          title: 'Secure HW',
          maxScore: 10
        })
      })
    ).json()) as { data: { id: string } };

    const tokenBob = issueSignedAccessToken(
      {
        sub: 'u_bob_intruder',
        tenant_id: 'tenant_demo',
        session_id: `sess_idor_bob_${ts}`,
        roles: ['student']
      },
      process.env.AUTH_JWT_SECRET ?? 'secret_value_123',
      3600
    );

    const blocked = await fetch(`${apiBaseUrl}/assignment-submissions`, {
      method: 'POST',
      headers: hdr(tokenBob),
      body: JSON.stringify({
        assignmentId: assignment.data.id,
        enrollmentId: enrollment.data.id,
        learnerId: learner.data.id,
        answerText: 'attack'
      })
    });

    expect(blocked.status).toBe(403);
    expect(((await blocked.json()) as { error: { code: string } }).error.code).toBe('forbidden');

    const tokenAlice = issueSignedAccessToken(
      {
        sub: 'u_alice_linked',
        tenant_id: 'tenant_demo',
        session_id: `sess_idor_alice_${ts}`,
        roles: ['student']
      },
      process.env.AUTH_JWT_SECRET ?? 'secret_value_123',
      3600
    );

    const ok = await fetch(`${apiBaseUrl}/assignment-submissions`, {
      method: 'POST',
      headers: hdr(tokenAlice),
      body: JSON.stringify({
        assignmentId: assignment.data.id,
        enrollmentId: enrollment.data.id,
        learnerId: learner.data.id,
        answerText: 'fine'
      })
    });

    expect(ok.ok).toBe(true);
    const envelope = (await ok.json()) as { data: { id: string } };
    expect(envelope.data.id).toBeTruthy();

    const bobGetSubmission = await fetch(
      `${apiBaseUrl}/assignment-submissions/${envelope.data.id}`,
      { headers: hdr(tokenBob) }
    );
    expect(bobGetSubmission.status).toBe(403);

    const aliceGetSubmission = await fetch(
      `${apiBaseUrl}/assignment-submissions/${envelope.data.id}`,
      { headers: hdr(tokenAlice) }
    );
    expect(aliceGetSubmission.ok).toBe(true);
  });

  it('HTTP: 403 когда чужой JWT читает attempt и exam-results по enrollment без cross_learner', async () => {
    const ts = Date.now();
    const admin = tokenFor(`sess_http_idor_reads_${ts}`);

    const course = (await (
      await fetch(`${apiBaseUrl}/courses`, {
        method: 'POST',
        headers: hdr(admin),
        body: JSON.stringify({
          code: `CIRD_${ts}`,
          title: 'IDOR reads course'
        })
      })
    ).json()) as { data: { id: string } };

    const groupWrap = (await (
      await fetch(`${apiBaseUrl}/groups`, {
        method: 'POST',
        headers: hdr(admin),
        body: JSON.stringify({ code: `GIRD_${ts}`, name: 'IDOR reads group' })
      })
    ).json()) as { data: { id: string } };

    await fetch(`${apiBaseUrl}/group-courses`, {
      method: 'POST',
      headers: hdr(admin),
      body: JSON.stringify({ groupId: groupWrap.data.id, courseId: course.data.id })
    });

    const bank = (await (
      await fetch(`${apiBaseUrl}/question-banks`, {
        method: 'POST',
        headers: hdr(admin),
        body: JSON.stringify({ title: `BankIRD_${ts}`, courseId: course.data.id })
      })
    ).json()) as { data: { id: string } };

    const q = (await (
      await fetch(`${apiBaseUrl}/questions`, {
        method: 'POST',
        headers: hdr(admin),
        body: JSON.stringify({
          questionBankId: bank.data.id,
          type: 'text',
          text: `QIRD_${ts}`,
          score: 1
        })
      })
    ).json()) as { data: { id: string } };

    const test = (await (
      await fetch(`${apiBaseUrl}/tests`, {
        method: 'POST',
        headers: hdr(admin),
        body: JSON.stringify({
          title: `ExamIRD_${ts}`,
          courseId: course.data.id,
          questionBankId: bank.data.id,
          rules: { attemptLimit: 3 }
        })
      })
    ).json()) as { data: { id: string } };

    await fetch(`${apiBaseUrl}/tests/${test.data.id}/questions`, {
      method: 'POST',
      headers: hdr(admin),
      body: JSON.stringify({ questionIds: [q.data.id] })
    });

    const iamAlice = `u_alice_reads_${ts}`;
    const learner = (await (
      await fetch(`${apiBaseUrl}/learners`, {
        method: 'POST',
        headers: hdr(admin),
        body: JSON.stringify({
          code: `LAIRD_${ts}`,
          name: 'Alice reads',
          linkedIamUserId: iamAlice
        })
      })
    ).json()) as { data: { id: string } };

    const enrollment = (await (
      await fetch(`${apiBaseUrl}/enrollments`, {
        method: 'POST',
        headers: hdr(admin),
        body: JSON.stringify({
          groupId: groupWrap.data.id,
          learnerId: learner.data.id
        })
      })
    ).json()) as { data: { id: string } };

    const tokenAlice = issueSignedAccessToken(
      {
        sub: iamAlice,
        tenant_id: 'tenant_demo',
        session_id: `sess_idor_reads_alice_${ts}`,
        roles: ['student']
      },
      process.env.AUTH_JWT_SECRET ?? 'secret_value_123',
      3600
    );

    const started = (await (
      await fetch(`${apiBaseUrl}/attempts/start`, {
        method: 'POST',
        headers: hdr(tokenAlice),
        body: JSON.stringify({
          testId: test.data.id,
          enrollmentId: enrollment.data.id,
          learnerId: learner.data.id
        })
      })
    ).json()) as { data: { id: string } };

    expect(started.data.id).toBeTruthy();

    const tokenBob = issueSignedAccessToken(
      {
        sub: 'u_bob_intruder',
        tenant_id: 'tenant_demo',
        session_id: `sess_idor_reads_bob_${ts}`,
        roles: ['student']
      },
      process.env.AUTH_JWT_SECRET ?? 'secret_value_123',
      3600
    );

    const bobGetAttempt = await fetch(`${apiBaseUrl}/attempts/${started.data.id}`, {
      headers: hdr(tokenBob)
    });
    expect(bobGetAttempt.status).toBe(403);
    expect(((await bobGetAttempt.json()) as { error: { code: string } }).error.code).toBe(
      'forbidden'
    );

    const aliceGetAttempt = await fetch(`${apiBaseUrl}/attempts/${started.data.id}`, {
      headers: hdr(tokenAlice)
    });
    expect(aliceGetAttempt.ok).toBe(true);

    const bobByEnrollment = await fetch(
      `${apiBaseUrl}/exam-results/by-enrollment/${enrollment.data.id}`,
      { headers: hdr(tokenBob) }
    );
    expect(bobByEnrollment.status).toBe(403);
    expect(((await bobByEnrollment.json()) as { error: { code: string } }).error.code).toBe(
      'forbidden'
    );

    const staffByEnrollment = await fetch(
      `${apiBaseUrl}/exam-results/by-enrollment/${enrollment.data.id}`,
      { headers: hdr(admin) }
    );
    expect(staffByEnrollment.ok).toBe(true);
  });

  it('HTTP: staff с learners.act_as создаёт submission за IAM-связанного слушателя', async () => {
    const ts = Date.now();
    const admin = tokenFor(`sess_http_act_as_${ts}`);

    const course = (await (
      await fetch(`${apiBaseUrl}/courses`, {
        method: 'POST',
        headers: hdr(admin),
        body: JSON.stringify({ code: `CACT_${ts}`, title: 'Act-as course' })
      })
    ).json()) as { data: { id: string } };

    const groupWrap = (await (
      await fetch(`${apiBaseUrl}/groups`, {
        method: 'POST',
        headers: hdr(admin),
        body: JSON.stringify({ code: `GACT_${ts}`, name: 'Act-as G' })
      })
    ).json()) as { data: { id: string } };

    await fetch(`${apiBaseUrl}/group-courses`, {
      method: 'POST',
      headers: hdr(admin),
      body: JSON.stringify({ groupId: groupWrap.data.id, courseId: course.data.id })
    });

    const learner = (await (
      await fetch(`${apiBaseUrl}/learners`, {
        method: 'POST',
        headers: hdr(admin),
        body: JSON.stringify({
          code: `LACT_${ts}`,
          name: 'Linked for act-as',
          linkedIamUserId: 'u_only_learner_iam'
        })
      })
    ).json()) as { data: { id: string } };

    const enrollment = (await (
      await fetch(`${apiBaseUrl}/enrollments`, {
        method: 'POST',
        headers: hdr(admin),
        body: JSON.stringify({
          groupId: groupWrap.data.id,
          learnerId: learner.data.id
        })
      })
    ).json()) as { data: { id: string } };

    const assignment = (await (
      await fetch(`${apiBaseUrl}/assignments`, {
        method: 'POST',
        headers: hdr(admin),
        body: JSON.stringify({
          courseId: course.data.id,
          title: 'Delegated HW',
          maxScore: 5
        })
      })
    ).json()) as { data: { id: string } };

    const staffRes = await fetch(`${apiBaseUrl}/assignment-submissions`, {
      method: 'POST',
      headers: hdr(admin),
      body: JSON.stringify({
        assignmentId: assignment.data.id,
        enrollmentId: enrollment.data.id,
        learnerId: learner.data.id,
        answerText: 'filed by staff with act_as'
      })
    });

    expect(staffRes.ok).toBe(true);
    const body = (await staffRes.json()) as { data: { id: string } };
    expect(body.data.id).toBeTruthy();
  });
});
