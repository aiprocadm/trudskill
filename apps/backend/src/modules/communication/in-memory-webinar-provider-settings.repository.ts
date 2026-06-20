import { Injectable } from '@nestjs/common';

import type {
  WebinarProviderSettings,
  WebinarProviderSettingsInput,
  WebinarProviderSettingsRepository
} from './webinar-provider-settings.repository.js';

@Injectable()
export class InMemoryWebinarProviderSettingsRepository implements WebinarProviderSettingsRepository {
  private readonly rows = new Map<string, WebinarProviderSettings>();

  async get(tenantId: string): Promise<WebinarProviderSettings | null> {
    return this.rows.get(tenantId) ?? null;
  }

  async upsert(
    tenantId: string,
    input: WebinarProviderSettingsInput
  ): Promise<WebinarProviderSettings> {
    const row: WebinarProviderSettings = {
      tenantId,
      providerCode: input.providerCode,
      enabled: input.enabled,
      updatedAt: new Date().toISOString(),
      ...(input.baseUrl ? { baseUrl: input.baseUrl } : {})
    };
    this.rows.set(tenantId, row);
    return row;
  }
}
