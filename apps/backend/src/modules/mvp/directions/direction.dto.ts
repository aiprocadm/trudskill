import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf
} from 'class-validator';

const notNull = (_: unknown, value: unknown): boolean => value !== null;

/**
 * МГ-E1.1 (срез 15.1): направление обучения — как в дереве курсов CDOPROF («R13 1. Охрана
 * труда Модуль (А, Б, ПП, СИЗ)»). Код — свободная строка, уникальна в центре; вложенность —
 * через родителя; порядок — число сортировки внутри родителя.
 */
export class CreateDirectionRequest {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  parentDirectionId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  sortOrder?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

/** Правка: нет поля — не трогать; `null` у родителя и примечания — убрать; архив — статусом. */
export class UpdateDirectionRequest {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  code?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @ValidateIf(notNull)
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  parentDirectionId?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100000)
  sortOrder?: number;

  @IsOptional()
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(2000)
  note?: string | null;

  @IsOptional()
  @IsIn(['active', 'archived'])
  status?: 'active' | 'archived';
}
