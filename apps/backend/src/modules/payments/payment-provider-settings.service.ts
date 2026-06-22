import { Inject, Injectable } from '@nestjs/common';

import {
  PAYMENT_PROVIDER_SETTINGS_REPOSITORY,
  type PaymentProviderSettings,
  type PaymentProviderSettingsInput,
  type PaymentProviderSettingsRepository
} from './payment-provider-settings.repository.js';

@Injectable()
export class PaymentProviderSettingsService {
  constructor(
    @Inject(PAYMENT_PROVIDER_SETTINGS_REPOSITORY)
    private readonly repo: PaymentProviderSettingsRepository
  ) {}

  async get(tenantId: string): Promise<PaymentProviderSettings> {
    const saved = await this.repo.get(tenantId);
    if (saved) return saved;
    return { tenantId, providerCode: 'noop', enabled: false, updatedAt: new Date(0).toISOString() };
  }

  async save(
    tenantId: string,
    input: PaymentProviderSettingsInput
  ): Promise<PaymentProviderSettings> {
    return this.repo.upsert(tenantId, input);
  }
}
