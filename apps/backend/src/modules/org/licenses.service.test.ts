import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { InMemoryOrgState } from './in-memory-org.state.js';
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

function makeService(): LicensesService {
  return new LicensesService(new InMemoryOrgState(), new AuditService());
}

const baseRequest = {
  licenseType: 'education_license' as const,
  licenseNumber: 'L-001',
  issuerName: 'Рособрнадзор',
  issuedAt: '2024-01-15'
};

describe('LicensesService — CRUD (Plan C §5.10)', () => {
  it('creates active license with required fields only', async () => {
    const service = makeService();
    const license = await service.create('tenant_demo', ctx.userId, baseRequest, ctx);
    expect(license.status).toBe('active');
    expect(license.tenantId).toBe('tenant_demo');
    expect(license.licenseNumber).toBe('L-001');
    expect(license.permittedTrainingTypes).toBeUndefined();
    expect(license.permittedDirections).toBeUndefined();
  });

  it('persists permittedTrainingTypes and permittedDirections when supplied', async () => {
    const service = makeService();
    const license = await service.create(
      'tenant_demo',
      ctx.userId,
      {
        ...baseRequest,
        permittedTrainingTypes: ['primary', 'repeat'],
        permittedDirections: ['dir_ot']
      },
      ctx
    );
    expect(license.permittedTrainingTypes).toEqual(['primary', 'repeat']);
    expect(license.permittedDirections).toEqual(['dir_ot']);
  });

  it('normalizes empty permitted arrays to undefined (universal license)', async () => {
    const service = makeService();
    const license = await service.create(
      'tenant_demo',
      ctx.userId,
      { ...baseRequest, permittedTrainingTypes: [], permittedDirections: [] },
      ctx
    );
    expect(license.permittedTrainingTypes).toBeUndefined();
    expect(license.permittedDirections).toBeUndefined();
  });

  it('rejects duplicate (licenseType, licenseNumber) within tenant', async () => {
    const service = makeService();
    await service.create('tenant_demo', ctx.userId, baseRequest, ctx);
    await expect(service.create('tenant_demo', ctx.userId, baseRequest, ctx)).rejects.toThrow(
      ConflictException
    );
  });

  it('allows same (licenseType, licenseNumber) in different tenants', async () => {
    const service = makeService();
    await service.create('tenant_a', ctx.userId, baseRequest, ctx);
    const second = await service.create('tenant_b', ctx.userId, baseRequest, ctx);
    expect(second.tenantId).toBe('tenant_b');
  });

  it('rejects validUntil earlier than issuedAt at create', async () => {
    const service = makeService();
    await expect(
      service.create('tenant_demo', ctx.userId, { ...baseRequest, validUntil: '2023-12-31' }, ctx)
    ).rejects.toThrow(BadRequestException);
  });

  it('list returns only licenses of the requesting tenant', async () => {
    const service = makeService();
    await service.create('tenant_a', ctx.userId, baseRequest, ctx);
    await service.create('tenant_b', ctx.userId, baseRequest, ctx);
    expect(service.list('tenant_a')).toHaveLength(1);
    expect(service.list('tenant_a')[0].tenantId).toBe('tenant_a');
  });

  it('list filters by status when provided', async () => {
    const service = makeService();
    const a = await service.create('tenant_demo', ctx.userId, baseRequest, ctx);
    await service.create(
      'tenant_demo',
      ctx.userId,
      { ...baseRequest, licenseNumber: 'L-002' },
      ctx
    );
    await service.revoke('tenant_demo', ctx.userId, a.id, ctx);
    expect(service.list('tenant_demo', 'active')).toHaveLength(1);
    expect(service.list('tenant_demo', 'revoked')).toHaveLength(1);
  });

  it('get throws NotFoundException for unknown id', () => {
    const service = makeService();
    expect(() => service.get('tenant_demo', 'license_nope')).toThrow(NotFoundException);
  });

  it('get throws NotFoundException when license belongs to other tenant (no cross-tenant read)', async () => {
    const service = makeService();
    const license = await service.create('tenant_a', ctx.userId, baseRequest, ctx);
    expect(() => service.get('tenant_b', license.id)).toThrow(NotFoundException);
  });

  it('update patches editable fields', async () => {
    const service = makeService();
    const license = await service.create('tenant_demo', ctx.userId, baseRequest, ctx);
    const updated = await service.update(
      'tenant_demo',
      ctx.userId,
      license.id,
      { validUntil: '2030-01-15', notes: 'продлено' },
      ctx
    );
    expect(updated.validUntil).toBe('2030-01-15');
    expect(updated.notes).toBe('продлено');
  });

  it('update rejects on revoked license', async () => {
    const service = makeService();
    const license = await service.create('tenant_demo', ctx.userId, baseRequest, ctx);
    await service.revoke('tenant_demo', ctx.userId, license.id, ctx);
    await expect(
      service.update('tenant_demo', ctx.userId, license.id, { notes: 'nope' }, ctx)
    ).rejects.toThrow(BadRequestException);
  });

  it('revoke is idempotent', async () => {
    const service = makeService();
    const license = await service.create('tenant_demo', ctx.userId, baseRequest, ctx);
    const first = await service.revoke('tenant_demo', ctx.userId, license.id, ctx);
    const second = await service.revoke('tenant_demo', ctx.userId, license.id, ctx);
    expect(first.status).toBe('revoked');
    expect(second.status).toBe('revoked');
    expect(second.updatedAt).toBe(first.updatedAt);
  });

  it('revoke is tenant-scoped', async () => {
    const service = makeService();
    const license = await service.create('tenant_a', ctx.userId, baseRequest, ctx);
    await expect(service.revoke('tenant_b', ctx.userId, license.id, ctx)).rejects.toThrow(
      NotFoundException
    );
  });
});

