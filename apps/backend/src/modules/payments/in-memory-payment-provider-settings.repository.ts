import { Injectable } from '@nestjs/common';

import type {
  PaymentProviderSettings,
  PaymentProviderSettingsInput,
  PaymentProviderSettingsRepository
} from './payment-provider-settings.repository.js';

@Injectable()
export class InMemoryPaymentProviderSettingsRepository implements PaymentProviderSettingsRepository {
  private readonly rows = new Map<string, PaymentProviderSettings>();

  async get(tenantId: string): Promise<PaymentProviderSettings | null> {
    return this.rows.get(tenantId) ?? null;
  }

  async upsert(
    tenantId: string,
    input: PaymentProviderSettingsInput
  ): Promise<PaymentProviderSettings> {
    const row: PaymentProviderSettings = {
      tenantId,
      providerCode: input.providerCode,
      enabled: input.enabled,
      updatedAt: new Date().toISOString()
    };
    this.rows.set(tenantId, row);
    return { ...row };
  }
}
