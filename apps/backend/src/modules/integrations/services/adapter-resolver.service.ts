import { Injectable } from '@nestjs/common';
import type { IntegrationAdapter } from '../adapters/adapter.interface.js';
import { ProviderRegistry } from './provider-registry.service.js';

@Injectable()
export class AdapterResolver {
  constructor(private readonly registry: ProviderRegistry) {}

  resolve(providerCode: string): IntegrationAdapter {
    return this.registry.resolve(providerCode);
  }
}
