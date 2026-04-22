import { describe, expect, it, vi } from 'vitest';

import { MvpWriteOrchestrator } from './mvp-write.orchestrator.js';

const tenantId = 'tenant-1';
const state = {} as never;

describe('MvpWriteOrchestrator', () => {
  it('writes normalized first and legacy second when dual-write is enabled', async () => {
    const logger = { error: vi.fn() } as never;
    const orchestrator = new MvpWriteOrchestrator(logger);
    const callOrder: string[] = [];

    await orchestrator.persist({
      tenantId,
      state,
      dualWriteEnabled: true,
      writeNormalized: async () => {
        callOrder.push('normalized');
      },
      writeLegacy: async () => {
        callOrder.push('legacy');
      },
      compensateNormalizedWrite: async () => {
        callOrder.push('compensate');
      },
      logReconciliationIssue: async () => {
        callOrder.push('log');
      }
    });

    expect(callOrder).toEqual(['normalized', 'legacy']);
  });

  it('logs and compensates when legacy write fails after normalized success', async () => {
    const logger = { error: vi.fn() } as never;
    const orchestrator = new MvpWriteOrchestrator(logger);
    const reconciliationLogs: string[] = [];

    await expect(
      orchestrator.persist({
        tenantId,
        state,
        dualWriteEnabled: true,
        writeNormalized: async () => undefined,
        writeLegacy: async () => {
          throw new Error('legacy failed');
        },
        compensateNormalizedWrite: async () => undefined,
        logReconciliationIssue: async (_tenant, payload) => {
          reconciliationLogs.push(payload.issueType);
        }
      })
    ).rejects.toThrow('legacy failed');

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(reconciliationLogs).toContain('dual_write_partial_failure');
  });
});
