import { Module } from '@nestjs/common';

import { TenantController } from './tenant.controller.js';
import { TenantService } from './tenant.service.js';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module.js';

@Module({
  imports: [InfrastructureModule],
  controllers: [TenantController],
  providers: [TenantService],
  exports: [TenantService]
})
export class TenantModule {}
