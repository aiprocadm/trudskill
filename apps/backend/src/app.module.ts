import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';

import { RequestObservabilityInterceptor } from './common/interceptors/request-observability.interceptor.js';
import { backendEnv } from './env.js';
import { InfrastructureModule } from './infrastructure/infrastructure.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { CommunicationModule } from './modules/communication/communication.module.js';
import { CoreModule } from './modules/core/core.module.js';
import { DocumentsModule } from './modules/documents/documents.module.js';
import { EsignModule } from './modules/esign/esign.module.js';
import { FilesModule } from './modules/files/files.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { IamModule } from './modules/iam/iam.module.js';
import { IntegrationsModule } from './modules/integrations/integrations.module.js';
import { MvpModule } from './modules/mvp/mvp.module.js';
import { TenantModule } from './modules/tenant/tenant.module.js';
import { WorkspaceModule } from './modules/workspace/workspace.module.js';

const baseModules = [
  ThrottlerModule.forRoot({
    throttlers: [{ ttl: 60_000, limit: 300 }]
  }),
  CoreModule,
  InfrastructureModule,
  TenantModule,
  IamModule,
  AuditModule,
  FilesModule,
  HealthModule,
  CommunicationModule,
  EsignModule,
  WorkspaceModule
];

const inMemoryDomainModules = [MvpModule, DocumentsModule, IntegrationsModule];
const persistentDomainModules = [MvpModule, DocumentsModule, IntegrationsModule];

const domainModules =
  backendEnv.NODE_ENV === 'test' || backendEnv.ALLOW_IN_MEMORY_STATE
    ? inMemoryDomainModules
    : persistentDomainModules;

@Module({
  providers: [RequestObservabilityInterceptor],
  imports: [...baseModules, ...domainModules]
})
export class AppModule {}
