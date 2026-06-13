import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested
} from 'class-validator';

/**
 * Phase 10 Track A — request DTOs for the Excel report builder.
 * Validated via assertValidDto in MvpController; engine-level invariants
 * (unknown field/filter keys) are enforced by buildReport at service time.
 */
export class ReportFilterValueDto {
  @IsString()
  key!: string;

  @IsString()
  value!: string;
}

export class BuildReportRequestDto {
  @IsIn(['learners', 'enrollments'])
  entityKey!: 'learners' | 'enrollments';

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  selectedFields!: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReportFilterValueDto)
  filters?: ReportFilterValueDto[];
}

export class SaveReportTemplateDto extends BuildReportRequestDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;
}
