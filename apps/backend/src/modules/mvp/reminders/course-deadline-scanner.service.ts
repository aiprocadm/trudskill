import { Inject, Injectable, Logger } from '@nestjs/common';

import { pickMilestone } from './milestone.util.js';
import { ReminderOutbox } from './reminder-outbox.service.js';
import {
  buildLearnerEmployerRecipients,
  buildStaffRecipients,
  resolveCourseTitleByVersion,
  resolveCourseVersionIdForGroup,
  resolveLearnerDisplay
} from './reminder-recipients.js';
import { ReminderSettingsService } from './reminder-settings.service.js';

import type { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';

export interface CourseDeadlineScanSummary {
  /** Сколько поводов положено в копилку (ТЗ 11.3): отправка — в конце обхода. */
  remindersQueued: number;
}

/** Enrollment statuses still expected to finish (so a deadline nudge is meaningful). */
const ACTIVE_STATUSES = new Set(['pending', 'active']);

@Injectable()
export class CourseDeadlineScanner {
  private readonly logger = new Logger(CourseDeadlineScanner.name);

  constructor(
    /* ТЗ 11.3: копилка вместо прямой отправки — одно письмо в день на человека. */
    @Inject(ReminderOutbox) private readonly outbox: ReminderOutbox,
    /* ТЗ 11.3: пороги задаёт центр; умолчания Р11 живут в `reminder-settings.ts`. */
    @Inject(ReminderSettingsService) private readonly settings: ReminderSettingsService
  ) {}

  async scanTenant(
    tenantId: string,
    asOf: string,
    state: InMemoryMvpState
  ): Promise<CourseDeadlineScanSummary> {
    let remindersQueued = 0;
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

      const learnerName = resolveLearnerDisplay(state, tenantId, enrollment.learnerId).name;
      // Embed the deadline date so that moving plannedEndAt produces a fresh key and
      // the milestone nudge re-fires for the new deadline (otherwise a milestone that
      // already fired for the old deadline would be dedup-suppressed forever). Mirrors
      // the license-expiry scanner's `license:{id}:{validUntil}:{milestone}` fix (§5.150).
      const dedupKey = `deadline:${enrollment.id}:${enrollment.plannedEndAt.slice(0, 10)}:${milestone}`;
      for (const recipient of recipients) {
        /* ТЗ 11.3: копилка вместо прямой отправки — одно письмо в день на человека. */
        this.outbox.queue(tenantId, {
          templateKey: 'course_deadline',
          variables: {
            learnerName,
            courseTitle: courseTitle ?? '',
            deadline: enrollment.plannedEndAt.slice(0, 10)
          },
          relatedEntityType: 'learning.enrollment',
          relatedEntityId: enrollment.id,
          ...('userId' in recipient && recipient.userId ? { userId: recipient.userId } : {}),
          digest: {
            email: recipient.email,
            recipientKind: recipient.kind,
            ...(recipient.name ? { recipientName: recipient.name } : {}),
            subjectName: learnerName,
            reasonTitle: 'Срок завершения обучения',
            about: courseTitle ?? '',
            dueDate: enrollment.plannedEndAt.slice(0, 10),
            dedupKey
          }
        });
        remindersQueued += 1;
      }
    }

    return { remindersQueued };
  }
}
