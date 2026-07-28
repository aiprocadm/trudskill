import { Inject, Injectable } from '@nestjs/common';

import { DatabaseService } from '../../../infrastructure/database/database.service.js';

import type {
  VideoProviderSettings,
  VideoProviderSettingsInput,
  VideoProviderSettingsRepository
} from './video-provider-settings.repository.js';
import type { VideoProviderCode } from '../../../infrastructure/video-provider/video.provider.js';

/** Хранит ТОЛЬКО несекретную конфигурацию (ключи провайдера — в секрет-хранилище). */
@Injectable()
export class PostgresVideoProviderSettingsRepository implements VideoProviderSettingsRepository {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async get(tenantId: string): Promise<VideoProviderSettings | null> {
    const rows = await this.db.query<{
      tenant_id: string;
      provider_code: VideoProviderCode;
      base_url: string | null;
      enabled: boolean;
      updated_at: string;
    }>(
      `select tenant_id, provider_code, base_url, enabled, updated_at
       from learning.video_provider_settings where tenant_id = $1`,
      [tenantId]
    );
    const row = rows[0];
    if (!row) return null;
    return {
      tenantId: row.tenant_id,
      providerCode: row.provider_code,
      enabled: row.enabled,
      updatedAt: row.updated_at,
      ...(row.base_url ? { baseUrl: row.base_url } : {})
    };
  }

  async upsert(
    tenantId: string,
    input: VideoProviderSettingsInput
  ): Promise<VideoProviderSettings> {
    const updatedAt = new Date().toISOString();
    await this.db.query(
      `insert into learning.video_provider_settings
         (tenant_id, provider_code, base_url, enabled, updated_at)
       values ($1, $2, $3, $4, $5::timestamptz)
       on conflict (tenant_id) do update set
         provider_code = excluded.provider_code,
         base_url = excluded.base_url,
         enabled = excluded.enabled,
         updated_at = excluded.updated_at`,
      [tenantId, input.providerCode, input.baseUrl ?? null, input.enabled, updatedAt]
    );
    return {
      tenantId,
      providerCode: input.providerCode,
      enabled: input.enabled,
      updatedAt,
      ...(input.baseUrl ? { baseUrl: input.baseUrl } : {})
    };
  }
}
