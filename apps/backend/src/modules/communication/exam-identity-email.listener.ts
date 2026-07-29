import { Inject, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { NotificationDispatcher } from './notification-dispatcher.service.js';
import { SmsChannelService } from './sms/sms-channel.service.js';
import { IDENTITY_VERIFICATION_REJECTED_EVENT } from '../mvp/identity-verification-rejected.event.js';
import { PRE_EXAM_AUTH_REQUESTED_EVENT } from '../mvp/pre-exam-auth-requested.event.js';

import type { IdentityVerificationRejectedPayload } from '../mvp/identity-verification-rejected.event.js';
import type { PreExamAuthRequestedPayload } from '../mvp/pre-exam-auth-requested.event.js';

/**
 * Фаза 0 Task 4 (ФТ-F1): письма «код на экзамен» и «проверка личности отклонена» —
 * раньше оба были log-only stubs в MvpService. Ошибки доставки логируются и не
 * роняют доменный флоу (как в EnrollmentEmailListener).
 */
@Injectable()
export class ExamIdentityEmailListener {
  private readonly logger = new Logger(ExamIdentityEmailListener.name);

  constructor(
    @Inject(NotificationDispatcher) private readonly dispatcher: NotificationDispatcher,
    @Inject(SmsChannelService) private readonly sms: SmsChannelService
  ) {}

  @OnEvent(PRE_EXAM_AUTH_REQUESTED_EVENT, { async: true })
  async handlePreExamAuthRequested(payload: PreExamAuthRequestedPayload): Promise<void> {
    if (!payload.recipient?.email) {
      return;
    }

    /*
     * Фаза 3 Task 5 (ФТ-C1.3): СМС — ВТОРОЙ канал доставки той же ссылки. Он идёт ПЕРВЫМ
     * в коде, но это не приоритет: `SmsChannelService.send` не бросает и возвращает false,
     * если канал выключен. Порядок выбран так, чтобы падение email-диспетчера (которое
     * ловится ниже) не отменяло уже отправленную СМС и наоборот — каналы независимы.
     * Токен и гейт не трогаем вовсе: меняется только транспорт.
     */
    await this.sms.send(
      payload.tenantId,
      payload.recipient.phone,
      `Подтверждение личности для экзамена: ${payload.verifyUrl}`
    );

    try {
      await this.dispatcher.dispatch({
        tenantId: payload.tenantId,
        templateKey: 'pre_exam_auth',
        recipients: [this.recipient(payload.recipient)],
        variables: {
          learnerName: payload.recipient.name ?? '',
          courseTitle: payload.courseTitle ?? '',
          verifyUrl: payload.verifyUrl
        },
        relatedEntityType: 'assessment.pre_exam_token',
        relatedEntityId: payload.tokenId,
        // Каждый выпущенный токен — своё письмо; повторная эмиссия того же токена — дубль.
        dedupKey: `preexam:${payload.tokenId}`
      });
    } catch (err) {
      this.logger.error(
        `Failed to dispatch pre_exam_auth email for token ${payload.tokenId}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  @OnEvent(IDENTITY_VERIFICATION_REJECTED_EVENT, { async: true })
  async handleIdentityVerificationRejected(
    payload: IdentityVerificationRejectedPayload
  ): Promise<void> {
    if (!payload.recipient?.email) {
      return;
    }
    try {
      await this.dispatcher.dispatch({
        tenantId: payload.tenantId,
        templateKey: 'identity_verification_rejected',
        recipients: [this.recipient(payload.recipient)],
        variables: {
          learnerName: payload.recipient.name ?? '',
          reason: payload.reason ?? 'не указана'
        },
        relatedEntityType: 'learning.identity_verification',
        relatedEntityId: payload.verificationId,
        // reviewedAt в ключе: повторный reject после resubmit — новое письмо.
        dedupKey: `idreject:${payload.verificationId}:${payload.reviewedAt}`
      });
    } catch (err) {
      this.logger.error(
        `Failed to dispatch identity_verification_rejected email for verification ${payload.verificationId}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  private recipient(input: { email: string; name?: string; userId?: string }): {
    email: string;
    name?: string;
    userId?: string;
    kind: 'learner';
  } {
    return {
      email: input.email,
      ...(input.name ? { name: input.name } : {}),
      ...(input.userId ? { userId: input.userId } : {}),
      kind: 'learner'
    };
  }
}
