import { NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { DocumentsService } from './documents.service.js';
import { InMemoryDocumentsState } from './in-memory-documents.state.js';
import { AuditService } from '../audit/audit.service.js';
import { RealtimeEventsService } from '../core/realtime-events.service.js';

const ctx = {
  requestId: 'r1',
  correlationId: 'c1',
  ip: '127.0.0.1',
  userAgent: 'vitest',
  tenantId: 't1',
  userId: 'u1',
  roles: [],
  permissions: [],
  method: 'POST',
  path: '/api/v1/documents/generate',
  timestamp: new Date().toISOString()
};

describe('DocumentsService', () => {
  it('keeps generation idempotent by key', () => {
    const service = new DocumentsService(
      new InMemoryDocumentsState(),
      new AuditService(),
      new RealtimeEventsService()
    );
    const template = service.createTemplate(
      't1',
      'u1',
      { name: 'Tpl', templateType: 'contract' },
      ctx
    );
    const version = service.createTemplateVersion('t1', 'u1', {
      templateId: template.id,
      fileId: 'file_1'
    });
    service.activateTemplateVersion('t1', version.id);

    const one = service.generateDocument('t1', 'u1', {
      idempotencyKey: 'abc',
      templateId: template.id,
      sourceEntityType: 'group',
      sourceEntityId: 'g1',
      documentType: 'default'
    });
    const two = service.generateDocument('t1', 'u1', {
      idempotencyKey: 'abc',
      templateId: template.id,
      sourceEntityType: 'group',
      sourceEntityId: 'g1',
      documentType: 'default'
    });

    expect(one.id).toBe(two.id);
    expect(service.listDocumentTasks('t1', {}).total).toBe(1);
  });

  it('keeps one task for 30 parallel idempotent submissions', async () => {
    const service = new DocumentsService(
      new InMemoryDocumentsState(),
      new AuditService(),
      new RealtimeEventsService()
    );
    const template = service.createTemplate(
      't1',
      'u1',
      { name: 'Tpl', templateType: 'contract' },
      ctx
    );
    const version = service.createTemplateVersion('t1', 'u1', {
      templateId: template.id,
      fileId: 'file_1'
    });
    service.activateTemplateVersion('t1', version.id);

    const tasks = await Promise.all(
      Array.from({ length: 30 }, () =>
        Promise.resolve(
          service.generateDocument('t1', 'u1', {
            idempotencyKey: 'abc-parallel',
            templateId: template.id,
            sourceEntityType: 'group',
            sourceEntityId: 'g1',
            documentType: 'default'
          })
        )
      )
    );

    expect(new Set(tasks.map((task) => task.id)).size).toBe(1);
    expect(service.listDocumentTasks('t1', {}).total).toBe(1);
  });

  it('creates unique reservations', () => {
    const service = new DocumentsService(
      new InMemoryDocumentsState(),
      new AuditService(),
      new RealtimeEventsService()
    );
    service.createNumberingRule('t1', {
      documentType: 'default',
      prefix: 'DOC-',
      suffix: '',
      pattern: '{prefix}{counter}{suffix}'
    });
    const a = service.reserveNumber('t1', 'default');
    const b = service.reserveNumber('t1', 'default');

    expect(a.reservedNumber).not.toEqual(b.reservedNumber);
    expect(b.reservedNumber.endsWith('000002')).toBe(true);
  });

  it('prevents cross-tenant access', () => {
    const service = new DocumentsService(
      new InMemoryDocumentsState(),
      new AuditService(),
      new RealtimeEventsService()
    );
    const template = service.createTemplate(
      'tenant-a',
      'u1',
      { name: 'T', templateType: 'certificate' },
      ctx
    );
    expect(() => service.getTemplate('tenant-b', template.id)).toThrowError();
  });

  it('does not allow generation from archived template', () => {
    const service = new DocumentsService(
      new InMemoryDocumentsState(),
      new AuditService(),
      new RealtimeEventsService()
    );
    const template = service.createTemplate(
      't1',
      'u1',
      { name: 'Tpl', templateType: 'contract' },
      ctx
    );
    service.archiveTemplate('t1', 'u1', template.id, ctx);

    expect(() =>
      service.generateDocument('t1', 'u1', {
        idempotencyKey: 'archived-block',
        templateId: template.id,
        sourceEntityType: 'group',
        sourceEntityId: 'g1',
        documentType: 'default'
      })
    ).toThrowError();
  });

  it('supports failed -> queued retry transition', () => {
    const service = new DocumentsService(
      new InMemoryDocumentsState(),
      new AuditService(),
      new RealtimeEventsService()
    );
    const template = service.createTemplate(
      't1',
      'u1',
      { name: 'Tpl', templateType: 'contract' },
      ctx
    );
    const version = service.createTemplateVersion('t1', 'u1', {
      templateId: template.id,
      fileId: 'file_1'
    });
    service.activateTemplateVersion('t1', version.id);
    const task = service.generateDocument('t1', 'u1', {
      idempotencyKey: 'retry-1',
      templateId: template.id,
      sourceEntityType: 'group',
      sourceEntityId: 'g1',
      documentType: 'default'
    });

    service.startTask('t1', task.id);
    service.failTask('t1', task.id, 'render failed');
    const retried = service.retryTask('t1', task.id);
    expect(retried.status).toBe('queued');
    expect(retried.errorMessage).toBeUndefined();
  });

  it('creates multiple generation tasks for batch request', () => {
    const service = new DocumentsService(
      new InMemoryDocumentsState(),
      new AuditService(),
      new RealtimeEventsService()
    );
    const template = service.createTemplate(
      't1',
      'u1',
      { name: 'Tpl', templateType: 'contract' },
      ctx
    );
    const version = service.createTemplateVersion('t1', 'u1', {
      templateId: template.id,
      fileId: 'file_1'
    });
    service.activateTemplateVersion('t1', version.id);

    const batch = service.generateDocumentsBatch(
      't1',
      'u1',
      {
        templateId: template.id,
        sourceEntityType: 'enrollment',
        sourceEntityIds: ['e1', 'e2', 'e3'],
        documentType: 'certificate'
      },
      ctx
    );

    expect(batch.items).toHaveLength(3);
    expect(service.listDocumentTasks('t1', {}).total).toBe(3);
    for (const task of batch.items) {
      expect(task.requestId).toBe(ctx.requestId);
      expect(task.correlationId).toBe(ctx.correlationId);
    }
  });

  it('writes deterministic audit trail for task lifecycle', async () => {
    const auditService = new AuditService();
    const service = new DocumentsService(
      new InMemoryDocumentsState(),
      auditService,
      new RealtimeEventsService()
    );
    const template = service.createTemplate(
      't1',
      'u1',
      { name: 'Tpl', templateType: 'contract' },
      ctx
    );
    const version = service.createTemplateVersion('t1', 'u1', {
      templateId: template.id,
      fileId: 'file_1'
    });
    service.activateTemplateVersion('t1', version.id);
    const task = service.generateDocument(
      't1',
      'u1',
      {
        idempotencyKey: 'audit-lifecycle-1',
        templateId: template.id,
        sourceEntityType: 'group',
        sourceEntityId: 'g1',
        documentType: 'default'
      },
      ctx
    );

    service.startTask('t1', task.id);
    service.failTask('t1', task.id, 'render failed');
    service.retryTask('t1', task.id);
    service.cancelTask('t1', task.id);

    const actions = (await auditService.list('t1'))
      .filter((entry) => entry.entityType === 'document_task' && entry.entityId === task.id)
      .map((entry) => entry.action);

    expect(actions).toEqual([
      'documents.task.created',
      'documents.task.started',
      'documents.task.failed',
      'documents.task.retried',
      'documents.task.cancelled'
    ]);
    const createdEntry = (await auditService.list('t1')).find(
      (entry) => entry.action === 'documents.task.created' && entry.entityId === task.id
    );
    expect(createdEntry?.metadata?.correlation_id).toBe('c1');
  });

  it('keeps finalized documents immutable for finalize after archive', () => {
    const service = new DocumentsService(
      new InMemoryDocumentsState(),
      new AuditService(),
      new RealtimeEventsService()
    );
    service.createNumberingRule('t1', { documentType: 'default' });
    const template = service.createTemplate(
      't1',
      'u1',
      { name: 'Tpl', templateType: 'contract' },
      ctx
    );
    const version = service.createTemplateVersion('t1', 'u1', {
      templateId: template.id,
      fileId: 'file_1'
    });
    service.activateTemplateVersion('t1', version.id);
    const task = service.generateDocument('t1', 'u1', {
      idempotencyKey: 'immut-1',
      templateId: template.id,
      sourceEntityType: 'group',
      sourceEntityId: 'g1',
      documentType: 'default'
    });

    const generated = service.completeTask('t1', task.id, 'file_generated_1');
    service.archiveDocument('t1', generated.id);
    expect(() => service.finalizeDocument('t1', generated.id)).toThrowError();
  });

  it('validates supported template variable categories', () => {
    const service = new DocumentsService(
      new InMemoryDocumentsState(),
      new AuditService(),
      new RealtimeEventsService()
    );
    const template = service.createTemplate(
      't1',
      'u1',
      { name: 'Tpl', templateType: 'contract' },
      ctx
    );
    const version = service.createTemplateVersion('t1', 'u1', {
      templateId: template.id,
      fileId: 'file_1'
    });

    expect(() =>
      service.createTemplateVariable('t1', {
        templateVersionId: version.id,
        variableCode: 'x',
        displayName: 'X',
        categoryCode: 'unknown',
        dataType: 'string'
      })
    ).toThrowError();
  });

  it('listDocuments scopes by tenantId and enrollment source filters', () => {
    const state = new InMemoryDocumentsState();
    state.generatedDocuments.push(
      {
        id: 'g_ta',
        tenantId: 'ta',
        templateId: 'tpl',
        templateVersionId: 'ver',
        documentType: 'certificate',
        name: 'A',
        sourceEntityType: 'enrollment',
        sourceEntityId: 'enr_1',
        fileId: 'f_a',
        status: 'generated',
        isFinal: false,
        generatedAt: '2020-01-01T00:00:00.000Z',
        archivedAt: undefined,
        pdfFileId: undefined,
        documentNumber: undefined,
        documentDate: undefined,
        generatedBy: undefined
      },
      {
        id: 'g_tb',
        tenantId: 'tb',
        templateId: 'tpl',
        templateVersionId: 'ver',
        documentType: 'certificate',
        name: 'B',
        sourceEntityType: 'enrollment',
        sourceEntityId: 'enr_other',
        fileId: 'f_b',
        status: 'generated',
        isFinal: false,
        generatedAt: '2020-01-01T00:00:00.000Z',
        archivedAt: undefined,
        pdfFileId: undefined,
        documentNumber: undefined,
        documentDate: undefined,
        generatedBy: undefined
      }
    );

    const service = new DocumentsService(state, new AuditService(), new RealtimeEventsService());

    const taAll = service.listDocuments('ta', {});
    expect(taAll.total).toBe(1);

    const bySource = service.listDocuments('ta', {
      sourceEntityType: 'enrollment',
      sourceEntityId: 'enr_1'
    });
    expect(bySource.total).toBe(1);
    expect(bySource.items[0]!.id).toBe('g_ta');

    expect(service.listDocuments('tb', {}).total).toBe(1);
  });

  it('marks number reservation as failed when task fails after start', () => {
    const service = new DocumentsService(
      new InMemoryDocumentsState(),
      new AuditService(),
      new RealtimeEventsService()
    );
    service.createNumberingRule('t1', { documentType: 'default', prefix: 'DOC-' });
    const template = service.createTemplate(
      't1',
      'u1',
      { name: 'Tpl', templateType: 'contract' },
      ctx
    );
    const version = service.createTemplateVersion('t1', 'u1', {
      templateId: template.id,
      fileId: 'file_1'
    });
    service.activateTemplateVersion('t1', version.id);
    const task = service.generateDocument('t1', 'u1', {
      idempotencyKey: 'failed-reservation',
      templateId: template.id,
      sourceEntityType: 'group',
      sourceEntityId: 'g1',
      documentType: 'default'
    });

    const running = service.startTask('t1', task.id);
    service.failTask('t1', task.id, 'renderer failure');
    const reservation = service.getReservation('t1', running.numberReservationId!);
    expect(reservation.status).toBe('failed');
  });

  it('resolves variables with snapshot and required validation', () => {
    const service = new DocumentsService(
      new InMemoryDocumentsState(),
      new AuditService(),
      new RealtimeEventsService()
    );
    const template = service.createTemplate(
      't1',
      'u1',
      { name: 'Tpl', templateType: 'contract' },
      ctx
    );
    const version = service.createTemplateVersion('t1', 'u1', {
      templateId: template.id,
      fileId: 'file_1',
      variablesSchema: { variables: [{ code: 'document.title', required: true }] }
    });
    service.createTemplateVariable('t1', {
      templateVersionId: version.id,
      variableCode: 'tenant.name',
      displayName: 'Tenant Name',
      categoryCode: 'tenant',
      dataType: 'string',
      isRequired: true
    });

    expect(() =>
      service.resolveTemplateVariables('t1', version.id, { 'document.title': 'Doc' })
    ).toThrowError();
    const resolved = service.resolveTemplateVariables('t1', version.id, {
      'document.title': 'Doc',
      'tenant.name': 'Acme'
    });
    expect(resolved.__snapshot).toBeDefined();
  });

  it('resolves auto certificate binding with course match before group fallback', () => {
    const service = new DocumentsService(
      new InMemoryDocumentsState(),
      new AuditService(),
      new RealtimeEventsService()
    );
    const tplCert = service.createTemplate(
      't1',
      'u1',
      { name: 'Cert', templateType: 'certificate' },
      ctx
    );
    const tplOther = service.createTemplate(
      't1',
      'u1',
      { name: 'Other', templateType: 'protocol' },
      ctx
    );
    const v = service.createTemplateVersion('t1', 'u1', { templateId: tplCert.id, fileId: 'f1' });
    service.activateTemplateVersion('t1', v.id);
    service.createTemplateBinding('t1', {
      templateId: tplCert.id,
      bindType: 'group',
      groupId: 'g1',
      priority: 900
    });
    service.createTemplateBinding('t1', {
      templateId: tplOther.id,
      bindType: 'course',
      courseId: 'c1',
      priority: 1000
    });
    void service.createTemplateBinding('t1', {
      templateId: tplCert.id,
      bindType: 'course',
      courseId: 'c1',
      priority: 10
    });
    const resolved = service.resolveAutoCertificateTemplateBinding('t1', 'g1', ['c1']);
    expect(resolved?.templateId).toBe(tplCert.id);
  });

  it('getTemplate resolves by tenant when duplicate template ids exist (must is tenant-scoped)', () => {
    const state = new InMemoryDocumentsState();
    const service = new DocumentsService(state, new AuditService(), new RealtimeEventsService());
    const now = new Date().toISOString();
    const sharedId = 'tpl_duplicate_id_cross_tenant';
    state.templates.push({
      id: sharedId,
      tenantId: 'tenant_a',
      name: 'On A',
      templateType: 'contract',
      status: 'active',
      createdAt: now,
      updatedAt: now
    });
    state.templates.push({
      id: sharedId,
      tenantId: 'tenant_b',
      name: 'On B',
      templateType: 'contract',
      status: 'active',
      createdAt: now,
      updatedAt: now
    });

    expect(service.getTemplate('tenant_a', sharedId).name).toBe('On A');
    expect(service.getTemplate('tenant_b', sharedId).name).toBe('On B');
    expect(() => service.getTemplate('tenant_a', 'tpl_only_other_tenant')).toThrow(
      NotFoundException
    );
  });

  // Plan A §5.5 — variable categories program/commission
  it('accepts program category for template variables (Plan A §5.5)', () => {
    const service = new DocumentsService(
      new InMemoryDocumentsState(),
      new AuditService(),
      new RealtimeEventsService()
    );
    const template = service.createTemplate(
      't1',
      'u1',
      { name: 'Cert with program', templateType: 'certificate' },
      ctx
    );
    const version = service.createTemplateVersion('t1', 'u1', {
      templateId: template.id,
      fileId: 'file_p'
    });
    const created = service.createTemplateVariable('t1', {
      templateVersionId: version.id,
      variableCode: 'program.academic_hours',
      displayName: 'Часы',
      categoryCode: 'program',
      dataType: 'number',
      isRequired: true
    });
    expect(created.categoryCode).toBe('program');
    expect(created.variableCode).toBe('program.academic_hours');
  });

  it('accepts commission category for template variables (Plan A §5.5)', () => {
    const service = new DocumentsService(
      new InMemoryDocumentsState(),
      new AuditService(),
      new RealtimeEventsService()
    );
    const template = service.createTemplate(
      't1',
      'u1',
      { name: 'Protocol with commission', templateType: 'protocol' },
      ctx
    );
    const version = service.createTemplateVersion('t1', 'u1', {
      templateId: template.id,
      fileId: 'file_p2'
    });
    const created = service.createTemplateVariable('t1', {
      templateVersionId: version.id,
      variableCode: 'commission.chairman.name',
      displayName: 'ФИО председателя',
      categoryCode: 'commission',
      dataType: 'string',
      isRequired: true
    });
    expect(created.categoryCode).toBe('commission');
  });
});
