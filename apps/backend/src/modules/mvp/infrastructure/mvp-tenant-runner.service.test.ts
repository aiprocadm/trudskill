import { describe, expect, it, vi } from 'vitest';

import { InMemoryMvpState } from './in-memory-mvp.state.js';
import { MvpTenantRunner } from './mvp-tenant-runner.service.js';
import { TenantSerialGateway } from '../../../infrastructure/request/tenant-serial.gateway.js';

describe('MvpTenantRunner', () => {
  it('loads the tenant state, runs the callback with it, and does not save', async () => {
    const loadIntoState = vi.fn(async (_tenantId: string, state: InMemoryMvpState) => {
      state.enrollments.push({
        id: 'enr1',
        tenantId: 't1',
        groupId: 'g1',
        learnerId: 'l1',
        status: 'active',
        enrolledAt: '2026-01-01T00:00:00.000Z'
      } as never);
    });
    const saveFromState = vi.fn();
    const persistence = { loadIntoState, saveFromState };
    const runner = new MvpTenantRunner(persistence as never, new TenantSerialGateway());

    const ids = await runner.runWithTenantState('t1', async (state) =>
      state.enrollments.map((e) => e.id)
    );

    expect(loadIntoState).toHaveBeenCalledWith('t1', expect.any(InMemoryMvpState));
    expect(ids).toEqual(['enr1']);
    expect(saveFromState).not.toHaveBeenCalled();
  });
});
