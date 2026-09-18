import { Inject, Injectable, Logger } from '@nestjs/common';

import { pickMilestone } from './milestone.util.js';
import { buildStaffRecipients } from './reminder-recipients.js';
import { ReminderSettingsService } from './reminder-settings.service.js';
import { addDays } from '../../../common/utils/date-math.util.js';
import { NotificationDispatcher } from '../../communication/notification-dispatcher.service.js';
import { LicensesService } from '../../org/licenses.service.js';

import type { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';

/** Look-ahead window: active licenses with validUntil ≤ today+90d enter the scan. */

export interface LicenseExpiryScanSummary {
  remindersDispatched: number;
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
    @Inject(NotificationDispatcher) private readonly dispatcher: NotificationDispatcher,
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
      return { remindersDispatched: 0 };
    }

    const milestones = await this.settings.milestones(tenantId, 'licenseExpiry');
    /* Горизонт выборки — самый дальний порог: искать дальше него незачем. */
    const horizon = addDays(asOf, Math.max(...milestones));
    const expiring = await this.licenses.findActiveExpiringBefore(tenantId, horizon);

    let remindersDispatched = 0;
    for (const license of expiring) {
      if (!license.validUntil) continue;
      const milestone = pickMilestone(asOf, license.validUntil, milestones);
      if (milestone === null) continue;

      try {
        const summary = await this.dispatcher.dispatch({
          tenantId,
          templateKey: 'license_expiring',
          recipients,
          variables: {
            licenseNumber: license.licenseNumber,
            issuerName: license.issuerName,
            validUntil: license.validUntil
          },
          relatedEntityType: 'org.training_license',
          relatedEntityId: license.id,
          dedupKey: `license:${license.id}:${license.validUntil}:${milestone}`
        });
        remindersDispatched += summary.sent;
      } catch (err) {
        this.logger.error(
          `Failed to dispatch license_expiring for license ${license.id}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    return { remindersDispatched };
  }
}
