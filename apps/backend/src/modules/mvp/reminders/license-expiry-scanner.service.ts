import { Inject, Injectable, Logger } from '@nestjs/common';

import { RECERT_MILESTONES, pickMilestone } from './milestone.util.js';
import { buildStaffRecipients } from './reminder-recipients.js';
import { addDays } from '../../../common/utils/date-math.util.js';
import { NotificationDispatcher } from '../../communication/notification-dispatcher.service.js';
import { LicensesService } from '../../org/licenses.service.js';

import type { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';

/** Look-ahead window: active licenses with validUntil ≤ today+90d enter the scan. */
const LICENSE_EXPIRY_HORIZON_DAYS = 90;

export interface LicenseExpiryScanSummary {
  remindersDispatched: number;
}

/**
 * Phase 5C-2 — nightly license-expiry reminder. Unlike recert/deadline, a license is not tied
 * to a learner, so the audience is the tenant's configured notification staff
 * (`buildStaffRecipients`). Opt-in: when no staff are configured the scan does nothing (and
 * skips the DB query). Reuses the 90/30/7 milestone cadence + send-once dedup of the other
 * reminders. Runs from the shared `RemindersSchedulerService` cron with the loaded MVP state.
 */
@Injectable()
export class LicenseExpiryScanner {
  private readonly logger = new Logger(LicenseExpiryScanner.name);

  constructor(
    @Inject(LicensesService) private readonly licenses: LicensesService,
    @Inject(NotificationDispatcher) private readonly dispatcher: NotificationDispatcher
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

    const horizon = addDays(asOf, LICENSE_EXPIRY_HORIZON_DAYS);
    const expiring = await this.licenses.findActiveExpiringBefore(tenantId, horizon);

    let remindersDispatched = 0;
    for (const license of expiring) {
      if (!license.validUntil) continue;
      const milestone = pickMilestone(asOf, license.validUntil, RECERT_MILESTONES);
      if (milestone === null) continue;

      try {
        await this.dispatcher.dispatch({
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
          dedupKey: `license:${license.id}:${milestone}`
        });
        remindersDispatched += recipients.length;
      } catch (err) {
        this.logger.error(
          `Failed to dispatch license_expiring for license ${license.id}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    return { remindersDispatched };
  }
}
