import type { InMemoryDocumentsState } from '../in-memory-documents.state.js';
import type { Logger } from '@nestjs/common';

type WriteCallback = (tenantId: string, state: InMemoryDocumentsState) => Promise<void>;
type CompensationCallback = (tenantId: string) => Promise<void>;
type ReconciliationLogger = (tenantId: string, payload: ReconciliationPayload) => Promise<void>;

type ReconciliationPayload = {
  issueType: string;
  collection: string;
  entityId: string | null;
  details: unknown;
};

export class DocumentsWriteOrchestrator {
  constructor(private readonly logger: Logger) {}

  async persist(params: {
    tenantId: string;
    state: InMemoryDocumentsState;
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
      await writeLegacy(tenantId, state);
      return;
    }

    await writeNormalized(tenantId, state);
    try {
      await writeLegacy(tenantId, state);
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

  private stringifyError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
