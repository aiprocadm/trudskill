import {
  IsBoolean,
  IsISO8601,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength
} from 'class-validator';

const PROVIDER_CODES = ['noop', 'fake', 'jitsi', 'pruffme', 'zoom', 'bbb'] as const;

export class CreateWebinarRequest {
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  groupId?: string;

  @IsOptional()
  @IsString()
  courseId?: string;

  @IsISO8601()
  plannedStartAt!: string;

  @IsISO8601()
  plannedEndAt!: string;
}

export class AddParticipantRequest {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  learnerId?: string;

  @IsString()
  @MinLength(1)
  roleCode!: string;
}

export class ProviderSettingsRequest {
  @IsIn(PROVIDER_CODES as unknown as string[])
  providerCode!: (typeof PROVIDER_CODES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  baseUrl?: string;

  @IsBoolean()
  enabled!: boolean;
}
