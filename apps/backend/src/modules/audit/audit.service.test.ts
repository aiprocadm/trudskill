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

  it('scopes list to tenantId and returns empty when tenant is omitted', async () => {
    const service = new AuditService();
    service.write({
      tenantId: 'tenant_a',
      actorId: 'u1',
      action: 'test.action_a',
      entityType: 'x',
      entityId: '1'
    });
    service.write({
      tenantId: 'tenant_b',
      actorId: 'u2',
      action: 'test.action_b',
      entityType: 'x',
      entityId: '2'
    });

    const a = await service.list('tenant_a');
    expect(a).toHaveLength(1);
    expect(a[0]?.action).toBe('test.action_a');

    const b = await service.list('tenant_b');
    expect(b).toHaveLength(1);
    expect(b[0]?.action).toBe('test.action_b');

    expect(await service.list()).toEqual([]);
    expect(await service.list('')).toEqual([]);
    expect(await service.list('   ')).toEqual([]);
  });

  it('uses strict tenant filter in SQL path', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const service = new AuditService({ query } as never);

    await service.list('tenant_demo');

    expect(query).toHaveBeenCalledTimes(1);
    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('tenant_id = $1');
    expect(sql).not.toMatch(/\$\s*1::\s*text\s+is\s+null/i);
    expect((query.mock.calls[0]?.[1] as unknown[])[0]).toBe('tenant_demo');
  });
});
