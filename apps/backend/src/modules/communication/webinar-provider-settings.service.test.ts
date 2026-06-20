import { describe, expect, it } from 'vitest';

import { InMemoryWebinarProviderSettingsRepository } from './in-memory-webinar-provider-settings.repository.js';
import { WebinarProviderSettingsService } from './webinar-provider-settings.service.js';

const make = () => {
  const repo = new InMemoryWebinarProviderSettingsRepository();
  return { repo, service: new WebinarProviderSettingsService(repo) };
};

describe('WebinarProviderSettingsService', () => {
  it('returns a default noop/disabled view when unset', async () => {
    const { service } = make();
    const view = await service.get('t1');
    expect(view.providerCode).toBe('noop');
    expect(view.enabled).toBe(false);
  });

  it('saves and returns settings', async () => {
    const { service } = make();
    const saved = await service.save('t1', {
      providerCode: 'jitsi',
      baseUrl: 'https://meet.example.org',
      enabled: true
    });
    expect(saved.providerCode).toBe('jitsi');
    expect((await service.get('t1')).enabled).toBe(true);
  });
});
