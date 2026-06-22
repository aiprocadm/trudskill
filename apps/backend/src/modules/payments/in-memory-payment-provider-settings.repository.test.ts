import { describe, expect, it } from 'vitest';

import { InMemoryPaymentProviderSettingsRepository } from './in-memory-payment-provider-settings.repository.js';

describe('InMemoryPaymentProviderSettingsRepository', () => {
  it('returns null for an unknown tenant', async () => {
    const repo = new InMemoryPaymentProviderSettingsRepository();
    expect(await repo.get('t-none')).toBeNull();
  });
  it('upserts and reads back', async () => {
    const repo = new InMemoryPaymentProviderSettingsRepository();
    const saved = await repo.upsert('t1', { providerCode: 'yookassa', enabled: true });
    expect(saved.tenantId).toBe('t1');
    expect(saved.providerCode).toBe('yookassa');
    expect(saved.enabled).toBe(true);
    const got = await repo.get('t1');
    expect(got?.providerCode).toBe('yookassa');
  });
  it('overwrites an existing row on re-upsert', async () => {
    const repo = new InMemoryPaymentProviderSettingsRepository();
    await repo.upsert('t1', { providerCode: 'yookassa', enabled: true });
    await repo.upsert('t1', { providerCode: 'tinkoff', enabled: false });
    const got = await repo.get('t1');
    expect(got?.providerCode).toBe('tinkoff');
    expect(got?.enabled).toBe(false);
  });
});
