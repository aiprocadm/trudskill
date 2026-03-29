import { describe, expect, it } from 'vitest';
import { AuditService } from '../audit/audit.service.js';
import { RealtimeEventsService } from '../core/realtime-events.service.js';
import { EmailAdapter } from './adapters/email.adapter.js';
import { FrdoAdapter } from './adapters/frdo.adapter.js';
import { IdempotencyService } from './services/idempotency.service.js';
import { IntegrationCryptoService } from './services/integration-crypto.service.js';
import { IntegrationOrchestratorService } from './services/integration-orchestrator.service.js';
import { ProviderRegistry } from './services/provider-registry.service.js';
import { WebhookSignatureVerifier } from './services/webhook-signature-verifier.service.js';

const ctx = { tenantId: 'tenant_a', userId: 'u1', requestId: 'r1', correlationId: 'c1', ip: '127.0.0.1', userAgent: 'vitest', roles: [], permissions: [], method: 'POST', path: '/x', timestamp: new Date().toISOString() };

const build = () => {
  const registry = new ProviderRegistry();
  registry.register(new FrdoAdapter());
  registry.register(new EmailAdapter());
  const service = new IntegrationOrchestratorService(new IntegrationCryptoService(), new IdempotencyService(), registry, new AuditService(), new RealtimeEventsService());
  return { service, registry };
};

describe('integration foundation services', () => {
  it('resolves adapters from registry', () => {
    const { registry } = build();
    expect(registry.resolve('frdo').providerCode).toBe('frdo');
  });

  it('masks and encrypts credential secret', () => {
    const { service } = build();
    const provider = service.createProvider({ code: 'frdo', name: 'FRDO', providerType: 'frdo', isActive: true });
    const cred = service.createCredential('tenant_a', { providerId: provider.id, name: 'main', settingsJsonb: { endpoint: 'x' }, secret: 's3cr3t-key' }, ctx as any);
    expect(cred.secretMasked).toContain('***');
    expect(JSON.stringify(cred)).not.toContain('s3cr3t-key');
  });

  it('keeps export creation idempotent', async () => {
    const { service } = build();
    await service.createExportTask('tenant_a', 'u1', { providerCode: 'frdo', exportType: 'learners', sourceFilterJsonb: { groupId: 'g1' } }, 'idem-1');
    const second = await service.createExportTask('tenant_a', 'u1', { providerCode: 'frdo', exportType: 'learners', sourceFilterJsonb: { groupId: 'g1' } }, 'idem-1');
    expect(service.listTasks('tenant_a')).toHaveLength(1);
    expect(second.id).toBe(service.listTasks('tenant_a')[0]?.id);
  });

  it('validates webhook signature when secret is configured', () => {
    const verifier = new WebhookSignatureVerifier();
    expect(() => verifier.verify('abc', 'abc')).not.toThrow();
    expect(() => verifier.verify('bad', 'abc')).toThrowError();
  });
});
