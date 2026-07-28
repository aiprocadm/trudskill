import type { VideoProviderCode } from '../../../infrastructure/video-provider/video.provider.js';

export const VIDEO_PROVIDER_SETTINGS_REPOSITORY = Symbol('VIDEO_PROVIDER_SETTINGS_REPOSITORY');

export interface VideoProviderSettings {
  tenantId: string;
  providerCode: VideoProviderCode;
  baseUrl?: string;
  enabled: boolean;
  updatedAt: string;
}

export interface VideoProviderSettingsInput {
  providerCode: VideoProviderCode;
  baseUrl?: string;
  enabled: boolean;
}

export interface VideoProviderSettingsRepository {
  get(tenantId: string): Promise<VideoProviderSettings | null>;
  upsert(tenantId: string, input: VideoProviderSettingsInput): Promise<VideoProviderSettings>;
}
