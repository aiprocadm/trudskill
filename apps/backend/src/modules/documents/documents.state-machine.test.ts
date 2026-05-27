import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { DocumentsService } from './documents.service.js';
import { InMemoryDocumentsState } from './in-memory-documents.state.js';
import { AuditService } from '../audit/audit.service.js';
import { RealtimeEventsService } from '../core/realtime-events.service.js';

const ctx = {
  requestId: 'r-sm-1',
  correlationId: 'c-sm-1',
  ip: '127.0.0.1',
  userAgent: 'vitest',
  tenantId: 'tenant_demo',
  userId: 'u_tenant_admin',
  roles: [],
  permissions: [],
  method: 'POST',
  path: '/api/v1/documents/generate',
  timestamp: new Date().toISOString()
};

const prepareTask = (service: DocumentsService) => {
  service.createNumberingRule('tenant_demo', { documentType: 'default', prefix: 'DOC-' });
  const template = service.createTemplate(
    'tenant_demo',
    'u_tenant_admin',
    { name: 'Contract', templateType: 'contract' },
    ctx
  );
  const version = service.createTemplateVersion('tenant_demo', 'u_tenant_admin', {
    templateId: template.id,
    fileId: 'file_template_v1'
  });
  service.activateTemplateVersion('tenant_demo', version.id);

  return service.generateDocument('tenant_demo', 'u_tenant_admin', {
    idempotencyKey: 'sm-key-1',
    templateId: template.id,
    sourceEntityType: 'group',
    sourceEntityId: 'group_1',
    documentType: 'default'
  });
};

describe('DocumentsService state transitions', () => {
  it('rejects start transition from terminal completed state', () => {
    const service = new DocumentsService(
      new InMemoryDocumentsState(),
      new AuditService(),
      new RealtimeEventsService()
    );
    const task = prepareTask(service);

    service.startTask('tenant_demo', task.id);
    service.completeTask('tenant_demo', task.id, 'file_generated_1');

    expect(() => service.startTask('tenant_demo', task.id)).toThrow(BadRequestException);
  });

  it('keeps final document immutable after archive transition', async () => {
    const service = new DocumentsService(
      new InMemoryDocumentsState(),
      new AuditService(),
      new RealtimeEventsService()
    );
    const task = prepareTask(service);

    service.startTask('tenant_demo', task.id);
    const generated = service.completeTask('tenant_demo', task.id, 'file_generated_1');
    await service.finalizeDocument('tenant_demo', 'u_tenant_admin', generated.id, ctx);
    await service.archiveDocument('tenant_demo', 'u_tenant_admin', generated.id, ctx);

    await expect(
      service.finalizeDocument('tenant_demo', 'u_tenant_admin', generated.id, ctx)
    ).rejects.toThrow(BadRequestException);
  });

  it('marks number reservation as failed when running task fails', () => {
    const service = new DocumentsService(
      new InMemoryDocumentsState(),
      new AuditService(),
      new RealtimeEventsService()
    );
    const task = prepareTask(service);

    const running = service.startTask('tenant_demo', task.id);
    service.failTask('tenant_demo', task.id, 'renderer failed');

    expect(service.getReservation('tenant_demo', running.numberReservationId!).status).toBe(
      'failed'
    );
  });
});
