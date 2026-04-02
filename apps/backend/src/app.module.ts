import { Module } from '@nestjs/common';
import { backendEnv } from './env.js';
import { CoreModule } from './modules/core/core.module.js';
import { TenantModule } from './modules/tenant/tenant.module.js';
import { IamModule } from './modules/iam/iam.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { FilesModule } from './modules/files/files.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { MvpModule } from './modules/mvp/mvp.module.js';
import { InfrastructureModule } from './infrastructure/infrastructure.module.js';
import { DocumentsModule } from './modules/documents/documents.module.js';
import { CommunicationModule } from './modules/communication/communication.module.js';
import { IntegrationsModule } from './modules/integrations/integrations.module.js';
import { EsignModule } from './modules/esign/esign.module.js';
import { RequestObservabilityInterceptor } from './common/interceptors/request-observability.interceptor.js';

const baseModules = [
  CoreModule,
  InfrastructureModule,
  TenantModule,
  IamModule,
  AuditModule,
  FilesModule,
  HealthModule,
  CommunicationModule,
  EsignModule
];

const inMemoryDomainModules = [MvpModule, DocumentsModule, IntegrationsModule];
const persistentDomainModules = [MvpModule, DocumentsModule, IntegrationsModule];

const domainModules = backendEnv.NODE_ENV === 'test' || backendEnv.ALLOW_IN_MEMORY_STATE
  ? inMemoryDomainModules
  : persistentDomainModules;

@Module({
  providers: [RequestObservabilityInterceptor],
  imports: [...baseModules, ...domainModules]
})
export class AppModule {}
