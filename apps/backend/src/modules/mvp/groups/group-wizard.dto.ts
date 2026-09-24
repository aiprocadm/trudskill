import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested
} from 'class-validator';

import { CreateGroupRequest } from './group.dto.js';

/**
 * `POST /groups/wizard` (ТЗ перехода §6.2 МГ-B2, §16): группа, курсы, слушатели и доступы —
 * одной транзакцией снимка. Частичный успех по слушателям; группа создаётся всегда.
 */
export const WIZARD_ACCESS_MODES = ['email', 'sheet', 'later'] as const;
export type WizardAccessMode = (typeof WIZARD_ACCESS_MODES)[number];

export class GroupWizardGroupDto extends CreateGroupRequest {
  /** Черновик, созданный после шага 1 (`POST /groups` со статусом `draft`) — достраивается, а не дублируется. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  draftId?: string;
}

export class GroupWizardCourseDto {
  @IsString()
  @MinLength(1)
  courseId!: string;

  @IsOptional()
  @IsString()
  courseVersionId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  durationDays?: number;
}

export class GroupWizardLearnerRowDto {
  @IsInt()
  @Min(1)
  rowNumber!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  fullName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  position?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  snils?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;
}

export class GroupWizardLearnersDto {
  /** Уже существующие слушатели (из сотрудников контрагента или из реестра). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @IsString({ each: true })
  existingIds?: string[];

  /** Строки «ФИО; должность; СНИЛС; email; телефон». */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => GroupWizardLearnerRowDto)
  rows?: GroupWizardLearnerRowDto[];
}

export class GroupWizardAccessDto {
  @IsIn(WIZARD_ACCESS_MODES)
  mode!: WizardAccessMode;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  message?: string;
}

export class GroupWizardRequest {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @Matches(/^[\w.:-]+$/, { message: 'ключ идемпотентности: буквы, цифры, «.», «:», «-», «_»' })
  idempotencyKey!: string;

  @ValidateNested()
  @Type(() => GroupWizardGroupDto)
  group!: GroupWizardGroupDto;

  /** МГ-B6.1: копия группы — источник для аудита; поведение мастера не меняет. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  copyOfGroupId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => GroupWizardCourseDto)
  courses!: GroupWizardCourseDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => GroupWizardLearnersDto)
  learners?: GroupWizardLearnersDto;

  @ValidateNested()
  @Type(() => GroupWizardAccessDto)
  access!: GroupWizardAccessDto;
}
