import { Injectable } from '@nestjs/common';

import type { EmailTemplateKey } from './email-templates.js';
import type {
  EmailTemplateOverrideRow,
  EmailTemplateUpsert,
  EmailTemplatesRepository
} from './email-templates.repository.js';

@Injectable()
export class InMemoryEmailTemplatesState implements EmailTemplatesRepository {
  overrides: EmailTemplateOverrideRow[] = [];

  async getOverride(
    tenantId: string,
    key: EmailTemplateKey
  ): Promise<EmailTemplateOverrideRow | null> {
    return this.overrides.find((o) => o.tenantId === tenantId && o.templateKey === key) ?? null;
  }

  async upsertOverride(
    tenantId: string,
    key: EmailTemplateKey,
    upsert: EmailTemplateUpsert
  ): Promise<EmailTemplateOverrideRow> {
    const existing = this.overrides.find((o) => o.tenantId === tenantId && o.templateKey === key);
    const row: EmailTemplateOverrideRow = {
      id: existing?.id ?? `emailtpl_${Math.random().toString(36).slice(2, 10)}`,
      tenantId,
      templateKey: key,
      subject: upsert.subject,
      body: upsert.body,
      ...(upsert.updatedBy ? { updatedBy: upsert.updatedBy } : {}),
      updatedAt: new Date().toISOString()
    };
    if (existing) {
      this.overrides = this.overrides.map((o) => (o === existing ? row : o));
    } else {
      this.overrides.push(row);
    }
    return row;
  }

  async listOverrides(tenantId: string): Promise<EmailTemplateOverrideRow[]> {
    return this.overrides.filter((o) => o.tenantId === tenantId);
  }
}
