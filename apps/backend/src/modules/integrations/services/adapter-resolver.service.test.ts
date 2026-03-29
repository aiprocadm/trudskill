import { describe, expect, it } from 'vitest';
import { EmailAdapter } from '../adapters/email.adapter.js';
import { ProviderRegistry } from './provider-registry.service.js';
import { AdapterResolver } from './adapter-resolver.service.js';

describe('AdapterResolver', () => {
  it('resolves adapters via provider registry', () => {
    const registry = new ProviderRegistry();
    registry.register(new EmailAdapter());
    const resolver = new AdapterResolver(registry);

    expect(resolver.resolve('email').providerCode).toBe('email');
  });
});
