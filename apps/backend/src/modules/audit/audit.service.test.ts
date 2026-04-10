import { describe, expect, it, vi } from 'vitest';

import { AuditService } from './audit.service.js';

describe('AuditService', () => {
  it('writes in-memory record with generated id and timestamp', () => {
    const service = new AuditService();

    const created = service.write({
      tenantId: 'tenant_demo',
      actorId: 'u_admin',
      action: 'documents.template_created',
      entityType: 'documents.template',
      entityId: 'tpl_1',
      requestId: 'req_1'
    });

    expect(created.id).toMatch(/^audit_/);
    expect(created.createdAt).toBeTruthy();
    expect(created.tenantId).toBe('tenant_demo');
    expect(created.action).toBe('documents.template_created');
  });

  it('persists audit row through database adapter when provided', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const service = new AuditService({ query } as never);

    const created = service.write({
      tenantId: 'tenant_demo',
      actorId: 'u_admin',
      action: 'documents.template_updated',
      entityType: 'documents.template',
      entityId: 'tpl_2',
      oldValues: { name: 'old' },
      newValues: { name: 'new' },
      requestId: 'req_2',
      ip: '127.0.0.1',
      userAgent: 'vitest'
    });

    await Promise.resolve();
    expect(query).toHaveBeenCalledTimes(1);
    const args = query.mock.calls[0]?.[1] as unknown[];
    expect(args[0]).toBe(created.id);
    expect(args[1]).toBe('tenant_demo');
    expect(args[3]).toBe('documents.template_updated');
  });
});
