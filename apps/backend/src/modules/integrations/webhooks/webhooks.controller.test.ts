import { describe, expect, it } from 'vitest';
import { AuditService } from '../../audit/audit.service.js';
import { RealtimeEventsService } from '../../core/realtime-events.service.js';
import { FrdoAdapter } from '../adapters/frdo.adapter.js';
import { WebhooksController } from './webhooks.controller.js';
import { IdempotencyService } from '../services/idempotency.service.js';
import { IntegrationCryptoService } from '../services/integration-crypto.service.js';
import { IntegrationOrchestratorService } from '../services/integration-orchestrator.service.js';
import { ProviderRegistry } from '../services/provider-registry.service.js';
import { AdapterResolver } from '../services/adapter-resolver.service.js';
import { WebhookSignatureVerifier } from '../services/webhook-signature-verifier.service.js';

const build = () => {
  const registry = new ProviderRegistry();
  registry.register(new FrdoAdapter());
  const resolver = new AdapterResolver(registry);
  const orchestrator = new IntegrationOrchestratorService(new IntegrationCryptoService(), new IdempotencyService(), resolver, new AuditService(), new RealtimeEventsService());
  const controller = new WebhooksController(orchestrator, resolver, new WebhookSignatureVerifier(), new IdempotencyService(), new IntegrationCryptoService());
  return { controller, orchestrator };
};

describe('webhooks controller', () => {
  it('deduplicates repeated webhook callbacks', async () => {
    const { controller, orchestrator } = build();
    const context = { tenantId: 'tenant_a' } as any;

    const first = await controller.handle(context, 'frdo', { eventId: 'evt_1', eventType: 'status_changed', payload: { id: 1 } }, undefined);
    const second = await controller.handle(context, 'frdo', { eventId: 'evt_1', eventType: 'status_changed', payload: { id: 1 } }, undefined);

    expect(first.accepted).toBe(true);
    expect(second).toEqual({ accepted: true, duplicate: true });
    const logs = orchestrator.byEntity('tenant_a', 'webhook', 'evt_1');
    expect(logs).toHaveLength(2);
    expect(logs.map((entry) => entry.status)).toEqual(['accepted', 'duplicate']);
  });
});
