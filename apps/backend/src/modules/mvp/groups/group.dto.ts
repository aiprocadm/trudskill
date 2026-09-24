import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsISO8601,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
  ValidateNested
} from 'class-validator';

import { ACCESS_MODES, ENROLLMENT_MODES, STUDY_FORMS } from './group-defaults.js';

/**
 * Тела ручек группы (ТЗ перехода §4, §6.1, §16; Фаза 2, срез 8.1). Свой DTO, а не общий
 * `CreateSimpleRegistryRequest`: тот делят контрагенты, слушатели и направления.
 * Старое тело `{ code, name, status }` принимается как прежде; всё новое — необязательно.
 * В правке `null` у даты, комментария и сообщения — «очистить» (семантика расширенной
 * карточки контрагента); в создании `null` не принимается.
 */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MESSAGE = 'дата в формате ГГГГ-ММ-ДД';

export class GroupNotifyOnPassDto {
  @IsOptional()
  @IsBoolean()
  email?: boolean;

  @IsOptional()
  @IsBoolean()
  inApp?: boolean;
}

/** Поля, одинаковые в создании и правке. */
class GroupCommonFieldsDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  counterpartyId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  responsibleUserId?: string | null;

  @IsOptional()
  @IsIn(STUDY_FORMS)
  studyForm?: string;

  @IsOptional()
  @IsBoolean()
  isDot?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  educationFormAtPpo?: string;

  @IsOptional()
  @IsIn(ACCESS_MODES)
  accessMode?: string;

  @IsOptional()
  @IsIn(ENROLLMENT_MODES)
  enrollmentMode?: string;

  @IsOptional()
  @IsBoolean()
  remoteSignature?: boolean;

  @IsOptional()
  @IsBoolean()
  requireIdentity?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => GroupNotifyOnPassDto)
  notifyOnPass?: GroupNotifyOnPassDto;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  externalId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sourceSystem?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  legacyNumber?: string;
}

export class CreateGroupRequest extends GroupCommonFieldsDto {
  /** Пусто — код по шаблону центра (МГ-B1.2). */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  code?: string;

  /** Пусто — равно коду (§4). */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @Matches(DATE_RE, { message: DATE_MESSAGE })
  startDate?: string;

  @IsOptional()
  @Matches(DATE_RE, { message: DATE_MESSAGE })
  endDate?: string;

  @IsOptional()
  @Matches(DATE_RE, { message: DATE_MESSAGE })
  examDate?: string;

  @IsOptional()
  @IsISO8601()
  examAccessFrom?: string;

  @IsOptional()
  @IsISO8601()
  examAccessTo?: string;

  @IsOptional()
  @Matches(DATE_RE, { message: DATE_MESSAGE })
  materialsAccessUntil?: string;

  @IsOptional()
  @Matches(DATE_RE, { message: DATE_MESSAGE })
  practiceFrom?: string;

  @IsOptional()
  @Matches(DATE_RE, { message: DATE_MESSAGE })
  practiceTo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  comment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  learnerMessage?: string;
}

export class UpdateGroupRequest extends GroupCommonFieldsDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  code?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(DATE_RE, { message: DATE_MESSAGE })
  startDate?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(DATE_RE, { message: DATE_MESSAGE })
  endDate?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(DATE_RE, { message: DATE_MESSAGE })
  examDate?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsISO8601()
  examAccessFrom?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsISO8601()
  examAccessTo?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(DATE_RE, { message: DATE_MESSAGE })
  materialsAccessUntil?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(DATE_RE, { message: DATE_MESSAGE })
  practiceFrom?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(DATE_RE, { message: DATE_MESSAGE })
  practiceTo?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(4000)
  comment?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(4000)
  learnerMessage?: string | null;
}

export class SetGroupStatusRequest {
  @IsString()
  @MinLength(1)
  status!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
