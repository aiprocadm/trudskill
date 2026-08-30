import { apiRequest } from '../../lib/api/client';

/**
 * Настройка СМС-поставщика центра (ФТ-C1.3, право `sms.configure`).
 *
 * Секретов здесь нет: ключи оператора живут на сервере, сюда приезжает только выбор
 * поставщика, имя отправителя и признак «включено».
 */
export const SMS_PROVIDER_CODES = ['noop', 'fake', 'smsc', 'smsru', 'mts'] as const;
export type SmsProviderCode = (typeof SMS_PROVIDER_CODES)[number];

/** Русские подписи: код поставщика человеку ничего не говорит (правило «ни одного англицизма как значения»). */
export const SMS_PROVIDER_LABELS: Record<SmsProviderCode, string> = {
  noop: 'Не отправлять СМС',
  fake: 'Проверочный (только для тестового стенда)',
  smsc: 'SMSC.ru',
  smsru: 'SMS.ru',
  mts: 'МТС Коммуникатор'
};

export interface SmsProviderSettings {
  tenantId: string;
  providerCode: SmsProviderCode;
  senderName?: string;
  enabled: boolean;
  updatedAt: string;
}

export interface SmsProviderSettingsInput {
  providerCode: SmsProviderCode;
  senderName?: string;
  enabled: boolean;
}

export const getSmsProviderSettings = (): Promise<SmsProviderSettings> =>
  apiRequest<SmsProviderSettings>('/sms/provider-settings');

export const saveSmsProviderSettings = (
  input: SmsProviderSettingsInput
): Promise<SmsProviderSettings> =>
  apiRequest<SmsProviderSettings>('/sms/provider-settings', { method: 'PUT', body: input });
