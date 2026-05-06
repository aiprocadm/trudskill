import 'reflect-metadata';
import { Module, Scope } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { MVP_COLLECTIONS, type MvpCollection } from './infrastructure/mvp-collections.js';
import { createAppValidationPipe } from '../../common/app-validation.pipe.js';
import { AuditService } from '../audit/audit.service.js';
import { DocumentsService } from '../documents/documents.service.js';
import { FilesService } from '../files/files.service.js';
import { PermissionGuard } from '../iam/permission.guard.js';
import { AuthService } from '../iam/services/auth.service.js';
import { IamService } from '../iam/services/iam.service.js';

import type { MemoryMvpPersistenceBackend } from './infrastructure/memory-mvp-persistence.backend.js';

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
  /** Для сидирования изолированного snapshot другого tenant в HTTP cross-tenant тесте. */
  let memoryMvpPersistenceRef: MemoryMvpPersistenceBackend | undefined;

  const authServiceMock = { isSessionActive: vi.fn().mockResolvedValue(true) };
  const publishBulkJobMock = vi.fn().mockResolvedValue({
    status: 'queued',
    messageId: 'test_worker_message',
    idempotencyKey: 'test'
  });
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
            publishBulkJob: publishBulkJobMock
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
    memoryMvpPersistenceRef = created.get(MemoryMvpPersistenceBackend);
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

  it('HTTP GET /courses/:id: tenant_demo JWT cannot read course stored only under tenant_other', async () => {
    expect(memoryMvpPersistenceRef).toBeDefined();
    const snap = {} as Record<MvpCollection, unknown[]>;
    for (const col of MVP_COLLECTIONS) {
      snap[col] = [];
    }
    const now = new Date().toISOString();
    snap.courses = [
      {
        id: 'c_http_cross_tenant_only_other',
        tenantId: 'tenant_other',
        code: 'ISO',
        title: 'Other-tenant only',
        status: 'draft',
        isArchived: false,
        createdAt: now,
        updatedAt: now
      }
    ];
    const snapshots = (
      memoryMvpPersistenceRef as unknown as {
        snapshots: Map<string, Record<MvpCollection, unknown[]>>;
      }
    ).snapshots;
    snapshots.set('tenant_other', snap);

    const t = tokenFor('sess_http_cross_tenant_course');
    const res = await fetch(`${apiBaseUrl}/courses/c_http_cross_tenant_only_other`, {
      headers: hdr(t)
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('not_found');
  });

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

  it('HTTP: rejects test attempt start when attempt limit reached (BL-005)', async () => {
    const ts = Date.now();
    const admin = tokenFor(`sess_http_attempt_limit_${ts}`);

    const course = (await (
      await fetch(`${apiBaseUrl}/courses`, {
        method: 'POST',
        headers: hdr(admin),
        body: JSON.stringify({
          code: `CLIM_${ts}`,
          title: 'Attempt limit course'
        })
      })
    ).json()) as { data: { id: string } };

    const groupWrap = (await (
      await fetch(`${apiBaseUrl}/groups`, {
        method: 'POST',
        headers: hdr(admin),
        body: JSON.stringify({ code: `GLIM_${ts}`, name: 'Attempt limit group' })
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
        body: JSON.stringify({ title: `BLIM_${ts}`, courseId: course.data.id })
      })
    ).json()) as { data: { id: string } };

    const q = (await (
      await fetch(`${apiBaseUrl}/questions`, {
        method: 'POST',
        headers: hdr(admin),
        body: JSON.stringify({
          questionBankId: bank.data.id,
          type: 'text',
          text: `QLIM_${ts}`,
          score: 1
        })
      })
    ).json()) as { data: { id: string } };

    const test = (await (
      await fetch(`${apiBaseUrl}/tests`, {
        method: 'POST',
        headers: hdr(admin),
        body: JSON.stringify({
          title: `ExamLIM_${ts}`,
          courseId: course.data.id,
          questionBankId: bank.data.id,
          rules: { attemptLimit: 2, dailyResetEnabled: false }
        })
      })
    ).json()) as { data: { id: string } };

    await fetch(`${apiBaseUrl}/tests/${test.data.id}/questions`, {
      method: 'POST',
      headers: hdr(admin),
      body: JSON.stringify({ questionIds: [q.data.id] })
    });

    const iamLearner = `u_attempt_limit_${ts}`;
    const learner = (await (
      await fetch(`${apiBaseUrl}/learners`, {
        method: 'POST',
        headers: hdr(admin),
        body: JSON.stringify({
          code: `LLIM_${ts}`,
          name: 'Limit learner',
          linkedIamUserId: iamLearner
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

    const learnerToken = issueSignedAccessToken(
      {
        sub: iamLearner,
        tenant_id: 'tenant_demo',
        session_id: `sess_attempt_limit_${ts}`,
        roles: ['student']
      },
      process.env.AUTH_JWT_SECRET ?? 'secret_value_123',
      3600
    );

    const startPayload = JSON.stringify({
      testId: test.data.id,
      enrollmentId: enrollment.data.id,
      learnerId: learner.data.id
    });

    for (let i = 0; i < 2; i++) {
      const ok = await fetch(`${apiBaseUrl}/attempts/start`, {
        method: 'POST',
        headers: hdr(learnerToken),
        body: startPayload
      });
      expect(ok.status, `start ${i + 1} of 2 should succeed`).toBe(201);
    }

    const blocked = await fetch(`${apiBaseUrl}/attempts/start`, {
      method: 'POST',
      headers: hdr(learnerToken),
      body: startPayload
    });
    expect(blocked.status).toBe(412);
    expect(((await blocked.json()) as { error: { code: string } }).error.code).toBe(
      'attempt_limit_reached'
    );
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

  it('HTTP: rejects duplicate assignment review for same submission (BL-006)', async () => {
    const ts = Date.now();
    const t = tokenFor(`sess_http_dup_review_${ts}`);

    const course = (await (
      await fetch(`${apiBaseUrl}/courses`, {
        method: 'POST',
        headers: hdr(t),
        body: JSON.stringify({ code: `CDHDR_${ts}`, title: 'Dup review course' })
      })
    ).json()) as { data: { id: string } };

    const groupWrap = (await (
      await fetch(`${apiBaseUrl}/groups`, {
        method: 'POST',
        headers: hdr(t),
        body: JSON.stringify({ code: `GDHDR_${ts}`, name: 'Dup review group' })
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
        body: JSON.stringify({ code: `LDHDR_${ts}`, name: 'Learner dup review' })
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
          title: `HW dup rev ${ts}`,
          maxScore: 10
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
          answerText: 'answer once'
        })
      })
    ).json()) as { data: { id: string } };

    await fetch(`${apiBaseUrl}/assignment-submissions/${submission.data.id}/submit`, {
      method: 'POST',
      headers: hdr(t)
    });

    const first = await fetch(`${apiBaseUrl}/assignment-reviews`, {
      method: 'POST',
      headers: hdr(t),
      body: JSON.stringify({ submissionId: submission.data.id, score: 7 })
    });
    expect(first.ok).toBe(true);

    const dup = await fetch(`${apiBaseUrl}/assignment-reviews`, {
      method: 'POST',
      headers: hdr(t),
      body: JSON.stringify({ submissionId: submission.data.id, score: 8 })
    });
    expect(dup.status).toBe(409);
    expect(((await dup.json()) as { error: { code: string } }).error.code).toBe('conflict');
  });

  it('HTTP: PATCH assignment submission after submit is rejected submission_terminal (BL-006)', async () => {
    const ts = Date.now();
    const t = tokenFor(`sess_http_sub_terminal_${ts}`);

    const course = (await (
      await fetch(`${apiBaseUrl}/courses`, {
        method: 'POST',
        headers: hdr(t),
        body: JSON.stringify({ code: `CTERM_${ts}`, title: 'Submission terminal course' })
      })
    ).json()) as { data: { id: string } };

    const groupWrap = (await (
      await fetch(`${apiBaseUrl}/groups`, {
        method: 'POST',
        headers: hdr(t),
        body: JSON.stringify({ code: `GTERM_${ts}`, name: 'Submission terminal group' })
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
        body: JSON.stringify({ code: `LTERM_${ts}`, name: 'Learner submission terminal' })
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
          title: `HW submission terminal ${ts}`,
          maxScore: 10
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
          answerText: 'draft before submit'
        })
      })
    ).json()) as { data: { id: string } };

    const submitRes = await fetch(
      `${apiBaseUrl}/assignment-submissions/${submission.data.id}/submit`,
      {
        method: 'POST',
        headers: hdr(t)
      }
    );
    expect(submitRes.ok).toBe(true);

    const patchAfterSubmit = await fetch(
      `${apiBaseUrl}/assignment-submissions/${submission.data.id}`,
      {
        method: 'PATCH',
        headers: hdr(t),
        body: JSON.stringify({ answerText: 'must not persist' })
      }
    );
    expect(patchAfterSubmit.status).toBe(412);
    expect(((await patchAfterSubmit.json()) as { error: { code: string } }).error.code).toBe(
      'submission_terminal'
    );
  });

  it('HTTP: PATCH completed review and second complete are rejected (BL-006)', async () => {
    const ts = Date.now();
    const t = tokenFor(`sess_http_complete_twice_${ts}`);

    const course = (await (
      await fetch(`${apiBaseUrl}/courses`, {
        method: 'POST',
        headers: hdr(t),
        body: JSON.stringify({ code: `CACMP_${ts}`, title: 'Complete-twice course' })
      })
    ).json()) as { data: { id: string } };

    const groupWrap = (await (
      await fetch(`${apiBaseUrl}/groups`, {
        method: 'POST',
        headers: hdr(t),
        body: JSON.stringify({ code: `GACMP_${ts}`, name: 'Complete-twice group' })
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
        body: JSON.stringify({ code: `LACMP_${ts}`, name: 'Learner complete twice' })
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
          title: `HW complete twice ${ts}`,
          maxScore: 10
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
          answerText: 'hand in'
        })
      })
    ).json()) as { data: { id: string } };

    await fetch(`${apiBaseUrl}/assignment-submissions/${submission.data.id}/submit`, {
      method: 'POST',
      headers: hdr(t)
    });

    const created = await fetch(`${apiBaseUrl}/assignment-reviews`, {
      method: 'POST',
      headers: hdr(t),
      body: JSON.stringify({ submissionId: submission.data.id, score: 6 })
    });
    expect(created.ok).toBe(true);
    const rev = (await created.json()) as { data: { id: string } };

    const complete1 = await fetch(`${apiBaseUrl}/assignment-reviews/${rev.data.id}/complete`, {
      method: 'POST',
      headers: hdr(t),
      body: JSON.stringify({})
    });
    expect(complete1.ok).toBe(true);

    const patchAfterComplete = await fetch(`${apiBaseUrl}/assignment-reviews/${rev.data.id}`, {
      method: 'PATCH',
      headers: hdr(t),
      body: JSON.stringify({ score: 9, comment: 'must not apply' })
    });
    expect(patchAfterComplete.status).toBe(412);
    expect(((await patchAfterComplete.json()) as { error: { code: string } }).error.code).toBe(
      'domain_rule_violation'
    );

    const complete2 = await fetch(`${apiBaseUrl}/assignment-reviews/${rev.data.id}/complete`, {
      method: 'POST',
      headers: hdr(t),
      body: JSON.stringify({})
    });
    expect(complete2.status).toBe(412);
    expect(((await complete2.json()) as { error: { code: string } }).error.code).toBe(
      'domain_rule_violation'
    );
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

  it('HTTP: 403 чужой JWT vs субмиссия слушателя с linkedIamUserId — POST/GET/PATCH/submit (BL-010)', async () => {
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

    const bobPatchSubmission = await fetch(
      `${apiBaseUrl}/assignment-submissions/${envelope.data.id}`,
      {
        method: 'PATCH',
        headers: hdr(tokenBob),
        body: JSON.stringify({ answerText: 'intruder patch' })
      }
    );
    expect(bobPatchSubmission.status).toBe(403);
    expect(((await bobPatchSubmission.json()) as { error: { code: string } }).error.code).toBe(
      'forbidden'
    );

    const bobSubmitIntruder = await fetch(
      `${apiBaseUrl}/assignment-submissions/${envelope.data.id}/submit`,
      { method: 'POST', headers: hdr(tokenBob) }
    );
    expect(bobSubmitIntruder.status).toBe(403);
    expect(((await bobSubmitIntruder.json()) as { error: { code: string } }).error.code).toBe(
      'forbidden'
    );

    const aliceGetSubmission = await fetch(
      `${apiBaseUrl}/assignment-submissions/${envelope.data.id}`,
      { headers: hdr(tokenAlice) }
    );
    expect(aliceGetSubmission.ok).toBe(true);
  });

  it('HTTP: GET /assignment-submissions list scoped to JWT-linked learner only (BL-010)', async () => {
    const ts = Date.now();
    const admin = tokenFor(`sess_http_subm_list_scope_${ts}`);

    const course = (await (
      await fetch(`${apiBaseUrl}/courses`, {
        method: 'POST',
        headers: hdr(admin),
        body: JSON.stringify({ code: `CLST_${ts}`, title: 'Submission list scope course' })
      })
    ).json()) as { data: { id: string } };

    const groupWrap = (await (
      await fetch(`${apiBaseUrl}/groups`, {
        method: 'POST',
        headers: hdr(admin),
        body: JSON.stringify({ code: `GLST_${ts}`, name: 'Submission list scope group' })
      })
    ).json()) as { data: { id: string } };

    await fetch(`${apiBaseUrl}/group-courses`, {
      method: 'POST',
      headers: hdr(admin),
      body: JSON.stringify({ groupId: groupWrap.data.id, courseId: course.data.id })
    });

    const learnerA = (await (
      await fetch(`${apiBaseUrl}/learners`, {
        method: 'POST',
        headers: hdr(admin),
        body: JSON.stringify({
          code: `LALST_${ts}`,
          name: 'Learner A list scope',
          linkedIamUserId: 'u_alice_subm_list'
        })
      })
    ).json()) as { data: { id: string } };

    const learnerB = (await (
      await fetch(`${apiBaseUrl}/learners`, {
        method: 'POST',
        headers: hdr(admin),
        body: JSON.stringify({
          code: `LBLST_${ts}`,
          name: 'Learner B list scope',
          linkedIamUserId: 'u_bob_subm_list'
        })
      })
    ).json()) as { data: { id: string } };

    const enrA = (await (
      await fetch(`${apiBaseUrl}/enrollments`, {
        method: 'POST',
        headers: hdr(admin),
        body: JSON.stringify({ groupId: groupWrap.data.id, learnerId: learnerA.data.id })
      })
    ).json()) as { data: { id: string } };

    const enrB = (await (
      await fetch(`${apiBaseUrl}/enrollments`, {
        method: 'POST',
        headers: hdr(admin),
        body: JSON.stringify({ groupId: groupWrap.data.id, learnerId: learnerB.data.id })
      })
    ).json()) as { data: { id: string } };

    const assignment = (await (
      await fetch(`${apiBaseUrl}/assignments`, {
        method: 'POST',
        headers: hdr(admin),
        body: JSON.stringify({
          courseId: course.data.id,
          title: `HW list scope ${ts}`,
          maxScore: 10
        })
      })
    ).json()) as { data: { id: string } };

    const createdA = (await (
      await fetch(`${apiBaseUrl}/assignment-submissions`, {
        method: 'POST',
        headers: hdr(admin),
        body: JSON.stringify({
          assignmentId: assignment.data.id,
          enrollmentId: enrA.data.id,
          learnerId: learnerA.data.id,
          answerText: 'from A'
        })
      })
    ).json()) as { data: { id: string } };

    const createdB = (await (
      await fetch(`${apiBaseUrl}/assignment-submissions`, {
        method: 'POST',
        headers: hdr(admin),
        body: JSON.stringify({
          assignmentId: assignment.data.id,
          enrollmentId: enrB.data.id,
          learnerId: learnerB.data.id,
          answerText: 'from B'
        })
      })
    ).json()) as { data: { id: string } };

    const secret = process.env.AUTH_JWT_SECRET ?? 'secret_value_123';
    const tokenAlice = issueSignedAccessToken(
      {
        sub: 'u_alice_subm_list',
        tenant_id: 'tenant_demo',
        session_id: `sess_alice_subm_list_${ts}`,
        roles: ['student']
      },
      secret,
      3600
    );
    const tokenBob = issueSignedAccessToken(
      {
        sub: 'u_bob_subm_list',
        tenant_id: 'tenant_demo',
        session_id: `sess_bob_subm_list_${ts}`,
        roles: ['student']
      },
      secret,
      3600
    );

    const aliceList = await fetch(`${apiBaseUrl}/assignment-submissions`, {
      headers: hdr(tokenAlice)
    });
    expect(aliceList.ok).toBe(true);
    const aliceBody = (await aliceList.json()) as {
      data: { items: Array<{ id: string; learnerId: string }> };
    };
    const aliceIds = new Set(aliceBody.data.items.map((i) => i.id));
    expect(aliceIds.has(createdA.data.id)).toBe(true);
    expect(aliceIds.has(createdB.data.id)).toBe(false);
    expect(aliceBody.data.items.every((i) => i.learnerId === learnerA.data.id)).toBe(true);

    const bobList = await fetch(`${apiBaseUrl}/assignment-submissions`, {
      headers: hdr(tokenBob)
    });
    expect(bobList.ok).toBe(true);
    const bobBody = (await bobList.json()) as {
      data: { items: Array<{ id: string; learnerId: string }> };
    };
    const bobIds = new Set(bobBody.data.items.map((i) => i.id));
    expect(bobIds.has(createdB.data.id)).toBe(true);
    expect(bobIds.has(createdA.data.id)).toBe(false);
    expect(bobBody.data.items.every((i) => i.learnerId === learnerB.data.id)).toBe(true);
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

  it('HTTP POST /enrollments/bulk with deliveryMode=queued publishes RabbitMQ job', async () => {
    publishBulkJobMock.mockClear();
    publishBulkJobMock.mockResolvedValue({
      status: 'queued',
      messageId: 'mq_job_1',
      idempotencyKey: 'idem_queued_1'
    });
    const admin = tokenFor(`sess_http_bulk_queued_${Date.now()}`);

    const group = (await (
      await fetch(`${apiBaseUrl}/groups`, {
        method: 'POST',
        headers: hdr(admin),
        body: JSON.stringify({ code: `GBQ_${Date.now()}`, name: 'Bulk Queued Group' })
      })
    ).json()) as { data: { id: string } };

    const queued = await fetch(`${apiBaseUrl}/enrollments/bulk`, {
      method: 'POST',
      headers: hdr(admin),
      body: JSON.stringify({
        idempotencyKey: 'idem_queued_1',
        groupId: group.data.id,
        learnerIds: ['learner_queued_1'],
        deliveryMode: 'queued'
      })
    });

    expect(queued.status).toBe(201);
    const body = (await queued.json()) as {
      data: { status: string; messageId: string; idempotencyKey: string };
    };
    expect(body.data.status).toBe('queued');
    expect(body.data.idempotencyKey).toBe('idem_queued_1');
    expect(body.data.messageId).toBe('mq_job_1');
    expect(publishBulkJobMock).toHaveBeenCalledTimes(1);
  });

  it('HTTP queued bulk with duplicate idempotency returns stored outcome and skips publish', async () => {
    publishBulkJobMock.mockClear();
    const admin = tokenFor(`sess_http_bulk_dup_${Date.now()}`);
    const ts = Date.now();

    const group = (await (
      await fetch(`${apiBaseUrl}/groups`, {
        method: 'POST',
        headers: hdr(admin),
        body: JSON.stringify({ code: `GBD_${ts}`, name: 'Bulk Duplicate Group' })
      })
    ).json()) as { data: { id: string } };

    const learner = (await (
      await fetch(`${apiBaseUrl}/learners`, {
        method: 'POST',
        headers: hdr(admin),
        body: JSON.stringify({ code: `LBD_${ts}`, name: 'Bulk Duplicate Learner' })
      })
    ).json()) as { data: { id: string } };

    const immediateRes = await fetch(`${apiBaseUrl}/enrollments/bulk`, {
      method: 'POST',
      headers: hdr(admin),
      body: JSON.stringify({
        idempotencyKey: 'idem_dup_1',
        groupId: group.data.id,
        learnerIds: [learner.data.id]
      })
    });
    expect(immediateRes.status).toBe(201);

    const queuedDupRes = await fetch(`${apiBaseUrl}/enrollments/bulk`, {
      method: 'POST',
      headers: hdr(admin),
      body: JSON.stringify({
        idempotencyKey: 'idem_dup_1',
        groupId: group.data.id,
        learnerIds: [learner.data.id],
        deliveryMode: 'queued'
      })
    });
    expect(queuedDupRes.status).toBe(201);
    const queuedDupBody = (await queuedDupRes.json()) as {
      data: { idempotencyKey: string; created: Array<{ learnerId: string }> };
    };
    expect(queuedDupBody.data.idempotencyKey).toBe('idem_dup_1');
    expect(queuedDupBody.data.created).toHaveLength(1);
    expect(queuedDupBody.data.created[0]?.learnerId).toBe(learner.data.id);
    expect(publishBulkJobMock).not.toHaveBeenCalled();
  });

  it('HTTP POST /enrollments/bulk rejects invalid deliveryMode', async () => {
    publishBulkJobMock.mockClear();
    const admin = tokenFor(`sess_http_bulk_invalid_mode_${Date.now()}`);

    const group = (await (
      await fetch(`${apiBaseUrl}/groups`, {
        method: 'POST',
        headers: hdr(admin),
        body: JSON.stringify({ code: `GBM_${Date.now()}`, name: 'Bulk Invalid Mode Group' })
      })
    ).json()) as { data: { id: string } };

    const res = await fetch(`${apiBaseUrl}/enrollments/bulk`, {
      method: 'POST',
      headers: hdr(admin),
      body: JSON.stringify({
        idempotencyKey: 'idem_invalid_mode',
        groupId: group.data.id,
        learnerIds: ['learner_x'],
        deliveryMode: 'async'
      })
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('validation_error');
    expect(publishBulkJobMock).not.toHaveBeenCalled();
  });

  it('HTTP POST /enrollments/bulk rejects uppercase QUEUED deliveryMode', async () => {
    publishBulkJobMock.mockClear();
    const admin = tokenFor(`sess_http_bulk_upper_mode_${Date.now()}`);

    const group = (await (
      await fetch(`${apiBaseUrl}/groups`, {
        method: 'POST',
        headers: hdr(admin),
        body: JSON.stringify({ code: `GBU_${Date.now()}`, name: 'Bulk Uppercase Mode Group' })
      })
    ).json()) as { data: { id: string } };

    const res = await fetch(`${apiBaseUrl}/enrollments/bulk`, {
      method: 'POST',
      headers: hdr(admin),
      body: JSON.stringify({
        idempotencyKey: 'idem_upper_mode',
        groupId: group.data.id,
        learnerIds: ['learner_upper'],
        deliveryMode: 'QUEUED'
      })
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('validation_error');
    expect(publishBulkJobMock).not.toHaveBeenCalled();
  });

  it('HTTP POST /enrollments/bulk uses immediate mode by default when deliveryMode omitted', async () => {
    publishBulkJobMock.mockClear();
    const admin = tokenFor(`sess_http_bulk_default_mode_${Date.now()}`);
    const ts = Date.now();

    const group = (await (
      await fetch(`${apiBaseUrl}/groups`, {
        method: 'POST',
        headers: hdr(admin),
        body: JSON.stringify({ code: `GBD0_${ts}`, name: 'Bulk Default Mode Group' })
      })
    ).json()) as { data: { id: string } };

    const learner = (await (
      await fetch(`${apiBaseUrl}/learners`, {
        method: 'POST',
        headers: hdr(admin),
        body: JSON.stringify({ code: `LBD0_${ts}`, name: 'Bulk Default Mode Learner' })
      })
    ).json()) as { data: { id: string } };

    const res = await fetch(`${apiBaseUrl}/enrollments/bulk`, {
      method: 'POST',
      headers: hdr(admin),
      body: JSON.stringify({
        idempotencyKey: 'idem_default_mode',
        groupId: group.data.id,
        learnerIds: [learner.data.id]
      })
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      data: { idempotencyKey: string; created: Array<{ learnerId: string }> };
    };
    expect(body.data.idempotencyKey).toBe('idem_default_mode');
    expect(body.data.created).toHaveLength(1);
    expect(body.data.created[0]?.learnerId).toBe(learner.data.id);
    expect(publishBulkJobMock).not.toHaveBeenCalled();
  });

  it('HTTP POST /enrollments/bulk rejects deliveryMode with surrounding spaces', async () => {
    publishBulkJobMock.mockClear();
    const admin = tokenFor(`sess_http_bulk_spaced_mode_${Date.now()}`);

    const group = (await (
      await fetch(`${apiBaseUrl}/groups`, {
        method: 'POST',
        headers: hdr(admin),
        body: JSON.stringify({ code: `GBS_${Date.now()}`, name: 'Bulk Spaced Mode Group' })
      })
    ).json()) as { data: { id: string } };

    const res = await fetch(`${apiBaseUrl}/enrollments/bulk`, {
      method: 'POST',
      headers: hdr(admin),
      body: JSON.stringify({
        idempotencyKey: 'idem_spaced_mode',
        groupId: group.data.id,
        learnerIds: ['learner_spaced'],
        deliveryMode: ' queued '
      })
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('validation_error');
    expect(publishBulkJobMock).not.toHaveBeenCalled();
  });

  it('HTTP GET /reports/kpi-snapshot includes enrollmentBreakdown when include_enrollment_breakdown=true', async () => {
    const ts = Date.now();
    const admin = tokenFor(`sess_http_kpi_breakdown_${ts}`);

    const group = (await (
      await fetch(`${apiBaseUrl}/groups`, {
        method: 'POST',
        headers: hdr(admin),
        body: JSON.stringify({ code: `GKB_${ts}`, name: 'KPI Breakdown Group' })
      })
    ).json()) as { data: { id: string } };

    const learner = (await (
      await fetch(`${apiBaseUrl}/learners`, {
        method: 'POST',
        headers: hdr(admin),
        body: JSON.stringify({ code: `LKB_${ts}`, name: 'KPI Breakdown Learner' })
      })
    ).json()) as { data: { id: string } };

    const enrollment = (await (
      await fetch(`${apiBaseUrl}/enrollments`, {
        method: 'POST',
        headers: hdr(admin),
        body: JSON.stringify({ groupId: group.data.id, learnerId: learner.data.id })
      })
    ).json()) as { data: { id: string } };

    const res = await fetch(
      `${apiBaseUrl}/reports/kpi-snapshot?group_id=${encodeURIComponent(group.data.id)}&include_enrollment_breakdown=true`,
      { headers: hdr(admin) }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { enrollmentBreakdown?: Array<{ enrollmentId: string; groupId: string }> };
    };
    expect(body.data.enrollmentBreakdown).toBeDefined();
    expect(
      body.data.enrollmentBreakdown?.some((row) => row.enrollmentId === enrollment.data.id)
    ).toBe(true);
    expect(body.data.enrollmentBreakdown?.every((row) => row.groupId === group.data.id)).toBe(true);
  });

  it('HTTP GET /reports/kpi-snapshot omits enrollmentBreakdown by default', async () => {
    const admin = tokenFor(`sess_http_kpi_no_breakdown_${Date.now()}`);
    const res = await fetch(`${apiBaseUrl}/reports/kpi-snapshot`, { headers: hdr(admin) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { enrollmentBreakdown?: unknown };
    };
    expect(body.data.enrollmentBreakdown).toBeUndefined();
  });

  it('HTTP GET /reports/kpi-snapshot includes enrollmentBreakdown when include_enrollment_breakdown=1', async () => {
    const ts = Date.now();
    const admin = tokenFor(`sess_http_kpi_breakdown_numeric_${ts}`);

    const group = (await (
      await fetch(`${apiBaseUrl}/groups`, {
        method: 'POST',
        headers: hdr(admin),
        body: JSON.stringify({ code: `GKN_${ts}`, name: 'KPI Numeric Group' })
      })
    ).json()) as { data: { id: string } };

    const learner = (await (
      await fetch(`${apiBaseUrl}/learners`, {
        method: 'POST',
        headers: hdr(admin),
        body: JSON.stringify({ code: `LKN_${ts}`, name: 'KPI Numeric Learner' })
      })
    ).json()) as { data: { id: string } };

    await fetch(`${apiBaseUrl}/enrollments`, {
      method: 'POST',
      headers: hdr(admin),
      body: JSON.stringify({ groupId: group.data.id, learnerId: learner.data.id })
    });

    const res = await fetch(
      `${apiBaseUrl}/reports/kpi-snapshot?group_id=${encodeURIComponent(group.data.id)}&include_enrollment_breakdown=1`,
      { headers: hdr(admin) }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { enrollmentBreakdown?: Array<{ groupId: string }> };
    };
    expect(body.data.enrollmentBreakdown).toBeDefined();
    expect(body.data.enrollmentBreakdown?.length).toBeGreaterThan(0);
    expect(body.data.enrollmentBreakdown?.every((row) => row.groupId === group.data.id)).toBe(true);
  });

  it('HTTP GET /reports/kpi-snapshot omits enrollmentBreakdown when include_enrollment_breakdown=0', async () => {
    const admin = tokenFor(`sess_http_kpi_breakdown_zero_${Date.now()}`);
    const res = await fetch(`${apiBaseUrl}/reports/kpi-snapshot?include_enrollment_breakdown=0`, {
      headers: hdr(admin)
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { enrollmentBreakdown?: unknown };
    };
    expect(body.data.enrollmentBreakdown).toBeUndefined();
  });

  it('HTTP GET /reports/kpi-snapshot omits enrollmentBreakdown when include_enrollment_breakdown=TRUE', async () => {
    const admin = tokenFor(`sess_http_kpi_breakdown_upper_${Date.now()}`);
    const res = await fetch(
      `${apiBaseUrl}/reports/kpi-snapshot?include_enrollment_breakdown=TRUE`,
      {
        headers: hdr(admin)
      }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { enrollmentBreakdown?: unknown };
    };
    expect(body.data.enrollmentBreakdown).toBeUndefined();
  });

  it('HTTP GET /reports/kpi-snapshot omits enrollmentBreakdown when include_enrollment_breakdown=TrUe', async () => {
    const admin = tokenFor(`sess_http_kpi_breakdown_mixed_${Date.now()}`);
    const res = await fetch(
      `${apiBaseUrl}/reports/kpi-snapshot?include_enrollment_breakdown=TrUe`,
      {
        headers: hdr(admin)
      }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { enrollmentBreakdown?: unknown };
    };
    expect(body.data.enrollmentBreakdown).toBeUndefined();
  });
});
