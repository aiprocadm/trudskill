import type { EmailTemplateKey } from './email-templates.js';
import type { EmailSendStatus } from '../../infrastructure/mailer/mailer.service.js';

export const EMAIL_DELIVERIES_REPOSITORY = Symbol('EMAIL_DELIVERIES_REPOSITORY');

export type RecipientKind = 'learner' | 'employer' | 'curator' | 'admin';

export interface EmailDeliveryRow {
  id: string;
  tenantId: string;
  templateKey: EmailTemplateKey;
  recipientEmail: string;
  recipientKind: RecipientKind;
  subject: string;
  status: EmailSendStatus;
  providerMessageId?: string;
  error?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  createdAt: string;
}

export type EmailDeliverySeed = Omit<EmailDeliveryRow, 'id' | 'createdAt'>;

export interface EmailDeliveriesQuery {
  page?: number;
  pageSize?: number;
}

export interface EmailDeliveriesRepository {
  record(seed: EmailDeliverySeed): Promise<EmailDeliveryRow>;
  list(
    tenantId: string,
    query: EmailDeliveriesQuery
  ): Promise<{ items: EmailDeliveryRow[]; total: number }>;
}
