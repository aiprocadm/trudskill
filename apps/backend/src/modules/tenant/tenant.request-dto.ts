import { IsObject, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * Проверяемый вход карточки учебного центра (ревизия 2026-08-26).
 *
 * Тела `PUT /tenant/settings` и `PUT /tenant/requisites` были описаны литералом прямо в
 * сигнатуре. Литерал, как и интерфейс, при сборке исчезает: в метаданных остаётся `Object`,
 * а общий проверяющий такой тип пропускает. То есть в юридическое название и ИНН можно было
 * записать что угодно — число, пустую строку, объект, — и это попало бы в выдаваемое
 * удостоверение.
 *
 * ИНН не проверяется по контрольной сумме намеренно: у центра может быть иностранный
 * учредитель или переходный период смены реквизитов, и жёсткая проверка здесь заблокирует
 * работу вместо того, чтобы помочь. Проверяется форма — цифры и разумная длина.
 */

export class UpdateTenantSettingsDto {
  /** Язык интерфейса: `ru`, `ru-RU`. */
  @IsOptional()
  @IsString()
  @Matches(/^[a-z]{2}(-[A-Z]{2})?$/, { message: 'locale: ожидается вид «ru» или «ru-RU»' })
  locale?: string;

  /** Часовой пояс: `Europe/Moscow`, `Asia/Novosibirsk`. */
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]+\/[A-Za-z_+-]+$/, {
    message: 'timezone: ожидается вид «Europe/Moscow»'
  })
  timezone?: string;

  @IsOptional()
  @IsObject({ message: 'payload: ожидается объект' })
  payload?: Record<string, unknown>;
}

export class UpdateTenantRequisitesDto {
  /** Юридическое название печатается в удостоверении — пустым и однобуквенным быть не может. */
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'legalName: слишком короткое название' })
  @MaxLength(300)
  legalName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{10}(\d{2})?$/, { message: 'taxNumber: ИНН — 10 или 12 цифр' })
  taxNumber?: string;

  @IsOptional()
  @IsObject({ message: 'payload: ожидается объект' })
  payload?: Record<string, unknown>;
}
