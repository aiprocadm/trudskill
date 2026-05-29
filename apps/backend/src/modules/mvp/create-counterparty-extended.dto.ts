import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * Phase 2 Plan C — POST расширенной компании-заказчика.
 * Симметрично `createLearnerExtended` из Plan A. Существующий POST /counterparties
 * остаётся под `CreateSimpleRegistryRequest` (code + name) — counterparty-as-справочник.
 */
export class CreateCounterpartyExtendedRequest {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  legalName?: string;

  @IsOptional()
  @Matches(/^[0-9]{10}$|^[0-9]{12}$/, { message: 'inn must be 10 or 12 digits' })
  inn?: string;

  @IsOptional()
  @Matches(/^[0-9]{9}$/, { message: 'kpp must be 9 digits' })
  kpp?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  contactEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  contactPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  legalAddress?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
