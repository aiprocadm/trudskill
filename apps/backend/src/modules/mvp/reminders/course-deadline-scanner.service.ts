import { Injectable, Logger } from '@nestjs/common';

import { COURSE_DEADLINE_MILESTONES, pickMilestone } from './milestone.util.js';
import {
  buildLearnerEmployerRecipients,
  resolveCourseTitleByVersion,
  resolveCourseVersionIdForGroup
} from './reminder-recipients.js';
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

  constructor(private readonly dispatcher: NotificationDispatcher) {}

  async scanTenant(
    tenantId: string,
    asOf: string,
    state: InMemoryMvpState
  ): Promise<CourseDeadlineScanSummary> {
    let remindersDispatched = 0;

    for (const enrollment of state.enrollments) {
      if (enrollment.tenantId !== tenantId) continue;
      if (!ACTIVE_STATUSES.has(enrollment.status)) continue;
      if (!enrollment.plannedEndAt) continue;

      const milestone = pickMilestone(asOf, enrollment.plannedEndAt, COURSE_DEADLINE_MILESTONES);
      if (milestone === null) continue;

      const recipients = buildLearnerEmployerRecipients(state, tenantId, enrollment);
      if (recipients.length === 0) continue;

      const courseVersionId = resolveCourseVersionIdForGroup(state, tenantId, enrollment.groupId);
      const courseTitle = courseVersionId
        ? resolveCourseTitleByVersion(state, tenantId, courseVersionId)
        : undefined;

      try {
        await this.dispatcher.dispatch({
          tenantId,
          templateKey: 'course_deadline',
          recipients,
          variables: {
            learnerName: recipients.find((r) => r.kind === 'learner')?.name ?? '',
            courseTitle: courseTitle ?? '',
            deadline: enrollment.plannedEndAt.slice(0, 10)
          },
          relatedEntityType: 'learning.enrollment',
          relatedEntityId: enrollment.id,
          dedupKey: `deadline:${enrollment.id}:${milestone}`
        });
        remindersDispatched += recipients.length;
      } catch (err) {
        this.logger.error(
          `Failed to dispatch course_deadline for enrollment ${enrollment.id}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    return { remindersDispatched };
  }
}
