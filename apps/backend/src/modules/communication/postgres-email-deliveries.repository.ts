import { Inject, Injectable } from '@nestjs/common';

import { DatabaseService } from '../../infrastructure/database/database.service.js';

import type {
  EmailDeliveriesQuery,
  EmailDeliveriesRepository,
  EmailDeliveryRow,
  EmailDeliverySeed,
  RecipientKind
} from './email-deliveries.repository.js';
import type { EmailTemplateKey } from './email-templates.js';
import type { EmailSendStatus } from '../../infrastructure/mailer/mailer.service.js';

interface EmailDeliveryDbRow {
  id: string;
  tenant_id: string;
  template_key: string;
  recipient_email: string;
  recipient_kind: string;
  subject: string;
  status: string;
  provider_message_id: string | null;
  error: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  created_at: string;
  total_count?: string;
}

@Injectable()
export class PostgresEmailDeliveriesRepository implements EmailDeliveriesRepository {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async record(seed: EmailDeliverySeed): Promise<EmailDeliveryRow> {
    const id = `emaildlv_${Math.random().toString(36).slice(2, 10)}`;
    const rows = await this.db.query<EmailDeliveryDbRow>(
      `insert into communication.email_deliveries
         (id, tenant_id, template_key, recipient_email, recipient_kind, subject, status,
          provider_message_id, error, related_entity_type, related_entity_id, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())
       returning *`,
      [
        id,
        seed.tenantId,
        seed.templateKey,
        seed.recipientEmail,
        seed.recipientKind,
        seed.subject,
        seed.status,
        seed.providerMessageId ?? null,
        seed.error ?? null,
        seed.relatedEntityType ?? null,
        seed.relatedEntityId ?? null
      ]
    );
    return this.map(rows[0]!);
  }

  async list(
    tenantId: string,
    query: EmailDeliveriesQuery = {}
  ): Promise<{ items: EmailDeliveryRow[]; total: number }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const rows = await this.db.query<EmailDeliveryDbRow>(
      `select *, count(*) over()::text as total_count
       from communication.email_deliveries
       where tenant_id = $1
       order by created_at desc
       limit $2 offset $3`,
      [tenantId, pageSize, (page - 1) * pageSize]
    );
    return {
      items: rows.map((r) => this.map(r)),
      total: Number(rows[0]?.total_count ?? 0)
    };
  }

  private map(row: EmailDeliveryDbRow): EmailDeliveryRow {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      templateKey: row.template_key as EmailTemplateKey,
      recipientEmail: row.recipient_email,
      recipientKind: row.recipient_kind as RecipientKind,
      subject: row.subject,
      status: row.status as EmailSendStatus,
      ...(row.provider_message_id ? { providerMessageId: row.provider_message_id } : {}),
      ...(row.error ? { error: row.error } : {}),
      ...(row.related_entity_type ? { relatedEntityType: row.related_entity_type } : {}),
      ...(row.related_entity_id ? { relatedEntityId: row.related_entity_id } : {}),
      createdAt: row.created_at
    };
  }
}
