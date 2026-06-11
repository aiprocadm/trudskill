import { describe, expect, it, vi } from 'vitest';

import { ProctoringRetentionSchedulerService } from './proctoring-retention-scheduler.service.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';

import type { ProctoringRetentionScanner } from './proctoring-retention-scanner.service.js';
import type { DatabaseService } from '../../../infrastructure/database/database.service.js';
import type { TenantService } from '../../tenant/tenant.service.js';
import type { MvpTenantRunner } from '../infrastructure/mvp-tenant-runner.service.js';

function makeScheduler(locked = true, tenantIds = ['t1', 't2']) {
  const db = {
    withTransaction: vi.fn(async (fn: (client: unknown) => Promise<void>) => fn({})),
    query: vi.fn(async () => [{ locked }])
  };
  const tenants = { listActiveTenantIds: vi.fn(async () => tenantIds) };
  const runner = {
    runWithTenantState: vi.fn(),
    runWithTenantStateAndSave: vi.fn(
      async (_tenantId: string, fn: (state: InMemoryMvpState) => Promise<number>) =>
        fn(new InMemoryMvpState())
    )
  };
  const scanner = { scanTenant: vi.fn(async () => 0) };
  const scheduler = new ProctoringRetentionSchedulerService(
    tenants as unknown as TenantService,
    runner as unknown as MvpTenantRunner,
    scanner as unknown as ProctoringRetentionScanner,
    db as unknown as DatabaseService
  );
  return { scheduler, db, tenants, runner, scanner };
}

describe('ProctoringRetentionSchedulerService', () => {
  it('uses the WRITE-mode tenant runner (runWithTenantStateAndSave) — never read-only', async () => {
    const { scheduler, runner, scanner } = makeScheduler();
    await scheduler.runPurgeAllTenants('2027-06-11');
    expect(runner.runWithTenantStateAndSave).toHaveBeenCalledTimes(2);
    expect(runner.runWithTenantState).not.toHaveBeenCalled(); // CRITICAL Plan A lesson
    expect(scanner.scanTenant).toHaveBeenCalledWith('t1', '2027-06-11', expect.anything());
    expect(scanner.scanTenant).toHaveBeenCalledWith('t2', '2027-06-11', expect.anything());
  });

  it('skips entirely when another instance holds the advisory lock', async () => {
    const { scheduler, runner, tenants } = makeScheduler(false);
    await scheduler.runPurgeAllTenants('2027-06-11');
    expect(tenants.listActiveTenantIds).not.toHaveBeenCalled();
    expect(runner.runWithTenantStateAndSave).not.toHaveBeenCalled();
  });

  it("one tenant's failure does not abort the batch", async () => {
    const { scheduler, runner } = makeScheduler();
    runner.runWithTenantStateAndSave.mockRejectedValueOnce(new Error('tenant t1 exploded'));
    await expect(scheduler.runPurgeAllTenants('2027-06-11')).resolves.toBeUndefined();
    expect(runner.runWithTenantStateAndSave).toHaveBeenCalledTimes(2);
  });
});
