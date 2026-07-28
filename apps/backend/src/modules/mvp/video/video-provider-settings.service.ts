import { Inject, Injectable } from '@nestjs/common';

import {
  VIDEO_PROVIDER_SETTINGS_REPOSITORY,
  type VideoProviderSettings,
  type VideoProviderSettingsInput,
  type VideoProviderSettingsRepository
} from './video-provider-settings.repository.js';

@Injectable()
export class VideoProviderSettingsService {
  constructor(
    @Inject(VIDEO_PROVIDER_SETTINGS_REPOSITORY)
    private readonly repo: VideoProviderSettingsRepository
  ) {}

  /** Сохранённые настройки или безопасный вид по умолчанию (noop, выключено). */
  async get(tenantId: string): Promise<VideoProviderSettings> {
    const saved = await this.repo.get(tenantId);
    if (saved) return saved;
    return {
      tenantId,
      providerCode: 'noop',
      enabled: false,
      updatedAt: new Date(0).toISOString()
    };
  }

  async save(
    tenantId: string,
    input: VideoProviderSettingsInput
  ): Promise<VideoProviderSettings> {
    return this.repo.upsert(tenantId, input);
  }
}
