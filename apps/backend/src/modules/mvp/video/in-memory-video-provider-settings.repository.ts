import type {
  VideoProviderSettings,
  VideoProviderSettingsInput,
  VideoProviderSettingsRepository
} from './video-provider-settings.repository.js';

/** Режим `ALLOW_IN_MEMORY_STATE` (dev/тесты без Postgres) — зеркало вебинарного репозитория. */
export class InMemoryVideoProviderSettingsRepository implements VideoProviderSettingsRepository {
  private readonly rows = new Map<string, VideoProviderSettings>();

  async get(tenantId: string): Promise<VideoProviderSettings | null> {
    return this.rows.get(tenantId) ?? null;
  }

  async upsert(
    tenantId: string,
    input: VideoProviderSettingsInput
  ): Promise<VideoProviderSettings> {
    const row: VideoProviderSettings = {
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
