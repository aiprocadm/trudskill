import { Inject, Injectable, Logger } from '@nestjs/common';

import { selectProctoringRecordingsToPurge } from './proctoring-video-retention.js';
import { AuditService } from '../../audit/audit.service.js';
import { FilesService } from '../../files/files.service.js';

import type { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';

/**
 * Phase 4 Plan B: per-tenant purge of proctoring chunk files 365 days after the session
 * ended. The session record (consent, attempt link) persists — only files are removed.
 * Invoked by ProctoringRetentionSchedulerService via MvpTenantRunner WRITE mode (the
 * runner loads and ALWAYS saves state around this call — Plan A CRITICAL lesson).
 */
@Injectable()
export class ProctoringRetentionScanner {
  private readonly logger = new Logger(ProctoringRetentionScanner.name);

  constructor(
    @Inject(FilesService) private readonly filesService: FilesService,
    @Inject(AuditService) private readonly auditService: AuditService
  ) {}

  /** Returns the number of recordings whose videos were purged. */
  async scanTenant(tenantId: string, asOf: string, state: InMemoryMvpState): Promise<number> {
    const due = selectProctoringRecordingsToPurge(asOf, state.proctoringRecordings);
    let purged = 0;
    for (const record of due) {
      try {
        for (const chunk of record.chunks) {
          await this.filesService.deleteFile(tenantId, chunk.fileId);
        }
        const now = new Date().toISOString();
        record.purgedAt = now;
        record.updatedAt = now;
        purged += 1;
        this.auditService.write({
          tenantId,
          actorId: 'system',
          action: 'learning.proctoring_video_purged',
          entityType: 'learning.proctoring_recording',
          entityId: record.id,
          oldValues: { chunkCount: record.chunks.length },
          newValues: { purgedAt: now }
        });
      } catch (err) {
        // purgedAt is intentionally not stamped on error; idempotent deleteFile means the
        // next run re-attempts only surviving file ids.
        this.logger.error(
          `Proctoring video purge failed tenant=${tenantId} recording=${record.id}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
    return purged;
  }
}
