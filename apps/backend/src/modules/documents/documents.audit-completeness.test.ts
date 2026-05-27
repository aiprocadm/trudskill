import { describe, expect, it } from 'vitest';

import { DocumentsService } from './documents.service.js';
import { InMemoryDocumentsState } from './in-memory-documents.state.js';
import { AuditService } from '../audit/audit.service.js';
import { RealtimeEventsService } from '../core/realtime-events.service.js';

import type { RequestContext } from '../../common/context/request-context.js';

const ctx: RequestContext = {
  requestId: 'r1',
  correlationId: 'c1',
  tenantId: 't1',
  userId: 'u1',
  ip: '127.0.0.1',
  userAgent: 'vitest'
};

function makeServiceWithDoc() {
  const state = new InMemoryDocumentsState();
  const audit = new AuditService();
  const service = new DocumentsService(state, audit, new RealtimeEventsService());
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
      idempotencyKey: 'finalize-1',
      templateId: template.id,
      sourceEntityType: 'group',
      sourceEntityId: 'g1',
      documentType: 'default'
    },
    ctx
  );
  const generated = service.completeTask('t1', task.id, 'file_2', 'u1');
  return { state, audit, service, generated };
}

describe('Audit completeness — finalizeDocument', () => {
  it('emits writeCritical audit-event on finalize', async () => {
    const { audit, service, generated } = makeServiceWithDoc();
    await service.finalizeDocument('t1', 'u1', generated.id, ctx);
    const events = await audit.list('t1');
    const finalized = events.filter((e) => e.action === 'documents.finalized');
    expect(finalized).toHaveLength(1);
    expect(finalized[0]).toMatchObject({
      entityType: 'documents.generated',
      entityId: generated.id,
      actorId: 'u1',
      tenantId: 't1'
    });
    expect(finalized[0].newValues).toMatchObject({ status: 'final', isFinal: true });
    expect(finalized[0].oldValues).toMatchObject({ status: 'generated', isFinal: false });
    expect(finalized[0].metadata).toMatchObject({ correlation_id: 'c1' });
    expect(finalized[0].ip).toBe('127.0.0.1');
    expect(finalized[0].userAgent).toBe('vitest');
    expect(finalized[0].requestId).toBe('r1');
  });
});
