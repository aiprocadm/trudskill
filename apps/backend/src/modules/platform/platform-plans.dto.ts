import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min
} from 'class-validator';

/** ФТ-D4: тарифы платформы. Лимиты не передан/null = безлимит по статье. */
export class CreatePlatformPlanRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  @Matches(/^[a-z0-9][a-z0-9-]*$/)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  activeLearnersLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  staffLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  storageLimitBytes?: number;

  @IsOptional()
  @IsBoolean()
  proctoring?: boolean;

  @IsOptional()
  @IsBoolean()
  scorm?: boolean;

  @IsOptional()
  @IsBoolean()
  api?: boolean;

  @IsOptional()
  @IsBoolean()
  webinars?: boolean;
}

/** `POST /platform/tenants/:id/plan` — назначить тариф арендатору. */
export class AssignPlanRequest {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  planId!: string;
}
