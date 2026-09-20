import { Inject, Injectable, Logger } from '@nestjs/common';

import { pickMilestone } from './milestone.util.js';
import { ReminderOutbox } from './reminder-outbox.service.js';
import { buildStaffRecipients } from './reminder-recipients.js';
import { ReminderSettingsService } from './reminder-settings.service.js';
import { addDays } from '../../../common/utils/date-math.util.js';
import { LicensesService } from '../../org/licenses.service.js';

import type { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';

/** Look-ahead window: active licenses with validUntil ≤ today+90d enter the scan. */

export interface LicenseExpiryScanSummary {
  /** Сколько поводов положено в копилку (ТЗ 11.3): отправка — в конце обхода. */
  remindersQueued: number;
}

/**
 * Phase 5C-2 — nightly license-expiry reminder. Unlike recert/deadline, a license is not tied
 * to a learner, so the audience is the tenant's configured notification staff
 * (`buildStaffRecipients`). Opt-in: when no staff are configured the scan does nothing (and
 * skips the DB query). Свои окна 90/30/7 (`LICENSE_EXPIRY_MILESTONES`) — шире, чем у переобучения:
 * продление лицензии занимает месяцы, и предупреждать о нём надо раньше. Send-once dedup
 * общий с остальными напоминаниями. Runs from the shared `RemindersSchedulerService` cron with the loaded MVP state.
 */
@Injectable()
export class LicenseExpiryScanner {
  private readonly logger = new Logger(LicenseExpiryScanner.name);

  constructor(
    @Inject(LicensesService) private readonly licenses: LicensesService,
    /* ТЗ 11.3: копилка вместо прямой отправки — одно письмо в день на человека. */
    @Inject(ReminderOutbox) private readonly outbox: ReminderOutbox,
    /* ТЗ 11.3: окно предупреждения о лицензии тоже настраивается центром. */
    @Inject(ReminderSettingsService) private readonly settings: ReminderSettingsService
  ) {}

  async scanTenant(
    tenantId: string,
    asOf: string,
    state: InMemoryMvpState
  ): Promise<LicenseExpiryScanSummary> {
    const recipients = buildStaffRecipients(state, tenantId);
    if (recipients.length === 0) {
      return { remindersQueued: 0 };
    }

    const milestones = await this.settings.milestones(tenantId, 'licenseExpiry');
    /* Горизонт выборки — самый дальний порог: искать дальше него незачем. */
    const horizon = addDays(asOf, Math.max(...milestones));
    const expiring = await this.licenses.findActiveExpiringBefore(tenantId, horizon);

    let remindersQueued = 0;
    for (const license of expiring) {
      if (!license.validUntil) continue;
      const milestone = pickMilestone(asOf, license.validUntil, milestones);
      if (milestone === null) continue;

      try {
        const dedupKey = `license:${license.id}:${license.validUntil}:${milestone}`;
        for (const recipient of recipients) {
          /* ТЗ 11.3: копилка вместо прямой отправки — одно письмо в день на человека. */
          this.outbox.queue(tenantId, {
            templateKey: 'license_expiring',
            variables: {
              licenseNumber: license.licenseNumber,
              issuerName: license.issuerName,
              validUntil: license.validUntil
            },
            relatedEntityType: 'org.training_license',
            relatedEntityId: license.id,
            ...('userId' in recipient && recipient.userId ? { userId: recipient.userId } : {}),
            digest: {
              email: recipient.email,
              recipientKind: recipient.kind,
              ...(recipient.name ? { recipientName: recipient.name } : {}),
              /* У лицензии центра нет «кого касается»: она общая, а не чья-то личная. */
              reasonTitle: 'Срок действия лицензии центра',
              about: `№ ${license.licenseNumber}`,
              dueDate: license.validUntil.slice(0, 10),
              dedupKey
            }
          });
          remindersQueued += 1;
        }
      } catch (err) {
        this.logger.error(
          `Failed to queue license_expiring for license ${license.id}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    return { remindersQueued };
  }
}
