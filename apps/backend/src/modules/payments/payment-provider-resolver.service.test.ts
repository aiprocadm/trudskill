import { describe, expect, it } from 'vitest';

import { InMemoryPaymentProviderSettingsRepository } from './in-memory-payment-provider-settings.repository.js';
import { PaymentProviderResolver } from './payment-provider-resolver.service.js';
import { PaymentProviderSettingsService } from './payment-provider-settings.service.js';
import {
  NoopPaymentProvider,
  type PaymentProvider,
  type PaymentProviderRegistry
} from '../../infrastructure/payments/payment.provider.js';

class StubProvider implements PaymentProvider {
  constructor(readonly code: any) {}
  async createPayment() {
    return { providerPaymentId: 'p', status: 'pending' as const };
  }
  async parseWebhook() {
    return null;
  }
}

function makeResolver(opts: {
  enabled: boolean;
  nodeEnv?: string;
  settings?: PaymentProviderSettingsService;
}) {
  const registry: PaymentProviderRegistry = new Map([
    ['noop', new NoopPaymentProvider()],
    ['yookassa', new StubProvider('yookassa')],
    ['fake', new StubProvider('fake')]
  ]);
  const settings =
    opts.settings ??
    new PaymentProviderSettingsService(new InMemoryPaymentProviderSettingsRepository());
  return {
    resolver: new PaymentProviderResolver(registry, settings, opts.enabled, opts.nodeEnv ?? 'test'),
    settings
  };
}

describe('PaymentProviderResolver', () => {
  it('returns Noop when the subsystem is disabled', async () => {
    const { resolver } = makeResolver({ enabled: false });
    expect((await resolver.forTenant('t1')).code).toBe('noop');
  });
  it('returns Noop when the tenant has no settings', async () => {
    const { resolver } = makeResolver({ enabled: true });
    expect((await resolver.forTenant('t1')).code).toBe('noop');
  });
  it('returns the tenant-selected provider when enabled', async () => {
    const { resolver, settings } = makeResolver({ enabled: true });
    await settings.save('t1', { providerCode: 'yookassa', enabled: true });
    expect((await resolver.forTenant('t1')).code).toBe('yookassa');
  });
  it('forces Noop for fake in production', async () => {
    const { resolver, settings } = makeResolver({ enabled: true, nodeEnv: 'production' });
    await settings.save('t1', { providerCode: 'fake', enabled: true });
    expect((await resolver.forTenant('t1')).code).toBe('noop');
  });
  it('falls back to Noop for an unknown/unregistered code', async () => {
    const { resolver, settings } = makeResolver({ enabled: true });
    await settings.save('t1', { providerCode: 'tinkoff', enabled: true });
    expect((await resolver.forTenant('t1')).code).toBe('noop');
  });
});
