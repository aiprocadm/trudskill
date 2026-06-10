import { Inject, Injectable, Logger } from '@nestjs/common';

import { selectIdentityImagesToPurge } from './identity-image-retention.js';
import { AuditService } from '../../audit/audit.service.js';
import { FilesService } from '../../files/files.service.js';

import type { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';

/**
 * Phase 4 Plan A: per-tenant purge of selfie/passport images 90 days after the review
 * decision (152-ФЗ minimization). The decision record persists — only files are removed.
 * Invoked by IdentityRetentionSchedulerService via MvpTenantRunner (state is loaded and
 * persisted by the runner around this call).
 */
@Injectable()
export class IdentityRetentionScanner {
  private readonly logger = new Logger(IdentityRetentionScanner.name);

  constructor(
    @Inject(FilesService) private readonly filesService: FilesService,
    @Inject(AuditService) private readonly auditService: AuditService
  ) {}

  /** Returns the number of records whose images were purged. */
  async scanTenant(tenantId: string, asOf: string, state: InMemoryMvpState): Promise<number> {
    const due = selectIdentityImagesToPurge(asOf, state.identityVerifications);
    let purged = 0;
    for (const record of due) {
      try {
        if (record.selfieFileId) await this.filesService.deleteFile(tenantId, record.selfieFileId);
        if (record.passportFileId)
          await this.filesService.deleteFile(tenantId, record.passportFileId);
        const now = new Date().toISOString();
        record.imagesPurgedAt = now;
        record.updatedAt = now;
        purged += 1;
        this.auditService.write({
          tenantId,
          actorId: 'system',
          action: 'learning.identity_verification_images_purged',
          entityType: 'learning.identity_verification',
          entityId: record.id,
          oldValues: { selfieFileId: record.selfieFileId, passportFileId: record.passportFileId },
          newValues: { imagesPurgedAt: now }
        });
      } catch (err) {
        this.logger.error(
          `Identity image purge failed tenant=${tenantId} verification=${record.id}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
    return purged;
  }
}
