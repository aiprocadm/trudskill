import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
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

  // Дата рождения (для экспорта ФИС ФРДО). Сервис (`classifyRows`) и тип `BulkImportRow`
  // её читают; без объявления здесь `forbidNonWhitelisted: true` в `assertValidDto` отвергал
  // бы ВЕСЬ запрос, как только клиент передавал dateOfBirth — фича была недостижима по HTTP.
  @IsOptional()
  @IsString()
  @MaxLength(10)
  dateOfBirth?: string;
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
  // Весь конвейер импорта (outcomeRowByRowNumber, learnerIdToRowNumber) индексируется по
  // rowNumber. Дубликат rowNumber схлопывал бы outcome-строки: вторая перезаписывала первую в
  // Map, и созданный по первой строке ученик пропадал из отчёта при count «2 created». Фронтенд
  // нумерует строки по позиции в Excel (уникальны), так что дубль — это искажённый запрос:
  // отклоняем его структурно (это не бизнес-валидация, на которую распространяется partial-success).
  @ArrayUnique((row: BulkImportRowDto) => row.rowNumber, {
    message: 'rowNumber values must be unique across rows'
  })
  @ValidateNested({ each: true })
  @Type(() => BulkImportRowDto)
  rows!: BulkImportRowDto[];
}
