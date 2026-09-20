import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { RemindersSchedulerService } from './reminders-scheduler.service.js';

function makeDb(locked = true) {
  return {
    withTransaction: async (cb: (client: unknown) => Promise<void>) => cb({}),
    query: vi.fn().mockResolvedValue([{ locked }])
  };
}

function make(opts: { locked?: boolean; tenantIds?: string[] } = {}) {
  const recertScanner = {
    scanTenant: vi.fn().mockResolvedValue({ draftsCreated: 0, emailsDispatched: 0 })
  };
  const deadlineScanner = { scanTenant: vi.fn().mockResolvedValue({ remindersDispatched: 0 }) };
  const licenseScanner = { scanTenant: vi.fn().mockResolvedValue({ remindersDispatched: 0 }) };
  /* ТЗ 11.3 + 10.4: сканер повторной проверки знаний — четвёртый в ночном обходе. */
  const retestScanner = { scanTenant: vi.fn().mockResolvedValue({ remindersDispatched: 0 }) };
  const mvpRunner = {
    runWithTenantState: async (_t: string, fn: (state: unknown) => Promise<unknown>) => fn({})
  };
  const tenants = {
    listActiveTenantIds: vi.fn().mockResolvedValue(opts.tenantIds ?? ['t1', 't2'])
  };
  const db = makeDb(opts.locked ?? true);
  const service = new RemindersSchedulerService(
    tenants as never,
    mvpRunner as never,
    recertScanner as never,
    deadlineScanner as never,
    licenseScanner as never,
    retestScanner as never,
    db as never
  );
  return { service, recertScanner, deadlineScanner, licenseScanner, retestScanner, tenants, db };
}

describe('RemindersSchedulerService.runScanAllTenants', () => {
  it('runs all scanners once per active tenant when the lock is acquired', async () => {
    const { service, recertScanner, deadlineScanner, licenseScanner, retestScanner, tenants } =
      make();
    await service.runScanAllTenants('2026-06-05');
    expect(tenants.listActiveTenantIds).toHaveBeenCalledTimes(1);
    expect(recertScanner.scanTenant).toHaveBeenCalledTimes(2);
    expect(deadlineScanner.scanTenant).toHaveBeenCalledTimes(2);
    expect(licenseScanner.scanTenant).toHaveBeenCalledTimes(2);
    /*
     * ТЗ 11.3 + 10.4: сканер повторной проверки обязан ходить в том же ночном обходе.
     * Без этой строки он мог бы быть объявлен, зарегистрирован — и не вызван ни разу: ровно
     * так и вышло с самими порогами, которые лежали в настройках, пока сканера не было.
     */
    expect(retestScanner.scanTenant).toHaveBeenCalledTimes(2);
  });

  it('skips scanning entirely when the advisory lock is held by another instance', async () => {
    const { service, recertScanner, tenants } = make({ locked: false });
    await service.runScanAllTenants('2026-06-05');
    expect(tenants.listActiveTenantIds).not.toHaveBeenCalled();
    expect(recertScanner.scanTenant).not.toHaveBeenCalled();
  });

  it('continues to the next tenant when one tenant throws (partial success)', async () => {
    const { service, recertScanner, deadlineScanner } = make({ tenantIds: ['bad', 'good'] });
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    recertScanner.scanTenant.mockImplementation(async (tenantId: string) => {
      if (tenantId === 'bad') throw new Error('boom');
      return { draftsCreated: 0, emailsDispatched: 0 };
    });
    await service.runScanAllTenants('2026-06-05');
    expect(recertScanner.scanTenant).toHaveBeenCalledTimes(2);
    expect(deadlineScanner.scanTenant).toHaveBeenCalledWith(
      'good',
      '2026-06-05',
      expect.anything()
    );
    errorSpy.mockRestore();
  });

  it('propagates an error from listActiveTenantIds so the lock transaction rolls back', async () => {
    const { service, tenants } = make();
    tenants.listActiveTenantIds.mockRejectedValue(new Error('db down'));
    await expect(service.runScanAllTenants('2026-06-05')).rejects.toThrow('db down');
  });
});

describe('RemindersSchedulerService.handleDailyScan', () => {
  it('does nothing when RECERTIFICATION_SCAN_ENABLED is false (default)', async () => {
    const { service, tenants } = make();
    await service.handleDailyScan();
    expect(tenants.listActiveTenantIds).not.toHaveBeenCalled();
  });
});
