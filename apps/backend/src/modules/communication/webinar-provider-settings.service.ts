import { Inject, Injectable } from '@nestjs/common';

import {
  WEBINAR_PROVIDER_SETTINGS_REPOSITORY,
  type WebinarProviderSettings,
  type WebinarProviderSettingsInput,
  type WebinarProviderSettingsRepository
} from './webinar-provider-settings.repository.js';

@Injectable()
export class WebinarProviderSettingsService {
  constructor(
    @Inject(WEBINAR_PROVIDER_SETTINGS_REPOSITORY)
    private readonly repo: WebinarProviderSettingsRepository
  ) {}

  /** Returns the saved settings or a safe default view (noop, disabled). */
  async get(tenantId: string): Promise<WebinarProviderSettings> {
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
    input: WebinarProviderSettingsInput
  ): Promise<WebinarProviderSettings> {
    return this.repo.upsert(tenantId, input);
  }
}
