import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import { SMS_PROVIDER_CODES } from '../../../infrastructure/sms-provider/sms.provider.js';

/**
 * Тело настройки СМС-поставщика центра.
 *
 * Секретов здесь нет по правилу шва: API-ключи живут в env/секрет-хранилище, в базе — только
 * несекретная часть (код поставщика, имя отправителя, признак «включено»).
 */
export class SmsProviderSettingsRequest {
  @IsIn(SMS_PROVIDER_CODES as unknown as string[])
  providerCode!: (typeof SMS_PROVIDER_CODES)[number];

  /** Имя отправителя, зарегистрированное центром у оператора. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  senderName?: string;

  @IsBoolean()
  enabled!: boolean;
}
