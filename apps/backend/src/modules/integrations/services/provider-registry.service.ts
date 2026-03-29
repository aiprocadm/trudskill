import { Injectable, NotFoundException } from '@nestjs/common';
import type { IntegrationAdapter } from '../adapters/adapter.interface.js';

@Injectable()
export class ProviderRegistry {
  private readonly adapters = new Map<string, IntegrationAdapter>();
  register(adapter: IntegrationAdapter): void { this.adapters.set(adapter.providerCode, adapter); }
  resolve(providerCode: string): IntegrationAdapter {
    const adapter = this.adapters.get(providerCode);
    if (!adapter) throw new NotFoundException({ code: 'not_found', message: `Adapter ${providerCode} not found` });
    return adapter;
  }
  listCodes(): string[] { return [...this.adapters.keys()]; }
}
