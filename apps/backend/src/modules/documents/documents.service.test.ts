import { NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { describe, expect, it, vi } from 'vitest';

import { DOCUMENT_REVOKED_EVENT } from './document-revoked.event.js';
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
    service.activateTemplateVersion('t1', 'u1', version.id, ctx);

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
    service.activateTemplateVersion('t1', 'u1', version.id, ctx);

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

  it('resets the counter and embeds the period on a yearly rollover without colliding', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2025-06-15T00:00:00.000Z'));
      const service = new DocumentsService(
        new InMemoryDocumentsState(),
        new AuditService(),
        new RealtimeEventsService()
      );
      service.createNumberingRule('t1', {
        documentType: 'certificate',
        prefix: 'CERT-',
        resetPeriod: 'year'
      });

      const a = service.reserveNumber('t1', 'certificate');
      const b = service.reserveNumber('t1', 'certificate');
      expect(a.reservedNumber).toBe('CERT-2025-000001');
      expect(b.reservedNumber).toBe('CERT-2025-000002');

      // Year rolls over: counter resets to 1, but the period in the number keeps
      // it globally unique — the prior period's #1 must not cause a collision.
      vi.setSystemTime(new Date('2026-01-10T00:00:00.000Z'));
      const c = service.reserveNumber('t1', 'certificate');
      expect(c.reservedNumber).toBe('CERT-2026-000001');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not advance the counter when a reservation number collides', () => {
    const state = new InMemoryDocumentsState();
    const service = new DocumentsService(state, new AuditService(), new RealtimeEventsService());
    service.createNumberingRule('t1', {
      documentType: 'default',
      prefix: 'DOC-',
      pattern: '{prefix}{counter}{suffix}'
    });
    // Seed a reservation colliding with the very first number the rule would mint.
    state.reservations.push({
      id: 'seed',
      tenantId: 't1',
      ruleId: 'seed-rule',
      reservedNumber: 'DOC-000001',
      reservedAt: new Date().toISOString(),
      status: 'reserved'
    });

    expect(() => service.reserveNumber('t1', 'default')).toThrow();

    // A failed reservation must not burn a counter value (no gap in the sequence).
    const rule = state.numberingRules.find(
      (r) => r.tenantId === 't1' && r.documentType === 'default'
    );
    expect(rule?.currentCounter).toBe(0);
  });

  it('issues documents across a year boundary without silent failure', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2025-12-31T00:00:00.000Z'));
      const service = new DocumentsService(
        new InMemoryDocumentsState(),
        new AuditService(),
        new RealtimeEventsService()
      );
      const template = service.createTemplate(
        't1',
        'u1',
        { name: 'Cert', templateType: 'certificate' },
        ctx
      );
      const version = service.createTemplateVersion('t1', 'u1', {
        templateId: template.id,
        fileId: 'file_1'
      });
      service.activateTemplateVersion('t1', 'u1', version.id, ctx);
      service.createNumberingRule('t1', {
        documentType: 'certificate',
        prefix: 'CERT-',
        resetPeriod: 'year'
      });

      const task1 = service.generateDocument('t1', 'u1', {
        idempotencyKey: 'enrollment-2025',
        templateId: template.id,
        sourceEntityType: 'enrollment',
        sourceEntityId: 'e1',
        documentType: 'certificate'
      });
      const doc1 = service.completeTask('t1', task1.id, 'file_out_1', 'u1');
      expect(doc1.documentNumber).toBe('CERT-2025-000001');

      vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
      const task2 = service.generateDocument('t1', 'u1', {
        idempotencyKey: 'enrollment-2026',
        templateId: template.id,
        sourceEntityType: 'enrollment',
        sourceEntityId: 'e2',
        documentType: 'certificate'
      });
      const doc2 = service.completeTask('t1', task2.id, 'file_out_2', 'u1');
      expect(doc2.documentNumber).toBe('CERT-2026-000001');
    } finally {
      vi.useRealTimers();
    }
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
    service.activateTemplateVersion('t1', 'u1', version.id, ctx);
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
    service.activateTemplateVersion('t1', 'u1', version.id, ctx);

    const batch = service.generateDocumentsBatch(
      't1',
      'u1',
      {
        idempotencyKey: 'test-key',
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
    service.activateTemplateVersion('t1', 'u1', version.id, ctx);
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

  it('keeps finalized documents immutable for finalize after archive', async () => {
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
    service.activateTemplateVersion('t1', 'u1', version.id, ctx);
    const task = service.generateDocument('t1', 'u1', {
      idempotencyKey: 'immut-1',
      templateId: template.id,
      sourceEntityType: 'group',
      sourceEntityId: 'g1',
      documentType: 'default'
    });

    const generated = service.completeTask('t1', task.id, 'file_generated_1');
    await service.archiveDocument('t1', 'u1', generated.id, ctx);
    await expect(service.finalizeDocument('t1', 'u1', generated.id, ctx)).rejects.toThrowError();
  });

  it('stamps validUntil from the generate request onto the completed document', () => {
    const service = new DocumentsService(
      new InMemoryDocumentsState(),
      new AuditService(),
      new RealtimeEventsService()
    );
    service.createNumberingRule('t1', { documentType: 'certificate' });
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
    service.activateTemplateVersion('t1', 'u1', version.id, ctx);
    const task = service.generateDocument(
      't1',
      'u1',
      {
        idempotencyKey: 'recert-stamp-1',
        templateId: template.id,
        sourceEntityType: 'enrollment',
        sourceEntityId: 'enr_1',
        documentType: 'certificate',
        validUntil: '2027-06-04'
      },
      ctx
    );
    const doc = service.completeTask('t1', task.id, 'file_1');
    expect(doc.validUntil).toBe('2027-06-04');
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
      service.createTemplateVariable(
        't1',
        'u1',
        {
          templateVersionId: version.id,
          variableCode: 'x',
          displayName: 'X',
          categoryCode: 'unknown',
          dataType: 'string'
        },
        ctx
      )
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
    service.activateTemplateVersion('t1', 'u1', version.id, ctx);
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
    service.createTemplateVariable(
      't1',
      'u1',
      {
        templateVersionId: version.id,
        variableCode: 'tenant.name',
        displayName: 'Tenant Name',
        categoryCode: 'tenant',
        dataType: 'string',
        isRequired: true
      },
      ctx
    );

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
    service.activateTemplateVersion('t1', 'u1', v.id, ctx);
    service.createTemplateBinding(
      't1',
      undefined,
      {
        templateId: tplCert.id,
        bindType: 'group',
        groupId: 'g1',
        priority: 900
      },
      ctx
    );
    service.createTemplateBinding(
      't1',
      undefined,
      {
        templateId: tplOther.id,
        bindType: 'course',
        courseId: 'c1',
        priority: 1000
      },
      ctx
    );
    service.createTemplateBinding(
      't1',
      undefined,
      {
        templateId: tplCert.id,
        bindType: 'course',
        courseId: 'c1',
        priority: 10
      },
      ctx
    );
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
    const created = service.createTemplateVariable(
      't1',
      'u1',
      {
        templateVersionId: version.id,
        variableCode: 'program.academic_hours',
        displayName: 'Часы',
        categoryCode: 'program',
        dataType: 'number',
        isRequired: true
      },
      ctx
    );
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
    const created = service.createTemplateVariable(
      't1',
      'u1',
      {
        templateVersionId: version.id,
        variableCode: 'commission.chairman.name',
        displayName: 'ФИО председателя',
        categoryCode: 'commission',
        dataType: 'string',
        isRequired: true
      },
      ctx
    );
    expect(created.categoryCode).toBe('commission');
  });
});

