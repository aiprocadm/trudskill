import { Module, OnModuleInit } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module.js';
import { CoreModule } from '../core/core.module.js';
import { EisotAdapter } from './adapters/eisot.adapter.js';
import { EmailAdapter } from './adapters/email.adapter.js';
import { FrdoAdapter } from './adapters/frdo.adapter.js';
import { ProctoringAdapter } from './adapters/proctoring.adapter.js';
import { WebinarAdapter } from './adapters/webinar.adapter.js';
import { ExportsController, IntegrationsController, SyncLogsController } from './integrations.controller.js';
import { WebhooksController } from './webhooks/webhooks.controller.js';
import { IdempotencyService } from './services/idempotency.service.js';
import { IntegrationCryptoService } from './services/integration-crypto.service.js';
import { IntegrationOrchestratorService } from './services/integration-orchestrator.service.js';
import { ProviderRegistry } from './services/provider-registry.service.js';
import { WebhookSignatureVerifier } from './services/webhook-signature-verifier.service.js';

@Module({
  imports: [AuditModule, CoreModule],
  controllers: [IntegrationsController, ExportsController, SyncLogsController, WebhooksController],
  providers: [
    IntegrationOrchestratorService,
    ProviderRegistry,
    IdempotencyService,
    IntegrationCryptoService,
    WebhookSignatureVerifier,
    FrdoAdapter,
    EisotAdapter,
    EmailAdapter,
    WebinarAdapter,
    ProctoringAdapter
  ],
  exports: [IntegrationOrchestratorService]
})
export class IntegrationsModule implements OnModuleInit {
  constructor(
    private readonly registry: ProviderRegistry,
    private readonly frdo: FrdoAdapter,
    private readonly eisot: EisotAdapter,
    private readonly email: EmailAdapter,
    private readonly webinar: WebinarAdapter,
    private readonly proctoring: ProctoringAdapter
  ) {}

  onModuleInit(): void {
    [this.frdo, this.eisot, this.email, this.webinar, this.proctoring].forEach((adapter) => this.registry.register(adapter));
  }
}
