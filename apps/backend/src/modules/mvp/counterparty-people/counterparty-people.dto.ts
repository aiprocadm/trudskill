import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested
} from 'class-validator';

import { CONTACT_STATUSES, EMPLOYEE_STATUSES } from './counterparty-people.types.js';

const notNull = (_: unknown, value: unknown): boolean => value !== null;

/** МГ-D2.1: новое контактное лицо компании. */
export class CreateCounterpartyContactRequest {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  firstName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  position?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

/** Правка контакта: нет поля — не трогать, `null` — очистить; «в архив» — статусом. */
export class UpdateCounterpartyContactRequest {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  firstName?: string;

  @IsOptional()
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(120)
  lastName?: string | null;

  @IsOptional()
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(255)
  position?: string | null;

  @IsOptional()
  @ValidateIf(notNull)
  @IsEmail()
  @MaxLength(255)
  email?: string | null;

  @IsOptional()
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(50)
  phone?: string | null;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsIn(CONTACT_STATUSES)
  status?: 'active' | 'archived';
}

/** МГ-D2.1: новый сотрудник компании. */
export class CreateCounterpartyEmployeeRequest {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  lastName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  firstName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  middleName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  position?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  employeeNo?: string;
}

/** Правка сотрудника: статус («уволен» вместо удаления) и связь со слушателем. */
export class UpdateCounterpartyEmployeeRequest {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  firstName?: string;

  @IsOptional()
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(120)
  middleName?: string | null;

  @IsOptional()
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(255)
  position?: string | null;

  @IsOptional()
  @ValidateIf(notNull)
  @IsEmail()
  @MaxLength(255)
  email?: string | null;

  @IsOptional()
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(50)
  phone?: string | null;

  @IsOptional()
  @ValidateIf(notNull)
  @IsString()
  @MaxLength(60)
  employeeNo?: string | null;

  @IsOptional()
  @IsIn(EMPLOYEE_STATUSES)
  status?: 'active' | 'inactive' | 'dismissed';

  @IsOptional()
  @ValidateIf(notNull)
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  learnerId?: string | null;
}

/**
 * Строка массового добавления. Проверка «есть ли фамилия и имя, похожа ли почта на почту» —
 * в службе, построчно: форма пачки не должна отвергать все двести строк из-за одной.
 */
export class BulkCounterpartyEmployeeRow {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  middleName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  position?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  employeeNo?: string;
}

export class BulkCounterpartyEmployeesRequest {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => BulkCounterpartyEmployeeRow)
  rows!: BulkCounterpartyEmployeeRow[];
}

export class ListCounterpartyEmployeesQuery {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @IsOptional()
  @IsIn(EMPLOYEE_STATUSES)
  status?: 'active' | 'inactive' | 'dismissed';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  page_size?: number;
}
