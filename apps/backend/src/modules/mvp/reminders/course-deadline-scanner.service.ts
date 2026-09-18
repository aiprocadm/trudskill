import { Inject, Injectable, Logger } from '@nestjs/common';

import { pickMilestone } from './milestone.util.js';
import {
  buildLearnerEmployerRecipients,
  buildStaffRecipients,
  resolveCourseTitleByVersion,
  resolveCourseVersionIdForGroup,
  resolveLearnerDisplay
} from './reminder-recipients.js';
import { ReminderSettingsService } from './reminder-settings.service.js';
import { NotificationDispatcher } from '../../communication/notification-dispatcher.service.js';

import type { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';

export interface CourseDeadlineScanSummary {
  remindersDispatched: number;
}

/** Enrollment statuses still expected to finish (so a deadline nudge is meaningful). */
const ACTIVE_STATUSES = new Set(['pending', 'active']);

@Injectable()
export class CourseDeadlineScanner {
  private readonly logger = new Logger(CourseDeadlineScanner.name);

  constructor(
    @Inject(NotificationDispatcher) private readonly dispatcher: NotificationDispatcher,
    /* ТЗ 11.3: пороги задаёт центр; умолчания Р11 живут в `reminder-settings.ts`. */
    @Inject(ReminderSettingsService) private readonly settings: ReminderSettingsService
  ) {}

  async scanTenant(
    tenantId: string,
    asOf: string,
    state: InMemoryMvpState
  ): Promise<CourseDeadlineScanSummary> {
    let remindersDispatched = 0;
    const milestones = await this.settings.milestones(tenantId, 'courseDeadline');

    // Staff copy is tenant-wide and loop-invariant — resolve once (mirrors license-expiry-scanner).
    const staffRecipients = buildStaffRecipients(state, tenantId);

    for (const enrollment of state.enrollments) {
      if (enrollment.tenantId !== tenantId) continue;
      if (!ACTIVE_STATUSES.has(enrollment.status)) continue;
      if (!enrollment.plannedEndAt) continue;

      const milestone = pickMilestone(asOf, enrollment.plannedEndAt, milestones);
      if (milestone === null) continue;

      const recipients = [
        ...buildLearnerEmployerRecipients(state, tenantId, enrollment),
        ...staffRecipients
      ];
      if (recipients.length === 0) continue;

      const courseVersionId = resolveCourseVersionIdForGroup(state, tenantId, enrollment.groupId);
      const courseTitle = courseVersionId
        ? resolveCourseTitleByVersion(state, tenantId, courseVersionId)
        : undefined;

      try {
        const summary = await this.dispatcher.dispatch({
          tenantId,
          templateKey: 'course_deadline',
          recipients,
          variables: {
            learnerName: resolveLearnerDisplay(state, tenantId, enrollment.learnerId).name,
            courseTitle: courseTitle ?? '',
            deadline: enrollment.plannedEndAt.slice(0, 10)
          },
          relatedEntityType: 'learning.enrollment',
          relatedEntityId: enrollment.id,
          // Embed the deadline date so that moving plannedEndAt produces a fresh key and
          // the milestone nudge re-fires for the new deadline (otherwise a milestone that
          // already fired for the old deadline would be dedup-suppressed forever). Mirrors
          // the license-expiry scanner's `license:{id}:{validUntil}:{milestone}` fix (§5.150).
          dedupKey: `deadline:${enrollment.id}:${enrollment.plannedEndAt.slice(0, 10)}:${milestone}`
        });
        remindersDispatched += summary.sent;
      } catch (err) {
        this.logger.error(
          `Failed to dispatch course_deadline for enrollment ${enrollment.id}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    return { remindersDispatched };
  }
}
