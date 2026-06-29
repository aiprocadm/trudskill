import { describe, expect, it, vi } from 'vitest';

import { WebhooksController } from './webhooks.controller.js';
import { backendEnv } from '../../../env.js';
import { AuditService } from '../../audit/audit.service.js';
import { RealtimeEventsService } from '../../core/realtime-events.service.js';
import { FrdoAdapter } from '../adapters/frdo.adapter.js';
import { InMemoryIntegrationOrchestratorState } from '../infrastructure/in-memory-integration-orchestrator.state.js';
import { AdapterResolver } from '../services/adapter-resolver.service.js';
import { IdempotencyService } from '../services/idempotency.service.js';
import { IntegrationCryptoService } from '../services/integration-crypto.service.js';
import { IntegrationOrchestratorService } from '../services/integration-orchestrator.service.js';
import { ProviderRegistry } from '../services/provider-registry.service.js';
import { WebhookSignatureVerifier } from '../services/webhook-signature-verifier.service.js';

const build = () => {
  const registry = new ProviderRegistry();
  registry.register(new FrdoAdapter());
  const resolver = new AdapterResolver(registry);
  const orchestrator = new IntegrationOrchestratorService(
    new InMemoryIntegrationOrchestratorState(),
    new IntegrationCryptoService(),
    new IdempotencyService(),
    resolver,
    new AuditService(),
    new RealtimeEventsService()
  );
  const controller = new WebhooksController(
    orchestrator,
    resolver,
    new WebhookSignatureVerifier(),
    new IdempotencyService(),
    new IntegrationCryptoService()
  );
  return { controller, orchestrator };
};

describe('webhooks controller', () => {
  it('deduplicates repeated webhook callbacks', async () => {
    const { controller, orchestrator } = build();
    const context = { tenantId: 'tenant_a' } as any;

    const sig = backendEnv.INTEGRATION_WEBHOOK_SECRET;
    const first = await controller.handle(
      context,
      'frdo',
      { eventId: 'evt_1', eventType: 'status_changed', payload: { id: 1 } },
      sig
    );
    const second = await controller.handle(
      context,
      'frdo',
      { eventId: 'evt_1', eventType: 'status_changed', payload: { id: 1 } },
      sig
    );

    expect(first.accepted).toBe(true);
    expect(second).toEqual({ accepted: true, duplicate: true });
    const logs = orchestrator.byEntity('tenant_a', 'webhook', 'evt_1');
    expect(logs).toHaveLength(2);
    expect(logs.map((entry) => entry.status)).toEqual(['accepted', 'duplicate']);
  });

  // §5.160 — verify the signature BEFORE emitting any realtime event, so an unauthenticated
  // caller (wrong/absent x-signature) cannot spam tenant subscribers with a "received" ping.
  it('does not emit the received event when the signature is invalid', async () => {
    const { controller, orchestrator } = build();
    const context = { tenantId: 'tenant_a' } as any;
    const publishSpy = vi.spyOn(orchestrator, 'publishIntegrationEvent');

    await expect(
      controller.handle(
        context,
        'frdo',
        { eventId: 'evt_bad', eventType: 'status_changed', payload: { id: 1 } },
        'WRONG_SECRET'
      )
    ).rejects.toThrow();

    expect(publishSpy).not.toHaveBeenCalledWith(
      'tenant_a',
      'integration.webhook.received',
      expect.anything()
    );
  });
});
