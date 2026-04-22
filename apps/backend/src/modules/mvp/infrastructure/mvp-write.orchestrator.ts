import type { InMemoryMvpState } from './in-memory-mvp.state.js';
import type { Logger } from '@nestjs/common';

type WriteCallback = (tenantId: string, state: InMemoryMvpState) => Promise<void>;
type CompensationCallback = (tenantId: string) => Promise<void>;
type ReconciliationLogger = (tenantId: string, payload: ReconciliationPayload) => Promise<void>;

type ReconciliationPayload = {
  issueType: string;
  collection: string;
  entityId: string | null;
  details: unknown;
};

export class MvpWriteOrchestrator {
  constructor(private readonly logger: Logger) {}

  async persist(params: {
    tenantId: string;
    state: InMemoryMvpState;
    dualWriteEnabled: boolean;
    writeLegacy: WriteCallback;
    writeNormalized: WriteCallback;
    compensateNormalizedWrite: CompensationCallback;
    logReconciliationIssue: ReconciliationLogger;
  }): Promise<void> {
    const {
      tenantId,
      state,
      dualWriteEnabled,
      writeLegacy,
      writeNormalized,
      compensateNormalizedWrite,
      logReconciliationIssue
    } = params;

    if (!dualWriteEnabled) {
      await this.writeLegacy(tenantId, state, writeLegacy);
      return;
    }

    try {
      await this.writeNormalized(tenantId, state, writeNormalized);
    } catch (error) {
      await this.logNormalizedFailure(tenantId, error, logReconciliationIssue);
      throw error;
    }

    try {
      await this.writeLegacy(tenantId, state, writeLegacy);
    } catch (error) {
      this.logger.error(
        `Legacy write failed after normalized write for tenant=${tenantId}; running compensation`,
        error instanceof Error ? error.stack : undefined
      );

      await logReconciliationIssue(tenantId, {
        issueType: 'dual_write_partial_failure',
        collection: 'all',
        entityId: null,
        details: {
          phase: 'legacy_write',
          message: this.stringifyError(error)
        }
      });

      try {
        await compensateNormalizedWrite(tenantId);
      } catch (compensationError) {
        this.logger.error(
          `Compensation failed for tenant=${tenantId}`,
          compensationError instanceof Error ? compensationError.stack : undefined
        );
        await logReconciliationIssue(tenantId, {
          issueType: 'dual_write_compensation_failed',
          collection: 'all',
          entityId: null,
          details: {
            message: this.stringifyError(compensationError)
          }
        });
      }

      throw error;
    }
  }

  private async writeLegacy(
    tenantId: string,
    state: InMemoryMvpState,
    writeLegacy: WriteCallback
  ): Promise<void> {
    await writeLegacy(tenantId, state);
  }

  private async writeNormalized(
    tenantId: string,
    state: InMemoryMvpState,
    writeNormalized: WriteCallback
  ): Promise<void> {
    await writeNormalized(tenantId, state);
  }

  private async logNormalizedFailure(
    tenantId: string,
    error: unknown,
    logReconciliationIssue: ReconciliationLogger
  ): Promise<void> {
    this.logger.error(
      `Normalized write failed for tenant=${tenantId}`,
      error instanceof Error ? error.stack : undefined
    );

    await logReconciliationIssue(tenantId, {
      issueType: 'dual_write_normalized_failed',
      collection: 'all',
      entityId: null,
      details: {
        phase: 'normalized_write',
        message: this.stringifyError(error)
      }
    });
  }

  private stringifyError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
