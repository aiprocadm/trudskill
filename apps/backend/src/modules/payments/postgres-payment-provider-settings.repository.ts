import { Inject, Injectable } from '@nestjs/common';

import { DatabaseService } from '../../infrastructure/database/database.service.js';

import type {
  PaymentProviderSettings,
  PaymentProviderSettingsInput,
  PaymentProviderSettingsRepository
} from './payment-provider-settings.repository.js';

@Injectable()
export class PostgresPaymentProviderSettingsRepository implements PaymentProviderSettingsRepository {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async get(tenantId: string): Promise<PaymentProviderSettings | null> {
    const rows = await this.db.query<{
      tenant_id: string;
      provider_code: string;
      enabled: boolean;
      updated_at: string;
    }>(
      `select tenant_id, provider_code, enabled, updated_at
       from payments.payment_provider_settings where tenant_id = $1`,
      [tenantId]
    );
    const row = rows[0];
    if (!row) return null;
    return {
      tenantId: row.tenant_id,
      providerCode: row.provider_code,
      enabled: row.enabled,
      updatedAt: row.updated_at
    };
  }

  async upsert(
    tenantId: string,
    input: PaymentProviderSettingsInput
  ): Promise<PaymentProviderSettings> {
    const updatedAt = new Date().toISOString();
    await this.db.query(
      `insert into payments.payment_provider_settings
         (tenant_id, provider_code, enabled, updated_at)
       values ($1, $2, $3, $4::timestamptz)
       on conflict (tenant_id) do update set
         provider_code = excluded.provider_code,
         enabled = excluded.enabled,
         updated_at = excluded.updated_at`,
      [tenantId, input.providerCode, input.enabled, updatedAt]
    );
    return { tenantId, providerCode: input.providerCode, enabled: input.enabled, updatedAt };
  }
}
