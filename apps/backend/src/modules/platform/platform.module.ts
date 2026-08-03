import { Module } from '@nestjs/common';

import { PlatformTenantsController } from './platform-tenants.controller.js';
import { PlatformTenantsService } from './platform-tenants.service.js';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { IamModule } from '../iam/iam.module.js';

/** ФТ-D2.2 — платформенный уровень: управление арендаторами (только platform_admin). */
@Module({
  imports: [InfrastructureModule, IamModule, AuditModule],
  controllers: [PlatformTenantsController],
  providers: [PlatformTenantsService],
  exports: [PlatformTenantsService]
})
export class PlatformModule {}
