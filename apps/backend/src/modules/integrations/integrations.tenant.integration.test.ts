import { describe, expect, it } from 'vitest';

import { AuditService } from '../audit/audit.service.js';
import { RealtimeEventsService } from '../core/realtime-events.service.js';
import { FrdoAdapter } from './adapters/frdo.adapter.js';
import { InMemoryIntegrationOrchestratorState } from './infrastructure/in-memory-integration-orchestrator.state.js';
import { AdapterResolver } from './services/adapter-resolver.service.js';
import { IdempotencyService } from './services/idempotency.service.js';
import { IntegrationCryptoService } from './services/integration-crypto.service.js';
import { IntegrationOrchestratorService } from './services/integration-orchestrator.service.js';
import { ProviderRegistry } from './services/provider-registry.service.js';

describe('integration tenant isolation', () => {
  it('does not allow cross-tenant credential access', () => {
    const registry = new ProviderRegistry();
    registry.register(new FrdoAdapter());
    const service = new IntegrationOrchestratorService(
      new InMemoryIntegrationOrchestratorState(),
      new IntegrationCryptoService(),
      new IdempotencyService(),
      new AdapterResolver(registry),
      new AuditService(),
      new RealtimeEventsService()
    );
    const provider = service.createProvider({
      code: 'frdo',
      name: 'FRDO',
      providerType: 'frdo',
      isActive: true
    });
    const credential = service.createCredential(
      'tenant_a',
      { providerId: provider.id, name: 'cred-a', settingsJsonb: {}, secret: '123' },
      { tenantId: 'tenant_a', userId: 'u1' } as any
    );

    expect(() => service.getCredential('tenant_b', credential.id)).toThrowError();
  });
});