describe('DocumentsService.listIssuedDocuments (Plan B §5.6)', () => {
  function seedService() {
    const state = new InMemoryDocumentsState();
    const service = new DocumentsService(state, new AuditService(), new RealtimeEventsService());
    state.templates.push({
      id: 'tpl_cert',
      tenantId: 't1',
      name: 'Удостоверение',
      templateType: 'certificate',
      status: 'active',
      createdAt: '2026-05-20T00:00:00.000Z',
      updatedAt: '2026-05-20T00:00:00.000Z'
    });
    state.generatedDocuments.push(
      {
        id: 'gdoc_1',
        tenantId: 't1',
        templateId: 'tpl_cert',
        templateVersionId: 'tplv_1',
        documentType: 'certificate',
        name: 'Doc 1',
        sourceEntityType: 'enrollment',
        sourceEntityId: 'enr_1',
        fileId: 'f_1',
        status: 'generated',
        documentNumber: 'N-1',
        documentDate: '2026-05-01',
        isFinal: false,
        generatedAt: '2026-05-01T00:00:00.000Z'
      },
      {
        id: 'gdoc_2',
        tenantId: 't1',
        templateId: 'tpl_cert',
        templateVersionId: 'tplv_1',
        documentType: 'certificate',
        name: 'Doc 2',
        sourceEntityType: 'enrollment',
        sourceEntityId: 'enr_2',
        fileId: 'f_2',
        status: 'final',
        documentNumber: 'N-2',
        documentDate: '2026-05-15',
        isFinal: true,
        generatedAt: '2026-05-15T00:00:00.000Z'
      },
      {
        id: 'gdoc_otherTenant',
        tenantId: 't2',
        templateId: 'tpl_cert',
        templateVersionId: 'tplv_1',
        documentType: 'certificate',
        name: 'Doc OT',
        sourceEntityType: 'enrollment',
        sourceEntityId: 'enr_x',
        fileId: 'f_x',
        status: 'generated',
        documentNumber: 'N-X',
        documentDate: '2026-05-10',
        isFinal: false,
        generatedAt: '2026-05-10T00:00:00.000Z'
      }
    );
    return { service, state };
  }

  it('returns only current tenant rows', () => {
    const { service } = seedService();
    const res = service.listIssuedDocuments('t1', {});
    expect(res.total).toBe(2);
    expect(res.items.every((d) => d.tenantId === 't1')).toBe(true);
  });

  it('filters by inclusive date range', () => {
    const { service } = seedService();
    const res = service.listIssuedDocuments('t1', { from: '2026-05-10', to: '2026-05-31' });
    expect(res.total).toBe(1);
    expect(res.items[0].id).toBe('gdoc_2');
  });

  it('filters by document types (multi)', () => {
    const { service, state } = seedService();
    state.generatedDocuments.push({
      id: 'gdoc_order',
      tenantId: 't1',
      templateId: 'tpl_cert',
      templateVersionId: 'tplv_1',
      documentType: 'order',
      name: 'Order',
      sourceEntityType: 'group',
      sourceEntityId: 'g_1',
      fileId: 'f_o',
      status: 'generated',
      documentNumber: 'O-1',
      documentDate: '2026-05-20',
      isFinal: false,
      generatedAt: '2026-05-20T00:00:00.000Z'
    });
    const res = service.listIssuedDocuments('t1', { types: ['order'] });
    expect(res.total).toBe(1);
    expect(res.items[0].documentType).toBe('order');
  });

  it('filters by status', () => {
    const { service } = seedService();
    const res = service.listIssuedDocuments('t1', { status: 'final' });
    expect(res.total).toBe(1);
    expect(res.items[0].id).toBe('gdoc_2');
  });

  it('sorts by documentDate desc by default (newest first)', () => {
    const { service } = seedService();
    const res = service.listIssuedDocuments('t1', {});
    expect(res.items.map((d) => d.id)).toEqual(['gdoc_2', 'gdoc_1']);
  });

  it('paginates with limit and offset', () => {
    const { service } = seedService();
    const res = service.listIssuedDocuments('t1', { limit: 1, offset: 1 });
    expect(res.total).toBe(2);
    expect(res.items).toHaveLength(1);
    expect(res.items[0].id).toBe('gdoc_1');
  });

  it('filters by groupOrderDocumentId for tracing cascade', () => {
    const { service, state } = seedService();
    state.generatedDocuments.push({
      id: 'gdoc_in_order',
      tenantId: 't1',
      templateId: 'tpl_cert',
      templateVersionId: 'tplv_1',
      documentType: 'certificate',
      name: 'Doc in order',
      sourceEntityType: 'enrollment',
      sourceEntityId: 'enr_3',
      fileId: 'f_3',
      status: 'generated',
      documentNumber: 'N-3',
      documentDate: '2026-05-22',
      isFinal: false,
      generatedAt: '2026-05-22T00:00:00.000Z',
      groupOrderDocumentId: 'gdoc_order_parent'
    });
    const res = service.listIssuedDocuments('t1', { groupOrderDocumentId: 'gdoc_order_parent' });
    expect(res.total).toBe(1);
    expect(res.items[0].id).toBe('gdoc_in_order');
  });

  it('clamps offset and limit to safe values', () => {
    const { service } = seedService();
    const negative = service.listIssuedDocuments('t1', { offset: -10, limit: -5 });
    expect(negative.items.length).toBeGreaterThan(0);
  });
});

