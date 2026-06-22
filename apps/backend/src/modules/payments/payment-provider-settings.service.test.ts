import { describe, expect, it } from 'vitest';

import { InMemoryPaymentProviderSettingsRepository } from './in-memory-payment-provider-settings.repository.js';
import { PaymentProviderSettingsService } from './payment-provider-settings.service.js';

describe('PaymentProviderSettingsService', () => {
  it('returns a safe default (noop, disabled) when no row', async () => {
    const svc = new PaymentProviderSettingsService(new InMemoryPaymentProviderSettingsRepository());
    const cfg = await svc.get('t1');
    expect(cfg.providerCode).toBe('noop');
    expect(cfg.enabled).toBe(false);
  });
  it('round-trips a saved provider', async () => {
    const svc = new PaymentProviderSettingsService(new InMemoryPaymentProviderSettingsRepository());
    await svc.save('t1', { providerCode: 'tinkoff', enabled: true });
    const cfg = await svc.get('t1');
    expect(cfg.providerCode).toBe('tinkoff');
    expect(cfg.enabled).toBe(true);
  });
});
