import { describe, expect, it } from 'vitest';

import { InMemoryWebinarProviderSettingsRepository } from './in-memory-webinar-provider-settings.repository.js';

describe('InMemoryWebinarProviderSettingsRepository', () => {
  it('returns null when a tenant has no settings', async () => {
    const repo = new InMemoryWebinarProviderSettingsRepository();
    expect(await repo.get('t1')).toBeNull();
  });

  it('upserts and reads back settings', async () => {
    const repo = new InMemoryWebinarProviderSettingsRepository();
    const saved = await repo.upsert('t1', {
      providerCode: 'jitsi',
      baseUrl: 'https://meet.example.org',
      enabled: true
    });
    expect(saved.providerCode).toBe('jitsi');
    const read = await repo.get('t1');
    expect(read?.enabled).toBe(true);
    expect(read?.baseUrl).toBe('https://meet.example.org');
  });

  it('upsert overwrites an existing row', async () => {
    const repo = new InMemoryWebinarProviderSettingsRepository();
    await repo.upsert('t1', { providerCode: 'jitsi', enabled: true });
    const updated = await repo.upsert('t1', { providerCode: 'noop', enabled: false });
    expect(updated.providerCode).toBe('noop');
    expect(updated.enabled).toBe(false);
  });
});
