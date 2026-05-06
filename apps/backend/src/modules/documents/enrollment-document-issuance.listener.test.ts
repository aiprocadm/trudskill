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
      actorId: 'u1'
    });
    await flushDeferred();

    const state = new InMemoryDocumentsState();
    await persistence.loadIntoState('tenant_demo', state);
    const docs = new DocumentsService(state, audit, realtime);
    const tasks = docs.listDocumentTasks('tenant_demo', {});
    expect(tasks.total).toBe(1);
    expect(tasks.items[0]?.sourceEntityId).toBe('enrollment_x');
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
      actorId: 'u1'
    });
    await flushDeferred();

    const state = new InMemoryDocumentsState();
    await persistence.loadIntoState('tenant_demo', state);
    expect(state.tasks.length).toBe(0);
    const logs = await audit.list('tenant_demo');
    expect(logs.some((x) => x.action === 'documents.enrollment_certificate_skipped')).toBe(true);
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
});