describe('DocumentsService.issueGroupOrder (Plan B §5.7)', () => {
  function seedService() {
    const state = new InMemoryDocumentsState();
    const service = new DocumentsService(state, new AuditService(), new RealtimeEventsService());
    state.templates.push(
      {
        id: 'tpl_order',
        tenantId: 't1',
        name: 'Приказ',
        templateType: 'order',
        status: 'active',
        currentVersionId: 'tplv_order',
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z'
      },
      {
        id: 'tpl_cert',
        tenantId: 't1',
        name: 'Удостоверение',
        templateType: 'certificate',
        status: 'active',
        currentVersionId: 'tplv_cert',
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z'
      }
    );
    state.versions.push(
      {
        id: 'tplv_order',
        tenantId: 't1',
        templateId: 'tpl_order',
        versionNo: 1,
        fileId: 'f_o',
        variablesSchema: {},
        isActive: true,
        createdAt: '2026-05-01T00:00:00.000Z'
      },
      {
        id: 'tplv_cert',
        tenantId: 't1',
        templateId: 'tpl_cert',
        versionNo: 1,
        fileId: 'f_c',
        variablesSchema: {},
        isActive: true,
        createdAt: '2026-05-01T00:00:00.000Z'
      }
    );
    return { service, state };
  }

  it('creates an order document of type "order" tied to the group', async () => {
    const { service } = seedService();
    const res = await service.issueGroupOrder(
      't1',
      'actor_1',
      { groupId: 'g_1', templateId: 'tpl_order', enrollmentIds: [] },
      ctx
    );
    expect(res.order.documentType).toBe('order');
    expect(res.order.sourceEntityType).toBe('group');
    expect(res.order.sourceEntityId).toBe('g_1');
    expect(res.certificates).toEqual([]);
    expect(res.alreadyExisted).toBe(false);
  });

  it('cascades certificates and links them to the order via groupOrderDocumentId', async () => {
    const { service } = seedService();
    const res = await service.issueGroupOrder(
      't1',
      'actor_1',
      {
        groupId: 'g_1',
        templateId: 'tpl_order',
        enrollmentIds: ['enr_a', 'enr_b'],
        certificateTemplateId: 'tpl_cert'
      },
      ctx
    );
    expect(res.certificates).toHaveLength(2);
    for (const cert of res.certificates) {
      expect(cert.documentType).toBe('certificate');
      expect(cert.sourceEntityType).toBe('enrollment');
      expect(cert.groupOrderDocumentId).toBe(res.order.id);
    }
  });

  it('is idempotent — second call with same groupId+templateId returns existing order', async () => {
    const { service, state } = seedService();
    const first = await service.issueGroupOrder(
      't1',
      'actor_1',
      {
        groupId: 'g_1',
        templateId: 'tpl_order',
        enrollmentIds: ['enr_a'],
        certificateTemplateId: 'tpl_cert'
      },
      ctx
    );
    const second = await service.issueGroupOrder(
      't1',
      'actor_1',
      {
        groupId: 'g_1',
        templateId: 'tpl_order',
        enrollmentIds: ['enr_a'],
        certificateTemplateId: 'tpl_cert'
      },
      ctx
    );
    expect(second.order.id).toBe(first.order.id);
    expect(second.alreadyExisted).toBe(true);
    // Сертификаты не задублированы.
    const allCerts = state.generatedDocuments.filter(
      (d) => d.groupOrderDocumentId === first.order.id
    );
    expect(allCerts).toHaveLength(1);
  });

  it('rejects when the order template is not of type "order"', async () => {
    const { service } = seedService();
    await expect(
      service.issueGroupOrder(
        't1',
        'actor_1',
        { groupId: 'g_1', templateId: 'tpl_cert', enrollmentIds: [] },
        ctx
      )
    ).rejects.toThrow(/template_type/);
  });

  it('rejects template from another tenant (cross-tenant isolation)', async () => {
    const { service, state } = seedService();
    state.templates.push({
      id: 'tpl_order_t2',
      tenantId: 't2',
      name: 'Приказ T2',
      templateType: 'order',
      status: 'active',
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z'
    });
    await expect(
      service.issueGroupOrder(
        't1',
        'actor_1',
        { groupId: 'g_1', templateId: 'tpl_order_t2', enrollmentIds: [] },
        ctx
      )
    ).rejects.toThrow(NotFoundException);
  });

  it('writes audit entries for order and each cascaded certificate', async () => {
    const state = new InMemoryDocumentsState();
    const audit = new AuditService();
    const auditSpy = vi.spyOn(audit, 'writeCritical');
    const service = new DocumentsService(state, audit, new RealtimeEventsService());
    state.templates.push(
      {
        id: 'tpl_order',
        tenantId: 't1',
        name: 'Приказ',
        templateType: 'order',
        status: 'active',
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z'
      },
      {
        id: 'tpl_cert',
        tenantId: 't1',
        name: 'Удостоверение',
        templateType: 'certificate',
        status: 'active',
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z'
      }
    );
    state.versions.push(
      {
        id: 'tplv_order',
        tenantId: 't1',
        templateId: 'tpl_order',
        versionNo: 1,
        fileId: 'f_o',
        variablesSchema: {},
        isActive: true,
        createdAt: '2026-05-01T00:00:00.000Z'
      },
      {
        id: 'tplv_cert',
        tenantId: 't1',
        templateId: 'tpl_cert',
        versionNo: 1,
        fileId: 'f_c',
        variablesSchema: {},
        isActive: true,
        createdAt: '2026-05-01T00:00:00.000Z'
      }
    );
    await service.issueGroupOrder(
      't1',
      'actor_1',
      {
        groupId: 'g_1',
        templateId: 'tpl_order',
        enrollmentIds: ['enr_a'],
        certificateTemplateId: 'tpl_cert'
      },
      ctx
    );
    const actions = auditSpy.mock.calls.map((call) => call[0].action);
    expect(actions).toContain('documents.group_order_issued');
    expect(actions).toContain('documents.certificate_issued_via_order');
  });
});

