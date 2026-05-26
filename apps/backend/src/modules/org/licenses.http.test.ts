import { describe, expect, it } from 'vitest';

import { InMemoryOrgState } from './in-memory-org.state.js';
import { LicensesController } from './licenses.controller.js';
import { LicensesService } from './licenses.service.js';
import { AuditService } from '../audit/audit.service.js';

import type { RequestContext } from '../../common/context/request-context.js';

const ctx: RequestContext = {
  requestId: 'req_1',
  correlationId: 'corr_1',
  tenantId: 'tenant_demo',
  userId: 'u_admin',
  ip: '127.0.0.1',
  userAgent: 'vitest'
};

function makeController(): LicensesController {
  const service = new LicensesService(new InMemoryOrgState(), new AuditService());
  return new LicensesController(service);
}

const baseRequest = {
  licenseType: 'education_license' as const,
  licenseNumber: 'L-001',
  issuerName: 'Рособрнадзор',
  issuedAt: '2024-01-15'
};

describe('LicensesController — HTTP (Plan C §5.10)', () => {
  it('POST /admin/licenses creates license and returns entity', () => {
    const controller = makeController();
    const created = controller.create(ctx, baseRequest);
    expect(created.id).toBeDefined();
    expect(created.status).toBe('active');
  });

  it('POST /admin/licenses rejects invalid licenseType via DTO validation', () => {
    const controller = makeController();
    expect(() =>
      controller.create(ctx, { ...baseRequest, licenseType: 'fake_type' as never })
    ).toThrow();
  });

  it('GET /admin/licenses returns items array', () => {
    const controller = makeController();
    controller.create(ctx, baseRequest);
    const list = controller.list(ctx);
    expect(list.items).toHaveLength(1);
  });

  it('GET /admin/licenses filters by status query', () => {
    const controller = makeController();
    const created = controller.create(ctx, baseRequest);
    controller.revoke(ctx, created.id);
    expect(controller.list(ctx, 'active').items).toHaveLength(0);
    expect(controller.list(ctx, 'revoked').items).toHaveLength(1);
  });

  it('GET /admin/licenses/:id returns license', () => {
    const controller = makeController();
    const created = controller.create(ctx, baseRequest);
    const fetched = controller.get(ctx, created.id);
    expect(fetched.id).toBe(created.id);
  });

  it('PATCH /admin/licenses/:id updates fields', () => {
    const controller = makeController();
    const created = controller.create(ctx, baseRequest);
    const updated = controller.update(ctx, created.id, { notes: 'review pending' });
    expect(updated.notes).toBe('review pending');
  });

  it('POST /admin/licenses/:id/revoke transitions status to revoked', () => {
    const controller = makeController();
    const created = controller.create(ctx, baseRequest);
    const revoked = controller.revoke(ctx, created.id);
    expect(revoked.status).toBe('revoked');
  });
});
