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

describe('MvpTenantRunner.runWithTenantStateAndSave', () => {
  function makeWriteRunner() {
    const loadIntoState = vi.fn(async () => undefined);
    const saveFromState = vi.fn(async () => undefined);
    const persistence = { loadIntoState, saveFromState };
    const runner = new MvpTenantRunner(persistence as never, new TenantSerialGateway());
    return { runner, loadIntoState, saveFromState };
  }

  it('(a) calls saveFromState after the callback with the mutated state', async () => {
    const { runner, saveFromState } = makeWriteRunner();

    await runner.runWithTenantStateAndSave('t1', async (state) => {
      // Simulate a mutation (e.g. identity retention stamp)
      (state as unknown as { __marker: string }).__marker = 'mutated';
    });

    expect(saveFromState).toHaveBeenCalledTimes(1);
    const [savedTenantId, savedState] = saveFromState.mock.calls[0]!;
    expect(savedTenantId).toBe('t1');
    expect((savedState as unknown as { __marker: string }).__marker).toBe('mutated');
  });

  it('(b) saves even when the callback throws (finally semantics — partial purge progress must persist)', async () => {
    // Rationale: imagesPurgedAt stamps are only set AFTER successful per-record deletes.
    // If the callback throws unexpectedly mid-loop, any stamps already written to state
    // must be persisted so the next run's idempotent check skips already-purged records.
    const { runner, saveFromState } = makeWriteRunner();

    await expect(
      runner.runWithTenantStateAndSave('t1', async (state) => {
        (state as unknown as { __marker: string }).__marker = 'partial';
        throw new Error('unexpected failure');
      })
    ).rejects.toThrow('unexpected failure');

    // Save must still have been called with the partially-mutated state
    expect(saveFromState).toHaveBeenCalledTimes(1);
    const [, savedState] = saveFromState.mock.calls[0]!;
    expect((savedState as unknown as { __marker: string }).__marker).toBe('partial');
  });
});
