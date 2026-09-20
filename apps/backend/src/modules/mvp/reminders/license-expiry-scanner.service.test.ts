import { describe, expect, it, vi } from 'vitest';

import { LicenseExpiryScanner } from './license-expiry-scanner.service.js';
import { ReminderSettingsService } from './reminder-settings.service.js';

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

/*
 * ТЗ 11.3: сканер больше не отправляет сам, а КЛАДЁТ повод в копилку — письма уходят одним на
 * человека в конце обхода. Проверяемые свойства не изменились: кому, о чём и с каким ключом
 * подавления повтора. Устойчивость отправки и подсчёт «сколько ушло на самом деле» переехали
 * в копилку и проверяются её тестом.
 */
function make(opts: { expiring?: unknown[] } = {}) {
  const queued: Array<Record<string, unknown>> = [];
  const queue = vi.fn((_tenantId: string, item: Record<string, unknown>) => {
    queued.push(item);
  });
  const findActiveExpiringBefore = vi.fn().mockResolvedValue(opts.expiring ?? [license()]);
  const scanner = new LicenseExpiryScanner(
    { findActiveExpiringBefore } as never,
    { queue } as never,
    new ReminderSettingsService()
  );
  return { scanner, queue, queued, findActiveExpiringBefore };
}

describe('LicenseExpiryScanner.scanTenant', () => {
  it('queues license_expiring for staff with the 90-day dedupKey and license vars', async () => {
    const { scanner, queued } = make();
    const summary = await scanner.scanTenant('t1', ASOF, stateWithStaff() as never);
    expect(summary.remindersQueued).toBe(1);
    const arg = queued[0]! as {
      templateKey: string;
      variables: { licenseNumber: string; validUntil: string };
      digest: { email: string; recipientKind: string; dedupKey: string };
    };
    expect(arg.templateKey).toBe('license_expiring');
    expect(arg.digest.email).toBe('admin@uc.ru');
    expect(arg.digest.recipientKind).toBe('admin');
    expect(arg.variables.licenseNumber).toBe('L-001');
    expect(arg.variables.validUntil).toBe('2026-08-20');
    expect(arg.digest.dedupKey).toBe('license:lic1:2026-08-20:90');
  });

  it('does nothing when no staff recipients are configured (opt-in)', async () => {
    const { scanner, queue, findActiveExpiringBefore } = make();
    const summary = await scanner.scanTenant('t1', ASOF, {
      notificationStaffRecipients: []
    } as never);
    expect(summary.remindersQueued).toBe(0);
    expect(queue).not.toHaveBeenCalled();
    expect(findActiveExpiringBefore).not.toHaveBeenCalled();
  });

  it('skips a license still beyond the largest milestone (nothing queued)', async () => {
    const { scanner, queue } = make({ expiring: [license({ validUntil: '2026-11-01' })] });
    const summary = await scanner.scanTenant('t1', ASOF, stateWithStaff() as never);
    expect(summary.remindersQueued).toBe(0);
    expect(queue).not.toHaveBeenCalled();
  });

  it('uses the 7-day dedupKey for an already-expired license', async () => {
    const { scanner, queued } = make({ expiring: [license({ validUntil: '2026-01-01' })] });
    await scanner.scanTenant('t1', ASOF, stateWithStaff() as never);
    expect((queued[0]!.digest as { dedupKey: string }).dedupKey).toBe('license:lic1:2026-01-01:7');
  });

  it('renewed license (new validUntil) re-reminds at the same milestone', async () => {
    // Term A: validUntil '2026-08-20', asOf '2026-06-05' → 76 days out → milestone 90
    // (2026-06-05 + 90 = 2026-09-03 ≥ 2026-08-20 ✓)
    const termAValidUntil = '2026-08-20';
    // Term B: validUntil '2027-08-20', asOf '2027-05-22' → 90 days out exactly → milestone 90
    // (2027-05-22 + 90 = 2027-08-20 ≥ 2027-08-20 ✓)
    const termBValidUntil = '2027-08-20';
    const asOfB = '2027-05-22';

    const a = make({ expiring: [license({ validUntil: termAValidUntil })] });
    await a.scanner.scanTenant('t1', ASOF, stateWithStaff() as never);
    const dedupKeyA: string = (a.queued[0]!.digest as { dedupKey: string }).dedupKey;

    const b = make({ expiring: [license({ validUntil: termBValidUntil })] });
    await b.scanner.scanTenant('t1', asOfB, stateWithStaff() as never);
    const dedupKeyB: string = (b.queued[0]!.digest as { dedupKey: string }).dedupKey;

    // Both hits are at milestone 90, same license id — but DIFFERENT validUntil → must differ
    expect(dedupKeyA).toBe(`license:lic1:${termAValidUntil}:90`);
    expect(dedupKeyB).toBe(`license:lic1:${termBValidUntil}:90`);
    expect(dedupKeyA).not.toBe(dedupKeyB);
  });

  it('сводка сканера считает поводы, а не письма (ТЗ 11.3)', async () => {
    /*
     * Прежде здесь проверялись две вещи про ОТПРАВКУ: отказ почтовика не роняет обход и
     * подавленный повтор не завышает счётчик. Обе переехали в копилку вместе с самой
     * отправкой и проверяются её тестом. За сканером осталось своё: он считает то, что
     * положил, и не теряет ни одного повода.
     */
    const { scanner, queued } = make();
    const summary = await scanner.scanTenant('t1', ASOF, stateWithStaff() as never);
    expect(summary.remindersQueued).toBe(queued.length);
  });
});
