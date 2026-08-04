import { Controller, Get, Inject, UseGuards } from '@nestjs/common';

import { TenantUsageService } from './tenant-usage.service.js';
import { CurrentContext } from '../../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../../common/guards/tenant.guard.js';
import { RequirePermissions } from '../../iam/permission.decorator.js';
import { PermissionGuard } from '../../iam/permission.guard.js';

import type { RequestContext } from '../../../common/context/request-context.js';

/**
 * ФТ-D4.2: экран «Использование» — тариф, счётчики и лимиты арендатора.
 * Право tenant.usage.read (0076) — администрация центра; предупреждения 80/95%
 * считает интерфейс от этих цифр.
 */
@Controller('tenant')
@UseGuards(TenantGuard)
export class TenantUsageController {
  constructor(@Inject(TenantUsageService) private readonly usage: TenantUsageService) {}

  @Get('usage')
  @UseGuards(PermissionGuard)
  @RequirePermissions('tenant.usage.read')
  getUsage(@CurrentContext() c: RequestContext) {
    return this.usage.getUsage(c.tenantId!);
  }
}
