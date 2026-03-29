import { Module } from '@nestjs/common';
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

@Module({
  imports: [
    CoreModule,
    InfrastructureModule,
    TenantModule,
    IamModule,
    AuditModule,
    FilesModule,
    HealthModule,
    MvpModule,
    DocumentsModule,
    CommunicationModule,
    IntegrationsModule,
    EsignModule
  ]
})
export class AppModule {}
