import { NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { AuditService } from '../audit/audit.service.js';
import { RealtimeEventsService } from '../core/realtime-events.service.js';
import { BaseAdapter } from './adapters/base.adapter.js';
import { EmailAdapter } from './adapters/email.adapter.js';
import { FrdoAdapter } from './adapters/frdo.adapter.js';
import { InMemoryIntegrationOrchestratorState } from './infrastructure/in-memory-integration-orchestrator.state.js';
import { AdapterResolver } from './services/adapter-resolver.service.js';
import { IdempotencyService } from './services/idempotency.service.js';
import { IntegrationCryptoService } from './services/integration-crypto.service.js';
import { IntegrationOrchestratorService } from './services/integration-orchestrator.service.js';
import { ProviderRegistry } from './services/provider-registry.service.js';
import { WebhookSignatureVerifier } from './services/webhook-signature-verifier.service.js';

const ctx = {
  tenantId: 'tenant_a',
  userId: 'u1',
  requestId: 'r1',
  correlationId: 'c1',
  ip: '127.0.0.1',
  userAgent: 'vitest',
  roles: [],
  permissions: [],
  method: 'POST',
  path: '/x',
  timestamp: new Date().toISOString()
};

const build = () => {
  const registry = new ProviderRegistry();
  registry.register(new FrdoAdapter());
  registry.register(new EmailAdapter());
  const service = new IntegrationOrchestratorService(
    new InMemoryIntegrationOrchestratorState(),
    new IntegrationCryptoService(),
    new IdempotencyService(),
    new AdapterResolver(registry),
    new AuditService(),
    new RealtimeEventsService()
  );
  return { service, registry };
};

describe('integration foundation services', () => {
  it('resolves adapters from registry', () => {
    const { registry } = build();
    expect(registry.resolve('frdo').providerCode).toBe('frdo');
  });

  it('masks and encrypts credential secret', () => {
    const { service } = build();
    const provider = service.createProvider({
      code: 'frdo',
      name: 'FRDO',
      providerType: 'frdo',
      isActive: true
    });
    const cred = service.createCredential(
      'tenant_a',
      {
        providerId: provider.id,
        name: 'main',
        settingsJsonb: { endpoint: 'x' },
        secret: 's3cr3t-key'
      },
      ctx as any
    );
    expect(cred.secretMasked).toContain('***');
    expect(cred.secretEncrypted).toBeUndefined();
    expect(JSON.stringify(cred)).not.toContain('s3cr3t-key');
    expect(JSON.stringify(cred)).not.toContain('enc:');
  });

  it('keeps export creation idempotent', async () => {
    const { service } = build();
    await service.createExportTask(
      'tenant_a',
      'u1',
      { providerCode: 'frdo', exportType: 'learners', sourceFilterJsonb: { groupId: 'g1' } },
      'idem-1'
    );
    const second = await service.createExportTask(
      'tenant_a',
      'u1',
      { providerCode: 'frdo', exportType: 'learners', sourceFilterJsonb: { groupId: 'g1' } },
      'idem-1'
    );
    const tasks = service.listTasks('tenant_a');
    expect(tasks.items).toHaveLength(1);
    expect(second.id).toBe(tasks.items[0]?.id);
  });

  it('keeps one side effect for concurrent idempotent export requests', async () => {
    const { service } = build();
    const responses = await Promise.all(
      Array.from({ length: 25 }, () =>
        service.createExportTask(
          'tenant_a',
          'u1',
          { providerCode: 'frdo', exportType: 'learners', sourceFilterJsonb: { groupId: 'g1' } },
          'idem-concurrent'
        )
      )
    );

    const uniqueTaskIds = new Set(responses.map((task) => task.id));
    expect(uniqueTaskIds.size).toBe(1);
    expect(service.listTasks('tenant_a').items).toHaveLength(1);
  });

  it('writes dead letter when adapter export fails', async () => {
    class FailingAdapter extends BaseAdapter {
      readonly providerCode = 'broken';
      override async sendExportBatch(): Promise<{
        status: 'completed' | 'partial_success';
        externalBatchId: string;
      }> {
        throw new Error('Upstream timeout');
      }
    }

    const registry = new ProviderRegistry();
    registry.register(new FailingAdapter());
    const service = new IntegrationOrchestratorService(
      new InMemoryIntegrationOrchestratorState(),
      new IntegrationCryptoService(),
      new IdempotencyService(),
      new AdapterResolver(registry),
      new AuditService(),
      new RealtimeEventsService()
    );

    const task = await service.createExportTask(
      'tenant_a',
      'u1',
      { providerCode: 'broken', exportType: 'learners', sourceFilterJsonb: { groupId: 'g1' } },
      'idem-broken'
    );
    const deadLetters = service.listDeadLetters('tenant_a');
    expect(task.status).toBe('failed');
    expect(deadLetters).toHaveLength(1);
    expect(deadLetters[0]?.reason).toContain('Upstream timeout');
  });

  it('supports list pagination envelopes for registries', async () => {
    const { service } = build();
    service.createProvider({ code: 'frdo', name: 'FRDO', providerType: 'frdo', isActive: true });
    service.createProvider({ code: 'email', name: 'Email', providerType: 'email', isActive: true });
    const providersPage = service.listProviders({ page: '1', page_size: '1' });
    expect(providersPage.total).toBe(2);
    expect(providersPage.items).toHaveLength(1);
    expect(providersPage.pageSize).toBe(1);
  });

  it('supports sorting for registry responses', () => {
    const { service } = build();
    service.createProvider({
      code: 'webinar',
      name: 'Webinar',
      providerType: 'webinar',
      isActive: true
    });
    service.createProvider({ code: 'email', name: 'Email', providerType: 'email', isActive: true });
    const asc = service.listProviders({ sort: 'code' });
    const desc = service.listProviders({ sort: '-code' });

    expect(asc.items[0]?.code).toBe('email');
    expect(desc.items[0]?.code).toBe('webinar');
  });

  it('validates webhook signature when secret is configured', () => {
    const verifier = new WebhookSignatureVerifier();
    expect(() => verifier.verify('abc', 'abc')).not.toThrow();
    expect(() => verifier.verify('bad', 'abc')).toThrowError();
  });

  it('getTask resolves by tenant when duplicate task ids exist (tenant-scoped lookup)', () => {
    const registry = new ProviderRegistry();
    registry.register(new FrdoAdapter());
    const state = new InMemoryIntegrationOrchestratorState();
    const service = new IntegrationOrchestratorService(
      state,
      new IntegrationCryptoService(),
      new IdempotencyService(),
      new AdapterResolver(registry),
      new AuditService(),
      new RealtimeEventsService()
    );
    const requestedAt = new Date().toISOString();
    const sharedId = 'exp_duplicate_id_cross_tenant';
    state.tasks.push({
      id: sharedId,
      tenantId: 'tenant_a',
      providerCode: 'frdo',
      exportType: 'learners',
      sourceFilterJsonb: { k: 'a' },
      status: 'queued',
      requestedBy: 'u1',
      requestedAt
    });
    state.tasks.push({
      id: sharedId,
      tenantId: 'tenant_b',
      providerCode: 'frdo',
      exportType: 'courses',
      sourceFilterJsonb: { k: 'b' },
      status: 'queued',
      requestedBy: 'u2',
      requestedAt
    });

    expect(service.getTask('tenant_a', sharedId).exportType).toBe('learners');
    expect(service.getTask('tenant_b', sharedId).exportType).toBe('courses');
    expect(() => service.getTask('tenant_a', 'exp_only_other_tenant')).toThrow(NotFoundException);
  });
});