describe('LicensesService.findActiveLicensesFor (Plan C §5.10)', () => {
  it('returns universal license (no permitted lists) for any training type', async () => {
    const service = makeService();
    await service.create('tenant_demo', ctx.userId, baseRequest, ctx);
    expect(service.findActiveLicensesFor('tenant_demo', 'primary')).toHaveLength(1);
    expect(service.findActiveLicensesFor('tenant_demo', 'extraordinary', 'dir_x')).toHaveLength(1);
  });

  it('filters by permittedTrainingTypes whitelist', async () => {
    const service = makeService();
    await service.create(
      'tenant_demo',
      ctx.userId,
      { ...baseRequest, permittedTrainingTypes: ['primary'] },
      ctx
    );
    expect(service.findActiveLicensesFor('tenant_demo', 'primary')).toHaveLength(1);
    expect(service.findActiveLicensesFor('tenant_demo', 'repeat')).toHaveLength(0);
  });

  it('filters by permittedDirections whitelist when directionId provided', async () => {
    const service = makeService();
    await service.create(
      'tenant_demo',
      ctx.userId,
      { ...baseRequest, permittedDirections: ['dir_ot'] },
      ctx
    );
    expect(service.findActiveLicensesFor('tenant_demo', 'primary', 'dir_ot')).toHaveLength(1);
    expect(service.findActiveLicensesFor('tenant_demo', 'primary', 'dir_pb')).toHaveLength(0);
  });

  it('rejects when permittedDirections set but directionId not provided', async () => {
    const service = makeService();
    await service.create(
      'tenant_demo',
      ctx.userId,
      { ...baseRequest, permittedDirections: ['dir_ot'] },
      ctx
    );
    expect(service.findActiveLicensesFor('tenant_demo', 'primary')).toHaveLength(0);
  });

  it('excludes revoked licenses', async () => {
    const service = makeService();
    const l = await service.create('tenant_demo', ctx.userId, baseRequest, ctx);
    await service.revoke('tenant_demo', ctx.userId, l.id, ctx);
    expect(service.findActiveLicensesFor('tenant_demo', 'primary')).toHaveLength(0);
  });

  it('is tenant-scoped — other tenant license never matches', async () => {
    const service = makeService();
    await service.create('tenant_a', ctx.userId, baseRequest, ctx);
    expect(service.findActiveLicensesFor('tenant_b', 'primary')).toHaveLength(0);
  });
});
