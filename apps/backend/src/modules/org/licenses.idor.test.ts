import { NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { InMemoryOrgState } from './in-memory-org.state.js';
import { LicensesService } from './licenses.service.js';
import { AuditService } from '../audit/audit.service.js';

import type { RequestContext } from '../../common/context/request-context.js';

const ctxA: RequestContext = {
  requestId: 'r',
  correlationId: 'c',
  tenantId: 'tA',
  userId: 'aa',
  ip: '127.0.0.1',
  userAgent: 'vt'
};
const ctxB: RequestContext = {
  requestId: 'r',
  correlationId: 'c',
  tenantId: 'tB',
  userId: 'ab',
  ip: '127.0.0.1',
  userAgent: 'vt'
};

function makeService() {
  return new LicensesService(new InMemoryOrgState(), new AuditService());
}

describe('IDOR — licenses :id endpoints reject cross-tenant', () => {
  it('get: tenantB cannot read license of tenantA', async () => {
    const service = makeService();
    const lic = await service.create(
      'tA',
      'aa',
      {
        licenseType: 'general',
        licenseNumber: 'L',
        issuerName: 'M',
        issuedAt: '2026-01-01'
      },
      ctxA
    );
    expect(() => service.get('tB', lic.id)).toThrow(NotFoundException);
  });

  it('update: tenantB cannot update license of tenantA', async () => {
    const service = makeService();
    const lic = await service.create(
      'tA',
      'aa',
      {
        licenseType: 'general',
        licenseNumber: 'L',
        issuerName: 'M',
        issuedAt: '2026-01-01'
      },
      ctxA
    );
    await expect(service.update('tB', 'ab', lic.id, { notes: 'hijack' }, ctxB)).rejects.toThrow(
      NotFoundException
    );
  });

  it('revoke: tenantB cannot revoke license of tenantA', async () => {
    const service = makeService();
    const lic = await service.create(
      'tA',
      'aa',
      {
        licenseType: 'general',
        licenseNumber: 'L',
        issuerName: 'M',
        issuedAt: '2026-01-01'
      },
      ctxA
    );
    await expect(service.revoke('tB', 'ab', lic.id, ctxB)).rejects.toThrow(NotFoundException);
  });

  it('list: tenantB не видит лицензии tenantA', async () => {
    const service = makeService();
    await service.create(
      'tA',
      'aa',
      {
        licenseType: 'general',
        licenseNumber: 'L1',
        issuerName: 'M',
        issuedAt: '2026-01-01'
      },
      ctxA
    );
    await service.create(
      'tB',
      'ab',
      {
        licenseType: 'general',
        licenseNumber: 'L2',
        issuerName: 'M',
        issuedAt: '2026-01-01'
      },
      ctxB
    );
    expect(service.list('tA').map((l) => l.licenseNumber)).toEqual(['L1']);
    expect(service.list('tB').map((l) => l.licenseNumber)).toEqual(['L2']);
  });
});
