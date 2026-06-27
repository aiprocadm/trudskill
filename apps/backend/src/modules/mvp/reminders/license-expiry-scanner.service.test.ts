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
  const dispatch =
    opts.dispatch ??
    vi
      .fn()
      .mockImplementation((input) =>
        Promise.resolve({ sent: input.recipients.length, skipped: 0, failed: 0 })
      );
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
    expect(arg.dedupKey).toBe('license:lic1:2026-08-20:90');
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
    expect(dispatch.mock.calls[0]![0].dedupKey).toBe('license:lic1:2026-01-01:7');
  });

  it('renewed license (new validUntil) re-reminds at the same milestone', async () => {
    // Term A: validUntil '2026-08-20', asOf '2026-06-05' → 76 days out → milestone 90
    // (2026-06-05 + 90 = 2026-09-03 ≥ 2026-08-20 ✓)
    const termAValidUntil = '2026-08-20';
    // Term B: validUntil '2027-08-20', asOf '2027-05-22' → 90 days out exactly → milestone 90
    // (2027-05-22 + 90 = 2027-08-20 ≥ 2027-08-20 ✓)
    const termBValidUntil = '2027-08-20';
    const asOfB = '2027-05-22';

    const dispatchA = vi
      .fn()
      .mockImplementation((input) =>
        Promise.resolve({ sent: input.recipients.length, skipped: 0, failed: 0 })
      );
    const { scanner: scannerA } = make({
      dispatch: dispatchA,
      expiring: [license({ validUntil: termAValidUntil })]
    });
    await scannerA.scanTenant('t1', ASOF, stateWithStaff() as never);
    const dedupKeyA: string = dispatchA.mock.calls[0]![0].dedupKey;

    const dispatchB = vi
      .fn()
      .mockImplementation((input) =>
        Promise.resolve({ sent: input.recipients.length, skipped: 0, failed: 0 })
      );
    const { scanner: scannerB } = make({
      dispatch: dispatchB,
      expiring: [license({ validUntil: termBValidUntil })]
    });
    await scannerB.scanTenant('t1', asOfB, stateWithStaff() as never);
    const dedupKeyB: string = dispatchB.mock.calls[0]![0].dedupKey;

    // Both hits are at milestone 90, same license id — but DIFFERENT validUntil → must differ
    expect(dedupKeyA).toBe(`license:lic1:${termAValidUntil}:90`);
    expect(dedupKeyB).toBe(`license:lic1:${termBValidUntil}:90`);
    expect(dedupKeyA).not.toBe(dedupKeyB);
  });

  it('tolerates a dispatch failure without throwing', async () => {
    const dispatch = vi.fn().mockRejectedValue(new Error('smtp down'));
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { scanner } = make({ dispatch });
    const summary = await scanner.scanTenant('t1', ASOF, stateWithStaff() as never);
    expect(summary.remindersDispatched).toBe(0);
    errorSpy.mockRestore();
  });

  it('a fully-deduped re-dispatch does not overcount (audit tail regression)', async () => {
    // Simulate the dispatcher returning sent:0 when all recipients were already delivered.
    const dispatch = vi.fn().mockResolvedValue({ sent: 0, skipped: 1, failed: 0 });
    const { scanner } = make({ dispatch });
    const summary = await scanner.scanTenant('t1', ASOF, stateWithStaff() as never);
    // Despite having 1 recipient in the roster, the counter must reflect actual sends (0).
    expect(summary.remindersDispatched).toBe(0);
  });
});
