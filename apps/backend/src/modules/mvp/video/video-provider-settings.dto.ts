import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import { VIDEO_PROVIDER_CODES } from '../../../infrastructure/video-provider/video.provider.js';

/**
 * Тело настройки видеопоставщика центра. Секреты (ключи API) сюда не попадают — они живут
 * в env, в базе только несекретная часть.
 */
export class VideoProviderSettingsRequest {
  @IsIn(VIDEO_PROVIDER_CODES as unknown as string[])
  providerCode!: (typeof VIDEO_PROVIDER_CODES)[number];

  /** Адрес установки — нужен self-hosted и провайдерам со своим стендом. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  baseUrl?: string;

  @IsBoolean()
  enabled!: boolean;
}
