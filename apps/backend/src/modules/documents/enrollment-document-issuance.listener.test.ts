import { describe, expect, it } from 'vitest';

import { DocumentsTenantRunner } from './documents-tenant-runner.service.js';
import { DocumentsService } from './documents.service.js';
import { EnrollmentDocumentIssuanceListener } from './enrollment-document-issuance.listener.js';
import { InMemoryDocumentsState } from './in-memory-documents.state.js';
import { MemoryDocumentsPersistenceBackend } from './infrastructure/memory-documents-persistence.backend.js';
import { TenantSerialGateway } from '../../infrastructure/request/tenant-serial.gateway.js';
import { AuditService } from '../audit/audit.service.js';
import { RealtimeEventsService } from '../core/realtime-events.service.js';

const flushDeferred = async () => {
  await new Promise<void>((resolve) => setImmediate(() => resolve()));
  await new Promise<void>((resolve) => setImmediate(() => resolve()));
};

describe('EnrollmentDocumentIssuanceListener', () => {
  it('queues certificate generation when binding exists', async () => {
    const audit = new AuditService();
    const realtime = new RealtimeEventsService();
    const persistence = new MemoryDocumentsPersistenceBackend();
    const gateway = new TenantSerialGateway();
    const runner = new DocumentsTenantRunner(persistence, gateway, audit, realtime);

    await runner.runWithTenantDocuments('tenant_demo', async (documents) => {
      const ctx = {
        requestId: 'r1',
        correlationId: 'c1',
        ip: '127.0.0.1',
        userAgent: 'vitest',
        tenantId: 'tenant_demo',
        userId: 'u1',
        roles: [],
        permissions: [],
        method: 'POST',
        path: '/api/v1/documents',
        timestamp: new Date().toISOString()
      };
      const template = documents.createTemplate(
        'tenant_demo',
        'u1',
        { name: 'Cert', templateType: 'certificate' },
        ctx
      );
      const version = documents.createTemplateVersion('tenant_demo', 'u1', {
        templateId: template.id,
        fileId: 'file_cert'
      });
      documents.activateTemplateVersion('tenant_demo', version.id);
      documents.createTemplateBinding('tenant_demo', {
        templateId: template.id,
        bindType: 'group',
        groupId: 'group_x',
        priority: 100
      });
    });

    const listener = new EnrollmentDocumentIssuanceListener(runner, audit);
    listener.handleEnrollmentCompleted({
      tenantId: 'tenant_demo',
      enrollmentId: 'enrollment_x',
      learnerId: 'learner_x',
      groupId: 'group_x',
      groupCourseIds: ['course_a'],
      actorId: 'u1',
      requestId: 'req_cert_ok',
      correlationId: 'corr_cert_ok'
    });
    await flushDeferred();

    const state = new InMemoryDocumentsState();
    await persistence.loadIntoState('tenant_demo', state);
    const docs = new DocumentsService(state, audit, realtime);
    const tasks = docs.listDocumentTasks('tenant_demo', {});
    expect(tasks.total).toBe(1);
    expect(tasks.items[0]?.sourceEntityId).toBe('enrollment_x');
    const createdAudit = (await audit.list('tenant_demo')).find(
      (x) => x.action === 'documents.task.created' && x.entityId === tasks.items[0]?.id
    );
    expect(createdAudit?.metadata?.correlation_id).toBe('corr_cert_ok');
  });

  it('skips generation when no certificate binding (audit only)', async () => {
    const audit = new AuditService();
    const realtime = new RealtimeEventsService();
    const persistence = new MemoryDocumentsPersistenceBackend();
    const gateway = new TenantSerialGateway();
    const runner = new DocumentsTenantRunner(persistence, gateway, audit, realtime);

    await runner.runWithTenantDocuments('tenant_demo', async (documents) => {
      const ctx = {
        requestId: 'r2',
        correlationId: 'c2',
        ip: '127.0.0.1',
        userAgent: 'vitest',
        tenantId: 'tenant_demo',
        userId: 'u1',
        roles: [],
        permissions: [],
        method: 'POST',
        path: '/api/v1/documents',
        timestamp: new Date().toISOString()
      };
      documents.createTemplate(
        'tenant_demo',
        'u1',
        { name: 'Proto', templateType: 'protocol' },
        ctx
      );
    });

    const listener = new EnrollmentDocumentIssuanceListener(runner, audit);
    listener.handleEnrollmentCompleted({
      tenantId: 'tenant_demo',
      enrollmentId: 'enrollment_y',
      learnerId: 'learner_y',
      groupId: 'group_y',
      groupCourseIds: [],
      actorId: 'u1',
      requestId: 'req_cert_skip',
      correlationId: 'corr_cert_skip'
    });
    await flushDeferred();

    const state = new InMemoryDocumentsState();
    await persistence.loadIntoState('tenant_demo', state);
    expect(state.tasks.length).toBe(0);
    const logs = await audit.list('tenant_demo');
    const skipped = logs.find((x) => x.action === 'documents.enrollment_certificate_skipped');
    expect(skipped).toBeDefined();
    expect(skipped?.metadata?.correlation_id).toBe('corr_cert_skip');
    expect(skipped?.requestId).toBe('req_cert_skip');
  });

  it('is idempotent for duplicate enrollment completed events', async () => {
    const audit = new AuditService();
    const realtime = new RealtimeEventsService();
    const persistence = new MemoryDocumentsPersistenceBackend();
    const gateway = new TenantSerialGateway();
    const runner = new DocumentsTenantRunner(persistence, gateway, audit, realtime);

    await runner.runWithTenantDocuments('tenant_demo', async (documents) => {
      const ctx = {
        requestId: 'r3',
        correlationId: 'c3',
        ip: '127.0.0.1',
        userAgent: 'vitest',
        tenantId: 'tenant_demo',
        userId: 'u1',
        roles: [],
        permissions: [],
        method: 'POST',
        path: '/api/v1/documents',
        timestamp: new Date().toISOString()
      };
      const template = documents.createTemplate(
        'tenant_demo',
        'u1',
        { name: 'Cert duplicate', templateType: 'certificate' },
        ctx
      );
      const version = documents.createTemplateVersion('tenant_demo', 'u1', {
        templateId: template.id,
        fileId: 'file_cert_dup'
      });
      documents.activateTemplateVersion('tenant_demo', version.id);
      documents.createTemplateBinding('tenant_demo', {
        templateId: template.id,
        bindType: 'group',
        groupId: 'group_dup',
        priority: 100
      });
    });

    const listener = new EnrollmentDocumentIssuanceListener(runner, audit);
    const payload = {
      tenantId: 'tenant_demo',
      enrollmentId: 'enrollment_dup',
      learnerId: 'learner_dup',
      groupId: 'group_dup',
      groupCourseIds: ['course_dup'],
      actorId: 'u1'
    };
    listener.handleEnrollmentCompleted(payload);
    listener.handleEnrollmentCompleted(payload);
    await flushDeferred();

    const state = new InMemoryDocumentsState();
    await persistence.loadIntoState('tenant_demo', state);
    const docs = new DocumentsService(state, audit, realtime);
    const tasks = docs.listDocumentTasks('tenant_demo', {});
    expect(tasks.total).toBe(1);
    expect(tasks.items[0]?.sourceEntityId).toBe('enrollment_dup');
  });

  it('writes failed audit record when tenant runner throws', async () => {
    const audit = new AuditService();
    const runner = {
      runWithTenantDocuments: async () => {
        throw new Error('documents backend unavailable');
      }
    } as unknown as DocumentsTenantRunner;
    const listener = new EnrollmentDocumentIssuanceListener(runner, audit);

    listener.handleEnrollmentCompleted({
      tenantId: 'tenant_demo',
      enrollmentId: 'enrollment_fail',
      learnerId: 'learner_fail',
      groupId: 'group_fail',
      groupCourseIds: [],
      actorId: 'u1'
    });
    await flushDeferred();

    const logs = await audit.list('tenant_demo');
    expect(logs.some((x) => x.action === 'documents.enrollment_certificate_failed')).toBe(true);
  });

  it('does not use certificate binding from another tenant', async () => {
    const audit = new AuditService();
    const realtime = new RealtimeEventsService();
    const persistence = new MemoryDocumentsPersistenceBackend();
    const gateway = new TenantSerialGateway();
    const runner = new DocumentsTenantRunner(persistence, gateway, audit, realtime);

    await runner.runWithTenantDocuments('tenant_other', async (documents) => {
      const ctx = {
        requestId: 'r4',
        correlationId: 'c4',
        ip: '127.0.0.1',
        userAgent: 'vitest',
        tenantId: 'tenant_other',
        userId: 'u1',
        roles: [],
        permissions: [],
        method: 'POST',
        path: '/api/v1/documents',
        timestamp: new Date().toISOString()
      };
      const template = documents.createTemplate(
        'tenant_other',
        'u1',
        { name: 'Other tenant cert', templateType: 'certificate' },
        ctx
      );
      const version = documents.createTemplateVersion('tenant_other', 'u1', {
        templateId: template.id,
        fileId: 'file_other_cert'
      });
      documents.activateTemplateVersion('tenant_other', version.id);
      documents.createTemplateBinding('tenant_other', {
        templateId: template.id,
        bindType: 'group',
        groupId: 'group_shared',
        priority: 100
      });
    });

    const listener = new EnrollmentDocumentIssuanceListener(runner, audit);
    listener.handleEnrollmentCompleted({
      tenantId: 'tenant_demo',
      enrollmentId: 'enrollment_cross_tenant',
      learnerId: 'learner_cross_tenant',
      groupId: 'group_shared',
      groupCourseIds: ['course_shared'],
      actorId: 'u1'
    });
    await flushDeferred();

    const demoState = new InMemoryDocumentsState();
    await persistence.loadIntoState('tenant_demo', demoState);
    expect(demoState.tasks).toHaveLength(0);
    const demoLogs = await audit.list('tenant_demo');
    expect(demoLogs.some((x) => x.action === 'documents.enrollment_certificate_skipped')).toBe(
      true
    );
  });

  // === Plan A §5.3: multi-doc package from course_document_sets ===

  it('issues every auto-issue entry from documentSet, sorted by position', async () => {
    const audit = new AuditService();
    const realtime = new RealtimeEventsService();
    const persistence = new MemoryDocumentsPersistenceBackend();
    const gateway = new TenantSerialGateway();
    const runner = new DocumentsTenantRunner(persistence, gateway, audit, realtime);

    let templateProtocolId = '';
    let templateCertId = '';
    await runner.runWithTenantDocuments('tenant_demo', async (documents) => {
      const ctx = {
        requestId: 'r_set_1',
        correlationId: 'c_set_1',
        ip: '127.0.0.1',
        userAgent: 'vitest',
        tenantId: 'tenant_demo',
        userId: 'u1',
        roles: [],
        permissions: [],
        method: 'POST',
        path: '/api/v1/documents',
        timestamp: new Date().toISOString()
      };
      const protocol = documents.createTemplate(
        'tenant_demo',
        'u1',
        { name: 'Protocol', templateType: 'protocol' },
        ctx
      );
      const protocolVersion = documents.createTemplateVersion('tenant_demo', 'u1', {
        templateId: protocol.id,
        fileId: 'file_proto'
      });
      documents.activateTemplateVersion('tenant_demo', protocolVersion.id);
      templateProtocolId = protocol.id;

      const cert = documents.createTemplate(
        'tenant_demo',
        'u1',
        { name: 'Cert', templateType: 'certificate' },
        ctx
      );
      const certVersion = documents.createTemplateVersion('tenant_demo', 'u1', {
        templateId: cert.id,
        fileId: 'file_cert_set'
      });
      documents.activateTemplateVersion('tenant_demo', certVersion.id);
      templateCertId = cert.id;
    });

    const listener = new EnrollmentDocumentIssuanceListener(runner, audit);
    listener.handleEnrollmentCompleted({
      tenantId: 'tenant_demo',
      enrollmentId: 'enrollment_set_1',
      learnerId: 'learner_set_1',
      groupId: 'group_set_1',
      groupCourseIds: ['course_set_1'],
      actorId: 'u1',
      requestId: 'req_set_1',
      correlationId: 'corr_set_1',
      documentSet: [
        {
          courseVersionId: 'cver_1',
          templateId: templateCertId,
          position: 1,
          isRequired: true,
          autoIssueOnCompletion: true
        },
        {
          courseVersionId: 'cver_1',
          templateId: templateProtocolId,
          position: 0,
          isRequired: true,
          autoIssueOnCompletion: true
        }
      ]
    });
    await flushDeferred();

    const state = new InMemoryDocumentsState();
    await persistence.loadIntoState('tenant_demo', state);
    const docs = new DocumentsService(state, audit, realtime);
    const tasks = docs.listDocumentTasks('tenant_demo', {});
    expect(tasks.total).toBe(2);
    expect(tasks.items.map((t) => t.templateId)).toEqual(
      expect.arrayContaining([templateProtocolId, templateCertId])
    );

    const logs = await audit.list('tenant_demo');
    const issued = logs.find((x) => x.action === 'documents.enrollment_document_set_issued');
    expect(issued).toBeDefined();
    expect(issued?.newValues?.count).toBe(2);
    expect(issued?.metadata?.correlation_id).toBe('corr_set_1');

    expect(logs.some((x) => x.action === 'documents.enrollment_certificate_skipped')).toBe(false);
  });

  it('skips entries with autoIssueOnCompletion=false from documentSet', async () => {
    const audit = new AuditService();
    const realtime = new RealtimeEventsService();
    const persistence = new MemoryDocumentsPersistenceBackend();
    const gateway = new TenantSerialGateway();
    const runner = new DocumentsTenantRunner(persistence, gateway, audit, realtime);

    let templateAutoId = '';
    let templateManualId = '';
    await runner.runWithTenantDocuments('tenant_demo', async (documents) => {
      const ctx = {
        requestId: 'r_set_2',
        correlationId: 'c_set_2',
        ip: '127.0.0.1',
        userAgent: 'vitest',
        tenantId: 'tenant_demo',
        userId: 'u1',
        roles: [],
        permissions: [],
        method: 'POST',
        path: '/api/v1/documents',
        timestamp: new Date().toISOString()
      };
      const autoTpl = documents.createTemplate(
        'tenant_demo',
        'u1',
        { name: 'AutoCert', templateType: 'certificate' },
        ctx
      );
      const autoVersion = documents.createTemplateVersion('tenant_demo', 'u1', {
        templateId: autoTpl.id,
        fileId: 'file_auto'
      });
      documents.activateTemplateVersion('tenant_demo', autoVersion.id);
      templateAutoId = autoTpl.id;

      const manualTpl = documents.createTemplate(
        'tenant_demo',
        'u1',
        { name: 'ManualCert', templateType: 'certificate' },
        ctx
      );
      templateManualId = manualTpl.id;
    });

    const listener = new EnrollmentDocumentIssuanceListener(runner, audit);
    listener.handleEnrollmentCompleted({
      tenantId: 'tenant_demo',
      enrollmentId: 'enrollment_set_2',
      learnerId: 'learner_set_2',
      groupId: 'group_set_2',
      groupCourseIds: [],
      actorId: 'u1',
      documentSet: [
        {
          courseVersionId: 'cver_2',
          templateId: templateAutoId,
          position: 0,
          isRequired: true,
          autoIssueOnCompletion: true
        },
        {
          courseVersionId: 'cver_2',
          templateId: templateManualId,
          position: 1,
          isRequired: false,
          autoIssueOnCompletion: false
        }
      ]
    });
    await flushDeferred();

    const state = new InMemoryDocumentsState();
    await persistence.loadIntoState('tenant_demo', state);
    const docs = new DocumentsService(state, audit, realtime);
    const tasks = docs.listDocumentTasks('tenant_demo', {});
    expect(tasks.total).toBe(1);
    expect(tasks.items[0]?.templateId).toBe(templateAutoId);
  });

  it('is idempotent across multi-doc set (no duplicates on repeated event)', async () => {
    const audit = new AuditService();
    const realtime = new RealtimeEventsService();
    const persistence = new MemoryDocumentsPersistenceBackend();
    const gateway = new TenantSerialGateway();
    const runner = new DocumentsTenantRunner(persistence, gateway, audit, realtime);

    let templateAId = '';
    let templateBId = '';
    await runner.runWithTenantDocuments('tenant_demo', async (documents) => {
      const ctx = {
        requestId: 'r_set_3',
        correlationId: 'c_set_3',
        ip: '127.0.0.1',
        userAgent: 'vitest',
        tenantId: 'tenant_demo',
        userId: 'u1',
        roles: [],
        permissions: [],
        method: 'POST',
        path: '/api/v1/documents',
        timestamp: new Date().toISOString()
      };
      const a = documents.createTemplate(
        'tenant_demo',
        'u1',
        { name: 'A', templateType: 'certificate' },
        ctx
      );
      const aV = documents.createTemplateVersion('tenant_demo', 'u1', {
        templateId: a.id,
        fileId: 'file_a'
      });
      documents.activateTemplateVersion('tenant_demo', aV.id);
      templateAId = a.id;

      const b = documents.createTemplate(
        'tenant_demo',
        'u1',
        { name: 'B', templateType: 'certificate' },
        ctx
      );
      const bV = documents.createTemplateVersion('tenant_demo', 'u1', {
        templateId: b.id,
        fileId: 'file_b'
      });
      documents.activateTemplateVersion('tenant_demo', bV.id);
      templateBId = b.id;
    });

    const listener = new EnrollmentDocumentIssuanceListener(runner, audit);
    const payload = {
      tenantId: 'tenant_demo',
      enrollmentId: 'enrollment_set_3',
      learnerId: 'learner_set_3',
      groupId: 'group_set_3',
      groupCourseIds: [],
      actorId: 'u1',
      documentSet: [
        {
          courseVersionId: 'cver_3',
          templateId: templateAId,
          position: 0,
          isRequired: true,
          autoIssueOnCompletion: true
        },
        {
          courseVersionId: 'cver_3',
          templateId: templateBId,
          position: 1,
          isRequired: true,
          autoIssueOnCompletion: true
        }
      ]
    };
    listener.handleEnrollmentCompleted(payload);
    listener.handleEnrollmentCompleted(payload);
    await flushDeferred();

    const state = new InMemoryDocumentsState();
    await persistence.loadIntoState('tenant_demo', state);
    const docs = new DocumentsService(state, audit, realtime);
    const tasks = docs.listDocumentTasks('tenant_demo', {});
    expect(tasks.total).toBe(2);
  });

  it('writes document_set_failed audit when runner throws', async () => {
    const audit = new AuditService();
    const runner = {
      runWithTenantDocuments: async () => {
        throw new Error('tenant runner unavailable');
      }
    } as unknown as DocumentsTenantRunner;
    const listener = new EnrollmentDocumentIssuanceListener(runner, audit);

    listener.handleEnrollmentCompleted({
      tenantId: 'tenant_demo',
      enrollmentId: 'enrollment_set_fail',
      learnerId: 'learner_set_fail',
      groupId: 'group_set_fail',
      groupCourseIds: [],
      actorId: 'u1',
      documentSet: [
        {
          courseVersionId: 'cver_x',
          templateId: 'tpl_x',
          position: 0,
          isRequired: true,
          autoIssueOnCompletion: true
        }
      ]
    });
    await flushDeferred();

    const logs = await audit.list('tenant_demo');
    expect(logs.some((x) => x.action === 'documents.enrollment_document_set_failed')).toBe(true);
    expect(logs.some((x) => x.action === 'documents.enrollment_certificate_failed')).toBe(false);
  });

  it('falls back to legacy single-cert flow when documentSet is empty', async () => {
    const audit = new AuditService();
    const realtime = new RealtimeEventsService();
    const persistence = new MemoryDocumentsPersistenceBackend();
    const gateway = new TenantSerialGateway();
    const runner = new DocumentsTenantRunner(persistence, gateway, audit, realtime);

    await runner.runWithTenantDocuments('tenant_demo', async (documents) => {
      const ctx = {
        requestId: 'r_fallback',
        correlationId: 'c_fallback',
        ip: '127.0.0.1',
        userAgent: 'vitest',
        tenantId: 'tenant_demo',
        userId: 'u1',
        roles: [],
        permissions: [],
        method: 'POST',
        path: '/api/v1/documents',
        timestamp: new Date().toISOString()
      };
      const tpl = documents.createTemplate(
        'tenant_demo',
        'u1',
        { name: 'Legacy', templateType: 'certificate' },
        ctx
      );
      const v = documents.createTemplateVersion('tenant_demo', 'u1', {
        templateId: tpl.id,
        fileId: 'file_legacy'
      });
      documents.activateTemplateVersion('tenant_demo', v.id);
      documents.createTemplateBinding('tenant_demo', {
        templateId: tpl.id,
        bindType: 'group',
        groupId: 'group_fallback',
        priority: 100
      });
    });

    const listener = new EnrollmentDocumentIssuanceListener(runner, audit);
    listener.handleEnrollmentCompleted({
      tenantId: 'tenant_demo',
      enrollmentId: 'enrollment_fallback',
      learnerId: 'learner_fallback',
      groupId: 'group_fallback',
      groupCourseIds: ['course_fallback'],
      actorId: 'u1',
      documentSet: []
    });
    await flushDeferred();

    const state = new InMemoryDocumentsState();
    await persistence.loadIntoState('tenant_demo', state);
    const docs = new DocumentsService(state, audit, realtime);
    const tasks = docs.listDocumentTasks('tenant_demo', {});
    expect(tasks.total).toBe(1);
  });
});
