import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf
} from 'class-validator';

/**
 * Phase 2 Plan C — PATCH расширенной компании-заказчика.
 * Симметрично `UpdateLearnerExtendedRequest` из Plan B.
 *
 * Семантика: все поля опциональны. Отсутствующее поле = «не трогать». null для
 * clearable полей (legalName/inn/kpp/contactEmail/contactPhone/legalAddress/note)
 * = «очистить».
 */
export class UpdateCounterpartyExtendedRequest {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  code?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(255)
  legalName?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(/^[0-9]{10}$|^[0-9]{12}$/, { message: 'inn must be 10 or 12 digits' })
  inn?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @Matches(/^[0-9]{9}$/, { message: 'kpp must be 9 digits' })
  kpp?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsEmail()
  @MaxLength(255)
  contactEmail?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(50)
  contactPhone?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(500)
  legalAddress?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(2000)
  note?: string | null;

  @IsOptional()
  @IsString()
  @IsIn(['active', 'archived'])
  status?: string;
}
