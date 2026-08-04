import { Module } from '@nestjs/common';

import { PlatformPlansController } from './platform-plans.controller.js';
import { PlatformPlansService } from './platform-plans.service.js';
import { PlatformTenantsController } from './platform-tenants.controller.js';
import { PlatformTenantsService } from './platform-tenants.service.js';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { IamModule } from '../iam/iam.module.js';

/** ФТ-D2.2/ФТ-D4 — платформенный уровень: арендаторы и тарифы (только platform_admin). */
@Module({
  imports: [InfrastructureModule, IamModule, AuditModule],
  controllers: [PlatformTenantsController, PlatformPlansController],
  providers: [PlatformTenantsService, PlatformPlansService],
  exports: [PlatformTenantsService, PlatformPlansService]
})
export class PlatformModule {}
