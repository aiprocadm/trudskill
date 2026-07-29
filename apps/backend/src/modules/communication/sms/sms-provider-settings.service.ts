import { Inject, Injectable } from '@nestjs/common';

import {
  SMS_PROVIDER_SETTINGS_REPOSITORY,
  type SmsProviderSettings,
  type SmsProviderSettingsInput,
  type SmsProviderSettingsRepository
} from './sms-provider-settings.repository.js';

@Injectable()
export class SmsProviderSettingsService {
  constructor(
    @Inject(SMS_PROVIDER_SETTINGS_REPOSITORY)
    private readonly repo: SmsProviderSettingsRepository
  ) {}

  /**
   * Сохранённые настройки или безопасный вид по умолчанию (noop, выключено).
   *
   * Дефолт именно «выключено»: тенант, который не покупал СМС, не должен внезапно начать
   * их слать — за каждое сообщение платит он.
   */
  async get(tenantId: string): Promise<SmsProviderSettings> {
    const saved = await this.repo.get(tenantId);
    if (saved) return saved;
    return {
      tenantId,
      providerCode: 'noop',
      enabled: false,
      updatedAt: new Date(0).toISOString()
    };
  }

  async save(tenantId: string, input: SmsProviderSettingsInput): Promise<SmsProviderSettings> {
    return this.repo.upsert(tenantId, input);
  }
}
