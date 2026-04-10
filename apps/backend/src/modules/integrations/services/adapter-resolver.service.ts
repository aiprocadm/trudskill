import { Injectable } from '@nestjs/common';

import { type ProviderRegistry } from './provider-registry.service.js';

import type { IntegrationAdapter } from '../adapters/adapter.interface.js';

@Injectable()
export class AdapterResolver {
  constructor(private readonly registry: ProviderRegistry) {}

  resolve(providerCode: string): IntegrationAdapter {
    return this.registry.resolve(providerCode);
  }
}
