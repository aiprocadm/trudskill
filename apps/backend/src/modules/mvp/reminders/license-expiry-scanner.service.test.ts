import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { LicenseExpiryScanner } from './license-expiry-scanner.service.js';

const ASOF = '2026-06-05';

function license(over: Record<string, unknown> = {}) {
  return {
    id: 'lic1',
    tenantId: 't1',
    licenseType: 'education_license',
    licenseNumber: 'L-001',
    issuerName: 'Рособрнадзор',
    issuedAt: '2020-01-01',
    validUntil: '2026-08-20', // 76 days out → 90-day milestone
    status: 'active',
    createdAt: '2020-01-01T00:00:00.000Z',
    updatedAt: '2020-01-01T00:00:00.000Z',
    ...over
  };
}

function stateWithStaff(emails: string[] = ['admin@uc.ru']) {
  return { notificationStaffRecipients: emails.map((email) => ({ tenantId: 't1', email })) };
}

function make(opts: { dispatch?: ReturnType<typeof vi.fn>; expiring?: unknown[] } = {}) {
  const dispatch = opts.dispatch ?? vi.fn().mockResolvedValue(undefined);
  const findActiveExpiringBefore = vi.fn().mockResolvedValue(opts.expiring ?? [license()]);
  const scanner = new LicenseExpiryScanner(
    { findActiveExpiringBefore } as never,
    { dispatch } as never
  );
  return { scanner, dispatch, findActiveExpiringBefore };
}

describe('LicenseExpiryScanner.scanTenant', () => {
  it('dispatches license_expiring to staff with the 90-day dedupKey and license vars', async () => {
    const { scanner, dispatch } = make();
    const summary = await scanner.scanTenant('t1', ASOF, stateWithStaff() as never);
    expect(summary.remindersDispatched).toBe(1);
    const arg = dispatch.mock.calls[0]![0];
    expect(arg.templateKey).toBe('license_expiring');
    expect(arg.recipients).toEqual([{ email: 'admin@uc.ru', kind: 'admin' }]);
    expect(arg.variables.licenseNumber).toBe('L-001');
    expect(arg.variables.validUntil).toBe('2026-08-20');
    expect(arg.dedupKey).toBe('license:lic1:90');
  });

  it('does nothing when no staff recipients are configured (opt-in)', async () => {
    const { scanner, dispatch, findActiveExpiringBefore } = make();
    const summary = await scanner.scanTenant('t1', ASOF, {
      notificationStaffRecipients: []
    } as never);
    expect(summary.remindersDispatched).toBe(0);
    expect(dispatch).not.toHaveBeenCalled();
    expect(findActiveExpiringBefore).not.toHaveBeenCalled();
  });

  it('skips a license still beyond the largest milestone (no dispatch)', async () => {
    const { scanner, dispatch } = make({ expiring: [license({ validUntil: '2026-11-01' })] });
    const summary = await scanner.scanTenant('t1', ASOF, stateWithStaff() as never);
    expect(summary.remindersDispatched).toBe(0);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('uses the 7-day dedupKey for an already-expired license', async () => {
    const { scanner, dispatch } = make({ expiring: [license({ validUntil: '2026-01-01' })] });
    await scanner.scanTenant('t1', ASOF, stateWithStaff() as never);
    expect(dispatch.mock.calls[0]![0].dedupKey).toBe('license:lic1:7');
  });

  it('tolerates a dispatch failure without throwing', async () => {
    const dispatch = vi.fn().mockRejectedValue(new Error('smtp down'));
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { scanner } = make({ dispatch });
    const summary = await scanner.scanTenant('t1', ASOF, stateWithStaff() as never);
    expect(summary.remindersDispatched).toBe(0);
    errorSpy.mockRestore();
  });
});
