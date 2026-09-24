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

  /* МГ-C3.1 (срез 10.1): ФИО одной колонкой или фамилия/имя/отчество отдельно — проверяет сервис. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  middleName?: string;

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

  /* МГ-C3.1 (срез 10.1): пол, телефон, паспорт, гражданство, образование, компания по ИНН — как в файле, разбирает сервис. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  gender?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  passportSeries?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  passportNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  passportIssuedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  passportIssuedBy?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  citizenship?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  educationLevel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  companyInn?: string;
}

export class BulkImportLearnersRequest {
  @IsString()
  @MinLength(1)
  idempotencyKey!: string;

  /* МГ-C3.1 (РМ102): без группы — только заведение слушателей (вставка списком в реестре). */
  @IsOptional()
  @IsString()
  @MinLength(1)
  groupId?: string;

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
