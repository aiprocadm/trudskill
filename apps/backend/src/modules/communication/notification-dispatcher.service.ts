import { Inject, Injectable } from '@nestjs/common';

import { EMAIL_DELIVERIES_REPOSITORY, type RecipientKind } from './email-deliveries.repository.js';
import {
  EMAIL_TEMPLATE_DEFAULTS,
  type EmailTemplateKey,
  renderTemplate
} from './email-templates.js';
import { EMAIL_TEMPLATES_REPOSITORY } from './email-templates.repository.js';
import { MAILER } from '../../infrastructure/mailer/mailer.service.js';

import type { EmailDeliveriesRepository } from './email-deliveries.repository.js';
import type { EmailTemplatesRepository } from './email-templates.repository.js';
import type { MailerService } from '../../infrastructure/mailer/mailer.service.js';

export interface DispatchRecipient {
  email: string;
  name?: string;
  kind: RecipientKind;
}

export interface DispatchInput {
  tenantId: string;
  templateKey: EmailTemplateKey;
  recipients: DispatchRecipient[];
  variables: Record<string, string>;
  relatedEntityType?: string;
  relatedEntityId?: string;
}

@Injectable()
export class NotificationDispatcher {
  constructor(
    @Inject(MAILER) private readonly mailer: MailerService,
    @Inject(EMAIL_TEMPLATES_REPOSITORY) private readonly templates: EmailTemplatesRepository,
    @Inject(EMAIL_DELIVERIES_REPOSITORY) private readonly deliveries: EmailDeliveriesRepository
  ) {}

  async dispatch(input: DispatchInput): Promise<void> {
    const override = await this.templates.getOverride(input.tenantId, input.templateKey);
    const base = override ?? EMAIL_TEMPLATE_DEFAULTS[input.templateKey];
    const rendered = renderTemplate(base, input.variables);

    for (const recipient of input.recipients) {
      const result = await this.mailer.send({
        to: recipient.email,
        subject: rendered.subject,
        body: rendered.body,
        templateKey: input.templateKey
      });
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
        ...(input.relatedEntityId ? { relatedEntityId: input.relatedEntityId } : {})
      });
    }
  }
}
