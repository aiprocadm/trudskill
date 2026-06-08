import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';

import { RequestObservabilityInterceptor } from './common/interceptors/request-observability.interceptor.js';
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
import { MigrationModule } from './modules/migration/migration.module.js';
import { MvpModule } from './modules/mvp/mvp.module.js';
import { OrgModule } from './modules/org/org.module.js';
import { TenantModule } from './modules/tenant/tenant.module.js';
import { WorkspaceModule } from './modules/workspace/workspace.module.js';

const baseModules = [
  EventEmitterModule.forRoot(),
  ScheduleModule.forRoot(),
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

/** Доменные модули; переключение реализаций хранения — внутри модулей (провайдеры/DynamicModule), а не дублированием списка. */
const domainModules = [MvpModule, DocumentsModule, IntegrationsModule, MigrationModule, OrgModule];

@Module({
  providers: [RequestObservabilityInterceptor],
  imports: [...baseModules, ...domainModules]
})
export class AppModule {}
