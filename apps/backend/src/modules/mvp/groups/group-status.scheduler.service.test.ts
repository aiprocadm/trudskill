import { Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { GroupStatusSchedulerService } from './group-status.scheduler.service.js';

/** Планировщик статусов групп (срез 8.2): замок, обход центров с частичным успехом, выключен по умолчанию. */
function make(opts: { locked?: boolean; tenantIds?: string[] } = {}) {
  const scanner = { scanTenant: vi.fn().mockReturnValue(1) };
  const mvpRunner = {
    runWithTenantStateAndSave: vi.fn(
      async (_t: string, fn: (state: unknown) => Promise<number> | number) => fn({})
    )
  };
  const tenants = {
    listActiveTenantIds: vi.fn().mockResolvedValue(opts.tenantIds ?? ['t1', 't2'])
  };
  const db = {
    withTransaction: async (cb: (client: unknown) => Promise<void>) => cb({}),
    query: vi.fn().mockResolvedValue([{ locked: opts.locked ?? true }])
  };
  const service = new GroupStatusSchedulerService(
    tenants as never,
    mvpRunner as never,
    scanner as never,
    db as never
  );
  return { service, scanner, mvpRunner, tenants };
}

describe('GroupStatusSchedulerService', () => {
  it('под замком обходит все центры через сохранение снимка', async () => {
    const { service, scanner, mvpRunner, tenants } = make();
    await service.runScanAllTenants('2026-09-24T02:00:00.000Z');
    expect(tenants.listActiveTenantIds).toHaveBeenCalledTimes(1);
    expect(mvpRunner.runWithTenantStateAndSave).toHaveBeenCalledTimes(2);
    expect(scanner.scanTenant).toHaveBeenCalledWith(
      't1',
      '2026-09-24T02:00:00.000Z',
      expect.anything()
    );
  });

  it('замок у другого экземпляра — прогон пропускается', async () => {
    const { service, scanner, tenants } = make({ locked: false });
    await service.runScanAllTenants('2026-09-24T02:00:00.000Z');
    expect(tenants.listActiveTenantIds).not.toHaveBeenCalled();
    expect(scanner.scanTenant).not.toHaveBeenCalled();
  });

  it('сбой одного центра не останавливает остальные', async () => {
    const { service, scanner } = make({ tenantIds: ['bad', 'good'] });
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    scanner.scanTenant.mockImplementation((tenantId: string) => {
      if (tenantId === 'bad') throw new Error('boom');
      return 0;
    });
    await service.runScanAllTenants('2026-09-24T02:00:00.000Z');
    expect(scanner.scanTenant).toHaveBeenCalledTimes(2);
    errorSpy.mockRestore();
  });

  it('выключен по умолчанию: ежедневный запуск ничего не делает', async () => {
    const { service, tenants } = make();
    await service.handleDailyScan();
    expect(tenants.listActiveTenantIds).not.toHaveBeenCalled();
  });
});
