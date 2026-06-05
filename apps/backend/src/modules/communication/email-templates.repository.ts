import type { EmailTemplateKey } from './email-templates.js';

export const EMAIL_TEMPLATES_REPOSITORY = Symbol('EMAIL_TEMPLATES_REPOSITORY');

export interface EmailTemplateOverrideRow {
  id: string;
  tenantId: string;
  templateKey: EmailTemplateKey;
  subject: string;
  body: string;
  updatedBy?: string;
  updatedAt: string;
}

export interface EmailTemplateUpsert {
  subject: string;
  body: string;
  updatedBy?: string;
}

export interface EmailTemplatesRepository {
  getOverride(tenantId: string, key: EmailTemplateKey): Promise<EmailTemplateOverrideRow | null>;
  upsertOverride(
    tenantId: string,
    key: EmailTemplateKey,
    upsert: EmailTemplateUpsert
  ): Promise<EmailTemplateOverrideRow>;
  listOverrides(tenantId: string): Promise<EmailTemplateOverrideRow[]>;
}
