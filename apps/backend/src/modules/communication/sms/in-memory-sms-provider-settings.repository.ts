import type {
  SmsProviderSettings,
  SmsProviderSettingsInput,
  SmsProviderSettingsRepository
} from './sms-provider-settings.repository.js';

/** Режим `ALLOW_IN_MEMORY_STATE` (dev/тесты без Postgres) — зеркало видео-репозитория. */
export class InMemorySmsProviderSettingsRepository implements SmsProviderSettingsRepository {
  private readonly rows = new Map<string, SmsProviderSettings>();

  async get(tenantId: string): Promise<SmsProviderSettings | null> {
    return this.rows.get(tenantId) ?? null;
  }

  async upsert(tenantId: string, input: SmsProviderSettingsInput): Promise<SmsProviderSettings> {
    const row: SmsProviderSettings = {
      tenantId,
      providerCode: input.providerCode,
      enabled: input.enabled,
      updatedAt: new Date().toISOString(),
      ...(input.senderName ? { senderName: input.senderName } : {})
    };
    this.rows.set(tenantId, row);
    return row;
  }
}
