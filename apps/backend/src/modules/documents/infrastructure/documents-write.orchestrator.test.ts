import { describe, expect, it, vi } from 'vitest';

import { DocumentsWriteOrchestrator } from './documents-write.orchestrator.js';

const tenantId = 'tenant-1';
const state = {} as never;

describe('DocumentsWriteOrchestrator', () => {
  it('writes normalized first and legacy second when dual-write is enabled', async () => {
    const logger = { error: vi.fn() } as never;
    const orchestrator = new DocumentsWriteOrchestrator(logger);
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

  it('logs normalized write failures and does not call compensation', async () => {
    const logger = { error: vi.fn() } as never;
    const orchestrator = new DocumentsWriteOrchestrator(logger);
    const compensation = vi.fn();
    const reconciliationLogs: string[] = [];

    await expect(
      orchestrator.persist({
        tenantId,
        state,
        dualWriteEnabled: true,
        writeNormalized: async () => {
          throw new Error('normalized failed');
        },
        writeLegacy: async () => undefined,
        compensateNormalizedWrite: compensation,
        logReconciliationIssue: async (_tenant, payload) => {
          reconciliationLogs.push(payload.issueType);
        }
      })
    ).rejects.toThrow('normalized failed');

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(compensation).not.toHaveBeenCalled();
    expect(reconciliationLogs).toContain('dual_write_normalized_failed');
  });
});
