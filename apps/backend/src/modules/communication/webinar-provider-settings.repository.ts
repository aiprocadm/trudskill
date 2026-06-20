import type { WebinarProviderCode } from '../../infrastructure/webinar-provider/webinar.provider.js';

export const WEBINAR_PROVIDER_SETTINGS_REPOSITORY = Symbol('WEBINAR_PROVIDER_SETTINGS_REPOSITORY');

export interface WebinarProviderSettings {
  tenantId: string;
  providerCode: WebinarProviderCode;
  baseUrl?: string;
  enabled: boolean;
  updatedAt: string;
}

export interface WebinarProviderSettingsInput {
  providerCode: WebinarProviderCode;
  baseUrl?: string;
  enabled: boolean;
}

export interface WebinarProviderSettingsRepository {
  get(tenantId: string): Promise<WebinarProviderSettings | null>;
  upsert(tenantId: string, input: WebinarProviderSettingsInput): Promise<WebinarProviderSettings>;
}
