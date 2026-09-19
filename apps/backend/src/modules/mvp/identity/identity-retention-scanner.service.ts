import { Inject, Injectable, Logger } from '@nestjs/common';

import { selectIdentityImagesToPurge } from './identity-image-retention.js';
import { collectFingerprints, fingerprintStream } from './image-fingerprint.js';
import { AuditService } from '../../audit/audit.service.js';
import { FilesService } from '../../files/files.service.js';
import {
  DEFAULT_IDENTITY_IMAGE_RETENTION_DAYS,
  identityImageRetentionDays
} from '../../tenant/tenant-identity-settings.js';
import { TenantService } from '../../tenant/tenant.service.js';

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
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(TenantService) private readonly tenantService: TenantService
  ) {}

  /**
   * Отпечаток одного снимка; `null`, если снять не удалось.
   *
   * Отдельным методом, потому что путь к неудаче тут длинный — файла может не быть, хранилище
   * может не ответить, поток может оборваться, — и ни одна из этих причин не должна всплыть
   * наружу исключением: удаление персональных данных важнее отпечатка.
   */
  private async fingerprintOf(tenantId: string, fileId?: string): Promise<string | null> {
    if (!fileId) return null;
    try {
      const stream = await this.filesService.openFileStream(tenantId, fileId);
      return await fingerprintStream(stream);
    } catch {
      // Молчим намеренно: причина в комментарии выше — отпечаток не важнее удаления данных.
      return null;
    }
  }

  /** Returns the number of records whose images were purged. */
  async scanTenant(tenantId: string, asOf: string, state: InMemoryMvpState): Promise<number> {
    // ФТ-C3.1 (Фаза 3 Task 7): срок хранения задаёт сам учебный центр. Центру с
    // повышенными требованиями нужно 30 дней, а не 90 — и это его решение, а не наше.
    // Сбой чтения реквизитов не имеет права остановить удаление ПДн: падаем к умолчанию.
    let retentionDays: number;
    try {
      retentionDays = identityImageRetentionDays(await this.tenantService.getRequisites(tenantId));
    } catch (err) {
      retentionDays = DEFAULT_IDENTITY_IMAGE_RETENTION_DAYS;
      this.logger.warn(
        `Identity retention settings unreadable tenant=${tenantId}, falling back to ${retentionDays} days: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
    const due = selectIdentityImagesToPurge(asOf, state.identityVerifications, retentionDays);
    let purged = 0;
    for (const record of due) {
      try {
        /*
         * ТЗ 17.2 (Р17): перед удалением снимаем ОТПЕЧАТОК — снимки уйдут, а протокол
         * верификации останется, и он обязан быть доказуемым. Через год, когда файлов давно
         * нет, отпечаток — единственное, чем можно подтвердить, что модератор смотрел именно
         * тот документ (журнал 578).
         *
         * Отпечаток снимается ДО удаления, потому что после него читать уже нечего, и его
         * неудача не останавливает удаление: лучше протокол без отпечатка, чем паспортный
         * скан, который остался лежать, потому что хранилище моргнуло.
         */
        const fingerprints = collectFingerprints({
          selfie: await this.fingerprintOf(tenantId, record.selfieFileId),
          passport: await this.fingerprintOf(tenantId, record.passportFileId)
        });

        if (record.selfieFileId) await this.filesService.deleteFile(tenantId, record.selfieFileId);
        if (record.passportFileId)
          await this.filesService.deleteFile(tenantId, record.passportFileId);
        const now = new Date().toISOString();
        record.imagesPurgedAt = now;
        if (fingerprints) record.imageHashes = fingerprints;
        record.updatedAt = now;
        purged += 1;
        this.auditService.write({
          tenantId,
          actorId: 'system',
          action: 'learning.identity_verification_images_purged',
          entityType: 'learning.identity_verification',
          entityId: record.id,
          oldValues: { selfieFileId: record.selfieFileId, passportFileId: record.passportFileId },
          /*
           * Отпечатки попадают и в журнал: запись о самой записи может быть изменена, а
           * журнал аудита дополняется только вперёд — там отпечаток переживёт что угодно.
           */
          newValues: { imagesPurgedAt: now, ...(fingerprints ? { imageHashes: fingerprints } : {}) }
        });
      } catch (err) {
        // imagesPurgedAt is intentionally not stamped on error; idempotent deleteFile means a retry next run re-attempts only surviving file ids.
        this.logger.error(
          `Identity image purge failed tenant=${tenantId} verification=${record.id}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
    return purged;
  }
}
