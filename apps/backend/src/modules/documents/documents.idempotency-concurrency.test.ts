import { describe, expect, it } from 'vitest';

import { DocumentsService } from './documents.service.js';
import { InMemoryDocumentsState } from './in-memory-documents.state.js';
import { AuditService } from '../audit/audit.service.js';
import { RealtimeEventsService } from '../core/realtime-events.service.js';

import type { RequestContext } from '../../common/context/request-context.js';

const ctx: RequestContext = {
  requestId: 'r',
  correlationId: 'c',
  tenantId: 't1',
  userId: 'u1',
  ip: '127.0.0.1',
  userAgent: 'vt'
};

function setupOrderableState() {
  const state = new InMemoryDocumentsState();
  const audit = new AuditService();
  const service = new DocumentsService(state, audit, new RealtimeEventsService());
  const orderTpl = service.createTemplate(
    't1',
    'u1',
    { name: 'Order', templateType: 'order' },
    ctx
  );
  const v = service.createTemplateVersion('t1', 'u1', { templateId: orderTpl.id, fileId: 'f' });
  service.activateTemplateVersion('t1', 'u1', v.id, ctx);
  return { state, audit, service, orderTpl };
}

describe('Idempotency — issueGroupOrder concurrent calls', () => {
  it('30 parallel calls with same (groupId, templateId) produce ONE order', async () => {
    const { service, orderTpl } = setupOrderableState();
    const results = await Promise.all(
      Array.from({ length: 30 }, () =>
        service.issueGroupOrder(
          't1',
          'u1',
          { groupId: 'g1', templateId: orderTpl.id, enrollmentIds: [] },
          ctx
        )
      )
    );
    const uniqueIds = new Set(results.map((r) => r.order.id));
    expect(uniqueIds.size).toBe(1);
    expect(results.filter((r) => r.alreadyExisted).length).toBe(29);
  });

  it('different (groupId, templateId) pairs produce different orders', async () => {
    const { service, orderTpl } = setupOrderableState();
    const a = await service.issueGroupOrder(
      't1',
      'u1',
      { groupId: 'g1', templateId: orderTpl.id, enrollmentIds: [] },
      ctx
    );
    const b = await service.issueGroupOrder(
      't1',
      'u1',
      { groupId: 'g2', templateId: orderTpl.id, enrollmentIds: [] },
      ctx
    );
    expect(a.order.id).not.toBe(b.order.id);
  });
});
