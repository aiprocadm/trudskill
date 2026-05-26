import {
  IsArray,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength
} from 'class-validator';

import type { LicenseStatus, LicenseType } from './licenses.types.js';

export const LICENSE_TYPES = [
  'education_license',
  'accreditation',
  'sro_membership',
  'other'
] as const satisfies readonly LicenseType[];

export const LICENSE_STATUSES = [
  'active',
  'expired',
  'revoked'
] as const satisfies readonly LicenseStatus[];

/** `POST /admin/licenses` — создание новой лицензии. */
export class CreateLicenseRequest {
  @IsString()
  @IsIn(LICENSE_TYPES)
  licenseType!: LicenseType;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  licenseNumber!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  issuerName!: string;

  @IsDateString()
  issuedAt!: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsString()
  scanFileId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permittedTrainingTypes?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permittedDirections?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

/** `PATCH /admin/licenses/:id` — обновление редактируемых полей. */
export class UpdateLicenseRequest {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  licenseNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  issuerName?: string;

  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @IsOptional()
  @IsString()
  scanFileId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permittedTrainingTypes?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permittedDirections?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
