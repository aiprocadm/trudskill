import { IsISO8601, IsOptional, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';

const notNull = (_: unknown, value: unknown): boolean => value !== null;

/**
 * МГ-D1.1 (срез 13.1): реквизиты контрагента — общая часть тел создания и правки.
 *
 * Все поля необязательны; `null` — «очистить» (при создании равен отсутствию). Коды проверяются
 * по длине в цифрах, как их выдаёт ФНС и Росстат: ошибка в одной цифре ловится формой, а не
 * всплывает в документах. Имена полей совпадают с сущностью и с ответом подсказки по ИНН.
 */
export class CounterpartyRequisitesRequest {
  @IsOptional()
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(255)
  shortName?: string | null;

  @IsOptional()
  @ValidateIf(notNull)
  @Matches(/^(\d{13}|\d{15})$/, { message: 'ОГРН — 13 цифр (ОГРНИП — 15)' })
  ogrn?: string | null;

  @IsOptional()
  @ValidateIf(notNull)
  @Matches(/^(\d{8}|\d{10})$/, { message: 'ОКПО — 8 или 10 цифр' })
  okpo?: string | null;

  @IsOptional()
  @ValidateIf(notNull)
  @Matches(/^\d{2,11}$/, { message: 'ОКАТО — от 2 до 11 цифр' })
  okato?: string | null;

  @IsOptional()
  @ValidateIf(notNull)
  @Matches(/^(\d{8}|\d{11})$/, { message: 'ОКТМО — 8 или 11 цифр' })
  oktmo?: string | null;

  @IsOptional()
  @ValidateIf(notNull)
  @Matches(/^\d{7}$/, { message: 'ОКОГУ — 7 цифр' })
  okogu?: string | null;

  @IsOptional()
  @ValidateIf(notNull)
  @Matches(/^\d{5}$/, { message: 'ОКОПФ — 5 цифр' })
  okopf?: string | null;

  @IsOptional()
  @ValidateIf(notNull)
  @Matches(/^\d{2}(\.\d{1,2}){0,2}$/, { message: 'ОКВЭД — например, 85.42 или 85.42.9' })
  okved?: string | null;

  @IsOptional()
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(500)
  postalAddress?: string | null;

  @IsOptional()
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(500)
  actualAddress?: string | null;

  @IsOptional()
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(255)
  region?: string | null;

  @IsOptional()
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(255)
  city?: string | null;

  @IsOptional()
  @ValidateIf(notNull)
  @Matches(/^\d{6}$/, { message: 'Индекс — 6 цифр' })
  postalCode?: string | null;

  @IsOptional()
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(50)
  fax?: string | null;

  @IsOptional()
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(255)
  directorName?: string | null;

  @IsOptional()
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(255)
  directorPosition?: string | null;

  @IsOptional()
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(64)
  managerUserId?: string | null;

  @IsOptional()
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(100)
  contractNumber?: string | null;

  @IsOptional()
  @ValidateIf(notNull)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Дата договора — в виде ГГГГ-ММ-ДД' })
  @IsISO8601({ strict: true }, { message: 'Такой даты договора нет в календаре' })
  contractDate?: string | null;
}
