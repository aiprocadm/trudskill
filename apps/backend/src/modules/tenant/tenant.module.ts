import { Module } from '@nestjs/common';

import { TenantController } from './tenant.controller.js';
import { TenantService } from './tenant.service.js';
import { InfrastructureModule } from '../../infrastructure/infrastructure.module.js';
import { IamModule } from '../iam/iam.module.js';

@Module({
  // IamModule нужен из-за `PermissionGuard` на настройках идентификации: гвард
  // инстанцируется в модуле, которому принадлежит контроллер, и без IamService
  // приложение не поднимется (структурный тест `permission-guard-module-wiring`).
  imports: [InfrastructureModule, IamModule],
  controllers: [TenantController],
  providers: [TenantService],
  exports: [TenantService]
})
export class TenantModule {}
