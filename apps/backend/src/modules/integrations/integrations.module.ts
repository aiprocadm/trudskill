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
import { IntegrationOrchestratorService } from './services/integration-orchestrator.service.js';
import { ProviderRegistry } from './services/provider-registry.service.js';
import { CredentialsModule } from './modules/credentials.module.js';
import { ExportsModule } from './modules/exports.module.js';
import { ProvidersModule } from './modules/providers.module.js';
import { SyncLogsModule } from './modules/sync-logs.module.js';
import { WebhooksModule } from './modules/webhooks.module.js';

@Module({
  imports: [AuditModule, CoreModule, ProvidersModule, CredentialsModule, ExportsModule, SyncLogsModule, WebhooksModule],
  controllers: [IntegrationsController, ExportsController, SyncLogsController, WebhooksController],
  providers: [IntegrationOrchestratorService],
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
