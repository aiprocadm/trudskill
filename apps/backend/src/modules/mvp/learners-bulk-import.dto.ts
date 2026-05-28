import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested
} from 'class-validator';

/**
 * Phase 2 Plan A — DTO для POST /learners/bulk-import.
 *
 * Структурная валидация на уровне class-validator. Бизнес-валидация
 * (формат СНИЛС, in-file дубликаты, reuse-резолюция) — в `classifyRows`
 * (learners-bulk-import.service.ts).
 */

export class BulkImportRowDto {
  @IsInt()
  @Min(1)
  rowNumber!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fullName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(320)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  snils?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  position?: string;
}

export class BulkImportLearnersRequest {
  @IsString()
  @MinLength(1)
  idempotencyKey!: string;

  @IsString()
  @MinLength(1)
  groupId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => BulkImportRowDto)
  rows!: BulkImportRowDto[];
}
