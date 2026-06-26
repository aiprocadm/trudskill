import { describe, expect, it } from 'vitest';

import { InMemoryLicensesRepository } from './in-memory-licenses.repository.js';
import { LicensesService } from './licenses.service.js';
import { AuditService } from '../audit/audit.service.js';

import type { RequestContext } from '../../common/context/request-context.js';

const ctx: RequestContext = {
  requestId: 'r1',
  correlationId: 'c1',
  tenantId: 't1',
  userId: 'u1',
  ip: '127.0.0.1',
  userAgent: 'vitest'
};

function makeService() {
  const repo = new InMemoryLicensesRepository();
  const audit = new AuditService();
  const service = new LicensesService(repo, audit);
  return { repo, audit, service };
}

describe('Licenses audit — writeCritical on create/update/revoke', () => {
  it('awaits audit on create', async () => {
    const { audit, service } = makeService();
    let awaited = false;
    const orig = audit.writeCritical.bind(audit);
    audit.writeCritical = async (...args) => {
      await new Promise((r) => setTimeout(r, 5));
      awaited = true;
      return orig(...args);
    };
    await service.create(
      't1',
      'u1',
      {
        licenseType: 'general',
        licenseNumber: 'L-1',
        issuerName: 'Минобр',
        issuedAt: '2026-01-01'
      },
      ctx
    );
    expect(awaited).toBe(true);
    const events = await audit.list('t1');
    expect(events.find((e) => e.action === 'org.license_created')).toBeDefined();
  });

  it('awaits audit on update', async () => {
    const { audit, service } = makeService();
    const lic = await service.create(
      't1',
      'u1',
      {
        licenseType: 'general',
        licenseNumber: 'L-2',
        issuerName: 'Минобр',
        issuedAt: '2026-01-01'
      },
      ctx
    );
    let awaited = false;
    const orig = audit.writeCritical.bind(audit);
    audit.writeCritical = async (...args) => {
      await new Promise((r) => setTimeout(r, 5));
      awaited = true;
      return orig(...args);
    };
    await service.update('t1', 'u1', lic.id, { notes: 'check' }, ctx);
    expect(awaited).toBe(true);
  });

  it('awaits audit on revoke', async () => {
    const { audit, service } = makeService();
    const lic = await service.create(
      't1',
      'u1',
      {
        licenseType: 'general',
        licenseNumber: 'L-3',
        issuerName: 'Минобр',
        issuedAt: '2026-01-01'
      },
      ctx
    );
    let awaited = false;
    const orig = audit.writeCritical.bind(audit);
    audit.writeCritical = async (...args) => {
      await new Promise((r) => setTimeout(r, 5));
      awaited = true;
      return orig(...args);
    };
    await service.revoke('t1', 'u1', lic.id, ctx);
    expect(awaited).toBe(true);
  });
});
