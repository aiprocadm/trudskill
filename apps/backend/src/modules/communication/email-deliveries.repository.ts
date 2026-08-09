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
  /** Phase 5B-2 — send-once key (feature:entity:milestone); undefined when not deduped. */
  dedupKey?: string;
  /**
   * Фаза 6 Task 8: тело письма КАК ОТПРАВЛЕНО. Нужно для повторной отправки — собрать его
   * заново нельзя, шаблон и данные с тех пор могли измениться, и слушатель получил бы
   * ДРУГОЕ письмо под видом повтора. У писем, отправленных до этой правки, тела нет.
   */
  body?: string;
  /** Ссылка на исходное письмо, если это повтор: в журнале видно, что это не новое. */
  resentFromId?: string;
  createdAt: string;
}

export type EmailDeliverySeed = Omit<EmailDeliveryRow, 'id' | 'createdAt'>;

export interface EmailDeliveriesQuery {
  page?: number;
  pageSize?: number;
}

export interface EmailDeliveriesRepository {
  record(seed: EmailDeliverySeed): Promise<EmailDeliveryRow>;
  /** Одно письмо своего центра. `null`, если письма нет ИЛИ оно чужое. */
  findById(tenantId: string, id: string): Promise<EmailDeliveryRow | null>;
  list(
    tenantId: string,
    query: EmailDeliveriesQuery
  ): Promise<{ items: EmailDeliveryRow[]; total: number }>;
  findByDedupKey(tenantId: string, dedupKey: string): Promise<EmailDeliveryRow | null>;
  listByDedupKey(tenantId: string, dedupKey: string): Promise<EmailDeliveryRow[]>;
}
