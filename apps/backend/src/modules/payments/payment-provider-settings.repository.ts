export const PAYMENT_PROVIDER_SETTINGS_REPOSITORY = Symbol('PAYMENT_PROVIDER_SETTINGS_REPOSITORY');

export interface PaymentProviderSettings {
  tenantId: string;
  providerCode: string;
  enabled: boolean;
  updatedAt: string;
}

export interface PaymentProviderSettingsInput {
  providerCode: string;
  enabled: boolean;
}

export interface PaymentProviderSettingsRepository {
  get(tenantId: string): Promise<PaymentProviderSettings | null>;
  upsert(tenantId: string, input: PaymentProviderSettingsInput): Promise<PaymentProviderSettings>;
}
