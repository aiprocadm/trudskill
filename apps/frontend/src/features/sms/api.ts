import { apiRequest } from '../../lib/api/client';
import { providerLabels } from '../texts/providers.ru';

/**
 * Настройка СМС-поставщика центра (ФТ-C1.3, право `sms.configure`).
 *
 * Секретов здесь нет: ключи оператора живут на сервере, сюда приезжает только выбор
 * поставщика, имя отправителя и признак «включено».
 */
export const SMS_PROVIDER_CODES = ['noop', 'fake', 'smsc', 'smsru', 'mts'] as const;
export type SmsProviderCode = (typeof SMS_PROVIDER_CODES)[number];

/**
 * Русские подписи — из общего словаря поставщиков (ТЗ 4.2): `noop` и `fake` называются
 * одинаково во всех списках, а не «Не отправлять СМС» здесь и «Видео выключено» рядом.
 */
export const SMS_PROVIDER_LABELS: Record<SmsProviderCode, string> =
  providerLabels(SMS_PROVIDER_CODES);

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
