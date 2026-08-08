import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';

import {
  EMAIL_DELIVERIES_REPOSITORY,
  type EmailDeliveriesRepository,
  type EmailDeliveryRow
} from './email-deliveries.repository.js';
import { MAILER } from '../../infrastructure/mailer/mailer.service.js';
import { AuditService } from '../audit/audit.service.js';

import type { RequestContext } from '../../common/context/request-context.js';
import type { MailerService } from '../../infrastructure/mailer/mailer.service.js';

/**
 * Повторная отправка письма (ФТ-I2, Фаза 6 Task 8).
 *
 * ЗАЧЕМ. Журнал писем в системе был, а починить «письмо не ушло» — нечем: ручки повторной
 * отправки не существовало вовсе. Администратор центра видел строку со статусом `failed`
 * (почтовый сервер был недоступен, адрес временно отвергал письма) и мог только позвонить
 * разработчику. Слушатель при этом просто не получал приглашение или удостоверение.
 *
 * ГЛАВНОЕ РЕШЕНИЕ: отправляем ТО ЖЕ САМОЕ письмо, а не собираем его заново.
 * Пересборка из шаблона взяла бы сегодняшние данные — за прошедшее время могли измениться
 * шаблон, подпись центра, срок действия удостоверения. Человек нажал бы «отправить
 * повторно», а слушателю ушло бы ДРУГОЕ письмо. Поэтому тело хранится вместе с записью
 * журнала, а у писем, отправленных до этой правки, повтор честно недоступен.
 */
@Injectable()
export class EmailResendService {
  private readonly logger = new Logger(EmailResendService.name);

  constructor(
    @Inject(EMAIL_DELIVERIES_REPOSITORY) private readonly deliveries: EmailDeliveriesRepository,
    @Inject(MAILER) private readonly mailer: MailerService,
    @Inject(AuditService) private readonly audit: AuditService
  ) {}

  async resend(tenantId: string, id: string, ctx: RequestContext): Promise<EmailDeliveryRow> {
    const original = await this.deliveries.findById(tenantId, id);
    if (!original) {
      // 404, а не 403: чужое письмо не должно подтверждать даже своё существование.
      throw new NotFoundException({ code: 'not_found', message: 'Email delivery not found' });
    }

    if (!original.body) {
      throw new BadRequestException({
        code: 'body_not_stored',
        message:
          'Тело письма не сохранено (отправлено до обновления). Повторить его дословно нельзя.'
      });
    }

    let result: Awaited<ReturnType<MailerService['send']>>;
    try {
      result = await this.mailer.send({
        to: original.recipientEmail,
        subject: original.subject,
        body: original.body,
        templateKey: original.templateKey
      });
    } catch (error) {
      // Неудачный повтор — тоже событие журнала, а не пустой экран с ошибкой.
      result = { status: 'failed', error: error instanceof Error ? error.message : String(error) };
    }

    const recorded = await this.deliveries.record({
      tenantId,
      templateKey: original.templateKey,
      recipientEmail: original.recipientEmail,
      recipientKind: original.recipientKind,
      subject: original.subject,
      body: original.body,
      status: result.status,
      resentFromId: original.id,
      ...(result.providerMessageId ? { providerMessageId: result.providerMessageId } : {}),
      ...(result.error ? { error: result.error } : {}),
      ...(original.relatedEntityType ? { relatedEntityType: original.relatedEntityType } : {}),
      ...(original.relatedEntityId ? { relatedEntityId: original.relatedEntityId } : {})
      /*
       * dedupKey НЕ переносим намеренно. Он означает «это уведомление уже отправляли,
       * второй раз не надо» — ровно то, что мы сейчас делаем осознанно, по кнопке. С ним
       * повтор был бы пропущен, и человек снова не понял бы, почему ничего не произошло.
       */
    });

    this.audit.write({
      tenantId,
      ...(ctx.userId ? { actorId: ctx.userId } : {}),
      action: 'communication.email_resent',
      entityType: 'email_delivery',
      entityId: recorded.id,
      oldValues: { status: original.status },
      newValues: { status: recorded.status },
      ...(ctx.requestId ? { requestId: ctx.requestId } : {}),
      ...(ctx.correlationId ? { correlationId: ctx.correlationId } : {}),
      ...(ctx.ip ? { ip: ctx.ip } : {}),
      ...(ctx.userAgent ? { userAgent: ctx.userAgent } : {}),
      metadata: { resentFromId: original.id, recipient: original.recipientEmail }
    });

    this.logger.log(
      `Email ${original.id} resent to ${original.recipientEmail} with status ${result.status}`
    );
    return recorded;
  }
}
