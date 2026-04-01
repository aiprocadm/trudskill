import { describe, expect, it } from 'vitest';
import { AuditService } from '../audit/audit.service.js';
import { DocumentsService } from './documents.service.js';
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
    const service = new DocumentsService(new AuditService(), new RealtimeEventsService());
    const template = service.createTemplate('t1', 'u1', { name: 'Tpl', templateType: 'contract' }, ctx);
    const version = service.createTemplateVersion('t1', 'u1', { templateId: template.id, fileId: 'file_1' });
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
    const service = new DocumentsService(new AuditService(), new RealtimeEventsService());
    const template = service.createTemplate('t1', 'u1', { name: 'Tpl', templateType: 'contract' }, ctx);
    const version = service.createTemplateVersion('t1', 'u1', { templateId: template.id, fileId: 'file_1' });
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
    const service = new DocumentsService(new AuditService(), new RealtimeEventsService());
    service.createNumberingRule('t1', { documentType: 'default', prefix: 'DOC-', suffix: '', pattern: '{prefix}{counter}{suffix}' });
    const a = service.reserveNumber('t1', 'default');
    const b = service.reserveNumber('t1', 'default');

    expect(a.reservedNumber).not.toEqual(b.reservedNumber);
    expect(b.reservedNumber.endsWith('000002')).toBe(true);
  });

  it('prevents cross-tenant access', () => {
    const service = new DocumentsService(new AuditService(), new RealtimeEventsService());
    const template = service.createTemplate('tenant-a', 'u1', { name: 'T', templateType: 'x' }, ctx);
    expect(() => service.getTemplate('tenant-b', template.id)).toThrowError();
  });

  it('does not allow generation from archived template', () => {
    const service = new DocumentsService(new AuditService(), new RealtimeEventsService());
    const template = service.createTemplate('t1', 'u1', { name: 'Tpl', templateType: 'contract' }, ctx);
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
    const service = new DocumentsService(new AuditService(), new RealtimeEventsService());
    const template = service.createTemplate('t1', 'u1', { name: 'Tpl', templateType: 'contract' }, ctx);
    const version = service.createTemplateVersion('t1', 'u1', { templateId: template.id, fileId: 'file_1' });
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

  it('keeps finalized documents immutable for finalize after archive', () => {
    const service = new DocumentsService(new AuditService(), new RealtimeEventsService());
    service.createNumberingRule('t1', { documentType: 'default' });
    const template = service.createTemplate('t1', 'u1', { name: 'Tpl', templateType: 'contract' }, ctx);
    const version = service.createTemplateVersion('t1', 'u1', { templateId: template.id, fileId: 'file_1' });
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
    const service = new DocumentsService(new AuditService(), new RealtimeEventsService());
    const template = service.createTemplate('t1', 'u1', { name: 'Tpl', templateType: 'contract' }, ctx);
    const version = service.createTemplateVersion('t1', 'u1', { templateId: template.id, fileId: 'file_1' });

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

  it('marks number reservation as failed when task fails after start', () => {
    const service = new DocumentsService(new AuditService(), new RealtimeEventsService());
    service.createNumberingRule('t1', { documentType: 'default', prefix: 'DOC-' });
    const template = service.createTemplate('t1', 'u1', { name: 'Tpl', templateType: 'contract' }, ctx);
    const version = service.createTemplateVersion('t1', 'u1', { templateId: template.id, fileId: 'file_1' });
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
    const service = new DocumentsService(new AuditService(), new RealtimeEventsService());
    const template = service.createTemplate('t1', 'u1', { name: 'Tpl', templateType: 'contract' }, ctx);
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

    expect(() => service.resolveTemplateVariables('t1', version.id, { 'document.title': 'Doc' })).toThrowError();
    const resolved = service.resolveTemplateVariables('t1', version.id, {
      'document.title': 'Doc',
      'tenant.name': 'Acme'
    });
    expect(resolved.__snapshot).toBeDefined();
  });
});
