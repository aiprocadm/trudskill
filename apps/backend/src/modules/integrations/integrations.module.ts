import { Inject, Injectable, Module, type OnModuleInit } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module.js';
import { CoreModule } from '../core/core.module.js';
import { EisotAdapter } from './adapters/eisot.adapter.js';
import { EmailAdapter } from './adapters/email.adapter.js';
import { FrdoAdapter } from './adapters/frdo.adapter.js';
import { ProctoringAdapter } from './adapters/proctoring.adapter.js';
import { WebinarAdapter } from './adapters/webinar.adapter.js';
import { InMemoryIntegrationOrchestratorState } from './infrastructure/in-memory-integration-orchestrator.state.js';
import { INTEGRATION_ORCHESTRATOR_STATE } from './infrastructure/integration-orchestrator-state.token.js';
import {
  ExportsController,
  IntegrationsController,
  SyncLogsController
} from './integrations.controller.js';
import { CredentialsModule } from './modules/credentials.module.js';
import { ExportsModule } from './modules/exports.module.js';
import { ProvidersModule } from './modules/providers.module.js';
import { SyncLogsModule } from './modules/sync-logs.module.js';
import { WebhooksModule } from './modules/webhooks.module.js';
import { IntegrationOrchestratorService } from './services/integration-orchestrator.service.js';
import { ProviderRegistry } from './services/provider-registry.service.js';
import { WebhooksController } from './webhooks/webhooks.controller.js';

@Injectable()
class IntegrationsProviderRegistryBootstrap implements OnModuleInit {
  constructor(
    @Inject(ProviderRegistry)
    private readonly registry: ProviderRegistry,
    @Inject(FrdoAdapter)
    private readonly frdo: FrdoAdapter,
    @Inject(EisotAdapter)
    private readonly eisot: EisotAdapter,
    @Inject(EmailAdapter)
    private readonly email: EmailAdapter,
    @Inject(WebinarAdapter)
    private readonly webinar: WebinarAdapter,
    @Inject(ProctoringAdapter)
    private readonly proctoring: ProctoringAdapter
  ) {}

  onModuleInit(): void {
    [this.frdo, this.eisot, this.email, this.webinar, this.proctoring].forEach((adapter) =>
      this.registry.register(adapter)
    );
  }
}

@Module({
  imports: [
    AuditModule,
    CoreModule,
    ProvidersModule,
    CredentialsModule,
    ExportsModule,
    SyncLogsModule,
    WebhooksModule
  ],
  controllers: [IntegrationsController, ExportsController, SyncLogsController, WebhooksController],
  providers: [
    { provide: INTEGRATION_ORCHESTRATOR_STATE, useClass: InMemoryIntegrationOrchestratorState },
    IntegrationOrchestratorService,
    IntegrationsProviderRegistryBootstrap
  ],
  exports: [IntegrationOrchestratorService]
})
export class IntegrationsModule {}
