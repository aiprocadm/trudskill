import { Inject, Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../infrastructure/database/database.service.js';

import type {
  SmsProviderSettings,
  SmsProviderSettingsInput,
  SmsProviderSettingsRepository
} from './sms-provider-settings.repository.js';
import type { SmsProviderCode } from '../../../infrastructure/sms-provider/sms.provider.js';

/** Хранит ТОЛЬКО несекретную конфигурацию (ключи оператора — в секрет-хранилище). */
@Injectable()
export class PostgresSmsProviderSettingsRepository implements SmsProviderSettingsRepository {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async get(tenantId: string): Promise<SmsProviderSettings | null> {
    const rows = await this.db.query<{
      tenant_id: string;
      provider_code: SmsProviderCode;
      sender_name: string | null;
      enabled: boolean;
      updated_at: string;
    }>(
      `select tenant_id, provider_code, sender_name, enabled, updated_at
       from communication.sms_provider_settings where tenant_id = $1`,
      [tenantId]
    );
    const row = rows[0];
    if (!row) return null;
    return {
      tenantId: row.tenant_id,
      providerCode: row.provider_code,
      enabled: row.enabled,
      updatedAt: row.updated_at,
      ...(row.sender_name ? { senderName: row.sender_name } : {})
    };
  }

  async upsert(tenantId: string, input: SmsProviderSettingsInput): Promise<SmsProviderSettings> {
    const updatedAt = new Date().toISOString();
    await this.db.query(
      `insert into communication.sms_provider_settings
         (tenant_id, provider_code, sender_name, enabled, updated_at)
       values ($1, $2, $3, $4, $5::timestamptz)
       on conflict (tenant_id) do update set
         provider_code = excluded.provider_code,
         sender_name = excluded.sender_name,
         enabled = excluded.enabled,
         updated_at = excluded.updated_at`,
      [tenantId, input.providerCode, input.senderName ?? null, input.enabled, updatedAt]
    );
    return {
      tenantId,
      providerCode: input.providerCode,
      enabled: input.enabled,
      updatedAt,
      ...(input.senderName ? { senderName: input.senderName } : {})
    };
  }
}
