import { describe, expect, it } from 'vitest';

import { InMemoryWebinarProviderSettingsRepository } from './in-memory-webinar-provider-settings.repository.js';
import { WebinarProviderResolver } from './webinar-provider-resolver.service.js';
import { WebinarProviderSettingsService } from './webinar-provider-settings.service.js';
import { FakeWebinarProvider } from '../../infrastructure/webinar-provider/fake-webinar.provider.js';
import {
  NoopWebinarProvider,
  type WebinarProviderRegistry
} from '../../infrastructure/webinar-provider/webinar.provider.js';

const registry: WebinarProviderRegistry = new Map([
  ['noop', new NoopWebinarProvider()],
  ['fake', new FakeWebinarProvider()]
]);

const make = (opts: { enabledGlobally: boolean; nodeEnv: string }) => {
  const repo = new InMemoryWebinarProviderSettingsRepository();
  const settings = new WebinarProviderSettingsService(repo);
  const resolver = new WebinarProviderResolver(
    registry,
    settings,
    opts.enabledGlobally,
    opts.nodeEnv
  );
  return { repo, settings, resolver };
};

describe('WebinarProviderResolver', () => {
  it('resolves Noop when WEBINARS_ENABLED is false even if tenant picked fake', async () => {
    const { settings, resolver } = make({ enabledGlobally: false, nodeEnv: 'staging' });
    await settings.save('t1', { providerCode: 'fake', enabled: true });
    expect((await resolver.forTenant('t1')).code).toBe('noop');
  });

  it('resolves Noop when the tenant has no/disabled settings', async () => {
    const { resolver } = make({ enabledGlobally: true, nodeEnv: 'staging' });
    expect((await resolver.forTenant('t1')).code).toBe('noop');
  });

  it('resolves the tenant provider when enabled globally + per-tenant', async () => {
    const { settings, resolver } = make({ enabledGlobally: true, nodeEnv: 'staging' });
    await settings.save('t1', { providerCode: 'fake', enabled: true });
    expect((await resolver.forTenant('t1')).code).toBe('fake');
  });

  it('forces Noop for a fake provider in production (prod-guard)', async () => {
    const { settings, resolver } = make({ enabledGlobally: true, nodeEnv: 'production' });
    await settings.save('t1', { providerCode: 'fake', enabled: true });
    expect((await resolver.forTenant('t1')).code).toBe('noop');
  });

  it('resolves Noop for an unregistered provider code', async () => {
    const { settings, resolver } = make({ enabledGlobally: true, nodeEnv: 'staging' });
    await settings.save('t1', { providerCode: 'zoom', enabled: true });
    expect((await resolver.forTenant('t1')).code).toBe('noop');
  });
});
