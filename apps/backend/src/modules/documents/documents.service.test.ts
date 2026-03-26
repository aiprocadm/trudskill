import { describe, expect, it } from 'vitest';
import { AuditService } from '../audit/audit.service.js';
import { DocumentsService } from './documents.service.js';

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
    const service = new DocumentsService(new AuditService());
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

  it('creates unique reservations', () => {
    const service = new DocumentsService(new AuditService());
    service.createNumberingRule('t1', { documentType: 'default', prefix: 'DOC-', suffix: '', pattern: '{prefix}{counter}{suffix}' });
    const a = service.reserveNumber('t1', 'default');
    const b = service.reserveNumber('t1', 'default');

    expect(a.reservedNumber).not.toEqual(b.reservedNumber);
    expect(b.reservedNumber.endsWith('000002')).toBe(true);
  });

  it('prevents cross-tenant access', () => {
    const service = new DocumentsService(new AuditService());
    const template = service.createTemplate('tenant-a', 'u1', { name: 'T', templateType: 'x' }, ctx);
    expect(() => service.getTemplate('tenant-b', template.id)).toThrowError();
  });
});