describe('DocumentsService qrToken generation (Plan C §5.8)', () => {
  it('issueGroupOrder generates qrToken on order document', async () => {
    const state = new InMemoryDocumentsState();
    const service = new DocumentsService(state, new AuditService(), new RealtimeEventsService());
    state.templates.push({
      id: 'tpl_order',
      tenantId: 't1',
      name: 'Приказ',
      templateType: 'order',
      status: 'active',
      currentVersionId: 'tplv_order',
      createdAt: '2026-05-01T00:00:00.000Z',
      updatedAt: '2026-05-01T00:00:00.000Z'
    });
    state.versions.push({
      id: 'tplv_order',
      tenantId: 't1',
      templateId: 'tpl_order',
      versionNo: 1,
      fileId: 'f_o',
      variablesSchema: {},
      isActive: true,
      createdAt: '2026-05-01T00:00:00.000Z'
    });
    const res = await service.issueGroupOrder(
      't1',
      'actor_1',
      { groupId: 'g_1', templateId: 'tpl_order', enrollmentIds: [] },
      ctx
    );
    expect(res.order.qrToken).toBeDefined();
    expect(res.order.qrToken!.length).toBeGreaterThanOrEqual(22);
    expect(res.order.qrToken!).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('issueGroupOrder generates unique qrToken for order + each cascaded certificate', async () => {
    const state = new InMemoryDocumentsState();
    const service = new DocumentsService(state, new AuditService(), new RealtimeEventsService());
    state.templates.push(
      {
        id: 'tpl_order',
        tenantId: 't1',
        name: 'Приказ',
        templateType: 'order',
        status: 'active',
        currentVersionId: 'tplv_order',
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z'
      },
      {
        id: 'tpl_cert',
        tenantId: 't1',
        name: 'Удостоверение',
        templateType: 'certificate',
        status: 'active',
        currentVersionId: 'tplv_cert',
        createdAt: '2026-05-01T00:00:00.000Z',
        updatedAt: '2026-05-01T00:00:00.000Z'
      }
    );
    state.versions.push(
      {
        id: 'tplv_order',
        tenantId: 't1',
        templateId: 'tpl_order',
        versionNo: 1,
        fileId: 'f_o',
        variablesSchema: {},
        isActive: true,
        createdAt: '2026-05-01T00:00:00.000Z'
      },
      {
        id: 'tplv_cert',
        tenantId: 't1',
        templateId: 'tpl_cert',
        versionNo: 1,
        fileId: 'f_c',
        variablesSchema: {},
        isActive: true,
        createdAt: '2026-05-01T00:00:00.000Z'
      }
    );
    const res = await service.issueGroupOrder(
      't1',
      'actor_1',
      {
        groupId: 'g_1',
        templateId: 'tpl_order',
        enrollmentIds: ['enr_a', 'enr_b', 'enr_c'],
        certificateTemplateId: 'tpl_cert'
      },
      ctx
    );
    const tokens = [res.order.qrToken, ...res.certificates.map((c) => c.qrToken)];
    const unique = new Set(tokens);
    expect(unique.size).toBe(4);
    for (const t of tokens) {
      expect(t).toMatch(/^[A-Za-z0-9_-]{22,}$/);
    }
  });
});

describe('DocumentsService.revokeDocument (Plan C §5.9)', () => {
  function seed() {
    const state = new InMemoryDocumentsState();
    const audit = new AuditService();
    const service = new DocumentsService(state, audit, new RealtimeEventsService());
    state.generatedDocuments.push({
      id: 'gdoc_revtest',
      tenantId: 't1',
      templateId: 'tpl',
      templateVersionId: 'tplv',
      documentType: 'certificate',
      name: 'Doc',
      sourceEntityType: 'enrollment',
      sourceEntityId: 'enr',
      fileId: 'f',
      status: 'generated',
      documentNumber: 'N-1',
      documentDate: '2026-05-26',
      isFinal: false,
      generatedAt: '2026-05-26T00:00:00.000Z',
      qrToken: 'rev_qrtoken1234567890ab'
    });
    return { state, audit, service };
  }

  it('revokes a generated document and sets revokedAt/revokedBy/reason', async () => {
    const { service } = seed();
    const result = await service.revokeDocument(
      't1',
      'admin_1',
      'gdoc_revtest',
      'Ошибка в ФИО',
      ctx
    );
    expect(result.status).toBe('revoked');
    expect(result.revokedAt).toBeDefined();
    expect(result.revokedBy).toBe('admin_1');
    expect(result.revocationReason).toBe('Ошибка в ФИО');
  });

  it('throws ConflictException when revoking an already-revoked document', async () => {
    const { service } = seed();
    await service.revokeDocument('t1', 'admin_1', 'gdoc_revtest', 'r1', ctx);
    await expect(
      service.revokeDocument('t1', 'admin_1', 'gdoc_revtest', 'r2', ctx)
    ).rejects.toThrowError(/уже аннулирован/);
  });

  it('throws BadRequestException when reason is empty', async () => {
    const { service } = seed();
    await expect(
      service.revokeDocument('t1', 'admin_1', 'gdoc_revtest', '', ctx)
    ).rejects.toThrowError(/Причина аннулирования/);
    await expect(
      service.revokeDocument('t1', 'admin_1', 'gdoc_revtest', '   ', ctx)
    ).rejects.toThrowError(/Причина аннулирования/);
  });

  it('cross-tenant: cannot revoke document from another tenant', async () => {
    const { service } = seed();
    await expect(
      service.revokeDocument('t2', 'admin_1', 'gdoc_revtest', 'reason', ctx)
    ).rejects.toThrowError(NotFoundException);
  });

  it('writes audit entry documents.revoked', async () => {
    const { service, audit } = seed();
    const spy = vi.spyOn(audit, 'writeCritical');
    await service.revokeDocument('t1', 'admin_1', 'gdoc_revtest', 'reason', ctx);
    const actions = spy.mock.calls.map((c) => c[0].action);
    expect(actions).toContain('documents.revoked');
  });

  it('emits documents.revoked when a document is revoked', async () => {
    const state = new InMemoryDocumentsState();
    const events = new EventEmitter2();
    const service = new DocumentsService(
      state,
      new AuditService(),
      new RealtimeEventsService(),
      undefined,
      events
    );
    state.generatedDocuments.push({
      id: 'gdoc_revtest',
      tenantId: 't1',
      templateId: 'tpl',
      templateVersionId: 'tplv',
      documentType: 'certificate',
      name: 'Doc',
      sourceEntityType: 'enrollment',
      sourceEntityId: 'enr',
      fileId: 'f',
      status: 'generated',
      documentNumber: 'N-1',
      documentDate: '2026-05-26',
      isFinal: false,
      generatedAt: '2026-05-26T00:00:00.000Z',
      qrToken: 'rev_qrtoken1234567890ab'
    });
    const captured: Array<{ reason: string; documentId: string; sourceEntityId?: string }> = [];
    events.on(DOCUMENT_REVOKED_EVENT, (p) =>
      captured.push(p as { reason: string; documentId: string; sourceEntityId?: string })
    );

    await service.revokeDocument('t1', 'admin_1', 'gdoc_revtest', 'Ошибка в ФИО', ctx);

    expect(captured).toHaveLength(1);
    expect(captured[0]!.reason).toBe('Ошибка в ФИО');
    expect(captured[0]!.documentId).toBe('gdoc_revtest');
    expect(captured[0]!.sourceEntityId).toBe('enr');
  });
});

describe('DocumentsService.reissueDocument (Plan C §5.9)', () => {
  function seed() {
    const state = new InMemoryDocumentsState();
    const audit = new AuditService();
    const service = new DocumentsService(state, audit, new RealtimeEventsService());
    state.generatedDocuments.push({
      id: 'gdoc_orig',
      tenantId: 't1',
      templateId: 'tpl',
      templateVersionId: 'tplv',
      documentType: 'certificate',
      name: 'Original',
      sourceEntityType: 'enrollment',
      sourceEntityId: 'enr',
      fileId: 'f',
      status: 'generated',
      documentNumber: 'ORIG-N1',
      documentDate: '2026-05-01',
      isFinal: false,
      generatedAt: '2026-05-01T00:00:00.000Z',
      qrToken: 'orig_qrtoken12345678ab'
    });
    return { state, audit, service };
  }

  it('creates a replacement with new number + new qr_token, links replaces/replaced_by, revokes original', async () => {
    const { service } = seed();
    const { original, replacement } = await service.reissueDocument(
      't1',
      'admin_1',
      'gdoc_orig',
      'Опечатка',
      ctx
    );
    expect(replacement.id).not.toBe(original.id);
    expect(replacement.replacesDocumentId).toBe('gdoc_orig');
    expect(replacement.documentNumber).not.toBe('ORIG-N1');
    expect(replacement.qrToken).toBeDefined();
    expect(replacement.qrToken).not.toBe('orig_qrtoken12345678ab');
    expect(original.replacedByDocumentId).toBe(replacement.id);
    expect(original.status).toBe('revoked');
    expect(original.revocationReason).toContain('Опечатка');
  });

  it('is idempotent — second reissue returns same replacement (cached pair)', async () => {
    const { service } = seed();
    const first = await service.reissueDocument('t1', 'admin_1', 'gdoc_orig', 'reason', ctx);
    const second = await service.reissueDocument('t1', 'admin_1', 'gdoc_orig', 'reason', ctx);
    expect(second.replacement.id).toBe(first.replacement.id);
    expect(second.original.id).toBe(first.original.id);
  });

  it('rejects reissue on document that was manually revoked (without prior reissue)', async () => {
    const { service } = seed();
    await service.revokeDocument('t1', 'admin_1', 'gdoc_orig', 'Manual revoke', ctx);
    await expect(
      service.reissueDocument('t1', 'admin_1', 'gdoc_orig', 'reissue?', ctx)
    ).rejects.toThrowError(/аннулирован вручную/);
  });

  it('cross-tenant: cannot reissue from another tenant', async () => {
    const { service } = seed();
    await expect(
      service.reissueDocument('t2', 'admin_1', 'gdoc_orig', 'reason', ctx)
    ).rejects.toThrowError(NotFoundException);
  });

  it('writes both documents.reissued + documents.revoked audit entries', async () => {
    const { service, audit } = seed();
    const spy = vi.spyOn(audit, 'writeCritical');
    await service.reissueDocument('t1', 'admin_1', 'gdoc_orig', 'reason', ctx);
    const actions = spy.mock.calls.map((c) => c[0].action);
    expect(actions).toContain('documents.reissued');
    expect(actions).toContain('documents.revoked');
  });
});

describe('DocumentsService.verifyDocumentByQrToken — revoked path (Plan C §5.8 + §5.9 integration)', () => {
  it('returns revokedAt and revocationReason for revoked documents', () => {
    const state = new InMemoryDocumentsState();
    const service = new DocumentsService(state, new AuditService(), new RealtimeEventsService());
    state.generatedDocuments.push({
      id: 'gdoc_rev_verify',
      tenantId: 't1',
      templateId: 'tpl',
      templateVersionId: 'tplv',
      documentType: 'certificate',
      name: 'Doc',
      sourceEntityType: 'enrollment',
      sourceEntityId: 'enr',
      fileId: 'f',
      status: 'revoked',
      documentNumber: 'N-rev',
      documentDate: '2026-05-26',
      isFinal: false,
      generatedAt: '2026-05-26T00:00:00.000Z',
      qrToken: 'verify_rev_token12345',
      revokedAt: '2026-05-27T10:00:00.000Z',
      revokedBy: 'admin_x',
      revocationReason: 'Опечатка в ФИО'
    });
    const result = service.verifyDocumentByQrToken('verify_rev_token12345');
    expect(result.status).toBe('revoked');
    expect(result.revokedAt).toBe('2026-05-27T10:00:00.000Z');
    expect(result.revocationReason).toBe('Опечатка в ФИО');
  });
});

// ---------------------------------------------------------------------------
// Phase 6 — signature status passthrough on public QR-verify result
// ---------------------------------------------------------------------------

describe('DocumentsService.verifyDocumentByQrToken — Phase 6 signature passthrough', () => {
  it('public verify surfaces signatureStatus for a signed document', () => {
    const state = new InMemoryDocumentsState();
    const service = new DocumentsService(state, new AuditService(), new RealtimeEventsService());
    state.generatedDocuments.push({
      id: 'gdoc_sig_verify',
      tenantId: 't1',
      templateId: 'tpl',
      templateVersionId: 'tplv',
      documentType: 'certificate',
      name: 'Doc',
      sourceEntityType: 'enrollment',
      sourceEntityId: 'enr',
      fileId: 'f',
      status: 'final',
      isFinal: true,
      generatedAt: '2026-06-17T00:00:00.000Z',
      qrToken: 'qrtoken-signed-1234',
      signatureStatus: 'signed',
      signatureCertificateSubject: 'CN=CDOProf, O=CDOProf'
    });

    const result = service.verifyDocumentByQrToken('qrtoken-signed-1234');

    expect(result.status).toBe('valid');
    expect(result.signatureStatus).toBe('signed');
    expect(result.signatureCertificateSubject).toBe('CN=CDOProf, O=CDOProf');
  });

  it('public verify omits signature fields for an unsigned document', () => {
    const state = new InMemoryDocumentsState();
    const service = new DocumentsService(state, new AuditService(), new RealtimeEventsService());
    state.generatedDocuments.push({
      id: 'gdoc_unsigned_verify',
      tenantId: 't1',
      templateId: 'tpl',
      templateVersionId: 'tplv',
      documentType: 'certificate',
      name: 'Doc',
      sourceEntityType: 'enrollment',
      sourceEntityId: 'enr',
      fileId: 'f',
      status: 'final',
      isFinal: true,
      generatedAt: '2026-06-17T00:00:00.000Z',
      qrToken: 'qrtoken-unsigned-1234'
    });

    const result = service.verifyDocumentByQrToken('qrtoken-unsigned-1234');

    expect(result.status).toBe('valid');
    expect(result.signatureStatus).toBeUndefined();
    expect(result.signatureCertificateSubject).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Phase 6 — sign-on-finalize + manual signDocument
// ---------------------------------------------------------------------------

import type {
  DocumentSignatureProvider,
  SignatureResult
} from '../../infrastructure/document-signature/document-signature.provider.js';

class StubSignatureProvider implements DocumentSignatureProvider {
  readonly id = 'cryptopro';
  calls: Array<{ documentId: string }> = [];
  constructor(private readonly result: SignatureResult) {}
  async sign(params: { documentId: string; fileId: string; tenantId: string }) {
    this.calls.push({ documentId: params.documentId });
    return this.result;
  }
}

function makeSignServiceWith(provider?: DocumentSignatureProvider) {
  const state = new InMemoryDocumentsState();
  const service = new DocumentsService(
    state,
    new AuditService(),
    new RealtimeEventsService(),
    undefined,
    undefined,
    provider
  );
  const doc = {
    id: 'gdoc_sig',
    tenantId: 't1',
    templateId: 'tpl',
    templateVersionId: 'tplv',
    documentType: 'certificate',
    name: 'cert',
    sourceEntityType: 'enrollment',
    sourceEntityId: 'enr_1',
    fileId: 'file_1',
    status: 'generated' as const,
    isFinal: false,
    generatedAt: '2026-06-15T00:00:00.000Z'
  };
  state.generatedDocuments.push(doc as never);
  return { service, state };
}

const signCtx = {
  tenantId: 't1',
  userId: 'user_1',
  requestId: 'r1',
  correlationId: 'c1'
} as never;

describe('DocumentsService signing (Phase 6)', () => {
  it('finalize without a provider leaves the document unsigned (back-compat)', async () => {
    const { service, state } = makeSignServiceWith(undefined);
    await service.finalizeDocument('t1', 'user_1', 'gdoc_sig', signCtx);
    expect(state.generatedDocuments[0].signatureStatus).toBeUndefined();
  });

  it('finalize with a signing provider stamps signed metadata', async () => {
    const provider = new StubSignatureProvider({
      status: 'signed',
      signatureRef: 'sig_abc',
      certificateSubject: 'CN=УЦ'
    });
    const { service, state } = makeSignServiceWith(provider);
    await service.finalizeDocument('t1', 'user_1', 'gdoc_sig', signCtx);
    const d = state.generatedDocuments[0];
    expect(d.signatureStatus).toBe('signed');
    expect(d.signatureProvider).toBe('cryptopro');
    expect(d.signatureRef).toBe('sig_abc');
    expect(d.signatureCertificateSubject).toBe('CN=УЦ');
    expect(d.signedAt).toBeDefined();
    expect(d.isFinal).toBe(true);
    expect(provider.calls).toHaveLength(1);
  });

  it('finalize still succeeds when signing fails (status=failed, document stays final)', async () => {
    const provider = new StubSignatureProvider({ status: 'failed', detail: 'provider_down' });
    const { service, state } = makeSignServiceWith(provider);
    const result = await service.finalizeDocument('t1', 'user_1', 'gdoc_sig', signCtx);
    expect(result.isFinal).toBe(true);
    expect(state.generatedDocuments[0].signatureStatus).toBe('failed');
  });

  it('signDocument re-signs an already-final document on demand', async () => {
    const provider = new StubSignatureProvider({ status: 'signed', signatureRef: 'sig_2' });
    const { service, state } = makeSignServiceWith(provider);
    state.generatedDocuments[0].status = 'final';
    state.generatedDocuments[0].isFinal = true;
    state.generatedDocuments[0].signatureStatus = 'failed';
    await service.signDocument('t1', 'user_1', 'gdoc_sig', signCtx);
    expect(state.generatedDocuments[0].signatureStatus).toBe('signed');
    expect(state.generatedDocuments[0].signatureRef).toBe('sig_2');
  });

  it('signDocument rejects a non-final (generated) document', async () => {
    const provider = new StubSignatureProvider({ status: 'signed' });
    const { service } = makeSignServiceWith(provider);
    // doc starts as status='generated', isFinal=false
    await expect(service.signDocument('t1', 'user_1', 'gdoc_sig', signCtx)).rejects.toThrow();
  });

  it('signDocument rejects a revoked document', async () => {
    const provider = new StubSignatureProvider({ status: 'signed' });
    const { service, state } = makeSignServiceWith(provider);
    state.generatedDocuments[0].status = 'final';
    state.generatedDocuments[0].isFinal = true;
    state.generatedDocuments[0].status = 'revoked'; // revoked keeps isFinal=true
    await expect(service.signDocument('t1', 'user_1', 'gdoc_sig', signCtx)).rejects.toThrow();
  });
});
