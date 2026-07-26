import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { NotificationDispatcher } from './notification-dispatcher.service.js';
import { backendEnv } from '../../env.js';
import { ENROLLMENT_COMPLETED_EVENT } from '../mvp/enrollment-completed.event.js';
import { ENROLLMENT_INVITED_EVENT } from '../mvp/enrollment-invited.event.js';

import type { EnrollmentCompletedPayload } from '../mvp/enrollment-completed.event.js';
import type { EnrollmentInvitedPayload } from '../mvp/enrollment-invited.event.js';

@Injectable()
export class EnrollmentEmailListener {
  private readonly logger = new Logger(EnrollmentEmailListener.name);

  constructor(
    @Inject(NotificationDispatcher) private readonly dispatcher: NotificationDispatcher
  ) {}

  @OnEvent(ENROLLMENT_INVITED_EVENT, { async: true })
  async handleInvited(payload: EnrollmentInvitedPayload): Promise<void> {
    return this.dispatch(payload, 'enrollment_invite');
  }

  @OnEvent(ENROLLMENT_COMPLETED_EVENT, { async: true })
  async handleCompleted(payload: EnrollmentCompletedPayload): Promise<void> {
    return this.dispatch(payload, 'course_completed');
  }

  private async dispatch(
    payload: {
      tenantId: string;
      enrollmentId: string;
      recipient?: { email: string; name?: string; userId?: string };
      courseTitle?: string;
    },
    templateKey: 'enrollment_invite' | 'course_completed'
  ): Promise<void> {
    if (!payload.recipient?.email) {
      return;
    }
    try {
      await this.dispatcher.dispatch({
        tenantId: payload.tenantId,
        templateKey,
        recipients: [
          {
            email: payload.recipient.email,
            ...(payload.recipient.name ? { name: payload.recipient.name } : {}),
            ...(payload.recipient.userId ? { userId: payload.recipient.userId } : {}),
            kind: 'learner'
          }
        ],
        variables: {
          learnerName: payload.recipient.name ?? '',
          courseTitle: payload.courseTitle ?? '',
          // Рабочая ссылка входа (ФТ-F1): страница логина, где слушатель запрашивает
          // magic-link на этот же e-mail. Отдельный invite-токен — за рамками Фазы 0.
          loginUrl: `${backendEnv.PUBLIC_BASE_URL.replace(/\/+$/, '')}/login`
        },
        relatedEntityType: 'learning.enrollment',
        relatedEntityId: payload.enrollmentId,
        // Send-once: повторная эмиссия события той же записи не дублирует письмо.
        dedupKey:
          templateKey === 'enrollment_invite'
            ? `enrollinvite:${payload.enrollmentId}`
            : `enrollcomplete:${payload.enrollmentId}`
      });
    } catch (err) {
      this.logger.error(
        `Failed to dispatch ${templateKey} email for enrollment ${payload.enrollmentId}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}
