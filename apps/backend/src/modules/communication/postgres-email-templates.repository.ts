import { Inject, Injectable } from '@nestjs/common';

import { DatabaseService } from '../../infrastructure/database/database.service.js';

import type { EmailTemplateKey } from './email-templates.js';
import type {
  EmailTemplateOverrideRow,
  EmailTemplateUpsert,
  EmailTemplatesRepository
} from './email-templates.repository.js';

interface EmailTemplateDbRow {
  id: string;
  tenant_id: string;
  template_key: string;
  subject: string;
  body: string;
  updated_by: string | null;
  updated_at: string;
}

@Injectable()
export class PostgresEmailTemplatesRepository implements EmailTemplatesRepository {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async getOverride(
    tenantId: string,
    key: EmailTemplateKey
  ): Promise<EmailTemplateOverrideRow | null> {
    const rows = await this.db.query<EmailTemplateDbRow>(
      `select * from communication.email_templates where tenant_id = $1 and template_key = $2`,
      [tenantId, key]
    );
    return rows[0] ? this.map(rows[0]) : null;
  }

  async upsertOverride(
    tenantId: string,
    key: EmailTemplateKey,
    upsert: EmailTemplateUpsert
  ): Promise<EmailTemplateOverrideRow> {
    const id = `emailtpl_${Math.random().toString(36).slice(2, 10)}`;
    const rows = await this.db.query<EmailTemplateDbRow>(
      `insert into communication.email_templates
         (id, tenant_id, template_key, subject, body, updated_by, updated_at)
       values ($1, $2, $3, $4, $5, $6, now())
       on conflict (tenant_id, template_key) do update
         set subject = excluded.subject,
             body = excluded.body,
             updated_by = excluded.updated_by,
             updated_at = now()
       returning *`,
      [id, tenantId, key, upsert.subject, upsert.body, upsert.updatedBy ?? null]
    );
    return this.map(rows[0]!);
  }

  async listOverrides(tenantId: string): Promise<EmailTemplateOverrideRow[]> {
    const rows = await this.db.query<EmailTemplateDbRow>(
      `select * from communication.email_templates where tenant_id = $1 order by template_key`,
      [tenantId]
    );
    return rows.map((r) => this.map(r));
  }

  private map(row: EmailTemplateDbRow): EmailTemplateOverrideRow {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      templateKey: row.template_key as EmailTemplateKey,
      subject: row.subject,
      body: row.body,
      ...(row.updated_by ? { updatedBy: row.updated_by } : {}),
      updatedAt: row.updated_at
    };
  }
}
