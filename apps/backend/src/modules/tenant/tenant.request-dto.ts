import {
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  Validate,
  ValidatorConstraint,
  type ValidatorConstraintInterface
} from 'class-validator';

import { SUPPORTED_LOCALES, isRealTimeZone, isSupportedLocale } from './tenant-settings-values.js';

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

/** Пояс должен существовать, а не просто быть похожим на пояс (журнал 303). */
@ValidatorConstraint({ name: 'realTimeZone', async: false })
export class RealTimeZoneRule implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && isRealTimeZone(value);
  }

  defaultMessage(): string {
    return 'timezone: такого часового пояса не существует. Пример: «Europe/Moscow», «Asia/Novosibirsk»';
  }
}

/** Язык — только тот, который продукт умеет (журнал 304). */
@ValidatorConstraint({ name: 'supportedLocale', async: false })
export class SupportedLocaleRule implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && isSupportedLocale(value);
  }

  defaultMessage(): string {
    return `locale: доступен только ${SUPPORTED_LOCALES.join(', ')} — других переводов в продукте пока нет`;
  }
}

export class UpdateTenantSettingsDto {
  /**
   * Язык интерфейса. Проверяется по списку языков, которые продукт умеет НА САМОМ ДЕЛЕ
   * (журнал 304): перевода пока нет ни одного, и принимать «en-US» значило бы обещать то,
   * чего не существует.
   */
  @IsOptional()
  @IsString()
  @Validate(SupportedLocaleRule)
  locale?: string;

  /**
   * Часовой пояс: `Europe/Moscow`, `Asia/Novosibirsk`. Проверяется по НАСТОЯЩЕМУ списку зон,
   * а не по узору (журнал 303): узор пропускал `Europe/Atlantis`, а с тех пор как по поясу
   * считаются даты удостоверений и сроки, опечатка молча уводила расчёт на пояс по умолчанию.
   */
  @IsOptional()
  @IsString()
  @Validate(RealTimeZoneRule)
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
