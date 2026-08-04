import { Controller, Get, Inject, UseGuards } from '@nestjs/common';

import { PlatformHealthService } from './platform-health.service.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RequirePermissions } from '../iam/permission.decorator.js';
import { PermissionGuard } from '../iam/permission.guard.js';

/**
 * ФТ-D7: здоровье арендаторов. Право `platform.tenants.read` — то же, что у списка
 * арендаторов: кто видит центры платформы, тот видит и их состояние. Отдаются только
 * агрегаты, содержимого задач и документов здесь нет by construction.
 */
@Controller('platform')
@UseGuards(TenantGuard)
export class PlatformHealthController {
  constructor(@Inject(PlatformHealthService) private readonly health: PlatformHealthService) {}

  @Get('health/tenants')
  @UseGuards(PermissionGuard)
  @RequirePermissions('platform.tenants.read')
  getReport() {
    return this.health.getReport();
  }
}
