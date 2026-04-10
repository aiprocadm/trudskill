import { IsBoolean, IsIn, IsObject, IsOptional, IsString } from 'class-validator';

import type { ProviderType } from '../integrations.types.js';

export class ListQueryDto {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() created_from?: string;
  @IsOptional() @IsString() created_to?: string;
  @IsOptional() @IsString() sort?: string;
  @IsOptional() @IsString() page?: string;
  @IsOptional() @IsString() page_size?: string;
}

export class CreateProviderDto {
  @IsString() code!: string;
  @IsString() name!: string;
  @IsIn(['frdo', 'eisot', 'email', 'webinar', 'proctoring', 'scorm', 'trainer']) providerType!: ProviderType;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateProviderDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateCredentialDto {
  @IsString() providerId!: string;
  @IsString() name!: string;
  @IsObject() settingsJsonb!: Record<string, unknown>;
  @IsString() secret!: string;
}

export class UpdateCredentialDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsObject() settingsJsonb?: Record<string, unknown>;
}

export class RotateSecretDto {
  @IsString() secret!: string;
}

export class CreateExportTaskDto {
  @IsString() providerCode!: string;
  @IsString() exportType!: string;
  @IsObject() sourceFilterJsonb!: Record<string, unknown>;
}

export class WebhookDto {
  @IsOptional() @IsString() eventId?: string;
  @IsOptional() @IsString() eventType?: string;
  @IsOptional() @IsObject() payload?: Record<string, unknown>;
}
