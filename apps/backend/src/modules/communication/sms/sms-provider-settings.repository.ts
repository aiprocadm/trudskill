import type { SmsProviderCode } from '../../../infrastructure/sms-provider/sms.provider.js';

export const SMS_PROVIDER_SETTINGS_REPOSITORY = Symbol('SMS_PROVIDER_SETTINGS_REPOSITORY');

export interface SmsProviderSettings {
  tenantId: string;
  providerCode: SmsProviderCode;
  /** Имя отправителя, зарегистрированное тенантом у оператора. */
  senderName?: string;
  enabled: boolean;
  updatedAt: string;
}

export interface SmsProviderSettingsInput {
  providerCode: SmsProviderCode;
  senderName?: string;
  enabled: boolean;
}

export interface SmsProviderSettingsRepository {
  get(tenantId: string): Promise<SmsProviderSettings | null>;
  upsert(tenantId: string, input: SmsProviderSettingsInput): Promise<SmsProviderSettings>;
}
