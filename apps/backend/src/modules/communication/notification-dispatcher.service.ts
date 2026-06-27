import { Inject, Injectable } from '@nestjs/common';

import { EMAIL_DELIVERIES_REPOSITORY, type RecipientKind } from './email-deliveries.repository.js';
import {
  EMAIL_TEMPLATE_DEFAULTS,
  type EmailTemplateKey,
  renderTemplate
} from './email-templates.js';
import { EMAIL_TEMPLATES_REPOSITORY } from './email-templates.repository.js';
import { toPushNotification } from './web-push/template-push-mapping.js';
import { WEB_PUSH_SENDER } from './web-push/web-push-sender.js';
import { MAILER } from '../../infrastructure/mailer/mailer.service.js';

import type { EmailDeliveriesRepository } from './email-deliveries.repository.js';
import type { EmailTemplatesRepository } from './email-templates.repository.js';
import type { WebPushSenderPort } from './web-push/web-push-sender.js';
import type { MailerService } from '../../infrastructure/mailer/mailer.service.js';

export interface DispatchRecipient {
  email: string;
  name?: string;
  kind: RecipientKind;
  /**
   * Phase 10 Track C — IAM userId получателя (если известен). Используется только для
   * web-push фан-аута; email-доставка не зависит от него. Внешние/неизвестные получатели
   * (без userId) получают только email.
   */
  userId?: string;
}

export interface DispatchInput {
  tenantId: string;
  templateKey: EmailTemplateKey;
  recipients: DispatchRecipient[];
  variables: Record<string, string>;
  relatedEntityType?: string;
  relatedEntityId?: string;
  /** Phase 5B-2 — send-once key; when a delivery with this key exists, the dispatch is skipped. */
  dedupKey?: string;
}

@Injectable()
export class NotificationDispatcher {
  constructor(
    @Inject(MAILER) private readonly mailer: MailerService,
    @Inject(EMAIL_TEMPLATES_REPOSITORY) private readonly templates: EmailTemplatesRepository,
    @Inject(EMAIL_DELIVERIES_REPOSITORY) private readonly deliveries: EmailDeliveriesRepository,
    @Inject(WEB_PUSH_SENDER) private readonly pushSender: WebPushSenderPort
  ) {}

  async dispatch(input: DispatchInput): Promise<void> {
    // Build the set of already-succeeded recipients for this dedupKey (per-recipient idempotency).
    const alreadyDelivered = new Set<string>();
    if (input.dedupKey) {
      const prior = await this.deliveries.listByDedupKey(input.tenantId, input.dedupKey);
      for (const row of prior) {
        if (row.status !== 'failed') {
          alreadyDelivered.add(row.recipientEmail);
        }
      }
    }

    const override = await this.templates.getOverride(input.tenantId, input.templateKey);
    const base = override ?? EMAIL_TEMPLATE_DEFAULTS[input.templateKey];
    const rendered = renderTemplate(base, input.variables);

    const sent: DispatchRecipient[] = [];

    for (const recipient of input.recipients) {
      if (alreadyDelivered.has(recipient.email)) {
        continue;
      }

      let result: Awaited<ReturnType<MailerService['send']>>;
      try {
        result = await this.mailer.send({
          to: recipient.email,
          subject: rendered.subject,
          body: rendered.body,
          templateKey: input.templateKey
        });
      } catch (error) {
        result = {
          status: 'failed',
          error: error instanceof Error ? error.message : String(error)
        };
      }

      await this.deliveries.record({
        tenantId: input.tenantId,
        templateKey: input.templateKey,
        recipientEmail: recipient.email,
        recipientKind: recipient.kind,
        subject: rendered.subject,
        status: result.status,
        ...(result.providerMessageId ? { providerMessageId: result.providerMessageId } : {}),
        ...(result.error ? { error: result.error } : {}),
        ...(input.relatedEntityType ? { relatedEntityType: input.relatedEntityType } : {}),
        ...(input.relatedEntityId ? { relatedEntityId: input.relatedEntityId } : {}),
        ...(input.dedupKey ? { dedupKey: input.dedupKey } : {})
      });

      if (result.status !== 'failed') {
        sent.push(recipient);
      }
    }

    // Phase 10 Track C — web-push fan-out, alongside email. Recipients with a known IAM
    // userId get a push to their subscribed browsers; the NoopWebPushSender (default,
    // WEB_PUSH_ENABLED=false) makes this a no-op so email behaviour is byte-for-byte unchanged.
    // Push is OUTSIDE the try/catch so a push failure still propagates (existing test expectation).
    const userIds = sent.map((r) => r.userId).filter((id): id is string => Boolean(id));
    if (userIds.length > 0) {
      await this.pushSender.sendToUsers(input.tenantId, userIds, toPushNotification(rendered));
    }
  }
}
